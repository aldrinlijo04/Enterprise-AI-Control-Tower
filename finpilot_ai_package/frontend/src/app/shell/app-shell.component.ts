import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProjectContextService } from '../services/project-context.service';

const runtimeEnv = (window as Window & { __env?: Record<string, string> }).__env;

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css'
})
export class AppShellComponent {
  private projectContext = inject(ProjectContextService);
  readonly controlTowerUrl = (runtimeEnv?.['CONTROL_TOWER_URL'] || 'http://localhost:4200').replace(/\/$/, '');

  currentProject = computed(() => this.projectContext.projectDisplay());

  navItems = [
    { label: 'Overview', route: '/overview', icon: '◈' },
    { label: 'Workflow Center', route: '/workflow-center', icon: '◎' },
    { label: 'Approval Queue', route: '/approval-queue', icon: '◉' },
    { label: 'Exception Board', route: '/exception-board', icon: '△' },
    { label: 'Close Status', route: '/close-status', icon: '◆' },
    { label: 'Contract Review', route: '/contract-review', icon: '▣' },
    { label: 'Project Estimate', route: '/project-estimate', icon: '▦' },
    { label: 'Capital Decision', route: '/capital-decision', icon: '⬢' }
  ];

  backToControlTower(): void {
    window.location.href = `${this.controlTowerUrl}/`;
  }
}