'use strict';
const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  alert_id:     { type: String, required: true, unique: true },
  plant_id:     { type: String, required: true, index: true },
  equipment_id: { type: String, index: true },
  alert_type:   { type: String, enum: ['ANOMALY', 'MAINTENANCE', 'PRODUCTION', 'SAFETY', 'QUALITY'], required: true },
  severity:     { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], required: true },
  title:        { type: String, required: true },
  message:      { type: String, required: true },
  metric:       { type: String },
  metric_value: { type: Number },
  threshold:    { type: Number },
  status:       { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'], default: 'OPEN' },
  resolved_at:  { type: Date, default: null },
  source_data:  { type: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
  collection: 'alerts',
});

AlertSchema.index({ plant_id: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', AlertSchema);
