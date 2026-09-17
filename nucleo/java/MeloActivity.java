package nodomain.freeyourgadget.gadgetbridge.melo;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import nodomain.freeyourgadget.gadgetbridge.BuildConfig;
import nodomain.freeyourgadget.gadgetbridge.GBApplication;
import nodomain.freeyourgadget.gadgetbridge.activities.welcome.WelcomeActivity;
import nodomain.freeyourgadget.gadgetbridge.impl.GBDevice;

/**
 * GT3 Melo — ecrã principal. A interface vem da web (Worker Cloudflare), por isso
 * atualiza sem reinstalar. Este núcleo só expõe a ponte "Nucleo" ao JavaScript.
 */
public class MeloActivity extends Activity {
    public static final String URL_BASE = "https://gt3-melo.pedromelomultibrico.workers.dev/";
    private static final int PEDIDO_FICHEIRO = 4711;

    private WebView web;
    private PonteNucleo ponte;
    private ValueCallback<Uri[]> callbackFicheiro;
    private boolean falhou = false;

    private final BroadcastReceiver recetor = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (GBDevice.ACTION_DEVICE_CHANGED.equals(intent.getAction())) {
                enviarEvento("dispositivo", ponte.dispositivos());
            }
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " GT3Melo/" + BuildConfig.VERSION_CODE);

        ponte = new PonteNucleo(this, web);
        web.addJavascriptInterface(ponte, "Nucleo");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u.toString().startsWith(URL_BASE)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    falhou = true;
                    view.loadUrl("file:///android_asset/melo_offline.html");
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (callbackFicheiro != null) callbackFicheiro.onReceiveValue(null);
                callbackFicheiro = cb;
                try {
                    startActivityForResult(params.createIntent(), PEDIDO_FICHEIRO);
                } catch (Exception e) {
                    callbackFicheiro = null;
                    return false;
                }
                return true;
            }
        });

        carregar();

        SharedPreferences prefs = GBApplication.getPrefs().getPreferences();
        if (prefs.getBoolean("first_run", true)) {
            startActivity(new Intent(this, WelcomeActivity.class));
        } else {
            try {
                GBApplication.deviceService().requestDeviceInfo();
            } catch (Exception ignored) { }
        }
    }

    void carregar() {
        falhou = false;
        web.loadUrl(URL_BASE + "?nucleo=" + BuildConfig.VERSION_CODE);
    }

    void enviarEvento(String tipo, String jsonDados) {
        if (web == null) return;
        final String js = "window.aoNucleo && window.aoNucleo(" + org.json.JSONObject.quote(tipo) + "," + jsonDados + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    @Override
    protected void onResume() {
        super.onResume();
        LocalBroadcastManager.getInstance(this).registerReceiver(recetor, new IntentFilter(GBDevice.ACTION_DEVICE_CHANGED));
        enviarEvento("retomar", ponte.dispositivos());
    }

    @Override
    protected void onPause() {
        LocalBroadcastManager.getInstance(this).unregisterReceiver(recetor);
        super.onPause();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PEDIDO_FICHEIRO && callbackFicheiro != null) {
            callbackFicheiro.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            callbackFicheiro = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        web.evaluateJavascript("window.voltar ? window.voltar() : false", valor -> {
            if (!"true".equals(valor)) MeloActivity.super.onBackPressed();
        });
    }
}
