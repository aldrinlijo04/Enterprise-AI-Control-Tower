'use strict';
const mongoose = require('mongoose');

const ITDataSchema = new mongoose.Schema({
  timestamp:             { type: Date,   required: true },
  order_id:              { type: String, required: true, unique: true },
  plant_id:              { type: String, required: true, index: true },
  product:               { type: String },
  demand_forecast:       { type: Number },
  actual_production:     { type: Number },
  inventory_level:       { type: Number },
  reorder_point:         { type: Number },
  stockout_risk:         { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },
  delivery_deadline:     { type: String },
  priority:              { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },
  order_status:          { type: String },
  supplier_id:           { type: String },
  lead_time_days:        { type: Number },
  destination:           { type: String },
  transport_mode:        { type: String },
  price_per_unit_INR:    { type: Number },
  estimated_revenue_INR: { type: Number },
  forecast_accuracy_pct: { type: Number },
  batch_quality_score:   { type: Number },
  rejection_rate_pct:    { type: Number },
  promotion_active:      { type: Number },
  season:                { type: String },
}, {
  timestamps: true,
  collection: 'it_data',
});

module.exports = mongoose.model('ITData', ITDataSchema);
