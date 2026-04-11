'use strict';
const mongoose = require('mongoose');

const MaintenanceLogSchema = new mongoose.Schema({
  equipment_id:      { type: String, required: true, index: true },
  plant_id:          { type: String, required: true, index: true },
  equipment_type:    { type: String },
  log_text:          { type: String },
  date:              { type: String },
  severity_tag:      { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },
  logged_by:         { type: String },
  maintenance_type:  { type: String, enum: ['Predictive', 'Preventive', 'Corrective'] },
  action_taken:      { type: String },
  follow_up_required:{ type: Boolean, default: false },
  // ML-predicted fields
  failure_probability: { type: Number, default: null },
  predicted_failure_hours: { type: Number, default: null },
}, {
  timestamps: true,
  collection: 'maintenance_logs',
});

module.exports = mongoose.model('MaintenanceLog', MaintenanceLogSchema);
