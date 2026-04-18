import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  AgentRunRequest,
  AgentRunResponse,
  ApprovalItem,
  DashboardSummary,
  ProjectSummary
} from '../models';

const runtimeEnv = (window as Window & { __env?: Record<string, string> }).__env;

export interface VoiceConfigResponse {
  agent_id: string;
  has_api_key: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = (runtimeEnv?.['FINPILOT_API_URL'] || 'http://localhost:8010/api').replace(/\/$/, '');

  getDashboardSummary(projectIds?: string[]) {
    return this.http.get<DashboardSummary>(`${this.baseUrl}/dashboard/summary`);
  }

  getProjects() {
    return this.http.get<{ items: ProjectSummary[] }>(`${this.baseUrl}/projects`);
  }

  runAgent(payload: AgentRunRequest) {
    return this.http.post<AgentRunResponse>(`${this.baseUrl}/agent/run`, payload);
  }

  getApprovals(status?: string) {
    const url = status ? `${this.baseUrl}/approvals?status=${status}` : `${this.baseUrl}/approvals`;
    return this.http.get<{ items: ApprovalItem[] }>(url);
  }

  actOnApproval(payload: { approval_id: string; action: 'approve' | 'reject' | 'escalate'; actor: string; comment?: string }) {
    return this.http.post<{ item: ApprovalItem }>(`${this.baseUrl}/approvals/action`, payload);
  }

  getExceptions(module?: string, status?: string, projectIds?: string[]) {
    const params = new URLSearchParams();
    if (module) params.set('module', module);
    if (status) params.set('status', status);
    const qs = params.toString();
    return this.http.get<{ items: Array<Record<string, unknown>> }>(`${this.baseUrl}/exceptions${qs ? `?${qs}` : ''}`);
  }

  getIssueActionBoard(limit = 25) {
    return this.http.get<{ items: Array<Record<string, unknown>> }>(`${this.baseUrl}/issue-action-board?limit=${limit}`);
  }

  getWorkflowTimeline(limit?: number, projectIds?: string[]) {
    let url = `${this.baseUrl}/workflow/timeline`;

    const params: string[] = [];

    if (limit) params.push(`limit=${limit}`);
    if (projectIds?.length) {
      projectIds.forEach(id => params.push(`project_id=${id}`));
    }

    if (params.length) {
      url += `?${params.join('&')}`;
    }

    return this.http.get<any>(url);
  }

  getVoiceConfig() {
    return this.http.get<VoiceConfigResponse>(`${this.baseUrl}/voice/config`);
  }
}
