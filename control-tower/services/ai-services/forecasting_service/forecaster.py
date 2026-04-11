"""
Forecasting Engine
------------------
Uses:
  1. ARIMA for stationary time-series when statsmodels is available and enough data exists
  2. Linear regression trend + seasonal adjustment as primary/fallback
  3. Exponential Weighted Moving Average (EWMA) for short horizons

Supports:
  - OT metrics (temperature, vibration, bearing_temp, etc.)
  - IT metrics (demand_forecast, inventory_level, production, revenue)
"""
import numpy as np
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger("forecaster")

try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.stattools import adfuller
    ARIMA_AVAILABLE = True
except ImportError:
    ARIMA_AVAILABLE = False
    logger.warning("statsmodels not available — using regression forecasting only")


class TimeSeriesForecaster:
    """
    Multi-model forecaster.
    Chooses ARIMA if series is long enough and stationary; falls back to linear regression.
    """

    MIN_ARIMA_POINTS = 30

    def forecast(
        self,
        values: List[float],
        horizon: int = 6,
        metric: str = "value",
        timestamps: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Forecast `horizon` steps ahead.

        Returns:
          {
            "metric": str,
            "historical": [...],
            "forecasted": [...],
            "horizon": int,
            "method": str,
            "trend": "INCREASING"|"DECREASING"|"STABLE",
            "change_pct": float,
          }
        """
        values = [float(v) for v in values if v is not None]
        if not values:
            return self._empty_forecast(metric, horizon)

        method  = "ewma"
        forecast_vals = []

        if ARIMA_AVAILABLE and len(values) >= self.MIN_ARIMA_POINTS:
            try:
                forecast_vals, method = self._arima_forecast(values, horizon)
            except Exception as e:
                logger.warning(f"ARIMA failed ({e}), falling back to regression")
                forecast_vals, method = self._regression_forecast(values, horizon)
        elif len(values) >= 5:
            forecast_vals, method = self._regression_forecast(values, horizon)
        else:
            forecast_vals, method = self._ewma_forecast(values, horizon)

        # Trend analysis
        trend, change_pct = self._analyse_trend(values, forecast_vals)

        # Confidence interval (±1 std of last window)
        std = float(np.std(values[-min(20, len(values)):]))
        ci  = [{"lower": round(v - 1.96 * std, 4), "upper": round(v + 1.96 * std, 4)} for v in forecast_vals]

        return {
            "metric":     metric,
            "historical": [round(v, 4) for v in values[-20:]],   # last 20 for display
            "forecasted": [round(v, 4) for v in forecast_vals],
            "confidence_interval": ci,
            "horizon":    horizon,
            "method":     method,
            "trend":      trend,
            "change_pct": round(change_pct, 2),
            "std":        round(std, 4),
        }

    def _arima_forecast(self, values: List[float], horizon: int):
        """Auto-select ARIMA order using ADF test."""
        arr = np.array(values)
        # Determine differencing order
        try:
            adf_pvalue = adfuller(arr, autolag='AIC')[1]
            d = 0 if adf_pvalue < 0.05 else 1
        except Exception:
            d = 1

        model = ARIMA(arr, order=(2, d, 1))
        result = model.fit()
        forecast = result.forecast(steps=horizon)
        return list(forecast), f"ARIMA(2,{d},1)"

    def _regression_forecast(self, values: List[float], horizon: int):
        """Polynomial regression with trend extrapolation."""
        n = len(values)
        x = np.arange(n)
        # Fit quadratic for longer series, linear for short
        deg = 2 if n > 20 else 1
        coeffs = np.polyfit(x, values, deg)
        poly = np.poly1d(coeffs)
        future_x = np.arange(n, n + horizon)
        forecast = [float(poly(xi)) for xi in future_x]
        return forecast, f"PolynomialRegression(deg={deg})"

    def _ewma_forecast(self, values: List[float], horizon: int):
        """Exponential weighted moving average forecast."""
        alpha = 0.3
        ewma  = float(values[0])
        for v in values[1:]:
            ewma = alpha * v + (1 - alpha) * ewma
        # Project with last observed trend
        if len(values) >= 2:
            last_delta = (values[-1] - values[-2])
        else:
            last_delta = 0
        forecast = [ewma + last_delta * (i + 1) for i in range(horizon)]
        return forecast, "EWMA"

    def _analyse_trend(self, historical, forecasted):
        if not historical or not forecasted:
            return "STABLE", 0.0
        last_actual = historical[-1]
        last_forecast = forecasted[-1]
        if last_actual == 0:
            return "STABLE", 0.0
        change_pct = ((last_forecast - last_actual) / abs(last_actual)) * 100
        if change_pct > 5:
            return "INCREASING", change_pct
        if change_pct < -5:
            return "DECREASING", change_pct
        return "STABLE", change_pct

    def _empty_forecast(self, metric, horizon):
        return {
            "metric": metric, "historical": [], "forecasted": [0.0] * horizon,
            "confidence_interval": [], "horizon": horizon, "method": "none",
            "trend": "STABLE", "change_pct": 0.0, "std": 0.0,
        }


# Singleton
_forecaster = TimeSeriesForecaster()

def get_forecaster() -> TimeSeriesForecaster:
    return _forecaster
