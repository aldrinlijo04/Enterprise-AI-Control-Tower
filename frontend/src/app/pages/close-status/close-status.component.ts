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
  selector: 'app-close-status',
  standalone: true,
  imports: [CommonModule, UsecaseChatComponent],
  templateUrl: './close-status.component.html',
  styleUrl: './close-status.component.css'
})
export class CloseStatusComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);

  @ViewChild('closeChart') closeChartRef?: ElementRef<HTMLCanvasElement>;

  response = signal<AgentRunResponse | null>(null);
  private chart?: Chart;
  private pendingMetrics: Record<string, number> | null = null;

  ngOnInit(): void {
    this.api.runAgent({
      query: 'Run month-end close for AirProd Malaysia and summarize close readiness.',
      requested_module: 'financial_close',
      entity: 'AirProd Malaysia',
      user_role: 'controller',
      scenario: {},
      use_llm_summary: true
    }).subscribe({
      next: (res) => {
        this.response.set(res);
        const metrics = (res.result['close_metrics'] as Record<string, number>) || {};
        this.pendingMetrics = metrics;
        this.renderChartIfReady();
      }
    });
  }

  ngAfterViewInit(): void {
    this.renderChartIfReady();
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
            label: 'Close Items',
            data: [
              metrics['auto_post_candidates'] || 0,
              metrics['manual_review_candidates'] || 0,
              metrics['flagged_count'] || 0,
              metrics['open_count'] || 0
            ],
            backgroundColor: [
              'rgba(26, 188, 116, 0.7)',
              'rgba(40, 124, 255, 0.7)',
              'rgba(255, 159, 64, 0.7)',
              'rgba(255, 99, 132, 0.7)'
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

    this.chart = new Chart(this.closeChartRef.nativeElement, config);
  }

  getMetric(key: string): string {
    const metrics = (this.response()?.result['close_metrics'] as Record<string, number>) || {};
    return String(metrics[key] ?? 0);
  }
}