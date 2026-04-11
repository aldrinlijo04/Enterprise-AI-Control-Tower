'use strict';
/**
 * Realistic sensor & business data generators
 * Matches actual schema from ot_data.json, it_data.json, maintenance_logs.json
 */

const PLANTS = ['PLANT_A', 'PLANT_B', 'PLANT_C'];
const EQUIPMENT = {
  PLANT_A: ['PUMP_01', 'PUMP_02', 'VALVE_01', 'MOTOR_01', 'TURB_01'],
  PLANT_B: ['COMP_01', 'COMP_02', 'PUMP_01', 'HEAT_01', 'FAN_01'],
  PLANT_C: ['COMP_02', 'VALVE_01', 'HEAT_01', 'PUMP_01', 'MOTOR_02'],
};
const EQUIPMENT_TYPES = {
  PUMP_01: 'Pump', PUMP_02: 'Pump',
  COMP_01: 'Compressor', COMP_02: 'Compressor',
  VALVE_01: 'Control Valve',
  MOTOR_01: 'Motor', MOTOR_02: 'Motor',
  TURB_01: 'Turbine',
  HEAT_01: 'Heat Exchanger',
  FAN_01: 'Fan',
};
const PRODUCTS   = ['SOL_Z', 'CHEM_Y', 'RESIN_C', 'GAS_X', 'POLY_A'];
const SUPPLIERS  = ['SUP_001', 'SUP_002', 'SUP_003', 'SUP_004'];
const DEST       = ['Mumbai', 'Pune', 'Hyderabad', 'Delhi', 'Chennai'];
const MODES      = ['Air', 'Rail', 'Road', 'Sea'];
const SEASONS    = ['Summer', 'Winter', 'Monsoon'];

function rand(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function gauss(mean, std) {
  // Box-Muller transform
  const u1 = Math.random(), u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── OT Data Generator ─────────────────────────────────────────────────────
function generateOTRecord(opts = {}) {
  const plant_id     = opts.plant_id     || pick(PLANTS);
  const equipment_id = opts.equipment_id || pick(EQUIPMENT[plant_id]);
  const anomalous    = opts.anomalous    || (Math.random() < 0.08); // 8% anomaly rate

  const base = {
    timestamp:    opts.timestamp || new Date().toISOString(),
    plant_id,
    equipment_id,
    temperature:  anomalous ? rand(130, 175) : rand(60, 125),
    pressure:     anomalous ? rand(210, 260) : rand(80, 205),
    flow_rate:    anomalous ? rand(2, 8)     : rand(15, 55),
    vibration:    anomalous ? rand(0.12, 0.35): rand(0.01, 0.10),
    rpm:          anomalous ? rand(300, 700) : rand(900, 1750),
    bearing_temp: anomalous ? rand(160, 210) : rand(50, 155),
    oil_level_pct:anomalous ? rand(5, 18)   : rand(25, 95),
    voltage:      rand(210, 235),
    current_a:    rand(50, 230),
    power_kw:     rand(80, 580),
    power_factor: rand(0.78, 0.99),
    noise_db:     anomalous ? rand(90, 115) : rand(50, 85),
  };

  // Gaussian noise on normal readings
  if (!anomalous) {
    base.temperature  = Math.max(20,  parseFloat(gauss(base.temperature,  5).toFixed(2)));
    base.vibration    = Math.max(0.001,parseFloat(gauss(base.vibration,   0.01).toFixed(4)));
    base.bearing_temp = Math.max(40,  parseFloat(gauss(base.bearing_temp, 5).toFixed(2)));
  }

  base._anomalous = anomalous; // internal flag (stripped before sending to DB)
  return base;
}

// ─── IT Data Generator ────────────────────────────────────────────────────
let _orderId = 2000;
function generateITRecord(opts = {}) {
  const plant_id        = opts.plant_id || pick(PLANTS);
  const demand_forecast = rand(500, 3000, 0);
  const actual_prod     = Math.round(demand_forecast * rand(0.85, 1.15));
  const inventory       = Math.round(rand(200, 2000));
  const reorder_pt      = Math.round(rand(200, 700));
  const deadline        = new Date(Date.now() + rand(5, 25, 0) * 86400000);

  return {
    timestamp:             opts.timestamp || new Date().toISOString(),
    order_id:              `ORD${_orderId++}`,
    plant_id,
    product:               pick(PRODUCTS),
    demand_forecast,
    actual_production:     actual_prod,
    inventory_level:       inventory,
    reorder_point:         reorder_pt,
    stockout_risk:         inventory < reorder_pt ? 'HIGH' : inventory < reorder_pt * 1.5 ? 'MEDIUM' : 'LOW',
    delivery_deadline:     deadline.toISOString().split('T')[0],
    priority:              pick(['HIGH', 'MEDIUM', 'LOW']),
    order_status:          pick(['In-Production', 'Dispatched', 'Delayed', 'Pending', 'Completed']),
    supplier_id:           pick(SUPPLIERS),
    lead_time_days:        rand(2, 15, 0),
    destination:           pick(DEST),
    transport_mode:        pick(MODES),
    price_per_unit_INR:    rand(100, 500),
    estimated_revenue_INR: parseFloat((demand_forecast * rand(100, 500)).toFixed(2)),
    forecast_accuracy_pct: rand(70, 100),
    batch_quality_score:   rand(0.80, 0.99),
    rejection_rate_pct:    rand(1, 12),
    promotion_active:      Math.random() < 0.3 ? 1 : 0,
    season:                pick(SEASONS),
  };
}

// ─── Maintenance Log Generator ────────────────────────────────────────────
const MAINT_TEMPLATES = [
  'Lubrication failure suspected. Oil viscosity degraded significantly.',
  'Thermal imaging inspection done. Hot spot identified near junction box.',
  'Pressure buildup beyond safe zone. Relief valve activated automatically.',
  'Current draw 20% above baseline. Electrical team reviewing wiring.',
  'Seal leak detected during shift check. Maintenance team scheduled.',
  'Vibration levels elevated. Bearing inspection recommended.',
  'Temperature spike detected. Cooling system check required.',
  'Oil level critically low. Immediate top-up required.',
  'Running within normal parameters. Next scheduled service in 25 days.',
  'Noise levels above threshold. Mechanical inspection scheduled.',
];
const TECHNICIANS = ['Ravi Shankar', 'Ahmed Hassan', 'Priya Kumar', 'Li Wei', 'Sara Jones'];
const MAINT_TYPES = ['Predictive', 'Preventive', 'Corrective'];
const ACTIONS     = ['Shutdown initiated', 'Sensor recalibrated', 'Immediate repair done', 'No action required', 'Parts ordered'];

function generateMaintenanceLog(opts = {}) {
  const plant_id     = opts.plant_id     || pick(PLANTS);
  const equipment_id = opts.equipment_id || pick(EQUIPMENT[plant_id]);
  return {
    equipment_id,
    plant_id,
    equipment_type:   EQUIPMENT_TYPES[equipment_id] || 'Unknown',
    log_text:         pick(MAINT_TEMPLATES).replace('EQUIP', equipment_id),
    date:             opts.date || new Date().toISOString().split('T')[0],
    severity_tag:     pick(['HIGH', 'MEDIUM', 'LOW']),
    logged_by:        pick(TECHNICIANS),
    maintenance_type: pick(MAINT_TYPES),
    action_taken:     pick(ACTIONS),
    follow_up_required: Math.random() < 0.5,
  };
}

// ─── Batch generators ─────────────────────────────────────────────────────
function generateOTBatch(count = 10, opts = {}) {
  return Array.from({ length: count }, (_, i) =>
    generateOTRecord({ ...opts, timestamp: new Date(Date.now() - (count - i) * 60000).toISOString() })
  );
}

function generateITBatch(count = 5, opts = {}) {
  return Array.from({ length: count }, (_, i) =>
    generateITRecord({ ...opts, timestamp: new Date(Date.now() - (count - i) * 60000).toISOString() })
  );
}

module.exports = {
  generateOTRecord,
  generateITRecord,
  generateMaintenanceLog,
  generateOTBatch,
  generateITBatch,
  PLANTS,
  EQUIPMENT,
  EQUIPMENT_TYPES,
};
