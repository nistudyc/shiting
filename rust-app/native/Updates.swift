import Combine
import Sparkle
import SwiftUI

@MainActor
final class AppUpdates: NSObject, ObservableObject {
    static let shared = AppUpdates()
    @Published private(set) var canCheck = false
    @Published private(set) var automaticChecks = true
    @Published private(set) var automaticDownloads = true
    @Published private(set) var lastCheck: Date?
    @Published private(set) var updateVersion: String?
    private var controller: SPUStandardUpdaterController!
    private var started = false

    private override init() {
        super.init()
        controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: self, userDriverDelegate: nil)
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

// Sparkle 的 delegate 回调都发生在主线程，这里只桥接回 @MainActor 状态。
extension AppUpdates: SPUUpdaterDelegate {
    nonisolated func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        MainActor.assumeIsolated {
            self.updateVersion = item.displayVersionString
        }
    }

    nonisolated func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
        MainActor.assumeIsolated {
            self.updateVersion = nil
        }
    }

    // 用户选择“安装并重启”后正常退出可能被 WebView 阻塞（尤其全屏直播时），
    // 导致安装器等不到应用退出。这里在 1 秒后兜底：先结束本机播放服务，
    // 再立即退出进程，把安装与重启交给已启动的 Sparkle 安装器。
    nonisolated func updater(_ updater: SPUUpdater, willInstallUpdate item: SUAppcastItem) {
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1))
            PlayerAppDelegate.player?.stop()
            exit(0)
        }
    }
}

/// 有新版本时显示的蓝色小圆点（类似 Codex 的更新提示）。
struct UpdateBadgeDot: View {
    var body: some View {
        Circle()
            .fill(Color.blue)
            .frame(width: 8, height: 8)
            .overlay(Circle().strokeBorder(Color.white.opacity(0.85), lineWidth: 1.5))
            .shadow(color: .black.opacity(0.25), radius: 0.5)
            .accessibilityHidden(true)
    }
}

struct UpdateMenuItem: View {
    @ObservedObject private var updates = AppUpdates.shared
    var body: some View {
        Button(updates.updateVersion == nil ? "检查更新…" : "有新版本，检查更新…") { updates.check() }
            .disabled(!updates.canCheck)
    }
}

struct UpdateSettingsView: View {
    @ObservedObject private var updates = AppUpdates.shared
    private var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "未知" }

    var body: some View {
        Section("软件更新") {
            LabeledContent("当前版本", value: version)
            if let updateVersion = updates.updateVersion {
                HStack(spacing: 8) {
                    UpdateBadgeDot()
                    Text("有新版本 \(updateVersion) 可用").appFont(13, weight: .medium)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("有新版本可用")
            }
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
                        .appFont(11).appSecondary()
                }
            }
            Text("更新会验证发布签名。下载后可立即安装并重新打开，也可在退出时安装。首次安装请将视听拖入“应用程序”。")
                .appFont(11).appSecondary()
        }
    }
}
