"""Vasculha repositórios públicos do GitHub à procura de máscaras .hwt que tragam
imagem de ecrã sempre ligado (AOD), para servir de base às conversões.
"""
import io, os, re, sys, zipfile
import requests

sys.path.insert(0, "ci")
from mascara import ler_imagens, descodificar, opacidade

CAB = {"accept": "application/vnd.github+json", "user-agent": "gt3-melo"}
if os.environ.get("GITHUB_TOKEN"):
    CAB["authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]

CONSULTAS = [
    "huawei watchface", "huawei watch face hwt", "hwt watchface", "gt3 watchface",
    "huawei theme watchface", "watchface huawei gt", "honor watchface hwt",
]
saida = []


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    saida.append(t)


def analisar(dados):
    z = zipfile.ZipFile(io.BytesIO(dados))
    n = z.namelist()
    interno = "com.honor.watchface" if "com.honor.watchface" in n else "com.huawei.watchface"
    if interno not in n:
        dentro = [x for x in n if x.lower().endswith(".hwt")]
        if not dentro:
            raise ValueError("sem máscara")
        return analisar(z.read(dentro[0]))
    b = z.read(interno)
    try:
        zi = zipfile.ZipFile(io.BytesIO(b))
        if "watchface.bin" in zi.namelist():
            b = zi.read("watchface.bin")
    except Exception:
        pass
    imgs = ler_imagens(b)
    grandes = [im for im in imgs if min(im["w"], im["h"]) >= 200]
    info = [(im["w"], im["h"], im["fim"] - im["dados"], round(opacidade(descodificar(b, im)), 2)) for im in grandes[:10]]
    fundo = [i for i in info if i[3] > 0.6]
    aod = [i for i in info if i[3] <= 0.6]
    return info, fundo, aod


ficheiros = []
for q in CONSULTAS:
    try:
        r = requests.get("https://api.github.com/search/repositories",
                         params={"q": q, "per_page": 10}, headers=CAB, timeout=30)
        if r.status_code != 200:
            diz("procura", q, "->", r.status_code)
            continue
        for rep in r.json().get("items", []):
            full, br = rep["full_name"], rep["default_branch"]
            t = requests.get("https://api.github.com/repos/%s/git/trees/%s?recursive=1" % (full, br),
                             headers=CAB, timeout=30)
            if t.status_code != 200:
                continue
            for n in t.json().get("tree", []):
                if n["path"].lower().endswith(".hwt") and 20000 < n.get("size", 0) < 8_000_000:
                    ficheiros.append("https://raw.githubusercontent.com/%s/%s/%s" % (full, br, n["path"]))
    except Exception as e:
        diz("procura", q, "falhou:", str(e)[:80])

ficheiros = list(dict.fromkeys(ficheiros))
diz("máscaras encontradas:", len(ficheiros))

melhor = None
for u in ficheiros[:60]:
    try:
        r = requests.get(u, timeout=60)
        if r.status_code != 200 or len(r.content) < 20000:
            continue
        info, fundo, aod = analisar(r.content)
        marca = " <<< TEM ECRÃ SEMPRE LIGADO" if (fundo and aod) else ""
        diz(u.split("/")[-1][:50], info, marca)
        if fundo and aod and melhor is None:
            melhor = (u, r.content)
    except Exception:
        continue

if melhor:
    open("nucleo/base-aod.hwt", "wb").write(melhor[1])
    diz("BASE GUARDADA:", melhor[0], len(melhor[1]), "bytes")
else:
    diz("Nenhuma das máscaras do GitHub traz ecrã sempre ligado.")

open("ci/relatorio-aod2.txt", "w").write("\n".join(saida))
