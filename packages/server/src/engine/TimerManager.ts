export class TimerManager {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  set(name: string, ms: number, callback: () => void): void {
    this.clear(name);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        callback();
      }, ms),
    );
  }

  /** Schedule a one-shot callback by key. Cancellable via cancel(key). */
  scheduleOnce(key: string, ms: number, callback: () => void): void {
    this.set(key, ms, callback);
  }

  /** Cancel a pending one-shot or recurring timer by key. No-op if not found. */
  cancel(key: string): void {
    this.clear(key);
  }

  clear(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }
  }

  clearAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
