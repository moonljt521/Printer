import Foundation

/// UserDefaults 持久化：记住打印设置（对应桌面版 settings.json 的 rememberOptions/lastOptions）。
@MainActor
final class SettingsStore: ObservableObject {
    private enum Keys {
        static let remember = "rememberOptions"
        static let printerURL = "lastPrinterURL"
        static let duplex = "lastDuplex"
        static let color = "lastColor"
        static let duplexRemembered = "hasRememberedDuplex"
        static let colorRemembered = "hasRememberedColor"
    }

    private let defaults = UserDefaults.standard

    @Published var rememberOptions: Bool {
        didSet { defaults.set(rememberOptions, forKey: Keys.remember) }
    }

    @Published private(set) var lastDuplex: DuplexMode {
        didSet { defaults.set(lastDuplex.rawValue, forKey: Keys.duplex) }
    }

    @Published private(set) var lastColor: ColorMode {
        didSet { defaults.set(lastColor.rawValue, forKey: Keys.color) }
    }

    @Published private(set) var lastPrinterURL: String? {
        didSet { defaults.set(lastPrinterURL, forKey: Keys.printerURL) }
    }

    init() {
        let hasRemember = defaults.object(forKey: Keys.remember) as? Bool
        self.rememberOptions = hasRemember ?? true

        if let raw = defaults.string(forKey: Keys.duplex), let mode = DuplexMode(rawValue: raw) {
            self.lastDuplex = mode
        } else {
            self.lastDuplex = .simplex
        }

        if let raw = defaults.string(forKey: Keys.color), let mode = ColorMode(rawValue: raw) {
            self.lastColor = mode
        } else {
            self.lastColor = .color
        }

        self.lastPrinterURL = defaults.string(forKey: Keys.printerURL)
    }

    func save(printerURL: String?, duplex: DuplexMode, color: ColorMode) {
        guard rememberOptions else { return }
        self.lastPrinterURL = printerURL
        self.lastDuplex = duplex
        self.lastColor = color
    }
}
