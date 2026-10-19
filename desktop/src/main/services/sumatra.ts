import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const WIN_CANDIDATES = [
  'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
  'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
];

export function locateSumatra(override?: string, userDataDir?: string, resourcesPath?: string): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const candidates: string[] = [];
  if (override) candidates.push(override);
  if (resourcesPath) candidates.push(path.join(resourcesPath, 'vendor', 'sumatra', 'SumatraPDF.exe'));
  if (userDataDir) candidates.push(path.join(userDataDir, 'sumatra', 'SumatraPDF.exe'));
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'SumatraPDF', 'SumatraPDF.exe'));
  candidates.push(...WIN_CANDIDATES);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const out = execFileSync('where', ['SumatraPDF'], { encoding: 'utf8', timeout: 5000 }).trim();
    const first = out.split(/\r?\n/)[0].trim();
    if (first && fs.existsSync(first)) return first;
  } catch {
    // not found
  }
  return undefined;
}

export interface DownloadProgress {
  phase: 'resolving' | 'downloading' | 'extracting' | 'done';
  received: number;
  total: number;
}

async function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BatchPrinter' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (!loc) return reject(new Error('重定向缺少目标地址'));
          res.resume();
          resolve(fetchJson(loc));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function download(url: string, dest: string, onProgress: (received: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { 'User-Agent': 'BatchPrinter' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          file.close();
          fs.rmSync(dest, { force: true });
          if (!loc) return reject(new Error('重定向缺少目标地址'));
          resolve(download(loc, dest, onProgress));
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.rmSync(dest, { force: true });
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers['content-length'] ?? 0);
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          onProgress(received, total);
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', (err) => {
        file.close();
        fs.rmSync(dest, { force: true });
        reject(err);
      });
  });
}

export async function downloadSumatra(opts: {
  userDataDir: string;
  onProgress: (p: DownloadProgress) => void;
}): Promise<string> {
  if (process.platform !== 'win32') throw new Error('仅 Windows 需要此组件');
  const { userDataDir, onProgress } = opts;
  onProgress({ phase: 'resolving', received: 0, total: 0 });

  const release = (await fetchJson('https://api.github.com/repos/sumatrapdfreader/sumatrapdf/releases/latest')) as {
    assets?: { name?: string; browser_download_url?: string }[];
  };
  const asset = (release.assets ?? []).find((a) => /-64\.zip$/.test(a.name ?? '')) ?? (release.assets ?? [])[0];
  if (!asset?.browser_download_url) throw new Error('未找到可下载的 SumatraPDF 发行包');

  const tmpDir = path.join(userDataDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, 'sumatra.zip');
  await download(asset.browser_download_url, zipPath, (received, total) =>
    onProgress({ phase: 'downloading', received, total }),
  );

  onProgress({ phase: 'extracting', received: 0, total: 0 });
  const extractDir = path.join(tmpDir, 'sumatra-extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${extractDir}" -Force`,
  ], { timeout: 120000 });

  const exeSource = findExe(extractDir);
  if (!exeSource) throw new Error('解压后未找到 SumatraPDF.exe');
  const destDir = path.join(userDataDir, 'sumatra');
  fs.mkdirSync(destDir, { recursive: true });
  const destExe = path.join(destDir, 'SumatraPDF.exe');
  fs.copyFileSync(exeSource, destExe);
  fs.rmSync(zipPath, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });

  onProgress({ phase: 'done', received: 0, total: 0 });
  return destExe;
}

function findExe(dir: string): string | undefined {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExe(full);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === 'sumatrapdf.exe') {
      return full;
    }
  }
  return undefined;
}
