package nodomain.freeyourgadget.gadgetbridge.melo;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Diagnóstico leve: manda ao Worker gt3-melo uma linha de texto sobre o que
 * aconteceu (ex.: chamada de app recebida, botão do relógio, resultado).
 * Fica em KV "log:<nome>" durante 7 dias. Nunca rebenta nem bloqueia.
 */
public final class MeloDiag {
    private static final String BASE = "https://gt3-melo.pedromelomultibrico.workers.dev/ci/dd675fde21f25243db694192/";

    private MeloDiag() { }

    public static void enviar(final String nome, final String texto) {
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(BASE + nome).openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setDoOutput(true);
                final byte[] b = String.valueOf(texto).getBytes(StandardCharsets.UTF_8);
                try (OutputStream o = c.getOutputStream()) { o.write(b); }
                c.getResponseCode();
            } catch (Throwable ignored) {
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }
}
