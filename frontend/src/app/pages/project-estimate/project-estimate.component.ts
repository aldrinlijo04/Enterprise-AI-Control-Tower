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
  selector: 'app-project-estimate',
  standalone: true,
  imports: [CommonModule, UsecaseChatComponent],
  templateUrl: './project-estimate.component.html',
  styleUrl: './project-estimate.component.css'
})
export class ProjectEstimateComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);

  @ViewChild('estimateChart') estimateChartRef?: ElementRef<HTMLCanvasElement>;

  response = signal<AgentRunResponse | null>(null);
  private chart?: Chart;
  private pendingEstimate: Record<string, number> | null = null;

  ngOnInit(): void {
    this.api.runAgent({
      query: 'Estimate remaining cost for NEOM Phase 2 and summarize the main project risk drivers.',
      requested_module: 'poc_accounting',
      project_id: 'NEOM Phase 2',
      user_role: 'project_controller',
      scenario: {},
      use_llm_summary: true
    }).subscribe({
      next: (res) => {
        this.response.set(res);
        this.pendingEstimate = (res.result['estimate'] as Record<string, number>) || {};
        this.renderChartIfReady();
      }
    });
  }

  ngAfterViewInit(): void {
    this.renderChartIfReady();
  }

  private renderChartIfReady(): void {
    if (!this.estimateChartRef || !this.pendingEstimate) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const estimate = this.pendingEstimate;

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: ['Procurement', 'Market', 'Tracker'],
        datasets: [
          {
            label: 'Impact USD',
            data: [
              estimate['procurement_impact_usd'] || 0,
              estimate['market_impact_usd'] || 0,
              estimate['tracker_impact_usd'] || 0
            ],
            backgroundColor: [
              'rgba(40, 124, 255, 0.7)',
              'rgba(255, 159, 64, 0.7)',
              'rgba(26, 188, 116, 0.7)'
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

    this.chart = new Chart(this.estimateChartRef.nativeElement, config);
  }

  getValue(key: string): string {
    const estimate = (this.response()?.result['estimate'] as Record<string, unknown>) || {};
    const value = estimate[key];
    return value === undefined || value === null ? '-' : String(value);
  }
}