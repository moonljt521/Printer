import * as fs from 'fs';
import * as path from 'path';

export class Aggregator {
  private pending: string[] = [];
  private seen = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private debounceMs: number,
    private onFlush: (files: string[]) => void,
  ) {}

  add(paths: string[]): void {
    let added = false;
    for (const raw of paths) {
      const abs = normalize(raw);
      if (this.seen.has(abs)) continue;
      this.seen.add(abs);
      this.pending.push(abs);
      added = true;
    }
    if (!added) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  pendingCount(): number {
    return this.pending.length;
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const files = this.pending.filter((p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });
    this.pending = [];
    this.seen.clear();
    if (files.length > 0) this.onFlush(files);
  }
}

function normalize(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}
