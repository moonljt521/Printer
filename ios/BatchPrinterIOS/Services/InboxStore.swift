import Foundation

enum SharedContainer {
    static let appGroupID = "group.com.moon.batchprinter"

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
    }

    static var inboxURL: URL? {
        guard let base = containerURL else { return nil }
        return base.appendingPathComponent("Inbox", isDirectory: true)
    }
}

/// 分享扩展写入 App Group 的收件箱；主应用启动/回前台时导入并清空。
enum InboxStore {
    static func ensureInbox() -> URL? {
        guard let inbox = SharedContainer.inboxURL else { return nil }
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        return inbox
    }

    /// 主应用侧：把收件箱里的文件移动到应用沙盒 Incoming 目录。
    static func drainInbox() -> [URL] {
        guard let inbox = SharedContainer.inboxURL else { return [] }
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil) else {
            return []
        }
        var imported: [URL] = []
        for entry in entries where !entry.hasDirectoryPath {
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: entry.path, isDirectory: &isDir), !isDir.boolValue else { continue }
            if let dest = try? ImportsStore.importFile(at: entry) {
                imported.append(dest)
            }
            try? fm.removeItem(at: entry)
        }
        return imported
    }
}

/// 应用沙盒内的文件副本目录（选择器/分享导入的文件都复制一份，避免安全作用域失效）。
enum ImportsStore {
    static var directoryURL: URL {
        let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Incoming", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// 复制（或移动）一个外部文件进沙盒，带唯一前缀避免重名覆盖。保留原名用于展示。
    @discardableResult
    static func importFile(at source: URL) throws -> URL {
        let fm = FileManager.default
        let unique = UUID().uuidString.prefix(8)
        let dest = directoryURL.appendingPathComponent("\(unique)-\(source.lastPathComponent)")
        if fm.fileExists(atPath: dest.path) {
            try fm.removeItem(at: dest)
        }
        try fm.copyItem(at: source, to: dest)
        return dest
    }

    /// 显示名：去掉唯一前缀。
    static func displayName(for url: URL) -> String {
        let name = url.lastPathComponent
        if let dash = name.firstIndex(of: "-"), name.distance(from: name.startIndex, to: dash) == 8 {
            return String(name[name.index(after: dash)...])
        }
        return name
    }

    /// 从系统文件选择器得来的 URL 需要安全作用域访问后才能读取。
    @discardableResult
    static func importWithSecurityScope(at source: URL) throws -> URL {
        let scoped = source.startAccessingSecurityScopedResource()
        defer {
            if scoped { source.stopAccessingSecurityScopedResource() }
        }
        return try importFile(at: source)
    }
}
