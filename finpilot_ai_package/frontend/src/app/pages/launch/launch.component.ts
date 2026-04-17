import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-launch',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './launch.component.html',
  styleUrl: './launch.component.css'
})
export class LaunchComponent {
  private router = inject(Router);

  enter(): void {
    this.router.navigateByUrl('/overview');
  }
}