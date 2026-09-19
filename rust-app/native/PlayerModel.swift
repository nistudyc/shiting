import AppKit
import Combine
import Foundation
import WebKit

struct Channel: Decodable, Identifiable {
    let name: String
    let url: String
    var id: String { url }
    var supported: Bool { URL(string: url)?.path.hasSuffix(".mpd") != true }
}
struct CaptionEntry: Decodable, Identifiable {
    let id: String
    let time: String
    let en: String
    let zh: String
}
private struct PlayerSnapshot: Decodable {
    let sourceURL: String
    let sourceName: String
    let playStatus: String
    let captionStatus: String
    let playing: Bool
    let captionsEnabled: Bool
    let captionsPreparing: Bool
    let error: Bool
    let history: [CaptionEntry]
}

@MainActor
final class PlayerModel: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var channels: [Channel] = []
    @Published var sourceURL = ""
    @Published var sourceName = "视听"
    @Published var playStatus = "选择频道或输入播放地址"
    @Published var captionStatus = "本机双语字幕"
    @Published var playing = false
    @Published var captionsEnabled = false
    @Published var captionsPreparing = false
    @Published var captionMode = "both"
    @Published var provider = "local"
    @Published var captionOpacity = 18.0
    @Published var appearance = "system"
    @Published var settingsOpen = false
    @Published var channelPickerOpen = false
    @Published var isReady = false
    @Published var error: String?
    @Published var history: [CaptionEntry] = []
    let webView: WKWebView
    private var service: Process?
    private var started = false
    private var stopping = false
    private let origin = URL(string: "http://127.0.0.1:48765/")!

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.addUserScript(WKUserScript(
            source: "window.SHITING_NATIVE = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        configuration.userContentController.add(PlayerMessageHandler(model: self), name: "player")
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
    }

    func start() async {
        guard !started else { return }
        started = true
        let process = Process()
        process.executableURL = Bundle.main.executableURL?.deletingLastPathComponent().appendingPathComponent("shiting-service")
        process.arguments = ["--serve"]
        process.standardOutput = FileHandle.nullDevice
        let errors = Pipe()
        process.standardError = errors
        process.terminationHandler = { [weak self] process in
            let status = process.terminationStatus
            Task { @MainActor in
                guard let self, !self.stopping else { return }
                self.error = "本机播放服务已停止（\(status)），请重新打开视听。"
            }
        }
        do {
            try process.run()
            service = process
            for _ in 0..<80 {
                try await Task.sleep(for: .milliseconds(100))
                guard process.isRunning else {
                    error = "无法启动播放服务。请先退出另一份视听，再重新打开。"
                    return
                }
                var request = URLRequest(url: origin)
                request.timeoutInterval = 0.5
                if let (_, response) = try? await URLSession.shared.data(for: request),
                   (response as? HTTPURLResponse)?.statusCode == 200 {
                    webView.load(URLRequest(url: origin))
                    return
                }
            }
            error = "本机播放服务启动超时，请重新打开视听。"
            stop()
        } catch {
            self.error = "无法启动视听：\(error.localizedDescription)"
        }
    }

    func stop() {
        stopping = true
        if service?.isRunning == true { service?.terminate() }
        service = nil
    }

    func receive(_ body: Any) {
        guard let object = body as? [String: Any], let type = object["type"] as? String else { return }
        do {
            switch type {
            case "state":
                let data = try JSONSerialization.data(withJSONObject: object)
                let state = try JSONDecoder().decode(PlayerSnapshot.self, from: data)
                sourceURL = state.sourceURL
                sourceName = state.sourceName
                playStatus = state.playStatus
                captionStatus = state.captionStatus
                playing = state.playing
                captionsEnabled = state.captionsEnabled
                captionsPreparing = state.captionsPreparing
                history = state.history
                error = state.error ? state.captionStatus : nil
                if !isReady { isReady = true; applySettings() }
            case "channels":
                if let values = object["channels"] {
                    channels = try JSONDecoder().decode([Channel].self, from: JSONSerialization.data(withJSONObject: values))
                }
            case "settings": settingsOpen = true
            case "pairing":
                if let token = object["token"] as? String {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(token, forType: .string)
                    captionStatus = "配对码已复制"
                }
            default: break
            }
        } catch { self.error = "播放器状态读取失败：\(error.localizedDescription)" }
    }

    private func command(_ object: [String: Any]) {
        guard isReady else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: object)
            guard let json = String(data: data, encoding: .utf8) else { return }
            webView.evaluateJavaScript("window.SHITING_NATIVE_COMMAND(\(json)); void 0") { [weak self] _, error in
                if let error { self?.error = "操作失败：\(error.localizedDescription)" }
            }
        } catch { self.error = error.localizedDescription }
    }

    func loadSource(_ url: String, label: String? = nil) {
        let value = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = URL(string: value), ["http", "https"].contains(parsed.scheme?.lowercased() ?? ""), parsed.host != nil else {
            error = "请输入有效的 HTTP 或 HTTPS 播放地址。"
            return
        }
        error = nil
        channelPickerOpen = false
        settingsOpen = false
        var object: [String: Any] = ["type": "source", "url": value]
        if let label { object["label"] = label }
        command(object)
    }
    func togglePlayback() { command(["type": "play"]) }
    func toggleCaptions() { command(["type": "captions"]) }
    func toggleFullscreen() { webView.window?.toggleFullScreen(nil) }
    func applySettings() {
        command(["type": "settings", "mode": captionMode, "provider": provider, "opacity": captionOpacity, "appearance": appearance])
    }
    func saveGoogle(_ key: String) { command(["type": "google", "key": key.trimmingCharacters(in: .whitespacesAndNewlines)]) }
    func saveVolcano(ak: String, sk: String) { command(["type": "volcano", "ak": ak, "sk": sk]) }
    func clearHistory() { command(["type": "clear"]) }
    func copyPairing() { command(["type": "pairing"]) }
    func exportHistory() {
        guard let window = webView.window else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "视听-双语字幕.txt"
        let text = history.reversed().map { "\($0.time)\n\($0.en)\n\($0.zh)" }.joined(separator: "\n\n")
        panel.beginSheetModal(for: window) { [weak self] result in
            guard result == .OK, let url = panel.url else { return }
            do { try text.write(to: url, atomically: true, encoding: .utf8) }
            catch { self?.error = "导出失败：\(error.localizedDescription)" }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        decisionHandler(url.scheme == "http" && url.host == "127.0.0.1" && url.port == 48765 ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        self.error = "播放器载入失败：\(error.localizedDescription)"
    }
}

@MainActor
private final class PlayerMessageHandler: NSObject, WKScriptMessageHandler {
    weak var model: PlayerModel?
    init(model: PlayerModel) { self.model = model }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == "127.0.0.1", message.frameInfo.securityOrigin.port == 48765 else { return }
        model?.receive(message.body)
    }
}
