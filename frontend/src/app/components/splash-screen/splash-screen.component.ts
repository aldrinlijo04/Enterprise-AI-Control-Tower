import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-splash-screen',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="splash">
      <div class="splash-inner">
        <div class="splash-logo">
          <span class="logo-aria">ARIA</span>
          <span class="logo-sub">Advanced Real-time Industrial AI</span>
        </div>
        <div class="splash-bars">
          <div *ngFor="let i of bars; let idx = index"
               class="splash-bar"
               [style.animationDelay]="(idx * 0.1) + 's'">
          </div>
        </div>
        <p class="splash-status">Initialising 7 AI Models…</p>
      </div>
    </div>
  `
})
export class SplashScreenComponent {
  bars = Array(7).fill(0);
}
