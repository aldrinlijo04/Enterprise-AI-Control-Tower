import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css'
})
export class AppShellComponent {
  navItems = [
    { label: 'Overview', route: '/' },
    { label: 'Close Status', route: '/close-status' },
    { label: 'Contract Review', route: '/contract-review' },
    { label: 'Project Estimate', route: '/project-estimate' },
    { label: 'Capital Decision', route: '/capital-decision' }
  ];
}