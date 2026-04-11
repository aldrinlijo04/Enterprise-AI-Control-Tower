'use strict';
/**
 * Prediction Agent
 * ----------------
 * Subscribes to ANOMALY events.
 * Builds a history window from the Digital Twin.
 * Calls Forecasting + Maintenance services.
 * Publishes PREDICTION_READY events.
 *
 * Input:  Anomaly detection result + original OT record
 * Output: Forecast + maintenance prediction
 */
const axios    = require('axios');
const BaseAgent= require('./base.agent');
const { TOPICS } = require('../../utils/eventBus');
const { forecastSeries }     = require('../ai-services/fallback/forecasting.fallback');
const { predictMaintenance } = require('../ai-services/fallback/maintenance.fallback');
const cfg      = require('../../config/services.config');
const logger   = require('../../utils/logger');

// Rolling sensor history per equipment  (for forecasting)
const _sensorHistory = new Map(); // key -> [{...readings}]
const HISTORY_LIMIT  = 50;

class PredictionAgent extends BaseAgent {
  constructor() {
    super('PredictionAgent', [TOPICS.OT_DATA, TOPICS.ANOMALY]);
    this._forecastCount = 0;
    this._maintenanceAlerts = 0;
  }

  async onStart() {
    // Subscribe to OT_DATA to build history (separate from anomaly handling)
    // History is built passively on every OT record
  }

  // Called for every OT record (building history)
  recordReading(otRecord) {
    const key = `${otRecord.plant_id}::${otRecord.equipment_id}`;
    const hist = _sensorHistory.get(key) || [];
    hist.push(otRecord);
    if (hist.length > HISTORY_LIMIT) hist.shift();
    _sensorHistory.set(key, hist);
  }

  // Main processing: called when anomaly is detected
  async process(anomalyData) {
    const { ot_record, severity, equipment_id, plant_id, alert_id } = anomalyData;
    const record = ot_record || anomalyData;

    const key  = `${plant_id}::${equipment_id}`;
    const hist = _sensorHistory.get(key) || [record];

    // ── 1. Forecast critical metrics ───────────────────────
    const forecasts = await this._runForecasts(hist, record);

    // ── 2. Predictive maintenance ──────────────────────────
    const maintenancePred = await this._runMaintenancePrediction(record);

    // ── 3. Build prediction summary ───────────────────────
    const criticalForecasts = Object.entries(forecasts).filter(
      ([m, f]) => f.trend === 'INCREASING' && ['temperature', 'vibration', 'bearing_temp'].includes(m)
    );

    const prediction = {
      equipment_id,
      plant_id,
      alert_id,
      anomaly_severity:   severity,
      forecasts,
      critical_metrics_rising: criticalForecasts.map(([m]) => m),
      maintenance: maintenancePred,
      outlook: this._buildOutlook(maintenancePred, criticalForecasts),
    };

    this._forecastCount++;
    if (maintenancePred.status !== 'HEALTHY') this._maintenanceAlerts++;

    // Publish for Decision Agent
    await this.publish(TOPICS.PREDICTION, prediction);

    logger.info(`[PredictionAgent] Forecast for ${equipment_id}: ${prediction.outlook.summary}`);
    return prediction;
  }

  async _runForecasts(history, currentRecord) {
    const metrics  = ['temperature', 'vibration', 'bearing_temp', 'pressure', 'oil_level_pct'];
    const forecasts = {};

    for (const m of metrics) {
      const vals = history.map(r => r[m]).filter(v => v != null);
      if (!vals.length) continue;

      try {
        const res = await axios.post(`${cfg.forecasting}/forecast`, {
          values: vals, horizon: 6, metric: m,
        }, { timeout: 5000 });
        forecasts[m] = res.data;
      } catch {
        forecasts[m] = forecastSeries({ values: vals, horizon: 6, metric: m });
      }
    }

    return forecasts;
  }

  async _runMaintenancePrediction(record) {
    try {
      const res = await axios.post(`${cfg.maintenance}/predict`, record, { timeout: 5000 });
      return res.data;
    } catch {
      return predictMaintenance(record);
    }
  }

  _buildOutlook(maintenance, criticalForecasts) {
    const { status, time_to_failure_hours, failure_probability } = maintenance;
    let summary, urgency;

    if (status === 'CRITICAL' || failure_probability > 0.7) {
      summary = `Equipment at high risk — failure in ~${time_to_failure_hours}h`;
      urgency = 'IMMEDIATE';
    } else if (status === 'WARNING' || criticalForecasts.length > 0) {
      summary = `Degrading trend in: ${criticalForecasts.map(([m]) => m).join(', ') || 'key metrics'}`;
      urgency = 'URGENT';
    } else {
      summary = 'Minor anomaly; metrics forecast to stabilise';
      urgency = 'MONITOR';
    }

    return { summary, urgency, failure_probability, time_to_failure_hours };
  }
}

module.exports = PredictionAgent;
