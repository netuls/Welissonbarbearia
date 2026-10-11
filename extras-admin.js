// ═══════════════════════════════════════════════════════════════════
//  extras-admin.js — painel: lembrete de agendamento, "Onde estamos" e depoimentos
//
//  Como instalar: no admin.html, logo depois da linha <script src="admin.js?v=1"></script>, adicione:
//      <script src="extras-admin.js"></script>
//  Nada mais precisa ser mudado nos arquivos que você já tem.
//
//  O que ele faz:
//   1. Botão "Lembrete" na tabela de Agendamentos (abre o WhatsApp do cliente com a mensagem pronta)
//      e um cartão "Lembretes de agendamento" na aba Relacionamento (hoje, amanhã ou próximos dias).
//   2. Cartões "Onde estamos" e "Depoimentos" na aba Ajustes (aparecem no site, ver extras-site.js).
//  Tudo é guardado em config/barbearia (o mesmo documento dos outros ajustes) e nos agendamentos
//  (campo lembreteEnviado, para marcar quem já recebeu o lembrete).
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var PADRAO_LEMBRETE = 'Olá, {nome}! Passando para lembrar do seu horário na {barbearia}: {servico}, {quando} às {hora}. Se não puder vir, avise por aqui para liberarmos o horário. Te esperamos!';
  var DIAS_SEMANA_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var _depo = [];   // rascunho dos depoimentos que está sendo editado

  function $(id) { return document.getElementById(id); }
  function ms(t) { return t && typeof t.toMillis === 'function' ? t.toMillis() : (t && typeof t.seconds === 'number' ? t.seconds * 1000 : 0); }
  function ajustesCache() {
    try { return JSON.parse(localStorage.getItem(AJUSTES_CACHE_KEY) || 'null') || {}; } catch (e) { return {}; }
  }

  // ── Lembrete de agendamento ───────────────────────────────────────
  function elegivel(a) {
    return !!a && ['agendado', 'confirmado'].indexOf(a.status) >= 0 && !!a.data && a.data >= relHoje() &&
      String(a.telefone || '').replace(/\D/g, '').length >= 10;
  }
  // O lembrete só conta como enviado se não foi enviado antes de o cliente remarcar
  function lembreteOk(a) {
    if (!a || !a.lembreteEnviado) return false;
    var lm = ms(a.lembreteEnviadoEm), rm = ms(a.remarcadoEm);
    return !(lm && rm && lm < rm);
  }
  function quando(data) {
    var d = relDias(relHoje(), data);
    if (d === 0) return 'hoje';
    if (d === 1) return 'amanhã';
    return DIAS_SEMANA_PT[new Date(data + 'T12:00:00').getDay()] + ' (' + relFmt(data).slice(0, 5) + ')';
  }
  function mensagemLembrete(a) {
    var modelo = String((BARBEARIA.politicas || {}).msgLembrete || '').trim() || PADRAO_LEMBRETE;
    return modelo
      .replace(/\{nome\}/g, relPrimeiroNome(a.cliente))
      .replace(/\{(?:salao|barbearia)\}/g, BARBEARIA.nome)
      .replace(/\{servico\}/g, a.servico || 'seu atendimento')
      .replace(/\{quando\}/g, quando(a.data))
      .replace(/\{data\}/g, relFmt(a.data))
      .replace(/\{hora\}/g, a.horario || '');
  }
  window.extLembrete = function (id) {
    var a = allAgendamentos.find(function (x) { return x.id === id; });
    if (!a) return;
    window.open(relLinkWA(a.telefone, mensagemLembrete(a)), '_blank');   // direto no clique (o iPhone bloqueia depois de uma espera)
    a.lembreteEnviado = true;
    try {
      db.collection('agendamentos').doc(a.id).update({ lembreteEnviado: true, lembreteEnviadoEm: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(function (e) { console.warn('Não consegui marcar o lembrete como enviado:', e); });
    } catch (e) { console.warn(e); }
    try { renderRelLembretes(); } catch (e) {}
    try { applyFilters(); } catch (e) {}
  };

  // Botão "Lembrete" em cada linha da tabela de Agendamentos
  function decorarTabela() {
    var tbody = $('agendamentos-body');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-id]').forEach(function (tr) {
      var a = allAgendamentos.find(function (x) { return x.id === tr.dataset.id; });
      if (!a || !elegivel(a)) return;
      var box = tr.querySelector('.action-btns');
      if (!box || box.querySelector('.ext-lemb')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-action btn-whats ext-lemb';
      b.textContent = lembreteOk(a) ? 'Lembrete enviado' : 'Lembrete';
      b.addEventListener('click', function () { window.extLembrete(a.id); });
      box.insertBefore(b, box.querySelector('a.btn-whats'));
    });
  }

  // Cartão "Lembretes de agendamento" na aba Relacionamento
  function injetarCartaoLembretes() {
    var tab = $('tab-relacionamento');
    if (!tab || $('ext-lemb-card')) return;
    var wrap = tab.firstElementChild;
    if (!wrap) return;
    var card = document.createElement('div');
    card.className = 'aj-card';
    card.id = 'ext-lemb-card';
    card.innerHTML =
      '<h3 class="aj-titulo">Lembretes de agendamento</h3>' +
      '<p class="aj-desc">Avise o cliente do horário marcado e diminua as faltas. O botão abre o WhatsApp com a mensagem pronta, e quem já recebeu fica marcado como enviado.</p>' +
      '<div class="rel-filtro"><span class="aj-lbl">Mostrar</span>' +
        '<select id="ext-lemb-janela" class="aj-in" style="width:auto;" onchange="renderRelLembretes()">' +
          '<option value="amanha" selected>Agendamentos de amanhã</option><option value="hoje">Agendamentos de hoje</option>' +
          '<option value="hojeamanha">Hoje e amanhã</option><option value="semana">Próximos 7 dias</option>' +
        '</select></div>' +
      '<div id="ext-lemb-lista"></div>' +
      '<details style="margin-top:16px;"><summary class="aj-lbl" style="cursor:pointer;">Editar a mensagem do lembrete</summary>' +
        '<div class="aj-campo" style="margin-top:10px;"><textarea id="ext-msg-lemb" class="aj-in" rows="4"></textarea>' +
        '<span class="aj-desc" style="margin:4px 0 0;">Pode usar {nome}, {barbearia}, {servico}, {quando} (hoje, amanhã...), {data} e {hora}.</span></div>' +
        '<div class="aj-acoes"><button type="button" class="aj-btn" onclick="extSalvarMsgLembrete()">Salvar mensagem</button>' +
        '<button type="button" class="aj-btn2" onclick="extMsgLembretePadrao()">Voltar ao texto padrão</button>' +
        '<span id="ext-msg-lemb-status" style="font-family:\'Roboto\',sans-serif;font-size:13px;"></span></div>' +
      '</details>';
    wrap.insertBefore(card, wrap.firstChild);
  }

  window.renderRelLembretes = function () {
    var box = $('ext-lemb-lista'), sel = $('ext-lemb-janela');
    if (!box || !sel) return;
    var faixas = { hoje: [0, 0], amanha: [1, 1], hojeamanha: [0, 1], semana: [0, 7] };
    var f = faixas[sel.value] || [1, 1];
    var hoje = relHoje();
    var lista = allAgendamentos.filter(elegivel).filter(function (a) {
      var d = relDias(hoje, a.data); return d >= f[0] && d <= f[1];
    }).sort(function (x, y) { return (x.data + (x.horario || '')).localeCompare(y.data + (y.horario || '')); });
    var ta = $('ext-msg-lemb');
    if (ta && document.activeElement !== ta) ta.value = String((BARBEARIA.politicas || {}).msgLembrete || '').trim() || PADRAO_LEMBRETE;
    if (!lista.length) { box.innerHTML = '<p class="rel-vazio">Nenhum agendamento nesse período.</p>'; return; }
    box.innerHTML = lista.map(function (a) {
      var ok = lembreteOk(a);
      return '<div class="rel-item"><div class="rel-quem"><span class="rel-nome">' + relEsc(a.cliente) + '</span>' +
        '<span class="rel-info">' + relEsc(quando(a.data)) + ' · ' + relEsc(a.horario || '') + ' · ' + relEsc(a.servico || '') + '</span></div>' +
        '<div class="rel-acoes">' + (ok ? '<span class="rel-enviado">Lembrete enviado</span>' : '') +
        '<button type="button" class="rel-btn" onclick="extLembrete(\'' + relEsc(a.id) + '\')">' + (ok ? 'Enviar de novo' : 'Enviar lembrete') + '</button></div></div>';
    }).join('');
  };

  window.extSalvarMsgLembrete = async function () {
    var st = 'ext-msg-lemb-status';
    var txt = ($('ext-msg-lemb').value || '').trim();
    ajStatus(st, 'Salvando...');
    try {
      await db.collection('config').doc('barbearia').set({ politicas: { msgLembrete: txt === PADRAO_LEMBRETE ? '' : txt }, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await carregarAjustesRemotos();
      ajStatus(st, 'Mensagem salva!', '#4caf50');
      showToast('Mensagem do lembrete salva.');
    } catch (e) { console.warn(e); ajStatus(st, 'Erro ao salvar: ' + (e.message || e.code || e), '#e05555'); }
  };
  window.extMsgLembretePadrao = function () { $('ext-msg-lemb').value = PADRAO_LEMBRETE; ajStatus('ext-msg-lemb-status', 'Texto padrão preenchido. Clique em Salvar mensagem para aplicar.'); };

  // ── Ajustes: "Onde estamos" e "Depoimentos" ───────────────────────
  function injetarCartoesAjustes() {
    var tab = $('tab-servicos');
    if (!tab || $('ext-local-card')) return;
    var primeiro = tab.querySelector('.aj-card');
    if (!primeiro) return;
    var local = document.createElement('div');
    local.className = 'aj-card';
    local.id = 'ext-local-card';
    local.innerHTML =
      '<h3 class="aj-titulo">Onde estamos</h3>' +
      '<p class="aj-desc">Aparece no site, na seção "Visitar", junto com o horário de atendimento (que vem da aba Horários) e os botões de WhatsApp e Instagram. Deixe em branco o que não quiser mostrar.</p>' +
      '<div class="aj-campo"><span class="aj-lbl">Endereço</span><textarea class="aj-in" id="ext-endereco" rows="2" maxlength="200" placeholder="Rua, número, bairro e cidade"></textarea></div>' +
      '<div class="aj-linha">' +
        '<div class="aj-campo"><span class="aj-lbl">Link do Google Maps (opcional)</span><input class="aj-in" id="ext-mapa" inputmode="url" placeholder="https://maps.app.goo.gl/..."></div>' +
        '<div class="aj-campo"><span class="aj-lbl">Instagram</span><input class="aj-in" id="ext-insta" placeholder="@seuperfil" maxlength="100"></div>' +
      '</div>' +
      '<p class="aj-desc" style="margin:0 0 12px;">Sem o link do Maps, o botão "Como chegar" abre a rota a partir do endereço.</p>' +
      '<div class="aj-acoes"><button type="button" class="aj-btn" onclick="extSalvarLocal()">Salvar</button>' +
      '<span id="ext-local-status" style="font-family:\'Roboto\',sans-serif;font-size:13px;"></span></div>';
    var depo = document.createElement('div');
    depo.className = 'aj-card';
    depo.id = 'ext-depo-card';
    depo.innerHTML =
      '<h3 class="aj-titulo">Depoimentos</h3>' +
      '<p class="aj-desc">Mostre o que os clientes falam de você. Cadastre só depoimentos reais, de preferência com a permissão do cliente. A seção aparece no site quando houver pelo menos um (máximo de 10).</p>' +
      '<div id="ext-depo-lista"></div>' +
      '<button type="button" class="aj-btn2" onclick="extDepoAdicionar()">+ Adicionar depoimento</button>' +
      '<div class="aj-acoes" style="margin-top:16px;"><button type="button" class="aj-btn" onclick="extSalvarDepoimentos()">Salvar depoimentos</button>' +
      '<span id="ext-depo-status" style="font-family:\'Roboto\',sans-serif;font-size:13px;"></span></div>';
    primeiro.parentNode.insertBefore(local, primeiro.nextSibling);
    primeiro.parentNode.insertBefore(depo, local.nextSibling);
  }

  function preencherAjustes() {
    if (!$('ext-endereco')) return;
    var c = ajustesCache(), l = c.local || {};
    $('ext-endereco').value = l.endereco || '';
    $('ext-mapa').value = l.mapaLink || '';
    $('ext-insta').value = l.instagram || '';
    _depo = (Array.isArray(c.depoimentos) ? c.depoimentos : []).map(function (d) { return { nome: d.nome || '', texto: d.texto || '', nota: parseInt(d.nota, 10) || 5 }; });
    renderDepoimentosEditor();
    ajStatus('ext-local-status', ''); ajStatus('ext-depo-status', '');
  }

  window.extSalvarLocal = async function () {
    var st = 'ext-local-status';
    var endereco = ($('ext-endereco').value || '').trim(), mapa = ($('ext-mapa').value || '').trim(), insta = ($('ext-insta').value || '').trim();
    if (mapa && !/^https?:\/\//i.test(mapa)) { ajStatus(st, 'O link do Maps precisa começar com https://', '#e05555'); return; }
    if (insta && !/^(https?:\/\/\S+|@?[A-Za-z0-9._]{1,30})$/.test(insta)) { ajStatus(st, 'Instagram: use só o @ do perfil (ex.: @seuperfil) ou o endereço completo.', '#e05555'); return; }
    ajStatus(st, 'Salvando...');
    try {
      await db.collection('config').doc('barbearia').set({ local: { endereco: endereco, mapaLink: mapa, instagram: insta }, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await carregarAjustesRemotos();
      ajStatus(st, 'Salvo! O site já mostra a seção "Visitar".', '#4caf50');
      showToast('Onde estamos atualizado.');
    } catch (e) { console.warn(e); ajStatus(st, 'Erro ao salvar: ' + (e.message || e.code || e), '#e05555'); }
  };

  function renderDepoimentosEditor() {
    var box = $('ext-depo-lista');
    if (!box) return;
    if (!_depo.length) { box.innerHTML = '<p class="rel-vazio" style="margin-bottom:12px;">Nenhum depoimento cadastrado ainda.</p>'; return; }
    box.innerHTML = _depo.map(function (d, i) {
      var notas = [5, 4, 3, 2, 1].map(function (n) { return '<option value="' + n + '"' + (n === d.nota ? ' selected' : '') + '>' + n + (n === 1 ? ' estrela' : ' estrelas') + '</option>'; }).join('');
      return '<div class="aj-plano">' +
        '<div class="aj-linha">' +
          '<div class="aj-campo" style="flex:2;min-width:160px;"><span class="aj-lbl">Nome do cliente</span><input class="aj-in" maxlength="40" value="' + escPlano(d.nome) + '" oninput="extDepoMudou(' + i + ',\'nome\',this.value)"></div>' +
          '<div class="aj-campo" style="flex:1;min-width:130px;"><span class="aj-lbl">Nota</span><select class="aj-in" onchange="extDepoMudou(' + i + ',\'nota\',this.value)">' + notas + '</select></div>' +
        '</div>' +
        '<div class="aj-campo"><span class="aj-lbl">Depoimento</span><textarea class="aj-in" rows="3" maxlength="280" oninput="extDepoMudou(' + i + ',\'texto\',this.value)">' + escPlano(d.texto) + '</textarea></div>' +
        '<div><button type="button" class="aj-btn2" style="color:#e05555;border-color:rgba(200,60,60,.4);" onclick="extDepoRemover(' + i + ')">Remover</button></div>' +
      '</div>';
    }).join('');
  }
  window.extDepoMudou = function (i, campo, valor) { if (_depo[i]) _depo[i][campo] = campo === 'nota' ? (parseInt(valor, 10) || 5) : valor; };
  window.extDepoAdicionar = function () {
    if (_depo.length >= 10) { ajStatus('ext-depo-status', 'Limite de 10 depoimentos. Remova um para adicionar outro.', '#e05555'); return; }
    _depo.push({ nome: '', texto: '', nota: 5 });
    renderDepoimentosEditor();
    var ultimos = document.querySelectorAll('#ext-depo-lista .aj-plano input.aj-in');
    if (ultimos.length) ultimos[ultimos.length - 1].focus();
  };
  window.extDepoRemover = function (i) { _depo.splice(i, 1); renderDepoimentosEditor(); ajStatus('ext-depo-status', 'Removido. Clique em Salvar depoimentos para aplicar.'); };
  window.extSalvarDepoimentos = async function () {
    var st = 'ext-depo-status';
    var lista = _depo.map(function (d) {
      return { nome: String(d.nome || '').trim().slice(0, 40), texto: String(d.texto || '').trim().slice(0, 280), nota: Math.min(5, Math.max(1, parseInt(d.nota, 10) || 5)) };
    });
    if (lista.some(function (d) { return !d.nome || !d.texto; })) { ajStatus(st, 'Preencha o nome e o depoimento de todos (ou remova a linha vazia).', '#e05555'); return; }
    ajStatus(st, 'Salvando...');
    try {
      await db.collection('config').doc('barbearia').set({ depoimentos: lista, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await carregarAjustesRemotos();
      ajStatus(st, lista.length ? 'Salvo! Os depoimentos já aparecem no site.' : 'Salvo! Sem depoimentos, a seção fica escondida no site.', '#4caf50');
      showToast('Depoimentos atualizados.');
    } catch (e) { console.warn(e); ajStatus(st, 'Erro ao salvar: ' + (e.message || e.code || e), '#e05555'); }
  };

  // ── Liga tudo ao painel que já existe ─────────────────────────────
  function ligar() {
    injetarCartaoLembretes();
    injetarCartoesAjustes();

    if (typeof window.renderAgendamentosTable === 'function') {
      var tabela = window.renderAgendamentosTable;
      window.renderAgendamentosTable = function () { var r = tabela.apply(this, arguments); try { decorarTabela(); } catch (e) { console.warn(e); } return r; };
    }
    if (typeof window.renderRelacionamento === 'function') {
      var rel = window.renderRelacionamento;
      window.renderRelacionamento = function () { var r = rel.apply(this, arguments); try { window.renderRelLembretes(); } catch (e) { console.warn(e); } return r; };
    }
    if (typeof window.showTab === 'function') {
      var aba = window.showTab;
      window.showTab = function (tab) { var r = aba.apply(this, arguments); if (tab === 'servicos') { try { preencherAjustes(); } catch (e) { console.warn(e); } } return r; };
    }
  }

  if (typeof document !== 'undefined' && typeof BARBEARIA !== 'undefined') ligar();

  // (usado só nos testes automáticos; não faz nada no navegador)
  if (typeof module !== 'undefined' && module.exports) module.exports = { elegivel: elegivel, lembreteOk: lembreteOk, quando: quando, mensagemLembrete: mensagemLembrete };
})();
