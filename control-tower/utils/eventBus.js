'use strict';
/**
 * Internal Event Bus
 * Simulates Kafka topics using Node.js EventEmitter.
 * Switches to real KafkaJS if USE_KAFKA=true and broker is reachable.
 */
const EventEmitter = require('events');
const logger = require('./logger');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this._kafka = null;
    this._producer = null;
    this._consumers = [];
  }

  // ─── Topics ────────────────────────────────────────────────
  static TOPICS = {
    OT_DATA:     'ot.data.ingested',
    IT_DATA:     'it.data.ingested',
    ANOMALY:     'anomaly.detected',
    PREDICTION:  'prediction.ready',
    MAINTENANCE: 'maintenance.alert',
    DECISION:    'decision.generated',
    TWIN_UPDATE: 'twin.state.updated',
    ALERT:       'alert.raised',
  };

  async init() {
    if (process.env.USE_KAFKA === 'true') {
      try {
        const { Kafka } = require('kafkajs');
        this._kafka = new Kafka({
          clientId: 'aion-control-tower',
          brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
          connectionTimeout: 3000,
          requestTimeout: 3000,
          retry: { retries: 1 },
        });
        this._producer = this._kafka.producer();
        await this._producer.connect();
        logger.info('Kafka producer connected');
        this._useKafka = true;
        return;
      } catch (e) {
        logger.warn(`Kafka unavailable (${e.message}), falling back to in-process EventEmitter`);
      }
    }
    logger.info('EventBus: using in-process EventEmitter (Kafka not active)');
    this._useKafka = false;
  }

  async publish(topic, payload) {
    const envelope = {
      topic,
      timestamp: new Date().toISOString(),
      payload,
    };

    if (this._useKafka && this._producer) {
      try {
        await this._producer.send({
          topic,
          messages: [{ value: JSON.stringify(envelope) }],
        });
      } catch (e) {
        logger.warn(`Kafka publish failed, falling back to EventEmitter: ${e.message}`);
        this.emit(topic, envelope);
      }
    } else {
      this.emit(topic, envelope);
    }
  }

  subscribe(topic, handler) {
    this.on(topic, (envelope) => {
      try {
        handler(envelope.payload, envelope);
      } catch (e) {
        logger.error(`EventBus handler error on topic ${topic}: ${e.message}`);
      }
    });
    logger.debug(`Subscribed to topic: ${topic}`);
  }

  async shutdown() {
    if (this._producer) await this._producer.disconnect().catch(() => {});
  }
}

// Singleton
const bus = new EventBus();
module.exports = { bus, TOPICS: EventBus.TOPICS };
