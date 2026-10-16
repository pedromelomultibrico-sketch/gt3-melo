package nodomain.freeyourgadget.gadgetbridge.melo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

import nodomain.freeyourgadget.gadgetbridge.GBApplication;
import nodomain.freeyourgadget.gadgetbridge.impl.GBDevice;
import nodomain.freeyourgadget.gadgetbridge.model.NotificationSpec;
import nodomain.freeyourgadget.gadgetbridge.model.NotificationType;

/**
 * Recebe os avisos do canal avisos-pedro e mostra-os no relógio, mesmo com o
 * ecrã desligado. Corre como serviço em primeiro plano, com um aviso fixo.
 */
public class MeloAvisos extends Service {

    static final String URL_BASE = "https://avisos-pedro.pedromelomultibrico.workers.dev";
    static final String PREFS = "melo";
    static final String PREF_CHAVE = "avisos_chave";
    static final String CANAL = "avisos_fixo";
    static final int ID_FIXO = 7411;

    static volatile boolean ativo = false;
    private Thread fio;
    private final Set<String> vistos = new HashSet<>();

    static String chave(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_CHAVE, "").trim();
    }

    public static void guardarChave(Context ctx, String c) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_CHAVE, c.trim()).apply();
    }

    /** Arranca o serviço se ainda não estiver a correr e houver chave guardada. */
    public static void iniciar(Context ctx) {
        try {
            if (ativo || chave(ctx).isEmpty()) return;
            Intent i = new Intent(ctx, MeloAvisos.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception ignored) {
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (ativo) return START_STICKY;
        try {
            criarCanal();
            Notification n = construirFixo();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(ID_FIXO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(ID_FIXO, n);
            }
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        ativo = true;
        fio = new Thread(this::ciclo, "avisos-pedro");
        fio.start();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        ativo = false;
        if (fio != null) fio.interrupt();
        super.onDestroy();
    }

    /** No Android 15 o tipo dataSync tem limite de seis horas: o serviço para e a vigia volta a arrancá-lo. */
    public void onTimeout(int startId, int fgsType) {
        ativo = false;
        stopSelf();
    }

    private void ciclo() {
        String desde = agoraIso();
        while (ativo) {
            try {
                String c = chave(this);
                if (c.isEmpty()) {
                    Thread.sleep(60000);
                    continue;
                }
                JSONObject r = pedir(c, desde);
                JSONArray av = r.optJSONArray("avisos");
                if (av != null) {
                    for (int k = 0; k < av.length(); k++) {
                        JSONObject a = av.getJSONObject(k);
                        String id = a.optString("id", "");
                        if (!id.isEmpty() && !vistos.add(id)) continue;
                        if (vistos.size() > 300) vistos.clear();
                        mostrarNoRelogio(a.optString("titulo", "Aviso"), a.optString("mensagem", ""));
                    }
                }
                desde = r.optString("ate", desde);
            } catch (InterruptedException e) {
                break;
            } catch (Exception e) {
                try {
                    Thread.sleep(15000);
                } catch (InterruptedException ie) {
                    break;
                }
            }
        }
        ativo = false;
        stopSelf();
    }

    private JSONObject pedir(String chave, String desde) throws Exception {
        String q = URL_BASE + "/fila?espera=45&desde=" + URLEncoder.encode(desde, "UTF-8");
        HttpURLConnection con = (HttpURLConnection) new URL(q).openConnection();
        con.setRequestProperty("X-Chave", chave);
        con.setConnectTimeout(15000);
        con.setReadTimeout(70000);
        try {
            int codigo = con.getResponseCode();
            if (codigo != 200) throw new Exception("HTTP " + codigo);
            InputStream in = con.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            return new JSONObject(new String(bo.toByteArray(), StandardCharsets.UTF_8));
        } finally {
            con.disconnect();
        }
    }

    private void mostrarNoRelogio(String titulo, String texto) {
        try {
            GBDevice d = MeloVigia.relogio(this);
            if (d == null || !d.isInitialized()) return;
            NotificationSpec s = new NotificationSpec();
            s.setTitle(titulo);
            s.setBody(texto);
            s.setSourceName("Avisos Pedro");
            s.setType(NotificationType.UNKNOWN);
            GBApplication.deviceService(d).onNotification(s);
        } catch (Exception ignored) {
        }
    }

    private void criarCanal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel c = new NotificationChannel(CANAL, "Avisos do Pedro (ligação)", NotificationManager.IMPORTANCE_MIN);
            c.setDescription("Aviso fixo: a app está à espera de avisos");
            nm.createNotificationChannel(c);
        }
    }

    private Notification construirFixo() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CANAL)
                : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentTitle("GT3 Melo")
                .setContentText("À espera de avisos")
                .setOngoing(true)
                .build();
    }

    static String agoraIso() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }
}
