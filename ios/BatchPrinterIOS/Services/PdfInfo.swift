import Foundation
import PDFKit

enum PdfInfo {
    /// 解析 PDF 页数；加密损坏或读取失败返回 nil（对应桌面版 pdf-lib 的行为）。
    static func pageCount(of url: URL) -> Int? {
        guard let doc = PDFDocument(url: url) else { return nil }
        let count = doc.pageCount
        return count > 0 ? count : nil
    }
}
