import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="metric-card" [style.--accent]="accent">
      <span class="metric-label">{{ label }}</span>
      <span class="metric-value">
        {{ value }}<span class="metric-unit">{{ unit }}</span>
      </span>
      <span *ngIf="sub" class="metric-sub">{{ sub }}</span>
    </div>
  `
})
export class MetricCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() unit  = '';
  @Input() accent = '#00c853';
  @Input() sub?: string;
}
