'use strict';
const express = require('express');
const router  = express.Router();
const Decision    = require('../../models/Decision.model');
const Alert       = require('../../models/Alert.model');
const DecisionEngine = require('../../services/decision-engine/decision.engine');

const engine = DecisionEngine.getInstance();

// ─── GET /api/decisions ───────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { plant_id, status, priority, limit = 20, skip = 0 } = req.query;
    const filter = {};
    if (plant_id)  filter.plant_id = plant_id;
    if (status)    filter.status   = status.toUpperCase();
    if (priority)  filter.priority = priority.toUpperCase();

    const [decisions, total] = await Promise.all([
      Decision.find(filter).sort({ createdAt: -1 }).skip(+skip).limit(+limit).lean(),
      Decision.countDocuments(filter),
    ]);
    res.json({ success: true, total, data: decisions });
  } catch (e) { next(e); }
});

// ─── GET /api/decisions/:id ───────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Decision.findOne({ decision_id: req.params.id }).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Decision not found' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ─── PATCH /api/decisions/:id/status ─────────────────────────
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ['PENDING', 'APPROVED', 'EXECUTING', 'DONE', 'REJECTED'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: `status must be one of: ${valid.join(', ')}` });
    const doc = await Decision.findOneAndUpdate(
      { decision_id: req.params.id },
      { status },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Decision not found' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ─── POST /api/decisions/trigger ─────────────────────────────
// Manually trigger decision engine for a plant
router.post('/trigger', async (req, res, next) => {
  try {
    const { plant_id, equipment_id, issue, context } = req.body;
    if (!plant_id || !issue) return res.status(400).json({ success: false, error: 'plant_id and issue required' });
    const decision = await engine.processManualTrigger({ plant_id, equipment_id, issue, context });
    res.status(201).json({ success: true, data: decision });
  } catch (e) { next(e); }
});

// ─── GET /api/alerts ──────────────────────────────────────────
router.get('/alerts/all', async (req, res, next) => {
  try {
    const { plant_id, status, severity, limit = 50 } = req.query;
    const filter = {};
    if (plant_id) filter.plant_id = plant_id;
    if (status)   filter.status   = status.toUpperCase();
    if (severity) filter.severity = severity.toUpperCase();
    const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(+limit).lean();
    res.json({ success: true, total: alerts.length, data: alerts });
  } catch (e) { next(e); }
});

// ─── PATCH /api/alerts/:alertId/resolve ───────────────────────
router.patch('/alerts/:alertId/resolve', async (req, res, next) => {
  try {
    const doc = await Alert.findOneAndUpdate(
      { alert_id: req.params.alertId },
      { status: 'RESOLVED', resolved_at: new Date() },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

module.exports = router;
