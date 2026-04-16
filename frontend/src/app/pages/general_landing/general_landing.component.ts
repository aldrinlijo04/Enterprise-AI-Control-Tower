import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Tab } from '../dashboard/dashboard.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './general_landing.component.html',
  styleUrls: ['./general_landing.component.scss'],
})
export class LandingComponent {

  constructor(private router: Router) {}

  navigate(tab: Tab): void {
    this.router.navigate(['/dashboard'], { queryParams: { tab } });
  }
}