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
  selector: 'app-contract-review',
  standalone: true,
  imports: [CommonModule, UsecaseChatComponent],
  templateUrl: './contract-review.component.html',
  styleUrl: './contract-review.component.css'
})
export class ContractReviewComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);

  @ViewChild('contractChart') contractChartRef?: ElementRef<HTMLCanvasElement>;

  response = signal<AgentRunResponse | null>(null);
  private chart?: Chart;
  private pendingEval: Record<string, number> | null = null;

  ngOnInit(): void {
    this.api.runAgent({
      query: 'Review Samsung take-or-pay shortfall treatment and summarize the recommended revenue action.',
      requested_module: 'revenue_recognition',
      contract_id: 'TOP-SAMSUNG-001',
      customer: 'Samsung',
      user_role: 'revenue_accountant',
      scenario: {},
      use_llm_summary: true
    }).subscribe({
      next: (res) => {
        this.response.set(res);
        this.pendingEval = (res.result['evaluation'] as Record<string, number>) || {};
        this.renderChartIfReady();
      }
    });
  }

  ngAfterViewInit(): void {
    this.renderChartIfReady();
  }

  private renderChartIfReady(): void {
    if (!this.contractChartRef || !this.pendingEval) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const evalData = this.pendingEval;

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: ['Committed', 'Actual', 'Shortfall'],
        datasets: [
          {
            label: 'Volume',
            data: [
              evalData['committed_volume_cuft'] || 0,
              evalData['actual_volume_cuft'] || 0,
              evalData['shortfall_volume_cuft'] || 0
            ],
            backgroundColor: [
              'rgba(40, 124, 255, 0.72)',
              'rgba(26, 188, 116, 0.72)',
              'rgba(255, 159, 64, 0.72)'
            ],
            borderRadius: 10
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

    this.chart = new Chart(this.contractChartRef.nativeElement, config);
  }

  getValue(key: string): string {
    const evalData = (this.response()?.result['evaluation'] as Record<string, unknown>) || {};
    const value = evalData[key];

    if (value === undefined || value === null) return '-';
    if (typeof value === 'number' && key.includes('_usd')) {
      return this.formatMoney(value);
    }
    return String(value);
  }

  aiPoints(): string[] {
    const evalData = (this.response()?.result['evaluation'] as Record<string, unknown>) || {};
    return [
      `Recognized revenue is currently ${this.getValue('recognized_revenue_usd')}, which is the main accounting outcome in scope.`,
      `Treatment risk is ${String(evalData['risk_level'] ?? 'unknown')}, so clause defensibility should be checked before sign-off.`,
      `The applied rule is ${String(evalData['rule_or_clause_used'] ?? 'not available')}, which should anchor audit support.`
    ];
  }

  private formatMoney(value: number): string {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B USD`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M USD`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K USD`;
    return `${value.toFixed(0)} USD`;
  }
}