#!/usr/bin/env node
'use strict';
/**
 * IT / Business data simulator
 * Sends SAP-like order/production data every 5 seconds.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios  = require('axios');
const { generateITRecord } = require('../utils/dataGenerators');

const BASE = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;
let count = 0;

console.log(`IT Data Simulator → ${BASE}\nPress Ctrl+C to stop\n`);

async function send() {
  try {
    const record = generateITRecord();
    const res    = await axios.post(`${BASE}/api/ingest/it`, record, { timeout: 3000 });
    count++;
    process.stdout.write(`\r✓ [${count}] ${record.plant_id}/${record.order_id} | ${record.order_status} | risk: ${record.stockout_risk}  `);
  } catch (e) {
    process.stdout.write(`\r✗ ${e.message.substring(0, 60)}  `);
  }
}

const timer = setInterval(send, 5000);
process.on('SIGINT', () => { clearInterval(timer); console.log(`\nSent ${count} IT records.`); process.exit(0); });
