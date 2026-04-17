import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

const runtimeEnv = (window as Window & { __env?: Record<string, string> }).__env;

@Component({
  selector: 'app-launch',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './launch.component.html',
  styleUrl: './launch.component.css'
})
export class LaunchComponent {
  private router = inject(Router);
  readonly controlTowerUrl = (runtimeEnv?.['CONTROL_TOWER_URL'] || 'http://localhost:4200').replace(/\/$/, '');

  enter(): void {
    this.router.navigateByUrl('/overview');
  }

  backToControlTower(): void {
    window.location.href = `${this.controlTowerUrl}/`;
  }
}