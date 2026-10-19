export interface ParsedPrinter {
  name: string;
  state: string;
}

export interface ParsedLpstat {
  printers: ParsedPrinter[];
  defaultPrinter?: string;
}

export function parseLpstat(output: string): ParsedLpstat {
  const printers: ParsedPrinter[] = [];
  let defaultPrinter: string | undefined;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    const printerMatch = line.match(/^printer (\S+) (?:is|now printing|disabled|is not accepting)/);
    if (printerMatch) {
      printers.push({ name: printerMatch[1], state: line.replace(/^printer \S+ /, '').trim() });
      continue;
    }
    const idleMatch = line.match(/^printer (\S+) is (.+)$/);
    if (idleMatch) {
      printers.push({ name: idleMatch[1], state: idleMatch[2].trim() });
      continue;
    }
    const defMatch = line.match(/^system default destination: (.+)$/);
    if (defMatch) {
      defaultPrinter = defMatch[1].trim();
      continue;
    }
  }

  const result: ParsedLpstat = { printers };
  if (defaultPrinter) result.defaultPrinter = defaultPrinter;
  return result;
}

export function printerStatusLabel(state: string): { label: string; offline: boolean } {
  const s = state.toLowerCase();
  if (s.includes('disabled') || s.includes('rejecting') || s.includes('not accepting')) {
    return { label: '已停用', offline: true };
  }
  if (s.includes('printing')) return { label: '打印中', offline: false };
  if (s.includes('idle')) return { label: '空闲', offline: false };
  return { label: state.replace(/\.$/, ''), offline: false };
}
