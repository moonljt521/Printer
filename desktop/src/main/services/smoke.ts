import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const MINIMAL_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
trailer<</Root 1 0 R/Size 4>>
%%EOF
`;

export function createSmokeSamples(dir: string): string[] {
  const sampleDir = path.join(dir, 'samples');
  fs.mkdirSync(sampleDir, { recursive: true });
  const files: [string, string][] = [
    ['合同样本.pdf', MINIMAL_PDF],
    ['第二份 报表.pdf', MINIMAL_PDF],
    ['季度报表.docx', 'fake docx for smoke test'],
    ['演示文稿.pptx', 'fake pptx for smoke test'],
    ['随手笔记.txt', 'unsupported type sample'],
  ];
  return files.map(([name, content]) => {
    const full = path.join(sampleDir, name);
    fs.writeFileSync(full, content, 'utf8');
    return full;
  });
}

export async function saveScreenshot(win: BrowserWindow, filePath: string): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const image = await win.webContents.capturePage();
  fs.writeFileSync(filePath, image.toPNG());
}

export function waitForLoad(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    if (!win.webContents.isLoading()) {
      resolve();
      return;
    }
    win.webContents.once('did-finish-load', () => resolve());
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
