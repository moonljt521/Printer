function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element: ${id}`);
  return node as T;
}

function fmtSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待',
  converting: '转换中',
  printing: '打印中',
  done: '已完成',
  failed: '失败',
  canceled: '已取消',
  skipped: '已跳过',
};

function kindBadge(kind: string, name: string): { text: string; cls: string } {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (kind === 'pdf') return { text: 'PDF', cls: 'badge-pdf' };
  if (kind === 'office') return { text: ext.toUpperCase().slice(0, 4), cls: 'badge-office' };
  return { text: ext.toUpperCase().slice(0, 4) || 'FILE', cls: 'badge-other' };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusText(item: PrintItemDto): string {
  const label = STATUS_LABELS[item.status] ?? item.status;
  if (item.status === 'printing') {
    const total = item.pagesTotal ?? item.pages;
    if (item.pagesDone !== undefined && item.pagesDone > 0) {
      return total ? `打印中 ${item.pagesDone}/${total} 页` : `打印中 已 ${item.pagesDone} 页`;
    }
    if (total) return `打印中（共 ${total} 页）`;
  }
  if (item.message && (item.status === 'failed' || item.status === 'skipped')) {
    return `${label}：${item.message}`;
  }
  return label;
}

function setupDropZone(onPaths: (paths: string[]) => void): void {
  const overlay = el('drop-overlay');
  let depth = 0;
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    overlay.classList.remove('hidden');
  });
  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.classList.add('hidden');
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    overlay.classList.add('hidden');
    const files = Array.from(e.dataTransfer?.files ?? []);
    const paths = files.map((f) => window.api.getPathForFile(f)).filter(Boolean);
    if (paths.length > 0) onPaths(paths);
  });
}
