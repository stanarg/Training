// Rest timer service. Lives outside the views, so it keeps running across tab
// switches. Time is anchored to performance.now(); a wall-clock check covers
// the case where the device slept and the monotonic clock paused with it.
// Emits 'change' with { state, remaining, duration } on start, every second,
// and when done.

import { haptic } from './dom.js';

const DONE_DISPLAY_MS = 5000;

export class RestTimer extends EventTarget {
  #endPerf = 0;
  #endWall = 0;
  #duration = 0;
  #tick = 0;
  #reset = 0;
  #permissionAsked = false;
  state = 'idle'; // 'idle' | 'running' | 'done'

  constructor() {
    super();
    document.addEventListener('visibilitychange', () => {
      if (this.state === 'running') this.#schedule();
    });
  }

  /** Milliseconds left, never negative. */
  get remaining() {
    if (this.state !== 'running') return 0;
    return Math.max(0, Math.min(this.#endPerf - performance.now(), this.#endWall - Date.now()));
  }

  get duration() {
    return this.#duration;
  }

  start(seconds) {
    const ms = seconds * 1000;
    this.#duration = ms;
    this.#endPerf = performance.now() + ms;
    this.#endWall = Date.now() + ms;
    this.state = 'running';
    clearTimeout(this.#reset);
    this.#askPermission();
    this.#schedule();
  }

  add(seconds) {
    if (this.state !== 'running') return;
    const ms = seconds * 1000;
    this.#duration += ms;
    this.#endPerf += ms;
    this.#endWall += ms;
    this.#schedule();
  }

  cancel() {
    clearTimeout(this.#tick);
    clearTimeout(this.#reset);
    this.state = 'idle';
    this.#emit();
  }

  #schedule() {
    clearTimeout(this.#tick);
    const left = this.remaining;
    if (left <= 0) return this.#finish();
    this.#emit();
    // Wake just after the displayed second changes.
    this.#tick = setTimeout(() => this.#schedule(), (left % 1000 || 1000) + 8);
  }

  #finish() {
    this.state = 'done';
    this.#emit();
    haptic([30, 80, 30]);
    this.#notify();
    this.#reset = setTimeout(() => {
      if (this.state === 'done') {
        this.state = 'idle';
        this.#emit();
      }
    }, DONE_DISPLAY_MS);
  }

  #emit() {
    this.dispatchEvent(
      new CustomEvent('change', { detail: { state: this.state, remaining: this.remaining, duration: this.#duration } }),
    );
  }

  /** Ask once, from the tap that started the timer (a user gesture, as iOS requires). */
  #askPermission() {
    if (this.#permissionAsked || !('Notification' in globalThis)) return;
    this.#permissionAsked = true;
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }

  async #notify() {
    if (!('Notification' in globalThis) || Notification.permission !== 'granted') return;
    const title = 'Rest is over';
    const options = { body: 'Time for your next set.', tag: 'rest-timer', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    try {
      // iOS home-screen apps only support notifications through the service worker.
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) await registration.showNotification(title, options);
      else new Notification(title, options);
    } catch {
      // Notification blocked or unsupported here; the pill still shows it.
    }
  }
}

export function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
