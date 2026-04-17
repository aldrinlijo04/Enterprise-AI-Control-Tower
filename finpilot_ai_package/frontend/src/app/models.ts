export type ModuleName =
  | 'financial_close'
  | 'revenue_recognition'
  | 'poc_accounting'
  | 'capital_allocation'
  | 'portfolio_general';

export interface AgentRunRequest {
  query: string;
  requested_module?: ModuleName;
  user_role?: string;
  entity?: string | null;
  contract_id?: string | null;
  project_id?: string | null;
  project_ids?: string[] | null;
  customer?: string | null;
  scenario?: Record<string, unknown>;
  use_llm_summary?: boolean;
}

export interface WorkflowPayload {
  decision: string;
  threshold: string;
  next_action: string;
  approval_item?: Record<string, unknown> | null;
  timeline: Array<Record<string, unknown>>;
  audit_entry: Record<string, unknown>;
}

export interface AgentRunResponse {
  route: string;
  module: ModuleName | string;
  narrative: string;
  result: Record<string, unknown>;
  workflow: WorkflowPayload;
}

export interface DashboardSummary {
  metadata: Record<string, unknown>;
  counts: Record<string, number>;
  pending_approvals: number;
  top_issue_actions: Array<Record<string, unknown>>;
  recent_workflow_events: Array<Record<string, unknown>>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ApprovalItem {
  approval_id: string;
  module: string;
  reference: string;
  recommended_owner: string;
  recommended_action: string;
  amount_usd: number;
  confidence_score: number;
  risk_level: string;
  status: string;
  created_at: string;
  acted_at?: string;
  acted_by?: string;
  comment?: string;
}

export interface ProjectSummary {
  project_id: string;
  project_name: string;
  country: string;
  region: string;
  business_unit: string;
  capex_usd: number;
  completion_pct: number;
  delay_days: number;
  forecast_variance_pct: number;
  risk_level: string;
  status: string;
  project_controller: string;
}

export interface ProjectItem {
  project_id: string;
  project_name: string;
  country: string;
  region: string;
  business_unit: string;
  capex_usd: number;
  completion_pct: number;
  delay_days: number;
  forecast_variance_pct: number;
  risk_level: string;
  status: string;
  project_controller: string;
}