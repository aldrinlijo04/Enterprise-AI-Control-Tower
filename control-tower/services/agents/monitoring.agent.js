'use strict';
/**
 * Monitoring Agent
 * ----------------
 * Subscribes to OT_DATA events.
 * Calls the Anomaly Service (Python or JS fallback).
 * Raises alerts and publishes ANOMALY events.
 *
 * Input:  OT sensor record
 * Output: Anomaly detection result + alert (if detected)
 */
const { v4: uuidv4 } = require('uuid');
const axios          = require('axios');
const BaseAgent      = require('./base.agent');
const { TOPICS }     = require('../../utils/eventBus');
const { detectAnomalies } = require('../ai-services/fallback/anomaly.fallback');
const cfg            = require('../../config/services.config');
const logger         = require('../../utils/logger');

// In-memory alert store (supplement MongoDB)
const _alertStore = [];

class MonitoringAgent extends BaseAgent {
  constructor() {
    super('MonitoringAgent', [TOPICS.OT_DATA]);
    this._anomalyCount   = 0;
    this._alertsRaised   = 0;
  }

  async onStart() {
    // Rate limiting: don't raise duplicate alerts within 5 min window
    this._recentAlerts = new Map(); // equipKey -> lastAlertTime
  }

  async process(otRecord) {
    // ── 1. Call anomaly detection ──────────────────────────
    let anomalyResult;
    try {
      const res = await axios.post(`${cfg.anomaly}/detect`, otRecord, { timeout: 5000 });
      anomalyResult = res.data;
    } catch {
      anomalyResult = detectAnomalies(otRecord);
    }

    // ── 2. Raise alert if anomaly ──────────────────────────
    let alert = null;
    if (anomalyResult.is_anomaly) {
      this._anomalyCount++;
      if (!this._isDuplicate(otRecord)) {
        alert = await this._raiseAlert(otRecord, anomalyResult);
        this._alertsRaised++;
        this._markAlert(otRecord);
      }
    }

    return {
      anomaly: anomalyResult,
      alert,
      equipment_id: otRecord.equipment_id,
      plant_id:     otRecord.plant_id,
    };
  }

  _isDuplicate(record) {
    const key  = `${record.plant_id}::${record.equipment_id}`;
    const last = this._recentAlerts.get(key);
    return last && (Date.now() - last) < 5 * 60 * 1000; // 5 min cooldown
  }

  _markAlert(record) {
    const key = `${record.plant_id}::${record.equipment_id}`;
    this._recentAlerts.set(key, Date.now());
  }

  async _raiseAlert(record, anomalyResult) {
    const alert = {
      alert_id:    uuidv4(),
      plant_id:    record.plant_id,
      equipment_id:record.equipment_id,
      alert_type:  'ANOMALY',
      severity:    anomalyResult.severity || 'HIGH',
      title:       `Anomaly on ${record.equipment_id}`,
      message:     anomalyResult.message,
      metric:      anomalyResult.violations?.[0]?.metric || null,
      metric_value:anomalyResult.violations?.[0]?.value  || null,
      threshold:   anomalyResult.violations?.[0]?.safe_max || null,
      status:      'OPEN',
      source_data: record,
      createdAt:   new Date().toISOString(),
    };

    // Persist to MongoDB
    try {
      const Alert = require('../../models/Alert.model');
      await Alert.create(alert);
    } catch {
      _alertStore.push(alert);
    }

    // Publish anomaly event (picked up by PredictionAgent)
    await this.publish(TOPICS.ANOMALY, {
      ...anomalyResult,
      alert_id:   alert.alert_id,
      ot_record:  record,
    });

    logger.warn(`[MonitoringAgent] ALERT raised: ${alert.title} | Severity: ${alert.severity}`);
    return alert;
  }

  stats() {
    return {
      ...this.status(),
      anomalies_detected: this._anomalyCount,
      alerts_raised:      this._alertsRaised,
    };
  }
}

module.exports = MonitoringAgent;
