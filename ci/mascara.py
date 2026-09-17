#!/usr/bin/env python3
"""Cria uma máscara .hwt de teste do GT3 Melo a partir de uma máscara base.

Uso: mascara.py base.hwt saida.hwt "Nome"
Troca a maior imagem do watchface.bin pelo desenho do GT3 Melo, mantendo o
tamanho em bytes exatamente igual (o formato não tem tabela de tamanhos, mas
qualquer desvio partiria as imagens seguintes).
"""
import sys, io, os, math, zipfile, struct
from PIL import Image, ImageDraw, ImageFont

MARCA = bytes([0x89, 0x67, 0x45, 0x23])


def cabecalho(b):
    ver, xmllen = struct.unpack_from("<HH", b, 0)
    maplen, binlen, _ = struct.unpack_from("<III", b, 4)
    return ver, xmllen, maplen, binlen


def ler_imagens(b):
    """Usa o cabeçalho e a tabela FAT (fiável); se falhar, procura a assinatura."""
    try:
        ver, xmllen, maplen, binlen = cabecalho(b)
        corpo = 16 + xmllen + maplen + 8
        if maplen == 0 or maplen % 8 or corpo >= len(b):
            raise ValueError("cabeçalho estranho")
        lista = []
        for i in range(maplen // 8):
            off, sz = struct.unpack_from("<II", b, 16 + xmllen + i * 8)
            if sz == 0:
                continue
            ini = corpo + off - 8
            if ini + sz > len(b) or ini < corpo:
                raise ValueError("FAT fora do ficheiro")
            w = b[ini + 4] | (b[ini + 5] << 8)
            h = b[ini + 6] | (b[ini + 7] << 8)
            if not (1 <= w <= 1024 and 1 <= h <= 1024):
                raise ValueError("dimensões estranhas")
            lista.append({"inicio": ini, "dados": ini + 8, "fim": ini + sz, "w": w, "h": h})
        if lista:
            return lista
    except Exception as e:
        print("FAT ilegível (%s), a procurar a assinatura" % e)
    return procurar_imagens(b)


def procurar_imagens(b):
    s = b.find(b"\x55\x55\x55\x55")
    if s < 0:
        raise SystemExit("assinatura não encontrada")
    p = s + 8
    lista = []
    while p + 8 <= len(b) and len(lista) < 2000:
        w = b[p + 4] | (b[p + 5] << 8)
        h = b[p + 6] | (b[p + 7] << 8)
        if not (1 <= w <= 1024 and 1 <= h <= 1024):
            break
        q = p + 8
        restantes = w * h
        ok = True
        while restantes > 0:
            if q + 4 > len(b):
                ok = False
                break
            if b[q:q + 4] == MARCA:
                if q + 12 > len(b):
                    ok = False
                    break
                n = struct.unpack_from("<I", b, q + 8)[0]
                if n < 1 or n > restantes:
                    ok = False
                    break
                restantes -= n
                q += 12
            else:
                restantes -= 1
                q += 4
        if not ok:
            break
        lista.append({"inicio": p, "dados": p + 8, "fim": q, "w": w, "h": h})
        p = q
    return lista


def descodificar(b, im):
    px = bytearray(im["w"] * im["h"] * 4)
    q, o = im["dados"], 0
    while o < len(px):
        if b[q:q + 4] == MARCA:
            B, G, R, A = b[q + 4], b[q + 5], b[q + 6], b[q + 7]
            n = struct.unpack_from("<I", b, q + 8)[0]
            for _ in range(n):
                px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = A
                o += 4
            q += 12
        else:
            px[o] = b[q + 2]; px[o + 1] = b[q + 1]; px[o + 2] = b[q]; px[o + 3] = b[q + 3]
            o += 4
            q += 4
    return Image.frombytes("RGBA", (im["w"], im["h"]), bytes(px))


MARCA_U32 = struct.unpack("<I", MARCA)[0]


def codificar_exato(img, alvo):
    """img: PIL RGBA. Devolve (bytes, bits) ou None."""
    if alvo % 4:
        return None
    for bits in (8, 7, 6, 5, 4, 3, 2):
        m = 0xFF if bits >= 8 else (0xFF << (8 - bits)) & 0xFF
        dados = img.tobytes()
        tokens = []
        ant, n = -1, 0
        for i in range(0, len(dados), 4):
            A = dados[i + 3]
            if A == 0:
                cor = 0
            else:
                cor = ((dados[i + 2] & m) | ((dados[i + 1] & m) << 8) | ((dados[i] & m) << 16) | (A << 24))
            if cor == ant:
                n += 1
            else:
                if n:
                    tokens.append([ant, n])
                ant, n = cor, 1
        if n:
            tokens.append([ant, n])
        plano = []
        for cor, k in tokens:
            if cor != MARCA_U32 and 4 * k <= 12:
                plano.append([cor, 0, k])
            else:
                plano.append([cor, k, 0])
        total = sum((12 if p[1] else 0) + p[2] * 4 for p in plano)
        if total > alvo:
            continue
        falta = alvo - total
        for p in plano:
            if not falta:
                break
            if p[1] > 1 and p[0] != MARCA_U32:
                k = min(p[1] - 1, falta // 4)
                p[1] -= k; p[2] += k; falta -= 4 * k
        for p in plano:
            if falta < 8:
                break
            if not p[1] and p[2] > 0:
                p[1] = 1; p[2] -= 1; falta -= 8
        if falta == 4:
            for p in plano:
                if not p[1] and p[2] >= 2 and p[0] != MARCA_U32:
                    p[1] = 2; p[2] -= 2; falta = 0
                    break
        if falta:
            continue
        out = bytearray()
        for cor, run, soltos in plano:
            B = cor & 0xFF; G = (cor >> 8) & 0xFF; R = (cor >> 16) & 0xFF; A = (cor >> 24) & 0xFF
            if run:
                out += MARCA + bytes([B, G, R, A]) + struct.pack("<I", run)
            out += bytes([B, G, R, A]) * soltos
        if len(out) != alvo:
            continue
        return bytes(out), bits
    return None


def opacidade(img):
    dados = img.split()[3].tobytes()
    return sum(1 for v in dados if v > 0) / len(dados)


def desenho_teste(w, h):
    """Fundo de teste do GT3 Melo: preto com anel dourado, marcas e assinatura."""
    S = max(w, h)
    im = Image.new("RGBA", (S, S), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    C = S / 2
    for i in range(int(C), 0, -6):  # halo dourado suave ao centro
        t = 1 - i / C
        v = int(26 * t * t)
        d.ellipse((C - i, C - i, C + i, C + i), fill=(v + 6, v + 4, 0, 255))
    d.ellipse((6, 6, S - 6, S - 6), outline=(212, 175, 55, 255), width=max(2, S // 110))
    for i in range(60):
        a = math.radians(i * 6)
        grande = i % 5 == 0
        r1 = C - S * 0.055
        r2 = r1 - (S * 0.055 if grande else S * 0.022)
        d.line((C + r1 * math.sin(a), C - r1 * math.cos(a), C + r2 * math.sin(a), C - r2 * math.cos(a)),
               fill=(212, 175, 55, 255) if grande else (150, 150, 150, 255),
               width=max(2, int(S * (0.011 if grande else 0.005))))
    fonte = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    try:
        f1 = ImageFont.truetype(fonte, int(S * 0.055))
        f2 = ImageFont.truetype(fonte, int(S * 0.035))
    except Exception:
        f1 = f2 = ImageFont.load_default()
    d.text((C, C * 0.62), "PEDRO MELO", font=f1, fill=(240, 210, 122, 255), anchor="mm")
    d.text((C, C * 1.42), "GT3 MELO", font=f2, fill=(150, 150, 150, 255), anchor="mm")
    # o ecrã é redondo: fora do círculo fica transparente, como nas máscaras originais
    mascara = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, S - 1, S - 1), fill=255)
    im.putalpha(mascara)
    return im.resize((w, h), Image.LANCZOS).convert("RGBA")


def main():
    base, saida, nome = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "GT3 Melo teste")
    zin = zipfile.ZipFile(base)
    nomes = zin.namelist()
    interno_nome = "com.honor.watchface" if "com.honor.watchface" in nomes else "com.huawei.watchface"
    if interno_nome not in nomes:
        raise SystemExit("não é uma máscara Huawei: " + str(nomes[:10]))
    interno = zin.read(interno_nome)
    zi = None
    bin_ = interno
    try:
        zi = zipfile.ZipFile(io.BytesIO(interno))
        if "watchface.bin" in zi.namelist():
            bin_ = zi.read("watchface.bin")
        else:
            zi = None
    except Exception:
        zi = None
    imgs = ler_imagens(bin_)
    if not imgs:
        raise SystemExit("sem imagens legíveis no watchface.bin")
    alvo = max(imgs, key=lambda x: x["w"] * x["h"])
    print("imagens:", len(imgs), "| maior:", alvo["w"], "x", alvo["h"], "=", alvo["fim"] - alvo["dados"], "bytes")
    original = descodificar(bin_, alvo)
    original.save(os.path.splitext(saida)[0] + "-original.png")
    novo = desenho_teste(alvo["w"], alvo["h"])
    novo.save(os.path.splitext(saida)[0] + "-novo.png")
    cod = codificar_exato(novo, alvo["fim"] - alvo["dados"])
    if not cod:
        raise SystemExit("o desenho não cabe no espaço da base")
    dados, bits = cod
    print("codificado com", bits, "bits por cor")
    b = bytearray(bin_)
    b[alvo["dados"]:alvo["fim"]] = dados

    desc = zin.read("description.xml").decode("utf-8", "ignore") if "description.xml" in nomes else ""
    import re
    desc = re.sub(r"<title>[^<]*</title>", "<title>" + nome + "</title>", desc)
    desc = re.sub(r"<title-cn>[^<]*</title-cn>", "<title-cn>" + nome + "</title-cn>", desc)

    if zi is not None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for n in zi.namelist():
                z.writestr(n, bytes(b) if n == "watchface.bin" else zi.read(n))
        interno_novo = buf.getvalue()
    else:
        interno_novo = bytes(b)

    capa = io.BytesIO()
    novo.convert("RGB").save(capa, "JPEG", quality=90)
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        for n in nomes:
            if n.endswith("/") or n in (interno_nome, "description.xml", "preview/cover.jpg"):
                continue
            z.writestr(n, zin.read(n))
        z.writestr("description.xml", desc)
        z.writestr("preview/cover.jpg", capa.getvalue())
        z.writestr(interno_nome, interno_novo)
    print("gravado", saida, os.path.getsize(saida), "bytes")


if __name__ == "__main__":
    main()
