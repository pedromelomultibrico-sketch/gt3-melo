"""Procura na Internet máscaras .hwt que tragam imagem de ecrã sempre ligado (AOD).

Uma base assim permite converter qualquer máscara em "sempre ligado" sem depender
do que o Pedro tem guardado. Escreve o relatório em ci/relatorio-aod.txt e, se
encontrar uma boa, guarda-a em nucleo/base-aod.hwt.
"""
import io, json, os, re, sys, zipfile
import requests

sys.path.insert(0, "ci")
from mascara import ler_imagens, descodificar, opacidade

PAGINAS = [
    "https://faces4watch.com/downloads/huawei-watch-gt-3",
    "https://faces4watch.com/downloads/huawei-watch-gt-3/page/2",
    "https://amazfitwatchfaces.com/huawei-watch-gt/fresh",
]
CAB = {"user-agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"}
saida = []


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    saida.append(t)


def analisar(nome, dados):
    """Devolve (imagens, indice_fundo, indice_aod) ou None."""
    try:
        z = zipfile.ZipFile(io.BytesIO(dados))
        n = z.namelist()
        interno = "com.honor.watchface" if "com.honor.watchface" in n else "com.huawei.watchface"
        if interno not in n:
            dentro = [x for x in n if x.lower().endswith(".hwt")]
            if not dentro:
                return None
            return analisar(nome, z.read(dentro[0]))
        b = z.read(interno)
        try:
            zi = zipfile.ZipFile(io.BytesIO(b))
            if "watchface.bin" in zi.namelist():
                b = zi.read("watchface.bin")
        except Exception:
            pass
        imgs = ler_imagens(b)
        grandes = [im for im in imgs if min(im["w"], im["h"]) >= 200]
        info = []
        for im in grandes[:8]:
            info.append((im["w"], im["h"], im["fim"] - im["dados"], round(opacidade(descodificar(b, im)), 2)))
        fundo = [i for i in info if i[3] > 0.6]
        aod = [i for i in info if i[3] <= 0.6]
        diz("  ", nome, "| imagens grandes:", info)
        return (len(imgs), fundo, aod)
    except Exception as e:
        diz("  ", nome, "ilegível:", str(e)[:80])
        return None


def links(pagina):
    try:
        r = requests.get(pagina, headers=CAB, timeout=40)
        diz("==", pagina, r.status_code, len(r.content), "bytes")
        if r.status_code != 200:
            return []
        achados = re.findall(r'href="([^"]+\.(?:hwt|zip))"', r.text, re.I)
        paginas = re.findall(r'href="(https://faces4watch\.com/[^"]*download[^"]*)"', r.text, re.I)
        return list(dict.fromkeys(achados))[:12], list(dict.fromkeys(paginas))[:12]
    except Exception as e:
        diz("==", pagina, "falhou:", str(e)[:100])
        return [], []


def paginas_de_mascara(pagina):
    """Links para as páginas de cada máscara dentro de uma listagem."""
    try:
        r = requests.get(pagina, headers=CAB, timeout=40)
        if r.status_code != 200:
            return []
        base = "https://" + pagina.split("/")[2]
        achados = re.findall(r'href="(https?://[^"]+|/[^"]+)"', r.text)
        bons = []
        for u in achados:
            if u.startswith("/"):
                u = base + u
            if re.search(r"/(download|watchface|watch-face)s?/[^/]+/?$", u, re.I) and "category" not in u:
                bons.append(u.split("?")[0])
        return list(dict.fromkeys(bons))[:25]
    except Exception:
        return []


def ficheiros_da_pagina(pagina):
    try:
        r = requests.get(pagina, headers=CAB, timeout=40)
        if r.status_code != 200:
            return []
        base = "https://" + pagina.split("/")[2]
        us = re.findall(r'href="([^"]+\.(?:hwt|zip))"', r.text, re.I)
        us += re.findall(r'href="([^"]*(?:download|file)[^"]*id=\d+[^"]*)"', r.text, re.I)
        return [u if u.startswith("http") else base + u for u in dict.fromkeys(us)][:4]
    except Exception:
        return []


melhor = None
vistos = set()
for pagina in PAGINAS:
    diretos, _ = links(pagina)
    candidatos = [u if u.startswith("http") else "https://" + pagina.split("/")[2] + u for u in diretos]
    for detalhe in paginas_de_mascara(pagina)[:14]:
        candidatos += ficheiros_da_pagina(detalhe)
    diz("  ficheiros a experimentar:", len(candidatos))
    for u in candidatos[:20]:
        if u in vistos:
            continue
        vistos.add(u)
        try:
            r = requests.get(u, headers=CAB, timeout=60)
            if r.status_code != 200 or len(r.content) < 20000:
                continue
            res = analisar(u.split("/")[-1][:60], r.content)
            if res and res[2] and res[1]:
                diz("  >>> SERVE COMO BASE:", u)
                if melhor is None:
                    melhor = (u, r.content)
                    break
        except Exception as e:
            diz("  ", u[:70], "erro", str(e)[:60])
    if melhor:
        break

if melhor:
    open("nucleo/base-aod.hwt", "wb").write(melhor[1])
    diz("Base guardada de", melhor[0], len(melhor[1]), "bytes")
else:
    diz("Nenhuma base com ecrã sempre ligado encontrada nestas fontes.")

open("ci/relatorio-aod.txt", "w").write("\n".join(saida))
