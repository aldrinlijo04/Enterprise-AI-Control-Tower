import { Routes } from '@angular/router';
import { AppShellComponent } from './shell/app-shell.component';
import { OverviewComponent } from './pages/overview/overview.component';
import { CloseStatusComponent } from './pages/close-status/close-status.component';
import { ContractReviewComponent } from './pages/contract-review/contract-review.component';
import { ProjectEstimateComponent } from './pages/project-estimate/project-estimate.component';
import { CapitalDecisionComponent } from './pages/capital-decision/capital-decision.component';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: '', component: OverviewComponent },
      { path: 'close-status', component: CloseStatusComponent },
      { path: 'contract-review', component: ContractReviewComponent },
      { path: 'project-estimate', component: ProjectEstimateComponent },
      { path: 'capital-decision', component: CapitalDecisionComponent }
    ]
  }
];