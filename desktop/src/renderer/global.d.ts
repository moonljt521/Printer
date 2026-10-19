interface PrintItemDto {
  id: string;
  path: string;
  name: string;
  kind: string;
  size: number;
  status: string;
  message?: string;
  pages?: number;
  pagesDone?: number;
  pagesTotal?: number;
}

interface PrinterDto {
  name: string;
  isDefault: boolean;
  status: string;
  offline?: boolean;
}

interface EnvStatusDto {
  platform: string;
  isPackaged: boolean;
  dryRun: boolean;
  libreOffice: { found: boolean; path?: string };
  sumatra: { found: boolean; path?: string };
  integrated: boolean;
}

interface AppSettingsDto {
  version: number;
  rememberOptions: boolean;
  lastOptions: {
    printer?: string;
    copies?: number;
    paper?: string;
    duplex?: string;
    color?: string;
  };
  libreOfficePath?: string;
  sumatraPath?: string;
}

interface InitDataDto {
  mode: string;
  version: string;
  files: PrintItemDto[];
  settings: AppSettingsDto;
  env: EnvStatusDto;
  printers: PrinterDto[];
  smoke: boolean;
}

interface QueueSummaryDto {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  canceled: number;
  currentId: string | null;
}

interface WindowApi {
  init(): Promise<InitDataDto>;
  listPrinters(): Promise<{ ok: boolean; printers: PrinterDto[]; error?: string }>;
  start(
    options: { printer: string; copies: number; paper: string; duplex: string; color: string },
    flags: { skipOfficeWhenNoConverter?: boolean },
  ): Promise<{ ok: boolean; error?: string }>;
  cancel(): Promise<{ ok: boolean }>;
  retry(): Promise<{ ok: boolean }>;
  clearFinished(): Promise<{ ok: boolean }>;
  removeFile(id: string): Promise<{ ok: boolean }>;
  addFiles(paths: string[]): Promise<{ ok: boolean; added?: number }>;
  showItem(p: string): Promise<{ ok: boolean }>;
  openExternal(url: string): Promise<{ ok: boolean }>;
  integrationStatus(): Promise<{ ok: boolean; integrated: boolean }>;
  installIntegration(): Promise<{ ok: boolean; integrated?: boolean; error?: string }>;
  uninstallIntegration(): Promise<{ ok: boolean; integrated?: boolean; error?: string }>;
  saveSettings(patch: Partial<AppSettingsDto>): Promise<AppSettingsDto>;
  pickSoffice(): Promise<{ ok: boolean; path?: string; error?: string }>;
  envStatus(): Promise<EnvStatusDto>;
  downloadSumatra(): Promise<{ ok: boolean; path?: string; error?: string }>;
  closeWindow(): Promise<{ ok: boolean }>;
  onQueueUpdate(cb: (data: { items: PrintItemDto[]; summary: QueueSummaryDto }) => void): void;
  onSumatraProgress(cb: (data: { phase: string; received: number; total: number }) => void): void;
  getPathForFile(file: File): string;
}

interface Window {
  api: WindowApi;
  __summary?: QueueSummaryDto;
}
