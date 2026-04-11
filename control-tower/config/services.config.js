'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

module.exports = {
  anomaly:     process.env.ANOMALY_SERVICE_URL     || 'http://localhost:8001',
  forecasting: process.env.FORECASTING_SERVICE_URL || 'http://localhost:8002',
  maintenance: process.env.MAINTENANCE_SERVICE_URL || 'http://localhost:8003',
  ingestion:   process.env.INGESTION_SERVICE_URL   || 'http://localhost:3001',
  twin:        process.env.TWIN_SERVICE_URL         || 'http://localhost:3002',
  decision:    process.env.DECISION_SERVICE_URL     || 'http://localhost:3004',

  // OT sensor thresholds per metric (for fallback rule-based anomaly detection)
  otThresholds: {
    temperature:  { min: 20,  max: 130 },
    pressure:     { min: 50,  max: 210 },
    flow_rate:    { min: 5,   max: 60  },
    vibration:    { min: 0,   max: 0.12},
    rpm:          { min: 800, max: 1800},
    bearing_temp: { min: 40,  max: 160 },
    oil_level_pct:{ min: 20,  max: 100 },
    voltage:      { min: 190, max: 240 },
    current_a:    { min: 10,  max: 250 },
    power_kw:     { min: 10,  max: 600 },
    power_factor: { min: 0.7, max: 1.0 },
    noise_db:     { min: 40,  max: 90  },
  },

  // Risk weights for health score calculation
  healthWeights: {
    temperature:   0.20,
    vibration:     0.25,
    bearing_temp:  0.20,
    oil_level_pct: 0.15,
    pressure:      0.10,
    power_factor:  0.10,
  },
};
