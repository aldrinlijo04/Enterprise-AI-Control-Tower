export type ModuleName =
  | 'financial_close'
  | 'poc_accounting'
  | 'revenue_recognition'
  | 'capital_allocation';

export interface DashboardSummary {
  metadata: Record<string, unknown>;
  counts: Record<string, number>;
  open_exception_summary: Record<string, number>;
  latest_runtime_events: Array<Record<string, unknown>>;
}

export interface AgentRunRequest {
  query: string;
  requested_module?: ModuleName;
  user_role?: string;
  entity?: string;
  contract_id?: string;
  project_id?: string;
  customer?: string;
  scenario?: Record<string, unknown>;
  use_llm_summary?: boolean;
}

export interface AgentRunResponse {
  route: string;
  module: ModuleName;
  narrative: string;
  result: Record<string, unknown>;
  approval: Record<string, unknown>;
  audit_event: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}