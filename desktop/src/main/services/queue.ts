import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { classify } from '../core/filetype';
import { PrintItem, PrintOptions } from '../core/types';
import { PrintService } from './printer';
import { convertToPdf } from './converter';
import { countPdfPages } from '../core/pdfinfo';

export interface QueueSummary {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  canceled: number;
  currentId: string | null;
}

export interface QueueDeps {
  printService: PrintService;
  locateSoffice: () => string | undefined;
  tempRoot: string;
  dryRun: boolean;
  onUpdate: (items: PrintItem[], summary: QueueSummary) => void;
}

export interface StartFlags {
  skipOfficeWhenNoConverter?: boolean;
}

export class PrintQueue {
  private items: PrintItem[] = [];
  private running = false;
  private canceled = false;

  constructor(private deps: QueueDeps) {}

  snapshot(): PrintItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  summary(): QueueSummary {
    const count = (status: PrintItem['status']) => this.items.filter((i) => i.status === status).length;
    const current = this.items.find((i) => i.status === 'converting' || i.status === 'printing');
    return {
      running: this.running,
      total: this.items.length,
      done: count('done'),
      failed: count('failed'),
      skipped: count('skipped'),
      canceled: count('canceled'),
      currentId: current ? current.id : null,
    };
  }

  addFiles(paths: string[]): void {
    for (const raw of paths) {
      const abs = path.resolve(raw);
      if (this.items.some((i) => i.path === abs)) continue;
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch {
        // keep 0
      }
      const item: PrintItem = {
        id: crypto.randomUUID(),
        path: abs,
        name: path.basename(abs),
        kind: classify(abs),
        size,
        status: 'pending',
      };
      this.items.push(item);
      if (item.kind === 'pdf') void this.fillPdfPages(item);
    }
    this.emit();
  }

  private async fillPdfPages(item: PrintItem): Promise<void> {
    const pages = await countPdfPages(item.path);
    if (pages === undefined) return;
    if (!this.items.includes(item)) return;
    item.pages = pages;
    this.emit();
  }

  removeItem(id: string): void {
    if (this.running) return;
    this.items = this.items.filter((i) => i.id !== id);
    this.emit();
  }

  clearFinished(): void {
    if (this.running) return;
    this.items = this.items.filter((i) => i.status !== 'done' && i.status !== 'skipped');
    this.emit();
  }

  retryFailed(): void {
    if (this.running) return;
    for (const item of this.items) {
      if (item.status === 'failed' || item.status === 'canceled') {
        item.status = 'pending';
        item.message = undefined;
      }
    }
    this.emit();
  }

  cancel(): void {
    if (!this.running) return;
    this.canceled = true;
    this.deps.printService.cancel();
    for (const item of this.items) {
      if (item.status === 'pending' || item.status === 'converting') {
        item.status = 'canceled';
        item.message = '已取消';
      }
    }
    this.emit();
  }

  async start(options: PrintOptions, flags: StartFlags = {}): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.canceled = false;
    for (const item of this.items) {
      if (item.status === 'failed' || item.status === 'canceled' || item.status === 'skipped') {
        item.status = 'pending';
        item.message = undefined;
      }
    }
    this.emit();

    while (!this.canceled) {
      const item = this.items.find((i) => i.status === 'pending');
      if (!item) break;
      await this.processItem(item, options, flags);
      this.emit();
    }

    if (this.canceled) {
      for (const item of this.items) {
        if (item.status === 'pending') {
          item.status = 'canceled';
          item.message = '已取消';
        }
      }
    }
    this.running = false;
    this.canceled = false;
    this.emit();
  }

  private async processItem(item: PrintItem, options: PrintOptions, flags: StartFlags): Promise<void> {
    try {
      if (item.kind === 'unsupported') {
        item.status = 'skipped';
        item.message = '不支持的文件类型';
        return;
      }

      let pdfPath = item.path;
      if (item.kind === 'office') {
        if (!this.deps.dryRun) {
          const soffice = this.deps.locateSoffice();
          if (!soffice) {
            if (flags.skipOfficeWhenNoConverter) {
              item.status = 'skipped';
              item.message = '未安装 LibreOffice，已跳过';
              return;
            }
            throw new Error('未检测到 LibreOffice，无法转换 Office 文档');
          }
          item.status = 'converting';
          item.message = '转换中';
          this.emit();
          const outDir = path.join(this.deps.tempRoot, item.id);
          pdfPath = await convertToPdf({
            sofficePath: soffice,
            sourcePath: item.path,
            outDir,
            profileDir: path.join(this.deps.tempRoot, 'lo-profile'),
          });
          item.pdfPath = pdfPath;
          const pages = await countPdfPages(pdfPath);
          if (pages !== undefined) item.pages = pages;
          this.emit();
        } else {
          item.status = 'converting';
          item.message = '转换中';
          this.emit();
          await new Promise((r) => setTimeout(r, 250));
        }
        if (this.canceled) {
          item.status = 'canceled';
          item.message = '已取消';
          return;
        }
      }

      item.status = 'printing';
      item.message = '打印中';
      this.emit();
      const result = await this.deps.printService.print(pdfPath, options, {
        name: item.name,
        totalPages: item.pages,
        onProgress: (progress) => {
          item.pagesDone = progress.done;
          if (progress.total !== undefined) item.pagesTotal = progress.total;
          this.emit();
        },
      });
      item.status = 'done';
      if (item.pages !== undefined) item.pagesDone = item.pagesTotal ?? item.pages;
      item.message =
        result.warning ?? (result.jobId && result.jobId !== 'dry-run' ? `任务 ${result.jobId}` : '已提交');
    } catch (err) {
      if (this.canceled) {
        item.status = 'canceled';
        item.message = '已取消';
      } else {
        item.status = 'failed';
        item.message = err instanceof Error ? err.message : String(err);
      }
    }
  }

  private emit(): void {
    this.deps.onUpdate(this.snapshot(), this.summary());
  }
}
