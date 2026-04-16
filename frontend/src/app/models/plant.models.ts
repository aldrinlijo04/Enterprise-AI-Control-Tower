export interface PlantSnapshot {
  plant_id: string;
  equipment_id: string;
  temperature: number;
  pressure: number;
  vibration: number;
  power_kw: number;
  last_log: string;
  log_severity: string;
  timestamp: string;
}

export interface ForecastSteps {
  temperature: number[];
  pressure: number[];
  power_kw: number[];
}

export interface ForecastingReport {
  forecast_10_steps: ForecastSteps;
  trend: Record<string, string>;
}

export interface ProductDemand {
  avg_forecast: number;
  avg_actual: number;
  stockout_risk_pct: number;
}

export interface DemandReport {
  mean_absolute_error_pct: number;
  by_product: Record<string, ProductDemand>;
}

export interface EquipmentEnergy {
  avg_kw: number;
  peak_kw: number;
  efficiency_pct: number;
}

export interface EnergyReport {
  total_energy_kwh: number;
  carbon_emission_kg: number;
  energy_cost_INR: number;
  avg_predicted_kw: number;
  avg_waste_kw: number;
  by_equipment: Record<string, EquipmentEnergy>;
}

export interface AnomalyEquipment {
  anomaly_count: number;
  anomaly_rate_pct: number;
}

export interface AnomalyReport {
  total_anomalies: number;
  anomaly_rate_pct: number;
  by_equipment: Record<string, AnomalyEquipment>;
}

export interface PlantBehaviorReport {
  behavior_distribution: Record<string, string>;
  critical_events: number;
}

export interface MaintenanceEquipment {
  min_rul_hrs: number;
  avg_rul_hrs: number;
  dominant_risk: string;
}

export interface AttentionItem {
  equipment_id: string;
  min_rul: number;
}

export interface MaintenanceReport {
  avg_rul_hours: number;
  risk_distribution: Record<string, number>;
  by_equipment: Record<string, MaintenanceEquipment>;
  equipment_needing_attention: AttentionItem[];
}

export interface FailureReport {
  imminent_failures: number;
  avg_failure_probability: number;
  fleet_health: Record<string, number>;
  critical_equipment: Record<string, number>;
  maintenance_logs_high_severity: number;
}

export interface PlantReport {
  forecasting: ForecastingReport;
  demand: DemandReport;
  energy: EnergyReport;
  anomaly: AnomalyReport;
  plant_behavior: PlantBehaviorReport;
  maintenance: MaintenanceReport;
  failure: FailureReport;
}

export interface AnomalyRow {
  timestamp: string;
  equipment_id: string;
  plant_id: string;
  temperature: number;
  pressure: number;
  vibration: number;
  anomaly_score: number;
}

export interface MaintenanceRow {
  timestamp: string;
  equipment_id: string;
  plant_id: string;
  rul_hours: number;
  risk_level: string;
}

export interface FailureRow {
  timestamp: string;
  equipment_id: string;
  plant_id: string;
  failure_label: string;
  failure_prob: number;
  failure_horizon: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AgentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface AgentRunResult {
  agent_id: string;
  agent_name: string;
  mode: 'ask' | 'analyze' | string;
  query: string;
  summary: string;
  findings: string[];
  actions: string[];
  priority: AgentPriority | string;
  confidence: number;
  assumptions: string[];
  llm_used: boolean;
  model: string;
  internal?: Record<string, unknown>;
}

export interface AgentOrchestrationRequest {
  query?: string;
  history?: ChatMessage[];
  agent_ids?: string[];
  include_internal?: boolean;
  mode?: 'ask' | 'analyze';
}

export interface AgentOrchestrationResponse {
  mode: 'ask' | 'analyze' | string;
  query: string;
  requested_agents: string[];
  overall_priority: AgentPriority | string;
  llm_used_count: number;
  fallback_count: number;
  results: AgentRunResult[];
}

export const RISK_COLOR: Record<string, string> = {
  CRITICAL:          '#ff3b5c',
  HIGH:              '#ff8c42',
  HIGH_RISK:         '#ff8c42',
  MEDIUM:            '#ffd166',
  LOW:               '#00c853',
  IMMINENT:          '#ff3b5c',
  MODERATE:          '#ffd166',
  HEALTHY:           '#00c853',
  NORMAL:            '#00c853',
  SURGE:             '#ff8c42',
  OVERCAPACITY:      '#ffd166',
  UNDERPERFORMANCE:  '#a0aec0',
  CASCADE_FAULT:     '#ff3b5c',
};
