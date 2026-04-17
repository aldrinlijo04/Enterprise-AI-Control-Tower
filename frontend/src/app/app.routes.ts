import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing/landing.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { FinpilotPlaceholderComponent } from './pages/finpilot/finpilot-placeholder.component';

export const routes: Routes = [
  {
    path: '',
    component: LandingComponent,
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
  },
  {
    path: 'finpilot',
    component: FinpilotPlaceholderComponent,
  },
  {
    // Redirect any unknown path back to landing
    path: '**',
    redirectTo: '',
  },
];