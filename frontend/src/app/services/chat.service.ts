import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from './api.service';
import { AgentOrchestrationResponse, ChatMessage } from '../models/plant.models';

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'ARIA online. I\'m monitoring 7 AI models across your plant fleet — ' +
    'forecasting, demand, energy, anomaly detection, plant behavior, ' +
    'predictive maintenance, and failure prediction. Ask me anything.',
};

@Injectable({ providedIn: 'root' })
export class ChatService {
  private messages$ = new BehaviorSubject<ChatMessage[]>([INITIAL_MESSAGE]);
  private loading$  = new BehaviorSubject<boolean>(false);

  readonly messages = this.messages$.asObservable();
  readonly loading  = this.loading$.asObservable();

  constructor(private api: ApiService) {}

  send(message: string): void {
    if (!message.trim()) return;
    const history = this.messages$.value.map(m => ({ role: m.role, content: m.content }));
    this.messages$.next([...this.messages$.value, { role: 'user', content: message }]);
    this.loading$.next(true);

    this.api.sendChat(message, history).subscribe({
      next: (res) => {
        this.messages$.next([...this.messages$.value, { role: 'assistant', content: res.reply }]);
        this.loading$.next(false);
      },
      error: () => {
        this.messages$.next([
          ...this.messages$.value,
          { role: 'assistant', content: 'Connection error. Please verify the backend is running on port 8000.' }
        ]);
        this.loading$.next(false);
      }
    });
  }

  sendVoice(audioB64: string): void {
    this.loading$.next(true);
    this.api.transcribeAudio(audioB64).subscribe({
      next: (res) => {
        this.loading$.next(false);
        if (res.text) {
          this.send(res.text);
        } else {
          this.send('(voice transcription returned empty — please type your question)');
        }
      },
      error: () => {
        this.loading$.next(false);
        this.send('(voice transcription failed — please type your question)');
      }
    });
  }

  runMultiAgentBriefing(agentIds: string[] = [], scopeLabel = 'All agents'): void {
    if (this.loading$.value) return;

    this.loading$.next(true);

    this.api.orchestrateAgents({
      query: `Provide a concise executive plant briefing with highest-priority findings and actionable recommendations for scope: ${scopeLabel}.`,
      agent_ids: agentIds,
      include_internal: false,
      mode: 'analyze',
      history: [],
    }).subscribe({
      next: (res) => {
        const content = this.formatMultiAgentBriefing(res, scopeLabel);
        this.messages$.next([...this.messages$.value, { role: 'assistant', content }]);
        this.loading$.next(false);
      },
      error: () => {
        this.messages$.next([
          ...this.messages$.value,
          {
            role: 'assistant',
            content: '⚠️ MULTI-AGENT BRIEFING\n**Finding:** Could not fetch consolidated agent output.\n**Data:** The orchestrate endpoint call failed.\n**Action:** Verify backend /api/agents/orchestrate availability and retry.',
          }
        ]);
        this.loading$.next(false);
      }
    });
  }

  private formatMultiAgentBriefing(res: AgentOrchestrationResponse, scopeLabel: string): string {
    const results = res?.results ?? [];
    const overall = String(res?.overall_priority ?? 'medium').toUpperCase();
    const llmUsed = Number(res?.llm_used_count ?? 0);
    const requested = (res?.requested_agents ?? []).join(', ');

    const lines: string[] = [
      '📊 MULTI-AGENT BRIEFING',
      `**Finding:** Overall plant priority is ${overall}.`,
      `**Data:** Scope ${scopeLabel} | Agents run: ${results.length} | LLM-backed: ${llmUsed}/${results.length}.`,
      '**Action:** Execute the top recommendation from each agent in priority order.',
    ];

    if (requested) {
      lines.push(`**Data:** Requested agents: ${requested}.`);
    }

    for (const item of results) {
      const name = this.compact(item.agent_name || item.agent_id || 'Agent', 60).toUpperCase();
      const summary = this.compact(item.summary || 'No summary available.', 200);
      const topAction = this.compact((item.actions && item.actions[0]) || 'No action provided.', 180);
      const confidence = Number(item.confidence ?? 0);
      const confidencePct = Number.isFinite(confidence) ? Math.round(confidence * 100) : 0;

      lines.push('');
      lines.push(`${this.agentEmoji(item.agent_id)} ${name}`);
      lines.push(`**Finding:** ${summary}`);
      lines.push(`**Data:** Priority ${String(item.priority || 'medium').toUpperCase()} | Confidence ${confidencePct}%.`);
      lines.push(`**Action:** ${topAction}`);
    }

    return lines.join('\n');
  }

  private compact(text: string, maxLen: number): string {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, maxLen - 1)}…`;
  }

  private agentEmoji(agentId?: string): string {
    switch (agentId) {
      case 'operations-intelligence':
        return '⚠️';
      case 'predictive-maintenance':
        return '🔧';
      case 'energy-optimizer':
        return '⚡';
      case 'demand-planner':
        return '📊';
      default:
        return '✅';
    }
  }

  clear(): void {
    this.messages$.next([INITIAL_MESSAGE]);
  }
}