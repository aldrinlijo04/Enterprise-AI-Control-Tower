import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewChecked,
  Pipe, PipeTransform
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { ChatMessage } from '../../models/plant.models';

const PROMPTS = [
  'What is the overall plant status right now?',
  'Which equipment needs urgent attention?',
  'Summarise energy waste and recommendations',
  'What anomalies were detected and why?',
  'Predict failure risk across all equipment',
  'What does the demand forecast say?',
  'Explain the maintenance priority list',
  'Which plant has the most critical alerts?',
];

// ── Pipe: converts ARIA markdown response to safe HTML ──────────
@Pipe({ name: 'ariaMessage', standalone: true })
export class AriaMessagePipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(content: string): SafeHtml {
    const lines = content.split('\n').filter(l => l.trim() !== '');
    const html = lines.map(line => {
      // Bold: **text** → <strong>text</strong>
      const bolded = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      // Section header: starts with an emoji
      const isSectionHeader = /^[🔴🟠🟢⚡🔧📊🌡️⚠️✅🏭💡🔍]/.test(line);

      if (isSectionHeader) {
        return `<div class="aria-section-header">${bolded}</div>`;
      }
      return `<div class="aria-line">${bolded}</div>`;
    }).join('');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, AriaMessagePipe],
  template: `
    <div class="chat-panel">

      <!-- Header -->
      <div class="chat-header">
        <span class="chat-title">
          <span class="aria-dot"></span>
          ARIA Assistant
        </span>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="chat-subtitle">7 models active • 500 records</span>
          <button class="icon-btn" (click)="chatSvc.clear()" title="Clear conversation">
            <!-- Trash icon -->
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div class="chat-messages" #messagesContainer>
        <div *ngFor="let msg of messages"
             class="chat-bubble" [class]="msg.role">
          <span *ngIf="msg.role === 'assistant'" class="bubble-tag">ARIA</span>
          <span *ngIf="msg.role === 'user'" class="bubble-tag user-tag">YOU</span>

          <!-- ARIA messages: rendered with bold + emoji section headers -->
          <div *ngIf="msg.role === 'assistant'"
               class="aria-message"
               [innerHTML]="msg.content | ariaMessage">
          </div>
          <!-- User messages: plain text -->
          <p *ngIf="msg.role === 'user'">{{ msg.content }}</p>
        </div>

        <!-- Typing indicator -->
        <div *ngIf="loading" class="chat-bubble assistant">
          <span class="bubble-tag">ARIA</span>
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>

        <div #scrollAnchor></div>
      </div>

      <!-- Prompt chips -->
      <div class="prompts-section">
        <span class="prompts-label">Suggested</span>
        <div class="prompt-chips">
          <button *ngFor="let p of prompts" class="chip"
                  (click)="sendPrompt(p)">
            {{ p }}
          </button>
        </div>
      </div>

      <!-- Input row -->
      <div class="chat-input-row">
        <button class="mic-btn" [class.recording]="recording"
                (click)="toggleRecord()"
                [title]="recording ? 'Stop recording' : 'Voice input'">
          <!-- Mic icon -->
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4m-4 0h8"/>
          </svg>
          <span *ngIf="recording" class="rec-timer"></span>
        </button>

        <input class="chat-input"
               placeholder="Ask about equipment, anomalies, energy, forecasts…"
               [(ngModel)]="inputText"
               (keydown.enter)="handleSend()"/>

        <button class="send-btn" (click)="handleSend()"
                [disabled]="!inputText.trim()">
          <!-- Send icon -->
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
    </div>
  `
})
export class ChatPanelComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('scrollAnchor') scrollAnchor!: ElementRef;

  prompts    = PROMPTS;
  inputText  = '';
  messages: ChatMessage[] = [];
  loading    = false;
  recording  = false;

  private subs   = new Subscription();
  private mediaR: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(public chatSvc: ChatService) {}

  ngOnInit(): void {
    this.subs.add(this.chatSvc.messages.subscribe(m => this.messages = m));
    this.subs.add(this.chatSvc.loading.subscribe(l => this.loading   = l));
  }

  ngAfterViewChecked(): void {
    this.scrollAnchor?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
  }

  handleSend(): void {
    if (!this.inputText.trim()) return;
    this.chatSvc.send(this.inputText);
    this.inputText = '';
  }

  sendPrompt(p: string): void {
    this.chatSvc.send(p);
  }

  async toggleRecord(): Promise<void> {
    if (this.recording) {
      this.mediaR?.stop();
      this.recording = false;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr     = new MediaRecorder(stream);
      this.mediaR  = mr;
      this.chunks  = [];
      mr.ondataavailable = (e) => this.chunks.push(e.data);
      mr.onstop = () => {
        const blob   = new Blob(this.chunks, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onload = () => {
          const b64 = (reader.result as string).split(',')[1];
          this.chatSvc.sendVoice(b64);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      this.recording = true;
      setTimeout(() => { if (mr.state === 'recording') mr.stop(); this.recording = false; }, 9000);
    } catch {
      alert('Microphone access denied.');
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}