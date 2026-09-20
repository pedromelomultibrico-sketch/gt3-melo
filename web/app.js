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
    $$("#navegacao button").forEach((b) => b.classList.toggle("ativo", b.dataset.ecra === ecra || (ecra === "editor" && b.dataset.ecra === "mascaras") || (ecra === "aod" && b.dataset.ecra === "biblioteca")));
    if (ecra !== "biblioteca") { const a = $("#acoesItem"); if (a) a.classList.add("escondido"); }
    window.scrollTo(0, 0);
    if (ecra === "biblioteca") carregarGaleria();
    if (ecra === "inicio") atualizarDados();
    if (ecra === "relogio") listarTransferencias();
  }
  window.voltar = function () { if (!pilha.length) return false; ir(pilha.pop(), true); return true; };
  $$("#navegacao button").forEach((b) => (b.onclick = () => { pilha.length = 0; ir(b.dataset.ecra, true); }));

  /** Com vários aparelhos emparelhados, deixa escolher qual é o relógio. */
  function mostrarEscolhaAparelhos(lista) {
    const cartao = $("#escolhaRelogio");
    if (!cartao) return;
    if (!lista || lista.length < 2) { cartao.classList.add("escondido"); return; }
    cartao.classList.remove("escondido");
    const el = $("#listaAparelhos");
    el.innerHTML = "";
    if (!N.podeEscolher) {
      el.innerHTML = '<p class="suave pequeno">A app está a usar <b>' + ((lista.find((x) => x.usado) || lista[0]).nome || "o primeiro da lista")
        + '</b>. Para poder escolher, atualize o núcleo em Mais › Procurar atualização.</p>';
      return;
    }
    lista.forEach((x) => {
      const b = document.createElement("button");
      b.className = "bt pequeno" + (x.usado ? " ouro" : "");
      b.textContent = (x.audio ? "🎧 " : "⌚ ") + (x.nome || x.endereco || "aparelho");
      b.onclick = async () => {
        const r = N.escolherRelogio(x.endereco || "");
        if (!r || !r.ok) return toast("⚠ " + ((r && r.erro) || "não consegui escolher"));
        toast("A trabalhar com " + (x.nome || "este aparelho"));
        atualizarDados();
      };
      el.append(b);
    });
  }

  // ---------- estado do relógio ----------
  const estado = { bateria: -1, passos: -1, fc: -1 };
  function mostrarDispositivo(info) {
    const lista = (info && info.dispositivos) || [];
    // o que a app está mesmo a usar, não simplesmente o primeiro da lista
    const d = lista.find((x) => x.usado) || lista[0];
    mostrarEscolhaAparelhos(lista);
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
        <button class="bt ouro" id="acInstalar">Instalar no relógio</button>
        <button class="bt" id="acConverter">Converter em sempre ligado</button>
        <button class="bt" id="acAod">Editar sempre ligado</button>
        ${item.ficheiro ? "" : '<button class="bt" id="acEditar">Abrir no editor</button>'}
        <button class="bt perigo" id="acApagar">Apagar</button>
        <button class="bt" id="acFechar">Fechar</button>
      </div>`;
    el.classList.remove("escondido");
    el.scrollIntoView({ block: "nearest" });
    $("#acFechar").onclick = () => el.classList.add("escondido");
    if ($("#acEditar")) $("#acEditar").onclick = () => { el.classList.add("escondido"); aoEditar(); };
    if ($("#acInstalar")) $("#acInstalar").onclick = () => (item.ficheiro ? instalarDaBiblioteca(item) : instalarDesenho(item));
    if ($("#acAod")) $("#acAod").onclick = () => (item.ficheiro ? abrirEditorAod(item) : abrirEditorAodDesenho(item));
    // o mesmo caminho, mas sem parar no editor: a app escolhe e envia
    if ($("#acConverter")) $("#acConverter").onclick = () => (item.ficheiro ? abrirEditorAod(item, true) : abrirEditorAodDesenho(item, true));
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
  // ---------- editor do ecrã sempre ligado ----------
  const AOD = { item: null, pac: null, iF: -1, iA: -1, base: null, orig: null, mostrador: null, cor: "#ffffff", cabe: false, tarefa: 0 };

  function telaDe(imageData) {
    const c = document.createElement("canvas");
    c.width = imageData.width; c.height = imageData.height;
    c.getContext("2d").putImageData(imageData, 0, 0);
    return c;
  }

  /** Abre o editor do ecrã sempre ligado para uma máscara já guardada. */
  async function abrirEditorAod(item, converter) {
    carregar(true, "A ir buscar a máscara…");
    try {
      const b64 = (await fetch("/api/ficheiro/" + item.id + "?t=" + Date.now()).then((r) => r.text())).trim();
      if (b64.length < 500 || b64[0] === "{") throw new Error("o ficheiro desta máscara já não está guardado");
      const pac = await HWT.abrir(ficheiroDe(b64, item.nome + ".hwt"));
      const iF = HWT.indiceFundo(pac);
      if (iF < 0) throw new Error("não encontrei o mostrador principal nesta máscara");
      // o ecrã sempre ligado vive no aod.bin quando a máscara o traz
      const alvo = HWT.alvoAod(pac);
      const iA = alvo && alvo.onde === "wf" ? alvo.indice : -1;
      // a face muitas vezes está repartida por várias imagens do tamanho do ecrã
      // primeiro pelo desenho da máscara (sem a pré-visualização nem os
      // ponteiros parados); só se isso não der é que se juntam as chapas todas
      let orig = HWT.faceDoDesenho(pac);
      if (!orig || riquezaTela(orig) < 0.01) orig = HWT.faceComposta(pac, iA) || telaDe(HWT.descodificar(pac.bin, pac.imgs[iF]));
      // se mesmo assim sair preta, resta a pré-visualização que vem no ficheiro
      let daCapa = false;
      if (riquezaTela(orig) < 0.01) {
        const capa = await faceDaCapa(pac);
        if (capa) { orig = capa; daCapa = true; }
      }
      AOD.daCapa = daCapa;
      if (!alvo) {
        const guardada = (await baseHabitual()) || (await baseIncluida());
        carregar(false);
        if (!guardada) return escolherBase(item, orig, converter);
        return abrirEditorAodComBase(item, orig, guardada, converter);
      }
      await montarEditorAod(item, orig, pac, alvo, null, null, converter);
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  }

  /** Máscara desenhada por mim: não é um ficheiro, por isso assenta sempre numa base. */
  async function abrirEditorAodDesenho(item, converter) {
    carregar(true, "A preparar o desenho…");
    try {
      const base = (await baseHabitual()) || (await baseIncluida());
      if (!base) throw new Error("não há nenhuma máscara com ecrã sempre ligado para servir de suporte");
      AOD.daCapa = false;
      await abrirEditorAodComBase(item, renderDe(Estudio.normalizar(item), true, 466), base, converter);
    } catch (e) { toast("⚠ " + e.message); carregar(false); }
  }

  /** O desenho não tem espaço próprio para o sempre ligado: vai assente noutra máscara. */
  async function abrirEditorAodComBase(item, orig, base, converter) {
    carregar(true, "A encaixar o mostrador…");
    try {
      const imF = base.pac.imgs[base.iF];
      const mostrador = ajustar(orig, imF.largura, imF.altura, null, RECEITAS_FUNDO, desenhoFundo);
      if (!mostrador) throw new Error("não consegui encaixar o desenho nesta base; escolha outra");
      await montarEditorAod(item, orig, base.pac, base.alvo, base, mostrador, converter);
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  }

  async function montarEditorAod(item, orig, pac, alvo, base, mostrador, converter) {
    AOD.item = item; AOD.pac = pac; AOD.alvo = alvo;
    AOD.base = base || null; AOD.mostrador = mostrador || null;
    AOD.orig = orig;
    if (converter) return converterEInstalar();
    $("#aodNome").textContent = item.nome;
    $("#aodTrocarBase").classList.toggle("escondido", !base);
    const aviso = $("#aodAviso");
    if (base) {
      const capa = await capaDoZip(base.pac);
      aviso.innerHTML = (capa ? `<img src="${capa}" alt="">` : "")
        + `<p class="pequeno"><b>Esta máscara não reserva espaço para o sempre ligado.</b></p>`
        + `<p class="suave pequeno">Para a usar assim, o desenho dela tem de assentar noutra máscara de suporte — a <b>${base.item.nome}</b>. Os ponteiros e os números que vai ver no relógio passam a ser os dessa máscara, não os da original.</p>`;
      if (AOD.daCapa) aviso.innerHTML += NOTA_CAPA;
      aviso.classList.remove("escondido");
    } else if (AOD.daCapa) {
      aviso.innerHTML = NOTA_CAPA;
      aviso.classList.remove("escondido");
    } else {
      aviso.classList.add("escondido");
    }
    // ponto de partida: o que a app escolheria sozinha
    const img = AOD.alvo.im;
    const sugerida = melhorAod(AOD.orig, img.largura, img.altura);
    const r = (sugerida && sugerida.receita) || { fracao: 0.12, suave: 1, cor: "#ffffff" };
    $("#aodQuanto").value = Math.round((r.fracao || 0.12) * 100);
    $("#aodSuave").value = r.suave || 0;
    $("#aodPolo").value = r.acender || "auto";
    definirCorAod(r.cor || "");
    ir("aod");
    desenharAod(true);
  }

  /**
   * Um toque só: a app escolhe o ponto do sempre ligado, monta e envia.
   * Quem quiser mexer nos valores tem o editor ao lado.
   */
  async function converterEInstalar() {
    const img = AOD.alvo.im;
    carregar(true, "A tirar o sempre ligado do mostrador…");
    const s = melhorAod(AOD.orig, img.largura, img.altura);
    if (!s) throw new Error("não consegui tirar um sempre ligado deste mostrador — use \"Editar sempre ligado\"");
    const aceso = medir(s.canvas, null, true).aceso;
    if (aceso > LIMITE_ACESO) throw new Error("este mostrador acenderia " + Math.round(aceso * 100) + "% do ecrã o dia inteiro — use \"Editar sempre ligado\" para o baixar");
    AOD.previa = s.canvas;
    AOD.cabe = true;
    await instalarAod();
  }

  const NOTA_CAPA = `<p class="pequeno"><b>Não consegui remontar a face a partir do ficheiro.</b></p>`
    + `<p class="suave pequeno">Estou a usar a imagem de pré-visualização que vem dentro da máscara. O desenho é o certo, mas os ponteiros ficam parados na posição em que a fábrica os desenhou — no relógio vai vê-los duas vezes, os parados e os que andam. Se não gostar, baixe o "quanto fica aceso" até só ficarem os números e os traços.</p>`;

  /** Quanto desenho visível tem este canvas (0 = está preto). */
  function riquezaTela(c) {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && d[i] + d[i + 1] + d[i + 2] > 60) n++;
    return n / (d.length / 4);
  }

  /**
   * Saída de recurso: a imagem de pré-visualização que vem dentro do .hwt.
   * Mostra sempre o mostrador como ele é, mas com os ponteiros parados na
   * posição em que a fábrica os desenhou.
   */
  async function faceDaCapa(pac) {
    const url = await capaDoZip(pac);
    if (!url) return null;
    try {
      const im = await new Promise((ok, erro) => {
        const i = new Image();
        i.onload = () => ok(i); i.onerror = () => erro(new Error("capa ilegível"));
        i.src = url;
      });
      const L = 466;
      const c = document.createElement("canvas");
      c.width = c.height = L;
      const x = c.getContext("2d");
      x.fillStyle = "#000"; x.fillRect(0, 0, L, L);
      const e = Math.max(L / im.width, L / im.height);
      x.drawImage(im, (L - im.width * e) / 2, (L - im.height * e) / 2, im.width * e, im.height * e);
      return c;
    } catch (e) { return null; }
  }

  /** A capa que vem dentro do .hwt, para mostrar de que máscara são os ponteiros. */
  async function capaDoZip(pac) {
    try {
      const f = pac.zip.file("preview/cover.jpg") || pac.zip.file("preview/cover.png");
      if (!f) return "";
      const b = await f.async("base64");
      return "data:image/jpeg;base64," + b;
    } catch (e) { return ""; }
  }

  function definirCorAod(cor) {
    AOD.cor = cor;
    $$("#aodCores .bt").forEach((b) => {
      const meu = b.dataset.cor === "pers" ? (cor && cor !== "#ffffff" && cor !== "#d4af37") : b.dataset.cor === cor;
      b.classList.toggle("ouro", !!meu);
    });
    $("#aodCorPers").classList.toggle("escondido", !(cor && cor !== "#ffffff" && cor !== "#d4af37"));
  }

  function receitaAodDosControlos() {
    const r = { fracao: (+$("#aodQuanto").value) / 100 };
    const s = +$("#aodSuave").value;
    if (s) r.suave = s;
    if (AOD.cor) r.cor = AOD.cor; else r.niveis = 5;
    const polo = $("#aodPolo").value;
    if (polo !== "auto") r.acender = polo;
    return r;
  }

  /** Redesenha as duas pré-visualizações; a conta do espaço é feita a seguir, sem travar. */
  function desenharAod(agora) {
    if (!AOD.pac) return;
    $("#aodQuantoV").textContent = $("#aodQuanto").value + "%";
    $("#aodSuaveV").textContent = $("#aodSuave").value + " px";
    const alvo = AOD.alvo.im;
    const face = AOD.mostrador ? AOD.mostrador.canvas : AOD.orig;
    pintarRedondo($("#aodMostrador"), face);
    const c = desenhoAod(AOD.orig, alvo.largura, alvo.altura, receitaAodDosControlos());
    AOD.previa = c;
    pintarRedondo($("#aodApagado"), c);
    $("#aodEspaco").textContent = "A medir…";
    $("#aodEspaco").className = "pequeno suave";
    $("#aodInstalar").disabled = true;
    clearTimeout(AOD.tarefa);
    AOD.tarefa = setTimeout(medirAod, agora ? 0 : 260);
  }

  /**
   * O espaço deixou de ser um travão: a tabela das imagens é refeita e o
   * desenho ocupa o que precisar. O que se mede agora é o consumo — quanto
   * ecrã fica aceso, que é o que gasta bateria e marca o painel.
   */
  function medirAod() {
    const m = medir(AOD.previa, null, true);
    AOD.cabe = m.aceso >= MINIMO_ACESO && m.aceso <= LIMITE_ACESO;
    const e = $("#aodEspaco");
    const demais = m.aceso > MAXIMO_ACESO;
    $("#aodMaximo").classList.toggle("escondido", AOD.cabe && !demais);
    if (m.aceso > LIMITE_ACESO) {
      e.textContent = "Ficaria " + Math.round(m.aceso * 100) + "% do ecrã aceso o dia inteiro — isso marca o painel. Baixe o \"quanto fica aceso\" ou troque o que acende.";
      e.style.color = "var(--perigo)";
    } else if (!AOD.cabe) {
      e.textContent = "Ficaria praticamente tudo apagado. Suba o \"quanto fica aceso\".";
      e.style.color = "var(--perigo)";
    } else if (demais) {
      e.textContent = "Fica " + Math.round(m.aceso * 1000) / 10 + "% do ecrã aceso — é muito para um sempre ligado: gasta bateria e marca o ecrã.";
      e.style.color = "var(--ouro)";
    } else {
      e.textContent = Math.round(m.aceso * 1000) / 10 + "% do ecrã fica aceso.";
      e.style.color = "var(--ok)";
    }
    e.className = "pequeno";
    $("#aodInstalar").disabled = !AOD.cabe;
  }

  /** Desenha num canvas de pré-visualização, recortado em círculo sobre preto. */
  function pintarRedondo(destino, fonte) {
    const x = destino.getContext("2d"), L = destino.width;
    x.save();
    x.clearRect(0, 0, L, L);
    x.beginPath(); x.arc(L / 2, L / 2, L / 2, 0, Math.PI * 2); x.clip();
    x.fillStyle = "#000"; x.fillRect(0, 0, L, L);
    x.drawImage(fonte, 0, 0, L, L);
    x.restore();
  }

  async function instalarAod() {
    if (!AOD.cabe) return;
    carregar(true, "A montar o ficheiro…");
    try {
      const trocas = [];
      if (AOD.base) trocas.push({ indice: AOD.base.iF, canvas: AOD.mostrador.canvas });
      trocas.push({ onde: AOD.alvo.onde, indice: AOD.alvo.indice, canvas: AOD.previa, transparente: true });
      const feito = await HWT.construir(AOD.pac, trocas, null, AOD.item.nome, AOD.item.capa || null,
        { ponteirosAod: $("#aodPonteiros").checked });
      carregar(true, "A enviar para o relógio…");
      const b64 = HWT.paraBase64(feito.bytes);
      const nome = AOD.item.nome + " (sempre ligado)";
      const envio = res(N.instalar(nome + ".hwt", b64), "Enviada. No relógio, escolha-a e ligue o \"Mostrar sempre\".");
      if (envio && envio.ok) {
        await guardarNaBiblioteca({ nome, origem: "ficheiro", ficheiro: true, capa: AOD.item.capa || "" }, b64);
        if (AOD.base && !AOD.base.incluida && !AOD.base.item.basePadrao) {
          AOD.base.item.basePadrao = true;
          try { await api("/api/mascaras", AOD.base.item); } catch (e) { /* nada */ }
        }
        ir("biblioteca", true);
      }
    } catch (e) { toast("⚠ " + e.message); } finally { carregar(false); }
  }

  /** Procura o maior "quanto fica aceso" que ainda é sensato para um sempre ligado. */
  function porNoMaximoAod() {
    const alvo = AOD.alvo.im, campo = $("#aodQuanto"), antes = campo.value;
    let baixo = +campo.min, alto = +campo.max, melhor = 0;
    while (baixo <= alto) {
      const meio = Math.floor((baixo + alto) / 2);
      campo.value = meio;
      const c = desenhoAod(AOD.orig, alvo.largura, alvo.altura, receitaAodDosControlos());
      const m = medir(c, null, true);
      if (m.aceso <= MAXIMO_ACESO) { if (m.aceso >= MINIMO_ACESO) melhor = meio; baixo = meio + 1; } else alto = meio - 1;
    }
    if (!melhor) {
      campo.value = antes;
      toast("Não encontrei um ponto bom. Mexa na suavização ou escolha uma cor só.");
      return;
    }
    campo.value = melhor;
    desenharAod(true);
  }

  $("#aodMaximo").onclick = porNoMaximoAod;
  $("#btVoltarAod").onclick = () => ir("biblioteca", true);
  $("#aodQuanto").oninput = () => desenharAod();
  $("#aodSuave").oninput = () => desenharAod();
  $("#aodPolo").onchange = () => desenharAod();
  $("#aodCorPers").oninput = (e) => { definirCorAod(e.target.value); desenharAod(); };
  $$("#aodCores .bt").forEach((b) => (b.onclick = () => {
    definirCorAod(b.dataset.cor === "pers" ? $("#aodCorPers").value : b.dataset.cor);
    desenharAod();
  }));
  $("#aodInstalar").onclick = instalarAod;
  $("#aodTrocarBase").onclick = () => { ir("biblioteca", true); escolherBase(AOD.item, AOD.orig); };

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
  /** Abaixo disto o ecrã sempre ligado ficaria praticamente preto — não serve. */
  const MINIMO_ACESO = 0.004;
  /**
   * Acima disto já não é um sempre ligado, é um mostrador aceso: gasta bateria
   * e marca o painel. Enquanto o tamanho em bytes travava o desenho, este
   * limite quase nunca chegava a contar; agora é ele que manda.
   */
  const MAXIMO_ACESO = 0.2;
  /** Onde a app aponta sozinha, antes de o Sr. Pedro mexer nos comandos. */
  const ALVO_ACESO = 0.1;
  /** Daqui para cima não se deixa instalar: seria meio ecrã aceso o dia todo. */
  const LIMITE_ACESO = 0.5;

  /** Mostradores escuros: guarda as cores do que está aceso. */
  const RECEITAS_COR = [
    { fracao: 0.22, niveis: 6 }, { fracao: 0.16, niveis: 5 },
    { suave: 1, fracao: 0.12, niveis: 5 }, { suave: 1, fracao: 0.09, niveis: 4 },
  ];
  /** A uma cor só: ocupa muito menos espaço, por isso cabe muito mais desenho. */
  const RECEITAS_UMA_COR = [
    { suave: 1, fracao: 0.2, cor: "#ffffff" }, { suave: 1, fracao: 0.16, cor: "#ffffff" },
    { suave: 1, fracao: 0.13, cor: "#ffffff" }, { suave: 1, fracao: 0.1, cor: "#d4af37" },
    { suave: 2, fracao: 0.08, cor: "#d4af37" }, { suave: 2, fracao: 0.06, cor: "#ffffff" },
    { suave: 2, fracao: 0.04, cor: "#ffffff" }, { suave: 3, fracao: 0.025, cor: "#ffffff" },
    { suave: 3, fracao: 0.015, cor: "#ffffff" },
  ];
  const RECEITAS_AOD = RECEITAS_COR.concat(RECEITAS_UMA_COR);

  /**
   * Num mostrador de fundo claro o desenho tem de ser invertido, e aí as cores
   * originais já não servem de nada: vale mais uma cor só, que cabe muito melhor.
   */
  /**
   * O ponto de partida do sempre ligado. A escolha automática de polaridade
   * engana-se às vezes — num mostrador fotografado chega a acender o ecrã
   * inteiro — por isso experimentam-se também as duas polaridades à mão e
   * fica a que der um ecrã bem aceso sem ser um farol.
   */
  function melhorAod(origem, largura, altura) {
    const receitas = receitasAod(origem, largura, altura);
    const tenta = (acender) => ajustar(origem, largura, altura, null,
      acender ? receitas.map((r) => Object.assign({}, r, { acender })) : receitas,
      desenhoAod, MINIMO_ACESO, true, ALVO_ACESO);
    const dentro = (x) => x && x.aceso >= MINIMO_ACESO && x.aceso <= ALVO_ACESO;
    let melhor = null;
    for (const polo of [null, "claro", "escuro"]) {
      const r = tenta(polo);
      if (dentro(r)) return r;
      if (r && (!melhor || (r.aceso >= MINIMO_ACESO && r.aceso < melhor.aceso))) melhor = r;
    }
    return melhor;
  }

  function receitasAod(origem, largura, altura) {
    const c = document.createElement("canvas");
    c.width = largura; c.height = altura;
    const x = c.getContext("2d");
    x.drawImage(origem, 0, 0, largura, altura);
    const p = x.getImageData(0, 0, largura, altura).data;
    return analisar(p, largura, altura, 0.1).claro ? RECEITAS_UMA_COR : RECEITAS_AOD;
  }

  /** Formas de aliviar o mostrador: desfocar e reduzir cores até caber. */
  const RECEITAS_FUNDO = [
    {}, { suave: 1 }, { suave: 2 }, { suave: 3 }, { suave: 5 }, { suave: 8 }, { suave: 12 },
  ];

  function desenhoFundo(origem, largura, altura, receita) {
    const c = document.createElement("canvas");
    c.width = largura; c.height = altura;
    const x = c.getContext("2d");
    if (receita.suave) x.filter = "blur(" + receita.suave + "px)";
    x.drawImage(origem, 0, 0, largura, altura);
    x.filter = "none";
    return c;
  }

  /** Cabe no espaço desta imagem? (mede sem montar o ficheiro, que é lento) */
  /** Cabe no espaço? E quanto do desenho fica aceso? */
  function medir(canvas, orcamento, transparente) {
    const d = HWT.prepararDesenho(canvas, canvas.width, canvas.height, transparente);
    let acesos = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 24) acesos++;
    // sem orçamento a tabela das imagens é refeita: cabe sempre
    return { cabe: !orcamento || !!HWT.codificarExato(d, orcamento), aceso: acesos / (d.length / 4) };
  }

  /**
   * Experimenta as receitas por ordem e devolve o primeiro desenho que cabe
   * e que ainda deixa ver alguma coisa (senão ficaria um mostrador preto).
   */
  function ajustar(origem, largura, altura, orcamento, receitas, fazer, minimoAceso, transparente, maximoAceso) {
    const teto = maximoAceso || MAXIMO_ACESO;
    let claroDemais = null, escuroDemais = null;
    for (let k = 0; k < receitas.length; k++) {
      const c = fazer(origem, largura, altura, receitas[k]);
      const m = medir(c, orcamento, transparente);
      if (!m.cabe) continue;
      const r = { canvas: c, receita: receitas[k], passo: k, aceso: m.aceso };
      if (m.aceso >= (minimoAceso || 0) && (!minimoAceso || m.aceso <= teto)) return r;
      // nenhuma receita ficou no ponto: guarda-se a menos má de cada lado,
      // e no fim prefere-se a menos acesa das acesas de mais
      if (m.aceso > teto) { if (!claroDemais || m.aceso < claroDemais.aceso) claroDemais = r; }
      else if (!escuroDemais || m.aceso > escuroDemais.aceso) escuroDemais = r;
    }
    return claroDemais || escuroDemais;
  }

  /**
   * Decide o que fica aceso no ecrã sempre ligado: num mostrador escuro acendem-se
   * as partes claras; num mostrador de fundo claro (mostradores brancos) acendem-se
   * as partes escuras — os números e os traços — depois invertidas, senão ficaria
   * o ecrã quase todo branco. Mede só dentro do círculo, para os cantos não contarem.
   */
  function analisar(p, largura, altura, fracao, acender) {
    const hist = new Uint32Array(256);
    const cx = largura / 2, cy = altura / 2, r2 = Math.pow(Math.min(largura, altura) / 2, 2);
    let dentro = 0;
    for (let y = 0; y < altura; y++) {
      const dy = y + 0.5 - cy;
      for (let xx = 0; xx < largura; xx++) {
        const dx = xx + 0.5 - cx;
        if (dx * dx + dy * dy > r2) continue;
        const i = (y * largura + xx) * 4;
        const luz = p[i + 3] === 0 ? 0 : (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) | 0;
        hist[luz > 255 ? 255 : luz]++; dentro++;
      }
    }
    let meio = 0, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= dentro / 2) { meio = v; break; } }
    // "claro" = o mostrador tem fundo claro, por isso acende-se o desenho escuro
    const claro = acender ? acender === "escuro" : meio > 128;
    const querem = Math.max(1, Math.round(dentro * fracao));
    let soma = 0, limiar = claro ? 255 : 0;
    if (claro) { for (let v = 0; v < 256; v++) { soma += hist[v]; if (soma >= querem) { limiar = v; break; } } }
    else { for (let v = 255; v >= 0; v--) { soma += hist[v]; if (soma >= querem) { limiar = v; break; } } }
    return { claro, limiar, meio };
  }

  function desenhoAod(origem, largura, altura, receita) {
    const c = document.createElement("canvas");
    c.width = largura; c.height = altura;
    const x = c.getContext("2d");
    if (receita.suave) x.filter = "blur(" + receita.suave + "px)";
    x.drawImage(origem, 0, 0, largura, altura);
    x.filter = "none";
    const d = x.getImageData(0, 0, largura, altura);
    const p = d.data;
    const corFixa = receita.cor ? [parseInt(receita.cor.slice(1, 3), 16), parseInt(receita.cor.slice(3, 5), 16), parseInt(receita.cor.slice(5, 7), 16)] : null;
    const escuro = receita.escuro || 0, ganho = receita.ganho || 1;
    // limiar relativo ao próprio mostrador: um desenho escuro não fica todo apagado
    const an = receita.fracao ? analisar(p, largura, altura, receita.fracao, receita.acender) : { claro: false, limiar: receita.limiar || 0 };
    const niveis = receita.niveis || 0, passo = niveis ? 255 / (niveis - 1) : 0;
    const escala = an.claro ? 255 / Math.max(1, an.limiar) : 0;
    for (let i = 0; i < p.length; i += 4) {
      const luz = p[i + 3] === 0 ? 0 : 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const fica = an.claro ? luz <= an.limiar && p[i + 3] > 0 : luz >= an.limiar && an.limiar > 0;
      if (!fica) { p[i] = p[i + 1] = p[i + 2] = 0; p[i + 3] = 0; continue; }
      if (corFixa) { p[i] = corFixa[0]; p[i + 1] = corFixa[1]; p[i + 2] = corFixa[2]; p[i + 3] = 255; continue; }
      // mostrador claro: o desenho escuro passa a aceso (quanto mais escuro, mais aceso)
      const base = an.claro ? [(an.limiar - luz) * escala, (an.limiar - luz) * escala, (an.limiar - luz) * escala] : [p[i], p[i + 1], p[i + 2]];
      for (let k = 0; k < 3; k++) {
        let v = base[k] * ganho * (1 - escuro);
        if (niveis) v = Math.round(v / passo) * passo;
        p[i + k] = v > 255 ? 255 : v;
      }
      p[i + 3] = 255;
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
      const alvo = f >= 0 ? HWT.alvoAod(pac) : null;
      if (f < 0 || !alvo) return null;
      baseIncluidaCache = { item: { nome: "base incluída na app" }, pac, iF: f, alvo, incluida: true };
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
      const alvo = f >= 0 ? HWT.alvoAod(pac) : null;
      if (f < 0 || !alvo) return null;
      return { item: m, pac, iF: f, alvo };
    } catch (e) { return null; }
  }

  /**
   * A máscara escolhida não tem espaço de ecrã sempre ligado. Procura na biblioteca
   * outra que tenha, e usa-a como suporte: o desenho desta entra no mostrador e,
   * escurecido, no sempre ligado dessa.
   */
  async function escolherBase(item, orig, converter) {
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
        const alvo = HWT.alvoAod(pac);
        if (!alvo) continue;
        candidatas.push({ item: c, pac, iF: f, alvo });
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
      b.innerHTML = `${c.item.nome}<small>${c.pac.imgs[c.iF].largura}×${c.pac.imgs[c.iF].altura} · sempre ligado ${c.alvo.im.largura}×${c.alvo.im.altura}${c.alvo.onde === "wf" ? " (próprio)" : " (a criar)"}</small>`;
      b.onclick = () => { el.classList.add("escondido"); abrirEditorAodComBase(item, orig, c, converter); };
      lista.append(b);
    });
  }

  /**
   * Instala uma máscara desenhada por mim. Como não é um ficheiro .hwt, o desenho
   * assenta numa máscara base — a habitual, ou a que vem com a app.
   */
  async function instalarDesenho(item) {
    carregar(true, "A preparar o desenho…");
    try {
      const base = (await baseHabitual()) || (await baseIncluida());
      if (!base) throw new Error("não há nenhuma máscara base guardada; instale primeiro uma máscara .hwt");
      const m = Estudio.normalizar(item);
      const orig = renderDe(m, true, 466);
      const imF = base.pac.imgs[base.iF];
      carregar(true, "A encaixar o mostrador…");
      const mostrador = ajustar(orig, imF.largura, imF.altura, null, RECEITAS_FUNDO, desenhoFundo);
      if (!mostrador) throw new Error("não consegui encaixar o desenho nesta base");
      carregar(true, "A montar o ficheiro…");
      const capa = renderDe(m, false, 466).toDataURL("image/jpeg", 0.9);
      const trocas = [{ indice: base.iF, canvas: mostrador.canvas }];
      // o sempre ligado sai já feito, com o desenho do próprio mostrador
      const alvoA = base.alvo || HWT.alvoAod(base.pac);
      if (alvoA) {
        const a = melhorAod(orig, alvoA.im.largura, alvoA.im.altura);
        if (a) trocas.push({ onde: alvoA.onde, indice: alvoA.indice, canvas: a.canvas, transparente: true });
      }
      const feito = await HWT.construir(base.pac, trocas, null, item.nome, capa, { ponteirosAod: true });
      carregar(true, "A enviar para o relógio…");
      const b64 = HWT.paraBase64(feito.bytes);
      const suave = mostrador.receita.suave || 0;
      res(N.instalar((item.nome || "mascara") + ".hwt", b64),
        "Enviada. Escolha-a depois no pulso. Os ponteiros e números são os da " + base.item.nome + "."
        + (suave ? " O desenho foi suavizado " + suave + "px para caber." : ""));
      $("#acoesItem").classList.add("escondido");
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
  let m = null, mPrincipal = null, variante = "normal", sel = null, tick = null, pacoteHwt = null, alvoHwt = -1, alvoAod = null;
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
    if (b.dataset.aba === "enviar") baseParaEnviar();
  }));

  /** Põe já uma base carregada no separador Enviar, para não ser preciso escolher ficheiro. */
  async function baseParaEnviar() {
    if (pacoteHwt) return;
    const base = (await baseHabitual()) || (await baseIncluida());
    if (!base) { $("#hwtInfo").textContent = "Ainda não há nenhuma máscara base guardada. Escolha um ficheiro .hwt."; return; }
    pacoteHwt = base.pac; alvoHwt = base.iF; alvoAod = base.alvo;
    $("#hwtInfo").innerHTML = `Base: <b>${base.item.nome}</b> — já carregada. Os ponteiros e números serão os dela. Escolha outro ficheiro se quiser mudar.`;
    $("#btEnviarRelogio").disabled = $("#btGuardarHwt").disabled = false;
  }

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
    $("#fTipo").value = f.tipo; $("#fCor1").value = f.cor1 || "#000000"; $("#fCor2").value = f.cor2 || "#000000"; $("#fAngulo").value = f.angulo || 0;
    $("#fZoom").value = f.zoom || 100; $("#fBrilho").value = f.brilho || 0;
    $("#fZoomV").textContent = (f.zoom || 100) + "%";
    $("#fBrilhoV").textContent = (f.brilho > 0 ? "+" : "") + (f.brilho || 0);
    // zoom e brilho só fazem sentido quando o fundo é uma imagem
    $("#ajustesImagem").classList.toggle("escondido", f.tipo !== "imagem" || !f.imagem);
  }
  ["fTipo", "fCor1", "fCor2", "fAngulo", "fZoom", "fBrilho"].forEach((id) => ($("#" + id).oninput = () => {
    m.fundo.tipo = $("#fTipo").value; m.fundo.cor1 = $("#fCor1").value; m.fundo.cor2 = $("#fCor2").value; m.fundo.angulo = Number($("#fAngulo").value);
    m.fundo.zoom = Number($("#fZoom").value); m.fundo.brilho = Number($("#fBrilho").value);
    $("#fZoomV").textContent = m.fundo.zoom + "%";
    $("#fBrilhoV").textContent = (m.fundo.brilho > 0 ? "+" : "") + m.fundo.brilho;
    $("#ajustesImagem").classList.toggle("escondido", m.fundo.tipo !== "imagem" || !m.fundo.imagem);
    redesenhar();
  }));
  $("#fImagem").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; m.fundo.imagem = await redimensionar(await lerFicheiro(f, "url"), 800); m.fundo.tipo = "imagem"; preencherFundo(); redesenhar(); e.target.value = ""; };
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
      alvoAod = HWT.alvoAod(pacoteHwt);
      const fundo = pacoteHwt.imgs[alvoHwt];
      const aod = alvoAod ? alvoAod.im : null;
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
      if (!alvoAod) throw new Error("esta base não tem imagem de ecrã sempre ligado; escolha outra ou desligue essa opção");
      trocas.push({ onde: alvoAod.onde, indice: alvoAod.indice, canvas: renderDe(mPrincipal.aod || mPrincipal, soEst) });
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
  // usado pelos testes para verificar a conversão do ecrã sempre ligado
  window.__aod = { RECEITAS_AOD, RECEITAS_FUNDO, desenhoAod, desenhoFundo, medir, ajustar, analisar, receitasAod, MINIMO_ACESO };
})();
