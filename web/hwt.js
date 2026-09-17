// Leitura e reescrita de máscaras Huawei (.hwt).
// .hwt = zip com description.xml, preview/cover.jpg e com.huawei.watchface
// (outro zip com watchface.bin, ou o próprio .bin). No .bin, depois da
// assinatura 55 55 55 55 + 4 bytes, vêm as imagens seguidas:
// cabeçalho(4) largura(2 LE) altura(2 LE) e píxeis BGRA, com compressão:
// marcador 89 67 45 23 + cor BGRA + contagem (4 LE) = cor repetida N vezes.
(function () {
  const MARCA = [0x89, 0x67, 0x45, 0x23];

  function acharAssinatura(b) {
    for (let i = 0; i + 3 < b.length; i++) if (b[i] === 0x55 && b[i + 1] === 0x55 && b[i + 2] === 0x55 && b[i + 3] === 0x55) return i;
    return -1;
  }

  function u16(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }

  /** Lê as imagens pelo cabeçalho e pela tabela FAT; se falhar, procura a assinatura. */
  function lerImagens(b) {
    try {
      const xmllen = u16(b, 2), maplen = u32(b, 4);
      const corpo = 16 + xmllen + maplen + 8;
      if (maplen > 0 && maplen % 8 === 0 && corpo < b.length) {
        const lista = [];
        for (let i = 0; i < maplen / 8; i++) {
          const off = u32(b, 16 + xmllen + i * 8), sz = u32(b, 16 + xmllen + i * 8 + 4);
          if (!sz) continue;
          const ini = corpo + off - 8;
          if (ini < corpo || ini + sz > b.length) throw new Error("FAT fora do ficheiro");
          const w = u16(b, ini + 4), h = u16(b, ini + 6);
          if (w < 1 || h < 1 || w > 1024 || h > 1024) throw new Error("dimensões estranhas");
          lista.push({ inicio: ini, dados: ini + 8, fim: ini + sz, largura: w, altura: h });
        }
        if (lista.length) return lista;
      }
    } catch (e) { /* segue para a procura */ }
    return procurarImagens(b);
  }

  /** Alternativa: procura a assinatura 0x55555555 e lê as imagens seguidas. */
  function procurarImagens(b) {
    const s = acharAssinatura(b);
    if (s < 0) throw new Error("assinatura 0x55555555 não encontrada");
    let p = s + 8;
    const lista = [];
    while (p + 8 <= b.length && lista.length < 2000) {
      const w = b[p + 4] | (b[p + 5] << 8), h = b[p + 6] | (b[p + 7] << 8);
      if (w < 1 || h < 1 || w > 1024 || h > 1024) break;
      let q = p + 8, restantes = w * h, ok = true;
      while (restantes > 0) {
        if (q + 4 > b.length) { ok = false; break; }
        if (b[q] === MARCA[0] && b[q + 1] === MARCA[1] && b[q + 2] === MARCA[2] && b[q + 3] === MARCA[3]) {
          if (q + 12 > b.length) { ok = false; break; }
          const n = (b[q + 8] | (b[q + 9] << 8) | (b[q + 10] << 16) | (b[q + 11] << 24)) >>> 0;
          if (n < 1 || n > restantes) { ok = false; break; }
          restantes -= n; q += 12;
        } else { restantes -= 1; q += 4; }
      }
      if (!ok) break;
      lista.push({ inicio: p, dados: p + 8, fim: q, largura: w, altura: h });
      p = q;
    }
    return lista;
  }

  function descodificar(b, img) {
    const px = new Uint8ClampedArray(img.largura * img.altura * 4);
    let q = img.dados, o = 0;
    while (o < px.length) {
      if (b[q] === MARCA[0] && b[q + 1] === MARCA[1] && b[q + 2] === MARCA[2] && b[q + 3] === MARCA[3]) {
        const B = b[q + 4], G = b[q + 5], R = b[q + 6], A = b[q + 7];
        const n = (b[q + 8] | (b[q + 9] << 8) | (b[q + 10] << 16) | (b[q + 11] << 24)) >>> 0;
        for (let k = 0; k < n; k++) { px[o++] = R; px[o++] = G; px[o++] = B; px[o++] = A; }
        q += 12;
      } else {
        px[o++] = b[q + 2]; px[o++] = b[q + 1]; px[o++] = b[q]; px[o++] = b[q + 3]; q += 4;
      }
    }
    return new ImageData(px, img.largura, img.altura);
  }

  function paraDataURL(imageData) {
    const c = document.createElement("canvas");
    c.width = imageData.width; c.height = imageData.height;
    c.getContext("2d").putImageData(imageData, 0, 0);
    return c.toDataURL("image/png");
  }

  // ---- codificação com tamanho exato ----
  // Tokens: {cor(uint32 BGRA), n}. Custo: n===1 e cor != marcador -> 4 bytes; senão 12.
  function tokens(px, bits) {
    const t = [];
    const m = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    let ant = -1, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const R = px[i] & m, G = px[i + 1] & m, B = px[i + 2] & m, A = 255;
      const cor = (B | (G << 8) | (R << 16) | (A << 24)) >>> 0;
      if (cor === ant) n++;
      else { if (n) t.push({ cor: ant, n }); ant = cor; n = 1; }
    }
    if (n) t.push({ cor: ant, n });
    return t;
  }
  const MARCA_U32 = (MARCA[0] | (MARCA[1] << 8) | (MARCA[2] << 16) | (MARCA[3] << 24)) >>> 0;
  function custoMin(tok) {
    // run de n: min(12, 4n) — mas cor = marcador obriga a run
    if (tok.cor === MARCA_U32) return 12;
    return Math.min(12, 4 * tok.n);
  }

  /** Codifica os píxeis RGBA para exatamente `alvo` bytes. Devolve Uint8Array ou null. */
  function codificarExato(px, alvo) {
    if (alvo % 4 !== 0) return null;
    for (const bits of [8, 7, 6, 5, 4, 3, 2]) {
      const tok = tokens(px, bits);
      // plano: cada token vira [run n'] + [k píxeis soltos], ou só soltos
      const plano = tok.map((t) => {
        const soltos = t.cor !== MARCA_U32 && 4 * t.n <= 12;
        return soltos ? { cor: t.cor, run: 0, soltos: t.n } : { cor: t.cor, run: t.n, soltos: 0 };
      });
      let total = plano.reduce((s, p) => s + (p.run ? 12 : 0) + p.soltos * 4, 0);
      if (total > alvo) continue;
      let falta = alvo - total;
      // 1) tirar píxeis das runs para soltos: +4 cada (run mantém-se >= 1)
      for (const p of plano) {
        if (!falta) break;
        if (p.run > 1 && p.cor !== MARCA_U32) {
          const k = Math.min(p.run - 1, falta / 4);
          p.run -= k; p.soltos += k; falta -= 4 * k;
        }
      }
      // 2) transformar solto em run de 1: +8 cada
      for (const p of plano) {
        if (falta < 8) break;
        if (!p.run && p.soltos > 0) { p.run = 1; p.soltos -= 1; falta -= 8; }
      }
      // 3) acerto de 4 bytes: 2 soltos da mesma cor -> run de 2 (+4)
      if (falta === 4) {
        const p = plano.find((x) => !x.run && x.soltos >= 2 && x.cor !== MARCA_U32);
        if (p) { p.run = 2; p.soltos -= 2; falta = 0; }
      }
      if (falta !== 0) continue;
      const out = new Uint8Array(alvo);
      let o = 0;
      for (const p of plano) {
        const B = p.cor & 0xff, G = (p.cor >>> 8) & 0xff, R = (p.cor >>> 16) & 0xff, A = (p.cor >>> 24) & 0xff;
        if (p.run) {
          out.set(MARCA, o); out[o + 4] = B; out[o + 5] = G; out[o + 6] = R; out[o + 7] = A;
          out[o + 8] = p.run & 0xff; out[o + 9] = (p.run >>> 8) & 0xff; out[o + 10] = (p.run >>> 16) & 0xff; out[o + 11] = (p.run >>> 24) & 0xff;
          o += 12;
        }
        for (let k = 0; k < p.soltos; k++) { out[o] = B; out[o + 1] = G; out[o + 2] = R; out[o + 3] = A; o += 4; }
      }
      if (o !== alvo) continue;
      return { bytes: out, bits };
    }
    return null;
  }

  async function abrir(ficheiro) {
    const bytes = new Uint8Array(await ficheiro.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    const desc = zip.file("description.xml") ? await zip.file("description.xml").async("string") : "";
    const honor = /<HnTheme/.test(desc);
    const nomeInterno = honor ? "com.honor.watchface" : "com.huawei.watchface";
    const interno = zip.file(nomeInterno);
    if (!interno) throw new Error("não é uma máscara Huawei (.hwt): falta " + nomeInterno);
    const internoBytes = await interno.async("uint8array");
    let zipInterno = null, bin = internoBytes;
    try {
      zipInterno = await JSZip.loadAsync(internoBytes);
      const f = zipInterno.file("watchface.bin");
      if (f) bin = await f.async("uint8array"); else zipInterno = null;
    } catch (e) { zipInterno = null; }
    const imgs = lerImagens(bin);
    const titulo = (desc.match(/<title>([^<]*)<\/title>/) || [])[1] || ficheiro.name;
    const screen = (desc.match(/<screen>([^<]*)<\/screen>/) || [])[1] || "";
    return { zip, desc, honor, nomeInterno, zipInterno, bin, imgs, titulo, screen, nomeFicheiro: ficheiro.name };
  }

  function indiceFundo(pacote) {
    let melhor = -1, area = 0;
    pacote.imgs.forEach((im, i) => { const a = im.largura * im.altura; if (a > area) { area = a; melhor = i; } });
    return melhor;
  }

  /** Troca a imagem `indice` pelo conteúdo do canvas e devolve o .hwt novo (Uint8Array). */
  async function construir(pacote, indice, canvasFonte, nome, capa) {
    const im = pacote.imgs[indice];
    const c = document.createElement("canvas");
    c.width = im.largura; c.height = im.altura;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvasFonte, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const alvo = im.fim - im.dados;
    const cod = codificarExato(px, alvo);
    if (!cod) throw new Error("o desenho tem demasiado detalhe para caber no espaço desta base (" + Math.round(alvo / 1024) + " KB). Use uma base com fundo em fotografia ou simplifique o fundo.");
    const bin = new Uint8Array(pacote.bin);
    bin.set(cod.bytes, im.dados);

    const saida = new JSZip();
    for (const nomeF of Object.keys(pacote.zip.files)) {
      const f = pacote.zip.files[nomeF];
      if (f.dir || nomeF === pacote.nomeInterno || nomeF === "preview/cover.jpg" || nomeF === "description.xml") continue;
      saida.file(nomeF, await f.async("uint8array"));
    }
    let interno = bin;
    if (pacote.zipInterno) {
      const zi = new JSZip();
      for (const nomeF of Object.keys(pacote.zipInterno.files)) {
        const f = pacote.zipInterno.files[nomeF];
        if (f.dir) continue;
        zi.file(nomeF, nomeF === "watchface.bin" ? bin : await f.async("uint8array"));
      }
      interno = await zi.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    }
    saida.file(pacote.nomeInterno, interno);
    const limpo = (nome || "GT3 Melo").replace(/[<>&]/g, "");
    let desc = pacote.desc.replace(/<title>[^<]*<\/title>/, "<title>" + limpo + "</title>").replace(/<title-cn>[^<]*<\/title-cn>/, "<title-cn>" + limpo + "</title-cn>");
    saida.file("description.xml", desc);
    if (capa) {
      const b64 = capa.split(",")[1];
      saida.file("preview/cover.jpg", b64, { base64: true });
    }
    const bytes = await saida.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return { bytes, bits: cod.bits };
  }

  function paraBase64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  window.HWT = { abrir, lerImagens, descodificar, paraDataURL, indiceFundo, construir, codificarExato, paraBase64 };
})();
