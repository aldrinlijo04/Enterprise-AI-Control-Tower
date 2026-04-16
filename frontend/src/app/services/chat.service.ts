import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from './api.service';
import { ChatMessage } from '../models/plant.models';

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'ARIA online. I\'m monitoring 7 AI models across your plant fleet — ' +
    'forecasting, demand, energy, anomaly detection, plant behavior, ' +
    'predictive maintenance, and failure prediction. Ask me anything.',
};

@Injectable({ providedIn: 'root' })
export class ChatService {
  private messages$ = new BehaviorSubject<ChatMessage[]>([INITIAL_MESSAGE]);
  private loading$  = new BehaviorSubject<boolean>(false);

  readonly messages = this.messages$.asObservable();
  readonly loading  = this.loading$.asObservable();

  constructor(private api: ApiService) {}

  send(message: string): void {
    if (!message.trim()) return;
    const history = this.messages$.value.map(m => ({ role: m.role, content: m.content }));
    this.messages$.next([...this.messages$.value, { role: 'user', content: message }]);
    this.loading$.next(true);

    this.api.sendChat(message, history).subscribe({
      next: (res) => {
        this.messages$.next([...this.messages$.value, { role: 'assistant', content: res.reply }]);
        this.loading$.next(false);
      },
      error: () => {
        this.messages$.next([
          ...this.messages$.value,
          { role: 'assistant', content: 'Connection error. Please verify the backend is running on port 8000.' }
        ]);
        this.loading$.next(false);
      }
    });
  }

  sendVoice(audioB64: string): void {
    this.loading$.next(true);
    this.api.transcribeAudio(audioB64).subscribe({
      next: (res) => {
        this.loading$.next(false);
        if (res.text) {
          this.send(res.text);
        } else {
          this.send('(voice transcription returned empty — please type your question)');
        }
      },
      error: () => {
        this.loading$.next(false);
        this.send('(voice transcription failed — please type your question)');
      }
    });
  }

  clear(): void {
    this.messages$.next([INITIAL_MESSAGE]);
  }
}