import Combine
import PDFKit
import UIKit

enum PrintError: LocalizedError {
    case noPrinter
    case unreadable
    case submitFailed(String)
    case connectFailed

    var errorDescription: String? {
        switch self {
        case .noPrinter: return "请先选择打印机"
        case .unreadable: return "无法读取 PDF 文件"
        case .submitFailed(let detail): return detail.isEmpty ? "提交打印失败" : "提交打印失败：\(detail)"
        case .connectFailed: return "无法连接打印机，请确认手机与打印机在同一 Wi-Fi 后重试"
        }
    }
}

/// 打印队列：顺序处理文件，跟踪任务真实完成（对应桌面版 queue.ts + printer.ts）。
@MainActor
final class PrintQueue: NSObject, ObservableObject {
    @Published private(set) var items: [PrintItem] = []
    @Published private(set) var running = false
    @Published private(set) var currentId: UUID?

    private var canceled = false

    private var jobController: UIPrintInteractionController?
    private var jobFinished = false
    private var jobWaiter: CheckedContinuation<Bool, Never>?

    private static let jobWatchdogSeconds: UInt64 = 600

    // MARK: - 列表操作

    func add(urls: [URL], displayName: ((URL) -> String)? = nil) {
        for url in urls {
            let name = displayName?(url) ?? url.lastPathComponent
            let candidate = PrintItem(url: url, name: name)
            if items.contains(where: { $0.name == candidate.name && $0.size == candidate.size }) {
                continue
            }
            items.append(candidate)
            if candidate.kind == .pdf {
                fillPageCount(for: candidate.id, url: url)
            }
        }
    }

    private func fillPageCount(for id: UUID, url: URL) {
        Task {
            let count = await Task.detached(priority: .utility) { PdfInfo.pageCount(of: url) }.value
            guard let count, let idx = items.firstIndex(where: { $0.id == id }) else { return }
            items[idx].pages = count
        }
    }

    func remove(id: UUID) {
        guard !running else { return }
        items.removeAll { $0.id == id }
    }

    func clearFinished() {
        guard !running else { return }
        items.removeAll { $0.status == .done || $0.status == .skipped }
    }

    func retryFailed() {
        guard !running else { return }
        for idx in items.indices where items[idx].status == .failed || items[idx].status == .canceled {
            items[idx].status = .pending
            items[idx].message = nil
        }
    }

    func cancel() {
        guard running else { return }
        canceled = true
    }

    // MARK: - 队列执行

    func start(options: PrintOptions) {
        guard !running else { return }
        running = true
        canceled = false
        for idx in items.indices where items[idx].status == .failed
            || items[idx].status == .canceled || items[idx].status == .skipped {
            items[idx].status = .pending
            items[idx].message = nil
        }

        Task {
            await runLoop(options: options)
        }
    }

    private func runLoop(options: PrintOptions) async {
        while !canceled {
            guard let item = items.first(where: { $0.status == .pending }) else { break }
            await process(item, options: options)
        }
        if canceled {
            for idx in items.indices where items[idx].status == .pending {
                items[idx].status = .canceled
                items[idx].message = "已取消"
            }
        }
        running = false
        currentId = nil
        canceled = false
    }

    private func process(_ item: PrintItem, options: PrintOptions) async {
        guard let idx = items.firstIndex(where: { $0.id == item.id }) else { return }

        if item.kind == .office {
            items[idx].status = .skipped
            items[idx].message = "iOS 版暂不支持 Office 文档，请先导出为 PDF"
            return
        }
        if item.kind == .unsupported {
            items[idx].status = .skipped
            items[idx].message = "不支持的文件类型"
            return
        }

        currentId = item.id
        items[idx].status = .printing
        items[idx].message = "打印中"

        do {
            let outcome = try await printDocument(item: item, options: options)
            guard let doneIdx = items.firstIndex(where: { $0.id == item.id }) else { return }
            items[doneIdx].status = .done
            items[doneIdx].message = outcome
        } catch {
            guard let failIdx = items.firstIndex(where: { $0.id == item.id }) else { return }
            if canceled {
                items[failIdx].status = .canceled
                items[failIdx].message = "已取消"
            } else {
                items[failIdx].status = .failed
                items[failIdx].message = error.localizedDescription
            }
        }
    }

    private func printDocument(item: PrintItem, options: PrintOptions) async throws -> String {
        guard let urlString = options.printerURL,
              let printer = PrinterManager.printer(fromURLString: urlString) else {
            throw PrintError.noPrinter
        }
        guard PDFDocument(url: item.url) != nil else {
            throw PrintError.unreadable
        }

        // 首次提交常见瞬时失败（AirPrint 建连、本地网络权限授权中、打印机休眠唤醒），
        // 自动重试一次；每次尝试新建 controller，避免复用脏对象。
        var lastError: PrintError = .connectFailed
        for attempt in 0..<2 {
            if attempt > 0 {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
            guard !canceled else { throw PrintError.submitFailed("") }

            let controller = UIPrintInteractionController()
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = item.name
            switch options.color {
            case .mono: info.outputType = .grayscale
            case .color: info.outputType = .photo
            }
            switch options.duplex {
            case .simplex: info.duplex = .none
            case .longEdge: info.duplex = .longEdge
            case .shortEdge: info.duplex = .shortEdge
            }
            controller.printInfo = info
            controller.printingItem = item.url
            controller.delegate = self

            jobFinished = false
            jobController = controller

            let submitted = await withCheckedContinuation { (cont: CheckedContinuation<(Bool, Error?), Never>) in
                controller.print(to: printer) { _, completed, error in
                    cont.resume(returning: (completed, error))
                }
            }
            if let error = submitted.1 {
                lastError = .submitFailed(error.localizedDescription)
                jobController = nil
                continue
            }
            if !submitted.0 {
                lastError = .connectFailed
                jobController = nil
                continue
            }

            let finished = await waitForJobFinish()
            jobController = nil
            return finished ? "已完成" : "已提交（等待打印完成超时）"
        }
        throw lastError
    }

    /// 等待 UIPrintInteractionControllerDelegate 的 didFinishJob；超时视为已提交。
    private func waitForJobFinish() async -> Bool {
        if jobFinished { return true }

        let watchdog = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: Self.jobWatchdogSeconds * 1_000_000_000)
            guard !Task.isCancelled else { return }
            self?.jobWatchdogFired()
        }
        defer { watchdog.cancel() }

        let finished = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            if jobFinished {
                cont.resume(returning: true)
            } else {
                jobWaiter = cont
            }
        }
        return finished
    }

    fileprivate func handleJobFinished() {
        jobFinished = true
        if let waiter = jobWaiter {
            jobWaiter = nil
            waiter.resume(returning: true)
        }
    }

    private func jobWatchdogFired() {
        if let waiter = jobWaiter {
            jobWaiter = nil
            waiter.resume(returning: false)
        }
    }

    // MARK: - 统计

    var summary: QueueSummary {
        let count = { (status: ItemStatus) in self.items.filter { $0.status == status }.count }
        return QueueSummary(
            running: running,
            total: items.count,
            done: count(.done),
            failed: count(.failed),
            skipped: count(.skipped),
            canceled: count(.canceled),
            currentId: currentId
        )
    }

    var currentItem: PrintItem? {
        guard let currentId else { return nil }
        return items.first { $0.id == currentId }
    }

    var progressFraction: Double? {
        let s = summary
        guard s.total > 0 else { return nil }
        let processed = s.done + s.failed + s.skipped + s.canceled
        var fraction = 0.0
        if s.running {
            fraction = currentItem?.status == .printing ? 0.5 : 0.1
        }
        return min(1.0, (Double(processed) + fraction) / Double(s.total))
    }
}

extension PrintQueue: UIPrintInteractionControllerDelegate {
    nonisolated func printInteractionControllerDidFinishJob(_ printInteractionController: UIPrintInteractionController) {
        Task { @MainActor [weak self] in
            self?.handleJobFinished()
        }
    }
}
