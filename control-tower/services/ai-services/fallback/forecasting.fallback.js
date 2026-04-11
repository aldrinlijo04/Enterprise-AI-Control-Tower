'use strict';
/**
 * JavaScript forecasting fallback.
 * Implements: linear regression + EWMA.
 */
function forecastSeries(body) {
  const { values = [], horizon = 6, metric = 'value' } = body;
  if (!values.length) return { metric, historical: [], forecasted: Array(horizon).fill(0), trend: 'STABLE', change_pct: 0, method: 'none' };

  const n = values.length;
  let forecasted;
  let method;

  if (n >= 5) {
    // Linear regression
    const xs = Array.from({ length: n }, (_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((a, x, i) => a + (x - meanX) * (values[i] - meanY), 0);
    const den = xs.reduce((a, x) => a + (x - meanX) ** 2, 0) + 1e-9;
    const slope = num / den;
    const intercept = meanY - slope * meanX;
    forecasted = Array.from({ length: horizon }, (_, i) => parseFloat((intercept + slope * (n + i)).toFixed(4)));
    method = 'LinearRegression';
  } else {
    // EWMA
    let ewma = values[0];
    for (let i = 1; i < values.length; i++) ewma = 0.3 * values[i] + 0.7 * ewma;
    const delta = values.length > 1 ? values[values.length - 1] - values[values.length - 2] : 0;
    forecasted = Array.from({ length: horizon }, (_, i) => parseFloat((ewma + delta * (i + 1)).toFixed(4)));
    method = 'EWMA';
  }

  const lastActual = values[values.length - 1];
  const lastForecast = forecasted[forecasted.length - 1];
  const change_pct = lastActual !== 0 ? parseFloat(((lastForecast - lastActual) / Math.abs(lastActual) * 100).toFixed(2)) : 0;
  const trend = change_pct > 5 ? 'INCREASING' : change_pct < -5 ? 'DECREASING' : 'STABLE';

  return {
    metric,
    historical: values.slice(-20),
    forecasted,
    horizon,
    method,
    trend,
    change_pct,
  };
}

module.exports = { forecastSeries };
