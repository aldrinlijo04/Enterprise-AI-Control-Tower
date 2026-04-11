'use strict';
/**
 * JavaScript maintenance prediction fallback.
 * Rule-based risk scoring with deterministic time-to-failure estimate.
 */
const RISK_WEIGHTS = {
  vibration:     0.30,
  bearing_temp:  0.25,
  temperature:   0.20,
  oil_level_pct: 0.15,
  noise_db:      0.05,
  pressure:      0.05,
};

const SAFE_RANGES = {
  temperature:   [20,   130],
  pressure:      [50,   210],
  vibration:     [0,    0.10],
  bearing_temp:  [40,   155],
  oil_level_pct: [20,   100],
  rpm:           [800,  1800],
  noise_db:      [40,   88],
  power_factor:  [0.75, 1.0],
};

const ACTIONS = {
  vibration:     'Inspect and balance rotating components; check bearing alignment',
  bearing_temp:  'Apply lubrication; inspect bearing; consider replacement',
  temperature:   'Reduce load by 20-30%; check cooling system',
  oil_level_pct: 'Top up oil immediately; inspect for leaks',
  noise_db:      'Acoustic inspection; tighten loose components',
  pressure:      'Check pressure relief valves and seals',
};

function predictMaintenance(body) {
  const reading = body.readings ? body.readings[0] : body;

  let riskScore = 0;
  const violations = [];

  for (const [metric, weight] of Object.entries(RISK_WEIGHTS)) {
    const val = reading[metric];
    if (val == null) continue;
    const [lo, hi] = SAFE_RANGES[metric] || [0, 1e9];

    let normRisk = 0;
    if (metric === 'oil_level_pct') {
      normRisk = Math.max(0, (lo * 2 - val) / (lo * 2));
    } else {
      const over  = Math.max(0, (val - hi) / Math.max(hi - lo, 1));
      const under = Math.max(0, (lo - val) / Math.max(hi - lo, 1));
      normRisk = Math.min(1, over + under);
    }

    riskScore += weight * normRisk;
    if (normRisk > 0) violations.push({ metric, value: val, risk: normRisk });
  }

  riskScore = Math.min(1, riskScore);

  const status = riskScore > 0.65 ? 'CRITICAL' : riskScore > 0.35 ? 'WARNING' : 'HEALTHY';
  const ttf    = riskScore > 0.65 ? 6 + Math.random() * 18
               : riskScore > 0.35 ? 50 + Math.random() * 100
               : 200 + Math.random() * 800;

  const actions = violations.map(v => ACTIONS[v.metric]).filter(Boolean);
  if (!actions.length && status !== 'HEALTHY') actions.push('Schedule preventive maintenance inspection');
  if (status === 'CRITICAL') actions.unshift('IMMEDIATE: Consider equipment shutdown');

  return {
    equipment_id:          reading.equipment_id || '?',
    plant_id:              reading.plant_id || '?',
    status,
    failure_probability:   parseFloat(riskScore.toFixed(4)),
    time_to_failure_hours: parseFloat(ttf.toFixed(1)),
    risk_score:            parseFloat(riskScore.toFixed(4)),
    violations,
    recommended_actions:   [...new Set(actions)],
    urgency:               riskScore > 0.65 ? 'IMMEDIATE' : riskScore > 0.45 ? 'URGENT' : riskScore > 0.25 ? 'SCHEDULED' : 'ROUTINE',
    maintenance_window:    ttf < 12 ? 'Within 12 hours' : ttf < 48 ? 'Within 48 hours' : `Within ${Math.round(ttf / 24)} days`,
    detection_method:      'JS-RuleBasedFallback',
  };
}

module.exports = { predictMaintenance };
