"""
Predictive Maintenance Predictor
----------------------------------
Uses a Random Forest classifier to estimate failure probability.

Features engineered from:
  - Current sensor readings (temperature, vibration, bearing_temp, oil_level_pct, etc.)
  - Derived: deviation from safe ranges, rolling trends, count of threshold violations

Labels (synthetic training if no labelled data):
  0 = Healthy, 1 = Warning, 2 = Failure imminent

Also estimates time-to-failure using a regression approach.
"""
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger("maintenance_predictor")

# Feature thresholds used to compute "distance to failure" features
SAFE_RANGES = {
    "temperature":   (20,   130),
    "pressure":      (50,   210),
    "vibration":     (0,    0.10),
    "bearing_temp":  (40,   155),
    "oil_level_pct": (20,   100),
    "rpm":           (800,  1800),
    "noise_db":      (40,   88),
    "power_factor":  (0.75, 1.0),
}

# Failure risk per metric weight
RISK_WEIGHTS = {
    "vibration":     0.30,
    "bearing_temp":  0.25,
    "temperature":   0.20,
    "oil_level_pct": 0.15,
    "noise_db":      0.05,
    "pressure":      0.05,
}

# Maintenance action templates
ACTIONS = {
    "vibration":     "Inspect and balance rotating components; check bearing alignment",
    "bearing_temp":  "Apply lubrication; inspect bearing for wear; schedule replacement if >160°C",
    "temperature":   "Reduce operational load by 20-30%; check cooling system",
    "oil_level_pct": "Top up oil immediately; inspect for leaks",
    "noise_db":      "Conduct acoustic inspection; tighten loose components",
    "pressure":      "Check pressure relief valves; inspect seals and gaskets",
    "power_factor":  "Investigate electrical supply quality; check motor winding",
}


class MaintenancePredictor:
    """
    Random Forest based failure classifier + TTF regressor.
    Trains on synthetic data if no real labels exist.
    """

    def __init__(self):
        self._clf     = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced')
        self._reg     = GradientBoostingRegressor(n_estimators=100, random_state=42)
        self._scaler  = StandardScaler()
        self._fitted  = False
        self._history: List[List[float]] = []
        self._labels:  List[int]         = []
        self._ttf:     List[float]        = []
        self._train_synthetic()

    def _extract_features(self, reading: Dict[str, Any]) -> List[float]:
        """Extract 16 features from a sensor reading."""
        feats = []
        for metric, (lo, hi) in SAFE_RANGES.items():
            val   = float(reading.get(metric) or 0)
            norm  = (val - lo) / max((hi - lo), 1e-9)   # normalised value
            viol  = max(0, (val - hi) / max(hi - lo, 1e-9)) + max(0, (lo - val) / max(hi - lo, 1e-9))  # violation degree
            feats.extend([norm, viol])
        return feats  # 16 features

    def _train_synthetic(self):
        """
        Bootstrap model with synthetically generated labelled examples.
        Healthy: metrics within safe range
        Warning: 1-2 metrics near limits
        Failure: multiple metrics far beyond limits
        """
        np.random.seed(42)
        X, y, ttf = [], [], []

        def rand(lo, hi):
            return np.random.uniform(lo, hi)

        for _ in range(300):  # HEALTHY
            r = {
                "temperature":   rand(60, 115),
                "pressure":      rand(80,  195),
                "vibration":     rand(0.01, 0.09),
                "bearing_temp":  rand(50,  140),
                "oil_level_pct": rand(40,  95),
                "rpm":           rand(900, 1750),
                "noise_db":      rand(50,  82),
                "power_factor":  rand(0.80, 0.98),
            }
            X.append(self._extract_features(r))
            y.append(0)
            ttf.append(rand(500, 2000))

        for _ in range(150):  # WARNING
            r = {
                "temperature":   rand(115, 145),
                "pressure":      rand(195, 225),
                "vibration":     rand(0.09, 0.18),
                "bearing_temp":  rand(140, 175),
                "oil_level_pct": rand(20,  40),
                "rpm":           rand(700, 900),
                "noise_db":      rand(82,  95),
                "power_factor":  rand(0.72, 0.80),
            }
            X.append(self._extract_features(r))
            y.append(1)
            ttf.append(rand(50, 200))

        for _ in range(100):  # FAILURE IMMINENT
            r = {
                "temperature":   rand(145, 175),
                "pressure":      rand(220, 260),
                "vibration":     rand(0.18, 0.35),
                "bearing_temp":  rand(170, 210),
                "oil_level_pct": rand(5,   18),
                "rpm":           rand(300, 700),
                "noise_db":      rand(95,  115),
                "power_factor":  rand(0.50, 0.72),
            }
            X.append(self._extract_features(r))
            y.append(2)
            ttf.append(rand(1, 48))

        X_arr = np.array(X)
        X_scaled = self._scaler.fit_transform(X_arr)
        self._clf.fit(X_scaled, y)
        self._reg.fit(X_scaled, ttf)
        self._fitted = True
        logger.info("Maintenance predictor trained on synthetic data (550 samples)")

    def predict(self, reading: Dict[str, Any]) -> Dict[str, Any]:
        """Predict failure probability and recommended actions."""
        feats    = self._extract_features(reading)
        X_scaled = self._scaler.transform([feats])

        proba     = self._clf.predict_proba(X_scaled)[0]     # [healthy, warning, failure]
        label     = int(self._clf.predict(X_scaled)[0])
        ttf_hours = max(1, float(self._reg.predict(X_scaled)[0]))

        # Failure probability = warning + failure classes
        failure_prob = float(proba[1] + proba[2])
        risk_score   = self._rule_based_risk(reading)

        # Blend ML + rule-based
        blended_prob = round(0.7 * failure_prob + 0.3 * risk_score, 4)
        status_map   = {0: "HEALTHY", 1: "WARNING", 2: "CRITICAL"}
        status       = status_map[label]

        # Override: if rule-based says critical but ML says healthy → use WARNING
        if risk_score > 0.7 and label == 0:
            status = "WARNING"
            blended_prob = max(blended_prob, 0.6)

        violations  = self._get_violations(reading)
        actions     = self._recommend_actions(violations, status)
        urgency     = self._urgency(blended_prob, ttf_hours)

        return {
            "equipment_id":           reading.get("equipment_id", "?"),
            "plant_id":               reading.get("plant_id", "?"),
            "status":                 status,
            "failure_probability":    blended_prob,
            "time_to_failure_hours":  round(ttf_hours, 1),
            "class_probabilities":    {"healthy": round(float(proba[0]), 4), "warning": round(float(proba[1]), 4), "critical": round(float(proba[2]), 4)},
            "risk_score":             round(risk_score, 4),
            "violations":             violations,
            "recommended_actions":    actions,
            "urgency":                urgency,
            "maintenance_window":     self._maintenance_window(ttf_hours),
        }

    def _rule_based_risk(self, reading: Dict) -> float:
        score = 0.0
        for metric, weight in RISK_WEIGHTS.items():
            val = reading.get(metric)
            if val is None:
                continue
            lo, hi = SAFE_RANGES.get(metric, (0, 1e9))
            if metric == "oil_level_pct":
                # Low oil = high risk
                norm_risk = max(0, (lo * 2 - val) / (lo * 2))
            else:
                overshoot = max(0, val - hi) / max(hi - lo, 1)
                undershoot = max(0, lo - val) / max(hi - lo, 1)
                norm_risk = min(1.0, overshoot + undershoot)
            score += weight * norm_risk
        return min(1.0, score)

    def _get_violations(self, reading: Dict) -> List[Dict]:
        violations = []
        for metric, (lo, hi) in SAFE_RANGES.items():
            val = reading.get(metric)
            if val is None:
                continue
            if val > hi or val < lo:
                violations.append({
                    "metric":  metric,
                    "value":   val,
                    "limit":   hi if val > hi else lo,
                    "type":    "OVER_LIMIT" if val > hi else "UNDER_LIMIT",
                })
        return violations

    def _recommend_actions(self, violations: List[Dict], status: str) -> List[str]:
        seen = set()
        actions = []
        for v in violations:
            m = v["metric"]
            if m in ACTIONS and m not in seen:
                actions.append(ACTIONS[m])
                seen.add(m)
        if not actions and status != "HEALTHY":
            actions.append("Schedule preventive maintenance inspection")
        if status == "CRITICAL":
            actions.insert(0, "IMMEDIATE: Consider equipment shutdown and emergency inspection")
        return actions

    def _urgency(self, prob: float, ttf_hours: float) -> str:
        if prob > 0.75 or ttf_hours < 12:
            return "IMMEDIATE"
        if prob > 0.5 or ttf_hours < 48:
            return "URGENT"
        if prob > 0.3 or ttf_hours < 168:
            return "SCHEDULED"
        return "ROUTINE"

    def _maintenance_window(self, ttf_hours: float) -> str:
        if ttf_hours < 12:
            return "Within 12 hours"
        if ttf_hours < 24:
            return "Within 24 hours"
        if ttf_hours < 72:
            return "Within 3 days"
        if ttf_hours < 168:
            return "Within 1 week"
        return f"Within {round(ttf_hours / 24)} days"


# Singleton
_predictor = MaintenancePredictor()

def get_predictor() -> MaintenancePredictor:
    return _predictor
