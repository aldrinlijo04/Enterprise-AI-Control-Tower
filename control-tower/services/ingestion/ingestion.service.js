'use strict';
/**
 * IngestionService
 * Validates, enriches, persists OT/IT/Maintenance records
 * and publishes them to the event bus for downstream agents.
 */
const { v4: uuidv4 } = require('uuid');
const { bus, TOPICS }   = require('../../utils/eventBus');
const logger            = require('../../utils/logger');
const cfg               = require('../../config/services.config');
const { generateOTBatch, generateITBatch } = require('../../utils/dataGenerators');

// Models (lazy-loaded so service works without DB)
function getModel(name) {
  try { return require(`../../models/${name}.model`); }
  catch { return null; }
}

// In-memory store (fallback when MongoDB is unavailable)
const memOT   = [];
const memIT   = [];
const memMaint= [];

class IngestionService {
  // ─── OT Ingestion ──────────────────────────────────────────
  async ingestOT(record) {
    const enriched = this._enrichOT(record);

    // Persist
    try {
      const Model = getModel('OTData');
      if (Model) await Model.create(enriched);
      else memOT.push(enriched);
    } catch (e) {
      logger.warn(`OT persist failed: ${e.message}`);
      memOT.push(enriched);
    }

    // Publish
    await bus.publish(TOPICS.OT_DATA, enriched);
    return enriched;
  }

  async ingestOTBatch(records) {
    return Promise.all(records.map(r => this.ingestOT(r)));
  }

  // ─── IT Ingestion ──────────────────────────────────────────
  async ingestIT(record) {
    const enriched = { ...record, timestamp: record.timestamp || new Date().toISOString() };

    try {
      const Model = getModel('ITData');
      if (Model) {
        await Model.findOneAndUpdate(
          { order_id: enriched.order_id },
          enriched,
          { upsert: true, new: true }
        );
      } else memIT.push(enriched);
    } catch (e) {
      logger.warn(`IT persist failed: ${e.message}`);
      memIT.push(enriched);
    }

    await bus.publish(TOPICS.IT_DATA, enriched);
    return enriched;
  }

  async ingestITBatch(records) {
    return Promise.all(records.map(r => this.ingestIT(r)));
  }

  // ─── Maintenance Ingestion ─────────────────────────────────
  async ingestMaintenance(record) {
    const enriched = { ...record, date: record.date || new Date().toISOString().split('T')[0] };

    try {
      const Model = getModel('MaintenanceLog');
      if (Model) await Model.create(enriched);
      else memMaint.push(enriched);
    } catch (e) {
      logger.warn(`Maintenance persist failed: ${e.message}`);
      memMaint.push(enriched);
    }

    await bus.publish(TOPICS.MAINTENANCE, enriched);
    return enriched;
  }

  // ─── Burst simulation ─────────────────────────────────────
  async simulateBurst({ otCount = 10, itCount = 5, plantId } = {}) {
    const otRecords = generateOTBatch(otCount, plantId ? { plant_id: plantId } : {});
    const itRecords = generateITBatch(itCount, plantId ? { plant_id: plantId } : {});

    const [otResults, itResults] = await Promise.all([
      this.ingestOTBatch(otRecords),
      this.ingestITBatch(itRecords),
    ]);

    logger.info(`Burst simulated: ${otResults.length} OT + ${itResults.length} IT records`);
    return { ot: otResults.length, it: itResults.length };
  }

  // ─── Private: OT enrichment ────────────────────────────────
  _enrichOT(record) {
    const r = {
      ...record,
      timestamp: record.timestamp || new Date().toISOString(),
    };
    delete r._anomalous; // strip internal flag

    // Compute health score from sensor readings
    r.health_score = this._computeHealthScore(r);
    return r;
  }

  _computeHealthScore(r) {
    const thresholds = cfg.otThresholds;
    const weights    = cfg.healthWeights;
    let totalWeight  = 0;
    let score        = 0;

    for (const [metric, weight] of Object.entries(weights)) {
      if (r[metric] == null || !thresholds[metric]) continue;
      const { min, max } = thresholds[metric];
      const range  = max - min;
      const val    = r[metric];

      let normalised;
      if (metric === 'oil_level_pct') {
        // Higher is better
        normalised = Math.max(0, Math.min(1, (val - min) / range));
      } else if (metric === 'power_factor') {
        normalised = Math.max(0, Math.min(1, (val - min) / range));
      } else {
        // Distance from centre of safe range — closer to extremes = lower health
        const centre = (min + max) / 2;
        const deviation = Math.abs(val - centre) / (range / 2);
        normalised = Math.max(0, 1 - deviation);
      }

      score       += normalised * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? parseFloat(((score / totalWeight) * 100).toFixed(1)) : 100;
  }

  // ─── Query helpers ─────────────────────────────────────────
  async getRecentOT(plantId, equipmentId, limit = 50) {
    try {
      const Model = getModel('OTData');
      if (Model) {
        const filter = {};
        if (plantId)     filter.plant_id     = plantId;
        if (equipmentId) filter.equipment_id = equipmentId;
        return await Model.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
      }
    } catch {}
    return memOT.filter(r =>
      (!plantId || r.plant_id === plantId) &&
      (!equipmentId || r.equipment_id === equipmentId)
    ).slice(-limit).reverse();
  }
}

module.exports = IngestionService;
