import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, forkJoin, Subscription, timer } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { ApiService } from './api.service';
import {
  PlantSnapshot, PlantReport, AnomalyRow,
  MaintenanceRow, FailureRow
} from '../models/plant.models';

const POLL_MS = 30_000;

export interface PlantState {
  snap:        PlantSnapshot | null;
  report:      PlantReport   | null;
  anomalies:   AnomalyRow[];
  maintenance: MaintenanceRow[];
  failures:    FailureRow[];
  loading:     boolean;
  error:       string | null;
  lastRefresh: Date | null;
}

@Injectable({ providedIn: 'root' })
export class PlantDataService implements OnDestroy {

  private state$ = new BehaviorSubject<PlantState>({
    snap: null, report: null, anomalies: [], maintenance: [],
    failures: [], loading: true, error: null, lastRefresh: null,
  });

  readonly data$ = this.state$.asObservable();

  private pollSub!: Subscription;
  private refreshTrigger$ = new BehaviorSubject<void>(undefined);

  constructor(private api: ApiService) {
    this.pollSub = this.refreshTrigger$.pipe(
      switchMap(() => timer(0, POLL_MS)),
      switchMap(() => forkJoin([
        this.api.getSnapshot(),
        this.api.getReport(),
        this.api.getAnomalies(),
        this.api.getMaintenance(),
        this.api.getFailure(),
      ]))
    ).subscribe({
      next: ([snap, report, anomalies, maintenance, failures]) => {
        this.state$.next({
          snap, report, anomalies, maintenance, failures,
          loading: false, error: null, lastRefresh: new Date(),
        });
      },
      error: () => {
        this.state$.next({
          ...this.state$.value,
          loading: false,
          error: 'Cannot reach backend. Make sure FastAPI is running on port 8000.',
        });
      }
    });
  }

  refresh(): void {
    this.refreshTrigger$.next();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }
}
