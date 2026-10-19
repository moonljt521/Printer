import { spawn, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { buildSofficeArgs, convertedPdfName } from '../core/soffice';

const MAC_CANDIDATES = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/local/bin/soffice',
];

const WIN_CANDIDATES = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice 7\\program\\soffice.exe',
];

export function locateSoffice(override?: string): string | undefined {
  if (override && fs.existsSync(override)) return override;
  const platform = process.platform;
  const candidates = platform === 'darwin' ? MAC_CANDIDATES : platform === 'win32' ? WIN_CANDIDATES : [];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const which = platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(which, ['soffice'], { encoding: 'utf8', timeout: 5000 }).trim();
    const first = out.split(/\r?\n/)[0].trim();
    if (first && fs.existsSync(first)) return first;
  } catch {
    // not found
  }
  return undefined;
}

export async function convertToPdf(opts: {
  sofficePath: string;
  sourcePath: string;
  outDir: string;
  profileDir: string;
  timeoutMs?: number;
}): Promise<string> {
  const { sofficePath, sourcePath, outDir, profileDir } = opts;
  const timeoutMs = opts.timeoutMs ?? 120000;
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const args = buildSofficeArgs([sourcePath], outDir, profileDir);
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(sofficePath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('转换超时'));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`无法启动 LibreOffice: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || stdout.trim() || `LibreOffice 退出码 ${code}`));
    });
  });

  const pdfPath = path.join(outDir, convertedPdfName(sourcePath));
  if (!fs.existsSync(pdfPath)) {
    const hint = output.trim() ? ` (${output.trim()})` : '';
    throw new Error(`转换未生成 PDF${hint}`);
  }
  return pdfPath;
}
