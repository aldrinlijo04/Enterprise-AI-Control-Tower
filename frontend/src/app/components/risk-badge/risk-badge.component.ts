import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RISK_COLOR } from '../../models/plant.models';

@Component({
  selector: 'app-risk-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [style.background]="color" [style.color]="'#040d06'">
      {{ label }}
    </span>
  `
})
export class RiskBadgeComponent {
  @Input() label = '';
  get color(): string {
    return RISK_COLOR[this.label] ?? '#a0aec0';
  }
}

@Component({
  selector: 'app-severity-dot',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [style.display]="'inline-block'"
          [style.width.px]="8" [style.height.px]="8"
          [style.borderRadius]="'50%'"
          [style.background]="color"
          [style.boxShadow]="'0 0 6px ' + color"
          [style.flexShrink]="'0'">
    </span>
  `
})
export class SeverityDotComponent {
  @Input() level = '';
  get color(): string {
    return RISK_COLOR[this.level] ?? '#a0aec0';
  }
}
