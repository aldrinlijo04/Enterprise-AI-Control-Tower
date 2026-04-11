'use strict';
/**
 * Decision Agent
 * --------------
 * Subscribes to PREDICTION events.
 * Synthesises anomaly + forecast + maintenance into a
 * prescriptive decision (what to do, when, and why).
 * Passes output to Optimization Agent.
 *
 * Input:  Prediction result
 * Output: Draft prescriptive decision
 */
const { v4: uuidv4 } = require('uuid');
const BaseAgent = require('./base.agent');
const { TOPICS }= require('../../utils/eventBus');
const logger    = require('../../utils/logger');

// Decision rules — ordered by priority
const RULES = [
  {
    id: 'CRITICAL_FAILURE_IMMINENT',
    match: (p) => p.maintenance?.status === 'CRITICAL' && p.maintenance?.time_to_failure_hours < 12,
    action: (p) => ({
      priority: 'CRITICAL',
      issue:    `${p.equipment_id} failure imminent within ${p.maintenance.time_to_failure_hours}h`,
      root_cause: `Multiple sensors exceeding limits: ${(p.maintenance.violations || []).map(v => v.metric).join(', ')}`,
      prediction: `Equipment failure in ~${p.maintenance.time_to_failure_hours} hours (${Math.round(p.maintenance.failure_probability * 100)}% probability)`,
      action:   `IMMEDIATE: Initiate controlled shutdown of ${p.equipment_id}. Deploy maintenance crew. Activate backup equipment.`,
      estimated_impact: 'Prevents unplanned downtime. Estimated cost avoidance: ₹2-8 lakhs',
    }),
  },
  {
    id: 'BEARING_OVERHEATING',
    match: (p) => (p.forecasts?.bearing_temp?.trend === 'INCREASING' && (p.maintenance?.violations || []).some(v => v.metric === 'bearing_temp')),
    action: (p) => ({
      priority: 'HIGH',
      issue:    `Bearing overheating on ${p.equipment_id}`,
      root_cause: `bearing_temp = ${p.maintenance?.violations?.find(v => v.metric === 'bearing_temp')?.value || '?'}°C, rising trend`,
      prediction: `Bearing failure expected in ${p.maintenance?.time_to_failure_hours || '?'}h without intervention`,
      action:   `Apply fresh lubrication immediately. Schedule bearing inspection within 4 hours. Reduce RPM by 15% until inspection complete.`,
      estimated_impact: 'Prevents bearing seizure and shaft damage',
    }),
  },
  {
    id: 'VIBRATION_EXCESSIVE',
    match: (p) => (p.forecasts?.vibration?.trend === 'INCREASING' || (p.maintenance?.violations || []).some(v => v.metric === 'vibration')),
    action: (p) => ({
      priority: 'HIGH',
      issue:    `Excessive vibration detected on ${p.equipment_id}`,
      root_cause: 'Vibration above threshold — likely misalignment or imbalance',
      prediction: `Continued vibration will cause bearing/shaft fatigue in ${p.maintenance?.time_to_failure_hours || '~48'}h`,
      action:   `Perform dynamic balancing and alignment check. Inspect mountings and fasteners. Schedule corrective maintenance within 24 hours.`,
      estimated_impact: 'Prevents catastrophic mechanical failure',
    }),
  },
  {
    id: 'LOW_OIL_LEVEL',
    match: (p) => (p.maintenance?.violations || []).some(v => v.metric === 'oil_level_pct'),
    action: (p) => ({
      priority: 'HIGH',
      issue:    `Critically low oil level on ${p.equipment_id}`,
      root_cause: `oil_level_pct = ${p.maintenance?.violations?.find(v => v.metric === 'oil_level_pct')?.value || '?'}%`,
      prediction: 'Lubrication failure leading to seizure within hours if not addressed',
      action:   `Top up oil to 70-80% immediately. Inspect for leaks. Do not operate above 50% load until oil restored.`,
      estimated_impact: 'Prevents lubrication failure and seizure',
    }),
  },
  {
    id: 'TEMPERATURE_RISING',
    match: (p) => p.forecasts?.temperature?.trend === 'INCREASING' && (p.maintenance?.violations || []).some(v => v.metric === 'temperature'),
    action: (p) => ({
      priority: 'MEDIUM',
      issue:    `Temperature rising on ${p.equipment_id}`,
      root_cause: 'Cooling system degradation or excess load',
      prediction: `Temperature forecast to reach critical in ${p.maintenance?.time_to_failure_hours || '?'}h`,
      action:   `Reduce operational load by 20-25%. Check cooling system and heat exchangers. Clean any blocked air intakes.`,
      estimated_impact: 'Prevents thermal damage to motor windings and seals',
    }),
  },
  {
    id: 'GENERAL_ANOMALY_WARNING',
    match: (p) => p.anomaly_severity === 'HIGH' || p.anomaly_severity === 'CRITICAL',
    action: (p) => ({
      priority: 'MEDIUM',
      issue:    `Anomalous sensor readings on ${p.equipment_id}`,
      root_cause: `Anomaly detected (severity: ${p.anomaly_severity})`,
      prediction: `Continued degradation likely if root cause not addressed`,
      action:   `Assign maintenance technician for physical inspection within 4 hours. Collect oil sample for analysis. Monitor all sensors at 5-minute intervals.`,
      estimated_impact: 'Early intervention prevents escalation',
    }),
  },
  {
    id: 'PREVENTIVE_MONITORING',
    match: () => true, // Default catch-all
    action: (p) => ({
      priority: 'LOW',
      issue:    `Minor anomaly on ${p.equipment_id}`,
      root_cause: 'Sensor reading slightly outside normal range',
      prediction: 'No immediate failure expected',
      action:   `Continue monitoring. Schedule routine inspection within 7 days.`,
      estimated_impact: 'Proactive monitoring maintains reliability',
    }),
  },
];

class DecisionAgent extends BaseAgent {
  constructor() {
    super('DecisionAgent', [TOPICS.PREDICTION]);
    this._decisionsGenerated = 0;
  }

  async process(predictionData) {
    const { equipment_id, plant_id, alert_id } = predictionData;

    // ── Apply decision rules ──────────��───────────────────
    const matchedRule = RULES.find(r => r.match(predictionData));
    const decision    = matchedRule.action(predictionData);

    const fullDecision = {
      decision_id:  uuidv4(),
      plant_id,
      equipment_id,
      alert_id,
      ...decision,
      confidence:   this._computeConfidence(predictionData, matchedRule),
      rule_id:      matchedRule.id,
      agent_chain:  [
        { agent: 'MonitoringAgent',  output: `Anomaly: ${predictionData.anomaly_severity}`, timestamp: new Date() },
        { agent: 'PredictionAgent',  output: predictionData.outlook?.summary || '',          timestamp: new Date() },
        { agent: 'DecisionAgent',    output: decision.action,                                timestamp: new Date() },
      ],
      status:       'PENDING',
      source_data:  predictionData,
    };

    this._decisionsGenerated++;

    // Publish for OptimizationAgent
    await this.publish(TOPICS.DECISION, fullDecision);

    logger.info(`[DecisionAgent] Decision: ${fullDecision.priority} | ${fullDecision.issue}`);
    return fullDecision;
  }

  _computeConfidence(pred, rule) {
    if (rule.id === 'PREVENTIVE_MONITORING') return 0.5;
    const maintenanceConf = pred.maintenance?.failure_probability || 0;
    const hasViolations   = (pred.maintenance?.violations?.length || 0) > 0 ? 0.2 : 0;
    return parseFloat(Math.min(0.99, maintenanceConf + hasViolations + 0.3).toFixed(2));
  }
}

module.exports = DecisionAgent;
