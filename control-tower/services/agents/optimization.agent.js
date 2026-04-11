'use strict';
/**
 * Optimization Agent
 * ------------------
 * Subscribes to DECISION events.
 * Reviews draft decisions and optimises them by:
 *   1. Cross-checking with IT data (production impact, deadlines)
 *   2. Scheduling maintenance windows to minimise production loss
 *   3. Considering fleet-wide context (don't shut down 2 machines simultaneously)
 *   4. Applying cost/benefit analysis
 *
 * Input:  Draft decision from DecisionAgent
 * Output: Optimised, enriched final decision (persisted)
 */
const BaseAgent  = require('./base.agent');
const { TOPICS } = require('../../utils/eventBus');
const logger     = require('../../utils/logger');

// Track currently-active maintenance to avoid conflict scheduling
const _activeMaintenance = new Map(); // plantId -> Set(equipmentId)

class OptimizationAgent extends BaseAgent {
  constructor() {
    super('OptimizationAgent', [TOPICS.DECISION]);
    this._optimizedCount = 0;
  }

  async process(decision) {
    const { plant_id, equipment_id, priority, action } = decision;

    // ── 1. Fleet conflict check ────────────────────────────
    const conflict = this._checkConflict(plant_id, equipment_id, priority);

    // ── 2. Schedule optimal maintenance window ─────────────
    const window = this._optimiseWindow(decision, conflict);

    // ── 3. IT data cross-check (production impact) ─────────
    const itContext = await this._getITContext(plant_id);

    // ── 4. Enrich and optimise action ─────────────────────
    const optimisedAction = this._optimiseAction(decision, itContext, conflict, window);

    // ── 5. Cost-benefit estimate ─────────────────���─────────
    const costBenefit = this._costBenefit(decision, itContext);

    const optimised = {
      ...decision,
      optimized:         true,
      optimized_action:  optimisedAction,
      maintenance_window:window.recommendation,
      conflict_detected: conflict.exists,
      conflict_detail:   conflict.detail,
      it_context:        itContext,
      cost_benefit:      costBenefit,
      agent_chain: [
        ...decision.agent_chain,
        { agent: 'OptimizationAgent', output: optimisedAction, timestamp: new Date() },
      ],
    };

    // Register maintenance if CRITICAL/HIGH
    if (['CRITICAL', 'HIGH'].includes(priority)) {
      this._registerMaintenance(plant_id, equipment_id);
    }

    // Persist final decision
    await this._persist(optimised);

    this._optimizedCount++;
    logger.info(`[OptimizationAgent] Optimised: ${priority} | ${window.recommendation}`);
    return optimised;
  }

  _checkConflict(plantId, equipmentId, priority) {
    const active = _activeMaintenance.get(plantId) || new Set();
    if (active.size >= 2 && priority !== 'CRITICAL') {
      return {
        exists: true,
        detail: `${active.size} equipment already in maintenance at ${plantId}. Delay this task to next available slot.`,
      };
    }
    return { exists: false, detail: null };
  }

  _optimiseWindow(decision, conflict) {
    const { priority, maintenance } = decision;
    const ttf = decision.source_data?.maintenance?.time_to_failure_hours || 999;

    if (priority === 'CRITICAL' || ttf < 6) {
      return { recommendation: 'Immediate — within 1 hour', delay_hours: 0 };
    }
    if (conflict.exists) {
      return { recommendation: 'Schedule after current maintenance completes (est. +4 hours)', delay_hours: 4 };
    }
    if (priority === 'HIGH') {
      return { recommendation: 'Within next 4-8 hours (next available shift)', delay_hours: 4 };
    }
    if (priority === 'MEDIUM') {
      return { recommendation: 'Schedule within 24-48 hours', delay_hours: 24 };
    }
    return { recommendation: 'Routine — schedule within 7 days', delay_hours: 168 };
  }

  async _getITContext(plantId) {
    try {
      const ITData = require('../../models/ITData.model');
      const recentOrders = await ITData.find({ plant_id: plantId })
        .sort({ timestamp: -1 }).limit(5).lean();

      const highPriorityCount = recentOrders.filter(o => o.priority === 'HIGH').length;
      const delayedCount      = recentOrders.filter(o => o.order_status === 'Delayed').length;
      const highStockoutRisk  = recentOrders.filter(o => o.stockout_risk === 'HIGH').length;

      return {
        high_priority_orders: highPriorityCount,
        delayed_orders:       delayedCount,
        stockout_risk_orders: highStockoutRisk,
        production_pressure:  highPriorityCount > 2 || delayedCount > 0 ? 'HIGH' : 'NORMAL',
      };
    } catch {
      return { high_priority_orders: 0, delayed_orders: 0, stockout_risk_orders: 0, production_pressure: 'UNKNOWN' };
    }
  }

  _optimiseAction(decision, itContext, conflict, window) {
    let base = decision.action;

    // If production pressure is high, suggest partial-load vs full shutdown
    if (itContext.production_pressure === 'HIGH' && decision.priority !== 'CRITICAL') {
      base += ` NOTE: ${itContext.high_priority_orders} high-priority orders active — consider partial-load operation (60%) instead of full shutdown to maintain deliveries.`;
    }

    // If there are delayed orders, prioritise speed of resolution
    if (itContext.delayed_orders > 0 && decision.priority === 'CRITICAL') {
      base += ` EXPEDITE: ${itContext.delayed_orders} orders already delayed — prioritise fastest repair path; consider temporary bypass if safe.`;
    }

    // Add maintenance window
    base += ` Recommended window: ${window.recommendation}.`;

    return base;
  }

  _costBenefit(decision, itContext) {
    const priorityMultiplier = { CRITICAL: 8, HIGH: 4, MEDIUM: 2, LOW: 1 }[decision.priority] || 1;
    const baseCostAvoidance  = 200000 * priorityMultiplier; // ₹ lakhs base
    const productionRisk     = itContext.production_pressure === 'HIGH' ? '₹5-15 lakh production revenue at risk' : 'Moderate production impact';

    return {
      estimated_cost_avoidance_INR: baseCostAvoidance,
      maintenance_cost_estimate_INR: Math.round(baseCostAvoidance * 0.15),
      production_risk:               productionRisk,
      roi_statement:                `Estimated ₹${Math.round(baseCostAvoidance / 100000)} lakh cost avoidance vs ~₹${Math.round(baseCostAvoidance * 0.15 / 100000)} lakh maintenance cost`,
    };
  }

  _registerMaintenance(plantId, equipmentId) {
    const active = _activeMaintenance.get(plantId) || new Set();
    active.add(equipmentId);
    _activeMaintenance.set(plantId, active);
    // Auto-clear after 2 hours
    setTimeout(() => {
      const s = _activeMaintenance.get(plantId);
      if (s) { s.delete(equipmentId); }
    }, 2 * 60 * 60 * 1000);
  }

  async _persist(decision) {
    try {
      const Decision = require('../../models/Decision.model');
      await Decision.findOneAndUpdate(
        { decision_id: decision.decision_id },
        decision,
        { upsert: true, new: true }
      );
    } catch (e) {
      logger.warn(`[OptimizationAgent] Decision persist failed: ${e.message}`);
    }
  }
}

module.exports = OptimizationAgent;
