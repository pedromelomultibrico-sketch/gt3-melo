#!/usr/bin/env python3
"""Confere o ecrã sempre ligado de uma máscara .hwt.

O desenho de uma máscara não é XML — é protobuf. Cada elemento é
{1: índice, 2: tipo, (3+tipo): conteúdo} e, dentro do conteúdo, um campo diz
"este elemento aparece no ecrã sempre ligado". O número desse campo muda com
o tipo: imagens 5, dígitos 6, valores 13, ponteiros 9, anéis 12.

Uso: sempre_ligado.py ficheiro.hwt [--exigir]
Com --exigir sai com erro se a máscara não tiver ranhura de sempre ligado —
é assim que se trava uma base nova que partisse esta função.
"""
import sys, io, zipfile, struct

CAMPO_AOD = {1: 5, 2: 6, 3: 13, 5: 9, 6: 6, 7: 12}


def ler_varint(b, i):
    v, mul, ini = 0, 1, i
    while True:
        c = b[i]; i += 1
        v += (c & 0x7F) * mul; mul *= 128
        if not c & 0x80:
            break
        if i - ini > 10:
            raise ValueError("varint comprido demais")
    return v, i


def pb_ler(b):
    itens, i = [], 0
    while i < len(b):
        k, i = ler_varint(b, i)
        c, t = k // 8, k % 8
        if not c:
            raise ValueError("campo 0")
        if t == 0:
            v, i = ler_varint(b, i); itens.append((c, t, v))
        elif t == 2:
            n, i = ler_varint(b, i)
            if i + n > len(b):
                raise ValueError("comprimento fora do fim")
            itens.append((c, t, b[i:i + n])); i += n
        elif t == 1:
            itens.append((c, t, b[i:i + 8])); i += 8
        elif t == 5:
            itens.append((c, t, b[i:i + 4])); i += 4
        else:
            raise ValueError("tipo %d" % t)
    return itens


def arvore(b, fundura=0):
    itens = []
    for c, t, v in pb_ler(b):
        filhos = None
        if t == 2 and v and fundura < 12:
            try:
                filhos = arvore(v, fundura + 1)
            except Exception:
                filhos = None
        itens.append({"c": c, "t": t, "v": v, "filhos": filhos})
    return itens


def campo(itens, c):
    for x in itens:
        if x["c"] == c:
            return x
    return None


def elementos(itens, saida):
    """Devolve (tipo, índice, conteúdo) de cada elemento do mostrador."""
    for it in itens:
        f = it["filhos"]
        if not f:
            continue
        i1, i2 = campo(f, 1), campo(f, 2)
        if i1 and i1["t"] == 0 and i2 and i2["t"] == 0 and 1 <= i2["v"] <= 8:
            cc = campo(f, 3 + i2["v"])
            if cc and cc["filhos"]:
                saida.append((i2["v"], i1["v"], cc["filhos"]))
                continue
        elementos(f, saida)
    return saida


def partes(b):
    ver, xmllen = struct.unpack_from("<HH", b, 0)
    maplen, binlen, extra = struct.unpack_from("<III", b, 4)
    corpo = 16 + xmllen + maplen + 8
    tabela = [struct.unpack_from("<II", b, 16 + xmllen + i * 8) for i in range(maplen // 8)]
    return ver, b[16:16 + xmllen], tabela, corpo


def medidas(b, tabela, corpo, nome):
    """Largura e altura da imagem com este nome ("005" = a quinta da tabela)."""
    i = int(nome) - 1
    if i < 0 or i >= len(tabela):
        return None
    off, sz = tabela[i]
    if not sz:
        return None
    ini = corpo + off - 8
    return struct.unpack_from("<HH", b, ini + 4)


def ver_mascara(caminho):
    z = zipfile.ZipFile(caminho)
    nome_int = "com.honor.watchface" if "com.honor.watchface" in z.namelist() else "com.huawei.watchface"
    bruto = z.read(nome_int)
    if bruto[:2] == b"PK":
        bruto = zipfile.ZipFile(io.BytesIO(bruto)).read("watchface.bin")
    ver, xml, tabela, corpo = partes(bruto)
    print("%s: formato %d, %d imagens, desenho com %d bytes" % (caminho, ver, len(tabela), len(xml)))
    try:
        els = elementos(arvore(xml), [])
    except Exception as e:
        print("  não consegui ler o desenho: %s" % e)
        return False
    if not els:
        print("  formato antigo: não tem elementos marcáveis, logo não pode ter sempre ligado próprio")
        return False
    NOMES = {1: "imagem", 2: "dígitos", 3: "números", 5: "ponteiro", 6: "texto"}
    ranhura = None
    marcados = []
    for tipo, indice, conteudo in els:
        f = campo(conteudo, CAMPO_AOD.get(tipo, 99))
        if not f or f["t"] != 0 or f["v"] != 1:
            continue
        n = campo(conteudo, 1)
        nome = n["v"].decode("ascii", "ignore") if n and n["t"] == 2 else "?"
        wh = medidas(bruto, tabela, corpo, nome) if nome.isdigit() else None
        marcados.append((NOMES.get(tipo, str(tipo)), nome, wh))
        if tipo == 1 and wh and min(wh) >= 200:
            ranhura = (nome, wh)
    print("  elementos: %d | marcados para o sempre ligado: %d" % (len(els), len(marcados)))
    for t, nome, wh in marcados:
        print("    %-9s %s %s" % (t, nome, ("%dx%d" % wh) if wh else ""))
    if ranhura:
        print("  ranhura do mostrador: imagem %s (%dx%d)" % (ranhura[0], ranhura[1][0], ranhura[1][1]))
    else:
        print("  SEM ranhura de mostrador no sempre ligado")
    return bool(ranhura)


if __name__ == "__main__":
    caminhos = [a for a in sys.argv[1:] if not a.startswith("--")]
    exigir = "--exigir" in sys.argv
    if not caminhos:
        raise SystemExit(__doc__)
    bem = all([ver_mascara(c) for c in caminhos])
    if exigir and not bem:
        raise SystemExit("esta base não serve: não tem ecrã sempre ligado")
