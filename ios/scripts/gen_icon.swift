import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// 生成 1024x1024 iOS App Icon：蓝渐变背景 + 顶部扇出的多张纸（批量）+ 打印机 + 底部出纸
let size = 1024
guard let ctx = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
) else { fatalError("ctx") }

// CoreGraphics 默认原点左下、y 向上；翻转为 y 向下，方便按设计稿坐标绘制
ctx.translateBy(x: 0, y: CGFloat(size))
ctx.scaleBy(x: 1, y: -1)

func rgb(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}
let bgSpace = CGColorSpace(name: CGColorSpace.sRGB)!

// --- 背景：蓝 → 青渐变（左上到右下）---
if let gradient = CGGradient(colorsSpace: bgSpace, colors: [rgb(0x1D4ED8), rgb(0x0EA5E9)] as CFArray, locations: [0, 1]) {
    ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: CGFloat(size), y: CGFloat(size)), options: [])
}

func roundRect(_ c: CGContext, _ rect: CGRect, radius: CGFloat) {
    c.addPath(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
}

/// 纸上的文字线：从 rect 顶部 startFraction 处向下排 3 条
func paperLines(_ c: CGContext, rect: CGRect, color: CGColor, startFraction: CGFloat = 0.18) {
    c.setFillColor(color)
    let padX = rect.width * 0.16
    var y = rect.minY + rect.height * startFraction
    for i in 0..<3 {
        let w = (rect.width - padX * 2) * (i == 2 ? 0.55 : 1.0)
        let r = CGRect(x: rect.minX + padX, y: y, width: w, height: max(rect.height * 0.05, 8))
        roundRect(c, r, radius: r.height / 2)
        c.fillPath()
        y += rect.height * 0.135
    }
}

// --- 顶部：三张扇出的纸（批量待打印），下脚插入机身遮挡 ---
let paperW: CGFloat = 330
let paperH: CGFloat = 430
let papers: [(cx: CGFloat, cy: CGFloat, angle: CGFloat, hasBadge: Bool)] = [
    (352, 372, -13, false),
    (512, 330, 0, true),
    (672, 372, 13, false),
]
let paperColor = rgb(0xFFFFFF)
let lineColor = rgb(0xCBD5E1)

for p in papers {
    ctx.saveGState()
    ctx.translateBy(x: p.cx, y: p.cy)
    ctx.rotate(by: p.angle * .pi / 180)
    let rect = CGRect(x: -paperW / 2, y: -paperH / 2, width: paperW, height: paperH)
    ctx.setShadow(offset: CGSize(width: 0, height: 12), blur: 26,
                  color: CGColor(colorSpace: bgSpace, components: [0, 0, 0, 0.25])!)
    ctx.setFillColor(paperColor)
    roundRect(ctx, rect, radius: 26)
    ctx.fillPath()
    ctx.setShadow(offset: .zero, blur: 0, color: nil)

    if p.hasBadge {
        // 红色 PDF 徽标（纸的标题位）
        let badge = CGRect(x: rect.minX + rect.width * 0.14, y: rect.minY + rect.height * 0.13,
                           width: rect.width * 0.40, height: rect.height * 0.13)
        ctx.setFillColor(rgb(0xEF4444))
        roundRect(ctx, badge, radius: badge.height * 0.30)
        ctx.fillPath()
        ctx.setFillColor(rgb(0xFFFFFF))
        let bar = CGRect(x: badge.minX + badge.width * 0.16, y: badge.midY - badge.height * 0.11,
                         width: badge.width * 0.68, height: badge.height * 0.22)
        roundRect(ctx, bar, radius: bar.height / 2)
        ctx.fillPath()
        // 徽标下方文字线
        let lines = CGRect(x: rect.minX, y: rect.minY + rect.height * 0.36, width: rect.width, height: rect.height * 0.40)
        paperLines(ctx, rect: lines, color: lineColor, startFraction: 0.10)
    } else {
        paperLines(ctx, rect: rect, color: lineColor, startFraction: 0.30)
    }
    ctx.restoreGState()
}

// --- 打印机机身 ---
let body = CGRect(x: 152, y: 560, width: 720, height: 300)
ctx.setShadow(offset: CGSize(width: 0, height: 16), blur: 30,
              color: CGColor(colorSpace: bgSpace, components: [0, 0, 0, 0.30])!)
ctx.setFillColor(rgb(0xF8FAFC))
roundRect(ctx, body, radius: 72)
ctx.fillPath()
ctx.setShadow(offset: .zero, blur: 0, color: nil)

// 机身顶部：进纸口（深色圆角横条）
ctx.setFillColor(rgb(0x1E293B))
let slot = CGRect(x: body.minX + 110, y: body.minY + 44, width: body.width - 220, height: 36)
roundRect(ctx, slot, radius: 18)
ctx.fillPath()

// 机身正面：状态灯（红）+ 显示条（青）
ctx.setFillColor(rgb(0xEF4444))
let dot = CGRect(x: body.minX + 76, y: body.maxY - 92, width: 36, height: 36)
roundRect(ctx, dot, radius: 18)
ctx.fillPath()
ctx.setFillColor(rgb(0x0EA5E9))
let screen = CGRect(x: body.maxX - 150, y: body.maxY - 84, width: 74, height: 36)
roundRect(ctx, screen, radius: 18)
ctx.fillPath()

// --- 底部：打印出来的纸（从出纸口伸出，盖住机身下缘）---
let outPaper = CGRect(x: 512 - 170, y: 796, width: 340, height: 176)
ctx.setFillColor(paperColor)
roundRect(ctx, outPaper, radius: 24)
ctx.fillPath()
paperLines(ctx, rect: outPaper, color: lineColor, startFraction: 0.55)

guard let image = ctx.makeImage() else { fatalError("image") }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { fatalError("dest") }
CGImageDestinationAddImage(dest, image, nil)
CGImageDestinationFinalize(dest)
print("written \(url.path)")
