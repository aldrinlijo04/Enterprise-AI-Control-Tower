
import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly storageKey = 'finpilot_role';
  currentRole = signal<string>(localStorage.getItem(this.storageKey) || 'analyst');

  roleMeta = computed(() => {
    const role = this.currentRole();
    if (role === 'controller') {
      return {
        label: 'Controller',
        strap: 'Control execution desk',
        description: 'Exception control, approval routing, and sign-off readiness across active finance workflows.',
        primaryPages: ['Workflow Center', 'Approval Queue', 'Close Status', 'Contract Review']
      };
    }
    if (role === 'cfo') {
      return {
        label: 'CFO',
        strap: 'Executive decision cockpit',
        description: 'Portfolio-wide capital, risk, and cash exposure with escalation-focused operational visibility.',
        primaryPages: ['Overview', 'Capital Decision', 'Project Estimate', 'Workflow Center']
      };
    }
    return {
      label: 'Analyst',
      strap: 'Operational intelligence desk',
      description: 'Detailed finance diagnostics, project-level drilldowns, and evidence-backed agent guidance.',
      primaryPages: ['Overview', 'Exception Board', 'Close Status', 'Project Estimate']
    };
  });

  setRole(role: string): void {
    localStorage.setItem(this.storageKey, role);
    this.currentRole.set(role);
  }

  getRole(): string {
    return this.currentRole();
  }
}
