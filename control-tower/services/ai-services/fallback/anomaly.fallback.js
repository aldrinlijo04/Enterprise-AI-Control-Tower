'use strict';
/**
 * JavaScript anomaly detection fallback.
 * Used when Python anomaly_service is unreachable.
 * Implements: Z-score + hard threshold rules.
 */
const cfg = require('../../../config/services.config');

const THRESHOLDS = cfg.otThresholds;

// Rolling history per equipment for Z-score baseline
const history = new Map(); // equipmentKey -> [{metric: value}]
const WINDOW = 100;

function equipKey(r) { return `${r.plant_id}::${r.equipment_id}`; }

function detectAnomalies(body) {
  const record = body.records ? body.records[0] : body;
  return detectSingle(record);
}

function detectSingle(record) {
  const key = equipKey(record);
  const hist = history.get(key) || [];

  // Add to history
  hist.push(record);
  if (hist.length > WINDOW) hist.shift();
  history.set(key, hist);

  // Hard threshold violations
  const violations = [];
  for (const [metric, { min, max }] of Object.entries(THRESHOLDS)) {
    const val = record[metric];
    if (val == null) continue;
    if (val < min || val > max) {
      violations.push({ metric, value: val, safe_min: min, safe_max: max });
    }
  }

  // Z-score on recent history
  let maxZ = 0;
  const metrics = ['temperature', 'vibration', 'bearing_temp', 'pressure', 'oil_level_pct'];
  if (hist.length >= 10) {
    for (const m of metrics) {
      const vals = hist.map(r => r[m]).filter(v => v != null);
      if (vals.length < 5) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std  = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length) + 1e-6;
      const z    = Math.abs((record[m] - mean) / std);
      if (z > maxZ) maxZ = z;
    }
  }

  const is_anomaly     = violations.length > 0 || maxZ > 3.5;
  const anomaly_score  = parseFloat(Math.min(maxZ, 10).toFixed(4));
  const severity       = computeSeverity(anomaly_score, violations);

  return {
    equipment_id:     record.equipment_id,
    plant_id:         record.plant_id,
    timestamp:        record.timestamp,
    is_anomaly,
    anomaly_score,
    severity,
    violations,
    message: is_anomaly
      ? `${record.equipment_id} anomaly: ${violations.map(v => `${v.metric}=${v.value}`).join('; ') || 'Z-score spike'}`
      : `${record.equipment_id}: All sensors normal`,
    detection_method: 'JS-ThresholdFallback',
  };
}

function computeSeverity(score, violations) {
  const critical = violations.some(v => ['vibration', 'bearing_temp', 'oil_level_pct', 'temperature'].includes(v.metric));
  if (score > 5 || critical) return 'CRITICAL';
  if (score > 3 || violations.length >= 2) return 'HIGH';
  if (score > 1.5 || violations.length >= 1) return 'MEDIUM';
  return 'LOW';
}

module.exports = { detectAnomalies };
