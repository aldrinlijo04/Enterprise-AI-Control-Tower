'use strict';
const mongoose = require('mongoose');

const OTDataSchema = new mongoose.Schema({
  timestamp:    { type: Date,   required: true, index: true },
  plant_id:     { type: String, required: true, index: true },
  equipment_id: { type: String, required: true, index: true },
  temperature:  { type: Number },
  pressure:     { type: Number },
  flow_rate:    { type: Number },
  vibration:    { type: Number },
  rpm:          { type: Number },
  bearing_temp: { type: Number },
  oil_level_pct:{ type: Number },
  voltage:      { type: Number },
  current_a:    { type: Number },
  power_kw:     { type: Number },
  power_factor: { type: Number },
  noise_db:     { type: Number },
  // Enrichment fields added during ingestion
  anomaly_score:   { type: Number, default: null },
  is_anomalous:    { type: Boolean, default: false },
  health_score:    { type: Number, default: null },
}, {
  timestamps: true,
  collection: 'ot_data',
});

OTDataSchema.index({ plant_id: 1, equipment_id: 1, timestamp: -1 });

module.exports = mongoose.model('OTData', OTDataSchema);
