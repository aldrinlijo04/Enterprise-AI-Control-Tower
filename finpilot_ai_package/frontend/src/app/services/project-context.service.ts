import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ProjectItem } from '../models';

@Injectable({ providedIn: 'root' })
export class ProjectContextService {
  private readonly storageKey = 'finpilot_selected_projects';
  private api = inject(ApiService);

  projects = signal<ProjectItem[]>([]);

  selectedProjectIds = signal<string[]>(
    JSON.parse(localStorage.getItem(this.storageKey) || '[]')
  );

  selectedProjects = computed(() =>
    this.projects().filter(item => this.selectedProjectIds().includes(item.project_id))
  );

  selectedProjectId = computed(() =>
    this.selectedProjectIds()[0] || this.projects()[0]?.project_id || 'PRJ-0001'
  );

  constructor() {
    this.loadProjects();
  }

  loadProjects(): void {
    if (this.projects().length) return;

    this.api.getProjects().subscribe({
      next: ({ items }) => {
        this.projects.set(items || []);

        if (!this.selectedProjectIds().length && items?.length) {
          this.setSelected([
            items[0].project_id,
            ...(items[1] ? [items[1].project_id] : [])
          ]);
        }
      },
      error: () => {
        if (!this.selectedProjectIds().length) {
          this.setSelected(['PRJ-0001']);
        }
      }
    });
  }

  setSelected(ids: string[]): void {
    const clean = [...new Set(ids)].filter(Boolean);
    localStorage.setItem(this.storageKey, JSON.stringify(clean));
    this.selectedProjectIds.set(clean);
  }

  setSelectedProject(projectId: string): void {
    this.setSelected([projectId]);
  }

  getSelectedProject(): string {
    return this.selectedProjectId();
  }

  toggleProject(id: string): void {
    const current = this.selectedProjectIds();

    if (current.includes(id)) {
      const next = current.filter(item => item !== id);
      this.setSelected(next.length ? next : [id]);
      return;
    }

    this.setSelected([...current, id]);
  }

  projectDisplay(): string {
    const items = this.selectedProjects();

    if (!items.length) return 'All portfolio projects';
    if (items.length === 1) return `${items[0].project_id} · ${items[0].project_name}`;
    return `${items.length} selected projects`;
  }
}