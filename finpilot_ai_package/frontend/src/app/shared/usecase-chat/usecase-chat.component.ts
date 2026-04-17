import {
  AfterViewChecked,
  Component,
  ElementRef,
  Input,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AgentRunRequest, ChatMessage, ModuleName } from '../../models';
import { ProjectContextService } from '../../services/project-context.service';

@Component({
  selector: 'app-usecase-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usecase-chat.component.html',
  styleUrl: './usecase-chat.component.css'
})
export class UsecaseChatComponent implements AfterViewChecked {
  private api = inject(ApiService);
  private projectService = inject(ProjectContextService);

  @ViewChild('chatStream') chatStreamRef?: ElementRef<HTMLDivElement>;

  @Input() module!: ModuleName;
  @Input() pageTitle = 'Finance module';
  @Input() entity?: string;
  @Input() projectId?: string;
  @Input() contractId?: string;
  @Input() customer?: string;
  @Input() scenario: Record<string, unknown> = {};
  @Input() placeholder = 'Ask about the selected project...';

  selectedProjectId = computed(() => this.projectId || this.projectService.getSelectedProject());

  messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Hi. I am ready to answer questions for the selected project in this module.'
    }
  ]);

  userInput = '';
  loading = signal(false);
  private shouldAutoScroll = true;

  ngAfterViewChecked(): void {
    if (this.shouldAutoScroll) {
      this.scrollToBottom();
      this.shouldAutoScroll = false;
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage(): void {
    const text = this.userInput.trim();
    if (!text || this.loading()) return;

    const activeProject = this.selectedProjectId();

    this.messages.update(list => [...list, { role: 'user', text }]);
    this.userInput = '';
    this.loading.set(true);
    this.shouldAutoScroll = true;

    const payload: AgentRunRequest = {
      query: text,
      requested_module: this.module,
      user_role: 'analyst',
      entity: this.entity ?? null,
      project_id: activeProject ?? null,
      project_ids: activeProject ? [activeProject] : [],
      contract_id: this.contractId ?? null,
      customer: this.customer ?? null,
      scenario: {
        ...this.scenario,
        page_title: this.pageTitle,
        selected_project_id: activeProject,
        selected_project_ids: activeProject ? [activeProject] : []
      },
      use_llm_summary: true
    };

    this.api.runAgent(payload).subscribe({
      next: (res) => {
        this.messages.update(list => [
          ...list,
          { role: 'assistant', text: res?.narrative || 'No response returned.' }
        ]);
        this.loading.set(false);
        this.shouldAutoScroll = true;
      },
      error: () => {
        this.messages.update(list => [
          ...list,
          {
            role: 'assistant',
            text: 'I could not answer that right now. Please check whether the backend is running and try again.'
          }
        ]);
        this.loading.set(false);
        this.shouldAutoScroll = true;
      }
    });
  }

  private scrollToBottom(): void {
    const el = this.chatStreamRef?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }
}