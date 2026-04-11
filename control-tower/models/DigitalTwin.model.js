'use strict';
const mongoose = require('mongoose');

const KPISchema = new mongoose.Schema({
  overall_efficiency: { type: Number },
  availability:       { type: Number },
  oee:                { type: Number },
  mtbf_hours:         { type: Number },
  mttr_hours:         { type: Number },
}, { _id: false });

const EquipmentStateSchema = new mongoose.Schema({
  equipment_id:         { type: String, required: true },
  equipment_type:       { type: String },
  health_score:         { type: Number, min: 0, max: 100, default: 100 },
  status:               { type: String, enum: ['NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE'], default: 'NORMAL' },
  last_reading:         { type: mongoose.Schema.Types.Mixed },
  last_updated:         { type: Date },
  failure_probability:  { type: Number, min: 0, max: 1, default: 0 },
  predicted_failure_at: { type: Date, default: null },
  active_alerts:        [String],
  maintenance_due:      { type: Boolean, default: false },
  maintenance_due_date: { type: Date, default: null },
  anomaly_count_24h:    { type: Number, default: 0 },
  uptime_pct:           { type: Number, default: 100 },
}, { _id: false });

const DigitalTwinSchema = new mongoose.Schema({
  plant_id:   { type: String, required: true, unique: true },
  plant_name: { type: String },
  status:     { type: String, enum: ['NOMINAL', 'DEGRADED', 'CRITICAL'], default: 'NOMINAL' },
  equipment:  { type: Map, of: EquipmentStateSchema, default: {} },
  kpis:       { type: KPISchema, default: {} },
  last_updated: { type: Date, default: Date.now },
  simulation_mode: { type: Boolean, default: false },
  simulation_scenario: { type: String, default: null },
}, {
  timestamps: true,
  collection: 'digital_twins',
});

module.exports = mongoose.model('DigitalTwin', DigitalTwinSchema);
