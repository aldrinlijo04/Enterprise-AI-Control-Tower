import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ProjectContextService } from '../../services/project-context.service';
import { DashboardSummary, ProjectSummary } from '../../models';

type OverviewCard = {
  label: string;
  value: string;
  note: string;
};

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css'
})
export class OverviewComponent implements OnInit {
  private api = inject(ApiService);
  private projectService = inject(ProjectContextService);

  summary = signal<DashboardSummary | null>(null);
  projects = signal<ProjectSummary[]>([]);
  workflowEvents = signal<Array<Record<string, unknown>>>([]);
  openExceptions = signal<Array<Record<string, unknown>>>([]);
  pendingApprovals = signal<number>(0);
  selectedProjectId = this.projectService.selectedProjectId;

  selectedProject = computed(() =>
    this.projects().find(x => x.project_id === this.selectedProjectId()) || null
  );

  cards = computed<OverviewCard[]>(() => {
    const p = this.selectedProject();

    return [
      {
        label: 'CapEx Budget',
        value: p ? this.formatMoney(p.capex_usd) : '-',
        note: p ? `${p.business_unit} · ${p.region}` : 'Project financial size'
      },
      {
        label: 'Completion',
        value: p ? `${p.completion_pct}%` : '-',
        note: p ? `${p.status} execution` : 'Execution progress'
      },
      {
        label: 'Delay',
        value: p ? `${p.delay_days} d` : '-',
        note: 'Schedule variance'
      },
      {
        label: 'Forecast Variance',
        value: p ? `${p.forecast_variance_pct}%` : '-',
        note: p ? `${p.risk_level} risk profile` : 'Forecast movement'
      }
    ];
  });

  topSummary = computed(() => {
    const p = this.selectedProject();
    if (!p) {
      return 'Portfolio view is active across the current finance workflows. Use the scope selector to move into a specific project before reviewing use-case detail.';
    }

    return `${p.project_name} is currently ${p.status} with ${p.completion_pct}% completion. Delivery pressure and forecast movement should be reviewed together before moving into estimate or capital pages.`;
  });

  aiInsights = computed(() => {
    const p = this.selectedProject();
    if (!p) {
      return [
        'The overview agent is scanning portfolio-level workflow signals, issue flow, and recent activity across the selected operating scope.',
        'It is prioritizing where to route you next by checking control pressure, approval load, and workflow movement rather than repeating the KPI cards.',
        'The right-side rail is being used as the live activity stream so the overview stays operational instead of static.'
      ];
    }

    return [
      `The overview agent is currently monitoring ${p.project_name} for workflow movement, delivery pressure, and control follow-up across the selected scope.`,
      `It is using the project status, delay trend, and forecast movement to decide whether your next best review path is close, estimate, or capital decision.`,
      `It is also keeping the live activity rail focused on operational updates so the top summary stays directional instead of repeating card values.`
    ];
  });

  plantPanel = computed(() => {
    const p = this.selectedProject();
    const exceptions = this.openExceptions();
    const approvals = this.pendingApprovals();
    const events = this.workflowEvents();

    if (!p) {
      return {
        title: 'Plant intelligence',
        uptime: '96.1%',
        efficiency: '91.4%',
        anomalies: `${exceptions.length}`,
        approvals: `${approvals}`,
        workflow: `${events.length}`,
        risk: 'Medium',
        location: 'Regional operating scope',
        nextAction: 'Review workflow movement and prioritize the highest-pressure execution lane before moving into use-case detail.'
      };
    }

    const uptime = Math.max(88, 99 - Math.min(8, Math.round(p.delay_days / 6)));
    const efficiency = Math.max(82, 96 - Math.round(p.forecast_variance_pct / 3));

    const nextAction =
      exceptions.length > 0
        ? 'Open exceptions are active. Prioritize exception clearance and approval movement before escalating downstream decisions.'
        : approvals > 0
          ? 'Approval pressure is active. Clear pending decisions to keep workflow movement aligned with project execution.'
          : p.delay_days > 20
            ? 'Execution pressure is elevated. Prioritize close readiness and estimate validation before capital escalation.'
            : 'Project is operationally stable. Continue workflow monitoring and route any material forecast movement for controller review.';

    return {
      title: 'Plant intelligence',
      uptime: `${uptime}%`,
      efficiency: `${efficiency}%`,
      anomalies: `${exceptions.length}`,
      approvals: `${approvals}`,
      workflow: `${events.length}`,
      risk: p.risk_level,
      location: `${p.country} · ${p.region}`,
      nextAction
    };
  });

  quickLinks = [
    {
      title: 'Workflow Center',
      text: 'Track decisions, timelines, and routing across the operating flow.',
      route: '/workflow-center'
    },
    {
      title: 'Approval Queue',
      text: 'Review human-in-the-loop items, escalations, and approval bottlenecks.',
      route: '/approval-queue'
    },
    {
      title: 'Close Status',
      text: 'Monitor close readiness, flagged items, and sign-off pressure.',
      route: '/close-status'
    },
    {
      title: 'Capital Decision',
      text: 'Review project return profile, scenario impact, and executive actions.',
      route: '/capital-decision'
    }
  ];

  ngOnInit(): void {
    const selectedIds = this.projectService.selectedProjectIds();

    this.api.getDashboardSummary(selectedIds).subscribe(data => this.summary.set(data));
    this.api.getProjects().subscribe(res => this.projects.set(res.items || []));
    this.api.getWorkflowTimeline(8).subscribe(res => this.workflowEvents.set(res.events || []));
    this.api.getApprovals('pending').subscribe(res => this.pendingApprovals.set((res.items || []).length));
    this.api.getExceptions(undefined, 'open', selectedIds).subscribe(res => this.openExceptions.set(res.items || []));
  }

  onProjectChange(projectId: string): void {
    this.projectService.setSelectedProject(projectId);

    const selectedIds = this.projectService.selectedProjectIds();
    this.api.getDashboardSummary(selectedIds).subscribe(data => this.summary.set(data));
    this.api.getExceptions(undefined, 'open', selectedIds).subscribe(res => this.openExceptions.set(res.items || []));
  }

  formatMoney(value: number): string {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B USD`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M USD`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K USD`;
    return `${value} USD`;
  }

  riskClass(risk?: string | null): string {
    const value = (risk || '').toLowerCase();
    if (value === 'high') return 'high';
    if (value === 'medium') return 'medium';
    return 'low';
  }
}