'use strict';
const express = require('express');
const router  = express.Router();
const { body, validationResult } = require('express-validator');
const IngestionService = require('../../services/ingestion/ingestion.service');
const logger = require('../../utils/logger');

const svc = new IngestionService();

// ─── POST /api/ingest/ot ──────────────────────────────────────
// Ingest a single OT sensor reading
router.post('/ot',
  body('plant_id').notEmpty(),
  body('equipment_id').notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const result = await svc.ingestOT(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// ─── POST /api/ingest/ot/batch ────────────────────────────────
router.post('/ot/batch', async (req, res, next) => {
  try {
    const records = Array.isArray(req.body) ? req.body : req.body.records;
    if (!records || !records.length) return res.status(400).json({ success: false, error: 'Expected array of OT records' });
    const results = await svc.ingestOTBatch(records);
    res.status(201).json({ success: true, count: results.length, data: results });
  } catch (e) { next(e); }
});

// ─── POST /api/ingest/it ──────────────────────────────────────
router.post('/it',
  body('plant_id').notEmpty(),
  body('order_id').notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const result = await svc.ingestIT(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// ─── POST /api/ingest/it/batch ────────────────────────────────
router.post('/it/batch', async (req, res, next) => {
  try {
    const records = Array.isArray(req.body) ? req.body : req.body.records;
    if (!records || !records.length) return res.status(400).json({ success: false, error: 'Expected array of IT records' });
    const results = await svc.ingestITBatch(records);
    res.status(201).json({ success: true, count: results.length, data: results });
  } catch (e) { next(e); }
});

// ─── POST /api/ingest/maintenance ────────────────────────────
router.post('/maintenance',
  body('equipment_id').notEmpty(),
  body('plant_id').notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const result = await svc.ingestMaintenance(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// ─── POST /api/ingest/simulate ───────────────────────────────
// Trigger a burst of simulated data
router.post('/simulate', async (req, res, next) => {
  try {
    const { ot_count = 10, it_count = 5, plant_id } = req.body || {};
    const result = await svc.simulateBurst({ otCount: ot_count, itCount: it_count, plantId: plant_id });
    res.json({ success: true, message: `Simulated ${result.ot} OT + ${result.it} IT records`, ...result });
  } catch (e) { next(e); }
});

module.exports = router;
