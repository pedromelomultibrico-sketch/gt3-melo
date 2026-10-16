package nodomain.freeyourgadget.gadgetbridge.melo;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** Ecrã único para colar a chave dos avisos. A chave fica guardada só neste telemóvel. */
public class MeloChaveActivity extends Activity {

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        int m = (int) (getResources().getDisplayMetrics().density * 20);
        l.setPadding(m, m, m, m);

        TextView t = new TextView(this);
        t.setText("Cola aqui a chave dos avisos (a mesma da página de avisos). Fica guardada só neste telemóvel.");
        l.addView(t);

        final EditText campo = new EditText(this);
        campo.setSingleLine(true);
        campo.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        campo.setText(MeloAvisos.chave(this));
        l.addView(campo);

        Button guardar = new Button(this);
        guardar.setText("Guardar");
        guardar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String c = campo.getText().toString().trim();
                if (c.isEmpty()) {
                    Toast.makeText(MeloChaveActivity.this, "Falta a chave", Toast.LENGTH_SHORT).show();
                    return;
                }
                MeloAvisos.guardarChave(MeloChaveActivity.this, c);
                MeloAvisos.iniciar(MeloChaveActivity.this);
                Toast.makeText(MeloChaveActivity.this, "Guardada. Os avisos estão ativos.", Toast.LENGTH_SHORT).show();
                finish();
            }
        });
        l.addView(guardar);
        setContentView(l);
    }
}
