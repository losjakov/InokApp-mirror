package info.inok.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A-84 (g): the summary's «Позначити прочитаним» removes the group; one article swiped away -> the summary's count follows; A-174: a countdown swiped away. Not exported. */
public class NotifyReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null) return;
        Notifier n = InokNotifications.of(ctx);
        long now = System.currentTimeMillis();
        if (InokNotifications.ACTION_MARK_READ.equals(intent.getAction())) n.consumeArticles(null, now);
        else if (InokNotifications.ACTION_DISMISSED.equals(intent.getAction())) n.childDismissed(intent.getIntExtra(InokNotifications.EXTRA_NID, 0), now);
        // cloud_46 (A-174): a countdown swiped away (Android 14+ allows it) stays away; the reminder itself is untouched
        else if (CountdownPlugin.ACTION_GONE.equals(intent.getAction())) CountdownPlugin.markGone(ctx, String.valueOf(intent.getStringExtra(CountdownPlugin.EXTRA_ID)));
    }
}
