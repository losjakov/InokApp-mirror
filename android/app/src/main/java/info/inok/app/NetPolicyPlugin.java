package info.inok.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A-20: what the photo rule needs and @capacitor/network does not say — is the active network METERED (mobile data, a phone's
 * hotspot over Wi-Fi, roaming) and is the system Data Saver restricting this app. JS side: src/native/network.ts.
 */
@CapacitorPlugin(name = "NetPolicy")
public class NetPolicyPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        JSObject r = new JSObject();
        if (cm == null) { call.reject("no ConnectivityManager"); return; }
        Network n = cm.getActiveNetwork();
        NetworkCapabilities caps = n == null ? null : cm.getNetworkCapabilities(n);
        boolean connected = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        boolean roaming = caps != null && Build.VERSION.SDK_INT >= 28 && !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_ROAMING);
        r.put("connected", connected);
        r.put("metered", cm.isActiveNetworkMetered() || roaming);
        // RESTRICT_BACKGROUND_STATUS_ENABLED = Data Saver on and this app not on its whitelist
        r.put("dataSaver", cm.getRestrictBackgroundStatus() == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED);
        call.resolve(r);
    }
}
