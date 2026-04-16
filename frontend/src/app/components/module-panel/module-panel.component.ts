import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

const ICON_PATHS: Record<string, string> = {
  forecast:    'M3 3v18h18M7 16l4-4 4 4 4-4',
  demand:      'M9 19V6l7 13V6',
  energy:      'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  anomaly:     'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  behavior:    'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 6v4l3 3',
  maintenance: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  failure:     'M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242M12 12v9m-4-4l4 4 4-4',
  alert:       'M12 22c1 0 2-1 2-2H10c0 1 1 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  chat:        'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
};

@Component({
  selector: 'app-module-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="module-panel" [style.--accent]="accent">
      <div class="module-header">
        <span *ngIf="iconKey" class="module-icon" [style.color]="accent">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <path [attr.d]="iconPath" />
          </svg>
        </span>
        <span class="module-title">{{ title }}</span>
        <span *ngIf="badge !== undefined"
              class="module-badge" [style.background]="accent">
          {{ badge }}
        </span>
      </div>
      <div [class]="noPad ? 'module-body-nopad' : 'module-body'">
        <ng-content></ng-content>
      </div>
    </div>
  `
})
export class ModulePanelComponent {
  @Input() title    = '';
  @Input() iconKey  = '';
  @Input() accent   = '#00c853';
  @Input() badge?: string | number;
  @Input() noPad    = false;

  get iconPath(): string {
    return ICON_PATHS[this.iconKey] ?? '';
  }
}
