import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

import { ApiService } from '../../services/api.service';
import { ProjectContextService } from '../../services/project-context.service';
import { UsecaseChatComponent } from '../../shared/usecase-chat/usecase-chat.component';

Chart.register(...registerables);

@Component({
  selector: 'app-capital-decision',
  standalone: true,
  imports: [CommonModule, FormsModule, UsecaseChatComponent],
  templateUrl: './capital-decision.component.html',
  styleUrl: './capital-decision.component.css'
})
export class CapitalDecisionComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);
  private projectContext = inject(ProjectContextService);

  @ViewChild('capitalChart') capitalChartRef?: ElementRef<HTMLCanvasElement>;

  response = signal<any | null>(null);
  loading = signal(false);

  scenario = {
    capex_delta_pct: 0,
    revenue_delta_pct: 0
  };

  private chart?: Chart;
  private pendingScenarioResult: Record<string, any> | null = null;

  ngOnInit(): void {
    this.runAnalysis();
  }

  ngAfterViewInit(): void {
    this.renderChartIfReady();
  }

  runAnalysis(): void {
    const projectId = this.projectContext.getSelectedProject();

    this.loading.set(true);

    this.api.runAgent({
      query: 'Run capital allocation analysis',
      requested_module: 'capital_allocation',
      project_id: projectId,
      project_ids: this.projectContext.selectedProjectIds(),
      scenario: this.scenario,
      use_llm_summary: true
    }).subscribe({
      next: (res) => {
        this.response.set(res);
        this.pendingScenarioResult = res?.result?.scenario_result || null;
        this.loading.set(false);
        this.renderChartIfReady();
      },
      error: () => {
        this.response.set(null);
        this.pendingScenarioResult = null;
        this.loading.set(false);
        this.destroyChart();
      }
    });
  }

  getValue(key: string): string {
    const data = this.response()?.result?.scenario_result;
    if (!data) return '--';

    const value = data[key];
    if (value === undefined || value === null) return '--';

    if (key === 'irr_pct') {
      return `${value}%`;
    }

    if (key === 'npv_usd' || key === 'annual_cashflow_proxy_usd') {
      return this.formatMoney(value);
    }

    return String(value);
  }

  aiPoints(): string[] {
    const r = this.response()?.result;
    const s = r?.scenario_result;

    if (!r || !s) return [];

    return [
      r.headline || 'Capital allocation analysis completed.',
      `IRR is ${s.irr_pct}% with NPV at ${this.formatMoney(s.npv_usd)}.`,
      `Recommendation is ${s.recommendation}, based on current scenario assumptions.`,
      `Next step: ${this.response()?.workflow?.next_action || 'Review assumptions and proceed with decision routing.'}`
    ];
  }

  private renderChartIfReady(): void {
    if (!this.capitalChartRef || !this.pendingScenarioResult) return;

    const s = this.pendingScenarioResult;
    this.destroyChart();

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: ['IRR', 'NPV (M USD)', 'Cash Proxy (M USD)'],
        datasets: [
          {
            label: 'Capital scenario',
            data: [
              Number(s['irr_pct'] || 0),
              Number((s['npv_usd'] || 0) / 1_000_000),
              Number((s['annual_cashflow_proxy_usd'] || 0) / 1_000_000)
            ],
            backgroundColor: [
              'rgba(45, 140, 255, 0.75)',
              'rgba(24, 216, 116, 0.75)',
              'rgba(255, 163, 67, 0.75)'
            ],
            borderRadius: 10
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 700
        },
        plugins: {
          legend: {
            labels: {
              color: '#eaf3ff'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(8, 18, 32, 0.96)',
            titleColor: '#ffffff',
            bodyColor: '#d9e7f5',
            borderColor: 'rgba(45, 140, 255, 0.28)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#9bb3cc'
            },
            grid: {
              color: 'rgba(255,255,255,0.05)'
            }
          },
          y: {
            ticks: {
              color: '#9bb3cc'
            },
            grid: {
              color: 'rgba(255,255,255,0.06)'
            }
          }
        }
      }
    };

    this.chart = new Chart(this.capitalChartRef.nativeElement, config);
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = undefined;
    }
  }

  private formatMoney(value: number): string {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B USD`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M USD`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K USD`;
    return `${Number(value).toFixed(0)} USD`;
  }
}