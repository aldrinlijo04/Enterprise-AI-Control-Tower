import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProjectContextService } from '../services/project-context.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css'
})
export class AppShellComponent {
  private projectContext = inject(ProjectContextService);

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
}