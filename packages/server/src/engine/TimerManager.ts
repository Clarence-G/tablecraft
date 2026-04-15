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
