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

    this.chart = new Chart(this.contractChartRef.nativeElement, config);
  }

  getValue(key: string): string {
    const evalData = (this.response()?.result['evaluation'] as Record<string, unknown>) || {};
    const value = evalData[key];
    return value === undefined || value === null ? '-' : String(value);
  }
}