
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { DashboardSummary } from '../../models';
import { ProjectContextService } from '../../services/project-context.service';

@Component({
  selector: 'app-workflow-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workflow-center.component.html',
  styleUrl: './workflow-center.component.css'
})
export class WorkflowCenterComponent implements OnInit {
  private api = inject(ApiService);
  projectContext = inject(ProjectContextService);
  summary = signal<DashboardSummary | null>(null);

  constructor() {
    effect(() => {
      const ids = this.projectContext.selectedProjectIds();
      if (this.projectContext.projects().length) this.load(ids);
    });
  }

  ngOnInit(): void {
    this.load(this.projectContext.selectedProjectIds());
  }

  load(ids: string[]): void {
    this.api.getDashboardSummary(ids).subscribe(data => this.summary.set(data));
  }
}
