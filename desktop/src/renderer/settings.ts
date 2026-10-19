(() => {
  function setMsg(id: string, text: string, isError: boolean): void {
    const node = el(id);
    node.textContent = text;
    node.classList.remove('hidden');
    node.classList.toggle('error', isError);
  }

  async function refreshStatus(): Promise<void> {
    const env = await window.api.envStatus();

    el('integration-state').textContent = env.integrated ? '已安装' : '未安装';
    el('integration-state').className = `state ${env.integrated ? 'ok' : 'warn'}`;
    el('btn-install').classList.toggle('hidden', env.integrated);
    el('btn-uninstall').classList.toggle('hidden', !env.integrated);
    el('integration-hint').textContent = env.isPackaged
      ? env.platform === 'darwin'
        ? '安装后：Finder 右键 →「快速操作」→ 批量打印'
        : '安装后：多选文件右键 → 批量打印（Win11 在「显示更多选项」里）'
      : '当前为开发模式，安装的菜单指向本机开发环境';

    el('lo-state').textContent = env.libreOffice.found ? '已就绪' : '未检测到';
    el('lo-state').className = `state ${env.libreOffice.found ? 'ok' : 'warn'}`;
    el('lo-path').textContent = env.libreOffice.path ?? '';

    const cardSumatra = el('card-sumatra');
    cardSumatra.classList.toggle('hidden', env.platform !== 'win32');
    if (env.platform === 'win32') {
      el('sumatra-state').textContent = env.sumatra.found ? '已就绪' : '未安装';
      el('sumatra-state').className = `state ${env.sumatra.found ? 'ok' : 'warn'}`;
      el('sumatra-path').textContent = env.sumatra.path ?? '';
      el('btn-download-sumatra').classList.toggle('hidden', env.sumatra.found);
    }
  }

  async function init(): Promise<void> {
    const data = await window.api.init();
    el('version').textContent = `v${data.version}`;
    await refreshStatus();

    el('btn-install').addEventListener('click', async () => {
      const result = await window.api.installIntegration();
      if (result.ok) {
        setMsg('integration-msg', '安装成功', false);
        await refreshStatus();
      } else {
        setMsg('integration-msg', `安装失败：${result.error ?? '未知错误'}`, true);
      }
    });

    el('btn-uninstall').addEventListener('click', async () => {
      const result = await window.api.uninstallIntegration();
      if (result.ok) {
        setMsg('integration-msg', '已卸载', false);
        await refreshStatus();
      } else {
        setMsg('integration-msg', `卸载失败：${result.error ?? '未知错误'}`, true);
      }
    });

    el('btn-pick-lo').addEventListener('click', async () => {
      const result = await window.api.pickSoffice();
      if (result.ok) {
        setMsg('integration-msg', '已设置 LibreOffice 路径', false);
        await refreshStatus();
      } else if (result.error && result.error !== 'canceled') {
        setMsg('integration-msg', `设置失败：${result.error}`, true);
      }
    });

    el('btn-open-lo-site').addEventListener('click', () => {
      void window.api.openExternal('https://zh-cn.libreoffice.org/download/download-libreoffice/');
    });

    el('btn-download-sumatra').addEventListener('click', async () => {
      const progress = el('sumatra-progress');
      const bar = progress.querySelector('.progress-bar') as HTMLElement | null;
      progress.classList.remove('hidden');
      setMsg('integration-msg', '正在下载 SumatraPDF…', false);
      window.api.onSumatraProgress((p) => {
        if (bar && p.phase === 'downloading' && p.total > 0) {
          bar.style.width = `${Math.round((p.received / p.total) * 100)}%`;
        } else if (bar && p.phase === 'extracting') {
          bar.style.width = '95%';
        }
      });
      const result = await window.api.downloadSumatra();
      if (result.ok) {
        setMsg('integration-msg', '下载完成', false);
      } else {
        setMsg('integration-msg', `下载失败：${result.error ?? '未知错误'}`, true);
      }
      await refreshStatus();
    });
  }

  void init();
})();
