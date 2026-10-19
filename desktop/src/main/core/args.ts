import * as path from 'path';

export interface ParsedAppArgs {
  files: string[];
  dryRun: boolean;
  smokeDir?: string;
  captureArgs?: string;
}

export interface ParseContext {
  cwd: string;
  execPath: string;
  isFile: (absPath: string) => boolean;
}

export function parseAppArgs(argv: string[], ctx: ParseContext): ParsedAppArgs {
  const files: string[] = [];
  let dryRun = false;
  let smokeDir: string | undefined;
  let captureArgs: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--smoke') {
      smokeDir = argv[++i] ?? '.smoke';
      continue;
    }
    if (arg === '--capture-args') {
      captureArgs = argv[++i] ?? 'capture-args.json';
      continue;
    }
    if (arg === '--') continue;
    if (arg.startsWith('--')) continue;
    if (arg === '.') continue;
    const abs = path.isAbsolute(arg) ? path.normalize(arg) : path.resolve(ctx.cwd, arg);
    if (abs === ctx.execPath) continue;
    if (!ctx.isFile(abs)) continue;
    files.push(abs);
  }

  const result: ParsedAppArgs = { files, dryRun };
  if (smokeDir !== undefined) result.smokeDir = smokeDir;
  if (captureArgs !== undefined) result.captureArgs = captureArgs;
  return result;
}
