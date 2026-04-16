import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PlantSnapshot, PlantReport, AnomalyRow,
  MaintenanceRow, FailureRow
} from '../models/plant.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = (window as any).__env?.API_URL ?? 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  getSnapshot(): Observable<PlantSnapshot> {
    return this.http.get<PlantSnapshot>(`${this.base}/api/snapshot`);
  }

  getReport(): Observable<PlantReport> {
    return this.http.get<PlantReport>(`${this.base}/api/report`);
  }

  getAnomalies(): Observable<AnomalyRow[]> {
    return this.http.get<AnomalyRow[]>(`${this.base}/api/data/anomalies`);
  }

  getMaintenance(): Observable<MaintenanceRow[]> {
    return this.http.get<MaintenanceRow[]>(`${this.base}/api/data/maintenance`);
  }

  getFailure(): Observable<FailureRow[]> {
    return this.http.get<FailureRow[]>(`${this.base}/api/data/failure`);
  }

  sendChat(message: string, history: { role: string; content: string }[]): Observable<{ reply: string }> {
    return this.http.post<{ reply: string }>(`${this.base}/api/chat`, { message, history });
  }

  transcribeAudio(audioB64: string): Observable<{ text: string }> {
    return this.http.post<{ text: string }>(`${this.base}/api/transcribe`, { audio_b64: audioB64 });
  }
}
