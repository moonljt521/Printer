import SwiftUI

@main
struct BatchPrinterApp: App {
    @StateObject private var queue = PrintQueue()
    @StateObject private var settings = SettingsStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(queue)
                .environmentObject(settings)
        }
    }
}
