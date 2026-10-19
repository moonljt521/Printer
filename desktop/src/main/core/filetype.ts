import * as path from 'path';
import { FileKind } from './types';

export const OFFICE_EXTENSIONS = new Set([
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'odt', 'ods', 'odp', 'rtf',
]);

export const MENU_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
];

export function getExtension(filePath: string): string {
  return path.extname(filePath).replace(/^\./, '').toLowerCase();
}

export function classify(filePath: string): FileKind {
  const ext = getExtension(filePath);
  if (ext === 'pdf') return 'pdf';
  if (OFFICE_EXTENSIONS.has(ext)) return 'office';
  return 'unsupported';
}
