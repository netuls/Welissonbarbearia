// ═══════════════════════════════════════════════════════════════════
//  extras-site.js — seções "Onde estamos" e "Depoimentos" do site
//
//  Como instalar: no index.html, logo depois da linha <script src="app.js"></script>, adicione:
//      <script src="extras-site.js"></script>
//  Nada mais precisa ser mudado nos arquivos que você já tem.
//
//  Os dados vêm do painel (Ajustes → "Onde estamos" e "Depoimentos"), guardados em config/barbearia.
//  O horário de atendimento vem da aba Horários do painel (config/horarios), então não é preciso digitar de novo.
//  Cada seção só aparece quando existe algo para mostrar.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof BARBEARIA === 'undefined') return;

  var CACHE_KEY = 'barbearia_ajustes_' + ((BARBEARIA.firebase && BARBEARIA.firebase.projectId) || '');
  var horarios = null;            // config/horarios (null = ainda não carregou ou não existe)
  var horariosPedido = false;

  var ORDEM = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  var NOMES = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function ajustes() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  function urlSegura(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }

  // ── Horário de atendimento: agrupa dias seguidos com o mesmo horário ──
  function textoDia(c) {
    if (!c || c.ativo === false || c.fechado || !c.inicio || !c.fim) return 'Fechado';
    var t = c.inicio + ' às ' + c.fim;
    if (c.almoco && c.almoco_inicio && c.almoco_fim) t += ' (pausa ' + c.almoco_inicio + ' às ' + c.almoco_fim + ')';
    return t;
  }
  function rotuloDias(dias) {
    var n = dias.map(function (d) { return NOMES[d]; });
    if (n.length === 1) return n[0];
    if (n.length === 2) return n[0] + ' e ' + n[1];
    return n[0] + ' a ' + n[n.length - 1];
  }
  function gruposHorario(h) {
    var grupos = [];
    ORDEM.forEach(function (dia) {
      var t = textoDia(h[dia]);
      var ult = grupos[grupos.length - 1];
      if (ult && ult.texto === t) ult.dias.push(dia); else grupos.push({ texto: t, dias: [dia] });
    });
    return grupos.map(function (g) { return { rotulo: rotuloDias(g.dias), texto: g.texto, fechado: g.texto === 'Fechado' }; });
  }

  // ── Instagram: aceita @usuario, usuario ou o endereço completo ──
  function linkInstagram(valor) {
    var v = String(valor || '').trim();
    if (!v) return null;
    var u = urlSegura(v);
    if (u) return { href: u, rotulo: 'Instagram' };
    var user = v.replace(/^@/, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(user)) return null;
    return { href: 'https://instagram.com/' + user, rotulo: '@' + user };
  }

  // ── Estilos (usam as mesmas cores do resto do site, então o tema repinta junto) ──
  function injetarCss() {
    if (el('extras-site-css')) return;
    var st = document.createElement('style');
    st.id = 'extras-site-css';
    st.textContent = [
      '.oe-card{max-width:900px;margin:0 auto;display:grid;grid-template-columns:1fr auto;gap:28px;background:#0C1838;border:1px solid #16295C;border-radius:10px;padding:28px;}',
      '.oe-bloco + .oe-bloco{margin-top:22px;}',
      '.oe-rot{display:block;font-family:"Oswald",sans-serif;font-size:13px;letter-spacing:1px;color:#94A4CC;margin-bottom:6px;}',
      '.oe-end{font-family:"Roboto",sans-serif;font-size:16px;line-height:1.5;color:#F1EAD6;}',
      '.oe-horas{list-style:none;margin:0;padding:0;font-family:"Roboto",sans-serif;font-size:15px;}',
      '.oe-horas li{display:flex;justify-content:space-between;gap:20px;padding:8px 0;border-bottom:1px solid #16295C;color:#F1EAD6;}',
      '.oe-horas li:last-child{border-bottom:none;}',
      '.oe-horas li span:first-child{color:#94A4CC;}',
      '.oe-horas li span:last-child{text-align:right;}',
      '.oe-horas li.fechado span:last-child{color:#7183B4;}',
      '.oe-acoes{display:flex;flex-direction:column;gap:10px;justify-content:center;min-width:210px;}',
      '.oe-btn{display:flex;align-items:center;justify-content:center;min-height:48px;padding:12px 22px;border-radius:4px;border:1px solid #233F80;color:#F1EAD6;text-decoration:none;font-family:"Oswald",sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;background:transparent;-webkit-tap-highlight-color:transparent;}',
      '.oe-btn:active{background:#16295C;}',
      '.oe-btn-ouro{background:#EBC531;border-color:#F5DC4A;color:#070E24;font-weight:700;}',
      '.oe-btn-ouro:active{background:#F5DC4A;}',
      '.oe-btn:focus-visible{outline:2px solid #EBC531;outline-offset:2px;}',
      '.dep-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;max-width:1000px;margin:0 auto;}',
      '.dep-card{margin:0;background:#0C1838;border:1px solid #16295C;border-radius:10px;padding:22px 20px;display:flex;flex-direction:column;gap:12px;text-align:left;}',
      '.dep-estrelas{color:#EBC531;letter-spacing:3px;font-size:16px;}',
      '.dep-card blockquote{margin:0;font-family:"Roboto",sans-serif;font-size:15px;line-height:1.6;color:#F1EAD6;overflow-wrap:anywhere;}',
      '.dep-card figcaption{font-family:"Oswald",sans-serif;font-size:14px;letter-spacing:1px;color:#94A4CC;margin-top:auto;}',
      '@media (max-width:768px){.oe-card{grid-template-columns:1fr;padding:22px 18px;}.oe-acoes{min-width:0;}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ── Cria as seções (e o link do menu) uma única vez ──
  function criarSecoes() {
    if (el('onde-estamos')) return;

    var dep = document.createElement('section');
    dep.id = 'depoimentos';
    dep.className = 'section dep-section';
    dep.style.display = 'none';
    dep.innerHTML = '<div class="section-header"><span class="section-tag">O QUE DIZEM</span><h2>Nossos Clientes</h2><div class="section-line"></div></div><div class="dep-grid" id="dep-grid"></div>';
    var planos = el('planos');
    if (planos && planos.parentNode) planos.parentNode.insertBefore(dep, planos); else document.body.appendChild(dep);

    var oe = document.createElement('section');
    oe.id = 'onde-estamos';
    oe.className = 'section oe-section';
    oe.style.display = 'none';
    oe.innerHTML = '<div class="section-header"><span class="section-tag">VENHA NOS</span><h2>Visitar</h2><div class="section-line"></div></div><div class="oe-card" id="oe-card"></div>';
    var rodape = document.querySelector('footer.footer');
    if (rodape && rodape.parentNode) rodape.parentNode.insertBefore(oe, rodape); else document.body.appendChild(oe);

    var links = el('nav-links');
    if (links) {
      var a = document.createElement('a');
      a.href = '#onde-estamos';
      a.id = 'nav-onde';
      a.textContent = 'Onde estamos';
      a.style.display = 'none';
      a.addEventListener('click', function () { if (typeof closeMenu === 'function') closeMenu(); });
      links.insertBefore(a, links.querySelector('.btn-nav'));
    }
  }

  // ── Depoimentos ──
  function renderDepoimentos() {
    var sec = el('depoimentos'), grid = el('dep-grid');
    if (!sec || !grid) return;
    var lista = (ajustes().depoimentos || []).filter(function (d) { return d && d.nome && d.texto; }).slice(0, 10);
    if (!lista.length) { sec.style.display = 'none'; return; }
    grid.innerHTML = lista.map(function (d) {
      var n = Math.min(5, Math.max(1, parseInt(d.nota, 10) || 5)), est = '';
      for (var i = 0; i < 5; i++) est += i < n ? '★' : '☆';
      return '<figure class="dep-card"><div class="dep-estrelas" role="img" aria-label="' + n + ' de 5 estrelas">' + est + '</div>' +
        '<blockquote>' + esc(d.texto) + '</blockquote><figcaption>' + esc(d.nome) + '</figcaption></figure>';
    }).join('');
    sec.style.display = '';
  }

  // ── Onde estamos ──
  function renderOnde() {
    var sec = el('onde-estamos'), card = el('oe-card'), nav = el('nav-onde');
    if (!sec || !card) return;
    var l = ajustes().local || {};
    var endereco = String(l.endereco || '').trim();
    var insta = linkInstagram(l.instagram);
    var mapa = urlSegura(l.mapaLink) || (endereco ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(endereco.replace(/\s*\n\s*/g, ', ')) : '');
    var grupos = horarios ? gruposHorario(horarios) : [];
    if (grupos.every(function (g) { return g.fechado; })) grupos = [];   // doc vazio ou tudo fechado: não mostra a lista
    var whats = String(BARBEARIA.whatsapp || '').replace(/\D/g, '');

    if (!endereco && !insta && !grupos.length) {
      sec.style.display = 'none';
      if (nav) nav.style.display = 'none';
      return;
    }

    var info = '';
    if (endereco) info += '<div class="oe-bloco"><span class="oe-rot">Endereço</span><div class="oe-end">' + esc(endereco).replace(/\n/g, '<br>') + '</div></div>';
    if (grupos.length) {
      info += '<div class="oe-bloco"><span class="oe-rot">Horário de atendimento</span><ul class="oe-horas">' +
        grupos.map(function (g) { return '<li' + (g.fechado ? ' class="fechado"' : '') + '><span>' + esc(g.rotulo) + '</span><span>' + esc(g.texto) + '</span></li>'; }).join('') +
        '</ul></div>';
    }
    var acoes = '';
    if (mapa) acoes += '<a class="oe-btn oe-btn-ouro" href="' + esc(mapa) + '" target="_blank" rel="noopener">Como chegar</a>';
    if (whats) acoes += '<a class="oe-btn" href="https://wa.me/' + esc(whats) + '" target="_blank" rel="noopener">WhatsApp</a>';
    if (insta) acoes += '<a class="oe-btn" href="' + esc(insta.href) + '" target="_blank" rel="noopener">' + esc(insta.rotulo) + '</a>';

    card.innerHTML = '<div class="oe-info">' + info + '</div>' + (acoes ? '<div class="oe-acoes">' + acoes + '</div>' : '');
    if (!acoes) card.style.gridTemplateColumns = '1fr'; else card.style.gridTemplateColumns = '';
    sec.style.display = '';
    if (nav) nav.style.display = '';
  }

  function carregarHorarios() {
    if (horariosPedido) return Promise.resolve();
    horariosPedido = true;
    if (BARBEARIA.firebasePendente || typeof firebase === 'undefined') return Promise.resolve();
    try {
      return firebase.firestore().collection('config').doc('horarios').get()
        .then(function (d) { horarios = d.exists ? (d.data() || {}) : null; })
        .catch(function (e) { console.warn('Horários (Onde estamos):', e); });
    } catch (e) { return Promise.resolve(); }
  }

  function renderTudo() {
    try { renderDepoimentos(); renderOnde(); } catch (e) { console.warn('extras-site:', e); }
  }

  function iniciar() {
    renderTudo();
    carregarHorarios().then(renderOnde);
  }

  // Quando os ajustes do painel chegam do Firebase (config.js), redesenha as duas seções
  if (typeof carregarAjustesRemotos === 'function') {
    var original = carregarAjustesRemotos;
    window.carregarAjustesRemotos = function () {
      return Promise.resolve(original.apply(this, arguments)).then(function (r) { renderTudo(); return r; });
    };
  }

  injetarCss();
  criarSecoes();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  // (usado só nos testes automáticos; não faz nada no navegador)
  if (typeof module !== 'undefined' && module.exports) module.exports = { gruposHorario: gruposHorario, linkInstagram: linkInstagram, textoDia: textoDia };
})();
