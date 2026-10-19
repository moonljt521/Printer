import UIKit

/// UIPrinter 的持久化与选择器封装（对应桌面版的打印机枚举/刷新）。
enum PrinterManager {
    static func printer(fromURLString urlString: String) -> UIPrinter? {
        guard let url = URL(string: urlString) else { return nil }
        return UIPrinter(url: url)
    }

    static func displayName(fromURLString urlString: String) -> String {
        guard let url = URL(string: urlString) else { return urlString }
        if let host = url.host, !host.isEmpty { return host }
        return urlString
    }

    /// 弹出系统打印机选择器；用户取消时回调 nil。
    @MainActor
    static func presentPicker(completion: @escaping (UIPrinter?) -> Void) {
        let picker = UIPrinterPickerController(initiallySelectedPrinter: nil)
        picker.present(animated: true) { controller, didSelect, _ in
            completion(didSelect ? controller.selectedPrinter : nil)
        }
    }
}
