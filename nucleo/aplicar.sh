#!/usr/bin/env bash
# Aplica as alterações do GT3 Melo sobre o código do Gadgetbridge.
# Uso: nucleo/aplicar.sh <pasta-do-gadgetbridge> <numero-da-versao>
set -euo pipefail
GB="$1"
N="$2"
AQUI="$(cd "$(dirname "$0")" && pwd)"
PKG="$GB/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/melo"

# 1) Código Java da app (ecrã web + ponte + atualizador)
mkdir -p "$PKG" "$GB/app/src/main/assets"
cp "$AQUI"/java/*.java "$PKG/"
cp "$AQUI"/res/melo_offline.html "$GB/app/src/main/assets/"

# 2) Identidade: nome, id da app, versão, assinatura
G="$GB/app/build.gradle"
sed -i 's#applicationId "nodomain.freeyourgadget.gadgetbridge"#applicationId "ao.melo.gt3"#' "$G"
sed -i "s#versionName \"[0-9.]*\"#versionName \"1.$N\"#" "$G"
sed -i "s#versionCode [0-9]*#versionCode $((1000 + N))#" "$G"
sed -i 's#buildConfigField "boolean", "INTERNET_ACCESS", "false"#buildConfigField "boolean", "INTERNET_ACCESS", "true"#' "$G"
sed -i 's#abortOnError = true#abortOnError = false\n        checkReleaseBuilds = false#' "$G"
python3 - "$G" <<'PY'
import sys, re
p = sys.argv[1]; s = open(p).read()
s = s.replace("    signingConfigs {\n", """    signingConfigs {
        gt3melo {
            storeFile file("gt3melo.jks")
            storePassword "gt3melo2026"
            keyAlias "gt3melo"
            keyPassword "gt3melo2026"
        }
""", 1)
s = s.replace("""        release {
            minifyEnabled true""", """        release {
            signingConfig = signingConfigs.gt3melo
            minifyEnabled true""", 1)
open(p, "w").write(s)
PY
base64 -d "$AQUI/assinatura.b64" > "$GB/app/gt3melo.jks"

S="$GB/app/src/mainline/res/values/strings.xml"
sed -i 's#name="app_name">[^<]*<#name="app_name">GT3 Melo<#' "$S"
sed -i 's#name="title_activity_controlcenter">[^<]*<#name="title_activity_controlcenter">GT3 Melo — avançado<#' "$S"
sed -i 's#name="gadgetbridge_running">[^<]*<#name="gadgetbridge_running">GT3 Melo ligado ao relógio<#' "$S"

# 3) Proguard: não apagar os métodos chamados pelo JavaScript
cat >> "$GB/app/proguard-rules.pro" <<'PRO'

# GT3 Melo
-keep class nodomain.freeyourgadget.gadgetbridge.melo.** { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
PRO

# 4) Manifesto: Internet, instalar atualizações, novo ecrã inicial
M="$GB/app/src/main/AndroidManifest.xml"
python3 - "$M" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace('<uses-permission android:name="android.permission.INTERNET" tools:node="remove" />',
              '<uses-permission android:name="android.permission.INTERNET" />\n'
              '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n'
              '    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" tools:ignore="ScopedStorage" />')
antes = s
# tirar o ControlCenterv2 do lançador
i = s.index('android:name=".activities.ControlCenterv2"')
j = s.index('</activity>', i)
bloco = s[i:j].replace('<category android:name="android.intent.category.LAUNCHER" />', '')
s = s[:i] + bloco + s[j:]
filtros = ''
for mime in ["application/zip", "application/x-zip-compressed", "application/octet-stream"]:
    filtros += '''
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:scheme="file" />
                <data android:mimeType="%s" />
            </intent-filter>''' % mime
# pelo nome do ficheiro, quando o telemovel nao sabe o tipo
filtros += '''
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:scheme="file" />
                <data android:host="*" />
                <data android:mimeType="*/*" />'''
padrao = '/.*'
for _ in range(6):
    filtros += '\n                <data android:pathPattern="%s\\\\.hwt" />' % padrao
    padrao += '\\\\..*'
filtros += '''
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="*/*" />
            </intent-filter>'''

nova = '''<activity
            android:name=".melo.MeloActivity"
            android:label="GT3 Melo"
            android:theme="@android:style/Theme.Material.NoActionBar"
            android:configChanges="orientation|screenSize|keyboardHidden|uiMode"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>''' + filtros + '''
        </activity>
        <activity
            android:name=".activities.ControlCenterv2"'''

# tirar os filtros genericos do ecra antigo, para nao aparecerem duas entradas iguais
ini = s.find('<!-- to receive the firmwares from the download content provider -->')
fim = s.find('<data android:mimeType="*/*" />', ini)
if ini > 0 and fim > ini:
    fim = s.find('</intent-filter>', fim) + len('</intent-filter>')
    s = s[:ini] + s[fim:]
s = s.replace('<activity\n            android:name=".activities.ControlCenterv2"', nova, 1)
# O vigia da ligacao. Tem de ficar no MANIFESTO e nao em memoria: os recetores
# que o Gadgetbridge regista sozinho morrem com o servico, e e precisamente
# quando o servico morre que o relogio fica desligado sem ninguem o religar.
vigia = '''
        <receiver
            android:name=".melo.MeloVigia"
            android:enabled="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.bluetooth.device.action.ACL_CONNECTED" />
                <action android:name="android.bluetooth.adapter.action.STATE_CHANGED" />
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="ao.melo.gt3.VIGIA" />
            </intent-filter>
        </receiver>
'''
assert s.count('</application>') == 1, "nao sei onde por o vigia"
s = s.replace('</application>', vigia + '    </application>', 1)
assert s != antes and '.melo.MeloActivity' in s and '.melo.MeloVigia' in s, "manifesto não alterado"
open(p, "w").write(s)
PY

# 5) Ícone
python3 -m pip install -q --break-system-packages pillow >/dev/null 2>&1 || true
python3 "$AQUI/icone.py" "$AQUI/res"
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  for n in ic_launcher ic_launcher_round; do
    if [ -f "$AQUI/res/icone-$d.png" ] && [ -d "$GB/app/src/main/res/mipmap-$d" ]; then
      cp "$AQUI/res/icone-$d.png" "$GB/app/src/main/res/mipmap-$d/$n.png"
    fi
  done
done
rm -f "$GB/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml" "$GB/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml"
rm -f "$GB"/app/src/mainline/res/mipmap-anydpi*/ic_launcher*.xml 2>/dev/null || true

# 6) Avisos em segundo plano: permissões, serviço com aviso fixo e ecrã da chave
python3 - "$M" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
perm = '''    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
'''
assert s.count('<application') == 1, "nao sei onde por as permissoes"
s = s.replace('<application', perm + '    <application', 1)
svc = '''
        <service
            android:name=".melo.MeloAvisos"
            android:exported="false"
            android:foregroundServiceType="dataSync" />
        <activity
            android:name=".melo.MeloChaveActivity"
            android:label="Chave dos avisos"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    '''
assert s.count('</application>') == 1, "nao sei onde por os avisos"
s = s.replace('</application>', svc + '</application>', 1)
open(p, "w").write(s)
PY

# 7) Chamadas de apps (VoIP, ex.: despertador do Jarvis): o Gadgetbridge leva a
#    chamada ao relógio, mas Atender/Recusar no pulso só sabiam mexer em chamadas
#    telefónicas. Guarda-se a última notificação de chamada de app e, quando o
#    relógio manda atender/recusar, carrega-se no botão certo dessa notificação.
NL="$GB/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/externalevents/NotificationListener.java"
CR="$GB/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/service/receivers/GBCallControlReceiver.java"
python3 - "$NL" "$CR" <<'PY'
import sys
nl, cr = sys.argv[1], sys.argv[2]
s = open(nl).read()
cab = "public class NotificationListener extends NotificationListenerService {"
assert cab in s, "nao encontrei a classe NotificationListener"
s = s.replace(cab, cab + "\n    public static volatile StatusBarNotification meloChamadaVoip = null;", 1)
ent = "    private void handleCallNotification(StatusBarNotification sbn) {\n"
assert ent in s, "nao encontrei handleCallNotification"
s = s.replace(ent, ent + "        meloChamadaVoip = PHONE_CALL_APPS.contains(sbn.getPackageName()) ? null : sbn;\n" + '''        try {
            final android.app.Notification mn = sbn.getNotification();
            nodomain.freeyourgadget.gadgetbridge.melo.MeloDiag.enviar("voip-chamada", "pkg=" + sbn.getPackageName() + " cat=" + mn.category + " acoes=" + (mn.actions == null ? 0 : mn.actions.length) + " extras=" + (mn.extras == null ? "-" : mn.extras.keySet().toString()));
        } catch (Exception meloE) { }
''', 1)
fim = "            activeCallPostTime = 0;\n"
assert fim in s, "nao encontrei o fim da chamada"
s = s.replace(fim, fim + "            meloChamadaVoip = null;\n", 1)
open(nl, "w").write(s)

c = open(cr).read()
log = '        LOG.debug("Got call control event: {}", callCmd);\n'
assert log in c, "nao encontrei o onReceive do GBCallControlReceiver"
c = c.replace(log, log + "        if (meloVoip(callCmd)) return;\n", 1)
metodo = '''    // GT3 Melo: atender/recusar uma chamada de app (VoIP) a partir do relogio.
    private boolean meloVoip(GBDeviceEventCallControl.Event cmd) {
        try {
            android.service.notification.StatusBarNotification sbn =
                    nodomain.freeyourgadget.gadgetbridge.externalevents.NotificationListener.meloChamadaVoip;
            if (sbn == null) return false;
            final boolean aceitar = cmd == GBDeviceEventCallControl.Event.ACCEPT || cmd == GBDeviceEventCallControl.Event.START;
            final boolean recusar = cmd == GBDeviceEventCallControl.Event.REJECT || cmd == GBDeviceEventCallControl.Event.END;
            if (!aceitar && !recusar) return false;
            final android.app.Notification n = sbn.getNotification();
            android.app.PendingIntent pi = null;
            if (Build.VERSION.SDK_INT >= 31 && n.extras != null) {
                pi = n.extras.getParcelable(aceitar ? android.app.Notification.EXTRA_ANSWER_INTENT : android.app.Notification.EXTRA_DECLINE_INTENT);
                if (pi == null && recusar) pi = n.extras.getParcelable(android.app.Notification.EXTRA_HANG_UP_INTENT);
            }
            if (pi == null && n.actions != null) {
                for (android.app.Notification.Action a : n.actions) {
                    final String t = String.valueOf(a.title).toLowerCase(java.util.Locale.ROOT);
                    final boolean bate = aceitar
                            ? (t.contains("atender") || t.contains("answer") || t.contains("aceitar") || t.contains("accept"))
                            : (t.contains("recusar") || t.contains("rejeitar") || t.contains("decline") || t.contains("reject") || t.contains("desligar") || t.contains("terminar") || t.contains("hang"));
                    if (bate) { pi = a.actionIntent; break; }
                }
            }
            if (pi == null) return false;
            if (Build.VERSION.SDK_INT >= 34) {
                final android.app.ActivityOptions o = android.app.ActivityOptions.makeBasic();
                o.setPendingIntentBackgroundActivityStartMode(android.app.ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED);
                pi.send(mContext, 0, null, null, null, null, o.toBundle());
            } else {
                pi.send();
            }
            LOG.info("GT3 Melo: chamada de app {} pelo relogio", aceitar ? "atendida" : "recusada");
            if (recusar) nodomain.freeyourgadget.gadgetbridge.externalevents.NotificationListener.meloChamadaVoip = null;
            return true;
        } catch (Exception e) {
            LOG.warn("GT3 Melo: nao consegui tratar a chamada de app", e);
            return false;
        }
    }

'''
ancora = "    @RequiresApi(api = Build.VERSION_CODES.P)\n    public void handleCallCmdTelecomManager"
assert ancora in c, "nao encontrei handleCallCmdTelecomManager"
c = c.replace(ancora, metodo + ancora, 1)
open(cr, "w").write(c)
PY

echo "GT3 Melo aplicado (versão 1.$N)"
