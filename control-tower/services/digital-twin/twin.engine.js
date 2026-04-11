'use strict';
/**
 * Digital Twin Engine
 * -------------------
 * Maintains live, in-memory + MongoDB state for every plant and its equipment.
 *
 * Responsibilities:
 *  - Initialise plant twins from DB (or defaults)
 *  - Update equipment state on every OT/maintenance event
 *  - Provide "what-if" simulation
 *  - Expose fleet-wide KPIs
 *  - Feed the Decision Engine with degraded state signals
 */
const { bus, TOPICS }   = require('../../utils/eventBus');
const { cache }         = require('../../utils/redis.client');
const logger            = require('../../utils/logger');
const cfg               = require('../../config/services.config');
const { EQUIPMENT_TYPES } = require('../../utils/dataGenerators');

const PLANTS = ['PLANT_A', 'PLANT_B', 'PLANT_C'];
const PLANT_EQUIPMENT = {
  PLANT_A: ['PUMP_01', 'PUMP_02', 'VALVE_01', 'MOTOR_01', 'TURB_01'],
  PLANT_B: ['COMP_01', 'COMP_02', 'PUMP_01', 'HEAT_01', 'FAN_01'],
  PLANT_C: ['COMP_02', 'VALVE_01', 'HEAT_01', 'PUMP_01', 'MOTOR_02'],
};

// In-memory twin store: plantId -> twinState
const _twins = new Map();

class TwinEngine {
  static _instance = null;
  static getInstance() {
    if (!TwinEngine._instance) TwinEngine._instance = new TwinEngine();
    return TwinEngine._instance;
  }

  constructor() {
    this._subscribed = false;
  }

  // ─── Initialisation ────────────────────────────────────────
  async init() {
    // Load from MongoDB if available
    try {
      const DigitalTwin = require('../../models/DigitalTwin.model');
      const docs = await DigitalTwin.find({}).lean();
      for (const doc of docs) {
        _twins.set(doc.plant_id, this._docToState(doc));
      }
      logger.info(`Digital Twin: loaded ${docs.length} plant states from MongoDB`);
    } catch { /* no DB — use in-memory defaults */ }

    // Seed plants that aren't in DB yet
    for (const plant of PLANTS) {
      if (!_twins.has(plant)) {
        _twins.set(plant, this._defaultPlantState(plant));
        await this._persistPlant(plant);
      }
    }

    // Subscribe to real-time events
    if (!this._subscribed) {
      bus.subscribe(TOPICS.OT_DATA,  (data) => this.updateFromOT(data));
      bus.subscribe(TOPICS.ANOMALY,  (data) => this.updateFromAnomaly(data));
      bus.subscribe(TOPICS.MAINTENANCE, (data) => this.updateFromMaintenance(data));
      this._subscribed = true;
    }

    logger.info(`Digital Twin Engine initialised for plants: ${PLANTS.join(', ')}`);
  }

  // ─── State accessors ───────────────────────────────────────
  async getAllStates() {
    const result = {};
    for (const [pid, state] of _twins.entries()) {
      result[pid] = this._summarise(state);
    }
    return result;
  }

  async getPlantState(plantId) {
    return _twins.get(plantId) || null;
  }

  async getEquipmentState(plantId, equipmentId) {
    const plant = _twins.get(plantId);
    if (!plant) return null;
    return plant.equipment[equipmentId] || null;
  }

  // ─── Update from OT event ─────────────────────────────────
  updateFromOT(data) {
    const { plant_id, equipment_id, health_score } = data;
    if (!plant_id || !equipment_id) return;

    const twin = this._getOrCreate(plant_id);
    const eq   = this._getOrCreateEquipment(twin, equipment_id);

    eq.last_reading   = data;
    eq.last_updated   = new Date();
    eq.health_score   = health_score != null ? health_score : eq.health_score;
    eq.status         = this._healthToStatus(eq.health_score);

    // Update KPIs
    twin.kpis = this._computeKPIs(twin);
    twin.status= this._plantStatus(twin);
    twin.last_updated = new Date();

    // Publish twin update
    bus.publish(TOPICS.TWIN_UPDATE, { plant_id, equipment_id, state: eq, plant_kpis: twin.kpis });

    // Persist (async, non-blocking)
    this._persistPlant(plant_id).catch(() => {});
  }

  // ─── Update from anomaly detection result ─────────────────
  updateFromAnomaly(data) {
    const { plant_id, equipment_id, is_anomaly, severity, anomaly_score } = data;
    if (!plant_id || !equipment_id) return;

    const twin = this._getOrCreate(plant_id);
    const eq   = this._getOrCreateEquipment(twin, equipment_id);

    if (is_anomaly) {
      eq.anomaly_count_24h = (eq.anomaly_count_24h || 0) + 1;
      // Degrade health score based on anomaly severity
      const degradation = { CRITICAL: 20, HIGH: 10, MEDIUM: 5, LOW: 2 }[severity] || 5;
      eq.health_score = Math.max(0, eq.health_score - degradation);
      eq.status = this._healthToStatus(eq.health_score);
    }

    twin.kpis   = this._computeKPIs(twin);
    twin.status = this._plantStatus(twin);
  }

  // ─── Update from maintenance log ──────────────────────────
  updateFromMaintenance(data) {
    const { plant_id, equipment_id, severity_tag, action_taken, follow_up_required } = data;
    if (!plant_id || !equipment_id) return;

    const twin = this._getOrCreate(plant_id);
    const eq   = this._getOrCreateEquipment(twin, equipment_id);

    if (follow_up_required) {
      eq.maintenance_due = true;
    }
    if (action_taken === 'Immediate repair done' || action_taken === 'Sensor recalibrated') {
      // Repair improves health
      eq.health_score = Math.min(100, eq.health_score + 15);
      eq.maintenance_due = false;
      eq.status = this._healthToStatus(eq.health_score);
    }
  }

  // ─── What-if Simulation ────────────────────────────────────
  async simulate(plantId, { scenario, equipment_id, parameter, value }) {
    const twin = _twins.get(plantId);
    if (!twin) throw new Error(`Plant ${plantId} not found`);

    // Clone state for simulation (don't modify real state)
    const simState = JSON.parse(JSON.stringify(twin));
    simState.simulation_mode = true;

    const scenarios = {
      'equipment_failure': () => {
        if (!equipment_id) throw new Error('equipment_id required for equipment_failure scenario');
        const eq = simState.equipment[equipment_id];
        if (!eq) throw new Error(`Equipment ${equipment_id} not found`);
        const originalHealth = eq.health_score;
        eq.health_score = 0;
        eq.status = 'OFFLINE';
        eq.failure_probability = 1.0;
        const impact = this._assessFailureImpact(simState, equipment_id);
        return {
          scenario:          'equipment_failure',
          equipment_id,
          original_health:   originalHealth,
          simulated_health:  0,
          cascading_effects: impact.cascading,
          production_impact: impact.production_impact,
          estimated_downtime:'4-8 hours',
          recommended_action:'Prepare backup equipment and schedule emergency maintenance',
        };
      },

      'overload': () => {
        const loadMultiplier = parseFloat(value || 1.2);
        const affected = [];
        for (const [eid, eq] of Object.entries(simState.equipment)) {
          const originalH = eq.health_score;
          eq.health_score = Math.max(0, eq.health_score - (loadMultiplier - 1) * 50);
          if (eq.health_score < originalH) affected.push({ equipment_id: eid, delta: eq.health_score - originalH });
        }
        return {
          scenario:        'overload',
          load_multiplier: loadMultiplier,
          affected_equipment: affected,
          overall_health_impact: `Fleet health reduced by ~${Math.round((loadMultiplier - 1) * 50)}%`,
          recommendation:  'Distribute load across available equipment; consider reducing throughput',
        };
      },

      'sensor_degradation': () => {
        const eq = equipment_id ? simState.equipment[equipment_id] : null;
        const target = eq || Object.values(simState.equipment)[0];
        const paramKey = parameter || 'temperature';
        const simValue = parseFloat(value || (target.last_reading?.[paramKey] || 80) * 1.3);
        return {
          scenario:          'sensor_degradation',
          equipment_id:      equipment_id,
          parameter:         paramKey,
          current_value:     target.last_reading?.[paramKey],
          simulated_value:   simValue,
          anomaly_expected:  simValue > (cfg.otThresholds[paramKey]?.max || 999),
          health_impact:     simValue > (cfg.otThresholds[paramKey]?.max || 999) ? 'Anomaly would be triggered' : 'Within safe range',
          recommendation:    'Monitor sensor calibration; verify with secondary measurement',
        };
      },
    };

    const fn = scenarios[scenario] || scenarios['equipment_failure'];
    const result = fn();

    // Recompute KPIs for simulated state
    result.simulated_kpis = this._computeKPIs(simState);
    result.plant_id = plantId;
    result.simulated_at = new Date().toISOString();

    return result;
  }

  async resetPlant(plantId) {
    _twins.set(plantId, this._defaultPlantState(plantId));
    await this._persistPlant(plantId);
  }

  // ─── Private helpers ───────────────────────────────────────
  _getOrCreate(plantId) {
    if (!_twins.has(plantId)) _twins.set(plantId, this._defaultPlantState(plantId));
    return _twins.get(plantId);
  }

  _getOrCreateEquipment(twin, equipmentId) {
    if (!twin.equipment[equipmentId]) {
      twin.equipment[equipmentId] = {
        equipment_id:         equipmentId,
        equipment_type:       EQUIPMENT_TYPES[equipmentId] || 'Unknown',
        health_score:         100,
        status:               'NORMAL',
        last_reading:         null,
        last_updated:         new Date(),
        failure_probability:  0,
        predicted_failure_at: null,
        active_alerts:        [],
        maintenance_due:      false,
        maintenance_due_date: null,
        anomaly_count_24h:    0,
        uptime_pct:           100,
      };
    }
    return twin.equipment[equipmentId];
  }

  _defaultPlantState(plantId) {
    const equipment = {};
    for (const eq of (PLANT_EQUIPMENT[plantId] || [])) {
      equipment[eq] = {
        equipment_id:         eq,
        equipment_type:       EQUIPMENT_TYPES[eq] || 'Unknown',
        health_score:         100,
        status:               'NORMAL',
        last_reading:         null,
        last_updated:         new Date(),
        failure_probability:  0,
        predicted_failure_at: null,
        active_alerts:        [],
        maintenance_due:      false,
        maintenance_due_date: null,
        anomaly_count_24h:    0,
        uptime_pct:           100,
      };
    }
    return {
      plant_id:    plantId,
      status:      'NOMINAL',
      equipment,
      kpis: { overall_efficiency: 95, availability: 98, oee: 90, mtbf_hours: 720, mttr_hours: 4 },
      last_updated: new Date(),
    };
  }

  _healthToStatus(score) {
    if (score >= 80) return 'NORMAL';
    if (score >= 50) return 'WARNING';
    if (score > 0)   return 'CRITICAL';
    return 'OFFLINE';
  }

  _plantStatus(twin) {
    const statuses = Object.values(twin.equipment).map(e => e.status);
    if (statuses.includes('OFFLINE') || statuses.includes('CRITICAL')) return 'CRITICAL';
    if (statuses.includes('WARNING')) return 'DEGRADED';
    return 'NOMINAL';
  }

  _computeKPIs(twin) {
    const eqList   = Object.values(twin.equipment);
    const avgHealth = eqList.length
      ? eqList.reduce((s, e) => s + e.health_score, 0) / eqList.length : 100;
    const availability = Math.min(100, avgHealth * 1.02);
    const oee          = availability * 0.92 * 0.95; // availability * performance * quality

    return {
      overall_efficiency: parseFloat(avgHealth.toFixed(1)),
      availability:       parseFloat(availability.toFixed(1)),
      oee:                parseFloat(Math.min(100, oee).toFixed(1)),
      mtbf_hours:         parseFloat((avgHealth * 7.2).toFixed(0)), // rough proxy
      mttr_hours:         parseFloat((Math.max(1, (100 - avgHealth) * 0.08)).toFixed(1)),
    };
  }

  _assessFailureImpact(simState, failedEquipId) {
    const cascading = [];
    // Equipment with similar IDs are likely on same process line
    const prefix = failedEquipId.split('_')[0];
    for (const [eid, eq] of Object.entries(simState.equipment)) {
      if (eid !== failedEquipId && eid.startsWith(prefix)) {
        cascading.push({ equipment_id: eid, risk: 'Increased load on parallel unit' });
      }
    }
    return {
      cascading,
      production_impact: `Estimated 15-30% reduction in ${simState.plant_id} output`,
    };
  }

  _summarise(twin) {
    const eqSummary = {};
    for (const [k, v] of Object.entries(twin.equipment)) {
      eqSummary[k] = {
        status:              v.status,
        health_score:        v.health_score,
        failure_probability: v.failure_probability,
        maintenance_due:     v.maintenance_due,
        last_updated:        v.last_updated,
      };
    }
    return { ...twin, equipment: eqSummary };
  }

  _docToState(doc) {
    // Convert Mongoose Map to plain object
    const equipment = {};
    if (doc.equipment) {
      const src = doc.equipment instanceof Map ? Object.fromEntries(doc.equipment) : doc.equipment;
      for (const [k, v] of Object.entries(src)) equipment[k] = v;
    }
    return { ...doc, equipment };
  }

  async _persistPlant(plantId) {
    try {
      const DigitalTwin = require('../../models/DigitalTwin.model');
      const state = _twins.get(plantId);
      if (!state) return;
      await DigitalTwin.findOneAndUpdate(
        { plant_id: plantId },
        { ...state, equipment: new Map(Object.entries(state.equipment)) },
        { upsert: true, new: true }
      );
    } catch { /* non-critical */ }
  }
}

module.exports = TwinEngine;
