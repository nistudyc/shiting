import AppKit
import SwiftUI

private struct AppFontScaleKey: EnvironmentKey { static let defaultValue = 1.0 }
private struct GlassTransparencyKey: EnvironmentKey { static let defaultValue = 50.0 }
extension EnvironmentValues {
    var appFontScale: Double {
        get { self[AppFontScaleKey.self] }
        set { self[AppFontScaleKey.self] = newValue }
    }
    var glassTransparency: Double {
        get { self[GlassTransparencyKey.self] }
        set { self[GlassTransparencyKey.self] = newValue }
    }
}

private struct AppFont: ViewModifier {
    @Environment(\.appFontScale) private var scale
    let size: CGFloat
    let weight: Font.Weight
    func body(content: Content) -> some View {
        content.font(.system(size: size * scale, weight: weight))
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
    @Environment(\.appFontScale) private var scale
    @Environment(\.isEnabled) private var isEnabled
    var prominent = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .appFont(13, weight: prominent ? .semibold : .regular)
            .padding(.horizontal, 12)
            .padding(.vertical, 7 * scale)
            .frame(minHeight: 32 * scale)
            .background { AppGlassSurface(shape: Capsule(), prominent: prominent) }
            .overlay { Capsule().fill(.primary.opacity(configuration.isPressed ? 0.1 : 0)).allowsHitTesting(false) }
            .foregroundStyle(isEnabled ? AnyShapeStyle(configuration.role == .destructive ? Color.red : Color.primary) : AnyShapeStyle(.secondary))
            .contentShape(Capsule())
    }
}

extension View {
    func appFont(_ size: CGFloat = 13, weight: Font.Weight = .regular) -> some View {
        modifier(AppFont(size: size, weight: weight))
    }
    func appAppearance(_ model: PlayerModel) -> some View {
        self.appFont()
            .environment(\.appFontScale, model.fontScale)
            .environment(\.glassTransparency, model.glassTransparency)
    }
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
                HStack { Text("更不透明"); Spacer(); Text("更透明") }.appFont(11).foregroundStyle(.secondary)
                if reduceTransparency {
                    Text("系统已开启“减少透明度”，优先使用不透明背景。").appFont(11).foregroundStyle(.secondary)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("整个 App 字体大小")
                    Spacer()
                    Text("\(Int((model.fontScale * 100).rounded()))%").monospacedDigit()
                }
                Slider(value: $model.fontScale, in: 0.85...1.4, step: 0.05)
                    .accessibilityLabel("整个 App 字体大小")
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("实时预览").appFont(13, weight: .semibold)
                Text("原声继续播放，字幕清晰可读。")
                Text("The view follows your preferences.").appFont(11).foregroundStyle(.secondary)
                Button("恢复默认外观") { model.glassTransparency = 50; model.fontScale = 1 }
                    .buttonStyle(AppGlassButtonStyle())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .appGlass(in: RoundedRectangle(cornerRadius: 16))
            Text("透明度只改变玻璃背景，文字保持清晰。系统菜单与对话框遵循 macOS 字号。").appFont(11).foregroundStyle(.secondary)
        }
    }
}
