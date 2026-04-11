#!/usr/bin/env node
'use strict';
/**
 * Continuous OT data simulator
 * Streams sensor data to the gateway every 2 seconds.
 * Usage: node scripts/generate_ot_data.js [--plant PLANT_A] [--interval 2000] [--anomaly-rate 0.1]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios  = require('axios');
const { generateOTRecord } = require('../utils/dataGenerators');

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const BASE         = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;
const PLANT_ID     = getArg('--plant', null);
const INTERVAL_MS  = parseInt(getArg('--interval', '2000'));
const ANOMALY_RATE = parseFloat(getArg('--anomaly-rate', '0.08'));

let count = 0;
let errors = 0;

console.log(`OT Data Simulator`);
console.log(`  Target: ${BASE}`);
console.log(`  Plant:  ${PLANT_ID || 'ALL'}`);
console.log(`  Interval: ${INTERVAL_MS}ms`);
console.log(`  Anomaly rate: ${ANOMALY_RATE * 100}%`);
console.log(`  Press Ctrl+C to stop\n`);

async function sendRecord() {
  try {
    const anomalous = Math.random() < ANOMALY_RATE;
    const record    = generateOTRecord({ plant_id: PLANT_ID || undefined, anomalous });
    delete record._anomalous;

    const res = await axios.post(`${BASE}/api/ingest/ot`, record, { timeout: 3000 });
    count++;
    const health = res.data.data?.health_score;
    const flag   = anomalous ? '⚠ ANOMALY' : '✓';
    process.stdout.write(`\r${flag} [${count}] ${record.plant_id}/${record.equipment_id} | health: ${health}% | errors: ${errors}  `);
  } catch (e) {
    errors++;
    process.stdout.write(`\r✗ Error: ${e.message.substring(0, 60)} | errors: ${errors}  `);
  }
}

const timer = setInterval(sendRecord, INTERVAL_MS);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log(`\n\nStopped. Sent ${count} records, ${errors} errors.`);
  process.exit(0);
});
