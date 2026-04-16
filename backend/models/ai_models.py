"""
Plant AI - Multi-Model Engine
6 models, all trained on OT + IT + Maintenance JSON data
"""

import json, os, warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    IsolationForest, RandomForestClassifier,
    RandomForestRegressor, GradientBoostingRegressor
)
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.linear_model import Ridge
from scipy.stats import zscore

warnings.filterwarnings("ignore")

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# ─────────────────────────────────────────────
# DATA LOADER
# ─────────────────────────────────────────────
def load_data():
    with open(os.path.join(DATA_DIR, "ot_data.json")) as f:
        ot = pd.DataFrame(json.load(f))
    with open(os.path.join(DATA_DIR, "it_data.json")) as f:
        it = pd.DataFrame(json.load(f))
    with open(os.path.join(DATA_DIR, "maintenance_logs.json")) as f:
        ml = pd.DataFrame(json.load(f))
    ot["timestamp"] = pd.to_datetime(ot["timestamp"])
    it["timestamp"] = pd.to_datetime(it["timestamp"])
    return ot, it, ml


# ─────────────────────────────────────────────
# MODEL 1 — FORECASTING (sensor time-series)
# ─────────────────────────────────────────────
class ForecastingModel:
    def __init__(self, window=8):
        self.window = window
        self.models = {}
        self.scalers = {}
        self.targets = ["temperature", "pressure", "flow_rate", "vibration", "power_kw"]

    def _build_features(self, series):
        X, y = [], []
        for i in range(self.window, len(series)):
            window_vals = series[i - self.window:i]
            features = list(window_vals) + [
                float(np.mean(window_vals)),
                float(np.std(window_vals)),
                float(window_vals[-1] - window_vals[0]),
            ]
            X.append(features)
            y.append(series[i])
        return np.array(X), np.array(y)

    def fit(self, ot_df):
        for col in self.targets:
            series = ot_df[col].dropna().values
            if len(series) < self.window + 5:
                continue
            X, y = self._build_features(series)
            scaler = StandardScaler()
            X_s = scaler.fit_transform(X)
            model = GradientBoostingRegressor(n_estimators=80, max_depth=4, random_state=42)
            model.fit(X_s, y)
            self.models[col] = model
            self.scalers[col] = scaler
        return self

    def predict(self, ot_df, steps=10):
        results = {}
        for col in self.targets:
            if col not in self.models:
                continue
            series = list(ot_df[col].dropna().values)
            preds = []
            for _ in range(steps):
                window_vals = np.array(series[-self.window:])
                features = list(window_vals) + [
                    float(np.mean(window_vals)),
                    float(np.std(window_vals)),
                    float(window_vals[-1] - window_vals[0]),
                ]
                X = self.scalers[col].transform([features])
                p = float(self.models[col].predict(X)[0])
                preds.append(round(p, 3))
                series.append(p)
            results[col] = preds
        return results

    def summary(self, ot_df):
        preds = self.predict(ot_df)
        last = {c: round(float(ot_df[c].iloc[-1]), 3) for c in self.targets if c in ot_df}
        trend = {}
        for col, vals in preds.items():
            delta = vals[-1] - last.get(col, vals[0])
            trend[col] = "rising" if delta > 0.5 else ("falling" if delta < -0.5 else "stable")
        return {"current": last, "forecast_10_steps": preds, "trend": trend}


# ─────────────────────────────────────────────
# MODEL 2 — DEMAND PREDICTION
# ─────────────────────────────────────────────
class DemandPredictionModel:
    def __init__(self):
        self.model = GradientBoostingRegressor(n_estimators=100, random_state=42)
        self.scaler = StandardScaler()
        self.le_product = LabelEncoder()
        self.le_season = LabelEncoder()
        self.is_fitted = False

    def _features(self, it_df):
        df = it_df.copy()
        df["product_enc"] = self.le_product.fit_transform(df["product"].astype(str))
        df["season_enc"] = self.le_season.fit_transform(df["season"].astype(str))
        cols = ["product_enc", "season_enc", "promotion_active",
                "inventory_level", "reorder_point", "lead_time_days",
                "price_per_unit_INR", "batch_quality_score", "rejection_rate_pct"]
        return df[cols].fillna(0)

    def fit(self, it_df):
        X = self._features(it_df)
        y = it_df["demand_forecast"].values
        X_s = self.scaler.fit_transform(X)
        self.model.fit(X_s, y)
        self.is_fitted = True
        return self

    def predict(self, it_df):
        X = self._features(it_df)
        X_s = self.scaler.transform(X)
        preds = self.model.predict(X_s)
        return [round(float(p), 1) for p in preds]

    def summary(self, it_df):
        preds = self.predict(it_df)
        actual = it_df["actual_production"].values
        accuracy = float(np.mean(np.abs(np.array(preds) - actual) / (actual + 1e-5)))
        by_product = {}
        it_df = it_df.copy()
        it_df["predicted"] = preds
        for prod, grp in it_df.groupby("product"):
            by_product[prod] = {
                "avg_forecast": round(float(grp["predicted"].mean()), 1),
                "avg_actual": round(float(grp["actual_production"].mean()), 1),
                "stockout_risk_pct": round(float((grp["stockout_risk"] == "HIGH").mean() * 100), 1)
            }
        return {
            "mean_absolute_error_pct": round(accuracy * 100, 2),
            "avg_predicted_demand": round(float(np.mean(preds)), 1),
            "by_product": by_product
        }


# ─────────────────────────────────────────────
# MODEL 3 — ENERGY CONSUMPTION
# ─────────────────────────────────────────────
class EnergyConsumptionModel:
    def __init__(self):
        self.model = RandomForestRegressor(n_estimators=100, random_state=42)
        self.scaler = StandardScaler()
        self.is_fitted = False

    def fit(self, ot_df):
        df = ot_df.copy().dropna(subset=["power_kw"])
        X = df[["temperature", "pressure", "vibration", "rpm",
                "current_a", "power_factor", "voltage"]].fillna(0)
        y = df["power_kw"].values
        self.scaler.fit(X)
        self.model.fit(self.scaler.transform(X), y)
        self.is_fitted = True
        return self

    def predict(self, ot_df):
        df = ot_df.copy()
        X = df[["temperature", "pressure", "vibration", "rpm",
                "current_a", "power_factor", "voltage"]].fillna(0)
        return [round(float(p), 2) for p in self.model.predict(self.scaler.transform(X))]

    def summary(self, ot_df):
        preds = self.predict(ot_df)
        actual = ot_df["power_kw"].fillna(0).values
        total_kwh = round(float(np.sum(actual)) / 60, 2)
        carbon = round(total_kwh * 0.82, 2)
        cost = round(total_kwh * 7.5, 2)
        waste = round(float(np.mean(np.array(preds) - actual)), 2)
        by_equip = {}
        ot_df = ot_df.copy()
        ot_df["pred_kw"] = preds
        for eq, grp in ot_df.groupby("equipment_id"):
            by_equip[eq] = {
                "avg_kw": round(float(grp["power_kw"].mean()), 2),
                "peak_kw": round(float(grp["power_kw"].max()), 2),
                "efficiency_pct": round(float(grp["power_factor"].mean() * 100), 1)
            }
        return {
            "total_energy_kwh": total_kwh,
            "carbon_emission_kg": carbon,
            "energy_cost_INR": cost,
            "avg_predicted_kw": round(float(np.mean(preds)), 2),
            "avg_waste_kw": waste,
            "by_equipment": by_equip
        }


# ─────────────────────────────────────────────
# MODEL 4 — ANOMALY DETECTION
# ─────────────────────────────────────────────
class AnomalyDetectionModel:
    def __init__(self, contamination=0.12):
        self.model = IsolationForest(
            n_estimators=150, contamination=contamination,
            random_state=42, n_jobs=-1
        )
        self.scaler = StandardScaler()
        self.features = ["temperature", "pressure", "vibration",
                         "flow_rate", "rpm", "bearing_temp", "noise_db"]
        self.is_fitted = False

    def fit(self, ot_df):
        X = ot_df[self.features].dropna()
        self.scaler.fit(X)
        self.model.fit(self.scaler.transform(X))
        self.is_fitted = True
        return self

    def predict(self, ot_df):
        X = ot_df[self.features].fillna(ot_df[self.features].median())
        scores = self.model.score_samples(self.scaler.transform(X))
        labels = self.model.predict(self.scaler.transform(X))
        z = np.abs(zscore(ot_df[self.features].fillna(0)))
        z_max = z.max(axis=1)
        return {
            "anomaly_flags": [int(l == -1) for l in labels],
            "anomaly_scores": [round(float(s), 4) for s in scores],
            "z_scores_max": [round(float(z), 3) for z in z_max]
        }

    def summary(self, ot_df):
        result = self.predict(ot_df)
        flags = result["anomaly_flags"]
        scores = result["anomaly_scores"]
        n_anomalies = sum(flags)
        ot_df = ot_df.copy()
        ot_df["anomaly"] = flags
        ot_df["score"] = scores
        by_equip = {}
        for eq, grp in ot_df.groupby("equipment_id"):
            by_equip[eq] = {
                "anomaly_count": int(grp["anomaly"].sum()),
                "anomaly_rate_pct": round(float(grp["anomaly"].mean() * 100), 1),
                "avg_score": round(float(grp["score"].mean()), 4)
            }
        top_anomalies = ot_df[ot_df["anomaly"] == 1].sort_values("score").head(5)[
            ["timestamp", "equipment_id", "plant_id", "temperature",
             "pressure", "vibration", "score"]
        ].to_dict("records")
        for r in top_anomalies:
            r["timestamp"] = str(r["timestamp"])
        return {
            "total_anomalies": n_anomalies,
            "anomaly_rate_pct": round(n_anomalies / len(flags) * 100, 1),
            "by_equipment": by_equip,
            "top_anomalies": top_anomalies
        }


# ─────────────────────────────────────────────
# MODEL 5 — PLANT BEHAVIOR (classification)
# ─────────────────────────────────────────────
class PlantBehaviorModel:
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=120, random_state=42)
        self.scaler = StandardScaler()
        self.le = LabelEncoder()
        self.features = ["temperature", "pressure", "vibration",
                         "flow_rate", "rpm", "power_kw", "current_a", "noise_db"]
        self.is_fitted = False

    def _label(self, row):
        if row["vibration"] > 0.07 or row["temperature"] > 130:
            return "CASCADE_FAULT"
        elif row["power_kw"] > 400:
            return "OVERCAPACITY"
        elif row["flow_rate"] < 18:
            return "UNDERPERFORMANCE"
        elif row["pressure"] > 200:
            return "SURGE"
        else:
            return "NORMAL"

    def fit(self, ot_df):
        df = ot_df.copy().dropna(subset=self.features)
        df["label"] = df.apply(self._label, axis=1)
        X = self.scaler.fit_transform(df[self.features])
        y = self.le.fit_transform(df["label"])
        self.model.fit(X, y)
        self.is_fitted = True
        return self

    def predict(self, ot_df):
        df = ot_df.copy()
        X = self.scaler.transform(df[self.features].fillna(0))
        preds = self.le.inverse_transform(self.model.predict(X))
        proba = self.model.predict_proba(X).max(axis=1)
        return {
            "behaviors": list(preds),
            "confidence": [round(float(p), 3) for p in proba]
        }

    def summary(self, ot_df):
        result = self.predict(ot_df)
        behaviors = result["behaviors"]
        from collections import Counter
        counts = Counter(behaviors)
        total = len(behaviors)
        ot_df = ot_df.copy()
        ot_df["behavior"] = behaviors
        by_plant = {}
        for pl, grp in ot_df.groupby("plant_id"):
            c = Counter(grp["behavior"])
            by_plant[pl] = {
                "dominant_behavior": c.most_common(1)[0][0],
                "normal_pct": round(c.get("NORMAL", 0) / len(grp) * 100, 1),
                "fault_count": int(c.get("CASCADE_FAULT", 0))
            }
        return {
            "behavior_distribution": {k: round(v / total * 100, 1) for k, v in counts.items()},
            "normal_pct": round(counts.get("NORMAL", 0) / total * 100, 1),
            "critical_events": int(counts.get("CASCADE_FAULT", 0) + counts.get("SURGE", 0)),
            "by_plant": by_plant
        }


# ─────────────────────────────────────────────
# MODEL 6 — PREDICTIVE MAINTENANCE
# ─────────────────────────────────────────────
class PredictiveMaintenanceModel:
    def __init__(self):
        self.rul_model = RandomForestRegressor(n_estimators=100, random_state=42)
        self.risk_model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.scaler = StandardScaler()
        self.le = LabelEncoder()
        self.features = ["temperature", "pressure", "vibration",
                         "bearing_temp", "oil_level_pct", "rpm", "noise_db"]
        self.is_fitted = False

    def _rul_label(self, row):
        score = (
            (row["temperature"] / 88) * 0.25 +
            (row["vibration"] / 0.08) * 0.30 +
            (row["pressure"] / 200) * 0.20 +
            ((100 - row["oil_level_pct"]) / 100) * 0.15 +
            ((row["bearing_temp"] - 70) / 80) * 0.10
        )
        return max(0, round(600 * (1 - min(score, 1)), 1))

    def fit(self, ot_df, ml_df):
        df = ot_df.copy().dropna(subset=self.features)
        df["rul"] = df.apply(self._rul_label, axis=1)
        df["risk"] = pd.cut(df["rul"],
                            bins=[-1, 100, 250, 450, 700],
                            labels=["CRITICAL", "HIGH", "MEDIUM", "LOW"])
        df = df.dropna(subset=["risk"])
        X = self.scaler.fit_transform(df[self.features])
        self.rul_model.fit(X, df["rul"].values)
        self.risk_model.fit(X, self.le.fit_transform(df["risk"]))
        self.is_fitted = True
        return self

    def predict(self, ot_df):
        df = ot_df.copy()
        X = self.scaler.transform(df[self.features].fillna(df[self.features].median()))
        rul = self.rul_model.predict(X)
        risk_enc = self.risk_model.predict(X)
        risk = self.le.inverse_transform(risk_enc)
        return {
            "rul_hours": [round(float(r), 1) for r in rul],
            "risk_level": list(risk)
        }

    def summary(self, ot_df, ml_df):
        result = self.predict(ot_df)
        rul = result["rul_hours"]
        risk = result["risk_level"]
        from collections import Counter
        risk_counts = Counter(risk)
        ot_df = ot_df.copy()
        ot_df["rul"] = rul
        ot_df["risk"] = risk
        critical = ot_df[ot_df["risk"] == "CRITICAL"].groupby("equipment_id")["rul"].min()
        by_equip = {}
        for eq, grp in ot_df.groupby("equipment_id"):
            r = Counter(grp["risk"])
            by_equip[eq] = {
                "min_rul_hrs": round(float(grp["rul"].min()), 1),
                "avg_rul_hrs": round(float(grp["rul"].mean()), 1),
                "dominant_risk": r.most_common(1)[0][0]
            }
        # merge maintenance log context
        log_counts = ml_df.groupby("equipment_id")["follow_up_required"].sum().to_dict()
        sev_counts = ml_df[ml_df["severity_tag"] == "HIGH"].groupby("equipment_id").size().to_dict()
        return {
            "risk_distribution": dict(risk_counts),
            "avg_rul_hours": round(float(np.mean(rul)), 1),
            "equipment_needing_attention": [
                {"equipment_id": eq, "min_rul": v}
                for eq, v in critical.items()
            ],
            "by_equipment": by_equip,
            "log_followups_pending": {k: int(v) for k, v in log_counts.items()},
            "high_severity_log_count": {k: int(v) for k, v in sev_counts.items()}
        }


# ─────────────────────────────────────────────
# MODEL 7 — EQUIPMENT FAILURE PREDICTION
# ─────────────────────────────────────────────
class EquipmentFailureModel:
    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=150, class_weight="balanced", random_state=42
        )
        self.prob_model = GradientBoostingRegressor(n_estimators=100, random_state=42)
        self.scaler = StandardScaler()
        self.le = LabelEncoder()
        self.features = ["temperature", "pressure", "vibration",
                         "bearing_temp", "oil_level_pct", "rpm",
                         "current_a", "noise_db", "power_kw"]
        self.is_fitted = False

    def _failure_label(self, row):
        if row["temperature"] > 130 or row["vibration"] > 0.075:
            return "IMMINENT"
        elif row["bearing_temp"] > 110 or row["oil_level_pct"] < 35:
            return "HIGH_RISK"
        elif row["pressure"] > 185 or row["noise_db"] > 85:
            return "MODERATE"
        else:
            return "HEALTHY"

    def _failure_prob(self, row):
        score = (
            min(row["temperature"] / 140, 1) * 0.25 +
            min(row["vibration"] / 0.09, 1) * 0.25 +
            min(row["pressure"] / 220, 1) * 0.15 +
            max(0, (100 - row["oil_level_pct"]) / 100) * 0.15 +
            min((row["bearing_temp"] - 60) / 80, 1) * 0.10 +
            min(row["noise_db"] / 95, 1) * 0.10
        )
        return round(min(float(score), 0.999), 4)

    def fit(self, ot_df, ml_df):
        df = ot_df.copy().dropna(subset=self.features)
        df["label"] = df.apply(self._failure_label, axis=1)
        df["prob"] = df.apply(self._failure_prob, axis=1)
        X = self.scaler.fit_transform(df[self.features])
        self.model.fit(X, self.le.fit_transform(df["label"]))
        self.prob_model.fit(X, df["prob"].values)
        self.is_fitted = True
        return self

    def predict(self, ot_df):
        df = ot_df.copy()
        X = self.scaler.transform(df[self.features].fillna(df[self.features].median()))
        labels = self.le.inverse_transform(self.model.predict(X))
        probs = self.prob_model.predict(X)
        horizon_map = {
            "IMMINENT": "< 24 hrs",
            "HIGH_RISK": "1–7 days",
            "MODERATE": "7–30 days",
            "HEALTHY": "> 30 days"
        }
        horizons = [horizon_map.get(l, "> 30 days") for l in labels]
        return {
            "failure_labels": list(labels),
            "failure_prob": [round(float(p), 4) for p in probs],
            "failure_horizon": horizons
        }

    def summary(self, ot_df, ml_df):
        result = self.predict(ot_df)
        labels = result["failure_labels"]
        probs = result["failure_prob"]
        from collections import Counter
        counts = Counter(labels)
        total = len(labels)
        ot_df = ot_df.copy()
        ot_df["failure_label"] = labels
        ot_df["failure_prob"] = probs
        critical_eqs = (
            ot_df[ot_df["failure_label"] == "IMMINENT"]
            .groupby("equipment_id")["failure_prob"].max()
            .sort_values(ascending=False)
            .head(5)
            .to_dict()
        )
        health_map = {
            "HEALTHY": round(counts.get("HEALTHY", 0) / total * 100, 1),
            "MODERATE": round(counts.get("MODERATE", 0) / total * 100, 1),
            "HIGH_RISK": round(counts.get("HIGH_RISK", 0) / total * 100, 1),
            "IMMINENT": round(counts.get("IMMINENT", 0) / total * 100, 1),
        }
        return {
            "fleet_health": health_map,
            "avg_failure_probability": round(float(np.mean(probs)), 4),
            "imminent_failures": int(counts.get("IMMINENT", 0)),
            "critical_equipment": {k: round(v, 4) for k, v in critical_eqs.items()},
            "maintenance_logs_high_severity": int(
                (ml_df["severity_tag"] == "HIGH").sum()
            )
        }


# ─────────────────────────────────────────────
# MASTER ENGINE — trains all models at startup
# ─────────────────────────────────────────────
class PlantAIEngine:
    def __init__(self):
        self.ot_df, self.it_df, self.ml_df = load_data()
        self.forecasting     = ForecastingModel().fit(self.ot_df)
        self.demand          = DemandPredictionModel().fit(self.it_df)
        self.energy          = EnergyConsumptionModel().fit(self.ot_df)
        self.anomaly         = AnomalyDetectionModel().fit(self.ot_df)
        self.plant_behavior  = PlantBehaviorModel().fit(self.ot_df)
        self.maintenance     = PredictiveMaintenanceModel().fit(self.ot_df, self.ml_df)
        self.failure         = EquipmentFailureModel().fit(self.ot_df, self.ml_df)

    def full_report(self):
        return {
            "forecasting":      self.forecasting.summary(self.ot_df),
            "demand":           self.demand.summary(self.it_df),
            "energy":           self.energy.summary(self.ot_df),
            "anomaly":          self.anomaly.summary(self.ot_df),
            "plant_behavior":   self.plant_behavior.summary(self.ot_df),
            "maintenance":      self.maintenance.summary(self.ot_df, self.ml_df),
            "failure":          self.failure.summary(self.ot_df, self.ml_df),
        }

    def latest_snapshot(self):
        last_ot = self.ot_df.iloc[-1]
        last_it = self.it_df.iloc[-1]
        last_ml = self.ml_df.iloc[-1]
        return {
            "timestamp":    str(last_ot["timestamp"]),
            "plant_id":     last_ot["plant_id"],
            "equipment_id": last_ot["equipment_id"],
            "temperature":  float(last_ot["temperature"]),
            "pressure":     float(last_ot["pressure"]),
            "vibration":    float(last_ot["vibration"]),
            "flow_rate":    float(last_ot["flow_rate"]),
            "power_kw":     float(last_ot["power_kw"]),
            "demand_forecast": int(last_it["demand_forecast"]),
            "order_status":    last_it["order_status"],
            "last_log":        last_ml["log_text"],
            "log_severity":    last_ml["severity_tag"],
        }
