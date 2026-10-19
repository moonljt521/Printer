import UIKit
import UniformTypeIdentifiers

/// 分享扩展：接收「文件」App 或其它应用分享的 PDF/Office 文件，
/// 复制到 App Group 的收件箱，然后尝试唤起主应用（主应用启动时会自动导入）。
final class ShareViewController: UIViewController {
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let statusLabel = UILabel()
    private let titleLabel = UILabel()

    private var totalCount = 0
    private var completedCount = 0
    private var importedCount = 0
    private var unsupportedCount = 0
    private var didComplete = false

    /// 精确类型（微信/QQ 有时也用这些）；其余文件类附件用 public.data 兜底。
    private static let strictUTIs: [String] = [
        "com.adobe.pdf",
        "org.openxmlformats.wordprocessingml.document",
        "com.microsoft.word.doc",
        "org.openxmlformats.spreadsheetml.sheet",
        "com.microsoft.excel.xls",
        "org.openxmlformats.presentationml.presentation",
        "com.microsoft.powerpoint.ppt",
    ]
    private static let fallbackUTIs: [String] = ["public.data", "public.file-url"]

    private static func typeIdentifier(for provider: NSItemProvider) -> String? {
        if let uti = strictUTIs.first(where: { provider.hasItemConformingToTypeIdentifier($0) }) {
            return uti
        }
        return fallbackUTIs.first(where: { provider.hasItemConformingToTypeIdentifier($0) })
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        processAttachments()
    }

    private func setupUI() {
        view.backgroundColor = .systemBackground
        preferredContentSize = CGSize(width: 340, height: 200)

        titleLabel.text = "批量打印"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center

        statusLabel.text = "正在准备文件…"
        statusLabel.font = .preferredFont(forTextStyle: .footnote)
        statusLabel.textColor = .secondaryLabel
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        spinner.startAnimating()

        let stack = UIStackView(arrangedSubviews: [titleLabel, spinner, statusLabel])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -20),
        ])
    }

    private func processAttachments() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            finishImport()
            return
        }

        var providers: [NSItemProvider] = []
        for item in items {
            for attachment in item.attachments ?? [] {
                if Self.typeIdentifier(for: attachment) != nil {
                    providers.append(attachment)
                }
            }
        }

        guard !providers.isEmpty else {
            // 分享的是非文件内容（激活规则为 TRUEPREDICATE），不打扰用户，直接结束
            statusLabel.text = "仅支持 PDF / Office 文档"
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.complete()
            }
            return
        }

        totalCount = providers.count
        for provider in providers {
            loadAndStore(provider)
        }
    }

    private func loadAndStore(_ provider: NSItemProvider) {
        guard let uti = Self.typeIdentifier(for: provider),
              let inbox = InboxStore.ensureInbox() else {
            handleResult(.failed)
            return
        }

        provider.loadFileRepresentation(forTypeIdentifier: uti) { [weak self] url, error in
            var kind: ResultKind = .failed
            if let url, error == nil {
                kind = Self.store(url: url, from: provider, into: inbox)
            }
            DispatchQueue.main.async {
                self?.handleResult(kind)
            }
        }
    }

    private enum ResultKind {
        case imported, unsupported, failed
    }

    private static func store(url: URL, from provider: NSItemProvider, into inbox: URL) -> ResultKind {
        var name = url.lastPathComponent
        var printable: Bool
        switch FileClassifier.classify(url) {
        case .pdf, .office:
            printable = true
        case .unsupported:
            // 微信/QQ 某些附件载入后丢失扩展名：按分享方注册的精确类型补回
            if url.pathExtension.isEmpty, let ext = strictExtension(for: provider) {
                name += "." + ext
                printable = true
            } else {
                printable = false
            }
        }
        guard printable else { return .unsupported }

        let dest = inbox.appendingPathComponent(name)
        let fm = FileManager.default
        try? fm.removeItem(at: dest)
        return (try? fm.copyItem(at: url, to: dest)) != nil ? .imported : .failed
    }

    private static let extMap: [String: String] = [
        "com.adobe.pdf": "pdf",
        "org.openxmlformats.wordprocessingml.document": "docx",
        "com.microsoft.word.doc": "doc",
        "org.openxmlformats.spreadsheetml.sheet": "xlsx",
        "com.microsoft.excel.xls": "xls",
        "org.openxmlformats.presentationml.presentation": "pptx",
        "com.microsoft.powerpoint.ppt": "ppt",
    ]

    private static func strictExtension(for provider: NSItemProvider) -> String? {
        for uti in strictUTIs where provider.hasItemConformingToTypeIdentifier(uti) {
            return extMap[uti]
        }
        return nil
    }

    private func handleResult(_ kind: ResultKind) {
        switch kind {
        case .imported: importedCount += 1
        case .unsupported: unsupportedCount += 1
        case .failed: break
        }
        completedCount += 1
        if completedCount >= totalCount {
            finishImport()
        }
    }

    private func finishImport() {
        spinner.stopAnimating()
        var text: String
        if importedCount == 0 {
            text = unsupportedCount > 0 ? "仅支持 PDF / Office 文档，这些文件类型不支持" : "没有导入任何文件"
        } else {
            text = "已导入 \(importedCount) 个文件"
            if unsupportedCount > 0 {
                text += "（\(unsupportedCount) 个类型不支持）"
            }
            text += "，正在打开「批量打印」…"
        }
        statusLabel.text = text
        openMainApp()
    }

    private func openMainApp() {
        guard let url = URL(string: "batchprinter://print"), let context = extensionContext else {
            complete()
            return
        }
        context.open(url) { [weak self] _ in
            DispatchQueue.main.async {
                self?.statusLabel.text = "已导入 \(self?.importedCount ?? 0) 个文件，请打开「批量打印」App 查看"
                self?.complete()
            }
        }
        // 某些系统限制下 open 回调不触发或不允许打开，延时兜底
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.complete()
        }
    }

    private func complete() {
        guard !didComplete else { return }
        didComplete = true
        extensionContext?.completeRequest(returningItems: nil)
    }
}
