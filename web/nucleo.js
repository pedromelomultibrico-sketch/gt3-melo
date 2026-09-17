// Ponte para o núcleo Android (window.Nucleo). Fora da app usa uma simulação,
// para a interface poder ser testada num navegador normal.
(function () {
  const real = typeof window.Nucleo !== "undefined";
  const J = (s) => { try { return JSON.parse(s); } catch (e) { return { ok: false, erro: String(s) }; } };

  const simulado = {
    versao: () => 0,
    versaoNome: () => "navegador",
    dispositivos: () => JSON.stringify({ ok: true, dispositivos: [{ nome: "HUAWEI WATCH GT 3 (simulado)", estado: "INITIALIZED", estadoTexto: "Ligado", ligado: true, pronto: true, bateria: 76, firmware: "—", modelo: "GT3" }] }),
    dados: () => {
      const agora = Math.floor(Date.now() / 1000), ini = agora - (agora % 86400);
      const serie = []; let p = 0;
      for (let t = ini + 7 * 3600; t < agora; t += 900) { const v = Math.round(Math.random() * 600); p += v; serie.push([t, v, 60 + Math.round(Math.random() * 30)]); }
      return JSON.stringify({ ok: true, passos: p, minutosSono: 412, fcAtual: 72, fcMin: 55, fcMax: 118, fcMedia: 71, serie });
    },
    ligar: () => '{"ok":true}', sincronizar: () => '{"ok":true}', encontrar: () => '{"ok":true}', acertarHora: () => '{"ok":true}',
    notificar: () => '{"ok":true}',
    instalar: (n) => JSON.stringify({ ok: false, erro: "Só funciona dentro da app GT3 Melo (" + n + ")" }),
    guardar: (nome, b64) => { const a = document.createElement("a"); a.href = "data:application/octet-stream;base64," + b64; a.download = nome; a.click(); return '{"ok":true,"caminho":"Transferências"}'; },
    ficheiroPendente: () => "",
    bateriaHistorico: () => {
      // simulação: 0,4% por hora nos últimos 3 dias
      const agora = Math.floor(Date.now() / 1000), a = [];
      for (let h = 72; h >= 0; h--) a.push([agora - h * 3600, Math.round(76 + h * 0.4)]);
      return JSON.stringify({ ok: true, amostras: a });
    },
    podeLerFicheiros: () => false,
    pedirAcessoFicheiros: () => '{"ok":true}',
    transferencias: () => JSON.stringify({ ok: true, podeLer: false, ficheiros: [] }),
    lerTransferencia: () => '{"ok":false,"erro":"só na app"}',
    aviso: (t) => console.log(t), recarregar: () => location.reload(),
    abrir: (e) => { alert("No telemóvel abre o ecrã: " + e); return '{"ok":true}'; },
    atualizar: (u) => { window.open(u); return '{"ok":true}'; },
  };
  const N = real ? window.Nucleo : simulado;

  window.N = {
    real,
    versao: () => N.versao(),
    versaoNome: () => N.versaoNome(),
    dispositivos: () => J(N.dispositivos()),
    dados: (desde, ate) => J(N.dados(desde, ate)),
    ligar: () => J(N.ligar()),
    sincronizar: () => J(N.sincronizar()),
    encontrar: (on) => J(N.encontrar(on)),
    acertarHora: () => J(N.acertarHora()),
    notificar: (t, x) => J(N.notificar(t, x)),
    instalar: (nome, b64) => J(N.instalar(nome, b64)),
    guardar: (nome, b64) => J(N.guardar(nome, b64)),
    abrir: (e) => J(N.abrir(e)),
    ficheiroPendente: () => { try { const t = N.ficheiroPendente ? N.ficheiroPendente() : ""; return t ? JSON.parse(t) : null; } catch (e) { return null; } },
    bateriaHistorico: (dias) => J(N.bateriaHistorico ? N.bateriaHistorico(dias || 7) : '{"ok":false,"erro":"núcleo antigo"}'),
    podeLerFicheiros: () => { try { return !!(N.podeLerFicheiros && N.podeLerFicheiros()); } catch (e) { return false; } },
    pedirAcessoFicheiros: () => J(N.pedirAcessoFicheiros ? N.pedirAcessoFicheiros() : '{"ok":false}'),
    transferencias: () => J(N.transferencias ? N.transferencias() : '{"ok":false,"erro":"núcleo antigo — atualize a app"}'),
    lerTransferencia: (c) => J(N.lerTransferencia ? N.lerTransferencia(c) : '{"ok":false}'),
    atualizar: (u) => J(N.atualizar(u)),
    recarregar: () => N.recarregar(),
  };
})();
