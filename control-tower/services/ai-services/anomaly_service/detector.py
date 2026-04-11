"""
Anomaly Detector
----------------
Uses Isolation Forest (sklearn) for unsupervised anomaly detection on OT sensor data.
Falls back to statistical Z-score / threshold thresholding when insufficient data.
"""
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import List, Dict, Any
import logging

logger = logging.getLogger("anomaly_detector")

# Sensor feature columns used for detection
FEATURES = [
    "temperature", "pressure", "flow_rate", "vibration",
    "rpm", "bearing_temp", "oil_level_pct",
    "voltage", "current_a", "power_kw", "power_factor", "noise_db"
]

# Rule-based hard thresholds (CRITICAL bounds)
THRESHOLDS = {
    "temperature":   (20,  175),
    "pressure":      (40,  260),
    "flow_rate":     (2,   65),
    "vibration":     (0,   0.35),
    "rpm":           (200, 1900),
    "bearing_temp":  (30,  220),
    "oil_level_pct": (5,   100),
    "voltage":       (180, 250),
    "current_a":     (0,   300),
    "power_kw":      (0,   650),
    "power_factor":  (0.5, 1.0),
    "noise_db":      (30,  120),
}

# Per-metric anomaly explanations
EXPLANATIONS = {
    "temperature":   "Temperature out of safe range",
    "pressure":      "Pressure deviation detected",
    "flow_rate":     "Abnormal flow rate",
    "vibration":     "Excessive vibration",
    "rpm":           "RPM out of operational range",
    "bearing_temp":  "Bearing overheating",
    "oil_level_pct": "Critical oil level",
    "noise_db":      "Noise level exceeds threshold",
    "power_factor":  "Power factor degradation",
}


class AnomalyDetector:
    """Isolation Forest based anomaly detector with statistical fallback."""

    def __init__(self, contamination: float = 0.08, n_estimators: int = 100):
        self.contamination = contamination
        self.n_estimators  = n_estimators
        self._model   = None
        self._scaler  = StandardScaler()
        self._fitted  = False
        self._history: List[List[float]] = []

    def _extract_features(self, record: Dict[str, Any]) -> List[float]:
        return [float(record.get(f, 0) or 0) for f in FEATURES]

    def _fit_if_needed(self):
        """Fit model when we have enough historical data."""
        if self._fitted or len(self._history) < 30:
            return
        X = np.array(self._history)
        X_scaled = self._scaler.fit_transform(X)
        self._model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=42,
            n_jobs=-1,
        )
        self._model.fit(X_scaled)
        self._fitted = True
        logger.info(f"IsolationForest fitted on {len(self._history)} samples")

    def detect(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Detect anomalies in a single OT record."""
        features = self._extract_features(record)
        self._history.append(features)
        if len(self._history) > 2000:
            self._history = self._history[-2000:]  # keep rolling window

        self._fit_if_needed()

        # ── Path 1: ML-based detection ──────────────────────────
        if self._fitted:
            X = np.array([features])
            X_scaled = self._scaler.transform(X)
            pred  = self._model.predict(X_scaled)[0]         # -1 = anomaly
            score = self._model.score_samples(X_scaled)[0]   # lower = more anomalous
            is_anomaly = (pred == -1)
            anomaly_score = round(float(-score), 4)           # positive: higher = more anomalous
        else:
            # ── Path 2: Statistical threshold fallback ──────────
            is_anomaly, anomaly_score = self._threshold_check(record)

        # Identify which metrics are out of range
        violations = self._find_violations(record)

        severity = self._severity(anomaly_score, violations)
        message  = self._build_message(record, violations, is_anomaly)

        return {
            "equipment_id":   record.get("equipment_id", "UNKNOWN"),
            "plant_id":       record.get("plant_id", "UNKNOWN"),
            "timestamp":      record.get("timestamp"),
            "is_anomaly":     is_anomaly,
            "anomaly_score":  anomaly_score,
            "severity":       severity,
            "violations":     violations,
            "message":        message,
            "detection_method": "IsolationForest" if self._fitted else "ThresholdRules",
        }

    def detect_batch(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [self.detect(r) for r in records]

    def _threshold_check(self, record: Dict[str, Any]):
        """Z-score + hard threshold check."""
        violations = self._find_violations(record)
        score = 0.0

        if self._history:
            arr = np.array(self._history[-200:])
            means = arr.mean(axis=0)
            stds  = arr.std(axis=0) + 1e-6
            feat  = np.array(self._extract_features(record))
            z_scores = np.abs((feat - means) / stds)
            score = float(z_scores.max())

        is_anomaly = len(violations) > 0 or score > 3.5
        return is_anomaly, round(min(score, 10.0), 4)

    def _find_violations(self, record: Dict[str, Any]) -> List[Dict]:
        violations = []
        for metric, (lo, hi) in THRESHOLDS.items():
            val = record.get(metric)
            if val is None:
                continue
            if val < lo or val > hi:
                violations.append({
                    "metric":      metric,
                    "value":       val,
                    "safe_min":    lo,
                    "safe_max":    hi,
                    "explanation": EXPLANATIONS.get(metric, f"{metric} out of range"),
                })
        return violations

    def _severity(self, score: float, violations: List) -> str:
        crit_metrics = {"vibration", "bearing_temp", "oil_level_pct", "temperature"}
        has_critical = any(v["metric"] in crit_metrics for v in violations)
        if score > 5.0 or has_critical:
            return "CRITICAL"
        if score > 3.0 or len(violations) >= 2:
            return "HIGH"
        if score > 1.5 or len(violations) >= 1:
            return "MEDIUM"
        return "LOW"

    def _build_message(self, record, violations, is_anomaly) -> str:
        eq = record.get("equipment_id", "?")
        if not is_anomaly:
            return f"{eq}: All sensors within normal range."
        if violations:
            parts = [f"{v['metric']}={v['value']} ({v['explanation']})" for v in violations[:3]]
            return f"{eq} anomaly: {'; '.join(parts)}"
        return f"{eq}: Anomalous sensor pattern detected by ML model."


# Module-level singleton
_detector = AnomalyDetector()


def get_detector() -> AnomalyDetector:
    return _detector
