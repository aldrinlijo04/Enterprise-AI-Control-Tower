import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-screen',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <span style="font-size:12px;letter-spacing:2px;text-transform:uppercase;">
        Loading plant data…
      </span>
    </div>
  `
})
export class LoadingScreenComponent {}

@Component({
  selector: 'app-error-screen',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="error-screen">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
           stroke="#ff3b5c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <h3>Connection Error</h3>
      <p>{{ message }}</p>
      <button class="retry-btn" (click)="retry.emit()">Retry</button>
    </div>
  `
})
export class ErrorScreenComponent {
  @Input() message = '';
  @Output() retry  = new EventEmitter<void>();
}
