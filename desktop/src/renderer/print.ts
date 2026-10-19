(() => {
  let files: PrintItemDto[] = [];
  let summary: QueueSummaryDto | null = null;
  let env: EnvStatusDto | null = null;
  let settings: AppSettingsDto | null = null;

  interface OptionsPayload {
    printer: string;
    copies: number;
    paper: string;
    duplex: string;
    color: string;
  }

  function currentOptions(): OptionsPayload {
    return {
      printer: el<HTMLSelectElement>('printer').value,
      copies: Math.max(1, Number(el<HTMLInputElement>('copies').value) || 1),
      paper: el<HTMLSelectElement>('paper').value,
      duplex: el<HTMLSelectElement>('duplex').value,
      color: el<HTMLSelectElement>('color').value,
    };
  }

  function renderPrinterOptions(printers: PrinterDto[], preferred?: string): void {
    const select = el<HTMLSelectElement>('printer');
    select.innerHTML = '';
    if (printers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '未检测到打印机';
      select.appendChild(opt);
      return;
    }
    for (const p of printers) {
      const opt = document.createElement('option');
      opt.value = p.name;
      const marks = [p.isDefault ? '默认' : '', p.offline ? '离线' : ''].filter(Boolean).join('，');
      opt.textContent = marks ? `${p.name}（${marks}）` : p.name;
      select.appendChild(opt);
    }
    const candidates = [preferred, printers.find((p) => p.isDefault)?.name, printers[0]?.name];
    const target = candidates.find((c) => c && printers.some((p) => p.name === c));
    if (target) select.value = target;
  }

  function fileSubText(item: PrintItemDto): string {
    const parts: string[] = [];
    const size = fmtSize(item.size);
    if (size) parts.push(size);
    if (item.pages) parts.push(`${item.pages} 页`);
    else if (item.kind === 'office') parts.push('页数转换后显示');
    return parts.join(' · ');
  }

  function renderFiles(): void {
    const list = el('file-list');
    list.innerHTML = '';
    if (files.length === 0) {
      list.innerHTML = '<div class="empty">把文件拖到这里，或通过右键菜单「批量打印」添加</div>';
    }
    for (const item of files) {
      const row = document.createElement('div');
      row.className = `row status-${item.status}`;
      const badge = kindBadge(item.kind, item.name);
      row.innerHTML = `
        <span class="badge ${badge.cls}">${escapeHtml(badge.text)}</span>
        <div class="file-main">
          <div class="file-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</div>
          <div class="file-sub">${escapeHtml(fileSubText(item))}</div>
        </div>
        <div class="file-status">${escapeHtml(statusText(item))}</div>
        ${summary && summary.running ? '' : `<button class="icon-btn row-remove" data-id="${item.id}" title="移除">×</button>`}
      `;
      const nameEl = row.querySelector('.file-name');
      if (nameEl) {
        nameEl.addEventListener('click', () => void window.api.showItem(item.path));
      }
      const removeBtn = row.querySelector('.row-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => void window.api.removeFile(item.id));
      }
      list.appendChild(row);
    }
    el('file-count').textContent = `${files.length} 个文件`;
  }

  function progressPercent(): number | null {
    if (!summary || summary.total === 0) return null;
    const processed = summary.done + summary.failed + summary.skipped + summary.canceled;
    const currentId = summary.currentId;
    const current = currentId ? files.find((f) => f.id === currentId) : undefined;
    let fraction = 0;
    if (summary.running) {
      if (current && current.status === 'printing') {
        const total = current.pagesTotal ?? current.pages;
        fraction =
          current.pagesDone !== undefined && current.pagesDone > 0 && total
            ? Math.min(current.pagesDone / total, 1) * 0.9
            : 0.5;
      } else if (current && current.status === 'converting') {
        fraction = 0.2;
      } else {
        fraction = 0.1;
      }
    }
    return Math.min(100, ((processed + fraction) / summary.total) * 100);
  }

  function renderProgress(): void {
    const wrap = el('progress-wrap');
    const pct = progressPercent();
    if (pct === null || (!summary?.running && pct === 0)) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    el('progress-fill').style.width = `${pct.toFixed(1)}%`;
  }

  function renderSummary(): void {
    const bar = el('summary');
    const line = el('status-line');
    if (!summary) {
      bar.classList.add('hidden');
      line.textContent = '';
      return;
    }
    const parts = [`共 ${summary.total}`, `完成 ${summary.done}`];
    if (summary.failed > 0) parts.push(`失败 ${summary.failed}`);
    if (summary.skipped > 0) parts.push(`跳过 ${summary.skipped}`);
    if (summary.canceled > 0) parts.push(`取消 ${summary.canceled}`);
    bar.textContent = parts.join(' · ');
    bar.classList.remove('hidden');

    if (summary.running) {
      const current = files.find((f) => f.id === (summary as QueueSummaryDto).currentId);
      if (current && current.status === 'converting') {
        line.textContent = `正在转换：${current.name}`;
      } else if (current && current.status === 'printing') {
        const total = current.pagesTotal ?? current.pages;
        if (current.pagesDone !== undefined && current.pagesDone > 0) {
          line.textContent = total
            ? `正在打印：${current.name}（${current.pagesDone}/${total} 页）`
            : `正在打印：${current.name}（已 ${current.pagesDone} 页）`;
        } else if (total) {
          line.textContent = `正在打印：${current.name}（共 ${total} 页）`;
        } else {
          line.textContent = `正在打印：${current.name}`;
        }
      } else {
        line.textContent = current ? `正在处理：${current.name}` : '正在处理…';
      }
    } else {
      line.textContent = summary.failed > 0 ? '存在失败文件，可重试' : files.length > 0 ? '准备就绪' : '';
    }

    const startBtn = el<HTMLButtonElement>('btn-start');
    startBtn.textContent = summary.running ? '停止' : '开始打印';
    startBtn.classList.toggle('danger', summary.running);
    el('btn-retry').classList.toggle('hidden', summary.running || summary.failed === 0);
    el('btn-close').classList.toggle('hidden', summary.running);
    startBtn.classList.toggle('hidden', !summary.running && files.length === 0);
  }

  function renderBanner(): void {
    if (!env) return;
    const hasOffice = files.some((f) => f.kind === 'office');
    el('banner-lo').classList.toggle('hidden', env.libreOffice.found || !hasOffice);
  }

  function applySettingsToControls(): void {
    if (!settings) return;
    const lo = settings.lastOptions;
    if (lo.copies && lo.copies > 0) el<HTMLInputElement>('copies').value = String(lo.copies);
    if (lo.paper) el<HTMLSelectElement>('paper').value = lo.paper;
    if (lo.duplex) el<HTMLSelectElement>('duplex').value = lo.duplex;
    if (lo.color) el<HTMLSelectElement>('color').value = lo.color;
    el<HTMLInputElement>('remember').checked = settings.rememberOptions;
  }

  async function refreshPrinters(): Promise<void> {
    const result = await window.api.listPrinters();
    const preferred = currentOptions().printer || settings?.lastOptions.printer;
    renderPrinterOptions(result.printers, preferred);
    if (!result.ok && result.error) {
      el('status-line').textContent = `打印机列表获取失败：${result.error}`;
    }
  }

  async function onStartClick(): Promise<void> {
    if (summary?.running) {
      await window.api.cancel();
      return;
    }
    const options = currentOptions();
    if (!options.printer) {
      el('status-line').textContent = '请先选择打印机';
      return;
    }
    await window.api.saveSettings({ rememberOptions: el<HTMLInputElement>('remember').checked });
    const skipOffice =
      env !== null && !env.libreOffice.found && el<HTMLInputElement>('skip-office').checked;
    const result = await window.api.start(options, { skipOfficeWhenNoConverter: skipOffice });
    if (!result.ok && result.error) el('status-line').textContent = `启动失败：${result.error}`;
  }

  async function onRetryClick(): Promise<void> {
    await window.api.retry();
    await onStartClick();
  }

  async function init(): Promise<void> {
    const data = await window.api.init();
    env = data.env;
    settings = data.settings;
    files = data.files;
    summary = {
      running: false,
      total: files.length,
      done: 0,
      failed: 0,
      skipped: 0,
      canceled: 0,
      currentId: null,
    };
    window.__summary = summary;

    renderPrinterOptions(data.printers, data.settings.lastOptions.printer);
    if (data.env.dryRun && data.printers.length === 0) {
      renderPrinterOptions([{ name: '（模拟打印机）', isDefault: true, status: '就绪' }]);
    }
    applySettingsToControls();
    renderFiles();
    renderSummary();
    renderProgress();
    renderBanner();

    window.api.onQueueUpdate((payload) => {
      files = payload.items;
      summary = payload.summary;
      window.__summary = summary;
      renderFiles();
      renderSummary();
      renderProgress();
      renderBanner();
    });

    el('btn-start').addEventListener('click', () => void onStartClick());
    el('btn-retry').addEventListener('click', () => void onRetryClick());
    el('btn-close').addEventListener('click', () => void window.api.closeWindow());
    el('btn-refresh-printers').addEventListener('click', () => void refreshPrinters());
    el('remember').addEventListener('change', () => {
      void window.api.saveSettings({ rememberOptions: el<HTMLInputElement>('remember').checked });
    });
    el('link-lo').addEventListener('click', (e) => {
      e.preventDefault();
      void window.api.openExternal('https://zh-cn.libreoffice.org/download/download-libreoffice/');
    });

    setupDropZone((paths) => void window.api.addFiles(paths));
  }

  void init();
})();
