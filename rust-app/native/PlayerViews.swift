import SwiftUI
import AppKit
import Combine

private enum PlayerLayout {
    static let margin: CGFloat = 12
    static let topHeight: CGFloat = 44
    static let controlHeight: CGFloat = 36
}

struct NativePlayerView: View {
    @ObservedObject var model: PlayerModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var controlsCollapsed = false
    @State private var lastActivity = Date()
    @State private var bottomHovered = false
    @State private var menuTracking = false
    @State private var eventMonitor: Any?
    @FocusState private var controlsFocused: Bool
    private let idleTimer = Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()

    private var mayCollapse: Bool {
        model.playing && model.error == nil && !model.settingsOpen && !model.channelPickerOpen && !model.historyOpen && !bottomHovered && !controlsFocused && !menuTracking
    }

    private func revealControls() {
        lastActivity = Date()
        controlsCollapsed = false
    }

    var body: some View {
        ZStack {
            WebPlayer(model: model)
                .ignoresSafeArea()
            if model.sourceURL.isEmpty {
                WelcomeView(model: model)
            }
            VStack(spacing: 0) {
                topControls
                Spacer(minLength: 0)
                ZStack {
                    bottomControls
                        .opacity(controlsCollapsed ? 0 : 1)
                        .allowsHitTesting(!controlsCollapsed)
                        .accessibilityHidden(controlsCollapsed)
                    if controlsCollapsed {
                        Button(action: revealControls) {
                            Capsule().fill(.secondary).frame(width: 64, height: 6)
                                .frame(width: 64, height: PlayerLayout.controlHeight)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .help("显示播放控制")
                        .accessibilityLabel("显示播放控制")
                    }
                }
                .onHover { bottomHovered = $0; if $0 { revealControls() } }
                .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: controlsCollapsed)
            }
            .padding(.horizontal, PlayerLayout.margin)
            .padding(.bottom, PlayerLayout.margin)
        }
        .overlay(alignment: .trailing) {
            CaptionHistorySidebar(model: model)
                .frame(width: 340)
                .padding(.top, 56 * model.fontScale)
                .padding(.bottom, 60 * model.fontScale)
                .padding(.trailing, PlayerLayout.margin)
                .opacity(model.historyOpen ? 1 : 0)
                .allowsHitTesting(model.historyOpen)
                .accessibilityHidden(!model.historyOpen)
        }
        .onAppear {
            eventMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDown, .rightMouseDown, .leftMouseDragged, .scrollWheel, .keyDown]) { event in
                if event.window == model.webView.window {
                    let wasCollapsed = controlsCollapsed
                    revealControls()
                    if wasCollapsed && [.keyDown, .leftMouseDown, .rightMouseDown].contains(event.type) { return nil }
                }
                return event
            }
            model.webView.window?.acceptsMouseMovedEvents = true
        }
        .onChange(of: model.isReady) {
            model.webView.window?.acceptsMouseMovedEvents = true
        }
        .onDisappear {
            if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }
            eventMonitor = nil
        }
        .onReceive(idleTimer) { now in
            if !mayCollapse { controlsCollapsed = false; lastActivity = now }
            else if now.timeIntervalSince(lastActivity) >= 3 { controlsCollapsed = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSMenu.didBeginTrackingNotification)) { _ in menuTracking = true; revealControls() }
        .onReceive(NotificationCenter.default.publisher(for: NSMenu.didEndTrackingNotification)) { _ in menuTracking = false; revealControls() }
        .frame(minWidth: 760, minHeight: 520)
        .preferredColorScheme(model.appearance == "dark" ? .dark : model.appearance == "light" ? .light : nil)
        .sheet(isPresented: $model.settingsOpen) { PlayerSettingsView(model: model).appAppearance(model) }
        .appAppearance(model)
    }

    private var topControls: some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                Text(model.sourceName.isEmpty ? "视听" : model.sourceName)
                    .appFont(13, weight: .medium)
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 32 * model.fontScale)
                    .appGlass(in: Capsule())
                Spacer(minLength: 12)
                Button { model.channelPickerOpen = true } label: {
                    Label("频道", systemImage: "list.bullet")
                }
                .popover(isPresented: $model.channelPickerOpen, arrowEdge: .bottom) {
                    ChannelPickerView(model: model).appAppearance(model)
                }
                GlassIconButton(title: "设置", symbol: "gearshape") { model.settingsOpen = true }
                    .keyboardShortcut(",", modifiers: .command)
            }
            .buttonStyle(AppGlassButtonStyle())
            .controlSize(.regular)
        }
        .padding(.leading, 76)
        .frame(minHeight: PlayerLayout.topHeight * model.fontScale)
    }

    private var bottomControls: some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                GlassIconButton(title: model.playing ? "暂停" : "播放", symbol: model.playing ? "pause.fill" : "play.fill") {
                    model.togglePlayback()
                }
                .disabled(model.sourceURL.isEmpty || !model.isReady)
                .focused($controlsFocused)
                HStack(spacing: 8) {
                    if !model.isReady { ProgressView().controlSize(.mini) }
                    Text(model.error ?? (model.sourceURL.isEmpty ? "选择频道，或粘贴播放地址" : model.playStatus))
                        .lineLimit(1)
                    if !model.captionStatus.isEmpty && !model.sourceURL.isEmpty {
                        Text("·").appSecondary()
                        Text(model.captionStatus).lineLimit(1).appSecondary()
                    }
                }
                .appFont(12)
                .padding(.horizontal, 12)
                .frame(minHeight: PlayerLayout.controlHeight * model.fontScale)
                .appGlass(in: Capsule())
                Spacer(minLength: 0)
                Button { model.historyOpen.toggle() } label: {
                    Label(model.captionsPreparing ? "准备字幕" : "字幕", systemImage: model.captionsEnabled ? "captions.bubble.fill" : "captions.bubble")
                }
                .buttonStyle(AppGlassButtonStyle())
                .help(model.historyOpen ? "关闭字幕回看" : "打开字幕回看")
                .accessibilityValue(model.historyOpen ? "回看侧栏已打开" : "回看侧栏已关闭")
                .focused($controlsFocused)
                .disabled(model.sourceURL.isEmpty || !model.isReady)
                Menu {
                    Button(model.captionsEnabled || model.captionsPreparing ? "关闭字幕识别" : "开启字幕识别") { model.toggleCaptions() }
                    Picker("字幕显示", selection: $model.captionMode) {
                        Text("中文＋英文").tag("both")
                        Text("只看中文").tag("zh")
                        Text("只看英文").tag("en")
                        Text("隐藏画面字幕").tag("off")
                    }
                } label: {
                    Image(systemName: "chevron.down").accessibilityLabel("字幕选项")
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .help("字幕开关与显示语言")
                .focused($controlsFocused)
                .disabled(model.sourceURL.isEmpty || !model.isReady)
                .onChange(of: model.captionMode) { model.applySettings() }
                GlassIconButton(title: "全屏", symbol: "arrow.up.left.and.arrow.down.right") { model.toggleFullscreen() }
                    .keyboardShortcut("f", modifiers: [.command, .control])
                    .focused($controlsFocused)
            }
            .controlSize(.regular)
        }
        .frame(minHeight: PlayerLayout.controlHeight * model.fontScale)
    }
}

private struct GlassIconButton: View {
    @Environment(\.appFontScale) private var fontScale
    let title: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol).frame(width: 16 * fontScale, height: 20 * fontScale)
        }
        .buttonStyle(AppGlassButtonStyle())
        .help(title)
        .accessibilityLabel(title)
    }
}

private struct WelcomeView: View {
    @ObservedObject var model: PlayerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "play.rectangle")
                    .appFont(32, weight: .light)
                    .appSecondary()
                Text("开始观看").appFont(24, weight: .semibold)
                Text("选择一个频道，或粘贴你想看的播放地址。")
                    .appFont(13).appSecondary()
            }
            SourceEntryView(model: model)
            Button { model.channelPickerOpen = true } label: {
                Label("浏览频道", systemImage: "list.bullet.rectangle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(AppGlassButtonStyle())
            .controlSize(.large)
        }
        .padding(32)
        .frame(width: 484 + 100 * (model.fontScale - 1))
        .appGlass(in: RoundedRectangle(cornerRadius: 24))
    }
}

private struct SourceEntryView: View {
    @ObservedObject var model: PlayerModel
    @State private var address = ""

    var body: some View {
        HStack(spacing: 8) {
            TextField("粘贴播放地址", text: $address)
                .textFieldStyle(.roundedBorder)
                .onSubmit(play)
                .accessibilityLabel("播放地址")
            Button("播放", systemImage: "play.fill", action: play)
                .buttonStyle(AppGlassButtonStyle(prominent: true))
                .disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.isReady)
        }
        .controlSize(.large)
    }

    private func play() {
        let url = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !url.isEmpty && model.isReady else { return }
        model.loadSource(url)
    }
}

private struct ChannelPickerView: View {
    @ObservedObject var model: PlayerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("频道").appFont(13, weight: .semibold)
            ChannelListView(model: model)
        }
        .padding(16)
        .frame(width: 360, height: 440)
    }
}

private struct ChannelListView: View {
    @ObservedObject var model: PlayerModel
    @State private var search = ""

    var body: some View {
        VStack(spacing: 8) {
            TextField("搜索频道", text: $search)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("搜索频道")
            ScrollView {
                LazyVStack(spacing: 6) {
                ForEach(model.channels.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }, id: \.id) { channel in
                    Button {
                        model.loadSource(channel.url, label: channel.name)
                        model.channelPickerOpen = false
                        model.settingsOpen = false
                    } label: {
                        HStack(spacing: 8) {
                            Text(channel.name).lineLimit(1)
                            Spacer()
                            if !channel.supported {
                                Text("暂不支持").appFont(11).appSecondary()
                            } else if model.sourceURL == channel.url {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            } else {
                                Image(systemName: "play.fill").appFont(11).appSecondary()
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(AppGlassButtonStyle())
                    .disabled(!channel.supported || !model.isReady)
                }
                }
                .padding(4)
            }
            .overlay {
                if model.channels.isEmpty {
                    Text(model.isReady ? "暂无频道" : "正在载入频道…").appSecondary()
                } else if !search.isEmpty && !model.channels.contains(where: { $0.name.localizedCaseInsensitiveContains(search) }) {
                    Text("没有匹配的频道").appSecondary()
                }
            }
        }
    }
}

private struct PlayerSettingsView: View {
    @ObservedObject var model: PlayerModel
    @State private var googleKey = ""
    @State private var volcanoAK = ""
    @State private var volcanoSK = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("设置").appFont(22, weight: .semibold)
                Spacer()
                Button("完成") { model.settingsOpen = false }
                    .buttonStyle(AppGlassButtonStyle(prominent: true))
                    .keyboardShortcut(.defaultAction)
            }
            .padding(20)
            Form {
                AppearanceSettingsView(model: model)
                Section("播放来源") {
                    SourceEntryView(model: model)
                    ChannelListView(model: model).frame(height: 180)
                }
                Section("画面与字幕") {
                    Picker("外观", selection: $model.appearance) {
                        Text("跟随系统").tag("system")
                        Text("浅色").tag("light")
                        Text("深色").tag("dark")
                    }
                    Picker("字幕显示", selection: $model.captionMode) {
                        Text("中文＋英文").tag("both")
                        Text("只看中文").tag("zh")
                        Text("只看英文").tag("en")
                        Text("隐藏字幕").tag("off")
                    }
                    LabeledContent("字幕背景透明度") {
                        Slider(value: $model.captionOpacity, in: 0...100, step: 1)
                            .accessibilityLabel("字幕背景透明度")
                        Text("\(Int(model.captionOpacity))%")
                            .monospacedDigit().frame(minWidth: 44 * model.fontScale, alignment: .trailing)
                    }
                    Text("透明度越高，字幕底色越淡。隐藏字幕时仍继续识别。")
                        .appFont(11).appSecondary()
                }
                Section("字幕缓冲") {
                    Toggle("提前缓冲，给字幕处理更多时间", isOn: $model.captionBufferEnabled)
                    Picker("缓冲时长", selection: $model.captionBufferSeconds) {
                        Text("3 秒").tag(3)
                        Text("4 秒").tag(4)
                        Text("5 秒").tag(5)
                    }
                    .disabled(!model.captionBufferEnabled)
                    Text("默认关闭，保留当前播放方式。开启后画面与原声一起延迟，字幕尽量提前准备；较慢的翻译仍可能晚到。更改在下次载入播放来源时生效。")
                        .appFont(11).appSecondary()
                }
                Section("翻译") {
                    Picker("翻译服务", selection: $model.provider) {
                        Text("本机翻译").tag("local")
                        Text("Google 翻译").tag("google")
                        Text("火山翻译").tag("volcano")
                    }
                    if model.provider == "google" {
                        SecureField("Google API 密钥", text: $googleKey)
                        Button("保存密钥") { model.saveGoogle(googleKey); googleKey = "" }
                            .buttonStyle(AppGlassButtonStyle()).disabled(googleKey.isEmpty)
                    } else if model.provider == "volcano" {
                        SecureField("Access Key", text: $volcanoAK)
                        SecureField("Secret Key", text: $volcanoSK)
                        Button("保存密钥") {
                            model.saveVolcano(ak: volcanoAK, sk: volcanoSK)
                            volcanoAK = ""; volcanoSK = ""
                        }
                        .buttonStyle(AppGlassButtonStyle()).disabled(volcanoAK.isEmpty || volcanoSK.isEmpty)
                    }
                }
                Section("字幕记录") {
                    if model.history.isEmpty {
                        Text("开始观看并开启字幕后，记录会显示在这里。")
                            .appSecondary()
                    } else {
                        ForEach(model.history.suffix(20), id: \.id) { entry in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(entry.time).appFont(11).appSecondary()
                                Text(entry.zh)
                                Text(entry.en).appSecondary()
                            }
                            .textSelection(.enabled)
                        }
                        HStack {
                            Button("导出全部记录", action: model.exportHistory).buttonStyle(AppGlassButtonStyle())
                            Button("清空记录", role: .destructive, action: model.clearHistory).buttonStyle(AppGlassButtonStyle())
                        }
                    }
                }
                UpdateSettingsView()
                Section("浏览器连接") {
                    Button("复制配对码", systemImage: "doc.on.doc", action: model.copyPairing)
                        .buttonStyle(AppGlassButtonStyle())
                }
            }
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
            .onChange(of: model.appearance) { model.applySettings() }
            .onChange(of: model.captionMode) { model.applySettings() }
            .onChange(of: model.captionOpacity) { model.applySettings() }
            .onChange(of: model.provider) { model.applySettings() }
            .onChange(of: model.captionBufferEnabled) { model.applySettings() }
            .onChange(of: model.captionBufferSeconds) { model.applySettings() }
        }
        .frame(width: 640, height: 640)
        .appGlass(in: RoundedRectangle(cornerRadius: 20))
        .presentationBackground(.clear)
    }
}
