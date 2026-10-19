import { execFile } from 'child_process';
import { parseLpstat } from '../core/lpstats';
import { PrinterInfo } from '../core/types';

export interface NativePrinter {
  name: string;
  displayName?: string;
  description?: string;
}

function exec(command: string, args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

function execRaw(
  command: string,
  args: string[],
  timeout = 15000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true, encoding: 'utf8' }, (_err, stdout, stderr) => {
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

export async function listPrinters(
  platform: NodeJS.Platform,
  native?: () => Promise<NativePrinter[]>,
): Promise<PrinterInfo[]> {
  if (platform === 'darwin') return listPrintersMac(native);
  if (platform === 'win32') return listPrintersWindows();
  throw new Error(`当前系统暂不支持: ${platform}`);
}

async function listPrintersMac(native?: () => Promise<NativePrinter[]>): Promise<PrinterInfo[]> {
  let names: string[] = [];
  if (native) {
    try {
      names = (await native()).map((p) => p.name).filter(Boolean);
    } catch {
      names = [];
    }
  }
  if (names.length === 0) {
    const { stdout, stderr } = await execRaw('lpstat', ['-p']);
    names = parseLpstat(`${stdout}\n${stderr}`).printers.map((p) => p.name);
  }
  if (names.length === 0) return [];

  let defaultPrinter: string | undefined;
  try {
    const { stdout } = await execRaw('lpstat', ['-d']);
    const last = stdout.trim().split(/\s+/).pop();
    if (last && names.includes(last)) defaultPrinter = last;
  } catch {
    defaultPrinter = undefined;
  }

  return names.map((name) => {
    const info: PrinterInfo = { name, isDefault: name === defaultPrinter, status: '' };
    return info;
  });
}

interface WinPrinter {
  Name?: string;
  Default?: boolean;
  WorkOffline?: boolean;
}

async function listPrintersWindows(): Promise<PrinterInfo[]> {
  const script = [
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
    'Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline | ConvertTo-Json -Compress',
  ].join('; ');
  const stdout = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 20000);
  const text = stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text) as WinPrinter | WinPrinter[];
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr
    .filter((p) => p.Name)
    .map((p) => ({
      name: p.Name as string,
      isDefault: p.Default === true,
      status: p.WorkOffline ? '离线' : '就绪',
      offline: p.WorkOffline === true,
    }));
}
