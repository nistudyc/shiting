import AppKit
import SwiftUI

private struct GlassTransparencyKey: EnvironmentKey { static let defaultValue = 50.0 }
extension EnvironmentValues {
    var glassTransparency: Double {
        get { self[GlassTransparencyKey.self] }
        set { self[GlassTransparencyKey.self] = newValue }
    }
}

struct AppGlassSurface<S: Shape>: View {
    @Environment(\.glassTransparency) private var transparency
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let shape: S
    var prominent = false
    var body: some View {
        shape.fill(Color(nsColor: .windowBackgroundColor).opacity(reduceTransparency ? 1 : 1 - transparency / 100))
            .glassEffect(.clear.tint(prominent ? Color.accentColor.opacity(0.22) : .clear), in: shape)
            .allowsHitTesting(false)
    }
}

struct AppGlassButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    var prominent = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: prominent ? .semibold : .regular))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .frame(minHeight: 32)
            .background { AppGlassSurface(shape: Capsule(), prominent: prominent) }
            .overlay { Capsule().fill(.primary.opacity(configuration.isPressed ? 0.1 : 0)).allowsHitTesting(false) }
            .foregroundStyle(isEnabled ? AnyShapeStyle(configuration.role == .destructive ? Color.red : Color.primary) : AnyShapeStyle(.secondary))
            .contentShape(Capsule())
    }
}

extension View {
    func appGlass<S: Shape>(in shape: S) -> some View {
        background { AppGlassSurface(shape: shape) }
    }

}

struct AppearanceSettingsView: View {
    @ObservedObject var model: PlayerModel
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var body: some View {
        Section("界面外观") {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("液态玻璃透明度")
                    Spacer()
                    Text("\(Int(model.glassTransparency))% ").monospacedDigit()
                }
                Slider(value: $model.glassTransparency, in: 0...100, step: 1)
                    .accessibilityLabel("液态玻璃透明度")
                    .disabled(reduceTransparency)
                HStack { Text("更不透明"); Spacer(); Text("更透明") }.font(.caption).foregroundStyle(.secondary)
                if reduceTransparency {
                    Text("系统已开启“减少透明度”，优先使用不透明背景。").font(.caption).foregroundStyle(.secondary)
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("实时预览").font(.headline)
                Text("原声继续播放，字幕清晰可读。")
                Text("The view follows your preferences.").font(.caption).foregroundStyle(.secondary)
                Button("恢复默认外观") { model.glassTransparency = 50 }
                    .buttonStyle(AppGlassButtonStyle())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .appGlass(in: RoundedRectangle(cornerRadius: 16))
            Text("透明度只改变玻璃背景，文字保持清晰。").font(.caption).foregroundStyle(.secondary)
        }
    }
}
