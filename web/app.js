// GT3 Melo — controlador da interface.
(function () {
  const VERSAO_INTERFACE = "2026-09-17.1";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---------- utilitários ----------
  let toastT;
  function toast(t) { const e = $("#toast"); e.textContent = t; e.classList.add("ver"); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove("ver"), 2800); }
  function carregar(on, txt) { $("#carregando").classList.toggle("escondido", !on); if (txt) $("#carregandoTxt").textContent = txt; }
  function res(r, okTxt) { if (r && r.ok) { if (okTxt) toast(okTxt); } else toast("⚠ " + ((r && r.erro) || "falhou")); return r; }
  async function api(caminho, corpo, metodo) {
    const r = await fetch(caminho, corpo || metodo ? { method: metodo || "POST", headers: { "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined } : undefined);
    const j = await r.json().catch(() => ({ erro: "resposta inválida" }));
    if (!r.ok || j.erro) throw new Error(j.erro || "erro " + r.status);
    return j;
  }
  function lerFicheiro(f, como) { return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; como === "url" ? r.readAsDataURL(f) : r.readAsArrayBuffer(f); }); }
  function redimensionar(dataUrl, lado) {
    return new Promise((ok, erro) => { const im = new Image(); im.onerror = () => erro(new Error("imagem inválida")); im.onload = () => { const c = document.createElement("canvas"); c.width = c.height = lado; const x = c.getContext("2d"); const e = Math.max(lado / im.width, lado / im.height); x.drawImage(im, (lado - im.width * e) / 2, (lado - im.height * e) / 2, im.width * e, im.height * e); ok(c.toDataURL("image/jpeg", 0.88)); }; im.src = dataUrl; });
  }

  // ---------- navegação ----------
  const pilha = [];
  function ir(ecra, semPilha) {
    const atual = $$(".ecra.ativo")[0];
    if (!semPilha && atual && atual.id !== "ecra-" + ecra) pilha.push(atual.id.replace("ecra-", ""));
    $$(".ecra").forEach((e) => e.classList.toggle("ativo", e.id === "ecra-" + ecra));
    $$("#navegacao button").forEach((b) => b.classList.toggle("ativo", b.dataset.ecra === ecra || (ecra === "editor" && b.dataset.ecra === "mascaras")));
    window.scrollTo(0, 0);
    if (ecra === "mascaras") carregarGaleria();
    if (ecra === "inicio") atualizarDados();
  }
  window.voltar = function () { if (!pilha.length) return false; ir(pilha.pop(), true); return true; };
  $$("#navegacao button").forEach((b) => (b.onclick = () => { pilha.length = 0; ir(b.dataset.ecra, true); }));

  // ---------- estado do relógio ----------
  const estado = { bateria: -1, passos: -1, fc: -1 };
  function mostrarDispositivo(info) {
    const d = info && info.dispositivos && info.dispositivos[0];
    if (!d) {
      $("#nomeRelogio").textContent = "Nenhum relógio emparelhado";
      $("#estadoRelogio").textContent = "Vá a Relógio › Emparelhar";
      $("#estadoTopo").textContent = "sem relógio"; $("#estadoTopo").classList.remove("ok");
      return;
    }
    $("#nomeRelogio").textContent = d.nome || "Relógio";
    $("#estadoRelogio").textContent = d.estadoTexto || d.estado;
    $("#firmwareRelogio").textContent = d.firmware ? "Firmware " + d.firmware : "";
    $("#estadoTopo").textContent = d.pronto ? "ligado" : d.ligado ? "a ligar…" : "desligado";
    $("#estadoTopo").classList.toggle("ok", !!d.pronto);
    const b = d.bateria;
    estado.bateria = b;
    $("#bateriaVal").textContent = b >= 0 ? b + "%" : "--";
    $("#arcoBateria").style.strokeDashoffset = 276.46 * (1 - (b >= 0 ? b : 0) / 100);
    $("#arcoBateria").style.stroke = b >= 0 && b <= 20 ? "var(--perigo)" : "var(--ouro)";
  }
  window.aoNucleo = function (tipo, dados) {
    if (tipo === "dispositivo" || tipo === "retomar") mostrarDispositivo(dados);
    if (tipo === "retomar") atualizarDados();
  };

  function atualizarDados() {
    mostrarDispositivo(N.dispositivos());
    const agora = new Date(), ini = new Date(agora); ini.setHours(0, 0, 0, 0);
    const d = N.dados(Math.floor(ini / 1000), Math.floor(agora / 1000));
    if (!d.ok) return;
    estado.passos = d.passos; estado.fc = d.fcAtual;
    $("#vPassos").textContent = d.passos.toLocaleString("pt-PT");
    $("#vFc").textContent = d.fcAtual > 0 ? d.fcAtual : "--";
    $("#vFcExtra").textContent = d.fcMin > 0 ? d.fcMin + "–" + d.fcMax + " bpm" : "";
    // sono da noite: das 18h de ontem às 12h de hoje
    const s0 = new Date(ini.getTime() - 6 * 3600e3), s1 = new Date(ini.getTime() + 12 * 3600e3);
    const sn = N.dados(Math.floor(s0 / 1000), Math.floor(Math.min(s1, agora) / 1000));
    const min = sn.ok ? sn.minutosSono : 0;
    $("#vSono").textContent = min ? Math.floor(min / 60) + "h" + String(min % 60).padStart(2, "0") : "--";
    graficoPassos(d.serie || [], ini.getTime() / 1000);
  }

  function graficoPassos(serie, ini) {
    const c = $("#grafPassos"), dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 300, h = 120;
    c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext("2d"); x.scale(dpr, dpr); x.clearRect(0, 0, w, h);
    const blocos = 96, bw = w / blocos, vals = new Array(blocos).fill(0);
    serie.forEach(([t, p]) => { const i = Math.floor((t - ini) / 900); if (i >= 0 && i < blocos) vals[i] += p; });
    const max = Math.max(200, ...vals);
    x.fillStyle = "#26262a"; for (let hh = 0; hh <= 24; hh += 6) x.fillRect((hh * 4) * bw, 0, 1, h - 14);
    x.fillStyle = "#9a9aa2"; x.font = "10px Inter"; [0, 6, 12, 18].forEach((hh) => x.fillText(hh + "h", hh * 4 * bw + 3, h - 2));
    vals.forEach((v, i) => { if (!v) return; const bh = (v / max) * (h - 20); x.fillStyle = "#d4af37"; x.fillRect(i * bw + 0.5, h - 14 - bh, Math.max(1, bw - 1), bh); });
  }

  // ---------- ações rápidas ----------
  $$(".acao").forEach((b) => (b.onclick = () => {
    const a = b.dataset.acao;
    if (a === "ligar") res(N.ligar(), "A ligar ao relógio…");
    if (a === "sincronizar") { res(N.sincronizar(), "A sincronizar dados…"); setTimeout(atualizarDados, 8000); }
    if (a === "hora") res(N.acertarHora(), "Hora acertada");
    if (a === "encontrar") { res(N.encontrar(true), "O relógio vai vibrar"); setTimeout(() => N.encontrar(false), 8000); }
  }));
  $("#btNotificar").onclick = () => res(N.notificar($("#notTitulo").value, $("#notTexto").value), "Mensagem enviada");
  $$("[data-abrir]").forEach((b) => (b.onclick = () => N.abrir(b.dataset.abrir)));
  $("#ficheiroInstalar").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    carregar(true, "A enviar " + f.name + "…");
    try { const b = new Uint8Array(await lerFicheiro(f)); res(N.instalar(f.name, HWT.paraBase64(b)), "Enviado para o relógio. Veja o progresso na notificação."); }
    finally { carregar(false); e.target.value = ""; }
  };

  // máscara de teste já preparada (guardada no Cloudflare)
  $("#btMascaraTeste").onclick = async () => {
    carregar(true, "A ir buscar a máscara de teste…");
    try {
      const t = await fetch("/ci/dd675fde21f25243db694192/mascara-teste?t=" + Date.now()).then((r) => r.text());
      const b64 = t.split("\n").slice(1).join("").trim();
      if (b64.length < 1000) throw new Error("ainda não há máscara de teste preparada");
      carregar(true, "A enviar para o relógio…");
      res(N.instalar("gt3-melo-teste.hwt", b64), "Enviada. Veja o progresso na notificação e depois escolha-a no pulso.");
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };

  // ---------- atualizações ----------
  let publicada = null;
  async function verAtualizacao(manual) {
    try {
      publicada = await fetch("/api/versao?t=" + Date.now()).then((r) => r.json());
      $("#vPublicada").textContent = publicada.versaoNome;
      const tenho = N.versao();
      if (N.real && publicada.versaoCodigo > tenho) {
        $("#avisoAtualizar").classList.remove("escondido");
        $("#avisoAtualizarTxt").textContent = "Tem a " + N.versaoNome() + ", já existe a " + publicada.versaoNome + ". Instala por cima, sem perder o emparelhamento.";
      } else if (manual) toast("Já tem a versão mais recente");
    } catch (e) { if (manual) toast("Sem informação de versão"); }
  }
  $("#btAtualizar").onclick = () => publicada && res(N.atualizar(publicada.apk), "A descarregar a atualização…");
  $("#btVerAtualizacao").onclick = () => verAtualizacao(true);
  $("#btRecarregar").onclick = () => N.recarregar();

  // ---------- galeria de máscaras ----------
  function miniatura(m, aoTocar) {
    const b = document.createElement("button"); b.className = "itemGaleria";
    const c = document.createElement("canvas"); c.width = c.height = 180;
    const s = document.createElement("span"); s.textContent = m.nome;
    b.append(c, s); b.onclick = aoTocar;
    const desenha = () => Estudio.desenhar(c, m, { redesenhar: desenha });
    desenha(); setTimeout(desenha, 600);
    return b;
  }
  $("#listaModelos").append(...Estudio.MODELOS.map((m) => miniatura(m, () => abrirEditor(JSON.parse(JSON.stringify({ ...m, id: undefined, nome: m.nome + " (cópia)" }))))));
  async function carregarGaleria() {
    const el = $("#listaMascaras");
    try {
      const itens = await api("/api/mascaras");
      el.innerHTML = "";
      if (!itens.length) el.innerHTML = '<p class="suave pequeno">Ainda não guardou nenhuma máscara.</p>';
      itens.forEach((m) => el.append(miniatura(Estudio.normalizar(m), () => abrirEditor(Estudio.normalizar(m)))));
    } catch (e) { el.innerHTML = '<p class="suave pequeno">Sem ligação à biblioteca.</p>'; }
  }
  $("#btNovaMascara").onclick = () => abrirEditor(Estudio.nova());

  async function iaCriar(descricao, atual) {
    const r = await api("/api/ia/mascara", { descricao, atual });
    return Estudio.normalizar(r.mascara);
  }
  async function iaFundo(prompt) {
    const r = await api("/api/ia/fundo", { prompt });
    return await redimensionar(r.imagem, 466);
  }
  $("#btIaCriar").onclick = async () => {
    const d = $("#iaDescricao").value.trim(); if (!d) return toast("Descreva a máscara");
    carregar(true, "A desenhar a máscara…");
    try {
      const m = await iaCriar(d);
      if ($("#iaComFundo").checked && m.prompt_fundo) {
        carregar(true, "A pintar o fundo…");
        try { m.fundo = { ...m.fundo, tipo: "imagem", imagem: await iaFundo(m.prompt_fundo), escurecer: 25 }; } catch (e) { toast("Fundo com IA falhou; ficou a cor"); }
      }
      delete m.prompt_fundo;
      abrirEditor(m);
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };

  // ---------- copiar de uma fotografia ----------
  const CHAVE = "dd675fde21f25243db694192";
  const ESQUEMA = `Formato obrigatório da resposta (JSON puro, sem texto à volta):
{"nome":"...","fundo":{"tipo":"cor|gradiente","cor1":"#hex","cor2":"#hex","angulo":0},
"camadas":[{"tipo":"hora|minutos_ponteiros|data|dia_semana|bateria|passos|batimentos|texto|anel|marcas","x":233,"y":233,"tamanho":80,"cor":"#hex","fonte":"Inter|Orbitron|Roboto Mono|Playfair Display|Bebas Neue","peso":400,"texto":"","espessura":4}]}
O mostrador é redondo, 466x466, centro em 233,233. "tamanho" é o corpo da letra, ou o raio nos tipos anel/marcas/minutos_ponteiros.`;
  const PEDIDO_FOTO = `Esta fotografia mostra o mostrador de um relógio. Reproduz o arranjo com as peças disponíveis: cores do fundo, aro, marcas das horas, ponteiros ou hora digital, data, dia da semana, bateria, passos e batimentos, na posição e tamanho aproximados do original. Não inventes peças que não vês. ` + ESQUEMA;
  let fotoB64 = null;

  function extrairJson(t) {
    const m = String(t).match(/\{[\s\S]*\}/);
    if (!m) throw new Error("a IA não devolveu um desenho válido");
    return JSON.parse(m[0]);
  }
  async function escolherFoto(e) {
    const f = e.target.files[0]; if (!f) return;
    const url = await redimensionar(await lerFicheiro(f, "url"), 768);
    fotoB64 = url.split(",")[1];
    $("#fotoPre").innerHTML = `<img src="${url}" style="width:120px;border-radius:12px;margin-top:8px">`;
    $("#btFotoRapida").disabled = $("#btFotoFina").disabled = false;
    e.target.value = "";
  }
  $("#fotoCamara").onchange = escolherFoto;
  $("#fotoFicheiro").onchange = escolherFoto;

  $("#btFotoRapida").onclick = async () => {
    if (!fotoB64) return;
    carregar(true, "A ler a fotografia…");
    try {
      const mensagens = [{ role: "user", content: [
        { type: "text", text: PEDIDO_FOTO },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64," + fotoB64 } },
      ] }];
      const r = await api("/api/ia/exec", { chave: CHAVE, modelo: "@cf/meta/llama-4-scout-17b-16e-instruct", entrada: { messages: mensagens, max_tokens: 1400 } });
      const res0 = r.resposta || {};
      const t = (res0.choices && res0.choices[0] && res0.choices[0].message && res0.choices[0].message.content) || res0.response || res0.description || JSON.stringify(res0);
      abrirEditor(extrairJson(t));
      toast("Desenho lido da foto — afine no editor");
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };

  $("#btFotoFina").onclick = async () => {
    if (!fotoB64) return;
    carregar(true, "A pedir ao Claude…");
    try {
      const r = await api("/api/claude", {
        chave: CHAVE, model: "claude-sonnet-5", max_tokens: 1500,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fotoB64 } },
          { type: "text", text: PEDIDO_FOTO },
        ] }],
      });
      const t = (r.content || []).map((c) => c.text || "").join("");
      abrirEditor(extrairJson(t));
      toast("Desenho lido da foto — afine no editor");
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };

  // ---------- editor ----------
  let m = null, mPrincipal = null, variante = "normal", sel = null, tick = null, pacoteHwt = null, alvoHwt = -1, alvoAod = -1;
  const tela = $("#tela");
  function redesenhar() { if (m) Estudio.desenhar(tela, m, { estado: { ...estado, data: new Date() }, selecionada: sel, redesenhar }); }

  function abrirEditor(mascara) {
    m = Estudio.normalizar(mascara); sel = null;
    $("#edNome").value = m.nome;
    preencherFundo(); listarCamadas();
    $$("#abasEditor button").forEach((x, i) => x.classList.toggle("ativo", i === 0));
    $$(".aba").forEach((a, i) => a.classList.toggle("ativo", i === 0));
    ir("editor");
    clearInterval(tick); tick = setInterval(() => { if ($("#ecra-editor").classList.contains("ativo")) redesenhar(); }, 1000);
    redesenhar();
  }
  $("#btVoltarGaleria").onclick = () => ir("mascaras");
  $("#edNome").oninput = (e) => (m.nome = e.target.value);
  $$("#abasEditor button").forEach((b) => (b.onclick = () => {
    $$("#abasEditor button").forEach((x) => x.classList.toggle("ativo", x === b));
    $$(".aba").forEach((a) => a.classList.toggle("ativo", a.dataset.aba === b.dataset.aba));
  }));

  function listarCamadas() {
    const el = $("#listaCamadas"); el.innerHTML = "";
    m.camadas.slice().reverse().forEach((c) => {
      const d = document.createElement("div"); d.className = "camada" + (c.id === sel ? " sel" : "");
      d.innerHTML = `<div class="cor" style="background:${c.cor}"></div><span>${Estudio.NOMES[c.tipo]}${c.tipo === "texto" ? ": " + (c.texto || "") : ""}</span><button data-o="cima">↑</button><button data-o="baixo">↓</button><button data-o="dup">⧉</button><button data-o="x">✕</button>`;
      d.onclick = (ev) => {
        const o = ev.target.dataset.o, i = m.camadas.indexOf(c);
        if (o === "x") { m.camadas.splice(i, 1); if (sel === c.id) sel = null; }
        else if (o === "cima" && i < m.camadas.length - 1) [m.camadas[i], m.camadas[i + 1]] = [m.camadas[i + 1], m.camadas[i]];
        else if (o === "baixo" && i > 0) [m.camadas[i], m.camadas[i - 1]] = [m.camadas[i - 1], m.camadas[i]];
        else if (o === "dup") m.camadas.splice(i + 1, 0, { ...c, id: Math.random().toString(36).slice(2, 9), x: c.x + 20, y: c.y + 20 });
        else sel = sel === c.id ? null : c.id;
        listarCamadas(); redesenhar();
      };
      el.append(d);
    });
    propriedades();
  }

  const FONTES = ["Inter", "Orbitron", "Roboto Mono", "Playfair Display", "Bebas Neue"];
  function propriedades() {
    const el = $("#propsCamada"), c = m.camadas.find((x) => x.id === sel);
    el.classList.toggle("escondido", !c); if (!c) return;
    const circular = ["anel", "marcas", "minutos_ponteiros"].includes(c.tipo);
    const temTexto = !circular;
    el.innerHTML = `<b>${Estudio.NOMES[c.tipo]}</b>
      ${c.tipo === "texto" ? `<label>Texto<input data-p="texto" value="${(c.texto || "").replace(/"/g, "&quot;")}"></label>` : ""}
      <div class="linha"><label>Cor<input type="color" data-p="cor" value="${c.cor}"></label>
      ${temTexto ? `<label>Letra<select data-p="fonte">${FONTES.map((f) => `<option ${f === c.fonte ? "selected" : ""}>${f}</option>`).join("")}</select></label>` : ""}</div>
      <label>${circular ? "Raio" : "Tamanho"} <span>${c.tamanho}</span><input type="range" data-p="tamanho" min="${circular ? 40 : 10}" max="${circular ? 232 : 200}" value="${c.tamanho}"></label>
      ${temTexto ? `<label>Peso <span>${c.peso}</span><input type="range" data-p="peso" min="100" max="900" step="100" value="${c.peso}"></label>` : `<label>Espessura <span>${c.espessura}</span><input type="range" data-p="espessura" min="1" max="30" value="${c.espessura}"></label>`}
      <div class="linha"><label>Horizontal <span>${Math.round(c.x)}</span><input type="range" data-p="x" min="0" max="466" value="${c.x}"></label><label>Vertical <span>${Math.round(c.y)}</span><input type="range" data-p="y" min="0" max="466" value="${c.y}"></label></div>
      <button class="bt pequeno" id="btCentrar">Centrar</button>
      <p class="suave pequeno">Também pode arrastar a camada diretamente no mostrador.</p>`;
    el.querySelectorAll("[data-p]").forEach((inp) => (inp.oninput = () => {
      const p = inp.dataset.p; c[p] = inp.type === "range" ? Number(inp.value) : inp.value;
      const s = inp.parentElement.querySelector("span"); if (s) s.textContent = inp.value;
      if (p === "cor" || p === "texto") listarCamadasLeve();
      redesenhar();
    }));
    $("#btCentrar").onclick = () => { c.x = 233; if (circular) c.y = 233; propriedades(); redesenhar(); };
  }
  function listarCamadasLeve() { const c = m.camadas.find((x) => x.id === sel); const d = $("#listaCamadas .camada.sel .cor"); if (d && c) d.style.background = c.cor; }

  $("#btAddCamada").onclick = () => { const c = Estudio.camadaPadrao($("#novoTipo").value); m.camadas.push(c); sel = c.id; listarCamadas(); redesenhar(); };

  // arrastar no mostrador
  let arrasto = null;
  function ponto(ev) { const r = tela.getBoundingClientRect(); const t = ev.touches ? ev.touches[0] : ev; return { x: ((t.clientX - r.left) / r.width) * 466, y: ((t.clientY - r.top) / r.height) * 466 }; }
  function inicio(ev) {
    const p = ponto(ev);
    let alvo = null, melhor = 1e9;
    m.camadas.forEach((c) => { const d = Math.hypot(c.x - p.x, c.y - p.y); const r = ["anel", "marcas", "minutos_ponteiros"].includes(c.tipo) ? 30 : Math.max(40, c.tamanho); if (d < r && d < melhor) { melhor = d; alvo = c; } });
    if (!alvo) return;
    sel = alvo.id; arrasto = { c: alvo, dx: alvo.x - p.x, dy: alvo.y - p.y };
    listarCamadas(); redesenhar(); ev.preventDefault();
  }
  function mover(ev) { if (!arrasto) return; const p = ponto(ev); arrasto.c.x = Math.round(p.x + arrasto.dx); arrasto.c.y = Math.round(p.y + arrasto.dy); redesenhar(); ev.preventDefault(); }
  function fim() { if (arrasto) { arrasto = null; propriedades(); } }
  tela.addEventListener("touchstart", inicio, { passive: false }); tela.addEventListener("touchmove", mover, { passive: false }); tela.addEventListener("touchend", fim);
  tela.addEventListener("mousedown", inicio); window.addEventListener("mousemove", mover); window.addEventListener("mouseup", fim);

  // fundo
  function preencherFundo() {
    const f = m.fundo;
    $("#fTipo").value = f.tipo; $("#fCor1").value = f.cor1 || "#000000"; $("#fCor2").value = f.cor2 || "#000000"; $("#fAngulo").value = f.angulo || 0; $("#fEscurecer").value = f.escurecer || 0;
  }
  ["fTipo", "fCor1", "fCor2", "fAngulo", "fEscurecer"].forEach((id) => ($("#" + id).oninput = () => {
    m.fundo.tipo = $("#fTipo").value; m.fundo.cor1 = $("#fCor1").value; m.fundo.cor2 = $("#fCor2").value; m.fundo.angulo = Number($("#fAngulo").value); m.fundo.escurecer = Number($("#fEscurecer").value);
    redesenhar();
  }));
  $("#fImagem").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; m.fundo.imagem = await redimensionar(await lerFicheiro(f, "url"), 466); m.fundo.tipo = "imagem"; preencherFundo(); redesenhar(); e.target.value = ""; };
  $("#btTirarImagem").onclick = () => { m.fundo.imagem = ""; if (m.fundo.tipo === "imagem") m.fundo.tipo = "gradiente"; preencherFundo(); redesenhar(); };

  // IA no editor
  $("#btIaAlterar").onclick = async () => {
    const d = $("#iaAlterar").value.trim(); if (!d) return toast("Diga o que quer mudar");
    carregar(true, "A alterar a máscara…");
    try {
      const semImagem = { ...m, fundo: { ...m.fundo, imagem: m.fundo.imagem ? "(imagem atual)" : "" } };
      const n = await iaCriar(d, semImagem);
      const imagemAtual = m.fundo.imagem;
      n.id = m.id; n.fundo = { ...n.fundo, imagem: n.fundo.imagem === "(imagem atual)" || n.fundo.tipo === "imagem" ? imagemAtual : "" };
      if (n.fundo.tipo === "imagem" && !n.fundo.imagem) n.fundo.tipo = "gradiente";
      delete n.prompt_fundo;
      m = Estudio.normalizar(n); sel = null; $("#edNome").value = m.nome; preencherFundo(); listarCamadas(); redesenhar();
      toast("Alteração aplicada");
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };
  $("#btIaFundo").onclick = async () => {
    const d = $("#iaFundo").value.trim(); if (!d) return toast("Descreva o fundo");
    carregar(true, "A pintar o fundo…");
    try { m.fundo.imagem = await iaFundo(d); m.fundo.tipo = "imagem"; m.fundo.escurecer = m.fundo.escurecer || 20; preencherFundo(); redesenhar(); }
    catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };

  // guardar / duplicar / apagar
  $("#btGuardar").onclick = async () => {
    carregar(true, "A guardar…");
    try { const r = await api("/api/mascaras", m); m.id = r.id; toast("Máscara guardada"); } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };
  $("#btDuplicar").onclick = () => { const c = JSON.parse(JSON.stringify(m)); delete c.id; c.nome = m.nome + " (cópia)"; abrirEditor(c); toast("Cópia criada — guarde para manter"); };
  $("#btApagar").onclick = async () => {
    if (!m.id) return ir("mascaras");
    if (!confirm("Apagar a máscara \"" + m.nome + "\"?")) return;
    try { await api("/api/mascaras/" + m.id, null, "DELETE"); toast("Apagada"); ir("mascaras"); } catch (e) { toast("⚠ " + e.message); }
  };

  // exportar
  function render(soEstatico, lado) { const c = document.createElement("canvas"); c.width = c.height = lado || 466; Estudio.desenhar(c, m, { estado: { ...estado, data: new Date() }, soEstatico }); return c; }
  function guardarCanvas(c, nome) { const b64 = c.toDataURL("image/png").split(",")[1]; res(N.guardar(nome, b64), "Guardado em Transferências: " + nome); }
  const nomeFicheiro = (s) => (m.nome || "mascara").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  $("#btPngCompleto").onclick = () => guardarCanvas(render(false), nomeFicheiro() + ".png");
  $("#btPngFundo").onclick = () => guardarCanvas(render(true), nomeFicheiro() + "-fundo.png");

  // .hwt
  $("#hwtBase").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    carregar(true, "A ler a máscara base…");
    try {
      pacoteHwt = await HWT.abrir(f);
      alvoHwt = HWT.indiceFundo(pacoteHwt);
      const mini = $("#hwtImagens"); mini.innerHTML = "";
      pacoteHwt.imgs.slice(0, 40).forEach((im, i) => {
        if (im.largura * im.altura < 2500 && i !== alvoHwt) return;
        const fig = document.createElement("figure"); if (i === alvoHwt) fig.className = "alvo";
        const img = document.createElement("img"); img.src = HWT.paraDataURL(HWT.descodificar(pacoteHwt.bin, im));
        fig.append(img, document.createTextNode(im.largura + "×" + im.altura));
        fig.onclick = () => { alvoHwt = i; mini.querySelectorAll("figure").forEach((x) => x.classList.remove("alvo")); fig.classList.add("alvo"); };
        mini.append(fig);
      });
      const fundo = pacoteHwt.imgs[alvoHwt];
      const aviso = alvoHwt < 0
        ? "<br>⚠ Esta base não tem fundo principal para substituir (só sobreposições). Escolha outra máscara."
        : "";
      $("#hwtInfo").innerHTML = `Base: <b>${pacoteHwt.titulo}</b> ${pacoteHwt.screen ? "(" + pacoteHwt.screen + ")" : ""}<br>${pacoteHwt.imgs.length} imagens. A trocar (dourada): ${fundo ? fundo.largura + "×" + fundo.altura : "nenhuma"} — toque noutra para mudar.${aviso}`;
      $("#btEnviarRelogio").disabled = $("#btGuardarHwt").disabled = alvoHwt < 0;
    } catch (err) { pacoteHwt = null; $("#hwtInfo").textContent = "⚠ " + err.message; $("#btEnviarRelogio").disabled = $("#btGuardarHwt").disabled = true; }
    finally { carregar(false); e.target.value = ""; }
  };
  async function construirHwt() {
    const soEst = $("#hwtSoEstatico").checked;
    const capa = render(false, 466).toDataURL("image/jpeg", 0.9);
    return HWT.construir(pacoteHwt, alvoHwt, render(soEst), m.nome, capa);
  }
  $("#btGuardarHwt").onclick = async () => {
    carregar(true, "A criar o .hwt…");
    try { const r = await construirHwt(); res(N.guardar(nomeFicheiro() + ".hwt", HWT.paraBase64(r.bytes)), "Guardado " + nomeFicheiro() + ".hwt" + (r.bits < 8 ? " (cores reduzidas para caber)" : "")); }
    catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };
  $("#btEnviarRelogio").onclick = async () => {
    carregar(true, "A criar e a enviar…");
    try {
      const r = await construirHwt();
      res(N.instalar(nomeFicheiro() + ".hwt", HWT.paraBase64(r.bytes)), "Enviado. O relógio mostra o progresso; depois escolha a máscara no pulso." + (r.bits < 8 ? " (cores reduzidas para caber)" : ""));
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };

  // ---------- arranque ----------
  $("#vInterface").textContent = VERSAO_INTERFACE;
  $("#vNucleo").textContent = N.real ? N.versaoNome() + " (" + N.versao() + ")" : "navegador (sem relógio)";
  atualizarDados();
  verAtualizacao(false);
  setInterval(() => { if ($("#ecra-inicio").classList.contains("ativo")) mostrarDispositivo(N.dispositivos()); }, 15000);
  document.fonts && document.fonts.ready.then(() => redesenhar());
})();
