# BatchPrinter 批量打印助手

[English](README.md) | **简体中文**

多选文件 → 批量打印。同一仓库包含两个平台的实现：

- **桌面端**（[`desktop/`](desktop/)）——Electron + TypeScript，支持 **Windows / macOS**：资源管理器/Finder 右键「批量打印」、Office → PDF 转换、完整打印参数、真实的打印机任务跟踪。
- **iOS 端**（[`ios/`](ios/)）——Swift/SwiftUI，**iPhone/iPad（iOS 17+）**：分享扩展从「文件」、微信、QQ 等导入 PDF，经 AirPrint 批量打印。

## 功能

### 桌面端（Windows / macOS）

- **右键菜单集成**——Windows 注册表菜单（HKCU，免管理员）/ macOS Finder 快速操作
- **多选聚合**——资源管理器多进程调用自动合并为一批（单实例 + 650ms 去抖）
- **打印确认弹窗**——打印机、份数、纸张（A4/A3/Letter）、双面（长边/短边/单面）、颜色；记住上次设置
- **页数显示**——PDF 立即解析；Office 转换完成后显示实际页数
- **Office → PDF**——LibreOffice headless 转换（自动定位，缺失时引导安装），支持 doc/docx/xls/xlsx/ppt/pptx/odt/ods/odp/rtf
- **真实进度**——跟踪 CUPS 任务（macOS，`ipptool` 兜底）或 SumatraPDF（Windows），打印机实际完成才标「已完成」；失败重试、中途停止（取消 CUPS 队列任务）
- 拖拽添加、逐项移除、dry-run 开发模式

### iOS 端（iPhone / iPad，iOS 17+）

- **分享扩展**——从「文件」、微信、QQ 等直接分享 PDF；文件经 App Group 收件箱自动导入
- **AirPrint**——系统打印机选择器并记住上次选择，双面 / 颜色选项
- **页数与状态**——PDFKit 解析页数，逐文件状态（等待/打印中/已完成/失败/已跳过）
- **任务真实完成跟踪**——文件级进度，基于 `didFinishJob` 回调（看门狗超时兜底）
- **提交自动重试**——首次建连 / 本地网络权限导致的瞬时失败自动重试一次
- Office 文件自动识别并跳过（iOS 无 LibreOffice 等价物，提示先导出 PDF）

## 功能对照

| 功能 | 桌面端 | iOS |
| --- | --- | --- |
| 入口 | 右键菜单 | 分享扩展 / 应用内选择器 |
| PDF 打印 | ✅ `lp`（macOS）/ SumatraPDF（Windows） | ✅ AirPrint |
| Office → PDF | ✅ LibreOffice | ❌ 跳过并提示 |
| 份数 / 纸张 | ✅ | ❌ 公开 API 不支持 |
| 双面 / 彩色 | ✅ | ✅ |
| 页数显示 | ✅ | ✅（PDF） |
| 真实完成跟踪 | ✅ | ✅（文件级） |
| 记住打印设置 | ✅ | ✅ |
| 重试 / 停止 / 清空 | ✅ | ✅ |

## 快速开始

### 桌面端

```bash
cd desktop
npm install                          # 国内网络：export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm run build && npm test            # 编译 + 单元测试（35 例）
npm run dev                          # 开发模式运行

# 打包（在对应系统上执行）
npm run dist:mac                     # macOS（zip/pkg；dmg 卡住时用 `npx electron-builder --mac zip`）
npm run dist:win                     # Windows（需在 Windows 机器上执行）
```

### iOS 端

```bash
cd ios
brew install xcodegen
xcodegen generate                    # 生成 BatchPrinterIOS.xcodeproj
open BatchPrinterIOS.xcodeproj       # 两个 target 选择你的 Team 后运行
```

工程由 XcodeGen 管理：`project.yml` 是唯一配置源（签名 Team、Bundle ID、App Group `group.com.moon.batchprinter`）。命令行构建/安装步骤见 [`ios/README.md`](ios/README.md)。

## 项目结构

```
batchPrinter/
├── desktop/                 Electron + TypeScript（Windows、macOS）
│   ├── src/main/core/       纯逻辑（单测覆盖）：参数、类型识别、lp/Sumatra 命令、
│   │                         注册表/快速操作、LibreOffice、PDF 页数
│   ├── src/main/services/   队列、打印后端、转换器、设置、系统集成
│   ├── src/renderer/        打印窗口 + 设置页（原生 TS + DOM）
│   └── tests/               node:test 单测（35 例）
└── ios/                     XcodeGen 工程（iOS 17+）
    ├── project.yml          targets：BatchPrinterIOS + ShareExtension
    ├── BatchPrinterIOS/     SwiftUI 应用（队列、AirPrint、设置、收件箱）
    └── ShareExtension/      分享扩展（微信/QQ/文件 导入）
```

## 文档

- [`desktop/README.md`](desktop/README.md) —— 桌面端架构、命令、打包
- [`ios/README.md`](ios/README.md) —— iOS 结构、签名/部署、微信/QQ 导入说明
- [README.md](README.md) —— English version

## 当前状态

- **桌面端**——macOS 已端到端验证（含真实打印任务完成跟踪）；Windows 出包待 Windows 机器验证。
- **iOS 端**——已真机（iPhone 13）构建验证：分享导入（文件/微信/QQ）、AirPrint 打印与提交自动重试、设置持久化、应用图标。
