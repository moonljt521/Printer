import Foundation

enum FileKind: String {
    case pdf
    case office
    case unsupported
}

enum ItemStatus: String {
    case pending
    case printing
    case done
    case failed
    case canceled
    case skipped
}

struct PrintItem: Identifiable, Equatable {
    let id: UUID
    let url: URL
    let name: String
    let kind: FileKind
    let size: Int
    var pages: Int?
    var status: ItemStatus = .pending
    var message: String?

    init(url: URL, name: String? = nil) {
        self.id = UUID()
        self.url = url
        self.name = name ?? url.lastPathComponent
        self.kind = FileClassifier.classify(url)
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        self.size = (attrs?[.size] as? NSNumber)?.intValue ?? 0
    }
}

enum FileClassifier {
    static let officeExtensions: Set<String> = [
        "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf",
    ]

    static func classify(_ url: URL) -> FileKind {
        let ext = url.pathExtension.lowercased()
        if ext == "pdf" { return .pdf }
        if officeExtensions.contains(ext) { return .office }
        return .unsupported
    }
}

enum DuplexMode: String, CaseIterable, Identifiable {
    case simplex
    case longEdge
    case shortEdge

    var id: String { rawValue }

    var label: String {
        switch self {
        case .simplex: return "单面"
        case .longEdge: return "双面（长边翻页）"
        case .shortEdge: return "双面（短边翻页）"
        }
    }
}

enum ColorMode: String, CaseIterable, Identifiable {
    case color
    case mono

    var id: String { rawValue }

    var label: String {
        switch self {
        case .color: return "彩色"
        case .mono: return "黑白"
        }
    }
}

struct PrintOptions: Equatable {
    var printerURL: String?
    var duplex: DuplexMode = .simplex
    var color: ColorMode = .color
}

struct QueueSummary {
    var running = false
    var total = 0
    var done = 0
    var failed = 0
    var skipped = 0
    var canceled = 0
    var currentId: UUID?
}

func formatSize(_ bytes: Int) -> String {
    if bytes <= 0 { return "" }
    if bytes < 1024 { return "\(bytes) B" }
    if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
    return String(format: "%.1f MB", Double(bytes) / 1024 / 1024)
}
