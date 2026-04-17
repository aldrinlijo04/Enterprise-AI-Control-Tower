
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { ProjectContextService } from '../../services/project-context.service';

@Component({
  selector: 'app-exception-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exception-board.component.html',
  styleUrl: './exception-board.component.css'
})
export class ExceptionBoardComponent implements OnInit {
  private api = inject(ApiService);
  projectContext = inject(ProjectContextService);
  items = signal<Array<Record<string, unknown>>>([]);

  constructor() {
    effect(() => {
      const ids = this.projectContext.selectedProjectIds();
      if (this.projectContext.projects().length) this.load(ids);
    });
  }

  ngOnInit(): void {
    this.load(this.projectContext.selectedProjectIds());
  }

  load(ids: string[]): void {
    this.api.getExceptions(undefined, 'open', ids).subscribe(res => this.items.set(res.items));
  }

  severityClass(item: Record<string, unknown>): string {
    const severity = String(item['severity'] ?? '').toLowerCase();
    if (severity === 'high') return 'high';
    if (severity === 'medium') return 'medium';
    return 'low';
  }
}
