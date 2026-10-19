import { AppSettings, EnvStatus } from '../core/types';
import { locateSoffice } from './converter';
import { locateSumatra } from './sumatra';

export function computeEnv(opts: {
  settings: AppSettings;
  isPackaged: boolean;
  resourcesPath: string;
  userDataDir: string;
  dryRun: boolean;
  integrated: boolean;
}): EnvStatus {
  const soffice = locateSoffice(opts.settings.libreOfficePath);
  const sumatra = locateSumatra(opts.settings.sumatraPath, opts.userDataDir, opts.resourcesPath);
  return {
    platform: process.platform,
    isPackaged: opts.isPackaged,
    dryRun: opts.dryRun,
    libreOffice: soffice ? { found: true, path: soffice } : { found: false },
    sumatra: sumatra ? { found: true, path: sumatra } : { found: false },
    integrated: opts.integrated,
  };
}
