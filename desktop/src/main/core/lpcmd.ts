import { PaperSize, PrintOptions } from './types';

const PAPER_IPP: Record<string, string> = {
  A4: 'iso_a4_210x297mm',
  A3: 'iso_a3_297x420mm',
  Letter: 'na_letter_8.5x11in',
};

export function buildLpArgs(filePath: string, options: PrintOptions): string[] {
  const copies = Math.max(1, Math.floor(options.copies) || 1);
  const args: string[] = ['-d', options.printer, '-n', String(copies), '-o', 'job-sheets=none'];

  if (options.paper !== 'default') {
    const paper = PAPER_IPP[options.paper as PaperSize] ?? options.paper;
    args.push('-o', `media=${paper}`);
  }

  if (options.duplex === 'long') args.push('-o', 'sides=two-sided-long-edge');
  else if (options.duplex === 'short') args.push('-o', 'sides=two-sided-short-edge');
  else if (options.duplex === 'simplex') args.push('-o', 'sides=one-sided');

  if (options.color === 'mono') args.push('-o', 'print-color-mode=monochrome');
  else if (options.color === 'color') args.push('-o', 'print-color-mode=color');

  args.push(filePath);
  return args;
}

export function parseLpJobId(stdout: string): string | undefined {
  const english = stdout.match(/request id is (\S+)/);
  if (english) return english[1];
  const embedded = stdout.match(/([A-Za-z0-9_.:%@+-]+-\d+)/);
  return embedded ? embedded[1] : undefined;
}
