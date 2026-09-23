package nodomain.freeyourgadget.gadgetbridge.melo;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;

import java.util.List;

import nodomain.freeyourgadget.gadgetbridge.GBApplication;
import nodomain.freeyourgadget.gadgetbridge.impl.GBDevice;
import nodomain.freeyourgadget.gadgetbridge.util.GBPrefs;

/**
 * Vigia da ligação ao relógio — religa sozinho quando a ligação cai.
 *
 * POR QUE É PRECISO. O Gadgetbridge só insiste em religar enquanto o aparelho
 * estiver no estado WAITING_FOR_RECONNECT. Mal passe a NOT_CONNECTED (o
 * "Desconectado" que aparece no ecrã), deixa de haver quem tente: os dois
 * recetores que fariam esse trabalho — BluetoothConnectReceiver e
 * AutoConnectIntervalReceiver — são registados em memória pelo serviço das
 * ligações, e quando o Android mata esse serviço (poupança de bateria, falta
 * de memória) morrem com ele. O relógio fica então desligado até alguém
 * carregar no botão Ligar. Era exatamente o que estava a acontecer: o relógio
 * aparecia "ativo" nas autorizações e não chegava nada ao pulso.
 *
 * Este vigia está declarado no MANIFESTO, e não em memória. O Android acorda-o
 * mesmo com a app fechada e o serviço morto — que é o momento em que faz falta.
 *
 * Acorda por quatro motivos: o relógio voltou a aparecer no Bluetooth
 * (ACL_CONNECTED — o GT 3 é Bluetooth clássico e volta sozinho a este nível),
 * o Bluetooth foi ligado, o telemóvel arrancou, ou o alarme de cinco em cinco
 * minutos. Em qualquer deles a pergunta é a mesma: o relógio está ligado? Se
 * não, liga.
 */
public class MeloVigia extends BroadcastReceiver {

    /** Alarme próprio, de cinco em cinco minutos. */
    public static final String ACAO = "ao.melo.gt3.VIGIA";

    private static final String PREFS = "melo";
    private static final String PREF_RELOGIO = "relogio_escolhido";
    public static final String PREF_VIGIA = "vigia_ligado";

    private static final long INTERVALO = 5 * 60 * 1000L;
    private static final int PEDIDO = 7312;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        try {
            // Volta sempre a marcar a próxima ronda, seja qual for o motivo
            // desta. Se falhasse uma, o vigia adormecia para sempre.
            agendar(ctx);
            if (!ligado(ctx)) return;
            BluetoothAdapter bt = BluetoothAdapter.getDefaultAdapter();
            if (bt == null || !bt.isEnabled()) return;
            tentarLigar(ctx);
        } catch (Exception ignored) {
        }
    }

    /** O vigia pode ser desligado pela interface, mas vem ligado de origem. */
    public static boolean ligado(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(PREF_VIGIA, true);
    }

    public static void definirLigado(Context ctx, boolean v) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(PREF_VIGIA, v).apply();
        if (v) agendar(ctx);
    }

    /** Marca a próxima verificação. setAndAllowWhileIdle passa pelo modo Doze. */
    public static void agendar(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, MeloVigia.class).setAction(ACAO);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, PEDIDO, i, flags);
            long quando = SystemClock.elapsedRealtime() + INTERVALO;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, quando, pi);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, quando, pi);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Liga ao relógio escolhido, se ele não estiver já ligado ou a ligar-se.
     * Passar o aparelho a connect() força a ligação mesmo que as preferências
     * do Gadgetbridge digam que não — é o caminho do botão "Ligar".
     */
    public static void tentarLigar(Context ctx) {
        try {
            GBDevice d = relogio(ctx);
            if (d == null) return;
            garantirPreferencias(d);
            if (d.isInitialized() || d.isConnecting()) return;
            GBApplication.deviceService(d).connect();
        } catch (Exception ignored) {
        }
    }

    /**
     * Põe de pé os dois mecanismos do próprio Gadgetbridge que vêm desligados
     * de origem e que, neste relógio, são os que mais rendem:
     *  - religar quando o Bluetooth é ligado;
     *  - religar quando o relógio reaparece no Bluetooth (ACL). O GT 3 é
     *    Bluetooth clássico, por isso volta sozinho a este nível assim que
     *    entra no alcance — só faltava alguém aproveitar o aviso.
     * Assim o vigia é a rede de segurança, não a única corda.
     */
    public static void garantirPreferencias(GBDevice d) {
        try {
            SharedPreferences g = GBApplication.getPrefs().getPreferences();
            if (g != null && !g.getBoolean(GBPrefs.AUTO_CONNECT_BLUETOOTH, false)) {
                g.edit().putBoolean(GBPrefs.AUTO_CONNECT_BLUETOOTH, true).apply();
            }
            if (d == null) return;
            SharedPreferences p = GBApplication.getDeviceSpecificSharedPrefs(d.getAddress());
            if (p != null && !p.getBoolean(GBPrefs.DEVICE_CONNECT_BACK, false)) {
                p.edit().putBoolean(GBPrefs.DEVICE_CONNECT_BACK, true).apply();
            }
            if (p != null && !p.getBoolean(GBPrefs.DEVICE_AUTO_RECONNECT, true)) {
                p.edit().putBoolean(GBPrefs.DEVICE_AUTO_RECONNECT, true).apply();
            }
        } catch (Exception ignored) {
        }
    }

    /** Auscultadores, colunas e afins: não são relógios e não recebem máscaras. */
    static boolean eAudio(GBDevice d) {
        try {
            String t = d.getType().name().toUpperCase();
            return t.contains("BUD") || t.contains("HEADPHON") || t.contains("HEADSET")
                    || t.contains("EARPHONE") || t.contains("AIRPOD") || t.contains("SPEAKER")
                    || t.contains("SONY_WH") || t.contains("SONY_WF") || t.contains("SOUND");
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * O relógio com que a app trabalha. Respeita a escolha do Pedro; se não
     * houver, prefere um aparelho que não seja de áudio — senão a app acaba a
     * falar com os auscultadores, que aceitam tudo e não fazem nada.
     */
    static GBDevice relogio(Context ctx) {
        List<GBDevice> l = GBApplication.app().getDeviceManager().getDevices();
        if (l.isEmpty()) return null;
        String escolhido = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_RELOGIO, "");
        if (escolhido != null && !escolhido.isEmpty()) {
            for (GBDevice d : l) if (escolhido.equals(d.getAddress())) return d;
        }
        for (GBDevice d : l) if (d.isInitialized() && !eAudio(d)) return d;
        for (GBDevice d : l) if (d.isConnected() && !eAudio(d)) return d;
        for (GBDevice d : l) if (!eAudio(d)) return d;
        for (GBDevice d : l) if (d.isInitialized()) return d;
        for (GBDevice d : l) if (d.isConnected()) return d;
        return l.get(0);
    }
}
