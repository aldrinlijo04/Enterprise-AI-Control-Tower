import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NgxEchartsDirective, provideEcharts } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import { Router, ActivatedRoute } from '@angular/router';

import { PlantDataService, PlantState } from '../../services/plant-data.service';
import { RISK_COLOR } from '../../models/plant.models';

import { MetricCardComponent }   from '../../components/metric-card/metric-card.component';
import { ModulePanelComponent }  from '../../components/module-panel/module-panel.component';
import { RiskBadgeComponent }    from '../../components/risk-badge/risk-badge.component';
import { ChatPanelComponent }    from '../../components/chat-panel/chat-panel.component';
import { LoadingScreenComponent, ErrorScreenComponent } from '../../components/status-screens/status-screens.component';

export type Tab = 'overview' | 'energy' | 'anomalies' | 'maintenance' | 'failure' | 'chat';
export const TABS: Tab[] = ['overview', 'energy', 'anomalies', 'maintenance', 'failure', 'chat'];

const AXIS_STYLE  = {
  axisLabel: { color: '#ffffff', fontSize: 10 },
  axisLine:  { lineStyle: { color: '#122615' } },
  splitLine: { lineStyle: { color: '#0b1a0d' } },
};
const TOOLTIP_STY = {
  backgroundColor: '#071209',
  borderColor: '#122615',
  textStyle: { color: '#d4f0dc', fontSize: 11 },
};
const GRID_STY = { left: 8, right: 8, top: 8, bottom: 24, containLabel: true };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    CommonModule,
    NgxEchartsDirective,
    MetricCardComponent,
    ModulePanelComponent,
    RiskBadgeComponent,
    ChatPanelComponent,
    LoadingScreenComponent,
    ErrorScreenComponent,
  ],
  providers: [provideEcharts()],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {

  tabs = TABS;
  activeTab: Tab = 'overview';
  state!: PlantState;

  // ── Voice Agent State ──────────────────────────────────────
  voiceAgentId = '';

  formatLabel(str: string): string {
    if (!str) return '';
    return str.toLowerCase()
              .replace(/_/g, ' ')
              .replace(/\b\w/g, l => l.toUpperCase());
  }

  private sub!: Subscription;
  private routeSub!: Subscription;

  constructor(
    public svc: PlantDataService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // ── Load ElevenLabs widget script once ──────────────────
    if (!document.getElementById('elevenlabs-widget')) {
      const script    = document.createElement('script');
      script.id       = 'elevenlabs-widget';
      script.src      = 'https://elevenlabs.io/convai-widget/index.js';
      script.async    = true;
      document.body.appendChild(script);
    }

    // ── Auto-load voice agent config on init ─────────────────
    this.loadVoiceAgent();

    // ── Read ?tab= from query params set by landing page ────
    this.routeSub = this.route.queryParams.subscribe(params => {
      const tab = params['tab'] as Tab;
      if (tab && TABS.includes(tab)) {
        this.activeTab = tab;
      }
    });

    this.sub = this.svc.data$.subscribe(s => {
      this.state = s;
    });
  }

  private async loadVoiceAgent(): Promise<void> {
    try {
      const res = await fetch('http://localhost:8000/api/voice/config');
      if (!res.ok) return;
      const cfg = await res.json();
      if (cfg.agent_id) {
        this.voiceAgentId = cfg.agent_id;
      }
    } catch (e) {
      console.error('Voice agent config error:', e);
    }
  }

  setTab(t: Tab): void {
    if (this.activeTab === t) return;
    this.activeTab = t;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: t },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  refresh(): void { this.svc.refresh(); }

  // ── CHART OPTIONS ────────────────────────────────────────────

  get forecastChartOpts(): EChartsOption {
    const f = this.state.report?.forecasting;
    if (!f) return {};
    const steps  = Array.from({ length: 10 }, (_, i) => `+${i + 1}`);
    const temps  = f.forecast_10_steps?.temperature || [];
    const press  = f.forecast_10_steps?.pressure    || [];
    const powers = f.forecast_10_steps?.power_kw    || [];
    return {
      backgroundColor: 'transparent',
      tooltip: { ...TOOLTIP_STY, trigger: 'axis' },
      legend: {
        data: ['Temp °C', 'Pressure bar', 'Power kW'],
        textStyle: { color: '#ffffff', fontSize: 14 },
        top: 0, right: 10,
      },
      grid: GRID_STY,
      xAxis: { type: 'category', data: steps, ...AXIS_STYLE, axisLabel: { color: '#ffffff', fontSize: 10 } },
      yAxis: { type: 'value',                 ...AXIS_STYLE, axisLabel: { color: '#ffffff', fontSize: 10 } },
      series: [
        { name: 'Temp °C',      type: 'line', data: temps,  smooth: true, lineStyle: { color: '#ff8c42' }, itemStyle: { color: '#ff8c42' }, areaStyle: { color: 'rgba(255,140,66,0.12)' },  symbol: 'none' },
        { name: 'Pressure bar', type: 'line', data: press,  smooth: true, lineStyle: { color: '#4facfe' }, itemStyle: { color: '#4facfe' }, areaStyle: { color: 'rgba(79,172,254,0.10)' },  symbol: 'none' },
        { name: 'Power kW',     type: 'line', data: powers, smooth: true, lineStyle: { color: '#a78bfa' }, itemStyle: { color: '#a78bfa' }, areaStyle: { color: 'rgba(167,139,250,0.10)' }, symbol: 'none' },
      ],
    };
  }

  get behaviorChartOpts(): EChartsOption {
    const pb = this.state.report?.plant_behavior;
    if (!pb) return {};
    const BCOLOR: any = {
      Normal: '#7BC657', OVERCAPACITY: '#14A989',
      CASCADE_FAULT: '#2F4F88', SURGE: '#d14775',
    };
    const data = Object.entries(pb.behavior_distribution || {}).map(([k, v]) => ({
      name: this.formatLabel(k),
      value: parseFloat(v as any),
      itemStyle: { color: BCOLOR[k] ?? '#4ADE80' },
    }));
    return {
      backgroundColor: 'transparent',
      tooltip: { ...TOOLTIP_STY, trigger: 'item', formatter: '{b}: {c}%' },
      legend: {
        bottom: '0%',
        left: 'center',
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 10,
        textStyle: {
          color: '#FFFFFF',
          fontSize: 10,
          fontFamily: 'Open Sans, sans-serif',
          fontWeight: 500,
        },
      },
      series: [{
        type: 'pie',
        radius: ['40%', '72%'],
        center: ['50%', '45%'],
        data,
        label: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Open Sans' },
        itemStyle: { borderColor: 'rgba(255,255,255,0.08)', borderWidth: 2 },
        emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.4)' } },
      }],
    };
  }

  get maintBarOpts(): EChartsOption {
    const m = this.state.report?.maintenance;
    if (!m) return {};
    const entries = Object.entries(m.by_equipment || {});
    const names   = entries.map(([k]) => this.formatLabel(k));
    const vals    = entries.map(([, v]: any) => v.avg_rul_hrs);
    return {
      backgroundColor: 'transparent',
      grid: { left: '20%', right: '10%', top: '10%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#ffffff', fontSize: 11, fontFamily: 'Open Sans, sans-serif' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: '#ffffff', fontSize: 11, fontFamily: 'Open Sans, sans-serif', margin: 20 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [{
        type: 'bar',
        data: vals,
        itemStyle: { color: '#126307', borderRadius: [0, 4, 4, 0] },
        barWidth: 14,
        label: { show: true, position: 'right', color: '#ffffff', fontSize: 10, fontFamily: 'Open Sans, sans-serif', formatter: '{c}h' },
      }],
    };
  }

  get energyBarOpts(): EChartsOption {
    const e = this.state.report?.energy;
    if (!e) return {};
    const eqs  = Object.keys(e.by_equipment || {}).map(k => this.formatLabel(k));
    const vals = Object.values(e.by_equipment || {});
    return {
      backgroundColor: 'transparent',
      tooltip: { ...TOOLTIP_STY, trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        data: ['Avg kW', 'Peak kW', 'Efficiency %'],
        textStyle: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Open Sans, sans-serif' },
        bottom: 0,
      },
      grid: { left: 30, right: 30, top: 40, bottom: 60, containLabel: true },
      xAxis: { type: 'category', data: eqs, ...AXIS_STYLE, axisLabel: { ...AXIS_STYLE.axisLabel, interval: 0, rotate: 0 } },
      yAxis: { type: 'value', ...AXIS_STYLE },
      series: [
        { name: 'Avg kW',       type: 'bar', barMaxWidth: 20, itemStyle: { color: '#a78bfa', borderRadius: [4,4,0,0] }, data: vals.map((v: any) => v.avg_kw) },
        { name: 'Peak kW',      type: 'bar', barMaxWidth: 20, itemStyle: { color: '#ff8c42', borderRadius: [4,4,0,0] }, data: vals.map((v: any) => v.peak_kw) },
        { name: 'Efficiency %', type: 'bar', barMaxWidth: 20, itemStyle: { color: '#00c853', borderRadius: [4,4,0,0] }, data: vals.map((v: any) => v.efficiency_pct) },
      ],
    };
  }

  get healthBarOpts(): EChartsOption {
    const fl = this.state.report?.failure;
    if (!fl) return {};
    const entries = Object.entries(fl.fleet_health || {});
    return {
      backgroundColor: 'transparent',
      tooltip: { ...TOOLTIP_STY, trigger: 'axis' },
      grid: GRID_STY,
      xAxis: { type: 'category', data: entries.map(e => e[0]), ...AXIS_STYLE },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: '{value}%', color: '#2d6b3a', fontSize: 10 },
        splitLine: { lineStyle: { color: '#0b1a0d' } },
      },
      series: [{
        type: 'bar', barMaxWidth: 48,
        data: entries.map(e => ({
          value: parseFloat(e[1] as any),
          itemStyle: { color: RISK_COLOR[e[0]] ?? '#6eb87e', borderRadius: [4,4,0,0] },
        })),
      }],
    };
  }

  // ── GETTERS ───────────────────────────────────────────────────

  get sortedAnomalyEquip() {
    const a = this.state.report?.anomaly;
    if (!a) return [];
    return Object.entries(a.by_equipment || {})
      .sort((x, y) => y[1].anomaly_rate_pct - x[1].anomaly_rate_pct);
  }

  get imminentFailures(): number {
    return this.state.report?.failure?.imminent_failures ?? 0;
  }

  get criticalEquipList(): { eq: string; prob: number }[] {
    const fl = this.state.report?.failure;
    if (!fl) return [];
    return Object.entries(fl.critical_equipment || {}).map(([eq, prob]) => ({ eq, prob }));
  }

  criticalEquipKeys(): string {
    return Object.keys(this.state.report?.failure?.critical_equipment ?? {}).slice(0, 3).join(' · ');
  }

  // ── HELPERS ───────────────────────────────────────────────────

  riskColor(l: string): string       { return RISK_COLOR[l] ?? '#a0aec0'; }
  anomalyColor(r: number): string    { return r > 20 ? '#ff3b5c' : r > 10 ? '#ff8c42' : '#00c853'; }
  effColor(e: number): string        { return e >= 90 ? '#00c853' : e >= 75 ? '#e7a409' : '#ff3b5c'; }
  rstPct(v: number, m = 100): number { return Math.min(v, m); }
  toTime(ts: string): string         { return new Date(ts).toLocaleTimeString(); }
  stockoutClass(p: number): string   { return p > 30 ? 'hi' : 'lo'; }
  maintRowClass(r: number): string   { return r < 100 ? 'val-red' : r < 250 ? 'val-warn' : ''; }
  failProbClass(p: number): string   { return p > 0.6 ? 'val-red' : p > 0.35 ? 'val-warn' : ''; }
  attentionWidth(r: number): number  { return Math.max(5, 100 - (r / 600) * 100); }
  rulWidth(r: number): number        { return Math.min((r / 600) * 100, 100); }
  trackByKey(index: number, item: any) {
    return item?.key || item?.eq || item?.equipment_id || index;
  }

  // kept for backward compat
  isChatOpen = false;
  toggleChat() { this.isChatOpen = !this.isChatOpen; }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.routeSub?.unsubscribe();
  }
}