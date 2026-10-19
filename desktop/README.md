# BatchPrinter 批量打印助手

多选文件 → 右键菜单「批量打印」→ 确认参数 → 批量打印。支持 **PDF** 与 **Office 文档**（doc/docx/xls/xlsx/ppt/pptx，以及 odt/ods/odp/rtf），跨平台：**Windows + macOS**。

技术栈：Electron + TypeScript（无运行时第三方依赖，打印后端调用系统组件）。

## 功能

- **右键菜单集成**
  - Windows：多选文件右键 →「批量打印」（HKCU 注册表，免管理员；Win11 需在「显示更多选项」中查看）
  - macOS：Finder 多选右键 →「快速操作」→「批量打印」
- **多选聚合**：Windows 下资源管理器多选会触发多次进程调用，应用通过单实例 + 去抖聚合（650ms）自动合并为一批
- **打印确认弹窗**：文件列表（可逐项移除/在文件夹中显示）、打印机选择、份数、纸张（A4/A3/Letter）、双面（长边/短边/单面）、颜色（彩色/黑白）、记住上次设置
- **页数显示**：PDF 在列表打开时立即解析页数；Office 文档在打印转换完成后显示实际页数
- **Office → PDF**：通过 LibreOffice headless 转换后打印（需安装 LibreOffice，缺失时弹窗引导）
- **进度与容错**：顶部总进度条 + 当前文件状态；提交后持续跟踪任务，确认打印机实际完成后才标「已完成」；失败重试、中途停止（含取消打印机任务）
- **拖拽添加**：文件可直接拖进打印窗口

## 架构

```
src/main/core/          纯逻辑（无 Electron 依赖，单元测试覆盖）
  args.ts               命令行参数解析（含多实例聚合入口）
  filetype.ts           文件类型识别
  lpcmd.ts              macOS lp 打印命令构建
  sumatracmd.ts         Windows SumatraPDF 打印命令构建
  registry.ts           Windows 注册表右键菜单命令构建
  quickaction.ts        macOS Quick Action (.workflow) 生成
  soffice.ts            LibreOffice 转换命令构建
src/main/services/      Electron/进程层
  aggregator.ts         多进程/多批文件去抖聚合
  converter.ts          LibreOffice 定位与转换
  printer.ts            打印后端（mac: lp / win: SumatraPDF / dry-run）
  queue.ts              打印队列编排（状态机、取消、重试）
  shellint.ts           右键菜单安装/卸载（注册表 / Quick Action）
  sumatra.ts            SumatraPDF 定位与自动下载
  settings.ts           JSON 设置持久化
  printers.ts           打印机枚举（lpstat / PowerShell CIM）
src/preload/            contextBridge 安全桥
src/renderer/           打印窗口 + 设置页（原生 TS + DOM，无框架）
```

## 开发命令

```bash
npm install          # 首次安装（国内网络建议加 ELECTRON_MIRROR，见下）
npm run build        # 编译 TS + 拷贝渲染层资源
npm test             # 构建 + 单元测试（26 cases）
npm run dev          # 构建并以开发模式启动
npm run smoke        # 隐藏窗口跑一遍完整 UI 流程并截图到 .smoke/
```

国内网络加速 Electron 下载：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

测试辅助参数（开发用）：

```bash
electron . --dry-run                 # 模拟打印（不真正调用 lp/Sumatra）
electron . --smoke .smoke            # UI 冒烟测试 + 截图
electron . --capture-args out.json   # 收集收到的文件路径后退出（验证聚合）
```

## 打包

```bash
npm run dist:mac     # macOS：dmg + zip（产物在 release/）
npx electron-builder --mac zip   # 仅 zip（dmg 在无桌面会话/受限环境可能卡住时用这个）
npm run dist:win     # Windows：NSIS 安装包 + 便携版（需在 Windows 上执行）
npm run fetch:sumatra  # （可选）把 SumatraPDF.exe 预置进 vendor/，随安装包分发
```

- Windows 打包需在 Windows 机器执行（本仓库开发机为 macOS，无 wine 交叉打包）
- macOS 未签名：首次打开需右键 →「打开」绕过 Gatekeeper
- `fetch:sumatra` 会把 SumatraPDF 打进 `extraResources/vendor/sumatra/`，用户免下载

## 运行依赖

| 依赖 | 平台 | 用途 | 获取方式 |
| --- | --- | --- | --- |
| LibreOffice | 双平台 | Office → PDF 转换 | 设置页引导下载 / 手动选择路径 |
| SumatraPDF | Windows | PDF 静默打印 | 设置页一键下载自动放置，或预置于安装包 |
| `lp` (CUPS) | macOS | PDF 打印 | 系统自带 |

## 验收清单

### macOS

1. `npm install && npm test` → 26 个单测全绿
2. `npm run dev` → 自动打开设置页；「右键菜单 → 安装」成功（重新打开设置页显示"已安装"）
3. Finder 里多选 2 个 PDF（可混 docx/xlsx/pptx）→ 右键 →「快速操作」→「批量打印」→ 打印窗口出现且文件齐全
4. 选择打印机、份数 1 → 开始打印 → 各文件状态变为「已完成」（需系统已配置打印机）
5. Office 文件：安装 LibreOffice 后应显示「转换中 → 打印中 → 已完成」；未安装时弹窗提示并可勾选"本次跳过 Office 文件"
6. 中途「停止」按钮可取消后续文件
7. 「右键菜单 → 卸载」后 Finder 中不再出现（如需刷新：重启 Finder 或重新登录）

### Windows

1. `npm install`，然后 `npm run dist:win` 出包（或在开发机 `npm run dev`）
2. 打开设置页：
   - 「Windows 打印组件」点「自动下载」→ SumatraPDF 就绪（或随安装包预置）
   - 「右键菜单 → 安装」
3. 资源管理器多选 2+ 个 PDF → 右键 →「显示更多选项」→「批量打印」（Win10 直接右键可见）→ 打印窗口出现且文件齐全（验证多选聚合）
4. 选打印机 → 开始打印 → 状态完成；确认纸盒输出正确
5. LibreOffice 未安装时选 Office 文件 → 弹窗提示与跳过逻辑
6. 卸载右键菜单 → 菜单项消失
7. 便携版 `BatchPrinter-0.1.0-portable.exe` 直接双击可运行

### 边界情况（建议抽测）

- 路径含中文/空格/超长文件名
- 无打印机 / 打印机离线（Windows CIM 显示"离线"标记）
- 一次 20+ 混合文件；打印中关闭窗口（应停止后续任务并清理临时文件）
- 重复多选同一文件（应去重）

## 已知限制 / Roadmap

- Windows 11 新式右键菜单需 IExplorerCommand（稀疏包）才能进一级菜单，当前走「显示更多选项」；Roadmap 项
- 未签名：Windows SmartScreen 与 macOS Gatekeeper 会提示（正式分发建议签名/公证）
- 停止对"转换中"的 LibreOffice 进程为等待当前文件结束后生效
- 双面/纸张等选项依赖打印机驱动支持，不同机型能力差异需实测
- 逐页实时进度取决于打印机是否通过 IPP 上报 `job-impressions-completed`（如 HP M181fw 不上报，此时显示「打印中（共 N 页）」，完成时自动补满）；Windows 走打印后台（spooler）尽力查询

## 目录速查

- 打印流程状态机：`src/main/services/queue.ts`
- Windows 菜单注册内容：`src/main/core/registry.ts` + `src/main/services/shellint.ts`
- macOS Quick Action 内容：`src/main/core/quickaction.ts` + `src/main/services/shellint.ts`
- 打印命令参数：`src/main/core/lpcmd.ts` / `src/main/core/sumatracmd.ts`
