#!/usr/bin/env node
'use strict';
/**
 * AION Control Tower — End-to-end Demo Script
 * --------------------------------------------
 * Runs the full pipeline locally without Docker:
 *   1. Starts the gateway (in-process)
 *   2. Simulates OT data burst (with anomalies)
 *   3. Runs full agent pipeline
 *   4. Prints sample decisions
 *
 * Run: node scripts/demo.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios  = require('axios');
const logger = require('../utils/logger');
const { generateOTBatch, generateITBatch, generateMaintenanceLog } = require('../utils/dataGenerators');

const BASE = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForGateway(retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(`${BASE}/health`, { timeout: 1000 });
      return true;
    } catch {
      process.stdout.write('.');
      await sleep(1000);
    }
  }
  return false;
}

async function demo() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   AION Enterprise AI Control Tower — DEMO       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // ── Step 0: Wait for gateway ──────────────────────────────
  console.log('⏳ Waiting for gateway...');
  const ready = await waitForGateway();
  if (!ready) {
    console.log('\n❌ Gateway not responding. Start it first: npm start\n');
    process.exit(1);
  }
  console.log('\n✅ Gateway is UP\n');

  // ── Step 1: Health check ──────────────────────────────────
  console.log('─── Step 1: Service Health ───────────────────────');
  const health = await axios.get(`${BASE}/health`);
  console.log('Gateway:', JSON.stringify(health.data, null, 2));

  const aiHealth = await axios.get(`${BASE}/api/ai/health`).catch(() => ({ data: {} }));
  console.log('AI Services:', JSON.stringify(aiHealth.data, null, 2));

  await sleep(500);

  // ── Step 2: Simulate normal OT data ──────────────────────
  console.log('\n─── Step 2: Ingest Normal OT Data (PLANT_A) ─────');
  const normalOT = generateOTBatch(5, { plant_id: 'PLANT_A', anomalous: false });
  const r1 = await axios.post(`${BASE}/api/ingest/ot/batch`, normalOT);
  console.log(`Ingested ${r1.data.count} OT records`);
  await sleep(500);

  // ── Step 3: Simulate ANOMALOUS OT data ───────────────────
  console.log('\n─── Step 3: Inject Anomalous Sensor Readings ────');
  const anomalousOT = [
    {
      timestamp:    new Date().toISOString(),
      plant_id:     'PLANT_A',
      equipment_id: 'PUMP_01',
      temperature:  158.4,   // Critical: >130
      pressure:     225.0,   // Critical: >210
      flow_rate:    4.2,     // Low: <5
      vibration:    0.28,    // Critical: >0.12
      rpm:          520,     // Low: <800
      bearing_temp: 182.5,   // Critical: >160
      oil_level_pct:9.8,     // Critical: <20
      voltage:      218.0,
      current_a:    145.0,
      power_kw:     320.0,
      power_factor: 0.72,    // Low
      noise_db:     98.5,    // Critical: >90
    },
  ];

  const r2 = await axios.post(`${BASE}/api/ingest/ot/batch`, anomalousOT);
  console.log(`Injected ${r2.data.count} ANOMALOUS OT records`);
  console.log('Health score:', r2.data.data?.[0]?.health_score);
  await sleep(1500); // Allow agents to process

  // ── Step 4: Inject IT data ────────────────────────────────
  console.log('\n─── Step 4: Ingest IT Business Data ─────────────');
  const itData = generateITBatch(3, { plant_id: 'PLANT_A' });
  const r3 = await axios.post(`${BASE}/api/ingest/it/batch`, itData);
  console.log(`Ingested ${r3.data.count} IT records`);

  // ── Step 5: Inject maintenance log ───────────────────────
  console.log('\n─── Step 5: Ingest Maintenance Log ──────────────');
  const maintLog = {
    equipment_id:     'PUMP_01',
    plant_id:         'PLANT_A',
    equipment_type:   'Pump',
    log_text:         'Vibration levels critically elevated. Bearing inspection urgent.',
    date:             new Date().toISOString().split('T')[0],
    severity_tag:     'HIGH',
    logged_by:        'Demo System',
    maintenance_type: 'Predictive',
    action_taken:     'Shutdown initiated',
    follow_up_required: true,
  };
  const r4 = await axios.post(`${BASE}/api/ingest/maintenance`, maintLog);
  console.log('Maintenance log ingested:', r4.data.success);

  await sleep(2000); // Allow full agent pipeline to complete

  // ── Step 6: Digital Twin state ────────────────────────────
  console.log('\n─── Step 6: Digital Twin State ──────────────────');
  const twin = await axios.get(`${BASE}/api/twin/PLANT_A`).catch(() => ({ data: { data: null } }));
  if (twin.data.data) {
    const state = twin.data.data;
    console.log(`PLANT_A Status: ${state.status}`);
    console.log('Equipment Health:');
    for (const [eqId, eq] of Object.entries(state.equipment || {})) {
      console.log(`  ${eqId}: ${eq.status} | Health: ${eq.health_score}%`);
    }
    console.log('KPIs:', JSON.stringify(state.kpis, null, 2));
  } else {
    console.log('Twin state not yet available (MongoDB not connected — in-memory mode)');
  }

  // ── Step 7: What-if simulation ────────────────────────────
  console.log('\n─── Step 7: What-If Simulation ──────────────────');
  const sim = await axios.post(`${BASE}/api/twin/PLANT_A/simulate`, {
    scenario:     'equipment_failure',
    equipment_id: 'PUMP_01',
  }).catch(e => ({ data: { simulation: { error: e.message } } }));
  console.log('Simulation Result:', JSON.stringify(sim.data.simulation || sim.data, null, 2));

  // ── Step 8: Manual decision trigger ──────────────────────
  console.log('\n─── Step 8: Trigger Decision Engine ─────────────');
  const decision = await axios.post(`${BASE}/api/decisions/trigger`, {
    plant_id:     'PLANT_A',
    equipment_id: 'PUMP_01',
    issue:        'PUMP_01 showing multiple critical sensor violations',
    context:      anomalousOT[0],
  });

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║           PRESCRIPTIVE DECISION               ║');
  console.log('╚═══════════════════════════════════════════════╝');
  const d = decision.data.data || decision.data;
  console.log(`
🔴 ISSUE:      ${d.issue}
📊 PREDICTION: ${d.prediction}
✅ ACTION:     ${d.action?.substring(0, 200)}
⚡ PRIORITY:   ${d.priority}
🎯 CONFIDENCE: ${Math.round((d.confidence || 0) * 100)}%
🕐 WINDOW:     ${d.maintenance_window || 'See action'}
💰 IMPACT:     ${d.estimated_impact || 'N/A'}
`);

  if (d.cost_benefit) {
    console.log('Cost-Benefit:');
    console.log(`  Cost Avoidance: ₹${(d.cost_benefit.estimated_cost_avoidance_INR || 0).toLocaleString()}`);
    console.log(`  Maintenance Cost: ₹${(d.cost_benefit.maintenance_cost_estimate_INR || 0).toLocaleString()}`);
    console.log(`  ${d.cost_benefit.roi_statement || ''}`);
  }

  // ── Step 9: Get all decisions & alerts ────────────────────
  console.log('\n─── Step 9: Current Alerts & Decisions ──────────');
  const alerts   = await axios.get(`${BASE}/api/decisions/alerts/all?limit=5`).catch(() => ({ data: { data: [] } }));
  const decisions= await axios.get(`${BASE}/api/decisions?limit=5`).catch(() => ({ data: { data: [] } }));

  console.log(`Open Alerts: ${alerts.data.total || 0}`);
  (alerts.data.data || []).slice(0, 3).forEach(a => {
    console.log(`  [${a.severity}] ${a.title} — ${a.message?.substring(0, 80)}`);
  });

  console.log(`\nRecent Decisions: ${decisions.data.total || 0}`);
  (decisions.data.data || []).slice(0, 3).forEach(dec => {
    console.log(`  [${dec.priority}] ${dec.issue?.substring(0, 60)}`);
  });

  // ── Step 10: AI direct call ───────────────────────────────
  console.log('\n─── Step 10: Direct AI Service Calls ────────────');
  const anomalyCheck = await axios.post(`${BASE}/api/ai/anomaly`, anomalousOT[0]).catch(e => ({ data: { error: e.message } }));
  console.log('Anomaly Check:', {
    is_anomaly:   anomalyCheck.data.is_anomaly,
    severity:     anomalyCheck.data.severity,
    anomaly_score:anomalyCheck.data.anomaly_score,
    violations:   (anomalyCheck.data.violations || []).map(v => v.metric),
  });

  const maintCheck = await axios.post(`${BASE}/api/ai/maintenance`, anomalousOT[0]).catch(e => ({ data: { error: e.message } }));
  console.log('Maintenance Prediction:', {
    status:                maintCheck.data.status,
    failure_probability:   maintCheck.data.failure_probability,
    time_to_failure_hours: maintCheck.data.time_to_failure_hours,
    urgency:               maintCheck.data.urgency,
    top_action:            (maintCheck.data.recommended_actions || [])[0],
  });

  console.log('\n╔═══════════════════════════════════════���══════════╗');
  console.log('║   ✅ DEMO COMPLETE — All systems operational     ║');
  console.log('║                                                  ║');
  console.log('║   Dashboard: http://localhost:3000/api/dashboard ║');
  console.log('║   Swagger:   http://localhost:8001/docs          ║');
  console.log('║             http://localhost:8002/docs           ║');
  console.log('║             http://localhost:8003/docs           ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
}

demo().catch(err => {
  console.error('\n❌ Demo failed:', err.message);
  if (err.response) console.error('Response:', JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
