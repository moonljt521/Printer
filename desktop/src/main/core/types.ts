export type FileKind = 'pdf' | 'office' | 'unsupported';

export type ItemStatus =
  | 'pending'
  | 'converting'
  | 'printing'
  | 'done'
  | 'failed'
  | 'canceled'
  | 'skipped';

export interface PrintItem {
  id: string;
  path: string;
  name: string;
  kind: FileKind;
  size: number;
  status: ItemStatus;
  message?: string;
  pdfPath?: string;
  pages?: number;
  pagesDone?: number;
  pagesTotal?: number;
}

export type PaperSize = 'default' | 'A4' | 'A3' | 'Letter';
export type DuplexMode = 'default' | 'simplex' | 'long' | 'short';
export type ColorMode = 'default' | 'color' | 'mono';

export interface PrintOptions {
  printer: string;
  copies: number;
  paper: PaperSize;
  duplex: DuplexMode;
  color: ColorMode;
}

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
  offline?: boolean;
}

export interface AppSettings {
  version: 1;
  rememberOptions: boolean;
  lastOptions: Partial<PrintOptions>;
  libreOfficePath?: string;
  sumatraPath?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  rememberOptions: true,
  lastOptions: {},
};

export interface EnvStatus {
  platform: string;
  isPackaged: boolean;
  dryRun: boolean;
  libreOffice: { found: boolean; path?: string };
  sumatra: { found: boolean; path?: string };
  integrated: boolean;
}

export interface InitData {
  mode: 'print' | 'settings';
  version: string;
  files: PrintItem[];
  settings: AppSettings;
  env: EnvStatus;
  printers: PrinterInfo[];
  smoke: boolean;
}
