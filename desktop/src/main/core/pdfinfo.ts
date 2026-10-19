import * as fs from 'fs';
import { PDFDocument } from 'pdf-lib';

const MAX_SIZE_BYTES = 200 * 1024 * 1024;

export async function countPdfPages(filePath: string): Promise<number | undefined> {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SIZE_BYTES) return undefined;
  } catch {
    return undefined;
  }
  try {
    const bytes = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const count = doc.getPageCount();
    return count > 0 ? count : undefined;
  } catch {
    return undefined;
  }
}
