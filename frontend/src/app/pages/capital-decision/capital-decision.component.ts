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
import { Chart, ChartConfiguration, registerables } from 'chart.js';

import { ApiService } from '../../services/api.service';
import { AgentRunResponse } from '../../models';
import { UsecaseChatComponent } from '../../shared/usecase-chat/usecase-chat.component';

Chart.register(...registerables);

@Component({
  selector: 'app-capital-decision',
  standalone: true,
  imports: [CommonModule, UsecaseChatComponent],
  templateUrl: './capital-decision.component.html',
  styleUrl: './capital-decision.component.css'
})
export class CapitalDecisionComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);

  @ViewChild('capitalChart') capitalChartRef?: ElementRef<HTMLCanvasElement>;

  response = signal<AgentRunResponse | null>(null);
  private chart?: Chart;
  private pendingScenario: Record<string, number> | null = null;

  scenario = {
    carbon_price: 120,
    tax_credit_passes: true,
    capex: 800000000
  };

  ngOnInit(): void {
    this.api.runAgent({
      query: 'Analyze NEOM Phase 2 under carbon price 120 and summarize the leadership recommendation.',
      requested_module: 'capital_allocation',
      project_id: 'NEOM Phase 2',
      user_role: 'cfo',
      scenario: this.scenario,
      use_llm_summary: true
    }).subscribe({
      next: (res) => {
        this.response.set(res);
        this.pendingScenario = (res.result['scenario_result'] as Record<string, number>) || {};
        this.renderChartIfReady();
      }
    });
  }

  ngAfterViewInit(): void {
    this.renderChartIfReady();
  }

  private renderChartIfReady(): void {
    if (!this.capitalChartRef || !this.pendingScenario) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const scenarioResult = this.pendingScenario;

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: ['IRR', 'NPV / 1M', 'Cash Proxy / 1M'],
        datasets: [
          {
            label: 'Scenario Metrics',
            data: [
              scenarioResult['irr_pct'] || 0,
              (scenarioResult['npv_usd'] || 0) / 1000000,
              (scenarioResult['annual_cashflow_proxy_usd'] || 0) / 1000000
            ],
            backgroundColor: [
              'rgba(40, 124, 255, 0.7)',
              'rgba(26, 188, 116, 0.7)',
              'rgba(255, 159, 64, 0.7)'
            ],
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#eaf1f7' }
          }
        },
        scales: {
          x: {
            ticks: { color: '#9db0bf' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            ticks: { color: '#9db0bf' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    };

    this.chart = new Chart(this.capitalChartRef.nativeElement, config);
  }

  getValue(key: string): string {
    const scenarioResult = (this.response()?.result['scenario_result'] as Record<string, unknown>) || {};
    const value = scenarioResult[key];
    return value === undefined || value === null ? '-' : String(value);
  }
}