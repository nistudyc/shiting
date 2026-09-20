import SwiftUI

struct CaptionHistorySidebar: View {
    @ObservedObject var model: PlayerModel
    @State private var displayed: [CaptionEntry] = []
    @State private var following = true
    @State private var atBottom = true
    @State private var scrollPosition = ScrollPosition(edge: .bottom)
    @State private var firstVisibleID: String?
    @State private var readingAnchor: String?
    @State private var userScrolling = false
    @State private var hasUpdates = false
    @State private var historyTrimmed = false

    private var chronological: [CaptionEntry] { Array(model.history.reversed()) }

    private func showLatest() {
        following = true
        displayed = chronological
        hasUpdates = false
        historyTrimmed = false
        readingAnchor = nil
        scrollPosition.scrollTo(edge: .bottom)
    }

    private func refreshHistory() {
        guard !following && !model.history.isEmpty else { showLatest(); return }
        let incoming = chronological
        let anchor = firstVisibleID ?? displayed.first?.id
        let survivingAnchor = incoming.first(where: { $0.id == anchor })?.id
        historyTrimmed = historyTrimmed || (anchor != nil && survivingAnchor == nil)
        readingAnchor = survivingAnchor ?? incoming.first?.id
        hasUpdates = hasUpdates || incoming != displayed
        displayed = incoming
        if !userScrolling { restoreReadingPosition() }
    }

    private func restoreReadingPosition() {
        guard let anchor = readingAnchor else { return }
        Task { @MainActor in
            await Task.yield()
            guard !following, !userScrolling, readingAnchor == anchor else { return }
            scrollPosition.scrollTo(id: anchor, anchor: .top)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("字幕回看").font(.headline)
                Spacer()
                Button(action: model.exportHistory) {
                    Image(systemName: "square.and.arrow.up")
                }
                .help("导出全部字幕记录")
                .accessibilityLabel("导出全部字幕记录")
                .disabled(model.history.isEmpty)
                Button { model.historyOpen = false } label: {
                    Image(systemName: "xmark")
                }
                .help("关闭侧栏，继续识别字幕")
                .accessibilityLabel("关闭字幕回看侧栏")
            }
            .buttonStyle(AppGlassButtonStyle())
            if displayed.isEmpty {
                ContentUnavailableView("暂无字幕记录", systemImage: "captions.bubble", description: Text("开启字幕后，已播放的原文与译文会显示在这里。"))
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(displayed) { entry in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(spacing: 8) {
                                    Text(entry.time).monospacedDigit()
                                    if let source = entry.sourceName, !source.isEmpty {
                                        Text(source).lineLimit(1)
                                    }
                                }
                                .font(.system(size: 11)).foregroundStyle(.secondary)
                                if !entry.zh.isEmpty { Text(entry.zh) }
                                if !entry.en.isEmpty { Text(entry.en).foregroundStyle(.secondary) }
                            }
                            .font(.system(size: 13))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                            .id(entry.id)
                        }
                    }
                    .padding(.vertical, 4)
                    .scrollTargetLayout()
                }
                .scrollPosition($scrollPosition)
                .onScrollTargetVisibilityChange(idType: String.self, threshold: 0.01) { visibleIDs in
                    firstVisibleID = displayed.first(where: { visibleIDs.contains($0.id) })?.id
                }
                .onScrollGeometryChange(for: Bool.self) { geometry in
                    geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - 24
                } action: { _, value in atBottom = value }
                .onScrollPhaseChange { _, phase in
                    if phase == .interacting || phase == .tracking {
                        following = false
                        userScrolling = true
                        readingAnchor = nil
                    }
                    if phase == .idle && userScrolling {
                        userScrolling = false
                        if atBottom { showLatest() }
                        else { restoreReadingPosition() }
                    }
                }
            }
            if !following {
                Button(action: showLatest) {
                    Label(hasUpdates ? "有字幕更新 · 回到最新" : "回到最新", systemImage: "arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(AppGlassButtonStyle(prominent: true))
            }
            if historyTrimmed {
                Text("较早记录已清理，已保留当前可用的最早位置。")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Text("保留最近 120 条字幕记录")
                .font(.system(size: 11)).foregroundStyle(.secondary)
        }
        .padding(16)
        .appGlass(in: RoundedRectangle(cornerRadius: 16))
        .onAppear { showLatest() }
        .onChange(of: model.history) { refreshHistory() }
        .onChange(of: model.historyOpen) { _, open in
            if open && following { showLatest() }
        }
    }
}
