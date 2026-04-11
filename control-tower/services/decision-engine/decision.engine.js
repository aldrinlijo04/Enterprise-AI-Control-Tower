'use strict';
/**
 * Decision Engine
 * ---------------
 * Standalone service that converts AI predictions into
 * prescriptive, actionable decisions.
 *
 * Can be invoked:
 *   1. Automatically (via event bus, triggered by OptimizationAgent)
 *   2. Manually via POST /api/decisions/trigger
 *
 * Provides a structured output format:
 * {
 *   issue:      "Machine overheating",
 *   prediction: "Failure in 3 hours",
 *   action:     "Reduce load by 20% and schedule maintenance"
 * }
 */
const { v4: uuidv4 } = require('uuid');
const logger         = require('../../utils/logger');
const AgentCoordinator = require('../agents/agent.coordinator');
const { generateOTRecord } = require('../../utils/dataGenerators');

class DecisionEngine {
  static _instance = null;
  static getInstance() {
    if (!DecisionEngine._instance) DecisionEngine._instance = new DecisionEngine();
    return DecisionEngine._instance;
  }

  constructor() {
    this._coordinator = AgentCoordinator.getInstance();
  }

  // ─── Manual API trigger ────────────────────────────────────
  async processManualTrigger({ plant_id, equipment_id, issue, context }) {
    logger.info(`[DecisionEngine] Manual trigger: ${plant_id}/${equipment_id} — ${issue}`);

    // Build an OT record from context or use the current twin state
    const otRecord = this._buildOTRecord({ plant_id, equipment_id, issue, context });

    const result = await this._coordinator.triggerPipeline({
      plant_id,
      equipment_id,
      issue,
      ot_record: otRecord,
      context,
    });

    if (!result.success) {
      // Return minimal decision even if pipeline fails
      return this._fallbackDecision({ plant_id, equipment_id, issue });
    }

    return this._formatDecision(result.data || result);
  }

  // ─── Format the final output ──────────────────────────────
  _formatDecision(optimised) {
    const d = optimised;
    return {
      decision_id:        d.decision_id || uuidv4(),
      timestamp:          new Date().toISOString(),
      plant_id:           d.plant_id,
      equipment_id:       d.equipment_id,
      priority:           d.priority || 'MEDIUM',

      // ── The 3 core outputs ──
      issue:              d.issue,
      prediction:         d.prediction || d.outlook?.summary || 'Analysis in progress',
      action:             d.optimized_action || d.action,

      // ── Enrichment ──
      root_cause:         d.root_cause,
      confidence:         d.confidence,
      maintenance_window: d.maintenance_window,
      estimated_impact:   d.estimated_impact,
      cost_benefit:       d.cost_benefit,
      agent_chain:        (d.agent_chain || []).map(a => ({
        agent:     a.agent,
        output:    a.output?.substring(0, 200),
        timestamp: a.timestamp,
      })),
      status:             d.status || 'PENDING',
    };
  }

  _buildOTRecord({ plant_id, equipment_id, context }) {
    if (context && typeof context === 'object' && context.temperature) return context;
    // Generate a realistic reading as placeholder
    const rec = generateOTRecord({ plant_id, equipment_id, anomalous: true });
    delete rec._anomalous;
    return rec;
  }

  _fallbackDecision({ plant_id, equipment_id, issue }) {
    return {
      decision_id:  uuidv4(),
      timestamp:    new Date().toISOString(),
      plant_id,
      equipment_id,
      priority:     'MEDIUM',
      issue,
      prediction:   'Unable to complete full analysis — using rule-based decision',
      action:       'Assign maintenance technician for physical inspection within 4 hours',
      root_cause:   'Analysis pipeline unavailable',
      confidence:   0.5,
      status:       'PENDING',
    };
  }

  // ─── Bulk analysis ────────────────────────────────────────
  async analyseFleet(plantId) {
    const TwinEngine = require('../digital-twin/twin.engine');
    const twin       = TwinEngine.getInstance();
    const state      = await twin.getPlantState(plantId);
    if (!state) return { error: `Plant ${plantId} not found` };

    const decisions = [];
    for (const [equipId, eq] of Object.entries(state.equipment)) {
      if (eq.status !== 'NORMAL' || eq.maintenance_due) {
        const issue = eq.status !== 'NORMAL'
          ? `${equipId} status: ${eq.status} (health: ${eq.health_score}%)`
          : `${equipId} maintenance due`;
        try {
          const d = await this.processManualTrigger({ plant_id: plantId, equipment_id: equipId, issue });
          decisions.push(d);
        } catch (e) {
          logger.warn(`[DecisionEngine] Fleet analysis failed for ${equipId}: ${e.message}`);
        }
      }
    }

    return {
      plant_id:         plantId,
      analysed_at:      new Date().toISOString(),
      equipment_checked:Object.keys(state.equipment).length,
      decisions_generated: decisions.length,
      decisions,
    };
  }
}

module.exports = DecisionEngine;
