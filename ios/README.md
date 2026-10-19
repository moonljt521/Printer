# BatchPrinter 批量打印助手 iOS 版

原生 SwiftUI + UIKit 实现的批量打印助手，通过 **AirPrint** 打印 PDF。使用方式：

1. 在「文件」App（或其它应用）多选 PDF → 分享 →「批量打印」
2. **从微信 / QQ 导入**：聊天里点开文件 → 右上角 `⋯` →「用其他App打开」→「批量打印」（分享扩展激活规则已放宽到 `public.data`/`public.file-url`，微信/QQ 的泛型文件类型也能进；非 PDF/Office 会提示类型不支持）
3. 或打开 App，点右上角 `+` 多选文件
4. 选择打印机（记住上次选择）→ 双面/颜色 → 开始打印

工程由 [XcodeGen](https://github.com/yonaskolb/XcodeGen) 从 `project.yml` 生成，`BatchPrinterIOS.xcodeproj` 不入库。

## 结构

```
project.yml                      XcodeGen 工程定义（App + 分享扩展两个 target）
BatchPrinterIOS/
  App/BatchPrinterApp.swift      入口
  Views/ContentView.swift        主界面（列表/选项/进度/状态）
  Models/Models.swift            模型与文件分类、双面/颜色枚举
  Services/
    PrintQueue.swift             串行打印队列（真实完成跟踪、取消、重试）
    PrinterManager.swift         打印机持久化与系统选择器
    SettingsStore.swift          记住打印机/双面/颜色
    InboxStore.swift             App Group 收件箱 + 沙盒导入目录
    PdfInfo.swift                PDF 页数（PDFKit）
  Info.plist                     批量打印 URL scheme、本地网络（AirPrint）
  BatchPrinterIOS.entitlements   App Group
ShareExtension/
  ShareViewController.swift      分享扩展：收文件 → 写入 Inbox → 唤起主应用
  Info.plist                     分享扩展激活规则（PDF / Office UTI）
  ShareExtension.entitlements    App Group
```

数据流：分享扩展把文件原名复制到 App Group 的 `Inbox/` → 主应用启动或回前台时 `drainInbox()` 将文件移入沙盒 `Documents/Incoming/`（加唯一前缀）并加入列表。扩展尝试通过 `batchprinter://print` 唤起主应用，失败时提示用户手动打开（下次启动仍会导入）。

## 开发

```bash
brew install xcodegen        # 首次
xcodegen generate            # 生成 BatchPrinterIOS.xcodeproj

# 模拟器编译（不签名，冒烟用）
xcodebuild -project BatchPrinterIOS.xcodeproj -scheme BatchPrinterIOS \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build

# 模拟器运行
xcrun simctl boot "iPhone 16"
xcrun simctl install booted <DerivedData>/Build/Products/Debug-iphonesimulator/BatchPrinter.app
xcrun simctl launch booted com.moon.batchprinter.ios
```

模拟分享扩展的写入（把文件直接放进 Inbox，启动 App 即导入）：

```bash
GROUP=$(xcrun simctl get_app_container booted com.moon.batchprinter.ios groups | awk '{print $2}')
mkdir -p "$GROUP/Inbox" && cp 某个.pdf "$GROUP/Inbox/"
xcrun simctl terminate booted com.moon.batchprinter.ios
xcrun simctl launch booted com.moon.batchprinter.ios   # 启动后自动导入
```

## 真机部署

1. Xcode 打开 `BatchPrinterIOS.xcodeproj`，两个 target 都选择你的 Team（Team 已预填在 `project.yml` 的 `DEVELOPMENT_TEAM`，可按需修改后重新 `xcodegen generate`）
2. 在 Apple Developer 后台创建 App Group `group.com.moon.batchprinter`，并给 `com.moon.batchprinter.ios` 与 `com.moon.batchprinter.ios.share` 两个 App ID 勾选该组（Xcode 自动签名通常会自动注册）
3. 真机运行后：设置 → 通用 → VPN与设备管理 信任开发者证书；「文件」App 分享列表里即会出现「批量打印」

命令行构建/安装（已验证）：

```bash
# 构建到真机（设备 ID 用 xcodebuild -scheme BatchPrinterIOS -showdestinations 查看）
xcodebuild -project BatchPrinterIOS.xcodeproj -scheme BatchPrinterIOS \
  -destination 'platform=iOS,id=<设备ID>' -allowProvisioningUpdates build

# 安装 + 启动（<CoreDevice UUID> 用 xcrun devicectl list devices 查看）
xcrun devicectl device install app --device <CoreDevice UUID> \
  <DerivedData>/Build/Products/Debug-iphoneos/BatchPrinter.app
xcrun devicectl device process launch --device <CoreDevice UUID> com.moon.batchprinter.ios
```

自定义 Bundle ID 或 App Group 时需同步修改：`project.yml`（产物 ID）、两个 entitlements、`InboxStore.swift` 的 `appGroupID`。

## 与桌面版的差异（不实现的已跳过）

- **Office 文档**：iOS 无 LibreOffice 等价物，不转换，打印时跳过并在横幅提示（可用桌面版先导出 PDF）
- **份数 / 纸张**：`UIPrintInfo` 不暴露这两个参数的公开 API，系统打印面板中可手动设置
- **逐页进度**：iOS 打印 API 不提供；进度为文件级，任务真实完成通过 `UIPrintInteractionControllerDelegate.printInteractionControllerDidFinishJob` 跟踪（10 分钟看门狗兜底）
- **停止**：停止后不再处理后续文件；已提交给系统的打印任务无法从应用内取消（iOS API 限制）
- **入口**：无右键菜单/快速操作，改为分享扩展 + 应用内选择器

## 已验证

- 模拟器（iPhone 16，iOS 26.2）：编译通过；分享写入 Inbox → 启动导入 → 显示文件名/大小/页数、Office 跳过横幅、空态与就绪状态均正常
- 真机与真实打印需配置签名后自测（AirPrint 需要与打印机同一局域网）
