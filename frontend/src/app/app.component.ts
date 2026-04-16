import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SplashScreenComponent],
  template: `
    <div class="app-root" [class.loaded]="loaded">
      <app-splash-screen *ngIf="!loaded"></app-splash-screen>
      <router-outlet     *ngIf="loaded"></router-outlet>
    </div>
  `
})
export class AppComponent implements OnInit {
  loaded = false;

  ngOnInit(): void {
    setTimeout(() => this.loaded = true, 1200);
  }
}