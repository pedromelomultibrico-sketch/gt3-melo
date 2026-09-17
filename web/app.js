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
    if (ecra !== "biblioteca") { const a = $("#acoesItem"); if (a) a.classList.add("escondido"); }
    window.scrollTo(0, 0);
    if (ecra === "biblioteca") carregarGaleria();
    if (ecra === "inicio") atualizarDados();
    if (ecra === "relogio") listarTransferencias();
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
    if (tipo === "retomar") { atualizarDados(); verFicheiroPendente(); }
    if (tipo === "ficheiro") tratarFicheiroRecebido(dados);
  };
  function verFicheiroPendente() {
    const p = N.ficheiroPendente();
    if (p) tratarFicheiroRecebido(p);
  }

  /**
   * Estima quanto tempo falta, pelo ritmo de descarga dos últimos dias.
   * Salta as subidas (carregamentos) e os buracos longos sem dados.
   */
  function calcularAutonomia(amostras, nivelAgora) {
    let horas = 0, descida = 0;
    for (let i = 1; i < amostras.length; i++) {
      const [t0, n0] = amostras[i - 1], [t1, n1] = amostras[i];
      const dh = (t1 - t0) / 3600;
      if (dh <= 0 || dh > 6) continue;      // buraco: o relógio esteve fora de alcance
      if (n1 > n0) { horas = 0; descida = 0; continue; } // esteve a carregar: recomeça
      horas += dh; descida += n0 - n1;
    }
    if (horas < 3 || descida < 2) return null;            // ainda há pouca história
    const ritmo = descida / horas;                        // % por hora
    return { ritmo, restantes: Math.max(0, (nivelAgora >= 0 ? nivelAgora : 0) / ritmo), horasVistas: horas };
  }

  function tempoTxt(h) {
    if (h >= 24) { const d = Math.floor(h / 24); return d + (d === 1 ? " dia e " : " dias e ") + Math.round(h - d * 24) + " h"; }
    if (h >= 2) return Math.round(h) + " horas";
    return Math.max(1, Math.round(h * 60)) + " minutos";
  }

  let autonomia = null;
  function atualizarAutonomia() {
    const el = $("#autonomia");
    const h = N.bateriaHistorico(7);
    if (!h || !h.ok || !h.amostras || h.amostras.length < 4) { el.textContent = ""; autonomia = null; return; }
    autonomia = calcularAutonomia(h.amostras, estado.bateria);
    if (!autonomia) { el.textContent = ""; return; }
    el.textContent = "Aguenta mais ~" + tempoTxt(autonomia.restantes) + " · gasta " + autonomia.ritmo.toFixed(1).replace(".", ",") + "%/h";
    estado.horasRestantes = autonomia.restantes;
  }

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
    atualizarAutonomia();
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
    try {
      let b64 = HWT.paraBase64(new Uint8Array(await lerFicheiro(f)));
      let nome = f.name.replace(/\.(hwt|zip)$/i, "").replace(/\.hwt$/i, ""), capa = "", pac = null;
      try {
        pac = await HWT.abrir(f);
        nome = pac.titulo || nome;
        capa = await capaDoHwt(pac);
        b64 = HWT.paraBase64(pac.bytes); // se vinha dentro de um .zip, vai só a máscara
      } catch (err) { /* não é máscara: segue tal e qual */ }
      const envio = res(N.instalar(nome + ".hwt", b64), "Enviado para o relógio. Veja o progresso na notificação.");
      if (envio && envio.ok) {
        await guardarNaBiblioteca({ nome, origem: "ficheiro", ficheiro: true, capa }, b64);
        toast("Guardada na biblioteca: " + nome);
      }
    } finally { carregar(false); e.target.value = ""; }
  };

  // ---------- máscaras que já estão no telemóvel ----------
  /** Recebe os bytes, tira a máscara de dentro do zip se for preciso, envia e guarda. */
  async function instalarB64(nomeFicheiro, b64) {
    let nome = (nomeFicheiro || "mascara").replace(/\.zip$/i, "").replace(/\.hwt$/i, ""), capa = "";
    try {
      const pac = await HWT.abrir(ficheiroDe(b64, nomeFicheiro));
      nome = pac.titulo || nome;
      capa = await capaDoHwt(pac);
      b64 = HWT.paraBase64(pac.bytes);
    } catch (e) { /* segue tal e qual */ }
    const envio = res(N.instalar(nome + ".hwt", b64), "Enviada para o relógio. Veja o progresso na notificação.");
    if (envio && envio.ok) {
      await guardarNaBiblioteca({ nome, origem: "ficheiro", ficheiro: true, capa }, b64);
      toast("Guardada na biblioteca: " + nome);
    }
    return envio;
  }

  function tamanhoTxt(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }

  function listarTransferencias() {
    const el = $("#listaTransferencias");
    const r = N.transferencias();
    if (!r || !r.ok) { el.innerHTML = '<p class="suave pequeno">' + ((r && r.erro) || "não consegui ler a pasta") + "</p>"; return; }
    if (!r.podeLer) {
      el.innerHTML = '<p class="suave pequeno">Falta a autorização do Android para eu ver os ficheiros descarregados.</p><button class="bt ouro" id="btAcessoFicheiros">Dar autorização</button>';
      $("#btAcessoFicheiros").onclick = () => { N.pedirAcessoFicheiros(); toast("Autorize e volte à app"); };
      return;
    }
    const fs = (r.ficheiros || []).sort((a, b) => b.data - a.data);
    if (!fs.length) { el.innerHTML = '<p class="suave pequeno">Nenhuma máscara nas Transferências. Descarregue um .hwt e toque em Atualizar.</p>'; return; }
    el.innerHTML = '<div class="lista"></div>';
    const lista = el.firstChild;
    fs.forEach((f) => {
      const b = document.createElement("button");
      const d = new Date(f.data);
      b.innerHTML = `${f.nome}<small>${tamanhoTxt(f.tamanho)} · ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}</small>`;
      b.onclick = async () => {
        carregar(true, "A ler " + f.nome + "…");
        try {
          const lido = N.lerTransferencia(f.caminho);
          if (!lido.ok) throw new Error(lido.erro || "não consegui ler");
          carregar(true, "A enviar para o relógio…");
          await instalarB64(lido.nome, lido.b64);
        } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
      };
      lista.append(b);
    });
  }
  $("#btAtualizarTransf").onclick = listarTransferencias;

  // máscara de teste já preparada (guardada no Cloudflare)
  $("#btMascaraTeste").onclick = async () => {
    carregar(true, "A ir buscar a máscara de teste…");
    try {
      const t = await fetch("/ci/dd675fde21f25243db694192/mascara-teste?t=" + Date.now()).then((r) => r.text());
      const b64 = t.split("\n").slice(1).join("").trim();
      if (b64.length < 1000) throw new Error("ainda não há máscara de teste preparada");
      carregar(true, "A enviar para o relógio…");
      const envio = res(N.instalar("gt3-melo-teste.hwt", b64), "Enviada. Veja o progresso na notificação e depois escolha-a no pulso.");
      if (envio && envio.ok) await guardarNaBiblioteca({ nome: "GT3 Melo teste", origem: "teste", ficheiro: true, capa: "" }, b64);
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

  // ---------- biblioteca ----------
  const ORIGENS = { minha: "feita por si", ia: "criada com IA", foto: "lida de uma foto", ficheiro: "ficheiro instalado", teste: "máscara de teste" };

  /** Guarda a máscara e, se vier ficheiro, o .hwt que foi para o relógio. */
  async function guardarNaBiblioteca(entrada, ficheiroB64) {
    try {
      const r = await api("/api/mascaras", entrada);
      if (ficheiroB64) await fetch("/api/ficheiro/" + r.id, { method: "POST", body: ficheiroB64 });
      return r;
    } catch (e) { toast("⚠ não consegui guardar na biblioteca: " + e.message); }
  }

  /** Imagem pequena para a galeria: a do ficheiro, ou o próprio mostrador desenhado. */
  async function capaDoHwt(pacote) {
    try {
      const f = pacote.zip.file("preview/cover.jpg") || pacote.zip.file("preview/icon_small.jpg");
      if (f) {
        const b64 = await f.async("base64");
        return await redimensionar("data:image/jpeg;base64," + b64, 180);
      }
    } catch (e) { /* segue para o desenho */ }
    try {
      // sem pré-visualização no ficheiro: desenhar o fundo principal da máscara
      const i = HWT.indiceFundo(pacote);
      if (i < 0) return "";
      const im = HWT.descodificar(pacote.bin, pacote.imgs[i]);
      const c = document.createElement("canvas");
      c.width = im.width; c.height = im.height;
      const x = c.getContext("2d");
      x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height);
      x.putImageData(im, 0, 0);
      return await redimensionar(c.toDataURL("image/jpeg", 0.85), 180);
    } catch (e) { return ""; }
  }

  /** Vai buscar o .hwt guardado e desenha a pré-visualização que faltava. */
  const capasTentadas = new Set();
  async function repararCapas(itens) {
    const semCapa = itens.filter((m) => m.ficheiro && !m.capa && !capasTentadas.has(m.id)).slice(0, 6);
    let feitas = 0;
    for (const m of semCapa) {
      capasTentadas.add(m.id);
      try {
        const b64 = (await fetch("/api/ficheiro/" + m.id + "?t=" + Date.now()).then((r) => r.text())).trim();
        if (b64.length < 500 || b64[0] === "{") continue;
        const pac = await HWT.abrir(ficheiroDe(b64, m.nome + ".hwt"));
        const capa = await capaDoHwt(pac);
        if (!capa) continue;
        m.capa = capa;
        if (!m.nome || /^(com\.huawei\.watchface|description\.xml)$/i.test(m.nome)) m.nome = pac.titulo || m.nome;
        await api("/api/mascaras", m);
        feitas++;
      } catch (e) { /* segue para a seguinte */ }
    }
    if (feitas) carregarGaleria();
  }

  // ---------- ficheiros abertos de fora (tocar num .hwt, ou partilhar) ----------
  function ficheiroDe(b64, nome) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const b = new Blob([u]);
    b.name = nome || "mascara.hwt";
    return b;
  }

  async function tratarFicheiroRecebido(p) {
    if (!p || !p.b64) return;
    pilha.length = 0; ir("mascaras", true);
    const el = $("#ficheiroRecebido");
    let nome = (p.nome || "mascara").replace(/\.zip$/i, "").replace(/\.hwt$/i, ""), capa = "", detalhe = "";
    try {
      const pac = await HWT.abrir(ficheiroDe(p.b64, p.nome));
      nome = pac.titulo || nome;
      capa = await capaDoHwt(pac);
      detalhe = pac.imgs.length + " imagens" + (pac.screen ? " · " + pac.screen : "");
      p.b64 = HWT.paraBase64(pac.bytes); // se vinha dentro de um .zip, vai só a máscara
    } catch (e) { detalhe = "não parece uma máscara Huawei — mesmo assim posso enviá-la"; }
    el.innerHTML = `<b>Ficheiro recebido</b>
      <div class="linha" style="margin:8px 0">
        ${capa ? `<img src="${capa}" style="width:84px;height:84px;border-radius:50%;object-fit:cover;border:2px solid var(--ouro)">` : ""}
        <div style="flex:1;min-width:140px"><b>${nome}</b><br><small class="suave">${detalhe}</small></div>
      </div>
      <div class="linha"><button class="bt ouro" id="btInstalarRecebido">Instalar no relógio</button><button class="bt" id="btDescartarRecebido">Agora não</button></div>`;
    el.classList.remove("escondido");
    $("#btDescartarRecebido").onclick = () => el.classList.add("escondido");
    $("#btInstalarRecebido").onclick = async () => {
      carregar(true, "A enviar para o relógio…");
      try {
        const envio = res(N.instalar(nome + ".hwt", p.b64), "Enviada. Veja o progresso na notificação e escolha-a depois no pulso.");
        if (envio && envio.ok) {
          await guardarNaBiblioteca({ nome, origem: "ficheiro", ficheiro: true, capa }, p.b64);
          el.classList.add("escondido");
          carregarGaleria();
        }
      } finally { carregar(false); }
    };
  }

  let janelaReparacao = false;

  // ---------- galeria de máscaras ----------
  /** Liga o toque longo de um item da biblioteca. */
  function toqueLongo(b, aoSegurar) {
    let t = null;
    const cancelar = () => { clearTimeout(t); t = null; };
    b.addEventListener("touchstart", () => { t = setTimeout(() => { t = null; aoSegurar(); }, 500); }, { passive: true });
    b.addEventListener("touchend", (ev) => { if (!t) ev.preventDefault(); cancelar(); });
    b.addEventListener("touchmove", cancelar, { passive: true });
    b.addEventListener("contextmenu", (ev) => { ev.preventDefault(); aoSegurar(); });
  }

  function miniatura(m, aoTocar) {
    const b = document.createElement("button"); b.className = "itemGaleria";
    const s = document.createElement("span"); s.textContent = m.nome;
    if (m.capa) {
      const img = document.createElement("img"); img.src = m.capa;
      b.append(img, s);
    } else if (m.ficheiro || !m.camadas) {
      // ficheiro sem pré-visualização: mostra um mostrador cinzento com o nome
      const c = document.createElement("canvas"); c.width = c.height = 180;
      const x = c.getContext("2d");
      x.fillStyle = "#1a1a1d"; x.fillRect(0, 0, 180, 180);
      x.strokeStyle = "#d4af37"; x.lineWidth = 4; x.beginPath(); x.arc(90, 90, 80, 0, Math.PI * 2); x.stroke();
      x.fillStyle = "#9a9aa2"; x.font = "600 18px Inter, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText("⌚", 90, 90);
      b.append(c, s);
    } else {
      const c = document.createElement("canvas"); c.width = c.height = 180;
      b.append(c, s);
      const desenha = () => { try { Estudio.desenhar(c, m, { redesenhar: desenha }); } catch (e) { /* desenho inválido */ } };
      desenha(); setTimeout(desenha, 600);
    }
    if (m.origem) { const o = document.createElement("small"); o.className = "suave"; o.textContent = ORIGENS[m.origem] || m.origem; b.append(o); }
    b.onclick = aoTocar;
    return b;
  }

  /** Cartão de ações de um item da biblioteca. */
  function mostrarAcoes(item, aoEditar) {
    const el = $("#acoesItem");
    const quando = item.alterada ? new Date(item.alterada) : null;
    el.innerHTML = `<b>${item.nome}</b>
      <p class="suave pequeno">${ORIGENS[item.origem] || "guardada"}${quando ? " · " + String(quando.getDate()).padStart(2, "0") + "/" + String(quando.getMonth() + 1).padStart(2, "0") + " " + String(quando.getHours()).padStart(2, "0") + ":" + String(quando.getMinutes()).padStart(2, "0") : ""}</p>
      <div class="linha">
        ${item.ficheiro ? '<button class="bt ouro" id="acInstalar">Instalar no relógio</button>' : '<button class="bt ouro" id="acEditar">Abrir no editor</button>'}
        ${item.ficheiro ? '<button class="bt" id="acAod">Converter em sempre ligado</button>' : ""}
        <button class="bt perigo" id="acApagar">Apagar</button>
        <button class="bt" id="acFechar">Fechar</button>
      </div>`;
    el.classList.remove("escondido");
    el.scrollIntoView({ block: "nearest" });
    $("#acFechar").onclick = () => el.classList.add("escondido");
    if ($("#acEditar")) $("#acEditar").onclick = () => { el.classList.add("escondido"); aoEditar(); };
    if ($("#acInstalar")) $("#acInstalar").onclick = () => instalarDaBiblioteca(item);
    if ($("#acAod")) $("#acAod").onclick = () => converterSempreLigado(item);
    $("#acApagar").onclick = async () => {
      if (!confirm("Apagar \"" + item.nome + "\" da biblioteca? O relógio fica na mesma.")) return;
      try { await api("/api/mascaras/" + item.id, null, "DELETE"); el.classList.add("escondido"); toast("Apagada"); carregarGaleria(); }
      catch (e) { toast("⚠ " + e.message); }
    };
  }

  /** Toque longo: mover a máscara na biblioteca ou apagá-la. */
  function mostrarOrganizar(item, itens) {
    const el = $("#acoesItem");
    const i = itens.findIndex((x) => x.id === item.id);
    el.innerHTML = `<b>Organizar: ${item.nome}</b>
      <p class="suave pequeno">Posição ${i + 1} de ${itens.length}</p>
      <div class="linha">
        <button class="bt" id="orgEsq" ${i <= 0 ? "disabled" : ""}>◀ Mover</button>
        <button class="bt" id="orgDir" ${i >= itens.length - 1 ? "disabled" : ""}>Mover ▶</button>
        <button class="bt" id="orgTopo" ${i <= 0 ? "disabled" : ""}>Pôr em primeiro</button>
        <button class="bt perigo" id="orgApagar">Apagar</button>
        <button class="bt" id="orgFechar">Fechar</button>
      </div>`;
    el.classList.remove("escondido");
    el.scrollIntoView({ block: "nearest" });
    $("#orgFechar").onclick = () => el.classList.add("escondido");
    const mover = async (destino) => {
      const novos = itens.slice();
      novos.splice(destino, 0, novos.splice(i, 1)[0]);
      carregar(true, "A arrumar…");
      try {
        for (let k = 0; k < novos.length; k++) {
          if (novos[k].ordem === k) continue;
          novos[k].ordem = k;
          await api("/api/mascaras", novos[k]);
        }
        el.classList.add("escondido");
        carregarGaleria();
      } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
    };
    if (i > 0) { $("#orgEsq").onclick = () => mover(i - 1); $("#orgTopo").onclick = () => mover(0); }
    if (i < itens.length - 1) $("#orgDir").onclick = () => mover(i + 1);
    $("#orgApagar").onclick = async () => {
      if (!confirm("Apagar \"" + item.nome + "\" da biblioteca? O relógio fica na mesma.")) return;
      carregar(true, "A apagar…");
      try { await api("/api/mascaras/" + item.id, null, "DELETE"); el.classList.add("escondido"); toast("Apagada"); carregarGaleria(); }
      catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
    };
  }

  /**
   * Pega numa máscara guardada e põe o mostrador dela também no ecrã sempre ligado.
   * A imagem do sempre ligado tem muito menos espaço, por isso escurece-se por passos
   * até o desenho caber — o que também é melhor para a bateria e para o ecrã.
   */
  async function converterSempreLigado(item) {
    carregar(true, "A ir buscar a máscara…");
    try {
      const b64 = (await fetch("/api/ficheiro/" + item.id + "?t=" + Date.now()).then((r) => r.text())).trim();
      if (b64.length < 500 || b64[0] === "{") throw new Error("o ficheiro desta máscara já não está guardado");
      const pac = await HWT.abrir(ficheiroDe(b64, item.nome + ".hwt"));
      const iF = HWT.indiceFundo(pac);
      if (iF < 0) throw new Error("não encontrei o mostrador principal nesta máscara");
      const iA = HWT.indiceAod(pac, iF);
      if (iA < 0) {
        // sem espaço de sempre ligado: usa a base habitual, se já houver uma
        const guardada = (await baseHabitual()) || (await baseIncluida());
        if (guardada) {
          toast("Sem ecrã apagado próprio — a usar a " + guardada.item.nome);
          return usarBase(item, pac, iF, guardada);
        }
        carregar(false);
        return escolherBase(item, pac, iF);
      }
      const fundo = HWT.descodificar(pac.bin, pac.imgs[iF]);
      const orig = document.createElement("canvas");
      orig.width = fundo.width; orig.height = fundo.height;
      orig.getContext("2d").putImageData(fundo, 0, 0);
      const alvo = pac.imgs[iA];
      let feito = null, usou = null;
      for (let k = 0; k < RECEITAS_AOD.length; k++) {
        carregar(true, "A ajustar o ecrã apagado (tentativa " + (k + 1) + ")…");
        try {
          feito = await HWT.construir(pac, [{ indice: iA, canvas: desenhoAod(orig, alvo.largura, alvo.altura, RECEITAS_AOD[k]) }], null, item.nome, item.capa || null);
          usou = RECEITAS_AOD[k];
          break;
        } catch (e) { /* não coube: receita seguinte */ }
      }
      const escuroUsado = usou && (usou.cor ? 1 : usou.escuro || 0);
      if (!feito) throw new Error("o mostrador desta máscara é detalhado demais para caber no espaço do sempre ligado");
      carregar(true, "A enviar para o relógio…");
      const novoB64 = HWT.paraBase64(feito.bytes);
      const nome = item.nome + " (sempre ligado)";
      const envio = res(N.instalar(nome + ".hwt", novoB64),
        "Enviada. No relógio, escolha esta máscara e ligue o \"Mostrar sempre\"." + (escuroUsado > 0.5 ? " Ficou mais escura para caber." : ""));
      if (envio && envio.ok) {
        await guardarNaBiblioteca({ nome, origem: "ficheiro", ficheiro: true, capa: item.capa || "" }, novoB64);
        $("#acoesItem").classList.add("escondido");
        carregarGaleria();
      }
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  }

  const pacotesEmCache = new Map();
  async function pacoteDe(id, nome) {
    if (pacotesEmCache.has(id)) return pacotesEmCache.get(id);
    const b64 = (await fetch("/api/ficheiro/" + id + "?t=" + Date.now()).then((r) => r.text())).trim();
    if (b64.length < 500 || b64[0] === "{") throw new Error("sem ficheiro guardado");
    const pac = await HWT.abrir(ficheiroDe(b64, (nome || "mascara") + ".hwt"));
    pacotesEmCache.set(id, pac);
    return pac;
  }

  /**
   * Formas de encolher um mostrador até caber no espaço do ecrã sempre ligado:
   * escurecer, depois apagar o que é escuro, e por fim deixar só o desenho numa cor.
   */
  const RECEITAS_AOD = [
    { escuro: 0.25 }, { escuro: 0.45 }, { escuro: 0.6 }, { escuro: 0.75 },
    { escuro: 0.82, limiar: 70 }, { escuro: 0.85, limiar: 110 }, { escuro: 0.88, limiar: 150 },
    { limiar: 140, cor: "#d4af37" }, { limiar: 180, cor: "#d4af37" }, { limiar: 210, cor: "#ffffff" },
  ];

  function desenhoAod(origem, largura, altura, receita) {
    const c = document.createElement("canvas");
    c.width = largura; c.height = altura;
    const x = c.getContext("2d");
    x.drawImage(origem, 0, 0, largura, altura);
    const d = x.getImageData(0, 0, largura, altura);
    const p = d.data;
    const corFixa = receita.cor ? [parseInt(receita.cor.slice(1, 3), 16), parseInt(receita.cor.slice(3, 5), 16), parseInt(receita.cor.slice(5, 7), 16)] : null;
    const escuro = receita.escuro || 0;
    for (let i = 0; i < p.length; i += 4) {
      const luz = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      if (receita.limiar && luz < receita.limiar) { p[i] = p[i + 1] = p[i + 2] = 0; p[i + 3] = 0; continue; }
      if (corFixa) { p[i] = corFixa[0]; p[i + 1] = corFixa[1]; p[i + 2] = corFixa[2]; continue; }
      if (escuro) { p[i] *= 1 - escuro; p[i + 1] *= 1 - escuro; p[i + 2] *= 1 - escuro; }
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  /** Base que vem com a app: uma máscara com ecrã sempre ligado, 466×466. */
  const URL_BASE_INCLUIDA = "https://raw.githubusercontent.com/pedromelomultibrico-sketch/gt3-melo/main/nucleo/base-aod.hwt";
  let baseIncluidaCache = null;
  async function baseIncluida() {
    if (baseIncluidaCache) return baseIncluidaCache;
    try {
      const bytes = new Uint8Array(await fetch(URL_BASE_INCLUIDA).then((r) => r.arrayBuffer()));
      const b = new Blob([bytes]); b.name = "base-aod.hwt";
      const pac = await HWT.abrir(b);
      const f = HWT.indiceFundo(pac);
      const a = f >= 0 ? HWT.indiceAod(pac, f) : -1;
      if (f < 0 || a < 0) return null;
      baseIncluidaCache = { item: { nome: "base incluída na app" }, pac, iF: f, iA: a, incluida: true };
      return baseIncluidaCache;
    } catch (e) { return null; }
  }

  /** A base que ficou marcada como habitual, se ainda servir. */
  async function baseHabitual() {
    try {
      const itens = await api("/api/mascaras");
      const m = itens.find((x) => x.basePadrao && x.ficheiro);
      if (!m) return null;
      const pac = await pacoteDe(m.id, m.nome);
      const f = HWT.indiceFundo(pac);
      const a = f >= 0 ? HWT.indiceAod(pac, f) : -1;
      if (f < 0 || a < 0) return null;
      return { item: m, pac, iF: f, iA: a };
    } catch (e) { return null; }
  }

  /**
   * A máscara escolhida não tem espaço de ecrã sempre ligado. Procura na biblioteca
   * outra que tenha, e usa-a como suporte: o desenho desta entra no mostrador e,
   * escurecido, no sempre ligado dessa.
   */
  async function escolherBase(item, pacOrigem, iF) {
    const el = $("#acoesItem");
    el.innerHTML = `<b>${item.nome}</b><p class="suave pequeno">Esta máscara não traz ecrã sempre ligado. Posso pôr o desenho dela numa máscara que tenha — os ponteiros e números passam a ser os dessa. A procurar máscaras que sirvam…</p>`;
    el.classList.remove("escondido");
    let itens = [];
    try { itens = await api("/api/mascaras"); } catch (e) { toast("⚠ " + e.message); return; }
    const candidatas = [];
    for (const c of itens.filter((x) => x.ficheiro && x.id !== item.id).slice(0, 10)) {
      try {
        const pac = await pacoteDe(c.id, c.nome);
        const f = HWT.indiceFundo(pac);
        if (f < 0) continue;
        const a = HWT.indiceAod(pac, f);
        if (a < 0) continue;
        candidatas.push({ item: c, pac, iF: f, iA: a });
      } catch (e) { /* segue */ }
    }
    if (!candidatas.length) {
      el.innerHTML = `<b>${item.nome}</b><p class="suave pequeno">Nenhuma das máscaras guardadas tem ecrã sempre ligado, por isso não há onde encaixar este desenho. Descarregue uma máscara que traga "AOD" ou "always on" e instale-a — depois esta conversão passa a funcionar.</p><button class="bt" id="acFechar2">Fechar</button>`;
      $("#acFechar2").onclick = () => el.classList.add("escondido");
      return;
    }
    el.innerHTML = `<b>${item.nome}</b>
      <p class="suave pequeno">Escolha a máscara que serve de suporte. O desenho da ${item.nome} fica no mostrador e no ecrã apagado; os ponteiros e números passam a ser os da escolhida.</p>
      <div class="lista" id="listaBases"></div>
      <button class="bt" id="acFechar2">Fechar</button>`;
    $("#acFechar2").onclick = () => el.classList.add("escondido");
    const lista = $("#listaBases");
    candidatas.forEach((c) => {
      const b = document.createElement("button");
      b.innerHTML = `${c.item.nome}<small>${c.pac.imgs[c.iF].largura}×${c.pac.imgs[c.iF].altura} · sempre ligado ${c.pac.imgs[c.iA].largura}×${c.pac.imgs[c.iA].altura}</small>`;
      b.onclick = () => usarBase(item, pacOrigem, iF, c);
      lista.append(b);
    });
  }

  /** Monta a máscara nova: desenho da original no mostrador e, escurecido, no sempre ligado. */
  async function usarBase(item, pacOrigem, iF, base) {
    carregar(true, "A montar a máscara…");
    try {
      const fundo = HWT.descodificar(pacOrigem.bin, pacOrigem.imgs[iF]);
      const orig = document.createElement("canvas");
      orig.width = fundo.width; orig.height = fundo.height;
      orig.getContext("2d").putImageData(fundo, 0, 0);
      const imF = base.pac.imgs[base.iF], imA = base.pac.imgs[base.iA];
      const mostrador = document.createElement("canvas");
      mostrador.width = imF.largura; mostrador.height = imF.altura;
      mostrador.getContext("2d").drawImage(orig, 0, 0, imF.largura, imF.altura);
      let feito = null, usou = null;
      for (let k = 0; k < RECEITAS_AOD.length; k++) {
        const r = RECEITAS_AOD[k];
        carregar(true, "A ajustar o ecrã apagado (tentativa " + (k + 1) + ")…");
        try {
          feito = await HWT.construir(base.pac, [
            { indice: base.iF, canvas: mostrador },
            { indice: base.iA, canvas: desenhoAod(orig, imA.largura, imA.altura, r) },
          ], null, item.nome, item.capa || null);
          usou = r;
          break;
        } catch (e) { /* não coube: receita seguinte */ }
      }
      if (!feito) throw new Error("o desenho é detalhado demais para caber nesta base; tente outra");
      const escuroUsado = usou && (usou.cor ? 1 : usou.escuro || 0);
      carregar(true, "A enviar para o relógio…");
      const b64 = HWT.paraBase64(feito.bytes);
      const nome = item.nome + " (sempre ligado)";
      const envio = res(N.instalar(nome + ".hwt", b64),
        "Enviada. No relógio, escolha-a e ligue o \"Mostrar sempre\"." + (escuroUsado > 0.5 ? " Ficou mais escura para caber." : ""));
      if (envio && envio.ok) {
        await guardarNaBiblioteca({ nome, origem: "ficheiro", ficheiro: true, capa: item.capa || "" }, b64);
        if (!base.item.basePadrao) { base.item.basePadrao = true; try { await api("/api/mascaras", base.item); } catch (e) { /* nada */ } }
        $("#acoesItem").classList.add("escondido");
        carregarGaleria();
      }
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  }

  /** Reinstala um ficheiro guardado. */
  async function instalarDaBiblioteca(item) {
    carregar(true, "A ir buscar o ficheiro…");
    try {
      const b64 = (await fetch("/api/ficheiro/" + item.id + "?t=" + Date.now()).then((r) => r.text())).trim();
      if (b64.length < 500 || b64[0] === "{") throw new Error("o ficheiro já não está guardado");
      carregar(true, "A enviar para o relógio…");
      res(N.instalar((item.nome || "mascara") + ".hwt", b64), "Enviada. Escolha-a depois no pulso.");
      $("#acoesItem").classList.add("escondido");
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  }
  $("#listaModelos").append(...Estudio.MODELOS.map((m) => miniatura(m, () => abrirEditor(JSON.parse(JSON.stringify({ ...m, id: undefined, nome: m.nome + " (cópia)" }))))));
  async function carregarGaleria() {
    const el = $("#listaMascaras");
    try {
      const itens = await api("/api/mascaras");
      el.innerHTML = "";
      if (!itens.length) el.innerHTML = '<p class="suave pequeno">Ainda não guardou nenhuma máscara.</p>';
      if (!janelaReparacao) { janelaReparacao = true; setTimeout(() => { janelaReparacao = false; repararCapas(itens); }, 300); }
      itens.sort((a, b) => {
        const oa = a.ordem === undefined ? 1e9 : a.ordem, ob = b.ordem === undefined ? 1e9 : b.ordem;
        return oa !== ob ? oa - ob : (b.alterada || 0) - (a.alterada || 0);
      });
      itens.forEach((m) => {
        let b;
        if (m.ficheiro) {
          b = miniatura(m, () => mostrarAcoes(m, null));
          toqueLongo(b, () => mostrarOrganizar(m, itens));
        } else {
          const n = Estudio.normalizar(m); n.id = m.id; n.origem = m.origem; n.alterada = m.alterada; n.ordem = m.ordem;
          b = miniatura(n, () => mostrarAcoes(n, () => abrirEditor(n)));
          toqueLongo(b, () => mostrarOrganizar(n, itens));
        }
        el.append(b);
      });
    } catch (e) { el.innerHTML = '<p class="suave pequeno">Sem ligação à biblioteca.</p>'; }
  }
  $("#btNovaMascara").onclick = () => abrirEditor(Estudio.nova());
  $("#btAtualizarBiblio").onclick = carregarGaleria;

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
      m.origem = "ia";
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
      const desenho = extrairJson(t); desenho.origem = "foto";
      abrirEditor(desenho);
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
      const desenho = extrairJson(t); desenho.origem = "foto";
      abrirEditor(desenho);
      toast("Desenho lido da foto — afine no editor");
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };

  // ---------- editor ----------
  let m = null, mPrincipal = null, variante = "normal", sel = null, tick = null, pacoteHwt = null, alvoHwt = -1, alvoAod = -1;
  const tela = $("#tela");
  function redesenhar() { if (m) Estudio.desenhar(tela, m, { estado: { ...estado, data: new Date() }, selecionada: sel, redesenhar }); }

  function abrirEditor(mascara) {
    mPrincipal = Estudio.normalizar(mascara);
    if (mPrincipal.aod) mPrincipal.aod = Estudio.normalizar(mPrincipal.aod);
    variante = "normal"; m = mPrincipal; sel = null;
    $("#aodLigado").checked = !!mPrincipal.aodLigado;
    marcarVariante();
    $("#edNome").value = m.nome;
    preencherFundo(); listarCamadas();
    $$("#abasEditor button").forEach((x, i) => x.classList.toggle("ativo", i === 0));
    $$(".aba").forEach((a, i) => a.classList.toggle("ativo", i === 0));
    ir("editor");
    clearInterval(tick); tick = setInterval(() => { if ($("#ecra-editor").classList.contains("ativo")) redesenhar(); }, 1000);
    redesenhar();
  }
  $("#btVoltarGaleria").onclick = () => ir("mascaras");
  $("#edNome").oninput = (e) => { m.nome = e.target.value; if (variante === "normal") mPrincipal.nome = e.target.value; };

  function marcarVariante() {
    $$("#variantes [data-var]").forEach((b) => b.classList.toggle("ouro", b.dataset.var === variante));
  }
  function trocarVariante(v) {
    if (v === variante) return;
    if (v === "aod" && !mPrincipal.aod) {
      // começa como cópia do mostrador normal
      const copia = JSON.parse(JSON.stringify({ nome: mPrincipal.nome + " — sempre ligado", fundo: mPrincipal.fundo, camadas: mPrincipal.camadas }));
      mPrincipal.aod = Estudio.normalizar(copia);
    }
    variante = v;
    m = v === "aod" ? mPrincipal.aod : mPrincipal;
    sel = null;
    marcarVariante();
    $("#edNome").value = m.nome;
    preencherFundo(); listarCamadas(); redesenhar();
    if (v === "aod") toast("A editar o ecrã sempre ligado");
  }
  $$("#variantes [data-var]").forEach((b) => (b.onclick = () => trocarVariante(b.dataset.var)));
  $("#aodLigado").onchange = (e) => {
    mPrincipal.aodLigado = e.target.checked;
    if (e.target.checked && !mPrincipal.aod) trocarVariante("aod");
  };

  /** Um toque: o mostrador tal como está passa a ser também o ecrã sempre ligado. */
  $("#btCopiarParaAod").onclick = () => {
    if (mPrincipal.aod && !confirm("Já tem um desenho próprio no sempre ligado. Substituir pelo mostrador atual?")) return;
    const copia = JSON.parse(JSON.stringify({ nome: mPrincipal.nome + " — sempre ligado", fundo: mPrincipal.fundo, camadas: mPrincipal.camadas }));
    mPrincipal.aod = Estudio.normalizar(copia);
    mPrincipal.aodLigado = true;
    $("#aodLigado").checked = true;
    if (variante === "aod") { m = mPrincipal.aod; sel = null; $("#edNome").value = m.nome; preencherFundo(); listarCamadas(); redesenhar(); }
    toast("Esta face passa a ir também para o sempre ligado");
  };
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
    try { const r = await api("/api/mascaras", mPrincipal); mPrincipal.id = r.id; toast("Máscara guardada"); } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };
  $("#btDuplicar").onclick = () => { const c = JSON.parse(JSON.stringify(mPrincipal)); delete c.id; c.nome = mPrincipal.nome + " (cópia)"; abrirEditor(c); toast("Cópia criada — guarde para manter"); };
  $("#btApagar").onclick = async () => {
    if (!mPrincipal.id) return ir("mascaras");
    if (!confirm("Apagar a máscara \"" + mPrincipal.nome + "\"?")) return;
    try { await api("/api/mascaras/" + mPrincipal.id, null, "DELETE"); toast("Apagada"); ir("mascaras"); } catch (e) { toast("⚠ " + e.message); }
  };

  // exportar
  function renderDe(mascara, soEstatico, lado) { const c = document.createElement("canvas"); c.width = c.height = lado || 466; Estudio.desenhar(c, mascara, { estado: { ...estado, data: new Date() }, soEstatico }); return c; }
  function render(soEstatico, lado) { return renderDe(m, soEstatico, lado); }
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
      alvoAod = HWT.indiceAod(pacoteHwt, alvoHwt);
      const fundo = pacoteHwt.imgs[alvoHwt];
      const aod = alvoAod >= 0 ? pacoteHwt.imgs[alvoAod] : null;
      const linhaAod = aod
        ? `<br>Sempre ligado: imagem ${aod.largura}×${aod.altura} encontrada.`
        : "<br>Esta base não traz imagem de ecrã sempre ligado.";
      const aviso = alvoHwt < 0
        ? "<br>⚠ Esta base não tem fundo principal para substituir (só sobreposições). Escolha outra máscara."
        : "";
      $("#hwtInfo").innerHTML = `Base: <b>${pacoteHwt.titulo}</b> ${pacoteHwt.screen ? "(" + pacoteHwt.screen + ")" : ""}<br>${pacoteHwt.imgs.length} imagens. A trocar (dourada): ${fundo ? fundo.largura + "×" + fundo.altura : "nenhuma"} — toque noutra para mudar.${linhaAod}${aviso}`;
      $("#btEnviarRelogio").disabled = $("#btGuardarHwt").disabled = alvoHwt < 0;
    } catch (err) { pacoteHwt = null; $("#hwtInfo").textContent = "⚠ " + err.message; $("#btEnviarRelogio").disabled = $("#btGuardarHwt").disabled = true; }
    finally { carregar(false); e.target.value = ""; }
  };
  async function construirHwt() {
    const soEst = $("#hwtSoEstatico").checked;
    const capa = renderDe(mPrincipal, false, 466).toDataURL("image/jpeg", 0.9);
    const trocas = [{ indice: alvoHwt, canvas: renderDe(mPrincipal, soEst) }];
    if (mPrincipal.aodLigado) {
      if (alvoAod < 0) throw new Error("esta base não tem imagem de ecrã sempre ligado; escolha outra ou desligue essa opção");
      trocas.push({ indice: alvoAod, canvas: renderDe(mPrincipal.aod || mPrincipal, soEst) });
    }
    return HWT.construir(pacoteHwt, trocas, null, mPrincipal.nome, capa);
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
      const b64 = HWT.paraBase64(r.bytes);
      const envio = res(N.instalar(nomeFicheiro() + ".hwt", b64), "Enviado. O relógio mostra o progresso; depois escolha a máscara no pulso." + (r.bits < 8 ? " (cores reduzidas para caber)" : ""));
      if (envio && envio.ok) {
        carregar(true, "A guardar na biblioteca…");
        mPrincipal.origem = mPrincipal.origem || "minha";
        const g = await guardarNaBiblioteca(mPrincipal, b64);
        if (g) mPrincipal.id = g.id;
      }
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  };

  // ---------- arranque ----------
  $("#vInterface").textContent = VERSAO_INTERFACE;
  $("#vNucleo").textContent = N.real ? N.versaoNome() + " (" + N.versao() + ")" : "navegador (sem relógio)";
  atualizarDados();
  verAtualizacao(false);
  verFicheiroPendente();
  setInterval(() => { if ($("#ecra-inicio").classList.contains("ativo")) mostrarDispositivo(N.dispositivos()); }, 15000);
  document.fonts && document.fonts.ready.then(() => redesenhar());
})();
