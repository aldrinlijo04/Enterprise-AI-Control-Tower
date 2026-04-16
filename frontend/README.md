# ARIA Angular — Advanced Real-time Industrial AI Dashboard

A full Angular 17 port of the ARIA React dashboard, component-by-component.  
Built with **standalone components**, **RxJS services**, and **ngx-charts** (the Recharts equivalent for Angular).

---

## React → Angular Mapping

| React                    | Angular                                |
|--------------------------|----------------------------------------|
| `App.js` + splash state  | `AppComponent` + `ngOnInit` timer      |
| `usePlantData` hook      | `PlantDataService` (RxJS BehaviorSubject + forkJoin polling) |
| `useChat` hook           | `ChatService` (RxJS BehaviorSubject)   |
| `api.js` (axios)         | `ApiService` (Angular `HttpClient`)    |
| `Dashboard.js`           | `DashboardComponent` (HTML template)   |
| `MetricCard.js`          | `MetricCardComponent`                  |
| `ModulePanel.js`         | `ModulePanelComponent`                 |
| `RiskBadge.js`           | `RiskBadgeComponent` + `SeverityDotComponent` |
| `ChatPanel.js`           | `ChatPanelComponent`                   |
| `StatusScreens.js`       | `LoadingScreenComponent` + `ErrorScreenComponent` |
| Recharts charts          | `@swimlane/ngx-charts`                 |
| `App.css` CSS variables  | `styles.scss` (same var names, green theme) |

---

## Theme

The **Air Products black-to-green gradient theme** from the screenshot is applied via CSS custom properties in `styles.scss`:

```scss
--bg:             #040d06;         /* near-black with green tint */
--green:          #00c853;         /* Air Products vibrant green */
--hero-gradient:  linear-gradient(135deg, #040d06, #071a09, #004d20, #00c853);
--header-gradient: linear-gradient(90deg, #040d06, #071209, #003d18);
```

---

## Project Structure

```
src/
├── main.ts                         # Bootstrap
├── styles.scss                     # Global styles + CSS vars (Air Products theme)
├── index.html
└── app/
    ├── app.component.ts            # Root — splash → dashboard
    ├── app.config.ts               # provideHttpClient, provideRouter, provideAnimations
    ├── app.routes.ts
    ├── models/
    │   └── plant.models.ts         # All TypeScript interfaces + RISK_COLOR map
    ├── services/
    │   ├── api.service.ts          # HTTP calls to FastAPI backend
    │   ├── plant-data.service.ts   # Polling state (30s interval via RxJS timer)
    │   └── chat.service.ts         # Chat message state + voice transcription
    ├── components/
    │   ├── metric-card/            # KPI card with accent colour + CSS var
    │   ├── module-panel/           # Panel wrapper with icon, title, badge
    │   ├── risk-badge/             # Coloured badge + severity dot
    │   ├── chat-panel/             # Full chat UI with voice recording
    │   ├── splash-screen/          # Animated loading splash
    │   └── status-screens/         # LoadingScreen + ErrorScreen
    └── pages/
        └── dashboard/
            ├── dashboard.component.ts   # All chart data derivations
            └── dashboard.component.html # 6-tab layout (overview/energy/anomalies/maintenance/failure/chat)
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- Angular CLI 17: `npm install -g @angular/cli`
- FastAPI backend running on port 8000 (from the original project)

### Install & Run

```bash
# Install dependencies
npm install

# Start dev server (connects to localhost:8000)
ng serve

# Open browser
# http://localhost:4200
```

### Build for Production

```bash
ng build --configuration production
# Output in dist/aria-angular/
```

---

## Backend

This frontend connects to the **same FastAPI backend** from the original React project (`plant-ai/backend/`).  
Start it with:

```bash
cd ../backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### API Endpoints Used

| Endpoint                  | Service method          |
|---------------------------|-------------------------|
| `GET /api/snapshot`       | `ApiService.getSnapshot()`    |
| `GET /api/report`         | `ApiService.getReport()`      |
| `GET /api/data/anomalies` | `ApiService.getAnomalies()`   |
| `GET /api/data/maintenance`| `ApiService.getMaintenance()` |
| `GET /api/data/failure`   | `ApiService.getFailure()`     |
| `POST /api/chat`          | `ApiService.sendChat()`       |
| `POST /api/transcribe`    | `ApiService.transcribeAudio()`|

---

## Key Angular Patterns Used

### RxJS Polling (replaces `useInterval`)
```typescript
// PlantDataService — polls every 30 seconds
timer(0, POLL_MS).pipe(
  switchMap(() => forkJoin([getSnapshot(), getReport(), ...]))
)
```

### Async Pipe (replaces useState)
```html
<!-- Component subscribes via ngOnInit, pushes to local state -->
<app-metric-card [value]="state.snap?.temperature"></app-metric-card>
```

### CSS Custom Properties with Angular style binding
```html
<!-- Same pattern as React's style={{ '--accent': accent }} -->
<div class="metric-card" [style.--accent]="accent">
```
