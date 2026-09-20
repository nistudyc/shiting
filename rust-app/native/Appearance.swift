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

private struct AppSecondaryText: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    func body(content: Content) -> some View {
        content.foregroundStyle(colorScheme == .dark ? Color(white: 0.78) : Color(white: 0.25))
    }
}

private struct AppGlassSurface<S: Shape>: ViewModifier {
    @Environment(\.glassTransparency) private var transparency
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorScheme) private var colorScheme
    let shape: S
    var prominent = false

    func body(content: Content) -> some View {
        let dark = colorScheme == .dark
        let minimumOpacity = dark ? 0.65 : 0.85
        let opacity = reduceTransparency ? 1 : 1 - (transparency / 100) * (1 - minimumOpacity)
        content
            .background(shape.fill((dark ? Color.black : Color.white).opacity(opacity)))
            .glassEffect(.clear.tint(prominent ? Color.accentColor.opacity(0.22) : .clear), in: shape)
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
            .modifier(AppGlassSurface(shape: Capsule(), prominent: prominent))
            .overlay { Capsule().fill(.primary.opacity(configuration.isPressed ? 0.1 : 0)).allowsHitTesting(false) }
            .foregroundStyle(isEnabled ? AnyShapeStyle(configuration.role == .destructive ? Color.red : Color.primary) : AnyShapeStyle(Color.primary.opacity(0.65)))
            .contentShape(Capsule())
    }
}

extension View {
    func appSecondary() -> some View { modifier(AppSecondaryText()) }
    func appFont(_ size: CGFloat = 13, weight: Font.Weight = .regular) -> some View {
        modifier(AppFont(size: size, weight: weight))
    }
    func appAppearance(_ model: PlayerModel) -> some View {
        self.appFont()
            .environment(\.appFontScale, model.fontScale)
            .environment(\.glassTransparency, model.glassTransparency)
    }
    func appGlass<S: Shape>(in shape: S) -> some View {
        modifier(AppGlassSurface(shape: shape))
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
                HStack { Text("更不透明"); Spacer(); Text("更透明") }.appFont(11).appSecondary()
                if reduceTransparency {
                    Text("系统已开启“减少透明度”，优先使用不透明背景。").appFont(11).appSecondary()
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
                Text("The view follows your preferences.").appFont(11).appSecondary()
                Button("恢复默认外观") { model.glassTransparency = 50; model.fontScale = 1 }
                    .buttonStyle(AppGlassButtonStyle())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .appGlass(in: RoundedRectangle(cornerRadius: 16))
            Text("透明度只改变玻璃背景，并保留可读性衬底。文字随深浅外观调整；系统菜单与对话框遵循 macOS 字号。").appFont(11).appSecondary()
        }
    }
}
