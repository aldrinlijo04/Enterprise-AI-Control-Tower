import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-finpilot-placeholder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="finpilot-page">
      <div class="placeholder-card">
        <span class="badge">Placeholder</span>
        <h1>FINPILOT</h1>
        <p>
          The FINPILOT workspace shell is ready. Integration for financial analytics,
          budget intelligence, and forecasting workflows can be plugged in next.
        </p>
        <div class="actions">
          <button type="button" class="btn ghost" (click)="backToLauncher()">Back To Launcher</button>
          <button type="button" class="btn primary" (click)="openAirOs()">Open AIR OS</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .finpilot-page {
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 15% 15%, rgba(240, 175, 87, 0.2), transparent 36%),
          radial-gradient(circle at 82% 80%, rgba(79, 195, 247, 0.18), transparent 42%),
          linear-gradient(165deg, #070f1d 0%, #0d182b 46%, #101e37 100%);
        padding: 18px;
      }

      .placeholder-card {
        width: min(700px, 100%);
        border-radius: 18px;
        border: 1px solid rgba(240, 175, 87, 0.38);
        background: rgba(13, 24, 44, 0.86);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        padding: 28px;
        color: #f2f7ff;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 26px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(240, 175, 87, 0.45);
        background: rgba(240, 175, 87, 0.14);
        color: #ffd8a7;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.9px;
        text-transform: uppercase;
      }

      h1 {
        margin-top: 14px;
        font-size: clamp(36px, 6vw, 52px);
        line-height: 1;
        letter-spacing: -1px;
        color: #ffffff;
      }

      p {
        margin-top: 14px;
        color: #a8bfdc;
        font-size: 15px;
        line-height: 1.65;
        max-width: 56ch;
      }

      .actions {
        margin-top: 22px;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .btn {
        height: 38px;
        border-radius: 10px;
        padding: 0 14px;
        border: 1px solid transparent;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.5px;
        cursor: pointer;
        transition: transform 0.18s ease, filter 0.18s ease;
      }

      .btn:hover {
        transform: translateY(-1px);
        filter: brightness(1.08);
      }

      .btn.primary {
        border-color: rgba(79, 195, 247, 0.5);
        background: rgba(79, 195, 247, 0.2);
        color: #dff6ff;
      }

      .btn.ghost {
        border-color: rgba(255, 255, 255, 0.22);
        background: transparent;
        color: #e5eef8;
      }
    `,
  ],
})
export class FinpilotPlaceholderComponent {
  constructor(private router: Router) {}

  backToLauncher(): void {
    this.router.navigate(['/']);
  }

  openAirOs(): void {
    this.router.navigate(['/dashboard'], { queryParams: { tab: 'overview' } });
  }
}
