import Combine
import Sparkle
import SwiftUI

@MainActor
final class AppUpdates: ObservableObject {
    static let shared = AppUpdates()
    @Published private(set) var canCheck = false
    @Published private(set) var automaticChecks = true
    @Published private(set) var automaticDownloads = true
    @Published private(set) var lastCheck: Date?
    private let controller: SPUStandardUpdaterController
    private var started = false

    private init() {
        controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: nil, userDriverDelegate: nil)
        controller.updater.publisher(for: \.canCheckForUpdates).assign(to: &$canCheck)
        controller.updater.publisher(for: \.automaticallyChecksForUpdates).assign(to: &$automaticChecks)
        controller.updater.publisher(for: \.automaticallyDownloadsUpdates).assign(to: &$automaticDownloads)
        controller.updater.publisher(for: \.lastUpdateCheckDate).assign(to: &$lastCheck)
    }

    func start() {
        guard !started else { return }
        started = true
        controller.startUpdater()
    }

    func check() { controller.checkForUpdates(nil) }
    func setAutomaticChecks(_ enabled: Bool) { controller.updater.automaticallyChecksForUpdates = enabled }
    func setAutomaticDownloads(_ enabled: Bool) { controller.updater.automaticallyDownloadsUpdates = enabled }
}

struct UpdateMenuItem: View {
    @ObservedObject private var updates = AppUpdates.shared
    var body: some View {
        Button("检查更新…") { updates.check() }
            .disabled(!updates.canCheck)
    }
}

struct UpdateSettingsView: View {
    @ObservedObject private var updates = AppUpdates.shared
    private var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "未知" }

    var body: some View {
        Section("软件更新") {
            LabeledContent("当前版本", value: version)
            Toggle("自动检查 GitHub Release 更新", isOn: Binding(
                get: { updates.automaticChecks }, set: updates.setAutomaticChecks))
            Toggle("自动下载并在退出时安装更新", isOn: Binding(
                get: { updates.automaticDownloads }, set: updates.setAutomaticDownloads))
                .disabled(!updates.automaticChecks)
            HStack {
                UpdateMenuItem()
                Spacer()
                if let date = updates.lastCheck {
                    Text("上次检查：\(date.formatted(date: .abbreviated, time: .shortened))")
                        .appFont(11).foregroundStyle(.secondary)
                }
            }
            Text("更新会验证发布签名。下载后可立即安装并重新打开，也可在退出时安装。首次安装请将视听拖入“应用程序”。")
                .appFont(11).foregroundStyle(.secondary)
        }
    }
}
