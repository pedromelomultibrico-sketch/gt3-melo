package nodomain.freeyourgadget.gadgetbridge.melo;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.List;

import nodomain.freeyourgadget.gadgetbridge.BuildConfig;
import nodomain.freeyourgadget.gadgetbridge.GBApplication;
import nodomain.freeyourgadget.gadgetbridge.activities.ConfigureAlarms;
import nodomain.freeyourgadget.gadgetbridge.activities.ControlCenterv2;
import nodomain.freeyourgadget.gadgetbridge.activities.NotificationManagementActivity;
import nodomain.freeyourgadget.gadgetbridge.activities.SettingsActivity;
import nodomain.freeyourgadget.gadgetbridge.activities.appmanager.AppManagerActivity;
import nodomain.freeyourgadget.gadgetbridge.activities.charts.ActivityChartsActivity;
import nodomain.freeyourgadget.gadgetbridge.activities.devicesettings.DeviceSettingsActivity;
import nodomain.freeyourgadget.gadgetbridge.activities.discovery.DiscoveryActivityV2;
import nodomain.freeyourgadget.gadgetbridge.database.DBHandler;
import nodomain.freeyourgadget.gadgetbridge.devices.DeviceCoordinator;
import nodomain.freeyourgadget.gadgetbridge.devices.SampleProvider;
import nodomain.freeyourgadget.gadgetbridge.impl.GBDevice;
import nodomain.freeyourgadget.gadgetbridge.model.ActivityKind;
import nodomain.freeyourgadget.gadgetbridge.model.ActivitySample;
import nodomain.freeyourgadget.gadgetbridge.model.NotificationSpec;
import nodomain.freeyourgadget.gadgetbridge.model.NotificationType;
import nodomain.freeyourgadget.gadgetbridge.model.RecordedDataTypes;

/**
 * Ponte entre a interface web (JavaScript: window.Nucleo) e o Gadgetbridge.
 * Tudo o que a interface pode pedir ao relógio passa por aqui.
 */
public class PonteNucleo {
    private final MeloActivity act;
    private final WebView web;

    PonteNucleo(MeloActivity act, WebView web) {
        this.act = act;
        this.web = web;
    }

    private GBDevice relogio() {
        List<GBDevice> l = GBApplication.app().getDeviceManager().getDevices();
        for (GBDevice d : l) if (d.isInitialized()) return d;
        for (GBDevice d : l) if (d.isConnected()) return d;
        return l.isEmpty() ? null : l.get(0);
    }

    private void naUi(Runnable r) {
        act.runOnUiThread(r);
    }

    private String erro(Exception e) {
        try {
            return new JSONObject().put("ok", false).put("erro", String.valueOf(e)).toString();
        } catch (Exception x) {
            return "{\"ok\":false}";
        }
    }

    private static final String OK = "{\"ok\":true}";
    private static final String SEM = "{\"ok\":false,\"erro\":\"sem relógio\"}";

    // ---------- informação ----------

    @JavascriptInterface
    public int versao() {
        return BuildConfig.VERSION_CODE;
    }

    @JavascriptInterface
    public String versaoNome() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public String dispositivos() {
        try {
            JSONArray arr = new JSONArray();
            for (GBDevice d : GBApplication.app().getDeviceManager().getDevices()) {
                JSONObject o = new JSONObject();
                o.put("nome", d.getAliasOrName());
                o.put("endereco", d.getAddress());
                o.put("modelo", d.getModel());
                o.put("firmware", d.getFirmwareVersion());
                o.put("estado", d.getState().name());
                o.put("estadoTexto", d.getStateString(act));
                o.put("ligado", d.isConnected());
                o.put("pronto", d.isInitialized());
                o.put("bateria", d.getBatteryLevel(0));
                arr.put(o);
            }
            return new JSONObject().put("ok", true).put("dispositivos", arr).toString();
        } catch (Exception e) {
            return erro(e);
        }
    }

    /** Resumo e série (blocos de 15 min) entre dois instantes, em segundos Unix. */
    @JavascriptInterface
    public String dados(int desde, int ate) {
        GBDevice d = relogio();
        if (d == null) return SEM;
        try (DBHandler db = GBApplication.acquireDB()) {
            DeviceCoordinator c = d.getDeviceCoordinator();
            SampleProvider<? extends ActivitySample> sp = c.getSampleProvider(d, db.getDaoSession());
            List<? extends ActivitySample> amostras = sp.getAllActivitySamples(desde, ate);
            int passos = 0, sono = 0, fcUlt = -1, fcMin = 999, fcMax = -1;
            long fcSoma = 0;
            int fcN = 0;
            JSONArray serie = new JSONArray();
            int bloco = 900, blocoIni = -1, blocoPassos = 0, blocoFc = -1;
            for (ActivitySample s : amostras) {
                int st = s.getSteps();
                if (st > 0) passos += st;
                int hr = s.getHeartRate();
                if (hr > 0 && hr < 255) {
                    fcUlt = hr;
                    fcMin = Math.min(fcMin, hr);
                    fcMax = Math.max(fcMax, hr);
                    fcSoma += hr;
                    fcN++;
                }
                ActivityKind k = s.getKind();
                if (k == ActivityKind.LIGHT_SLEEP || k == ActivityKind.DEEP_SLEEP || k == ActivityKind.REM_SLEEP) sono++;
                int t = s.getTimestamp() - (s.getTimestamp() % bloco);
                if (t != blocoIni) {
                    if (blocoIni >= 0) serie.put(new JSONArray().put(blocoIni).put(blocoPassos).put(blocoFc));
                    blocoIni = t;
                    blocoPassos = 0;
                    blocoFc = -1;
                }
                if (st > 0) blocoPassos += st;
                if (hr > 0 && hr < 255) blocoFc = hr;
            }
            if (blocoIni >= 0) serie.put(new JSONArray().put(blocoIni).put(blocoPassos).put(blocoFc));
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("passos", passos);
            o.put("minutosSono", sono);
            o.put("fcAtual", fcUlt);
            o.put("fcMin", fcN > 0 ? fcMin : -1);
            o.put("fcMax", fcMax);
            o.put("fcMedia", fcN > 0 ? (int) (fcSoma / fcN) : -1);
            o.put("amostras", amostras.size());
            o.put("serie", serie);
            return o.toString();
        } catch (Exception e) {
            return erro(e);
        }
    }

    // ---------- ações no relógio ----------

    @JavascriptInterface
    public String ligar() {
        try {
            GBDevice d = relogio();
            if (d == null) return "{\"ok\":false,\"erro\":\"sem relógio emparelhado\"}";
            GBApplication.deviceService(d).connect();
            return OK;
        } catch (Exception e) {
            return erro(e);
        }
    }

    @JavascriptInterface
    public String sincronizar() {
        try {
            GBDevice d = relogio();
            if (d == null) return SEM;
            GBApplication.deviceService(d).onFetchRecordedData(RecordedDataTypes.TYPE_SYNC);
            return OK;
        } catch (Exception e) {
            return erro(e);
        }
    }

    @JavascriptInterface
    public String encontrar(boolean ligarVibracao) {
        try {
            GBDevice d = relogio();
            if (d == null) return SEM;
            GBApplication.deviceService(d).onFindDevice(ligarVibracao);
            return OK;
        } catch (Exception e) {
            return erro(e);
        }
    }

    @JavascriptInterface
    public String acertarHora() {
        try {
            GBDevice d = relogio();
            if (d == null) return SEM;
            GBApplication.deviceService(d).onSetTime();
            return OK;
        } catch (Exception e) {
            return erro(e);
        }
    }

    @JavascriptInterface
    public String notificar(String titulo, String texto) {
        try {
            GBDevice d = relogio();
            if (d == null) return SEM;
            NotificationSpec n = new NotificationSpec();
            n.setTitle(titulo);
            n.setBody(texto);
            n.setSourceName("GT3 Melo");
            n.setType(NotificationType.UNKNOWN);
            GBApplication.deviceService(d).onNotification(n);
            return OK;
        } catch (Exception e) {
            return erro(e);
        }
    }

    /** Recebe um ficheiro (base64) — máscara .hwt, app, música, rota GPX — e envia-o para o relógio. */
    @JavascriptInterface
    public String instalar(String nome, String base64) {
        try {
            GBDevice d = relogio();
            if (d == null || !d.isInitialized()) return "{\"ok\":false,\"erro\":\"relógio não está ligado\"}";
            File dir = new File(act.getCacheDir(), "raw");
            dir.mkdirs();
            File f = new File(dir, nome.replaceAll("[^\\w.\\-]", "_"));
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            }
            GBApplication.deviceService(d).onInstallApp(Uri.fromFile(f), new Bundle());
            return OK;
        } catch (Exception e) {
            return erro(e);
        }
    }

    /** Guarda um ficheiro na pasta Transferências do telemóvel (ou na pasta da app). */
    @JavascriptInterface
    public String guardar(String nome, String base64) {
        String limpo = nome.replaceAll("[^\\w.\\-]", "_");
        File[] pastas = new File[]{
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                act.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        };
        Exception ultimo = null;
        for (File dir : pastas) {
            try {
                if (dir == null) continue;
                dir.mkdirs();
                File f = new File(dir, limpo);
                try (FileOutputStream out = new FileOutputStream(f)) {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                return new JSONObject().put("ok", true).put("caminho", f.getAbsolutePath()).toString();
            } catch (Exception e) {
                ultimo = e;
            }
        }
        return erro(ultimo == null ? new Exception("sem pasta") : ultimo);
    }

    @JavascriptInterface
    public void aviso(String texto) {
        naUi(() -> Toast.makeText(act, texto, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void recarregar() {
        naUi(act::carregar);
    }

    /** Abre um ecrã nativo do Gadgetbridge. */
    @JavascriptInterface
    public String abrir(String ecra) {
        final GBDevice d = relogio();
        naUi(() -> {
            try {
                Intent i;
                switch (ecra) {
                    case "emparelhar": i = new Intent(act, DiscoveryActivityV2.class); break;
                    case "avancado": i = new Intent(act, ControlCenterv2.class); break;
                    case "notificacoes": i = new Intent(act, NotificationManagementActivity.class); break;
                    case "definicoes_app": i = new Intent(act, SettingsActivity.class); break;
                    case "alarmes": i = new Intent(act, ConfigureAlarms.class); break;
                    case "graficos": i = new Intent(act, ActivityChartsActivity.class); break;
                    case "mostradores": i = new Intent(act, AppManagerActivity.class); break;
                    case "definicoes_relogio": i = new Intent(act, DeviceSettingsActivity.class); break;
                    case "bateria": i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS); break;
                    default: return;
                }
                if (d != null) i.putExtra(GBDevice.EXTRA_DEVICE, d);
                act.startActivity(i);
            } catch (Exception e) {
                Toast.makeText(act, "Não foi possível abrir: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
        return OK;
    }

    // ---------- atualizador do núcleo ----------

    /** Descarrega o APK novo e abre o instalador do Android (um toque). */
    @JavascriptInterface
    public String atualizar(String urlApk) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !act.getPackageManager().canRequestPackageInstalls()) {
                naUi(() -> {
                    Toast.makeText(act, "Autorize a instalação a partir do GT3 Melo e toque de novo em Atualizar.", Toast.LENGTH_LONG).show();
                    act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName())));
                });
                return "{\"ok\":false,\"erro\":\"falta autorização para instalar\"}";
            }
            final File destino = new File(act.getExternalCacheDir(), "gt3-melo.apk");
            if (destino.exists()) destino.delete();
            DownloadManager dm = (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(urlApk));
            r.setTitle("GT3 Melo — atualização");
            r.setDestinationUri(Uri.fromFile(destino));
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            final long id = dm.enqueue(r);
            BroadcastReceiver fim = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                    try { act.unregisterReceiver(this); } catch (Exception ignored) { }
                    try {
                        File dir = new File(act.getCacheDir(), "raw");
                        dir.mkdirs();
                        File local = new File(dir, "gt3-melo.apk");
                        try (java.io.InputStream in = new java.io.FileInputStream(destino);
                             FileOutputStream out = new FileOutputStream(local)) {
                            byte[] buf = new byte[65536];
                            int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        }
                        Uri u = FileProvider.getUriForFile(act, act.getPackageName() + ".screenshot_provider", local);
                        Intent inst = new Intent(Intent.ACTION_VIEW);
                        inst.setDataAndType(u, "application/vnd.android.package-archive");
                        inst.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        act.startActivity(inst);
                    } catch (Exception e) {
                        Toast.makeText(act, "Falhou a instalação: " + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                }
            };
            IntentFilter filtro = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) {
                act.registerReceiver(fim, filtro, Context.RECEIVER_EXPORTED);
            } else {
                act.registerReceiver(fim, filtro);
            }
            return OK;
        } catch (Exception e) {
            return erro(e);
        }
    }
}
