'use strict';
const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const cfg     = require('../../config/services.config');
const logger  = require('../../utils/logger');
// Fallback in-process AI modules (used if Python services are down)
const { detectAnomalies }      = require('../../services/ai-services/fallback/anomaly.fallback');
const { forecastSeries }       = require('../../services/ai-services/fallback/forecasting.fallback');
const { predictMaintenance }   = require('../../services/ai-services/fallback/maintenance.fallback');

async function callPython(url, path, body, fallbackFn) {
  try {
    const res = await axios.post(`${url}${path}`, body, { timeout: 8000 });
    return res.data;
  } catch (e) {
    logger.warn(`Python service ${url}${path} unavailable: ${e.message}. Using fallback.`);
    return fallbackFn(body);
  }
}

// ─── POST /api/ai/anomaly ─────────────────────────────────────
router.post('/anomaly', async (req, res, next) => {
  try {
    const result = await callPython(cfg.anomaly, '/detect', req.body, detectAnomalies);
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

// ─── POST /api/ai/forecast ────────────────────────────────────
router.post('/forecast', async (req, res, next) => {
  try {
    const result = await callPython(cfg.forecasting, '/forecast', req.body, forecastSeries);
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

// ─── POST /api/ai/maintenance ─────────────────────────────────
router.post('/maintenance', async (req, res, next) => {
  try {
    const result = await callPython(cfg.maintenance, '/predict', req.body, predictMaintenance);
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

// ─── GET /api/ai/health ───────────────────────────────────────
router.get('/health', async (req, res) => {
  const checks = await Promise.allSettled([
    axios.get(`${cfg.anomaly}/health`,     { timeout: 2000 }),
    axios.get(`${cfg.forecasting}/health`, { timeout: 2000 }),
    axios.get(`${cfg.maintenance}/health`, { timeout: 2000 }),
  ]);
  res.json({
    anomaly_service:     checks[0].status === 'fulfilled' ? 'UP' : 'DOWN (fallback active)',
    forecasting_service: checks[1].status === 'fulfilled' ? 'UP' : 'DOWN (fallback active)',
    maintenance_service: checks[2].status === 'fulfilled' ? 'UP' : 'DOWN (fallback active)',
  });
});

module.exports = router;
