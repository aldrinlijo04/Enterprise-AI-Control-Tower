'use strict';
const mongoose = require('mongoose');

const DecisionSchema = new mongoose.Schema({
  decision_id:  { type: String, required: true, unique: true },
  plant_id:     { type: String, required: true, index: true },
  equipment_id: { type: String },
  alert_id:     { type: String, index: true },
  issue:        { type: String, required: true },
  root_cause:   { type: String },
  prediction:   { type: String },
  action:       { type: String, required: true },
  priority:     { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' },
  confidence:   { type: Number, min: 0, max: 1 },
  estimated_impact: { type: String },
  agent_chain:  [{ agent: String, output: String, timestamp: Date }],
  status:       { type: String, enum: ['PENDING', 'APPROVED', 'EXECUTING', 'DONE', 'REJECTED'], default: 'PENDING' },
  optimized:    { type: Boolean, default: false },
  optimized_action: { type: String },
  source_data:  { type: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
  collection: 'decisions',
});

DecisionSchema.index({ plant_id: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Decision', DecisionSchema);
