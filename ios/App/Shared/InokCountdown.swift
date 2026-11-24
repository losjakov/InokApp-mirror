import Foundation
import SwiftUI
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/// cloud_46 (A-173 (C)): the reminder's LIVE ACTIVITY on the iPhone Lock Screen / Dynamic Island - the app starts it from the FOREGROUND only
/// (ios/App/App/InokCountdownPlugin.swift, no push, no server: A-7), when the start is ≤ 8 h away; the UI lives in the widget extension
/// (InokWidgetsBundle, `ActivityConfiguration`, iOS 16.1+ behind `#available` - the floor stays iOS 15.0). One file in the App AND the
/// widget extension: the attributes must be the very same type on both sides. The channel's picture IN COLOUR (the App Group copy the
/// widgets use), «НАГАДУВАННЯ · inok.info», the monastery, the service, a self-updating countdown + its bar in the app colours
/// (#0c6486, gold #f5c842); at the start (stale) «Трансляція почалася — відкрити»; a tap = «Трансляції» (the stream once it is live).
#if canImport(ActivityKit)
@available(iOS 16.1, *)
struct InokCountdownAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var start: Date
        var title: String
        var monastery: String
    }
    var id: String          // «channel|video» - the reminder's key
    var channelId: Int
    var videoId: String
    var label: String       // «НАГАДУВАННЯ · inok.info»
    var startsIn: String    // «Трансляція почнеться через»
    var started: String     // «Трансляція почалася — відкрити»
}

@available(iOS 16.1, *)
enum CountdownStyle {
    static let brand = Color(red: 0x0c / 255.0, green: 0x64 / 255.0, blue: 0x86 / 255.0)
    static let gold = Color(red: 0xf5 / 255.0, green: 0xc8 / 255.0, blue: 0x42 / 255.0)
    static func logo(_ channel: Int, size: CGFloat) -> some View {
        Group {
            if let p = InokShared.avatarPath(channel), let img = UIImage(contentsOfFile: p) {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Image(systemName: "dot.radiowaves.left.and.right").resizable().scaledToFit().padding(size * 0.2).foregroundColor(.white)
            }
        }
        .frame(width: size, height: size).clipShape(Circle()).accessibilityHidden(true)
    }
    static func url(_ a: InokCountdownAttributes, started: Bool) -> URL {
        URL(string: started ? "inokapp://tab/streams?play=\(a.videoId)" : "inokapp://tab/streams")!
    }
}

/// the Lock Screen / banner view (also the snapshot of the ring)
@available(iOS 16.1, *)
struct InokCountdownLockView: View {
    let attributes: InokCountdownAttributes
    let state: InokCountdownAttributes.ContentState
    let stale: Bool
    var body: some View {
        let started = stale || Date() >= state.start
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                CountdownStyle.logo(attributes.channelId, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(attributes.label).font(.caption2.weight(.semibold)).foregroundColor(CountdownStyle.gold)
                    Text(state.monastery).font(.headline).foregroundColor(.white).lineLimit(1)
                    Text(state.title).font(.subheadline).foregroundColor(.white.opacity(0.85)).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            if started {
                Text(attributes.started).font(.headline).foregroundColor(CountdownStyle.gold)
            } else {
                HStack(alignment: .firstTextBaseline) {
                    Text(attributes.startsIn).font(.footnote).foregroundColor(.white.opacity(0.85))
                    Spacer(minLength: 4)
                    Text(timerInterval: Date()...max(Date(), state.start), countsDown: true)
                        .font(.title.weight(.bold).monospacedDigit()).foregroundColor(.white).multilineTextAlignment(.trailing)
                }
                ProgressView(timerInterval: Date()...max(Date().addingTimeInterval(1), state.start), countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                    .tint(CountdownStyle.gold)
            }
        }
        .padding(14)
        .accessibilityElement(children: .combine)
    }
}

@available(iOS 16.1, *)
struct InokCountdownLive: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: InokCountdownAttributes.self) { ctx in
            InokCountdownLockView(attributes: ctx.attributes, state: ctx.state, stale: CountdownStale.of(ctx))
                .activityBackgroundTint(CountdownStyle.brand)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(CountdownStyle.url(ctx.attributes, started: CountdownStale.of(ctx) || Date() >= ctx.state.start))
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { CountdownStyle.logo(ctx.attributes.channelId, size: 40) }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...max(Date(), ctx.state.start), countsDown: true).font(.title3.weight(.bold).monospacedDigit())
                        .foregroundColor(CountdownStyle.gold).frame(maxWidth: 90)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ctx.attributes.label).font(.caption2.weight(.semibold)).foregroundColor(CountdownStyle.gold)
                        Text(ctx.state.monastery).font(.subheadline.weight(.semibold)).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) { Text(ctx.state.title).font(.footnote).lineLimit(1) }
            } compactLeading: {
                CountdownStyle.logo(ctx.attributes.channelId, size: 22)
            } compactTrailing: {
                Text(timerInterval: Date()...max(Date(), ctx.state.start), countsDown: true).monospacedDigit().foregroundColor(CountdownStyle.gold).frame(maxWidth: 56)
            } minimal: {
                CountdownStyle.logo(ctx.attributes.channelId, size: 22)
            }
            .widgetURL(CountdownStyle.url(ctx.attributes, started: Date() >= ctx.state.start))
        }
    }
}

/// `isStale` is iOS 16.2+; on 16.1 the start time decides
@available(iOS 16.1, *)
enum CountdownStale {
    static func of(_ ctx: ActivityViewContext<InokCountdownAttributes>) -> Bool {
        if #available(iOS 16.2, *) { return ctx.isStale }
        return Date() >= ctx.state.start
    }
}
#endif
