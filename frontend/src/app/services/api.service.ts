import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AgentRunRequest, AgentRunResponse, DashboardSummary } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:8000/api';

  getDashboardSummary() {
    return this.http.get<DashboardSummary>(`${this.baseUrl}/dashboard/summary`);
  }

  runAgent(payload: AgentRunRequest) {
    return this.http.post<AgentRunResponse>(`${this.baseUrl}/agent/run`, payload);
  }
}