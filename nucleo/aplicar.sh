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

cat > "$GB/app/src/mainline/res/values/strings.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string translatable="false" name="app_name">GT3 Melo</string>
    <string translatable="false" name="title_activity_controlcenter">GT3 Melo — avançado</string>
</resources>
XML

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
              '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />')
antes = s
# tirar o ControlCenterv2 do lançador
i = s.index('android:name=".activities.ControlCenterv2"')
j = s.index('</activity>', i)
bloco = s[i:j].replace('<category android:name="android.intent.category.LAUNCHER" />', '')
s = s[:i] + bloco + s[j:]
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
            </intent-filter>
        </activity>
        <activity
            android:name=".activities.ControlCenterv2"'''
s = s.replace('<activity\n            android:name=".activities.ControlCenterv2"', nova, 1)
assert s != antes and '.melo.MeloActivity' in s, "manifesto não alterado"
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

echo "GT3 Melo aplicado (versão 1.$N)"
