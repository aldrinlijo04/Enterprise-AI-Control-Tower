'use strict';
/**
 * BaseAgent
 * ---------
 * Abstract base class for all agents.
 * Provides: input validation, output schema, inter-agent messaging,
 * lifecycle hooks, and error handling.
 */
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class BaseAgent extends EventEmitter {
  /**
   * @param {string} name   - Agent display name
   * @param {string[]} subscribedTopics - Event bus topics to listen to
   */
  constructor(name, subscribedTopics = []) {
    super();
    this.id               = uuidv4();
    this.name             = name;
    this.subscribedTopics = subscribedTopics;
    this.isRunning        = false;
    this.processedCount   = 0;
    this.errorCount       = 0;
    this._bus             = null;
  }

  // ─── Lifecycle ─────────────────────────────────────────────
  async start(bus) {
    this._bus = bus;
    await this.onStart();
    this.isRunning = true;
    logger.info(`[${this.name}] Agent started`);
  }

  async stop() {
    this.isRunning = false;
    await this.onStop();
    logger.info(`[${this.name}] Agent stopped`);
  }

  // ─── Override in subclasses ────────────────────────────────
  async onStart() {}
  async onStop() {}

  /**
   * Core processing method — must be implemented by each agent.
   * @param {object} input - Input data
   * @param {object} context - Shared context / agent chain so far
   * @returns {object} - Agent output
   */
  async process(input, context = {}) {
    throw new Error(`${this.name}.process() not implemented`);
  }

  // ─── Safe process wrapper ──────────────────────────────────
  async safeProcess(input, context = {}) {
    const start = Date.now();
    try {
      const output = await this.process(input, context);
      this.processedCount++;
      const result = this._buildOutput(output, context, Date.now() - start);
      this.emit('output', result);
      return result;
    } catch (e) {
      this.errorCount++;
      logger.error(`[${this.name}] Error: ${e.message}`);
      return this._buildError(e, context);
    }
  }

  // ─── Messaging ────────────────────────────────────────────
  async publish(topic, payload) {
    if (!this._bus) return;
    await this._bus.publish(topic, {
      ...payload,
      _agent: this.name,
      _timestamp: new Date().toISOString(),
    });
  }

  // ─── Output formatting ────────────────────────────────────
  _buildOutput(data, context, durationMs) {
    return {
      agent:       this.name,
      agent_id:    this.id,
      success:     true,
      data,
      context,
      duration_ms: durationMs,
      timestamp:   new Date().toISOString(),
    };
  }

  _buildError(err, context) {
    return {
      agent:     this.name,
      agent_id:  this.id,
      success:   false,
      error:     err.message,
      context,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Status ───────────────────────────────────────────────
  status() {
    return {
      name:             this.name,
      id:               this.id,
      running:          this.isRunning,
      processed:        this.processedCount,
      errors:           this.errorCount,
    };
  }
}

module.exports = BaseAgent;
