import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProjectContextService } from '../services/project-context.service';
import { ApiService } from '../services/api.service';

const runtimeEnv = (window as Window & { __env?: Record<string, string> }).__env;

@Component({
  selector: 'app-shell',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css'
})
export class AppShellComponent implements OnInit {
  private api = inject(ApiService);
  private projectContext = inject(ProjectContextService);
  readonly controlTowerUrl = (runtimeEnv?.['CONTROL_TOWER_URL'] || 'http://localhost:4200').replace(/\/$/, '');
  voiceAgentId = '';

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

  ngOnInit(): void {
    this.ensureVoiceWidgetScript();
    this.loadVoiceAgentConfig();
  }

  backToControlTower(): void {
    window.location.href = `${this.controlTowerUrl}/`;
  }

  private ensureVoiceWidgetScript(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById('elevenlabs-widget')) return;

    const script = document.createElement('script');
    script.id = 'elevenlabs-widget';
    script.src = 'https://elevenlabs.io/convai-widget/index.js';
    script.async = true;
    document.body.appendChild(script);
  }

  private loadVoiceAgentConfig(): void {
    this.api.getVoiceConfig().subscribe({
      next: (config) => {
        this.voiceAgentId = config?.agent_id || '';
      },
      error: () => {
        this.voiceAgentId = '';
      },
    });
  }
}