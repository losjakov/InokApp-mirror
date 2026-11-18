package info.inok.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * cloud_41 (A-133 C2): THE store's own rating window - Google Play In-App Review (`com.google.android.play:review`). Never our window,
 * never from a button: src/state/reviewAsk.ts decides WHEN (one pure function), this only asks Google. Google alone decides whether the
 * window shows (its quota) and says nothing about it - the answer is «asked» / «unavailable», never «shown» / «rated».
 */
@CapacitorPlugin(name = "InAppReview")
public class InAppReviewPlugin extends Plugin {
    @PluginMethod
    public void request(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(task -> {
            JSObject r = new JSObject();
            if (!task.isSuccessful() || getActivity() == null) { r.put("state", "unavailable"); call.resolve(r); return; }
            ReviewInfo info = task.getResult();
            manager.launchReviewFlow(getActivity(), info).addOnCompleteListener(done -> { r.put("state", "asked"); call.resolve(r); });
        });
    }
}
