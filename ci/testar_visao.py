"""Experimenta vários modelos de visão da Cloudflare com a mesma fotografia."""
import base64, io, json, sys, urllib.request

sys.path.insert(0, "ci")
from mascara import desenho_teste

U = "https://gt3-melo.pedromelomultibrico.workers.dev"
K = "dd675fde21f25243db694192"

im = desenho_teste(466, 466).convert("RGB")
buf = io.BytesIO(); im.save(buf, "JPEG", quality=85)
B64 = base64.b64encode(buf.getvalue()).decode()
DATA_URL = "data:image/jpeg;base64," + B64

PEDIDO = (
    "Esta imagem mostra o mostrador de um relogio redondo. Descreve-o em JSON puro, sem texto a volta: "
    '{"nome":"...","fundo":{"tipo":"cor|gradiente","cor1":"#hex","cor2":"#hex","angulo":0},'
    '"camadas":[{"tipo":"hora|minutos_ponteiros|data|dia_semana|bateria|passos|batimentos|texto|anel|marcas",'
    '"x":233,"y":233,"tamanho":80,"cor":"#hex","fonte":"Inter","peso":400,"texto":"","espessura":4}]}. '
    "Mostrador 466x466, centro 233,233."
)


import subprocess, tempfile


def chamar(caminho, corpo):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(corpo, f)
        nome = f.name
    r = subprocess.run(["curl", "-s", "--max-time", "180", "-X", "POST",
                        "-H", "content-type: application/json",
                        "--data-binary", "@" + nome, U + caminho],
                       capture_output=True, text=True)
    return (r.stdout or r.stderr)[:1200]


mensagens = [{"role": "user", "content": [
    {"type": "text", "text": PEDIDO},
    {"type": "image_url", "image_url": {"url": DATA_URL}}]}]

testes = [
    ("llama-3.2 aceitar licenca", "@cf/meta/llama-3.2-11b-vision-instruct", {"prompt": "agree"}),
    ("llama-3.2 vision", "@cf/meta/llama-3.2-11b-vision-instruct", {"imagem_b64": B64, "prompt": PEDIDO, "max_tokens": 1000}),
    ("llama-4 scout", "@cf/meta/llama-4-scout-17b-16e-instruct", {"messages": mensagens, "max_tokens": 1000}),
    ("mistral small 3.1", "@cf/mistralai/mistral-small-3.1-24b-instruct", {"messages": mensagens, "max_tokens": 1000}),
    ("moondream 3.1", "@cf/moondream/moondream3.1-9B-A2B", {"messages": mensagens, "max_tokens": 1000}),
    ("llava 1.5", "@cf/llava-hf/llava-1.5-7b-hf", {"imagem_b64": B64, "prompt": PEDIDO, "max_tokens": 800}),
]

saida = []
for nome, modelo, entrada in testes:
    try:
        r = chamar("/api/ia/exec", {"chave": K, "modelo": modelo, "entrada": entrada})
    except Exception as e:
        import traceback
        r = "falhou: " + traceback.format_exc()[-400:]
    saida.append("== %s (%s)\n%s\n" % (nome, modelo, r))
    print(saida[-1])

texto = "\n".join(saida)
try:
    urllib.request.urlopen(urllib.request.Request(U + "/ci/" + K + "/visao", data=texto.encode(),
                                                  headers={"user-agent": "Mozilla/5.0 (GT3 Melo CI)"}), timeout=60)
    print("relatório enviado")
except Exception as e:
    print("não consegui enviar o relatório:", e)
