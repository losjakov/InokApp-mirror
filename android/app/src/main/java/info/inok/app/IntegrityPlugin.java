package info.inok.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest;

/**
 * A-66 (contract §3, R-8 / R-27 / R-32 / R-38): a Play Integrity STANDARD token for one write of the app. The token provider is
 * prepared ONCE per process with the Cloud project number (`info-inok-app`, passed from src/native/integrity.ts - the one source)
 * and prepared again when Google says it went stale; every token is bound to the write's own `requestHash`. Any failure (no Play,
 * an emulator without Play Store, Google busy) is rejected - the JS side then sends the write without a token (the server's switch
 * decides). The token is never logged.
 */
@CapacitorPlugin(name = "PlayIntegrity")
public class IntegrityPlugin extends Plugin {
    private static final String TAG = "InokIntegrity";
    private StandardIntegrityTokenProvider provider;
    private long preparedFor = -1;

    @PluginMethod
    public void token(PluginCall call) {
        String hash = call.getString("requestHash");
        String project = call.getString("cloudProjectNumber");
        if (hash == null || hash.isEmpty() || project == null) { call.reject("requestHash and cloudProjectNumber required"); return; }
        long number;
        try { number = Long.parseLong(project); } catch (NumberFormatException e) { call.reject("bad cloudProjectNumber"); return; }
        if (provider != null && preparedFor == number) { request(call, hash, true); return; }
        prepare(call, hash, number);
    }

    private void prepare(PluginCall call, String hash, long number) {
        StandardIntegrityManager m = IntegrityManagerFactory.createStandard(getContext());
        m.prepareIntegrityToken(PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(number).build())
            .addOnSuccessListener(p -> { provider = p; preparedFor = number; Log.i(TAG, "provider prepared"); request(call, hash, false); })
            .addOnFailureListener(e -> { Log.i(TAG, "prepare failed: " + e.getClass().getSimpleName()); call.reject(String.valueOf(e.getMessage())); });
    }

    private void request(PluginCall call, String hash, boolean mayRetry) {
        provider.request(StandardIntegrityTokenRequest.builder().setRequestHash(hash).build())
            .addOnSuccessListener(r -> { JSObject o = new JSObject(); o.put("token", r.token()); Log.i(TAG, "token ok"); call.resolve(o); })
            .addOnFailureListener(e -> {
                Log.i(TAG, "request failed: " + e.getClass().getSimpleName());
                // a provider can go stale (INTEGRITY_TOKEN_PROVIDER_INVALID): prepare once more, then give up
                if (mayRetry) { provider = null; prepare(call, hash, preparedFor); } else call.reject(String.valueOf(e.getMessage()));
            });
    }
}
