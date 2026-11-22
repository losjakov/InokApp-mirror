package info.inok.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A-84: the Android side of {@link Notifier} - NotificationManager as its {@link Notifier.Tray}, the APP-language resources as its
 * {@link Notifier.Words}. Every rule lives in Notifier (unit-tested); nothing here decides anything.
 */
final class InokNotifications {
    static final String ACTION_MARK_READ = "info.inok.app.MARK_READ";
    static final String ACTION_DISMISSED = "info.inok.app.DISMISSED";
    static final String EXTRA_NID = "nid";

    private InokNotifications() { }

    static Notifier of(Context ctx) {
        Context app = ctx.getApplicationContext();
        Context words = inLanguage(app, InokMessagingService.appLang(app));
        return new Notifier(new AndroidTray(app, words), new ResWords(words));
    }

    /** The app's language may differ from the phone's: the notification's words come from a context in the app's language. */
    static Context inLanguage(Context ctx, String lang) {
        Configuration c = new Configuration(ctx.getResources().getConfiguration());
        c.setLocale(new Locale(lang));
        return ctx.createConfigurationContext(c);
    }

    static final class ResWords implements Notifier.Words {
        private final Context c;
        private final String lang;
        ResWords(Context c) { this.c = c; this.lang = c.getResources().getConfiguration().getLocales().get(0).getLanguage(); }
        public String articleTitle() { return c.getString(R.string.push_title_article); }
        public String liveTitle() { return c.getString(R.string.push_title_stream); }
        public String summaryTitle(int n) { return c.getResources().getQuantityString(R.plurals.push_summary_articles, n, n); }
        public String more(int n) { return c.getString(R.string.push_summary_more, n); }
        public String channelArticles() { return c.getString(R.string.push_channel_articles); }
        public String channelLive() { return c.getString(R.string.push_channel_live); }
        public String text(String json) { return InokMessagingService.pickTitle(json, lang); }
        public String lang() { return lang; }
    }

    static final class AndroidTray implements Notifier.Tray {
        private final Context ctx;
        private final Context words; // the app's language: the «Позначити прочитаним» label
        private final NotificationManager nm;
        AndroidTray(Context ctx, Context words) {
            this.ctx = ctx; this.words = words; this.nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        }

        @Override public List<Notifier.Shown> active() {
            List<Notifier.Shown> out = new ArrayList<>();
            if (nm == null) return out;
            for (StatusBarNotification s : nm.getActiveNotifications()) {
                CharSequence t = s.getNotification().extras.getCharSequence(NotificationCompat.EXTRA_TEXT);
                out.add(new Notifier.Shown(s.getTag(), s.getId(), t == null ? "" : t.toString(), s.getNotification().when));
            }
            return out;
        }

        @Override public void post(Notifier.Note n) {
            if (nm == null) return;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, n.channel)
                .setSmallIcon(R.drawable.ic_stat_push)
                .setContentTitle(n.title)
                .setContentText(n.text)
                .setWhen(n.when)
                .setShowWhen(true)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(tap(n));
            if (n.summary) {
                NotificationCompat.InboxStyle inbox = new NotificationCompat.InboxStyle().setBigContentTitle(n.title);
                for (String l : n.lines) inbox.addLine(l);
                if (n.subText != null) inbox.setSummaryText(n.subText);
                b.setStyle(inbox).setGroup(n.group).setGroupSummary(true).setOnlyAlertOnce(n.onlyAlertOnce)
                    .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
                    .addAction(0, words.getString(R.string.push_mark_read), broadcast(ACTION_MARK_READ, 0));
            } else {
                b.setStyle(new NotificationCompat.BigTextStyle().bigText(n.text));
                if (n.group != null) b.setGroup(n.group);
                if (n.childOfGroup) b.setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY);
                if (n.reportDismiss) b.setDeleteIntent(broadcast(ACTION_DISMISSED, n.id));
            }
            if (n.timeoutMs > 0) b.setTimeoutAfter(n.timeoutMs);
            nm.notify(n.tag, n.id, b.build());
        }

        /** (h) the tap launches MainActivity with the data as extras - what the Capacitor plugin reads into pushNotificationActionPerformed. */
        private PendingIntent tap(Notifier.Note n) {
            Intent i = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            Bundle extras = new Bundle();
            for (Map.Entry<String, String> e : n.tap.entrySet()) extras.putString(e.getKey(), e.getValue());
            i.putExtras(extras);
            int code = (n.tag + "#" + n.id).hashCode();
            return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        private PendingIntent broadcast(String action, int nid) {
            Intent i = new Intent(ctx, NotifyReceiver.class).setAction(action).putExtra(EXTRA_NID, nid);
            return PendingIntent.getBroadcast(ctx, (action + nid).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        @Override public void cancel(String tag, int id) { if (nm != null) nm.cancel(tag, id); }

        @Override public Integer importance(String channel) {
            NotificationChannel c = nm == null ? null : nm.getNotificationChannel(channel);
            return c == null ? null : c.getImportance();
        }

        @Override public void createChannel(String id, String name, int importance) {
            if (nm != null) nm.createNotificationChannel(new NotificationChannel(id, name, importance));
        }

        @Override public void deleteChannel(String id) { if (nm != null) nm.deleteNotificationChannel(id); }
    }
}
