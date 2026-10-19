import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { buildQuickAction, WORKFLOW_NAME } from '../core/quickaction';
import { buildInstallCommands, buildQueryCommands, buildUninstallCommands } from '../core/registry';
import { MENU_EXTENSIONS } from '../core/filetype';

export interface ShellIntegrationDeps {
  userDataDir: string;
  appPath: string;
  execPath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
}

export class ShellIntegration {
  constructor(private deps: ShellIntegrationDeps) {}

  private get workflowDir(): string {
    return path.join(os.homedir(), 'Library', 'Services', `${WORKFLOW_NAME}.workflow`);
  }

  private get runnerPath(): string {
    return path.join(this.deps.userDataDir, 'run-batchprinter.sh');
  }

  commandTokens(): string[] {
    if (this.deps.isPackaged) return [this.deps.execPath];
    if (this.deps.platform === 'darwin') {
      return [
        path.join(this.deps.appPath, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
        this.deps.appPath,
      ];
    }
    const exe = path.join(this.deps.appPath, 'node_modules', 'electron', 'dist', 'electron.exe');
    return [exe, this.deps.appPath];
  }

  registryCommandLine(): string {
    const tokens = this.commandTokens().map((t) => `"${t}"`);
    return [...tokens, '"%1"'].join(' ');
  }

  status(): boolean {
    if (this.deps.platform === 'darwin') return fs.existsSync(this.workflowDir);
    if (this.deps.platform === 'win32') {
      const cmds = buildQueryCommands(MENU_EXTENSIONS);
      const result = spawnSync('reg', cmds[0], { windowsHide: true });
      return result.status === 0;
    }
    return false;
  }

  install(): void {
    if (this.deps.platform === 'darwin') return this.installMac();
    if (this.deps.platform === 'win32') return this.installWindows();
    throw new Error(`当前系统暂不支持右键菜单集成: ${this.deps.platform}`);
  }

  uninstall(): void {
    if (this.deps.platform === 'darwin') return this.uninstallMac();
    if (this.deps.platform === 'win32') return this.uninstallWindows();
    throw new Error(`当前系统暂不支持右键菜单集成: ${this.deps.platform}`);
  }

  private installMac(): void {
    const parts = buildQuickAction({
      workflowName: WORKFLOW_NAME,
      command: this.commandTokens(),
      runnerPath: this.runnerPath,
    });
    fs.mkdirSync(this.deps.userDataDir, { recursive: true });
    fs.writeFileSync(this.runnerPath, parts.runnerScript, 'utf8');
    fs.chmodSync(this.runnerPath, 0o755);

    const contentsDir = path.join(this.workflowDir, 'Contents');
    const resourcesDir = path.join(contentsDir, 'Resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(path.join(contentsDir, 'Info.plist'), parts.infoPlist, 'utf8');
    fs.writeFileSync(path.join(contentsDir, 'document.wflow'), parts.documentWflow, 'utf8');
    fs.writeFileSync(path.join(resourcesDir, 'document.wflow'), parts.documentWflow, 'utf8');
  }

  private uninstallMac(): void {
    fs.rmSync(this.workflowDir, { recursive: true, force: true });
    fs.rmSync(this.runnerPath, { force: true });
  }

  private installWindows(): void {
    const commands = buildInstallCommands(this.registryCommandLine(), this.deps.execPath, MENU_EXTENSIONS);
    for (const args of commands) this.runReg(args);
  }

  private uninstallWindows(): void {
    const commands = buildUninstallCommands(MENU_EXTENSIONS);
    for (const args of commands) this.runReg(args);
  }

  private runReg(args: string[]): void {
    const result = spawnSync('reg', args, { windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      throw new Error(`注册表操作失败: ${detail || args.join(' ')}`);
    }
  }
}
