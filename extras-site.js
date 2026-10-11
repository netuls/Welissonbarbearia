// ═══════════════════════════════════════════════════════════════════
//  extras-site.js — seções "Visitar" (com mapa), "Depoimentos" e botões flutuantes
//
//  Como instalar: no index.html, logo depois da linha <script src="app.js"></script>, adicione:
//      <script src="extras-site.js"></script>
//  (se já estiver lá, basta substituir este arquivo)
//
//  Os dados vêm do painel (Ajustes → "Onde estamos" e "Depoimentos"), guardados em config/barbearia.
//  O horário de atendimento vem da aba Horários do painel (config/horarios).
//  O mapa é montado a partir do endereço. Cada bloco só aparece quando existe algo para mostrar.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof BARBEARIA === 'undefined') return;

  var CACHE_KEY = 'barbearia_ajustes_' + ((BARBEARIA.firebase && BARBEARIA.firebase.projectId) || '');
  var horarios = null;
  var horariosPedido = false;
  var ultimaChaveOnde = '';
  var ultimaChaveFlut = '';

  var ORDEM = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  var NOMES = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo' };
  var DIA_JS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

  var ICONES = {
    pin: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    relogio: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
    rota: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>',
    whats: '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
    insta: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.2"/><circle cx="12" cy="12" r="4.1"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>'
  };

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

  // ── Horário de atendimento ──
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
    return grupos.map(function (g) {
      return { rotulo: rotuloDias(g.dias), texto: g.texto, fechado: g.texto === 'Fechado', dias: g.dias };
    });
  }

  function minutos(hhmm) {
    var p = String(hhmm || '').split(':');
    if (p.length < 2) return NaN;
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  // Aberto agora? (usa o horário do aparelho e considera a pausa do almoço)
  function abertoAgora(h) {
    if (!h) return null;
    var agora = new Date();
    var c = h[DIA_JS[agora.getDay()]];
    if (!c || c.ativo === false || c.fechado || !c.inicio || !c.fim) return false;
    var m = agora.getHours() * 60 + agora.getMinutes();
    var ini = minutos(c.inicio), fim = minutos(c.fim);
    if (isNaN(ini) || isNaN(fim)) return null;
    if (m < ini || m >= fim) return false;
    if (c.almoco && c.almoco_inicio && c.almoco_fim) {
      var ai = minutos(c.almoco_inicio), af = minutos(c.almoco_fim);
      if (!isNaN(ai) && !isNaN(af) && m >= ai && m < af) return false;
    }
    return true;
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

  // ── Estilos ──
  function injetarCss() {
    if (el('extras-site-css')) return;
    var st = document.createElement('style');
    st.id = 'extras-site-css';
    st.textContent = [
      /* esconde a seção antiga do index.html (a nova a substitui) */
      '#onde-estamos{display:none !important;}',

      /* ── Visitar ── */
      '.vis-section{scroll-margin-top:80px;}',
      '.vis-wrap{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:22px;align-items:stretch;}',
      '.vis-wrap.sem-mapa{grid-template-columns:minmax(0,560px);justify-content:center;}',
      '.vis-info{background:linear-gradient(180deg,#0E1B40 0%,#0C1838 100%);border:1px solid #16295C;border-radius:14px;padding:30px 28px;display:flex;flex-direction:column;gap:24px;box-shadow:0 14px 40px rgba(0,0,0,.35);}',
      '.vis-bloco{display:flex;gap:14px;align-items:flex-start;}',
      '.vis-ico{flex:0 0 42px;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(235,197,49,.10);border:1px solid rgba(235,197,49,.35);color:#EBC531;}',
      '.vis-corpo{flex:1;min-width:0;}',
      '.vis-rot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-family:"Oswald",sans-serif;font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:#94A4CC;margin-bottom:8px;}',
      '.vis-end{font-family:"Roboto",sans-serif;font-size:16px;line-height:1.55;color:#F1EAD6;overflow-wrap:anywhere;}',
      '.vis-status{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:20px;font-size:10px;letter-spacing:1.5px;font-family:"Oswald",sans-serif;}',
      '.vis-status::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;}',
      '.vis-status.on{color:#4cd07d;background:rgba(76,208,125,.12);border:1px solid rgba(76,208,125,.3);}',
      '.vis-status.off{color:#e07a7a;background:rgba(224,122,122,.10);border:1px solid rgba(224,122,122,.28);}',
      '.vis-horas{list-style:none;margin:0;padding:0;font-family:"Roboto",sans-serif;font-size:14.5px;}',
      '.vis-horas li{display:flex;justify-content:space-between;gap:16px;padding:9px 10px;margin:0 -10px;border-radius:6px;color:#F1EAD6;}',
      '.vis-horas li + li{border-top:1px solid rgba(255,255,255,.05);}',
      '.vis-horas li span:first-child{color:#94A4CC;}',
      '.vis-horas li span:last-child{text-align:right;}',
      '.vis-horas li.fechado span:last-child{color:#7183B4;}',
      '.vis-horas li.hoje{background:rgba(235,197,49,.09);border-top-color:transparent;}',
      '.vis-horas li.hoje + li{border-top-color:transparent;}',
      '.vis-horas li.hoje span:first-child{color:#EBC531;font-weight:500;}',
      '.vis-rota{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:50px;padding:13px 24px;border-radius:6px;background:#EBC531;border:1px solid #F5DC4A;color:#070E24;text-decoration:none;font-family:"Oswald",sans-serif;font-size:13px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700;margin-top:auto;box-shadow:0 10px 26px rgba(235,197,49,.16);-webkit-tap-highlight-color:transparent;transition:transform .2s,background .2s;}',
      '.vis-rota:hover{background:#F5DC4A;transform:translateY(-2px);}',
      '.vis-rota:active{transform:scale(.98);}',
      '.vis-rota:focus-visible{outline:2px solid #F1EAD6;outline-offset:2px;}',
      '.vis-mapa{position:relative;min-height:440px;border-radius:14px;overflow:hidden;border:1px solid #16295C;background:#0C1838;box-shadow:0 14px 40px rgba(0,0,0,.45);}',
      '.vis-mapa iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;}',

      /* ── Botões flutuantes ── */
      '.flut{position:fixed;right:16px;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:180;display:flex;flex-direction:column;gap:12px;align-items:flex-end;}',
      '.flut-btn{position:relative;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.12) inset;transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent;}',
      '.flut-btn:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 14px 30px rgba(0,0,0,.55);}',
      '.flut-btn:active{transform:scale(.94);}',
      '.flut-btn:focus-visible{outline:2px solid #EBC531;outline-offset:3px;}',
      '.flut-whats{background:#25D366;}',
      '.flut-whats::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid #25D366;animation:flutPulso 2.4s ease-out infinite;pointer-events:none;}',
      '.flut-insta{background:radial-gradient(circle at 30% 107%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285AEB 90%);}',
      '.flut-dica{position:absolute;right:calc(100% + 12px);top:50%;transform:translateY(-50%) translateX(6px);white-space:nowrap;background:#0C1838;color:#F1EAD6;border:1px solid #233F80;border-radius:6px;padding:7px 12px;font-family:"Oswald",sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;}',
      '@media (hover:hover){.flut-btn:hover .flut-dica{opacity:1;transform:translateY(-50%) translateX(0);}}',
      '@keyframes flutPulso{0%{transform:scale(1);opacity:.55;}80%,100%{transform:scale(1.55);opacity:0;}}',
      '@media (prefers-reduced-motion:reduce){.flut-whats::after{animation:none;display:none;}}',

      /* ── Depoimentos ── */
      '.dep-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;max-width:1000px;margin:0 auto;}',
      '.dep-card{margin:0;background:#0C1838;border:1px solid #16295C;border-radius:10px;padding:22px 20px;display:flex;flex-direction:column;gap:12px;text-align:left;}',
      '.dep-estrelas{color:#EBC531;letter-spacing:3px;font-size:16px;}',
      '.dep-card blockquote{margin:0;font-family:"Roboto",sans-serif;font-size:15px;line-height:1.6;color:#F1EAD6;overflow-wrap:anywhere;}',
      '.dep-card figcaption{font-family:"Oswald",sans-serif;font-size:14px;letter-spacing:1px;color:#94A4CC;margin-top:auto;}',

      '@media (max-width:860px){.vis-wrap{grid-template-columns:1fr;}.vis-mapa{order:-1;min-height:320px;}.vis-info{padding:24px 18px;}}',
      '@media (max-width:768px){.flut{right:12px;bottom:calc(18px + env(safe-area-inset-bottom,0px));gap:10px;}.flut-btn{width:50px;height:50px;}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ── Cria as seções (e liga o link do menu) uma única vez ──
  function criarSecoes() {
    if (el('ext-visitar')) return;

    var dep = document.createElement('section');
    dep.id = 'ext-depoimentos';
    dep.className = 'section dep-section';
    dep.style.display = 'none';
    dep.innerHTML = '<div class="section-header"><span class="section-tag">O QUE DIZEM</span><h2>Nossos Clientes</h2><div class="section-line"></div></div><div class="dep-grid" id="ext-dep-grid"></div>';
    var planos = el('planos');
    if (planos && planos.parentNode) planos.parentNode.insertBefore(dep, planos); else document.body.appendChild(dep);

    var oe = document.createElement('section');
    oe.id = 'ext-visitar';
    oe.className = 'section vis-section';
    oe.style.display = 'none';
    oe.innerHTML = '<div class="section-header"><span class="section-tag">VENHA NOS</span><h2>Visitar</h2><div class="section-line"></div></div><div class="vis-wrap" id="ext-oe-card"></div>';
    var rodape = document.querySelector('footer.footer');
    if (rodape && rodape.parentNode) rodape.parentNode.insertBefore(oe, rodape); else document.body.appendChild(oe);

    // Reaproveita o link "Onde estamos" que já existe no menu (evita ficar duplicado)
    var links = el('nav-links');
    if (links) {
      var existente = links.querySelector('a[href="#onde-estamos"]');
      if (existente) {
        existente.setAttribute('href', '#ext-visitar');
        existente.id = 'ext-nav-visitar';
      } else {
        var a = document.createElement('a');
        a.href = '#ext-visitar';
        a.id = 'ext-nav-visitar';
        a.textContent = 'Onde estamos';
        a.addEventListener('click', function () { if (typeof closeMenu === 'function') closeMenu(); });
        links.insertBefore(a, links.querySelector('.btn-nav'));
      }
      var nav = el('ext-nav-visitar');
      if (nav) nav.style.display = 'none';
    }
  }

  // ── Depoimentos ──
  function renderDepoimentos() {
    var sec = el('ext-depoimentos'), grid = el('ext-dep-grid');
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

  // ── Visitar (endereço + horários + mapa) ──
  function renderOnde() {
    var sec = el('ext-visitar'), card = el('ext-oe-card'), nav = el('ext-nav-visitar');
    if (!sec || !card) return;
    var l = ajustes().local || {};
    var endereco = String(l.endereco || '').trim();
    var enderecoLinha = endereco.replace(/\s*\n\s*/g, ', ');
    var mapaLink = urlSegura(l.mapaLink);
    var rota = mapaLink || (endereco ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(enderecoLinha) : '');
    var grupos = horarios ? gruposHorario(horarios) : [];
    if (grupos.every(function (g) { return g.fechado; })) grupos = [];

    if (!endereco && !grupos.length) {
      sec.style.display = 'none';
      if (nav) nav.style.display = 'none';
      ultimaChaveOnde = '';
      return;
    }

    var hoje = DIA_JS[new Date().getDay()];
    var aberto = grupos.length ? abertoAgora(horarios) : null;
    var chave = JSON.stringify([endereco, rota, grupos, aberto, hoje]);
    sec.style.display = '';
    if (nav) nav.style.display = '';
    if (chave === ultimaChaveOnde) return;   // nada mudou: não recarrega o mapa
    ultimaChaveOnde = chave;

    var info = '';
    if (endereco) {
      info += '<div class="vis-bloco"><div class="vis-ico">' + ICONES.pin + '</div><div class="vis-corpo">' +
        '<span class="vis-rot">Endereço</span><div class="vis-end">' + esc(endereco).replace(/\n/g, '<br>') + '</div></div></div>';
    }
    if (grupos.length) {
      var status = aberto === null ? '' : '<span class="vis-status ' + (aberto ? 'on' : 'off') + '">' + (aberto ? 'Aberto agora' : 'Fechado agora') + '</span>';
      info += '<div class="vis-bloco"><div class="vis-ico">' + ICONES.relogio + '</div><div class="vis-corpo">' +
        '<span class="vis-rot">Horário de atendimento ' + status + '</span><ul class="vis-horas">' +
        grupos.map(function (g) {
          var cls = (g.fechado ? 'fechado ' : '') + (g.dias.indexOf(hoje) >= 0 ? 'hoje' : '');
          return '<li class="' + cls.trim() + '"><span>' + esc(g.rotulo) + '</span><span>' + esc(g.texto) + '</span></li>';
        }).join('') + '</ul></div></div>';
    }
    if (rota) info += '<a class="vis-rota" href="' + esc(rota) + '" target="_blank" rel="noopener">' + ICONES.rota + 'Como chegar</a>';

    var mapa = '';
    if (endereco) {
      mapa = '<div class="vis-mapa"><iframe title="Mapa da localização" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen ' +
        'src="https://www.google.com/maps?q=' + encodeURIComponent(enderecoLinha) + '&hl=pt-BR&z=16&output=embed"></iframe></div>';
    }

    card.className = 'vis-wrap' + (mapa ? '' : ' sem-mapa');
    card.innerHTML = '<div class="vis-info">' + info + '</div>' + mapa;
  }

  // ── Botões flutuantes (WhatsApp e Instagram) ──
  function criarFlutuantes() {
    if (el('ext-flutuantes')) return;
    var box = document.createElement('div');
    box.id = 'ext-flutuantes';
    box.className = 'flut';
    box.style.display = 'none';
    document.body.appendChild(box);
  }
  function renderFlutuantes() {
    var box = el('ext-flutuantes');
    if (!box) return;
    var whats = String(BARBEARIA.whatsapp || '').replace(/\D/g, '');
    var insta = linkInstagram((ajustes().local || {}).instagram);
    var chave = JSON.stringify([whats, insta]);
    if (chave === ultimaChaveFlut) return;
    ultimaChaveFlut = chave;
    var html = '';
    if (insta) html += '<a class="flut-btn flut-insta" href="' + esc(insta.href) + '" target="_blank" rel="noopener" aria-label="Instagram ' + esc(insta.rotulo) + '">' + ICONES.insta + '<span class="flut-dica">' + esc(insta.rotulo) + '</span></a>';
    if (whats) html += '<a class="flut-btn flut-whats" href="https://wa.me/' + esc(whats) + '" target="_blank" rel="noopener" aria-label="Falar no WhatsApp">' + ICONES.whats + '<span class="flut-dica">WhatsApp</span></a>';
    box.innerHTML = html;
    box.style.display = html ? '' : 'none';
  }

  function carregarHorarios() {
    if (horariosPedido) return Promise.resolve();
    horariosPedido = true;
    if (BARBEARIA.firebasePendente || typeof firebase === 'undefined') return Promise.resolve();
    try {
      return firebase.firestore().collection('config').doc('horarios').get()
        .then(function (d) { horarios = d.exists ? (d.data() || {}) : null; })
        .catch(function (e) { console.warn('Horários (Visitar):', e); });
    } catch (e) { return Promise.resolve(); }
  }

  function renderTudo() {
    try { renderDepoimentos(); renderOnde(); renderFlutuantes(); } catch (e) { console.warn('extras-site:', e); }
  }

  function iniciar() {
    renderTudo();
    carregarHorarios().then(renderTudo);
    setInterval(function () { try { renderOnde(); } catch (e) {} }, 60000);   // atualiza "Aberto agora"
  }

  // Quando os ajustes do painel chegam do Firebase (config.js), redesenha tudo
  if (typeof carregarAjustesRemotos === 'function') {
    var original = carregarAjustesRemotos;
    window.carregarAjustesRemotos = function () {
      return Promise.resolve(original.apply(this, arguments)).then(function (r) { renderTudo(); return r; });
    };
  }

  injetarCss();
  criarSecoes();
  criarFlutuantes();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  // (usado só nos testes automáticos; não faz nada no navegador)
  if (typeof module !== 'undefined' && module.exports) module.exports = { gruposHorario: gruposHorario, linkInstagram: linkInstagram, textoDia: textoDia, abertoAgora: abertoAgora };
})();
