import { Injectable, signal } from '@angular/core';

/** Shared ticking clock so countdowns across the app stay in sync. */
@Injectable({ providedIn: 'root' })
export class ClockService {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
  }
}
