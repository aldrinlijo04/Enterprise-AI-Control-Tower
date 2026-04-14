import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DashboardSummary } from '../../models';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css'
})
export class OverviewComponent implements OnInit {
  private api = inject(ApiService);
  summary = signal<DashboardSummary | null>(null);

  cards = computed(() => {
    const counts = this.summary()?.counts ?? {};
    const exc = this.summary()?.open_exception_summary ?? {};

    return [
      { label: 'Transactions', value: counts['transactions'] ?? 0 },
      { label: 'Deliveries', value: counts['deliveries'] ?? 0 },
      { label: 'Audit Events', value: counts['audit_events'] ?? 0 },
      { label: 'Pending Reviews', value: exc['pending'] ?? 0 }
    ];
  });

  modules = [
    {
      title: 'Close Status',
      text: 'Track review candidates, flagged items, and close-readiness by entity.',
      route: '/close-status'
    },
    {
      title: 'Contract Review',
      text: 'Review take-or-pay contracts and get plain-language revenue treatment guidance.',
      route: '/contract-review'
    },
    {
      title: 'Project Estimate',
      text: 'Refresh cost-to-complete and identify the main drivers behind estimate changes.',
      route: '/project-estimate'
    },
    {
      title: 'Capital Decision',
      text: 'Run scenario analysis and prepare recommendation-ready investment outputs.',
      route: '/capital-decision'
    }
  ];

  ngOnInit(): void {
    this.api.getDashboardSummary().subscribe({
      next: data => this.summary.set(data)
    });
  }
}