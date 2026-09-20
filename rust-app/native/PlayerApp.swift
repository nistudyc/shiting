import AppKit
import SwiftUI
import WebKit

@MainActor
struct WebPlayer: NSViewRepresentable {
    @ObservedObject var model: PlayerModel
    func makeNSView(context: Context) -> WKWebView { model.webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}

@MainActor
final class PlayerAppDelegate: NSObject, NSApplicationDelegate {
    static weak var player: PlayerModel?
    func applicationDidFinishLaunching(_ notification: Notification) { AppUpdates.shared.start() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { Self.player?.stop() }
}

@main
struct ShitingNativeApp: App {
    @NSApplicationDelegateAdaptor(PlayerAppDelegate.self) var delegate
    @StateObject private var model = PlayerModel()
    var body: some Scene {
        Window("视听", id: "player") {
            NativePlayerView(model: model)
                .frame(minWidth: 760, minHeight: 520)
                .task { PlayerAppDelegate.player = model; await model.start() }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1180, height: 760)
        .commands {
            CommandGroup(after: .appInfo) { UpdateMenuItem() }
            CommandGroup(replacing: .newItem) {}
            CommandGroup(replacing: .appSettings) {
                Button("设置…") { model.settingsOpen = true }
                    .keyboardShortcut(",", modifiers: .command)
            }
        }
    }
}
