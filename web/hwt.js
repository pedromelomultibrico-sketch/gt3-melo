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
    // arredonda para os níveis disponíveis, em vez de cortar bits:
    // assim um cinzento escuro não vai parar todo a preto
    const niveis = (1 << bits) - 1, passo = 255 / niveis;
    const q = bits >= 8 ? (v) => v : (v) => Math.round(Math.round(v / passo) * passo);
    let ant = -1, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const A = px[i + 3];
      const R = q(px[i]), G = q(px[i + 1]), B = q(px[i + 2]);
      const cor = A === 0 ? 0 : (B | (G << 8) | (R << 16) | (A << 24)) >>> 0;
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
    let bytes = new Uint8Array(await ficheiro.arrayBuffer());
    let zip = await JSZip.loadAsync(bytes);
    // muitos sites entregam a máscara dentro de um .zip — procurar lá dentro
    if (!zip.file("com.huawei.watchface") && !zip.file("com.honor.watchface")) {
      const dentro = Object.keys(zip.files).filter((n) => /\.hwt$/i.test(n) && !zip.files[n].dir);
      if (dentro.length) {
        bytes = await zip.file(dentro[0]).async("uint8array");
        zip = await JSZip.loadAsync(bytes);
      }
    }
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
    // O ecrã sempre ligado não está no watchface.bin: quando existe, vem num
    // ficheiro próprio, aod.bin, e é DAÍ que o relógio o lê.
    let binAod = null, imgsAod = null;
    if (zipInterno && zipInterno.file("aod.bin")) {
      try {
        binAod = await zipInterno.file("aod.bin").async("uint8array");
        imgsAod = lerImagens(binAod);
      } catch (e) { binAod = null; imgsAod = null; }
    }
    const titulo = (desc.match(/<title>([^<]*)<\/title>/) || [])[1] || ficheiro.name;
    const screen = (desc.match(/<screen>([^<]*)<\/screen>/) || [])[1] || "";
    return { zip, desc, honor, nomeInterno, zipInterno, bin, imgs, binAod, imgsAod, titulo, screen, bytes, nomeFicheiro: ficheiro.name };
  }

  function opacidade(imageData) {
    const d = imageData.data;
    let op = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) op++;
    return op / (d.length / 4);
  }

  /** Quanto desenho visível tem esta imagem (0 = chapa preta ou vazia). */
  function riqueza(imageData) {
    const d = imageData.data;
    let acesos = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && d[i] + d[i + 1] + d[i + 2] > 60) acesos++;
    return acesos / (d.length / 4);
  }

  /**
   * A face como ela se vê: muitas máscaras não têm o desenho todo numa imagem só —
   * têm uma chapa (muitas vezes preta) e por cima outras imagens do tamanho do ecrã.
   * Junta todas as imagens grandes, menos a do ecrã sempre ligado, numa só.
   * Os ponteiros ficam de fora: são imagens mais pequenas e moveriam-se.
   */
  function faceComposta(pacote, excluir) {
    const grandes = pacote.imgs
      .map((im, i) => ({ im, i }))
      .filter(({ im, i }) => i !== excluir && Math.min(im.largura, im.altura) >= 400);
    if (!grandes.length) return null;
    const L = Math.max(...grandes.map(({ im }) => Math.max(im.largura, im.altura)));
    const c = document.createElement("canvas");
    c.width = c.height = L;
    const x = c.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, L, L);
    let houve = false;
    for (const { im } of grandes) {
      const d = descodificar(pacote.bin, im);
      if (riqueza(d) < 0.001) continue; // chapa vazia: não vale a pena
      const t = document.createElement("canvas");
      t.width = im.largura; t.height = im.altura;
      t.getContext("2d").putImageData(d, 0, 0);
      x.drawImage(t, (L - im.largura) / 2, (L - im.altura) / 2);
      houve = true;
    }
    return houve ? c : null;
  }

  /**
   * Escolhe a imagem a substituir: o fundo principal do mostrador.
   * As máscaras redondas têm ~78% de píxeis opacos (o círculo dentro do quadrado);
   * imagens com pouca opacidade são sobreposições do ecrã sempre ligado ou
   * pequenos desenhos — trocá-las estraga o mostrador.
   */
  function indiceFundo(pacote) {
    let melhor = -1, area = 0, houveGrande = false, chapa = -1, chapaArea = 0;
    pacote.imgs.forEach((im, i) => {
      if (Math.min(im.largura, im.altura) < 200) return;
      houveGrande = true;
      const d = descodificar(pacote.bin, im);
      const op = opacidade(d);
      im.opacidade = op;
      im.riqueza = riqueza(d);
      const a = im.largura * im.altura;
      if (op <= 0.6) return;
      // uma chapa quase toda preta não é a face: só serve se não houver melhor
      if (im.riqueza < 0.02) { if (a > chapaArea) { chapaArea = a; chapa = i; } return; }
      if (a > area) { area = a; melhor = i; }
    });
    if (melhor < 0) melhor = chapa;
    pacote.semFundo = melhor < 0 && houveGrande;
    return melhor;
  }

  /**
   * A imagem do ecrã sempre ligado: grande, mas com poucos píxeis acesos
   * (a Huawei guarda-a assim para poupar bateria). Devolve -1 se não existir.
   */
  function indiceAod(pacote, exceto) {
    let melhor = -1, area = 0;
    pacote.imgs.forEach((im, i) => {
      if (i === exceto || Math.min(im.largura, im.altura) < 200) return;
      if (im.opacidade === undefined) im.opacidade = opacidade(descodificar(pacote.bin, im));
      const a = im.largura * im.altura;
      if (im.opacidade <= 0.6 && a > area) { area = a; melhor = i; }
    });
    return melhor;
  }

  /**
   * Onde escrever o ecrã sempre ligado. Se a máscara trouxer aod.bin, é lá —
   * escrever no watchface.bin não tem efeito nenhum no pulso.
   */
  function alvoAod(pacote) {
    if (pacote.imgsAod && pacote.imgsAod.length) {
      let melhor = -1, area = 0;
      pacote.imgsAod.forEach((im, i) => {
        const a = im.largura * im.altura;
        if (Math.min(im.largura, im.altura) >= 200 && a > area) { area = a; melhor = i; }
      });
      if (melhor >= 0) return { onde: "aod", indice: melhor, im: pacote.imgsAod[melhor] };
    }
    const f = indiceFundo(pacote);
    const i = f >= 0 ? indiceAod(pacote, f) : -1;
    return i >= 0 ? { onde: "wf", indice: i, im: pacote.imgs[i] } : null;
  }

  /** Troca uma ou mais imagens pelos desenhos dados e devolve o .hwt novo (Uint8Array). */
  async function construir(pacote, indice, canvasFonte, nome, capa) {
    const trocas = Array.isArray(indice) ? indice : [{ indice, canvas: canvasFonte }];
    const bin = new Uint8Array(pacote.bin);
    const binAod = pacote.binAod ? new Uint8Array(pacote.binAod) : null;
    let bitsMin = 8;
    for (const t of trocas) {
      const noAod = t.onde === "aod" && binAod;
      const lista = noAod ? pacote.imgsAod : pacote.imgs;
      const r = trocarImagemEm(noAod ? binAod : bin, lista[t.indice], t.canvas, t.transparente);
      (noAod ? binAod : bin).set(r.bytes, lista[t.indice].dados);
      bitsMin = Math.min(bitsMin, r.bits);
    }
    return empacotar(pacote, bin, nome, capa, bitsMin, binAod);
  }

  /**
   * Prepara o desenho como ele vai ficar dentro do ficheiro: recortado em círculo,
   * sobre fundo preto. Serve também para medir se cabe, antes de montar tudo.
   */
  function prepararDesenho(canvasFonte, largura, altura, transparente) {
    const c = document.createElement("canvas");
    c.width = largura; c.height = altura;
    const ctx = c.getContext("2d");
    ctx.save();
    ctx.beginPath();
    ctx.arc(largura / 2, altura / 2, Math.min(largura, altura) / 2, 0, Math.PI * 2);
    ctx.clip();
    // o ecrã sempre ligado guarda-se com o resto transparente (mais leve e
    // deixa ver as camadas por baixo); o mostrador normal leva fundo preto
    if (!transparente) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, largura, altura); }
    ctx.drawImage(canvasFonte, 0, 0, largura, altura);
    ctx.restore();
    return ctx.getImageData(0, 0, largura, altura).data;
  }

  /** Codifica um desenho para caber, byte a byte, no espaço da imagem indicada. */
  function trocarImagem(pacote, indice, canvasFonte, transparente) {
    return trocarImagemEm(pacote.bin, pacote.imgs[indice], canvasFonte, transparente);
  }

  function trocarImagemEm(bin, im, canvasFonte, transparente) {
    const px = prepararDesenho(canvasFonte, im.largura, im.altura, transparente);
    const alvo = im.fim - im.dados;
    const cod = codificarExato(px, alvo);
    if (!cod) throw new Error("o desenho tem demasiado detalhe para caber no espaço desta base (" + Math.round(alvo / 1024) + " KB). Use uma base com fundo em fotografia ou simplifique o fundo.");
    return cod;
  }

  /** Volta a montar o ficheiro .hwt com o binário já alterado. */
  async function empacotar(pacote, bin, nome, capa, bits, binAod) {
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
        if (f.dir) { zi.folder(nomeF); continue; }
        if (nomeF === "watchface.bin") zi.file(nomeF, bin);
        else if (nomeF === "aod.bin" && binAod) zi.file(nomeF, binAod);
        else zi.file(nomeF, await f.async("uint8array"));
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
    return { bytes, bits };
  }

  function paraBase64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  window.HWT = { abrir, lerImagens, descodificar, paraDataURL, indiceFundo, indiceAod, construir, codificarExato, paraBase64, opacidade, riqueza, faceComposta, alvoAod, prepararDesenho };
})();
