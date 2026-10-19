import { spawn, execFile, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildLpArgs, parseLpJobId } from '../core/lpcmd';
import { buildSumatraArgs } from '../core/sumatracmd';
import { PrintOptions } from '../core/types';
import {
  buildIpptoolArgs,
  IPPTOOL_GET_JOB_SCRIPT,
  parseIpptoolOutput,
  parseNumericJobId,
  JOB_STATE_ABORTED,
  JOB_STATE_CANCELED,
  JOB_STATE_COMPLETED,
} from '../core/jobprogress';

export interface PrintProgress {
  done: number;
  total?: number;
}

export interface PrintTracking {
  name: string;
  totalPages?: number;
  onProgress?: (progress: PrintProgress) => void;
}

export interface PrintResult {
  jobId?: string;
  warning?: string;
}

const POLL_INTERVAL_MS = 700;
const MIN_JOB_WAIT_MS = 300_000;
const CUPS_ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureIpptoolScript(): string {
  const scriptPath = path.join(os.tmpdir(), 'batchprinter-ipptool-getjob.ipp');
  try {
    if (!fs.existsSync(scriptPath)) fs.writeFileSync(scriptPath, IPPTOOL_GET_JOB_SCRIPT, 'utf8');
  } catch {
    // ignore
  }
  return scriptPath;
}

export class PrintService {
  private dryRun: boolean;
  private currentChild: ChildProcess | null = null;
  private canceled = false;
  private sumatraExe: string | undefined;
  private currentMacJob: { queue: string; id: number } | null = null;

  constructor(opts: { dryRun: boolean }) {
    this.dryRun = opts.dryRun;
  }

  cancel(): void {
    this.canceled = true;
    if (this.currentChild) {
      try {
        this.currentChild.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
    const job = this.currentMacJob;
    if (job) {
      try {
        spawn('cancel', [`${job.queue}-${job.id}`], { windowsHide: true, stdio: 'ignore' });
      } catch {
        // ignore
      }
    }
  }

  private spawnCapture(command: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true, env: CUPS_ENV });
      this.currentChild = child;
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        reject(new Error('打印超时'));
      }, timeoutMs);
      child.stdout.on('data', (d) => (stdout += String(d)));
      child.stderr.on('data', (d) => (stderr += String(d)));
      child.on('error', (err) => {
        clearTimeout(timer);
        this.currentChild = null;
        reject(new Error(`无法启动打印程序: ${err.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        this.currentChild = null;
        if (this.canceled) {
          reject(new Error('已取消'));
          return;
        }
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr.trim() || stdout.trim() || `退出码 ${code}`));
      });
    });
  }

  private execFileCapture(command: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { timeout: timeoutMs, windowsHide: true, env: CUPS_ENV, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(String(stdout));
      });
    });
  }

  setSumatraPath(exePath: string | undefined): void {
    this.sumatraExe = exePath;
  }

  async print(pdfPath: string, options: PrintOptions, tracking?: PrintTracking): Promise<PrintResult> {
    this.canceled = false;
    if (this.dryRun) return this.printDryRun(tracking);
    if (process.platform === 'darwin') return this.printMac(pdfPath, options, tracking);
    if (process.platform === 'win32') return this.printWindows(pdfPath, options, tracking);
    throw new Error(`当前系统暂不支持: ${process.platform}`);
  }

  private async printDryRun(tracking?: PrintTracking): Promise<PrintResult> {
    const total = Math.max(1, tracking?.totalPages ?? 3);
    for (let i = 1; i <= total; i++) {
      await sleep(130);
      if (this.canceled) throw new Error('已取消');
      tracking?.onProgress?.({ done: i, total });
    }
    return { jobId: 'dry-run' };
  }

  private async printMac(pdfPath: string, options: PrintOptions, tracking?: PrintTracking): Promise<PrintResult> {
    const args = buildLpArgs(pdfPath, options);
    const { stdout } = await this.spawnCapture('lp', args, 60000);
    const jobId = parseLpJobId(stdout);
    const result: PrintResult = {};
    if (jobId) result.jobId = jobId;

    const numericId = jobId ? parseNumericJobId(jobId) : undefined;
    if (!numericId) return result;

    this.currentMacJob = { queue: options.printer, id: numericId };
    try {
      const finished = await this.waitForMacJob(options.printer, numericId, tracking);
      if (!finished) result.warning = '已提交（任务跟踪超时，请确认打印机状态）';
    } finally {
      this.currentMacJob = null;
    }
    return result;
  }

  private async waitForMacJob(queue: string, jobId: number, tracking?: PrintTracking): Promise<boolean> {
    const scriptPath = ensureIpptoolScript();
    const capMs = Math.max(MIN_JOB_WAIT_MS, (tracking?.totalPages ?? 0) * 15_000);
    const started = Date.now();
    let lastDone: number | undefined;
    let lastTotal: number | undefined;
    let ippFailures = 0;

    while (Date.now() - started < capMs) {
      if (this.canceled) throw new Error('已取消');

      let info: ReturnType<typeof parseIpptoolOutput> | undefined;
      if (ippFailures < 3) {
        try {
          const out = await this.execFileCapture(
            '/usr/bin/ipptool',
            buildIpptoolArgs(queue, jobId, scriptPath),
            15000,
          );
          ippFailures = 0;
          info = parseIpptoolOutput(out);
        } catch {
          ippFailures++;
        }
      }

      if (info) {
        const totalChanged = info.impressions !== undefined && info.impressions !== lastTotal;
        if (info.impressions !== undefined) lastTotal = info.impressions;
        const doneChanged =
          info.impressionsCompleted !== undefined && info.impressionsCompleted !== lastDone;
        if (info.impressionsCompleted !== undefined) lastDone = info.impressionsCompleted;
        if ((doneChanged || totalChanged) && lastDone !== undefined) {
          const total = lastTotal ?? tracking?.totalPages;
          tracking?.onProgress?.(total !== undefined ? { done: lastDone, total } : { done: lastDone });
        }
        if (info.stateCode === JOB_STATE_COMPLETED) return true;
        if (info.stateCode === JOB_STATE_CANCELED) throw new Error('打印任务已取消');
        if (info.stateCode === JOB_STATE_ABORTED) throw new Error('打印任务被中止');
      }

      const listing = await this.execFileCapture('/usr/bin/lpstat', ['-o', queue], 10000).catch(
        () => undefined,
      );
      if (listing !== undefined) {
        const stillQueued = new RegExp(`^\\S*-${jobId}(?:\\s|$)`, 'm').test(listing);
        if (!stillQueued) return true;
      }

      await sleep(POLL_INTERVAL_MS);
    }
    return false;
  }

  private async printWindows(pdfPath: string, options: PrintOptions, tracking?: PrintTracking): Promise<PrintResult> {
    const exe = this.sumatraExe;
    if (!exe) throw new Error('缺少打印组件 SumatraPDF，请在设置中下载');
    const args = buildSumatraArgs(pdfPath, options);
    const timer =
      tracking?.onProgress !== undefined
        ? setInterval(() => void this.pollWindowsSpooler(tracking), 1200)
        : null;
    try {
      await this.spawnCapture(exe, args, 300000);
    } finally {
      if (timer) clearInterval(timer);
    }
    return {};
  }

  private async pollWindowsSpooler(tracking: PrintTracking): Promise<void> {
    if (!tracking.onProgress) return;
    const script =
      'Get-CimInstance Win32_PrintJob | Select-Object Document,TotalPages,PagesPrinted | ConvertTo-Json -Compress';
    try {
      const out = await this.execFileCapture(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        8000,
      );
      const trimmed = out.trim();
      if (!trimmed) return;
      const data: unknown = JSON.parse(trimmed);
      const jobs = Array.isArray(data) ? (data as Record<string, unknown>[]) : [data as Record<string, unknown>];
      const base = tracking.name;
      const job = jobs.find(
        (j) => typeof j.Document === 'string' && (j.Document === base || (j.Document as string).includes(base)),
      );
      if (job && typeof job.PagesPrinted === 'number') {
        const total = typeof job.TotalPages === 'number' && job.TotalPages > 0 ? job.TotalPages : undefined;
        tracking.onProgress(total !== undefined ? { done: job.PagesPrinted, total } : { done: job.PagesPrinted });
      }
    } catch {
      // best effort only
    }
  }
}
