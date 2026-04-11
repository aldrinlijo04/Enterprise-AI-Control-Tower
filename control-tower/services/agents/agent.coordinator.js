'use strict';
/**
 * Agent Coordinator
 * -----------------
 * Bootstraps, wires, and supervises all agents.
 * Connects agents to the event bus and manages the processing pipeline:
 *
 *   OT_DATA → MonitoringAgent → ANOMALY
 *   ANOMALY → PredictionAgent → PREDICTION
 *   PREDICTION → DecisionAgent → DECISION
 *   DECISION → OptimizationAgent → (persist + ALERT)
 *
 * Also handles: OT_DATA → PredictionAgent (passive history building)
 */
const { bus, TOPICS } = require('../../utils/eventBus');
const logger          = require('../../utils/logger');
const MonitoringAgent    = require('./monitoring.agent');
const PredictionAgent    = require('./prediction.agent');
const DecisionAgent      = require('./decision.agent');
const OptimizationAgent  = require('./optimization.agent');

class AgentCoordinator {
  static _instance = null;
  static getInstance() {
    if (!AgentCoordinator._instance) AgentCoordinator._instance = new AgentCoordinator();
    return AgentCoordinator._instance;
  }

  constructor() {
    this.monitoring   = new MonitoringAgent();
    this.prediction   = new PredictionAgent();
    this.decision     = new DecisionAgent();
    this.optimization = new OptimizationAgent();
    this._started     = false;
  }

  async start() {
    if (this._started) return;

    // Start all agents
    await Promise.all([
      this.monitoring.start(bus),
      this.prediction.start(bus),
      this.decision.start(bus),
      this.optimization.start(bus),
    ]);

    // ── Wire: OT_DATA → MonitoringAgent ───────────────────
    bus.subscribe(TOPICS.OT_DATA, async (otRecord) => {
      // Build prediction history passively on every OT record
      this.prediction.recordReading(otRecord);

      // Run monitoring (anomaly detection)
      await this.monitoring.safeProcess(otRecord);
    });

    // ── Wire: ANOMALY → PredictionAgent ───────────────────
    bus.subscribe(TOPICS.ANOMALY, async (anomalyData) => {
      await this.prediction.safeProcess(anomalyData);
    });

    // ── Wire: PREDICTION → DecisionAgent ──────────────────
    bus.subscribe(TOPICS.PREDICTION, async (predData) => {
      await this.decision.safeProcess(predData);
    });

    // ── Wire: DECISION → OptimizationAgent ────────────────
    bus.subscribe(TOPICS.DECISION, async (decisionData) => {
      await this.optimization.safeProcess(decisionData);
    });

    this._started = true;
    logger.info('AgentCoordinator: all agents started and wired');
    logger.info(`Pipeline: OT_DATA → Monitoring → Prediction → Decision → Optimization`);
  }

  async stop() {
    await Promise.all([
      this.monitoring.stop(),
      this.prediction.stop(),
      this.decision.stop(),
      this.optimization.stop(),
    ]);
    this._started = false;
    logger.info('AgentCoordinator: all agents stopped');
  }

  // ─── Status ───────────────────────────────────────────────
  status() {
    return {
      coordinator: 'AgentCoordinator',
      running:     this._started,
      agents: {
        monitoring:   this.monitoring.status(),
        prediction:   this.prediction.status(),
        decision:     this.decision.status(),
        optimization: this.optimization.status(),
      },
    };
  }

  // ─── Manual trigger (for API /decisions/trigger) ──────────
  async triggerPipeline(input) {
    logger.info(`[Coordinator] Manual pipeline trigger for ${input.plant_id}`);
    const monResult  = await this.monitoring.safeProcess(input.ot_record || input.context || input);
    if (!monResult.success) return monResult;

    const predResult = await this.prediction.safeProcess({
      ...monResult.data.anomaly,
      ot_record:    input.ot_record || input.context || input,
      plant_id:     input.plant_id,
      equipment_id: input.equipment_id,
    });
    if (!predResult.success) return predResult;

    const decResult  = await this.decision.safeProcess(predResult.data);
    if (!decResult.success) return decResult;

    return await this.optimization.safeProcess(decResult.data);
  }
}

module.exports = AgentCoordinator;
