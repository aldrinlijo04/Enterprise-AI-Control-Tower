'use strict';
const express = require('express');
const router  = express.Router();
const TwinEngine = require('../../services/digital-twin/twin.engine');

const twin = TwinEngine.getInstance();

// ─── GET /api/twin ────────────────────────────────────────────
// All plants state
router.get('/', async (req, res, next) => {
  try {
    const state = await twin.getAllStates();
    res.json({ success: true, data: state });
  } catch (e) { next(e); }
});

// ─── GET /api/twin/:plantId ───────────────────────────────────
router.get('/:plantId', async (req, res, next) => {
  try {
    const state = await twin.getPlantState(req.params.plantId);
    if (!state) return res.status(404).json({ success: false, error: 'Plant not found in digital twin' });
    res.json({ success: true, data: state });
  } catch (e) { next(e); }
});

// ─── GET /api/twin/:plantId/equipment/:equipId ────────────────
router.get('/:plantId/equipment/:equipId', async (req, res, next) => {
  try {
    const state = await twin.getEquipmentState(req.params.plantId, req.params.equipId);
    if (!state) return res.status(404).json({ success: false, error: 'Equipment not found' });
    res.json({ success: true, data: state });
  } catch (e) { next(e); }
});

// ─── POST /api/twin/:plantId/simulate ────────────────────────
// Simulate a scenario: what-if analysis
router.post('/:plantId/simulate', async (req, res, next) => {
  try {
    const { scenario, equipment_id, parameter, value } = req.body;
    const result = await twin.simulate(req.params.plantId, { scenario, equipment_id, parameter, value });
    res.json({ success: true, simulation: result });
  } catch (e) { next(e); }
});

// ─── POST /api/twin/:plantId/reset ───────────────────────────
router.post('/:plantId/reset', async (req, res, next) => {
  try {
    await twin.resetPlant(req.params.plantId);
    res.json({ success: true, message: `Digital twin for ${req.params.plantId} reset to nominal state` });
  } catch (e) { next(e); }
});

module.exports = router;
