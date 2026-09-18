// Estúdio de Máscaras — modelo de dados e desenho no canvas (466×466).
(function () {
  const T = 466, C = T / 2;
  const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const DINAMICAS = ["hora", "minutos_ponteiros", "data", "dia_semana", "bateria", "autonomia", "passos", "batimentos"];
  const NOMES = { hora: "Hora digital", minutos_ponteiros: "Ponteiros", data: "Data", dia_semana: "Dia da semana", bateria: "Bateria", autonomia: "Autonomia (horas que faltam)", passos: "Passos", batimentos: "Batimentos", texto: "Texto", anel: "Anel", marcas: "Marcas das horas" };

  const imagens = {}; // cache de imagens de fundo (dataURL -> Image)
  function imagem(src, aoCarregar) {
    if (!src) return null;
    if (imagens[src]) return imagens[src].complete ? imagens[src] : null;
    const im = new Image();
    im.onload = () => aoCarregar && aoCarregar();
    im.src = src;
    imagens[src] = im;
    return null;
  }

  function camadaPadrao(tipo) {
    const base = { id: Math.random().toString(36).slice(2, 9), tipo, x: C, y: C, tamanho: 60, cor: "#ffffff", fonte: "Inter", peso: 600, texto: "", espessura: 4, estilo: "digital" };
    switch (tipo) {
      case "hora": return { ...base, y: 210, tamanho: 110, fonte: "Orbitron", peso: 700 };
      case "minutos_ponteiros": return { ...base, tamanho: 190, espessura: 8, cor: "#d4af37", estilo: "analogico" };
      case "data": return { ...base, y: 300, tamanho: 30, cor: "#d4af37" };
      case "dia_semana": return { ...base, y: 120, tamanho: 30, cor: "#9a9aa2" };
      case "bateria": return { ...base, y: 380, tamanho: 26 };
      case "autonomia": return { ...base, y: 350, tamanho: 24, cor: "#f0d27a" };
      case "passos": return { ...base, x: 150, y: 340, tamanho: 24 };
      case "batimentos": return { ...base, x: 316, y: 340, tamanho: 24, cor: "#e5484d" };
      case "texto": return { ...base, y: 150, tamanho: 26, texto: "MELO", cor: "#d4af37", peso: 800 };
      case "anel": return { ...base, tamanho: 220, espessura: 6, cor: "#d4af37" };
      case "marcas": return { ...base, tamanho: 222, espessura: 6, cor: "#ffffff" };
    }
    return base;
  }

  function nova(nome) {
    return { nome: nome || "Nova máscara", fundo: { tipo: "gradiente", cor1: "#15151a", cor2: "#000000", angulo: 135, imagem: "", brilho: 0, zoom: 100 }, camadas: [camadaPadrao("marcas"), camadaPadrao("hora"), camadaPadrao("data"), camadaPadrao("bateria")] };
  }

  const MODELOS = [
    { nome: "Ouro clássico", fundo: { tipo: "gradiente", cor1: "#1a1508", cor2: "#000000", angulo: 160 }, camadas: [
      { tipo: "anel", tamanho: 226, espessura: 5, cor: "#d4af37" }, { tipo: "marcas", tamanho: 214, espessura: 7, cor: "#d4af37" },
      { tipo: "texto", y: 140, tamanho: 24, texto: "PEDRO MELO", cor: "#d4af37", fonte: "Playfair Display", peso: 700 },
      { tipo: "data", y: 330, tamanho: 26, cor: "#f0d27a" }, { tipo: "minutos_ponteiros", tamanho: 180, espessura: 8, cor: "#f0d27a" }] },
    { nome: "Digital desportivo", fundo: { tipo: "cor", cor1: "#000000" }, camadas: [
      { tipo: "anel", tamanho: 225, espessura: 14, cor: "#16a34a" }, { tipo: "dia_semana", y: 110, tamanho: 30, cor: "#16a34a", fonte: "Orbitron", peso: 700 },
      { tipo: "hora", y: 215, tamanho: 120, fonte: "Orbitron", peso: 900 }, { tipo: "data", y: 300, tamanho: 28, cor: "#9a9aa2", fonte: "Orbitron" },
      { tipo: "passos", x: 150, y: 370, tamanho: 24, fonte: "Roboto Mono" }, { tipo: "batimentos", x: 316, y: 370, tamanho: 24, cor: "#ef4444", fonte: "Roboto Mono" }] },
    { nome: "Minimal branco", fundo: { tipo: "cor", cor1: "#f4f4f4" }, camadas: [
      { tipo: "hora", y: 230, tamanho: 130, cor: "#111111", fonte: "Bebas Neue", peso: 400 }, { tipo: "data", y: 320, tamanho: 26, cor: "#777777" }] },
    { nome: "Azul noite", fundo: { tipo: "gradiente", cor1: "#0b2447", cor2: "#000814", angulo: 200 }, camadas: [
      { tipo: "marcas", tamanho: 222, espessura: 4, cor: "#7dd3fc" }, { tipo: "minutos_ponteiros", tamanho: 185, espessura: 7, cor: "#ffffff" },
      { tipo: "bateria", y: 330, tamanho: 24, cor: "#7dd3fc" }, { tipo: "dia_semana", y: 140, tamanho: 26, cor: "#7dd3fc" }] },
    { nome: "Carbono vermelho", fundo: { tipo: "gradiente", cor1: "#2b2b2b", cor2: "#050505", angulo: 90 }, camadas: [
      { tipo: "anel", tamanho: 228, espessura: 4, cor: "#e5484d" }, { tipo: "hora", y: 200, tamanho: 100, fonte: "Bebas Neue", peso: 400 },
      { tipo: "texto", y: 275, tamanho: 22, texto: "GT3 MELO", cor: "#e5484d", peso: 800 }, { tipo: "batimentos", y: 350, tamanho: 30, cor: "#e5484d" }] },
    { nome: "Executivo", fundo: { tipo: "gradiente", cor1: "#3b2f1e", cor2: "#0d0a06", angulo: 180 }, camadas: [
      { tipo: "marcas", tamanho: 220, espessura: 8, cor: "#e8d5a8" }, { tipo: "data", x: 330, y: C, tamanho: 22, cor: "#e8d5a8" },
      { tipo: "texto", y: 150, tamanho: 20, texto: "MULTIBRICO", cor: "#e8d5a8", fonte: "Playfair Display" }, { tipo: "minutos_ponteiros", tamanho: 190, espessura: 9, cor: "#e8d5a8" }] },
  ].map((m) => ({ ...m, fundo: { imagem: "", brilho: 0, zoom: 100, cor2: "#000000", angulo: 0, ...m.fundo }, camadas: m.camadas.map((c) => ({ ...camadaPadrao(c.tipo), ...c })) }));

  function normalizar(m) {
    const n = nova(m && m.nome);
    if (!m) return n;
    const out = { ...m, nome: m.nome || n.nome, fundo: { ...n.fundo, ...(m.fundo || {}) } };
    // máscaras antigas só tinham "escurecer": passa a brilho negativo
    if (!(m.fundo && m.fundo.brilho !== undefined)) out.fundo.brilho = -(out.fundo.escurecer || 0);
    out.fundo.zoom = Math.min(400, Math.max(100, Number(out.fundo.zoom) || 100));
    out.fundo.brilho = Math.min(100, Math.max(-90, Number(out.fundo.brilho) || 0));
    out.camadas = (m.camadas || []).filter((c) => NOMES[c.tipo]).map((c) => ({ ...camadaPadrao(c.tipo), ...c, id: c.id || Math.random().toString(36).slice(2, 9) }));
    // o ecrã é redondo: puxar para dentro o que ficou fora do círculo
    out.camadas.forEach((c) => {
      if (["anel", "marcas", "minutos_ponteiros"].includes(c.tipo)) { c.x = C; c.y = C; c.tamanho = Math.min(232, Math.max(40, Number(c.tamanho) || 200)); return; }
      c.tamanho = Math.min(200, Math.max(10, Number(c.tamanho) || 30));
      const dx = c.x - C, dy = c.y - C, d = Math.hypot(dx, dy), max = 185;
      if (d > max) { c.x = Math.round(C + (dx / d) * max); c.y = Math.round(C + (dy / d) * max); }
    });
    return out;
  }

  function texto(ctx, s, c) {
    ctx.fillStyle = c.cor;
    ctx.font = `${c.peso || 400} ${c.tamanho}px "${c.fonte || "Inter"}", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, c.x, c.y);
  }

  function valores(estado) {
    const d = (estado && estado.data) || new Date();
    return {
      d,
      hora: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"),
      data: d.getDate() + " " + MESES[d.getMonth()],
      dia: DIAS[d.getDay()],
      bateria: estado && estado.bateria >= 0 ? estado.bateria : 80,
      passos: estado && estado.passos >= 0 ? estado.passos : 8421,
      fc: estado && estado.fc > 0 ? estado.fc : 72,
      autonomia: (() => {
        const h = estado && estado.horasRestantes > 0 ? estado.horasRestantes : 54;
        return h >= 24 ? Math.floor(h / 24) + "d " + Math.round(h % 24) + "h" : Math.round(h) + "h";
      })(),
    };
  }

  function desenharFundo(ctx, m, redesenhar) {
    const f = m.fundo;
    ctx.save();
    if (f.tipo === "imagem" && f.imagem) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, T, T);
      const im = imagem(f.imagem, redesenhar);
      if (im) {
        // zoom: 100 = a imagem preenche o mostrador; acima disso aproxima
        const esc = Math.max(T / im.width, T / im.height) * ((f.zoom || 100) / 100);
        const w = im.width * esc, h = im.height * esc;
        // brilho: negativo escurece, positivo aclara ("escurecer" é o nome antigo)
        const b = f.brilho === undefined ? -(f.escurecer || 0) : f.brilho;
        if (b) ctx.filter = "brightness(" + Math.max(0, 1 + b / 100) + ")";
        ctx.drawImage(im, (T - w) / 2, (T - h) / 2, w, h);
        ctx.filter = "none";
      }
    } else if (f.tipo === "gradiente") {
      const a = ((f.angulo || 0) * Math.PI) / 180;
      const dx = Math.cos(a) * C, dy = Math.sin(a) * C;
      const g = ctx.createLinearGradient(C - dx, C - dy, C + dx, C + dy);
      g.addColorStop(0, f.cor1 || "#000"); g.addColorStop(1, f.cor2 || "#000");
      ctx.fillStyle = g; ctx.fillRect(0, 0, T, T);
    } else {
      ctx.fillStyle = f.cor1 || "#000"; ctx.fillRect(0, 0, T, T);
    }
    ctx.restore();
  }

  function desenharCamada(ctx, c, v) {
    ctx.save();
    switch (c.tipo) {
      case "hora": texto(ctx, v.hora, c); break;
      case "data": texto(ctx, v.data, c); break;
      case "dia_semana": texto(ctx, v.dia, c); break;
      case "bateria": texto(ctx, "▮ " + v.bateria + "%", c); break;
      case "autonomia": texto(ctx, v.autonomia, c); break;
      case "passos": texto(ctx, "👣 " + v.passos.toLocaleString("pt-PT"), c); break;
      case "batimentos": texto(ctx, "♥ " + v.fc, c); break;
      case "texto": texto(ctx, c.texto || "", c); break;
      case "anel":
        ctx.strokeStyle = c.cor; ctx.lineWidth = c.espessura;
        ctx.beginPath(); ctx.arc(c.x, c.y, c.tamanho, 0, Math.PI * 2); ctx.stroke(); break;
      case "marcas":
        ctx.strokeStyle = c.cor; ctx.lineCap = "round";
        for (let i = 0; i < 60; i++) {
          const a = (i * Math.PI) / 30, grande = i % 5 === 0;
          const r1 = c.tamanho, r2 = c.tamanho - (grande ? 26 : 10);
          ctx.lineWidth = grande ? c.espessura : Math.max(1, c.espessura / 3);
          ctx.globalAlpha = grande ? 1 : 0.55;
          ctx.beginPath(); ctx.moveTo(c.x + r1 * Math.sin(a), c.y - r1 * Math.cos(a)); ctx.lineTo(c.x + r2 * Math.sin(a), c.y - r2 * Math.cos(a)); ctx.stroke();
        }
        break;
      case "minutos_ponteiros": {
        const d = v.d, h = (d.getHours() % 12) + d.getMinutes() / 60, mi = d.getMinutes() + d.getSeconds() / 60, s = d.getSeconds();
        const ponteiro = (ang, comp, larg, cor) => {
          ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(c.x - Math.sin(ang) * comp * 0.12, c.y + Math.cos(ang) * comp * 0.12);
          ctx.lineTo(c.x + Math.sin(ang) * comp, c.y - Math.cos(ang) * comp); ctx.stroke();
        };
        ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 8;
        ponteiro((h * Math.PI) / 6, c.tamanho * 0.55, c.espessura * 1.4, c.cor);
        ponteiro((mi * Math.PI) / 30, c.tamanho * 0.85, c.espessura, c.cor);
        ponteiro((s * Math.PI) / 30, c.tamanho * 0.92, Math.max(1.5, c.espessura / 3.5), "#e5484d");
        ctx.shadowBlur = 0; ctx.fillStyle = c.cor; ctx.beginPath(); ctx.arc(c.x, c.y, c.espessura * 1.3, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  /** Desenha a máscara. opcoes: { estado, soEstatico, selecionada, redesenhar } */
  function desenhar(canvas, m, opcoes) {
    opcoes = opcoes || {};
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(canvas.width / T, canvas.height / T);
    ctx.clearRect(0, 0, T, T);
    desenharFundo(ctx, m, opcoes.redesenhar);
    const v = valores(opcoes.estado);
    for (const c of m.camadas) {
      if (opcoes.soEstatico && DINAMICAS.includes(c.tipo)) continue;
      desenharCamada(ctx, c, v);
    }
    if (opcoes.selecionada) {
      const c = m.camadas.find((x) => x.id === opcoes.selecionada);
      if (c) {
        ctx.strokeStyle = "rgba(212,175,55,.9)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
        const r = ["anel", "marcas", "minutos_ponteiros"].includes(c.tipo) ? c.tamanho + 8 : Math.max(24, c.tamanho * 0.9);
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  window.Estudio = { T, NOMES, DINAMICAS, MODELOS, nova, normalizar, camadaPadrao, desenhar };
})();
