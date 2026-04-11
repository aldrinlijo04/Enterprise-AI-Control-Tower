#!/usr/bin/env node
'use strict';
/**
 * One-time loader: seeds MongoDB with sample data from the provided JSON files.
 * Usage: node scripts/load_sample_data.js
 *
 * Point OT_FILE / IT_FILE / MAINT_FILE env vars to your JSON files,
 * or use the defaults below.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path  = require('path');
const axios = require('axios');
const fs    = require('fs');

const BASE = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;

// ── File paths (edit these or set env vars) ───────────────────
const OT_FILE    = process.env.OT_FILE    || path.join(__dirname, '../../ot_data 1.json');
const IT_FILE    = process.env.IT_FILE    || path.join(__dirname, '../../it_data 1.json');
const MAINT_FILE = process.env.MAINT_FILE || path.join(__dirname, '../../maintenance_logs 1.json');

async function loadFile(filePath, endpoint, batchSize = 50) {
  if (!fs.existsSync(filePath)) {
    console.log(`  File not found: ${filePath} — skipping`);
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`  Loaded ${data.length} records from ${path.basename(filePath)}`);

  let total = 0;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    try {
      const res = await axios.post(`${BASE}${endpoint}`, batch, { timeout: 30000 });
      total += res.data.count || batch.length;
      process.stdout.write(`\r  Sent ${total}/${data.length}...`);
    } catch (e) {
      console.error(`\n  Batch failed: ${e.message}`);
    }
  }
  console.log(`\n  ✅ Loaded ${total} records`);
  return total;
}

async function main() {
  console.log('\n📦 AION Sample Data Loader');
  console.log(`   Target: ${BASE}\n`);

  // Wait for gateway
  for (let i = 0; i < 10; i++) {
    try { await axios.get(`${BASE}/health`, { timeout: 1000 }); break; }
    catch { process.stdout.write('.'); await new Promise(r => setTimeout(r, 1000)); }
  }
  console.log('\n');

  console.log('Loading OT Data...');
  await loadFile(OT_FILE, '/api/ingest/ot/batch');

  console.log('Loading IT Data...');
  await loadFile(IT_FILE, '/api/ingest/it/batch');

  console.log('Loading Maintenance Logs...');
  // Maintenance logs are single records, not batch — send individually
  if (fs.existsSync(MAINT_FILE)) {
    const logs = JSON.parse(fs.readFileSync(MAINT_FILE, 'utf8'));
    let ok = 0;
    for (const log of logs.slice(0, 100)) { // load first 100
      try {
        await axios.post(`${BASE}/api/ingest/maintenance`, log, { timeout: 5000 });
        ok++;
      } catch {}
      if (ok % 10 === 0) process.stdout.write(`\r  Sent ${ok}/${Math.min(100, logs.length)}...`);
    }
    console.log(`\n  ✅ Loaded ${ok} maintenance logs`);
  }

  console.log('\n✅ Sample data load complete!\n');
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
