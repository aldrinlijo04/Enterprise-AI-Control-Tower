import { Routes } from '@angular/router';
import { AppShellComponent } from './shell/app-shell.component';
import { LaunchComponent } from './pages/launch/launch.component';
import { OverviewComponent } from './pages/overview/overview.component';
import { WorkflowCenterComponent } from './pages/workflow-center/workflow-center.component';
import { ApprovalQueueComponent } from './pages/approval-queue/approval-queue.component';
import { ExceptionBoardComponent } from './pages/exception-board/exception-board.component';
import { CloseStatusComponent } from './pages/close-status/close-status.component';
import { ContractReviewComponent } from './pages/contract-review/contract-review.component';
import { ProjectEstimateComponent } from './pages/project-estimate/project-estimate.component';
import { CapitalDecisionComponent } from './pages/capital-decision/capital-decision.component';

export const routes: Routes = [
  { path: '', component: LaunchComponent },
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: 'overview', component: OverviewComponent },
      { path: 'workflow-center', component: WorkflowCenterComponent },
      { path: 'approval-queue', component: ApprovalQueueComponent },
      { path: 'exception-board', component: ExceptionBoardComponent },
      { path: 'close-status', component: CloseStatusComponent },
      { path: 'contract-review', component: ContractReviewComponent },
      { path: 'project-estimate', component: ProjectEstimateComponent },
      { path: 'capital-decision', component: CapitalDecisionComponent }
    ]
  }
];