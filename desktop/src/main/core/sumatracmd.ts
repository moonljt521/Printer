import { PrintOptions } from './types';

export function buildSumatraArgs(filePath: string, options: PrintOptions): string[] {
  const settings: string[] = [];
  const copies = Math.max(1, Math.floor(options.copies) || 1);

  if (copies > 1) settings.push(`${copies}x`);
  if (options.paper !== 'default') settings.push(`paper=${options.paper}`);
  if (options.duplex === 'long') settings.push('duplexlong');
  else if (options.duplex === 'short') settings.push('duplexshort');
  else if (options.duplex === 'simplex') settings.push('simplex');
  if (options.color === 'mono') settings.push('monochrome');
  else if (options.color === 'color') settings.push('color');

  const args: string[] = ['-print-to', options.printer];
  if (settings.length > 0) args.push('-print-settings', settings.join(','));
  args.push('-silent', '-exit-when-done', filePath);
  return args;
}
