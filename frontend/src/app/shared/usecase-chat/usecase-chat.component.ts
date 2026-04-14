import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AgentRunRequest, ChatMessage, ModuleName } from '../../models';

@Component({
  selector: 'app-usecase-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usecase-chat.component.html',
  styleUrl: './usecase-chat.component.css'
})
export class UsecaseChatComponent {
  private api = inject(ApiService);

  @Input() module!: ModuleName;
  @Input() userRole = 'cfo';
  @Input() entity?: string;
  @Input() projectId?: string;
  @Input() contractId?: string;
  @Input() customer?: string;
  @Input() scenario: Record<string, unknown> = {};

  messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Ask a quick question about this dashboard.'
    }
  ]);

  userInput = '';
  loading = signal(false);

  sendMessage(): void {
    const text = this.userInput.trim();
    if (!text || this.loading()) return;

    this.messages.update(list => [...list, { role: 'user', text }]);
    this.loading.set(true);

    const payload: AgentRunRequest = {
      query: text,
      requested_module: this.module,
      user_role: this.userRole,
      entity: this.entity,
      project_id: this.projectId,
      contract_id: this.contractId,
      customer: this.customer,
      scenario: this.scenario,
      use_llm_summary: true
    };

    this.api.runAgent(payload).subscribe({
      next: (res) => {
        this.messages.update(list => [...list, { role: 'assistant', text: res.narrative }]);
        this.loading.set(false);
      },
      error: () => {
        this.messages.update(list => [
          ...list,
          { role: 'assistant', text: 'I could not complete that request. Please check the backend.' }
        ]);
        this.loading.set(false);
      }
    });

    this.userInput = '';
  }
}