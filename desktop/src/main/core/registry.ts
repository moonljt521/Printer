export const REG_BASE = 'HKCU\\Software\\Classes\\SystemFileAssociations';
export const VERB_KEY = 'BatchPrinter';
export const VERB_LABEL = '批量打印';

export function verbKeyFor(ext: string): string {
  return `${REG_BASE}\\.${ext}\\shell\\${VERB_KEY}`;
}

export function buildInstallCommands(commandLine: string, exePath: string, extensions: string[]): string[][] {
  const commands: string[][] = [];
  for (const ext of extensions) {
    const key = verbKeyFor(ext);
    commands.push(['add', key, '/ve', '/d', VERB_LABEL, '/f']);
    commands.push(['add', key, '/v', 'Icon', '/d', `"${exePath}",0`, '/f']);
    commands.push(['add', key, '/v', 'MultiSelectModel', '/d', 'Player', '/f']);
    commands.push(['add', `${key}\\command`, '/ve', '/d', commandLine, '/f']);
  }
  return commands;
}

export function buildUninstallCommands(extensions: string[]): string[][] {
  const commands: string[][] = [];
  for (const ext of extensions) {
    commands.push(['delete', verbKeyFor(ext), '/f']);
  }
  return commands;
}

export function buildQueryCommands(extensions: string[]): string[][] {
  const commands: string[][] = [];
  for (const ext of extensions) {
    commands.push(['query', verbKeyFor(ext)]);
  }
  return commands;
}
