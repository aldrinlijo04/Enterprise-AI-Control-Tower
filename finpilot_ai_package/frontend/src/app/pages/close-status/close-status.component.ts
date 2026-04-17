import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

import { ApiService } from '../../services/api.service';
import { ProjectContextService } from '../../services/project-context.service';
import { AgentRunResponse } from '../../models';
import { UsecaseChatComponent } from '../../shared/usecase-chat/usecase-chat.component';

Chart.register(...registerables);

@Component({
  selector: 'app-close-status',
  standalone: true,
  imports: [CommonModule, UsecaseChatComponent],
  templateUrl: './close-status.component.html',
  styleUrl: './close-status.component.css'
})
export class CloseStatusComponent implements AfterViewInit {
  private api = inject(ApiService);
  private projectService = inject(ProjectContextService);

  @ViewChild('closeChart') closeChartRef?: ElementRef<HTMLCanvasElement>;

  response = signal<AgentRunResponse | null>(null);
  selectedProjectId = computed(() => this.projectService.getSelectedProject());

  private chart?: Chart;
  private pendingMetrics: Record<string, number> | null = null;

  constructor() {
    effect(() => {
      const projectId = this.selectedProjectId();
      if (projectId) this.loadData(projectId);
    });
  }

  ngAfterViewInit(): void {
    this.renderChartIfReady();
  }

  private loadData(projectId: string): void {
    this.api.runAgent({
      query: `Run month-end close analysis for project ${projectId} and summarize close readiness.`,
      requested_module: 'financial_close',
      project_id: projectId,
      project_ids: [projectId],
      user_role: 'controller',
      scenario: { selected_project_id: projectId },
      use_llm_summary: true
    }).subscribe({
      next: (res) => {
        this.response.set(res);
        this.pendingMetrics = (res.result['close_metrics'] as Record<string, number>) || {};
        this.renderChartIfReady();
      },
      error: () => {
        this.response.set(null);
      }
    });
  }

  private renderChartIfReady(): void {
    if (!this.closeChartRef || !this.pendingMetrics) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const metrics = this.pendingMetrics;

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: ['Auto Post', 'Review', 'Flagged', 'Open'],
        datasets: [
          {
            label: 'Close Mix',
            data: [
              metrics['auto_post_candidates'] || 0,
              metrics['manual_review_candidates'] || 0,
              metrics['flagged_count'] || 0,
              metrics['open_count'] || 0
            ],
            backgroundColor: [
              'rgba(41, 145, 255, 0.78)',
              'rgba(26, 199, 154, 0.78)',
              'rgba(255, 176, 65, 0.78)',
              'rgba(129, 103, 255, 0.78)'
            ],
            borderRadius: 12
          }
        ]
      },
      options: {
  responsive: true,
  maintainAspectRatio: false,

  layout: {
    padding: {
      top: 10,
      bottom: 5
    }
  },

  plugins: {
    legend: {
      labels: {
        color: '#eaf1f7',
        font: {
          size: 11   // 👈 smaller legend
        }
      }
    }
  },

  scales: {
    x: {
      ticks: {
        color: '#9db0bf',
        font: {
          size: 11   // 👈 smaller labels
        }
      },
      grid: {
        color: 'rgba(255,255,255,0.04)'
      }
    },
    y: {
      ticks: {
        color: '#9db0bf',
        font: {
          size: 11
        },
        maxTicksLimit: 5   // 👈 reduces vertical stretch
      },
      grid: {
        color: 'rgba(255,255,255,0.04)'
      }
    }
  }
}
    };

    this.chart = new Chart(this.closeChartRef.nativeElement, config);
  }

  getMetric(key: string): string {
    const metrics = (this.response()?.result['close_metrics'] as Record<string, number>) || {};
    return String(metrics[key] ?? 0);
  }

  aiPoints(): string[] {
    const metrics = (this.response()?.result['close_metrics'] as Record<string, number>) || {};
    const projectId = this.selectedProjectId();

    return [
      `${metrics['manual_review_candidates'] ?? 0} items in ${projectId} currently require controller review.`,
      `${metrics['flagged_count'] ?? 0} flagged items represent the main close-pressure pocket for this project.`,
      `${metrics['auto_post_candidates'] ?? 0} low-friction items are available for faster project close progression.`
    ];
  }

  workflowDecision(): string {
    return this.response()?.workflow?.decision || '—';
  }

  workflowNextAction(): string {
    return this.response()?.workflow?.next_action || '—';
  }

  workflowThreshold(): string {
    return this.response()?.workflow?.threshold || '—';
  }

  workflowTimeline(): Array<Record<string, unknown>> {
    return this.response()?.workflow?.timeline || [];
  }
}