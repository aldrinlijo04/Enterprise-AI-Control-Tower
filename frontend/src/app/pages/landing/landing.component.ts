import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Tab } from '../dashboard/dashboard.component';

type LaunchDestination = 'agent-workshop' | 'air-os' | 'finpilot';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent {

  constructor(private router: Router) {}

  private navigateToDashboard(tab: Tab): void {
    this.router.navigate(['/dashboard'], { queryParams: { tab } });
  }

  openTile(destination: LaunchDestination): void {
    switch (destination) {
      case 'agent-workshop':
        this.navigateToDashboard('chat');
        return;
      case 'air-os':
        this.navigateToDashboard('overview');
        return;
      case 'finpilot':
        this.router.navigate(['/finpilot']);
        return;
    }
  }
}