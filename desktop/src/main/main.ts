import { app, BrowserWindow, Menu, dialog, ipcMain, shell as electronShell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseAppArgs, ParsedAppArgs } from './core/args';
import { AppSettings, InitData, PrintOptions } from './core/types';
import { computeEnv } from './services/env';
import { SettingsService } from './services/settings';
import { listPrinters } from './services/printers';
import { PrintQueue } from './services/queue';
import { PrintService } from './services/printer';
import { Aggregator } from './services/aggregator';
import { ShellIntegration } from './services/shellint';
import { locateSoffice } from './services/converter';
import { DownloadProgress, downloadSumatra, locateSumatra } from './services/sumatra';
import { createSmokeSamples, delay, saveScreenshot, waitForLoad } from './services/smoke';

app.setName('BatchPrinter');

type WindowMode = 'print' | 'settings';

interface AppState {
  window: BrowserWindow | null;
  mode: WindowMode | null;
  queue: PrintQueue | null;
  tempRoot: string | null;
  settings: SettingsService;
  shellInt: ShellIntegration;
  printService: PrintService;
  aggregator: Aggregator;
  dryRun: boolean;
  captureTarget: string | null;
}

const state: Partial<AppState> = {};

function requireState(): AppState {
  return state as AppState;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function parseCtx() {
  return { cwd: process.cwd(), execPath: process.execPath, isFile };
}

function refreshSumatraPath(): void {
  const s = requireState();
  const found = locateSumatra(s.settings.get().sumatraPath, app.getPath('userData'), process.resourcesPath);
  s.printService.setSumatraPath(found);
}

function createWindow(mode: WindowMode, hidden = false): BrowserWindow {
  const win = new BrowserWindow({
    width: mode === 'print' ? 820 : 700,
    height: mode === 'print' ? 720 : 640,
    minWidth: 660,
    minHeight: 480,
    title: '批量打印助手',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (!hidden) win.once('ready-to-show', () => win.show());
  const page = mode === 'print' ? '../renderer/print.html' : '../renderer/settings.html';
  void win.loadFile(path.join(__dirname, page));
  return win;
}

function destroyWindow(): void {
  const s = requireState();
  if (s.queue) {
    try {
      s.queue.cancel();
    } catch {
      // ignore
    }
    s.queue = null;
  }
  if (s.window && !s.window.isDestroyed()) s.window.destroy();
  s.window = null;
  s.mode = null;
}

function createPrintWindow(files: string[]): void {
  const s = requireState();
  destroyWindow();
  cleanupTemp();
  s.tempRoot = fs.mkdtempSync(path.join(app.getPath('temp'), 'BatchPrinter-'));
  s.mode = 'print';
  const win = createWindow('print', isSmokeRun());
  s.window = win;
  s.queue = new PrintQueue({
    printService: s.printService,
    locateSoffice: () => locateSoffice(s.settings.get().libreOfficePath),
    tempRoot: s.tempRoot,
    dryRun: s.dryRun,
    onUpdate: (items, summary) => {
      if (!win.isDestroyed()) win.webContents.send('queue:update', { items, summary });
    },
  });
  s.queue.addFiles(files);
  win.on('closed', () => {
    if (s.window !== win) return;
    if (s.queue) {
      const summary = s.queue.summary();
      if (summary.running) s.queue.cancel();
    }
    s.queue = null;
    cleanupTemp();
    s.window = null;
    s.mode = null;
  });
}

function createSettingsWindow(): void {
  const s = requireState();
  destroyWindow();
  s.mode = 'settings';
  const win = createWindow('settings', isSmokeRun());
  s.window = win;
  win.on('closed', () => {
    if (s.window !== win) return;
    s.window = null;
    s.mode = null;
  });
}

function cleanupTemp(): void {
  const s = requireState();
  if (s.tempRoot) {
    try {
      fs.rmSync(s.tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
    s.tempRoot = null;
  }
}

let smokeMode = false;
let captureMode = false;
let captureFiles = new Set<string>();
let captureTarget: string | null = null;
let captureTimer: NodeJS.Timeout | null = null;
let captureWritten = false;
const earlyFiles: string[] = [];

function isSmokeRun(): boolean {
  return smokeMode;
}

function queueFiles(paths: string[]): void {
  const s = requireState();
  if (s.aggregator) s.aggregator.add(paths);
  else earlyFiles.push(...paths);
}

function scheduleCaptureWrite(): void {
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = setTimeout(() => writeCapture(), 800);
}

function onFilesArrived(files: string[]): void {
  const s = requireState();
  if (captureMode) {
    for (const f of files) captureFiles.add(f);
    scheduleCaptureWrite();
    return;
  }
  if (s.mode === 'print' && s.queue && s.window && !s.window.isDestroyed()) {
    s.queue.addFiles(files);
    s.window.focus();
  } else {
    createPrintWindow(files);
  }
}

function buildInitData(mode: WindowMode): InitData {
  const s = requireState();
  const settings = s.settings.get();
  const env = computeEnv({
    settings,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    userDataDir: app.getPath('userData'),
    dryRun: s.dryRun,
    integrated: s.shellInt.status(),
  });
  return {
    mode,
    version: app.getVersion(),
    files: mode === 'print' && s.queue ? s.queue.snapshot() : [],
    settings,
    env,
    printers: [],
    smoke: smokeMode,
  };
}

function nativePrinterSource(): (() => Promise<{ name: string; displayName?: string }[]>) | undefined {
  const s = requireState();
  if (!s.window || s.window.isDestroyed()) return undefined;
  return () =>
    s.window!.webContents.getPrintersAsync().then((list) =>
      list.map((p) => ({ name: p.name, displayName: p.displayName })),
    );
}

function registerIpc(): void {
  ipcMain.handle('app:init', async () => {
    const s = requireState();
    const mode: WindowMode = s.mode ?? 'settings';
    const data = buildInitData(mode);
    try {
      data.printers = await listPrinters(process.platform, nativePrinterSource());
    } catch {
      data.printers = [];
    }
    return data;
  });

  ipcMain.handle('printers:list', async () => {
    try {
      return { ok: true, printers: await listPrinters(process.platform, nativePrinterSource()) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), printers: [] };
    }
  });

  ipcMain.handle('queue:start', async (_e, options: PrintOptions, flags: { skipOfficeWhenNoConverter?: boolean }) => {
    const s = requireState();
    if (!s.queue) return { ok: false, error: '没有待打印的文件' };
    const settings = s.settings.get();
    if (settings.rememberOptions) s.settings.update({ lastOptions: options });
    try {
      await s.queue.start(options, flags);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('queue:cancel', () => {
    requireState().queue?.cancel();
    return { ok: true };
  });

  ipcMain.handle('queue:retry', () => {
    requireState().queue?.retryFailed();
    return { ok: true };
  });

  ipcMain.handle('queue:clear-finished', () => {
    requireState().queue?.clearFinished();
    return { ok: true };
  });

  ipcMain.handle('files:add', (_e, paths: unknown) => {
    if (!Array.isArray(paths)) return { ok: false };
    const valid = paths.filter((p): p is string => typeof p === 'string' && isFile(p));
    if (valid.length > 0) onFilesArrived(valid);
    return { ok: true, added: valid.length };
  });

  ipcMain.handle('files:remove', (_e, id: string) => {
    requireState().queue?.removeItem(id);
    return { ok: true };
  });

  ipcMain.handle('shell:show-item', (_e, p: string) => {
    if (typeof p === 'string' && isFile(p)) electronShell.showItemInFolder(p);
    return { ok: true };
  });

  ipcMain.handle('shell:open', async (_e, url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) await electronShell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('integration:status', () => {
    return { ok: true, integrated: requireState().shellInt.status() };
  });

  ipcMain.handle('integration:install', () => {
    try {
      requireState().shellInt.install();
      return { ok: true, integrated: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('integration:uninstall', () => {
    try {
      requireState().shellInt.uninstall();
      return { ok: true, integrated: false };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('settings:get', () => requireState().settings.get());

  ipcMain.handle('settings:save', (_e, patch: Partial<AppSettings>) => {
    const updated = requireState().settings.update(patch);
    refreshSumatraPath();
    return updated;
  });

  ipcMain.handle('settings:pick-soffice', async () => {
    const s = requireState();
    const result = await dialog.showOpenDialog({
      title: '选择 LibreOffice 程序 (soffice)',
      properties: ['openFile', 'showHiddenFiles'],
      defaultPath: process.platform === 'darwin' ? '/Applications' : 'C:\\Program Files',
    });
    const picked = result.filePaths[0];
    if (picked) {
      const isBundle = picked.endsWith('.app');
      const sofficePath = isBundle ? path.join(picked, 'Contents', 'MacOS', 'soffice') : picked;
      if (fs.existsSync(sofficePath)) {
        s.settings.update({ libreOfficePath: sofficePath });
        return { ok: true, path: sofficePath };
      }
      return { ok: false, error: '所选路径中未找到 soffice 程序' };
    }
    return { ok: false, error: 'canceled' };
  });

  ipcMain.handle('env:status', () => buildInitData('settings').env);

  ipcMain.handle('sumatra:download', async () => {
    const s = requireState();
    try {
      const exe = await downloadSumatra({
        userDataDir: app.getPath('userData'),
        onProgress: (p: DownloadProgress) => {
          if (s.window && !s.window.isDestroyed()) s.window.webContents.send('sumatra:progress', p);
        },
      });
      s.settings.update({ sumatraPath: exe });
      refreshSumatraPath();
      return { ok: true, path: exe };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('win:close', () => {
    const s = requireState();
    if (s.window && !s.window.isDestroyed()) s.window.close();
    return { ok: true };
  });
}

async function runSmoke(dirArg: string, parsed: ParsedAppArgs): Promise<void> {
  const s = requireState();
  const dir = path.resolve(dirArg);
  const samples = createSmokeSamples(dir);
  const files = parsed.files.length > 0 ? parsed.files : samples;

  createPrintWindow(files);
  const win = s.window!;
  await waitForLoad(win);
  await delay(700);
  await saveScreenshot(win, path.join(dir, '01-print-list.png'));

  await win.webContents.executeJavaScript(`document.getElementById('btn-start').click()`);
  await delay(900);
  await saveScreenshot(win, path.join(dir, '02-print-running.png'));

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const idle = (await win.webContents.executeJavaScript(
      `(window.__summary && !window.__summary.running && window.__summary.total > 0)`,
    )) as boolean;
    if (idle) break;
    await delay(400);
  }
  await delay(400);
  await saveScreenshot(win, path.join(dir, '03-print-done.png'));

  destroyWindow();
  createSettingsWindow();
  const settingsWin = s.window!;
  await waitForLoad(settingsWin);
  await delay(700);
  await saveScreenshot(settingsWin, path.join(dir, '04-settings.png'));

  console.log('SMOKE_OK');
  app.quit();
}

function writeCapture(): void {
  if (captureWritten) return;
  captureWritten = true;
  try {
    fs.writeFileSync(captureTarget!, JSON.stringify({ files: [...captureFiles] }, null, 2), 'utf8');
    console.log(`CAPTURE_OK ${captureFiles.size}`);
  } catch (err) {
    console.error('CAPTURE_FAIL', err);
  }
  app.quit();
}

function setupApp(): void {
  const parsed = parseAppArgs(process.argv, parseCtx());
  const dryRun = parsed.dryRun || process.env.BATCHPRINTER_DRY_RUN === '1';

  smokeMode = !!parsed.smokeDir;
  captureMode = !!parsed.captureArgs;
  captureTarget = parsed.captureArgs ?? null;

  if (!smokeMode && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', (_e, argv) => {
    const p = parseAppArgs(argv, parseCtx());
    if (p.files.length > 0) queueFiles(p.files);
  });

  app.on('open-file', (e, p) => {
    e.preventDefault();
    queueFiles([p]);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    const s = requireState();
    if (!s.window && s.mode === null) createSettingsWindow();
  });

  app.whenReady().then(async () => {
    const s = requireState();
    s.settings = new SettingsService(app.getPath('userData'));
    s.shellInt = new ShellIntegration({
      userDataDir: app.getPath('userData'),
      appPath: app.getAppPath(),
      execPath: process.execPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
    });
    s.printService = new PrintService({ dryRun });
    s.dryRun = dryRun;
    s.queue = null;
    s.tempRoot = null;
    s.window = null;
    s.mode = null;
    refreshSumatraPath();
    s.aggregator = new Aggregator(captureMode ? 500 : 650, onFilesArrived);
    if (earlyFiles.length > 0) s.aggregator.add(earlyFiles.splice(0, earlyFiles.length));

    registerIpc();

    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
      );
    } else {
      Menu.setApplicationMenu(null);
    }

    if (captureMode) {
      s.aggregator.add(parsed.files);
      setTimeout(() => writeCapture(), 8000);
      return;
    }

    if (smokeMode) {
      await runSmoke(parsed.smokeDir!, parsed);
      return;
    }

    s.aggregator.add(parsed.files);
    setTimeout(() => {
      const st = requireState();
      if (!st.window && st.aggregator.pendingCount() === 0) createSettingsWindow();
    }, 900);
  });
}

setupApp();
