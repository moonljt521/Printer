export function buildSofficeArgs(files: string[], outDir: string, profileDir: string): string[] {
  const profileUrl = `file://${profileDir}`;
  return [
    '--headless',
    '--norestore',
    '--nologo',
    '--nolockcheck',
    `-env:UserInstallation=${profileUrl}`,
    '--convert-to',
    'pdf',
    '--outdir',
    outDir,
    ...files,
  ];
}

export function convertedPdfName(sourcePath: string): string {
  const base = sourcePath.replace(/\\/g, '/').split('/').pop() ?? sourcePath;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${stem}.pdf`;
}
