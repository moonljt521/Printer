import * as fs from 'fs';
import * as path from 'path';
import { AppSettings, DEFAULT_SETTINGS } from '../core/types';

export class SettingsService {
  private filePath: string;
  private data: AppSettings;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, 'settings.json');
    this.data = this.load();
  }

  private load(): AppSettings {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return normalizeSettings(parsed);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  get(): AppSettings {
    return this.data;
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.data = normalizeSettings({ ...this.data, ...patch });
    this.save();
    return this.data;
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('settings save failed:', err);
    }
  }
}

export function normalizeSettings(input: Partial<AppSettings>): AppSettings {
  const result: AppSettings = {
    version: 1,
    rememberOptions: input.rememberOptions !== false,
    lastOptions: {},
  };
  if (input.libreOfficePath) result.libreOfficePath = input.libreOfficePath;
  if (input.sumatraPath) result.sumatraPath = input.sumatraPath;
  if (input.lastOptions) {
    const lo = input.lastOptions;
    if (typeof lo.printer === 'string') result.lastOptions.printer = lo.printer;
    if (typeof lo.copies === 'number') result.lastOptions.copies = lo.copies;
    if (lo.paper) result.lastOptions.paper = lo.paper;
    if (lo.duplex) result.lastOptions.duplex = lo.duplex;
    if (lo.color) result.lastOptions.color = lo.color;
  }
  return result;
}
