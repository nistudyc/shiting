import SwiftUI

private enum PlayerLayout {
    static let margin: CGFloat = 12
    static let topHeight: CGFloat = 44
    static let controlHeight: CGFloat = 36
}

struct NativePlayerView: View {
    @ObservedObject var model: PlayerModel

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
                bottomControls
            }
            .padding(.horizontal, PlayerLayout.margin)
            .padding(.bottom, PlayerLayout.margin)
        }
        .frame(minWidth: 760, minHeight: 520)
        .preferredColorScheme(model.appearance == "dark" ? .dark : model.appearance == "light" ? .light : nil)
        .sheet(isPresented: $model.settingsOpen) { PlayerSettingsView(model: model) }
    }

    private var topControls: some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                Text(model.sourceName.isEmpty ? "视听" : model.sourceName)
                    .font(.system(size: 13, weight: .medium))
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .glassEffect(.regular, in: .capsule)
                Spacer(minLength: 12)
                Button { model.channelPickerOpen = true } label: {
                    Label("频道", systemImage: "list.bullet")
                }
                .popover(isPresented: $model.channelPickerOpen, arrowEdge: .bottom) {
                    ChannelPickerView(model: model)
                }
                GlassIconButton(title: "设置", symbol: "gearshape") { model.settingsOpen = true }
                    .keyboardShortcut(",", modifiers: .command)
            }
            .buttonStyle(.glass)
            .controlSize(.regular)
        }
        .padding(.leading, 76)
        .frame(height: PlayerLayout.topHeight)
    }

    private var bottomControls: some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                GlassIconButton(title: model.playing ? "暂停" : "播放", symbol: model.playing ? "pause.fill" : "play.fill") {
                    model.togglePlayback()
                }
                .disabled(model.sourceURL.isEmpty || !model.isReady)
                HStack(spacing: 8) {
                    if !model.isReady { ProgressView().controlSize(.mini) }
                    Text(model.error ?? (model.sourceURL.isEmpty ? "选择频道，或粘贴播放地址" : model.playStatus))
                        .lineLimit(1)
                    if !model.captionStatus.isEmpty && !model.sourceURL.isEmpty {
                        Text("·").foregroundStyle(.secondary)
                        Text(model.captionStatus).lineLimit(1).foregroundStyle(.secondary)
                    }
                }
                .font(.system(size: 12))
                .padding(.horizontal, 12)
                .frame(height: PlayerLayout.controlHeight)
                .glassEffect(.regular, in: .capsule)
                Spacer(minLength: 0)
                Button { model.toggleCaptions() } label: {
                    Label(model.captionsPreparing ? "准备字幕" : "字幕", systemImage: model.captionsEnabled ? "captions.bubble.fill" : "captions.bubble")
                }
                .buttonStyle(.glass)
                .help(model.captionsEnabled || model.captionsPreparing ? "关闭字幕" : "开启字幕")
                .accessibilityValue(model.captionsEnabled ? "已开启" : "已关闭")
                .disabled(model.sourceURL.isEmpty || !model.isReady)
                GlassIconButton(title: "全屏", symbol: "arrow.up.left.and.arrow.down.right") { model.toggleFullscreen() }
                    .keyboardShortcut("f", modifiers: [.command, .control])
            }
            .controlSize(.regular)
        }
        .frame(height: PlayerLayout.controlHeight)
    }
}

private struct GlassIconButton: View {
    let title: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol).frame(width: 16, height: 20)
        }
        .buttonStyle(.glass)
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
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(.secondary)
                Text("开始观看").font(.system(size: 24, weight: .semibold))
                Text("选择一个频道，或粘贴你想看的播放地址。")
                    .font(.system(size: 13)).foregroundStyle(.secondary)
            }
            SourceEntryView(model: model)
            Button { model.channelPickerOpen = true } label: {
                Label("浏览频道", systemImage: "list.bullet.rectangle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glass)
            .controlSize(.large)
        }
        .padding(32)
        .frame(width: 484)
        .glassEffect(.regular, in: .rect(cornerRadius: 24))
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
                .buttonStyle(.glassProminent)
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
            Text("频道").font(.headline)
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
                                Text("暂不支持").font(.caption).foregroundStyle(.secondary)
                            } else if model.sourceURL == channel.url {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            } else {
                                Image(systemName: "play.fill").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.glass)
                    .disabled(!channel.supported || !model.isReady)
                }
                }
                .padding(4)
            }
            .overlay {
                if model.channels.isEmpty {
                    Text(model.isReady ? "暂无频道" : "正在载入频道…").foregroundStyle(.secondary)
                } else if !search.isEmpty && !model.channels.contains(where: { $0.name.localizedCaseInsensitiveContains(search) }) {
                    Text("没有匹配的频道").foregroundStyle(.secondary)
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
                Text("设置").font(.title2.weight(.semibold))
                Spacer()
                Button("完成") { model.settingsOpen = false }
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .padding(20)
            Form {
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
                            .monospacedDigit().frame(width: 44, alignment: .trailing)
                    }
                    Text("透明度越高，字幕底色越淡。隐藏字幕时仍继续识别。")
                        .font(.caption).foregroundStyle(.secondary)
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
                            .buttonStyle(.glass).disabled(googleKey.isEmpty)
                    } else if model.provider == "volcano" {
                        SecureField("Access Key", text: $volcanoAK)
                        SecureField("Secret Key", text: $volcanoSK)
                        Button("保存密钥") {
                            model.saveVolcano(ak: volcanoAK, sk: volcanoSK)
                            volcanoAK = ""; volcanoSK = ""
                        }
                        .buttonStyle(.glass).disabled(volcanoAK.isEmpty || volcanoSK.isEmpty)
                    }
                }
                Section("字幕记录") {
                    if model.history.isEmpty {
                        Text("开始观看并开启字幕后，记录会显示在这里。")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(model.history.suffix(20), id: \.id) { entry in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(entry.time).font(.caption).foregroundStyle(.secondary)
                                Text(entry.zh)
                                Text(entry.en).foregroundStyle(.secondary)
                            }
                            .textSelection(.enabled)
                        }
                        HStack {
                            Button("导出全部记录", action: model.exportHistory).buttonStyle(.glass)
                            Button("清空记录", role: .destructive, action: model.clearHistory).buttonStyle(.glass)
                        }
                    }
                }
                Section("浏览器连接") {
                    Button("复制配对码", systemImage: "doc.on.doc", action: model.copyPairing)
                        .buttonStyle(.glass)
                }
            }
            .formStyle(.grouped)
            .onChange(of: model.appearance) { model.applySettings() }
            .onChange(of: model.captionMode) { model.applySettings() }
            .onChange(of: model.captionOpacity) { model.applySettings() }
            .onChange(of: model.provider) { model.applySettings() }
        }
        .frame(width: 640, height: 640)
    }
}
