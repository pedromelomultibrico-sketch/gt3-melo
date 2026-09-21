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
          lista.push({ inicio: ini, dados: ini + 8, fim: ini + sz, largura: w, altura: h, pos: i });
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
    // O aod.bin, quando existe, é herança: o relógio desenha o ecrã sempre
    // ligado a partir dos elementos marcados do próprio watchface.bin.
    // Lê-se só para poder mostrar o que lá está; não se escreve nele.
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
    const maior = Math.max(...pacote.imgs.map((im) => Math.max(im.largura, im.altura)));
    const grandes = pacote.imgs
      .map((im, i) => ({ im, i }))
      // chapas e desenhos do tamanho do ecrã; os ponteiros são translúcidos e ficam de fora
      .filter(({ im, i }) => i !== excluir && Math.min(im.largura, im.altura) >= maior * 0.75
        && (im.opacidade === undefined || im.opacidade >= 0.25));
    if (!grandes.length) return null;
    const L = maior;
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

  // ---- formato interno das máscaras (protobuf, não XML) ----
  // Cada elemento do mostrador é { 1: índice, 2: tipo, (3+tipo): conteúdo }.
  // Dentro do conteúdo há um campo que diz "este elemento aparece no ecrã
  // sempre ligado". O número desse campo muda com o tipo — imagens 5,
  // dígitos 6, valores 13, ponteiros 9, anéis 12. Verificado no relógio.
  const CAMPO_AOD = { 1: 5, 2: 6, 3: 13, 5: 9, 6: 6, 7: 12 };

  function lerVarint(b, i) {
    let v = 0, mul = 1;
    const ini = i;
    for (;;) {
      if (i >= b.length) throw new Error("varint cortado");
      const c = b[i++];
      v += (c & 0x7f) * mul; mul *= 128;
      if (!(c & 0x80)) break;
      if (i - ini > 10) throw new Error("varint comprido demais");
    }
    return { v, i, crua: b.subarray(ini, i) };
  }

  function escreverVarint(n) {
    const o = [];
    while (n > 127) { o.push((n % 128) | 0x80); n = Math.floor(n / 128); }
    o.push(n);
    return o;
  }

  function pbLer(b) {
    const itens = [];
    let i = 0;
    while (i < b.length) {
      const k = lerVarint(b, i); i = k.i;
      const c = Math.floor(k.v / 8), t = k.v % 8;
      if (!c) throw new Error("campo 0");
      if (t === 0) { const r = lerVarint(b, i); itens.push({ c, t, v: r.v, crua: r.crua }); i = r.i; }
      else if (t === 2) {
        const r = lerVarint(b, i); i = r.i;
        if (i + r.v > b.length) throw new Error("comprimento fora do fim");
        itens.push({ c, t, v: b.subarray(i, i + r.v) }); i += r.v;
      } else if (t === 1) { if (i + 8 > b.length) throw new Error("fixo64 cortado"); itens.push({ c, t, v: b.subarray(i, i + 8) }); i += 8; }
      else if (t === 5) { if (i + 4 > b.length) throw new Error("fixo32 cortado"); itens.push({ c, t, v: b.subarray(i, i + 4) }); i += 4; }
      else throw new Error("tipo " + t);
    }
    return itens;
  }

  /**
   * Lê tudo em árvore. Se um pedaço de texto for lido por engano como
   * mensagem não faz mal nenhum: escrever de volta devolve os mesmos bytes,
   * porque os varints são guardados tal como vieram.
   */
  function pbArvore(b, fundura) {
    const itens = pbLer(b);
    if ((fundura || 0) < 12) {
      for (const it of itens) {
        if (it.t !== 2 || !it.v.length) continue;
        try { it.filhos = pbArvore(it.v, (fundura || 0) + 1); } catch (e) { /* é folha */ }
      }
    }
    return itens;
  }

  function pbBytes(itens) {
    const pedacos = [];
    let total = 0;
    const junta = (a) => { pedacos.push(a); total += a.length; };
    for (const it of itens) {
      junta(Uint8Array.from(escreverVarint(it.c * 8 + it.t)));
      if (it.t === 0) junta(it.crua || Uint8Array.from(escreverVarint(it.v)));
      else if (it.t === 2) {
        const v = it.filhos ? pbBytes(it.filhos) : it.v;
        junta(Uint8Array.from(escreverVarint(v.length)));
        junta(v);
      } else junta(it.v);
    }
    const saida = new Uint8Array(total);
    let o = 0;
    for (const p of pedacos) { saida.set(p, o); o += p.length; }
    return saida;
  }

  function pbCampo(itens, c) { return itens.find((x) => x.c === c); }
  function pbTexto(it) { let s = ""; for (const c of it.v) s += String.fromCharCode(c); return s; }
  function pbNumero(c, v) { return { c, t: 0, v, crua: Uint8Array.from(escreverVarint(v)) }; }
  function pbCadeia(c, s) { const v = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) v[i] = s.charCodeAt(i); return { c, t: 2, v }; }

  /**
   * Chama visita() em cada elemento do mostrador. Dá a lista onde ele vive,
   * para se poderem acrescentar irmãos (é assim que se marcam os ponteiros).
   */
  function varrerElementos(itens, visita) {
    for (const it of itens) {
      if (!it.filhos) continue;
      const i1 = pbCampo(it.filhos, 1), i2 = pbCampo(it.filhos, 2);
      if (i1 && i1.t === 0 && i2 && i2.t === 0 && i2.v >= 1 && i2.v <= 8) {
        const cc = pbCampo(it.filhos, 3 + i2.v);
        if (cc && cc.filhos) {
          visita({ item: it, indice: i1.v, tipo: i2.v, conteudo: cc.filhos, lista: itens });
          continue;
        }
      }
      varrerElementos(it.filhos, visita);
    }
  }

  // ---- partes do .bin e remontagem ----

  /** Parte o .bin nas suas peças: cabeçalho, desenho e blocos de imagem. */
  function partes(bin) {
    const xmllen = u16(bin, 2), maplen = u32(bin, 4);
    const corpo = 16 + xmllen + maplen + 8;
    if (maplen % 8 || corpo > bin.length) throw new Error("cabeçalho estranho");
    const blocos = [];
    for (let i = 0; i < maplen / 8; i++) {
      const off = u32(bin, 16 + xmllen + i * 8), sz = u32(bin, 16 + xmllen + i * 8 + 4);
      blocos.push(sz ? bin.subarray(corpo + off - 8, corpo + off - 8 + sz) : new Uint8Array(0));
    }
    return { ver: u16(bin, 0), extra: u32(bin, 12), xml: bin.subarray(16, 16 + xmllen), blocos, assinatura: bin.subarray(corpo - 8, corpo) };
  }

  /**
   * Volta a juntar tudo, refazendo a tabela das imagens. É isto que liberta
   * os desenhos do tamanho em bytes do original: cada imagem pode crescer.
   */
  function montar(p) {
    const maplen = p.blocos.length * 8;
    let corpoLen = 8;
    for (const b of p.blocos) corpoLen += b.length;
    const saida = new Uint8Array(16 + p.xml.length + maplen + corpoLen);
    const dv = new DataView(saida.buffer);
    dv.setUint16(0, p.ver, true);
    dv.setUint16(2, p.xml.length, true);
    dv.setUint32(4, maplen, true);
    dv.setUint32(8, corpoLen, true);
    dv.setUint32(12, p.extra || 0, true);
    saida.set(p.xml, 16);
    let o = 16 + p.xml.length, off = 8;
    for (const b of p.blocos) { dv.setUint32(o, off, true); dv.setUint32(o + 4, b.length, true); o += 8; off += b.length; }
    saida.set(p.assinatura, o); o += 8;
    for (const b of p.blocos) { saida.set(b, o); o += b.length; }
    return saida;
  }

  /** Codifica os píxeis sem limite de tamanho, com as 8 cabeças de cabeçalho. */
  function codificarLivre(px, largura, altura, marca) {
    const tok = tokens(px, 8);
    let n = 8;
    for (const t of tok) n += (t.n * 4 > 12 || t.cor === MARCA_U32) ? 12 : t.n * 4;
    const saida = new Uint8Array(n);
    saida.set(marca || [0x45, 0x23, 0x88, 0x88], 0);
    saida[4] = largura & 255; saida[5] = largura >> 8;
    saida[6] = altura & 255; saida[7] = altura >> 8;
    let o = 8;
    for (const t of tok) {
      const B = t.cor & 255, G = (t.cor >> 8) & 255, R = (t.cor >> 16) & 255, A = (t.cor >>> 24) & 255;
      if (t.n * 4 > 12 || t.cor === MARCA_U32) {
        saida.set(MARCA, o); saida[o + 4] = B; saida[o + 5] = G; saida[o + 6] = R; saida[o + 7] = A;
        saida[o + 8] = t.n & 255; saida[o + 9] = (t.n >> 8) & 255; saida[o + 10] = (t.n >> 16) & 255; saida[o + 11] = (t.n >>> 24) & 255;
        o += 12;
      } else {
        for (let k = 0; k < t.n; k++) { saida[o] = B; saida[o + 1] = G; saida[o + 2] = R; saida[o + 3] = A; o += 4; }
      }
    }
    return saida;
  }

  // ---- ecrã sempre ligado ----

  function imgPorNome(pacote, nome) {
    const pos = parseInt(nome, 10) - 1;
    return pacote.imgs.find((im) => im.pos === pos) || null;
  }

  /** O lado do ecrã desta máscara (a maior imagem manda). */
  function ladoEcra(pacote) {
    let l = 0;
    for (const im of pacote.imgs) l = Math.max(l, im.largura, im.altura);
    return l || 466;
  }

  /**
   * A face como o relógio a pinta: só as chapas que o desenho da máscara manda
   * desenhar, pela ordem dele. Deixa de fora a imagem de pré-visualização —
   * muitas máscaras trazem-na com os ponteiros já pintados, parados na posição
   * de fábrica — e deixa de fora a chapa do sempre ligado.
   */
  function faceDoDesenho(pacote) {
    let arv;
    try { arv = pbArvore(partes(pacote.bin).xml); } catch (e) { return null; }
    const L = ladoEcra(pacote);
    const chapas = [];
    varrerElementos(arv, (e) => {
      if (e.tipo !== 1) return;
      const f = pbCampo(e.conteudo, CAMPO_AOD[1]);
      if (f && f.t === 0 && f.v === 1) return;   // essa é a do sempre ligado
      const n = pbCampo(e.conteudo, 1);
      if (!n || n.t !== 2) return;
      const im = imgPorNome(pacote, pbTexto(n));
      if (!im || Math.min(im.largura, im.altura) < L * 0.6) return;
      const p2 = pbCampo(e.conteudo, 2);
      let x = 0, y = 0;
      if (p2 && p2.filhos) {
        x = (pbCampo(p2.filhos, 1) || {}).v || 0;
        y = (pbCampo(p2.filhos, 2) || {}).v || 0;
        if (x > L || y > L) { x = 0; y = 0; }
      }
      chapas.push({ im, x, y });
    });
    if (!chapas.length) return null;
    const c = document.createElement("canvas");
    c.width = c.height = L;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, L, L);
    for (const ch of chapas) {
      const t2 = document.createElement("canvas");
      t2.width = ch.im.largura; t2.height = ch.im.altura;
      t2.getContext("2d").putImageData(descodificar(pacote.bin, ch.im), 0, 0);
      ctx.drawImage(t2, ch.x, ch.y);
    }
    return c;
  }

  // Quem é quem, pelo número da fonte de dados: 150 horas, 153 minutos,
  // 154 segundos. Os segundos nunca vão para o sempre ligado.
  const FONTE_HORA = 150, FONTE_MINUTO = 153, FONTE_SEGUNDO = 154;

  /**
   * A imagem que o relógio mostra quando o ecrã está sempre ligado: é a que
   * está marcada no desenho da máscara. Devolve -1 se a máscara não tiver.
   */
  function ranhuraAod(pacote) {
    const L = ladoEcra(pacote);
    let melhor = -1, area = 0;
    try {
      varrerElementos(pbArvore(partes(pacote.bin).xml), (e) => {
        if (e.tipo !== 1) return;
        const f = pbCampo(e.conteudo, CAMPO_AOD[1]), n = pbCampo(e.conteudo, 1);
        if (!f || f.t !== 0 || f.v !== 1 || !n || n.t !== 2) return;
        const im = imgPorNome(pacote, pbTexto(n));
        // algumas máscaras marcam letreiros e dois-pontos: só serve a chapa
        // do tamanho do ecrã, que é onde cabe o mostrador
        if (!im || Math.min(im.largura, im.altura) < L * 0.6) return;
        const a = im.largura * im.altura;
        if (a > area) { area = a; melhor = pacote.imgs.indexOf(im); }
      });
    } catch (err) { return -1; }
    return melhor;
  }

  function escurecerPixeis(d, fator, base) {
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      d[i] = Math.min(255, d[i] * fator + base);
      d[i + 1] = Math.min(255, d[i + 1] * fator + base);
      d[i + 2] = Math.min(255, d[i + 2] * fator + base);
    }
    return d;
  }

  /**
   * Se a máscara não tiver ranhura de sempre ligado, cria uma: uma imagem do
   * tamanho do ecrã e um elemento marcado, posto por baixo de tudo o resto.
   */
  function criarRanhuraAod(pacote, p, arv) {
    let destino = null;
    varrerElementos(arv, (e) => { if (!destino) destino = { lista: e.lista, campo: e.item.c, indice: e.indice }; });
    if (!destino) return -1;
    const L = ladoEcra(pacote);
    const vazio = new Uint8ClampedArray(L * L * 4);
    p.blocos.push(codificarLivre(vazio, L, L, pacote.bin.subarray(pacote.imgs[0].inicio, pacote.imgs[0].inicio + 4)));
    const nome = ("00" + p.blocos.length).slice(-3);
    const conteudo = [pbCadeia(1, nome), { c: 2, t: 2, filhos: [pbNumero(1, 0), pbNumero(2, 0)] }, pbNumero(CAMPO_AOD[1], 1)];
    destino.lista.unshift({ c: destino.campo, t: 2, filhos: [pbNumero(1, 0), pbNumero(2, 1), { c: 4, t: 2, filhos: conteudo }] });
    return p.blocos.length - 1;
  }

  /**
   * Acrescenta ponteiros de hora e minuto ao ecrã sempre ligado, com cópias
   * escurecidas dos ponteiros da própria máscara. O ponteiro dos segundos
   * fica de fora de propósito: gastaria bateria e marcaria o ecrã.
   */
  function ponteirosAod(pacote, p, arv) {
    const maos = [];
    let jaMarcado = false;
    varrerElementos(arv, (e) => {
      if (e.tipo !== 5) return;
      const fa = pbCampo(e.conteudo, CAMPO_AOD[5]);
      if (fa && fa.t === 0 && fa.v === 1) { jaMarcado = true; return; }
      const n = pbCampo(e.conteudo, 1), r = pbCampo(e.conteudo, 2), f = pbCampo(e.conteudo, 6);
      if (!n || n.t !== 2 || !r || !r.filhos || !f || f.t !== 0) return;
      const im = imgPorNome(pacote, pbTexto(n));
      if (!im) return;
      const larg = (pbCampo(r.filhos, 3) || {}).v || 0;
      maos.push({ e, im, fonte: f.v, larguraRect: larg });
    });
    if (jaMarcado || !maos.length) return 0;
    const L = ladoEcra(pacote);
    const bons = maos.filter((m) => {
      if (m.fonte === FONTE_SEGUNDO) return false;
      if (m.fonte === FONTE_HORA || m.fonte === FONTE_MINUTO) return true;
      // fonte desconhecida: pela forma — fora os finos (segundos) e os pequenos
      const fino = Math.min(m.im.largura, m.im.altura) / Math.max(m.im.largura, m.im.altura);
      return fino >= 0.25 && m.larguraRect >= L * 0.6;
    });
    const porFonte = [];
    for (const m of bons) if (!porFonte.some((x) => x.fonte === m.fonte)) porFonte.push(m);
    const peso = (f) => (f === FONTE_HORA ? 0 : f === FONTE_MINUTO ? 1 : 2);
    const escolhidos = porFonte.sort((a, b) => peso(a.fonte) - peso(b.fonte)).slice(0, 2);
    let indice = 0;
    varrerElementos(arv, (e) => { indice = Math.max(indice, e.indice); });
    for (const m of escolhidos) {
      const d = descodificar(pacote.bin, m.im);
      escurecerPixeis(d.data, 0.6, 40);
      p.blocos.push(codificarLivre(d.data, m.im.largura, m.im.altura, pacote.bin.subarray(m.im.inicio, m.im.inicio + 4)));
      const nome = ("00" + p.blocos.length).slice(-3);
      const conteudo = m.e.conteudo.filter((x) => x.c !== CAMPO_AOD[5]).map((x) => (x.c === 1 ? pbCadeia(1, nome) : x));
      conteudo.push(pbNumero(CAMPO_AOD[5], 1));
      m.e.lista.push({ c: m.e.item.c, t: 2, filhos: [pbNumero(1, ++indice), pbNumero(2, 5), { c: 8, t: 2, filhos: conteudo }] });
    }
    return escolhidos.length;
  }

  /**
   * Onde escrever o ecrã sempre ligado: na ranhura marcada pela própria
   * máscara. Se não houver, avisa que é preciso criar uma.
   */
  function alvoAod(pacote) {
    const r = ranhuraAod(pacote);
    if (r >= 0) return { onde: "wf", indice: r, im: pacote.imgs[r] };
    // sem ranhura, abre-se uma — mas só se a máscara for do formato novo,
    // o único em que se pode marcar o que aparece no sempre ligado
    let tem = false;
    try { varrerElementos(pbArvore(partes(pacote.bin).xml), () => { tem = true; }); } catch (e) { return null; }
    if (!tem) return null;
    const L = ladoEcra(pacote);
    return { onde: "novo", indice: -1, im: { largura: L, altura: L } };
  }

  /**
   * Troca uma ou mais imagens pelos desenhos dados e devolve o .hwt novo.
   * A tabela das imagens é refeita, por isso um desenho já não tem de caber
   * nos bytes exatos do original: sai sempre com a qualidade toda.
   */
  async function construir(pacote, indice, canvasFonte, nome, capa, opcoes) {
    const trocas = Array.isArray(indice) ? indice : [{ indice, canvas: canvasFonte }];
    const o = opcoes || {};
    const p = partes(pacote.bin);
    const arv = pbArvore(p.xml);
    let mexeuNoDesenho = false;
    for (const t of trocas) {
      let im = t.indice >= 0 ? pacote.imgs[t.indice] : null;
      if (!im && t.onde === "novo") {
        const novoPos = criarRanhuraAod(pacote, p, arv);
        if (novoPos < 0) continue;
        mexeuNoDesenho = true;
        const L = ladoEcra(pacote);
        p.blocos[novoPos] = codificarLivre(prepararDesenho(t.canvas, L, L, t.transparente), L, L, marcaDe(pacote));
        continue;
      }
      if (!im) continue;
      const px = prepararDesenho(t.canvas, im.largura, im.altura, t.transparente);
      p.blocos[im.pos] = codificarLivre(px, im.largura, im.altura, pacote.bin.subarray(im.inicio, im.inicio + 4));
    }
    if (o.ponteirosAod && ponteirosAod(pacote, p, arv)) mexeuNoDesenho = true;
    if (mexeuNoDesenho) p.xml = pbBytes(arv);
    return empacotar(pacote, montar(p), nome, capa, 8);
  }

  function marcaDe(pacote) {
    const i = pacote.imgs[0];
    return i ? pacote.bin.subarray(i.inicio, i.inicio + 4) : null;
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
  async function empacotar(pacote, bin, nome, capa, bits) {
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

  window.HWT = { abrir, lerImagens, descodificar, paraDataURL, indiceFundo, indiceAod, construir, codificarExato, codificarLivre, paraBase64, opacidade, riqueza, faceComposta, faceDoDesenho, alvoAod, ranhuraAod, ponteirosAod, criarRanhuraAod, ladoEcra, prepararDesenho, partes, montar, pbArvore, pbBytes, varrerElementos };
})();
