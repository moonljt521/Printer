import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var queue: PrintQueue
    @EnvironmentObject private var settings: SettingsStore
    @Environment(\.scenePhase) private var scenePhase

    @State private var printerURLString: String?
    @State private var duplex: DuplexMode = .simplex
    @State private var color: ColorMode = .color
    @State private var showImporter = false
    @State private var showAbout = false
    @State private var statusOverride: String?

    private static var allowedTypes: [UTType] {
        var types: [UTType] = [.pdf]
        for ext in ["doc", "docx", "xls", "xlsx", "ppt", "pptx"] {
            if let type = UTType(filenameExtension: ext) {
                types.append(type)
            }
        }
        return types
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                progressBar
                bannerIfNeeded
                fileList
                Divider()
                optionsPanel
                footer
            }
            .navigationTitle("批量打印")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("\(queue.items.count) 个文件")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showImporter = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    Menu {
                        Button("清空已完成") { queue.clearFinished() }
                            .disabled(queue.summary.running)
                        Button("关于批量打印") { showAbout = true }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .fileImporter(
            isPresented: $showImporter,
            allowedContentTypes: Self.allowedTypes,
            allowsMultipleSelection: true
        ) { result in
            if case .success(let urls) = result {
                var imported: [URL] = []
                for url in urls {
                    if let dest = try? ImportsStore.importWithSecurityScope(at: url) {
                        imported.append(dest)
                    }
                }
                queue.add(urls: imported, displayName: ImportsStore.displayName)
            }
        }
        .onOpenURL { _ in
            importInbox()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { importInbox() }
        }
        .onAppear {
            loadRememberedSettings()
            importInbox()
        }
        .alert("关于", isPresented: $showAbout) {
            Button("好", role: .cancel) {}
        } message: {
            Text("批量打印助手 iOS 版 0.1.0\n\n支持 PDF 经由 AirPrint 批量打印；Office 文档请先在桌面版转换为 PDF。\n从「文件」App 或其它应用多选 PDF → 分享 →「批量打印」即可添加。")
        }
    }

    // MARK: - 子视图

    @ViewBuilder
    private var progressBar: some View {
        if let fraction = queue.progressFraction, queue.summary.running {
            ProgressView(value: fraction)
                .progressViewStyle(.linear)
                .padding(.horizontal, 16)
                .padding(.bottom, 6)
        }
    }

    @ViewBuilder
    private var bannerIfNeeded: some View {
        if queue.items.contains(where: { $0.kind == .office }) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                Text("此版本不支持 Office 文档（iOS 上无 LibreOffice），打印时将跳过。可先用桌面版导出为 PDF。")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 16)
            .padding(.bottom, 6)
        }
    }

    private var fileList: some View {
        List {
            if queue.items.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "printer")
                        .font(.system(size: 32))
                        .foregroundStyle(.tertiary)
                    Text("在「文件」App 里多选 PDF 后分享到「批量打印」，或点右上角 + 添加")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Text("微信/QQ：打开文件 → 右上角 ⋯ → 用其他App打开 → 批量打印")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
                .listRowSeparator(.hidden)
            }
            ForEach(queue.items) { item in
                FileRowView(item: item)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if !queue.summary.running {
                            Button(role: .destructive) {
                                queue.remove(id: item.id)
                            } label: {
                                Label("移除", systemImage: "trash")
                            }
                        }
                    }
            }
        }
        .listStyle(.plain)
    }

    private var optionsPanel: some View {
        VStack(spacing: 10) {
            HStack {
                Label("打印机", systemImage: "printer")
                    .font(.subheadline)
                Spacer()
                Button {
                    PrinterManager.presentPicker { printer in
                        guard let printer else { return }
                        printerURLString = printer.url.absoluteString
                    }
                } label: {
                    Text(printerLabel)
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                        .lineLimit(1)
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            HStack {
                Label("双面", systemImage: "doc.on.doc")
                    .font(.subheadline)
                Spacer()
                Picker("双面", selection: $duplex) {
                    ForEach(DuplexMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.menu)
            }

            HStack {
                Label("颜色", systemImage: "paintpalette")
                    .font(.subheadline)
                Spacer()
                Picker("颜色", selection: $color) {
                    ForEach(ColorMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.menu)
            }

            Toggle(isOn: $settings.rememberOptions) {
                Text("记住我的打印设置")
                    .font(.subheadline)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var footer: some View {
        HStack {
            Text(statusLine)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer()
            if !queue.summary.running, queue.summary.failed > 0 {
                Button("重试失败") {
                    queue.retryFailed()
                }
                .buttonStyle(.bordered)
            }
            Button(queue.summary.running ? "停止" : "开始打印") {
                onStartTapped()
            }
            .buttonStyle(.borderedProminent)
            .tint(queue.summary.running ? .red : .blue)
            .disabled(!queue.summary.running && queue.items.isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var printerLabel: String {
        guard let printerURLString else { return "选择打印机" }
        return PrinterManager.displayName(fromURLString: printerURLString)
    }

    private var statusLine: String {
        if let statusOverride {
            return statusOverride
        }
        let summary = queue.summary
        if summary.running {
            if let current = queue.currentItem {
                if let pages = current.pages {
                    return "正在打印：\(current.name)（共 \(pages) 页）"
                }
                return "正在打印：\(current.name)"
            }
            return "正在处理…"
        }
        if summary.failed > 0 { return "存在失败文件，可重试" }
        if !queue.items.isEmpty { return "准备就绪" }
        return ""
    }

    // MARK: - 行为

    private func onStartTapped() {
        if queue.summary.running {
            queue.cancel()
            return
        }
        statusOverride = nil
        guard let printerURLString else {
            statusOverride = "请先选择打印机"
            return
        }
        settings.save(printerURL: printerURLString, duplex: duplex, color: color)
        queue.start(options: PrintOptions(printerURL: printerURLString, duplex: duplex, color: color))
    }

    private func loadRememberedSettings() {
        if let saved = settings.lastPrinterURL {
            printerURLString = saved
        }
        duplex = settings.lastDuplex
        color = settings.lastColor
    }

    private func importInbox() {
        let urls = InboxStore.drainInbox()
        if !urls.isEmpty {
            queue.add(urls: urls, displayName: ImportsStore.displayName)
        }
    }
}

struct FileRowView: View {
    let item: PrintItem

    var body: some View {
        HStack(spacing: 10) {
            Text(badgeText)
                .font(.caption2.bold())
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(badgeColor)
                .clipShape(RoundedRectangle(cornerRadius: 4))

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.subheadline)
                    .lineLimit(1)
                Text(subText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(statusText)
                .font(.caption)
                .foregroundStyle(statusColor)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
        }
        .padding(.vertical, 2)
    }

    private var badgeText: String {
        if item.kind == .pdf { return "PDF" }
        let ext = item.url.pathExtension.uppercased()
        return ext.isEmpty ? "FILE" : String(ext.prefix(4))
    }

    private var badgeColor: Color {
        switch item.kind {
        case .pdf: return .red
        case .office: return .blue
        case .unsupported: return .gray
        }
    }

    private var subText: String {
        var parts: [String] = []
        let size = formatSize(item.size)
        if !size.isEmpty { parts.append(size) }
        if let pages = item.pages {
            parts.append("\(pages) 页")
        } else if item.kind == .office {
            parts.append("Office 文档")
        }
        return parts.joined(separator: " · ")
    }

    private var statusText: String {
        switch item.status {
        case .pending: return "等待"
        case .printing: return "打印中"
        case .done: return item.message ?? "已完成"
        case .failed: return "失败：\(item.message ?? "")"
        case .canceled: return "已取消"
        case .skipped: return "已跳过：\(item.message ?? "")"
        }
    }

    private var statusColor: Color {
        switch item.status {
        case .pending: return .secondary
        case .printing: return .blue
        case .done: return .green
        case .failed: return .red
        case .canceled: return .orange
        case .skipped: return .orange
        }
    }
}
