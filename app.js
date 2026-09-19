// ================================================
//  WELLISSON BARBER — App Principal (Cliente)
// ================================================

const WHATSAPP_NUMBER = '5585982358729';
const WHATSAPP_NOTIFY = '5585982358729';

// ─── Modo demonstração ──────────────────────────────
// true  = nada é salvo no Firebase e nenhuma mensagem de WhatsApp é aberta;
//         o fluxo inteiro roda normalmente, só a etapa final é simulada.
// false = comportamento normal (agenda de verdade).
const DEMO_MODE = false;

// ─── Slides do Slideshow (adicione URLs de imagens aqui) ───
const HERO_SLIDES = [
  // ex: 'fotos/corte1.jpg', 'fotos/corte2.jpg'
];

// ─── Serviços ─────────────────────────────────────
const SERVICES = [
  { id: 'corte',             name: 'Corte',                        price: 30,  duracao: 30 },
  { id: 'barba',             name: 'Barba',                        price: 20,  duracao: 30 },
  { id: 'sobrancelha',       name: 'Sobrancelha',                  price: 10,  duracao: 30 },
  { id: 'corte_barba',       name: 'Corte + Barba',                price: 45,  duracao: 40 },
  { id: 'corte_barba_sob',   name: 'Corte + Barba + Sobrancelha', price: 50,  duracao: 45 },
  { id: 'luzes',             name: 'Luzes',                        price: 60,  duracao: 60 },
  { id: 'luzes_corte',       name: 'Luzes + Corte',                price: 80,  duracao: 60 },
  { id: 'platinado',         name: 'Platinado',                    price: 80,  duracao: 60 },
  { id: 'platinado_corte',   name: 'Platinado + Corte',            price: 110, duracao: 60 },
];

// ─── Duração dos serviços (em minutos) ────────────
const DURACAO_PADRAO = 30;
// Serviços antigos que podem existir em agendamentos já gravados
const DURACAO_LEGADO = {
  'nevou_corte': 60, 'Nevou + Corte': 60,
  'Corte + Sobrancelha': 30, 'corte_sobrancelha': 30,
  'Hidratação': 30, 'Hidratacao': 30, 'hidratacao': 30,
};
function duracaoServico(ref) {
  if (!ref) return DURACAO_PADRAO;
  const sv = SERVICES.find(x => x.id === ref || x.name === ref);
  if (sv && sv.duracao) return sv.duracao;
  return DURACAO_LEGADO[ref] || DURACAO_PADRAO;
}
function horaParaMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

// ─── Planos ────────────────────────────────────────
const PLANS = [
  {
    id: 'barba', name: 'Barba', price: 50, featured: false,
    features: [
      'Barba 1x por semana',
    ]
  },
  {
    id: 'simples', name: 'Simples', price: 50, featured: false,
    features: [
      'Corte (2x por mês)',
      'Inclui finalização e lavagem',
    ]
  },
  {
    id: 'intermediario', name: 'Intermediário', price: 90, featured: true, badge: 'MAIS ESCOLHIDO',
    features: [
      'Corte (quantas vezes quiser no mês)',
      'Inclui finalização e lavagem',
    ]
  },
  {
    id: 'senior', name: 'Sênior', price: 130, featured: false, badge: 'TOP ESCOLHA',
    features: [
      'Corte + Barba (quantas vezes quiser no mês)',
      'Inclui finalização e lavagem',
    ]
  }
];

// ─── Estado global ─────────────────────────────────
let state = { selected: null, name: '', phone: '', date: '', time: '', obs: '' };
window.state = state;
let currentUser = null; // { nome, telefone } — preenchido após login

// ══════════════════════════════════════════════════
//  PLANOS MENSAIS
//  Cliente com plano ativo não paga os serviços incluídos no plano.
//  O plano é cadastrado pelo painel admin (campos plano, planoPagoEm e
//  planoVenceEm no documento do cliente).
// ══════════════════════════════════════════════════
// Serviços incluídos em cada plano (ids de SERVICES). Ajuste aqui se as regras mudarem.
const SERVICOS_BASICOS = ['corte', 'barba', 'sobrancelha', 'corte_barba', 'corte_barba_sob'];
const PLAN_COVERAGE = {
  barba:         ['barba'],
  simples:       SERVICOS_BASICOS,
  intermediario: SERVICOS_BASICOS,
  senior:        SERVICOS_BASICOS,
};

// Limites de uso por plano: quantos atendimentos o plano cobre por 'periodo' (do pagamento ao vencimento)
// ou por 'semana' (segunda a domingo). Plano que não aparece aqui não tem limite. Ajuste aqui se as regras mudarem.
const PLAN_LIMITS = {
  barba:   { qtd: 1, por: 'semana' },
  simples: { qtd: 2, por: 'periodo' },
};

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Plano ativo = tem plano e ainda não passou do dia do vencimento
// A checagem é feita na DATA DO ATENDIMENTO (não na data de hoje): o plano precisa valer até o dia agendado.
function dataDoAgendamento() {
  return (typeof state !== 'undefined' && state && state.date) ? state.date : hojeISO();
}
function planoAtivo(user, data) {
  const dia = data || dataDoAgendamento();
  return !!(user && user.plano && PLAN_COVERAGE[user.plano] && user.planoVenceEm && user.planoVenceEm >= dia && user.planoVenceEm >= hojeISO());
}
// Cliente tem plano cadastrado e em dia hoje, mas o dia escolhido já passa do vencimento
function planoVenceAntesDaData(user) {
  return !!(user && user.plano && PLAN_COVERAGE[user.plano] && user.planoVenceEm
    && user.planoVenceEm >= hojeISO() && state && state.date && user.planoVenceEm < state.date);
}
function nomeDoPlano(id) {
  const p = PLANS.find(x => x.id === id);
  return p ? p.name : '';
}
// Conta os atendimentos do plano já usados/agendados na janela do limite (período do plano ou semana da data)
function semanaDe(dataISO) {
  const [y, m, d] = dataISO.split('-').map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // segunda = 0
  const f = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return [f(new Date(y, m - 1, d - dow)), f(new Date(y, m - 1, d - dow + 6))];
}
async function checarUsoPlano(data) {
  const u = currentUser;
  const lim = u && PLAN_LIMITS[u.plano];
  if (!lim || DEMO_MODE || !planoAtivo(u, data)) return null;
  const [ini, fim] = lim.por === 'semana' ? semanaDe(data) : [u.planoPagoEm || '0000-00-00', u.planoVenceEm];
  try {
    const snap = await firebase.firestore().collection('agendamentos')
      .where('telefone', '==', phoneKey(u.telefone || ''))
      .where('status', 'in', ['agendado', 'confirmado', 'concluido'])
      .get();
    const usados = snap.docs.map(d => d.data())
      .filter(a => a.data >= ini && a.data <= fim && Number(a.preco) === 0 && /^Plano /.test(a.obs || '')).length;
    return { atingido: usados >= lim.qtd, usados, qtd: lim.qtd, por: lim.por };
  } catch (e) { console.warn('Uso do plano:', e); return null; }
}
function limitePlanoAtingido() {
  return !!(typeof state !== 'undefined' && state && state.planoUso && state.planoUso.atingido);
}
function servicoCoberto(service) {
  return !!service && planoAtivo(currentUser) && PLAN_COVERAGE[currentUser.plano].includes(service.id) && !limitePlanoAtingido();
}
function precoCobrado(service) {
  return servicoCoberto(service) ? 0 : Number(service.price);
}
// Relê o plano do cliente no Firestore (o dono pode ter alterado depois do login)
async function refreshPlano() {
  if (!currentUser || DEMO_MODE) { renderServiceOptions(); return; }
  try {
    const snap = await firebase.firestore().collection('clientes').doc(phoneKey(currentUser.telefone || '')).get();
    if (snap.exists) {
      const d = snap.data();
      currentUser.plano        = d.plano || '';
      currentUser.planoPagoEm  = d.planoPagoEm || '';
      currentUser.planoVenceEm = d.planoVenceEm || '';
      saveSession(currentUser);
    }
  } catch (e) { console.warn('Plano:', e); }
  renderServiceOptions();
}

// ══════════════════════════════════════════════════
//  SISTEMA DE CADASTRO / LOGIN
// ══════════════════════════════════════════════════

// Formata telefone para chave Firebase (só dígitos, sem 55)
function phoneKey(phone) {
  return phone.replace(/\D/g, '').replace(/^55/, '');
}

// Verifica se cliente existe; se não, cria
async function loginOrRegister(rawPhone, nome, nascimento) {
  const key = phoneKey(rawPhone);
  if (DEMO_MODE) {
    // Não grava nada de verdade — só simula um cadastro local.
    return { nome, telefone: key, nascimento: nascimento || '', novo: true };
  }
  const db = firebase.firestore();
  const ref = db.collection('clientes').doc(key);
  const snap = await ref.get();
  if (!snap.exists) {
    const data = {
      nome: nome,
      telefone: key,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (nascimento) data.nascimento = nascimento;
    await ref.set(data);
    return { nome, telefone: key, nascimento: nascimento || '', novo: true };
  }
  return { ...snap.data(), novo: false };
}

// Salva sessão no sessionStorage (dura enquanto a aba estiver aberta)
function saveSession(user) {
  sessionStorage.setItem('wba_user', JSON.stringify(user));
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('wba_user')); } catch { return null; }
}
function clearSession() {
  sessionStorage.removeItem('wba_user');
  currentUser = null;
  renderServiceOptions();
}

// Atualiza a UI do header de login
function renderAuthBar() {
  const bar = document.getElementById('auth-bar');
  if (!bar) return;
  if (currentUser) {
    const nome = currentUser.nome.split(' ')[0];
    bar.innerHTML = `
      <span class="auth-hello">Olá, <strong>${nome}</strong></span>
      <button class="auth-btn-secondary" onclick="openMyBookings()">Meus Agendamentos</button>
      <button class="auth-btn-logout" onclick="doLogout()">Sair</button>`;
  } else {
    bar.innerHTML = `
      <span class="auth-msg">Faça login para agendar mais rápido</span>
      <button class="auth-btn-primary" onclick="openLoginModal()">Entrar / Cadastrar</button>`;
  }
}

// Mostra um aviso de erro visível (com ícone) e sacode o campo com problema.
// step: 'phone' ou 'name' — decide em qual das duas caixas de erro escrever.
function mostrarErroLogin(step, msg, inputId) {
  const el = document.getElementById(step === 'name' ? 'login-error-name' : 'login-error-phone');
  if (el) el.textContent = msg ? msg : '';
  if (msg && inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      input.classList.remove('input-shake');
      // força reflow para poder tocar a animação de novo em erros seguidos
      void input.offsetWidth;
      input.classList.add('input-shake');
      input.focus();
    }
  }
}

// ─── Modal de Login ────────────────────────────────
window.openLoginModal = function() {
  document.getElementById('login-modal').classList.add('open');
  document.getElementById('login-step-phone').classList.add('active');
  document.getElementById('login-step-name').classList.remove('active');
  document.getElementById('login-phone-input').value = '';
  document.getElementById('login-name-input').value = '';
  mostrarErroLogin('phone', '');
  mostrarErroLogin('name', '');
};

window.closeLoginModal = function() {
  document.getElementById('login-modal').classList.remove('open');
};

window.loginCheckPhone = async function() {
  const raw = document.getElementById('login-phone-input').value.trim();
  const key = phoneKey(raw);
  if (key.length < 10) {
    mostrarErroLogin('phone', 'Digite um número válido com DDD.', 'login-phone-input');
    return;
  }
  const btn = document.getElementById('btn-login-next');
  btn.textContent = 'Verificando...'; btn.disabled = true;
  try {
    const snap = DEMO_MODE
      ? { exists: false }
      : await firebase.firestore().collection('clientes').doc(key).get();
    if (snap.exists) {
      // Já cadastrado — loga direto
      currentUser = snap.data();
      saveSession(currentUser);
      closeLoginModal();
      renderAuthBar();
      preencherDadosAgendamento();
      refreshPlano();
      showToast('Bem-vindo de volta, ' + currentUser.nome.split(' ')[0] + '!');
    } else {
      // Novo cliente — pede nome
      document.getElementById('login-step-phone').classList.remove('active');
      document.getElementById('login-step-name').classList.add('active');
      document.getElementById('login-name-input').focus();
      mostrarErroLogin('phone', '');
    }
  } catch (e) {
    mostrarErroLogin('phone', 'Erro de conexão. Tente novamente.', 'login-phone-input');
  } finally {
    btn.textContent = 'Continuar →'; btn.disabled = false;
  }
};

window.loginRegister = async function() {
  const raw  = document.getElementById('login-phone-input').value.trim();
  const nome = document.getElementById('login-name-input').value.trim();
  const nascimento = (document.getElementById('login-birth-input')?.value || '').trim();
  if (!nome || nome.split(' ').length < 2) {
    mostrarErroLogin('name', 'Digite seu nome completo (nome e sobrenome).', 'login-name-input');
    return;
  }
  const btn = document.getElementById('btn-login-register');
  btn.textContent = 'Salvando...'; btn.disabled = true;
  try {
    currentUser = await loginOrRegister(raw, nome, nascimento);
    saveSession(currentUser);
    closeLoginModal();
    renderAuthBar();
    preencherDadosAgendamento();
    refreshPlano();
    showToast('Cadastro realizado! Bem-vindo, ' + nome.split(' ')[0] + '!');
  } catch (e) {
    mostrarErroLogin('name', 'Erro ao salvar. Tente novamente.', 'login-name-input');
  } finally {
    btn.textContent = 'Cadastrar →'; btn.disabled = false;
  }
};

window.doLogout = function() {
  clearSession();
  renderAuthBar();
  // Limpa campos do agendamento
  const n = document.getElementById('client-name');
  const p = document.getElementById('client-phone');
  if (n) n.value = '';
  if (p) p.value = '';
  showToast('Até logo!');
};

// Preenche campos do form de agendamento com dados do usuário logado
function preencherDadosAgendamento() {
  if (!currentUser) return;
  const n = document.getElementById('client-name');
  const p = document.getElementById('client-phone');
  if (n) n.value = currentUser.nome || '';
  if (p) {
    // Formata o telefone
    let v = (currentUser.telefone || '').replace(/\D/g, '').substring(0, 11);
    if (v.length > 6)      v = `(${v.substring(0,2)}) ${v.substring(2,7)}-${v.substring(7)}`;
    else if (v.length > 2) v = `(${v.substring(0,2)}) ${v.substring(2)}`;
    p.value = v;
  }
}

// ─── Toast ─────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('vr-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'vr-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ══════════════════════════════════════════════════
//  MEUS AGENDAMENTOS + CANCELAMENTO
// ══════════════════════════════════════════════════

window.openMyBookings = async function() {
  if (!currentUser) { openLoginModal(); return; }
  const modal = document.getElementById('mybookings-modal');
  const list  = document.getElementById('mybookings-list');
  modal.classList.add('open');
  list.innerHTML = '<p class="mybookings-loading">Carregando...</p>';

  try {
    const key = currentUser.telefone;
    const snap = await firebase.firestore().collection('agendamentos')
      .where('telefone', '==', key)
      .where('status', 'in', ['agendado','confirmado'])
      .get();

    if (snap.empty) {
      list.innerHTML = '<p class="mybookings-empty">Nenhum agendamento ativo.</p>';
      return;
    }

    // Filtra futuros e ordena por data+horario no JS (evita índice composto no Firestore)
    const _h = new Date(); const hoje = `${_h.getFullYear()}-${String(_h.getMonth()+1).padStart(2,'0')}-${String(_h.getDate()).padStart(2,'0')}`;
    const docs = snap.docs
      .filter(d => d.data().data >= hoje)
      .sort((a, b) => {
        const da = a.data(), db = b.data();
        return (da.data + da.horario).localeCompare(db.data + db.horario);
      });

    if (!docs.length) {
      list.innerHTML = '<p class="mybookings-empty">Nenhum agendamento futuro.</p>';
      return;
    }

    list.innerHTML = docs.map(d => {
      const a = d.data();
      const statusLabel = a.status === 'confirmado'
        ? '<span class="agd-status confirmado">Confirmado</span>'
        : '<span class="agd-status agendado">Agendado</span>';
      return `
        <div class="agd-card" id="agd-${d.id}">
          <div class="agd-info">
            <div class="agd-servico">${a.servico}</div>
            <div class="agd-detalhe">${formatDate(a.data)} · ${a.horario}</div>
            <div class="agd-preco"${Number(a.preco) === 0 ? ' style="font-size:14px;"' : ''}>${Number(a.preco) === 0 ? 'Incluso no plano' : 'R$' + Number(a.preco).toFixed(2).replace('.',',')}</div>
            ${statusLabel}
          </div>
          <button class="btn-cancelar" onclick="cancelarAgendamento('${d.id}', '${a.servico}', '${a.data}', '${a.horario}')">
            Cancelar
          </button>
        </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<p class="mybookings-empty">Erro ao carregar. Tente novamente.</p>';
  }
};

window.closeMyBookings = function() {
  document.getElementById('mybookings-modal').classList.remove('open');
};

window.cancelarAgendamento = async function(id, servico, data, horario) {
  const confirma = confirm(`Cancelar ${servico} em ${formatDate(data)} às ${horario}?`);
  if (!confirma) return;

  const card = document.getElementById('agd-' + id);
  if (card) card.style.opacity = '0.4';

  try {
    await firebase.firestore().collection('agendamentos').doc(id).update({
      status: 'cancelado',
      canceladoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Notifica dono no WhatsApp
    const msg = encodeURIComponent(
      `*Cancelamento*\n\n*Cliente:* ${currentUser ? currentUser.nome : ''}\n*Serviço:* ${servico}\n*Data:* ${formatDate(data)}\n*Horário:* ${horario}`
    );
    window.open(`https://wa.me/${WHATSAPP_NOTIFY}?text=${msg}`, '_blank');

    if (card) card.remove();
    showToast('Agendamento cancelado.');

    // Se ficou vazio, atualiza mensagem
    const list = document.getElementById('mybookings-list');
    if (list && !list.querySelector('.agd-card')) {
      list.innerHTML = '<p class="mybookings-empty">Nenhum agendamento ativo.</p>';
    }
  } catch (e) {
    if (card) card.style.opacity = '1';
    alert('Erro ao cancelar. Tente novamente.');
  }
};

// ─── Renderiza cards de serviços ───────────────────
function renderServices() {
  const grid = document.getElementById('services-grid');
  if (!grid) return;
  grid.innerHTML = SERVICES.map(s => `
    <div class="service-card" onclick="scrollToBooking('${s.id}')">
      <span class="service-name">${s.name}</span>
      <span class="service-price">R$${s.price.toFixed(2).replace('.', ',')}</span>
    </div>`).join('');
}

// ─── Renderiza planos ──────────────────────────────
function renderPlans() {
  const grid = document.getElementById('plans-grid');
  if (!grid) return;
  grid.innerHTML = PLANS.map(p => `
    <div class="plan-card ${p.featured ? 'featured' : ''}">
      ${p.badge ? `<div class="plan-badge">${p.badge}</div>` : ''}
      <div class="plan-name">${p.name}</div>
      <div class="plan-price">R$${p.price}</div>
      <div class="plan-price-sub">/ MÊS</div>
      <div class="plan-divider"></div>
      <ul class="plan-features">
        ${p.features.map(f => `<li>${f}</li>`).join('')}
      </ul>
      <button class="btn-plan" onclick="openPlanModal('${p.id}', '${p.name}', ${p.price})">
        Tenho Interesse
      </button>
    </div>`).join('');

}

// ─── Modal de interesse no plano ──────────────────
window.openPlanModal = function(planId, planName, price) {
  const modal = document.getElementById('plan-modal');
  document.getElementById('plan-modal-title').textContent = `Plano ${planName} — R$${price}/mês`;
  document.getElementById('plan-modal-question').value = '';
  const waBtn = document.getElementById('plan-modal-wa');
  waBtn.onclick = function(e) {
    e.preventDefault();
    const duvida = document.getElementById('plan-modal-question').value.trim();
    let msg = `Olá! Tenho interesse no *Plano ${planName}* da Wellisson Barber (R$${price}/mês).`;
    if (duvida) msg += `\n\nMinha dúvida: ${duvida}`;
    else msg += `\n\nPode me passar mais informações?`;
    window.open(`https://wa.me/${WHATSAPP_NOTIFY}?text=${encodeURIComponent(msg)}`, '_blank');
    closePlanModal();
  };
  modal.classList.add('open');
};
window.closePlanModal = function() {
  document.getElementById('plan-modal').classList.remove('open');
};

// ─── Scroll para agendamento ───────────────────────
window.scrollToBooking = function(serviceId) {
  document.getElementById('agendar').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => preSelectService(serviceId), 600);
};

function preSelectService(serviceId) {
  if (!currentUser) {
    showToast('Faça login para agendar.');
    openLoginModal();
    return;
  }
  const service = SERVICES.find(s => s.id === serviceId);
  if (!service) return;
  state.selected = service;
  renderServiceOptions();
  setTimeout(() => {
    const item = document.getElementById('opt-' + serviceId);
    if (item) { item.classList.add('selected'); item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    showStep(2);
    preencherDadosAgendamento();
  }, 50);
}

// ─── Lista de serviços no formulário ───────────────
function renderServiceOptions() {
  const list = document.getElementById('options-list');
  if (!list) return;

  // Aviso do plano ativo
  let info = document.getElementById('plano-info');
  if (!info) {
    info = document.createElement('p');
    info.id = 'plano-info';
    info.style.cssText = 'display:none;margin:0 0 16px;padding:12px 16px;border:1px solid rgba(235,197,49,0.35);background:rgba(235,197,49,0.08);border-radius:6px;color:#F1EAD6;font-family:Roboto,sans-serif;font-size:13px;line-height:1.5;';
    list.parentNode.insertBefore(info, list);
  }
  if (planoAtivo(currentUser)) {
    info.innerHTML = `Plano <strong>${nomeDoPlano(currentUser.plano)}</strong> ativo até ${formatDate(currentUser.planoVenceEm)}. Os serviços incluídos no seu plano não são cobrados.`;
    info.style.display = 'block';
  } else {
    info.style.display = 'none';
  }

  list.innerHTML = SERVICES.map(s => {
    const coberto = servicoCoberto(s);
    const preco = coberto
      ? '<span class="option-price" style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Incluso no plano</span>'
      : `<span class="option-price">R$${s.price.toFixed(2).replace('.', ',')}</span>`;
    return `
    <div class="option-item" id="opt-${s.id}" onclick="selectService('${s.id}')">
      <span>${s.name}</span>
      ${preco}
    </div>`;
  }).join('');
}

// ─── Slideshow Seção Cortes ────────────────────────
function initSlideshow() {
  const slider   = document.getElementById('cortes-slider');
  const dotsWrap = document.getElementById('cortes-dots');
  // Se não houver elemento de slider ou slides cadastrados, sai silenciosamente
  if (!slider || !HERO_SLIDES.length) return;
  const total = HERO_SLIDES.length;
  let current = 0, autoTimer;

  HERO_SLIDES.forEach(src => {
    const div = document.createElement('div');
    div.className = 'cortes-slide';
    div.style.backgroundImage = 'url(' + src + ')';
    slider.appendChild(div);
  });

  const wrap = slider.parentElement;
  const counter = document.createElement('div');
  counter.className = 'cortes-counter';
  counter.textContent = '1 / ' + total;
  wrap.appendChild(counter);

  if (dotsWrap) {
    HERO_SLIDES.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'cortes-dot' + (i === 0 ? ' active' : '');
      dot.onclick = function() { goTo(i); };
      dotsWrap.appendChild(dot);
    });
  }

  function goTo(idx) {
    current = (idx + total) % total;
    slider.style.transform = 'translateX(-' + (current * 100) + '%)';
    document.querySelectorAll('.cortes-dot').forEach(function(d, i) { d.classList.toggle('active', i === current); });
    counter.textContent = (current + 1) + ' / ' + total;
    resetAuto();
  }
  function resetAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(function() { goTo(current + 1); }, 4500);
  }

  const prevBtn = document.getElementById('cortes-prev');
  const nextBtn = document.getElementById('cortes-next');
  if (prevBtn) prevBtn.onclick = function() { goTo(current - 1); };
  if (nextBtn) nextBtn.onclick = function() { goTo(current + 1); };

  let startX = 0;
  slider.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; }, { passive: true });
  slider.addEventListener('touchend', function(e) {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) goTo(diff > 0 ? current + 1 : current - 1);
  });
  resetAuto();
}

// ─── Gera slots de horário ─────────────────────────
function gerarSlots(inicio, fim, almoco, almoco_inicio, almoco_fim) {
  const slots = [];
  if (!inicio || !fim) return slots;
  let [h, m] = inicio.split(':').map(Number);
  const [hf, mf] = fim.split(':').map(Number);
  const fimMin = hf * 60 + mf;
  const pausaAtiva = almoco === true
    && typeof almoco_inicio === 'string' && almoco_inicio.includes(':')
    && typeof almoco_fim    === 'string' && almoco_fim.includes(':');
  const pausaInicio = pausaAtiva ? parseInt(almoco_inicio.split(':')[0])*60+parseInt(almoco_inicio.split(':')[1]) : -1;
  const pausaFim    = pausaAtiva ? parseInt(almoco_fim.split(':')[0])*60+parseInt(almoco_fim.split(':')[1]) : -1;
  while (h * 60 + m < fimMin) {
    const cur = h * 60 + m;
    if (!(pausaAtiva && cur >= pausaInicio && cur < pausaFim)) slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    m += 30; if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

const DIAS_KEY = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];

async function carregarSlotsParaData(dataSelecionada) {
  const select = document.getElementById('pref-time');
  if (!select) return;
  select.innerHTML = '<option value="">Carregando...</option>';
  select.disabled = true;
  try {
    const [configDoc, datasDoc, agendSnap] = await Promise.all([
      firebase.firestore().collection('config').doc('horarios').get(),
      firebase.firestore().collection('config').doc('datas_especiais').get(),
      firebase.firestore().collection('agendamentos')
        .where('data', '==', dataSelecionada)
        .where('status', 'in', ['agendado', 'confirmado'])
        .get()
    ]);
    // Intervalos ocupados [início, fim) em minutos, respeitando a duração de cada serviço
    const ocupados = [];
    agendSnap.docs.forEach(d => {
      const ag = d.data();
      if (!ag.horario) return;
      const ini = horaParaMin(ag.horario);
      ocupados.push([ini, ini + duracaoServico(ag.servicoId || ag.servico)]);
    });
    const datasEspeciais = datasDoc.exists ? (datasDoc.data() || {}) : {};
    const dataEspecial   = datasEspeciais[dataSelecionada];
    let cfg;
    if (dataEspecial) {
      if (dataEspecial.tipo === 'fechado') {
        select.innerHTML = '<option value="">Sem atendimento neste dia</option>';
        return;
      }
      cfg = dataEspecial;
    } else {
      const diaSemana = new Date(dataSelecionada + 'T12:00:00').getDay();
      const diaKey = DIAS_KEY[diaSemana];
      const horarios = configDoc.exists ? (configDoc.data() || {}) : {};
      cfg = horarios[diaKey];
      if (!cfg || cfg.ativo === false || cfg.fechado) {
        select.innerHTML = '<option value="">Sem atendimento neste dia</option>';
        return;
      }
    }
    const slots = gerarSlots(cfg.inicio, cfg.fim, cfg.almoco, cfg.almoco_inicio, cfg.almoco_fim);
    const agora = new Date();
    const hoje  = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-${String(agora.getDate()).padStart(2,'0')}`;
    const agoraMin = agora.getHours() * 60 + agora.getMinutes();
    // Duração do serviço escolhido
    const servicoAtual = state && state.selected ? state.selected : null;
    const duracao = servicoAtual ? duracaoServico(servicoAtual.id) : DURACAO_PADRAO;
    const fimExpediente = horaParaMin(cfg.fim);
    const pausaAtiva = cfg.almoco === true
      && typeof cfg.almoco_inicio === 'string' && cfg.almoco_inicio.includes(':')
      && typeof cfg.almoco_fim    === 'string' && cfg.almoco_fim.includes(':');
    const pausaIni = pausaAtiva ? horaParaMin(cfg.almoco_inicio) : -1;
    const pausaFim = pausaAtiva ? horaParaMin(cfg.almoco_fim) : -1;

    const livres = slots.filter(sl => {
      const ini = horaParaMin(sl);
      const fim = ini + duracao;
      if (fim > fimExpediente) return false;                              // passa do fim do expediente
      if (pausaAtiva && ini < pausaFim && fim > pausaIni) return false;   // invade o almoço
      if (ocupados.some(([oi, oe]) => ini < oe && fim > oi)) return false; // choca com outro agendamento
      if (dataSelecionada === hoje && ini <= agoraMin + 30) return false; // horário que já passou
      return true;
    });
    if (!livres.length) {
      select.innerHTML = '<option value="">Sem horários disponíveis</option>';
    } else {
      select.innerHTML = '<option value="">Selecione um horário</option>' +
        livres.map(s => `<option value="${s}">${s}</option>`).join('');
      select.disabled = false;
    }
  } catch (e) {
    select.innerHTML = '<option value="">Erro ao carregar horários</option>';
  }
}

// ─── Calendário ────────────────────────────────────
let calAno, calMes;
let _calHorarios = null;      // cache dos horários do Firestore
let _calDatasEsp = null;      // cache das datas especiais
const mesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

async function carregarConfigCalendario() {
  if (_calHorarios && _calDatasEsp) return; // já carregado
  try {
    const [hDoc, dDoc] = await Promise.all([
      firebase.firestore().collection('config').doc('horarios').get(),
      firebase.firestore().collection('config').doc('datas_especiais').get(),
    ]);
    _calHorarios = hDoc.exists ? (hDoc.data() || {}) : {};
    _calDatasEsp = dDoc.exists ? (dDoc.data() || {}) : {};
  } catch(e) {
    _calHorarios = {};
    _calDatasEsp = {};
  }
}

function isDiaDisponivel(dateStr) {
  if (!_calHorarios) return true; // ainda carregando, permite clicar
  const dataEsp = _calDatasEsp && _calDatasEsp[dateStr];
  if (dataEsp) return dataEsp.tipo !== 'fechado';
  const diaSemana = new Date(dateStr + 'T12:00:00').getDay();
  const diaKey = DIAS_KEY[diaSemana];
  const cfg = _calHorarios[diaKey];
  if (!cfg) return false;
  return cfg.ativo !== false && !cfg.fechado;
}

function renderCalendario() {
  const wrap = document.getElementById('cal-wrap');
  if (!wrap) return;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const firstDay = new Date(calAno, calMes, 1).getDay();
  const daysInMonth = new Date(calAno, calMes + 1, 0).getDate();
  let cells = '';
  ['D','S','T','Q','Q','S','S'].forEach(d => {
    cells += `<div style="text-align:center;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:1px;color:#5E6E9E;padding:4px 0;">${d}</div>`;
  });
  for (let i = 0; i < firstDay; i++) cells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calAno}-${String(calMes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayDate = new Date(calAno, calMes, d);
    const isPast  = dayDate < hoje;
    const isSel   = dateStr === state.date;
    const isFechado = !isPast && !isDiaDisponivel(dateStr);
    if (isPast || isFechado) {
      cells += `<div style="text-align:center;padding:8px 4px;font-family:'Roboto',sans-serif;font-size:13px;color:#1B3168;border:1px solid #0F1F45;border-radius:4px;${isFechado && !isPast ? 'text-decoration:line-through;' : ''}">${d}</div>`;
    } else {
      cells += `<div class="cal-dia" onclick="selecionarData('${dateStr}')" style="text-align:center;padding:8px 4px;font-family:'Roboto',sans-serif;font-size:13px;color:${isSel?'#070E24':'#F1EAD6'};background:${isSel?'#EBC531':'transparent'};border:1px solid ${isSel?'#EBC531':'#1B3168'};border-radius:4px;cursor:pointer;transition:all 0.2s;">${d}</div>`;
    }
  }
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <button onclick="mudarMes(-1)" style="background:none;border:1px solid #233F80;color:#F1EAD6;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:16px;">‹</button>
      <span style="font-family:'Oswald',sans-serif;font-size:14px;letter-spacing:2px;color:#F1EAD6;text-transform:uppercase;">${mesNomes[calMes]} ${calAno}</span>
      <button onclick="mudarMes(1)" style="background:none;border:1px solid #233F80;color:#F1EAD6;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:16px;">›</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${cells}</div>
    <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;">
      <span style="font-size:11px;color:#5E6E9E;font-family:'Roboto',sans-serif;">■ <span style="color:#F1EAD6;">Disponível</span></span>
      <span style="font-size:11px;color:#5E6E9E;font-family:'Roboto',sans-serif;">■ <span style="color:#233F80;">Indisponível</span></span>
      <span style="font-size:11px;color:#EBC531;font-family:'Roboto',sans-serif;">■ <span style="color:#EBC531;">Selecionado</span></span>
    </div>`;
}

window.mudarMes = function(delta) {
  calMes += delta;
  if (calMes > 11) { calMes = 0; calAno++; }
  if (calMes < 0)  { calMes = 11; calAno--; }
  // Invalida cache para buscar datas especiais atualizadas
  _calDatasEsp = null;
  carregarConfigCalendario().then(() => renderCalendario());
};

window.selecionarData = function(dateStr) {
  state.date = dateStr;
  state.planoUso = null;
  document.querySelectorAll('.cal-dia').forEach(el => {
    const onclick = el.getAttribute('onclick') || '';
    const isSelected = onclick.includes(dateStr);
    el.style.background = isSelected ? '#EBC531' : 'transparent';
    el.style.color       = isSelected ? '#070E24' : '#F1EAD6';
    el.style.border      = isSelected ? '1px solid #EBC531' : '1px solid #1B3168';
  });
  const inp = document.getElementById('pref-date');
  if (inp) inp.value = dateStr;
  carregarSlotsParaData(dateStr);
};

// ─── Controle de passos ────────────────────────────
function showStep(n) {
  document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 < n) el.classList.add('done');
    if (i + 1 === n) el.classList.add('active');
  });
  document.querySelectorAll('.step-line').forEach((el, i) => {
    el.classList.toggle('active', i + 1 < n);
  });
  const stepEl = document.getElementById('step-' + n);
  if (stepEl) stepEl.classList.add('active');
}

window.goBack = function(n) { showStep(n); };

window.selectService = function(id) {
  if (!currentUser) {
    showToast('Faça login para agendar.');
    openLoginModal();
    return;
  }
  const s = SERVICES.find(x => x.id === id);
  if (!s) return;
  state.selected = s;
  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
  const item = document.getElementById('opt-' + id);
  if (item) item.classList.add('selected');
  setTimeout(() => {
    showStep(2);
    preencherDadosAgendamento();
    const now = new Date();
    if (!calAno) { calAno = now.getFullYear(); calMes = now.getMonth(); }
    carregarConfigCalendario().then(() => renderCalendario());
  }, 180);
};

window.goToConfirm = async function() {
  if (!currentUser) {
    showToast('Faça login para continuar.');
    openLoginModal();
    return;
  }
  const name  = document.getElementById('client-name').value.trim();
  const phone = document.getElementById('client-phone').value.trim();
  const date  = state.date || document.getElementById('pref-date').value;
  const time  = document.getElementById('pref-time').value;
  if (!name || !phone || !date || !time) {
    alert('Por favor, preencha todos os campos obrigatórios (*).');
    return;
  }
  state.name = name; state.phone = phone; state.date = date; state.time = time;
  state.obs = document.getElementById('obs').value.trim();
  state.planoUso = await checarUsoPlano(date); // limite de uso do plano (ex.: Simples = 2x no mês)
  renderConfirm();
  showStep(3);
};

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function renderConfirm() {
  const sel = state.selected;
  document.getElementById('confirm-summary').innerHTML = `
    <div class="confirm-row"><label>Serviço</label><span>${sel.name}</span></div>
    <div class="confirm-row"><label>Cliente</label><span>${state.name}</span></div>
    <div class="confirm-row"><label>WhatsApp</label><span>${state.phone}</span></div>
    <div class="confirm-row"><label>Data</label><span>${formatDate(state.date)}</span></div>
    <div class="confirm-row"><label>Horário</label><span>${state.time}</span></div>
    ${state.obs ? `<div class="confirm-row"><label>Obs.</label><span>${state.obs}</span></div>` : ''}
    ${(limitePlanoAtingido() && PLAN_COVERAGE[currentUser.plano].includes(sel.id)) ? `<div class="confirm-row"><label>Plano</label><span style="font-size:13px;">Você já usou ${state.planoUso.usados} de ${state.planoUso.qtd} atendimentos do plano ${state.planoUso.por === 'semana' ? 'nesta semana' : 'neste mês'}. Este atendimento será cobrado.</span></div>` : ''}
    ${planoVenceAntesDaData(currentUser) ? `<div class="confirm-row"><label>Plano</label><span style="font-size:13px;">Seu plano vence em ${formatDate(currentUser.planoVenceEm)}, antes desta data. O serviço será cobrado.</span></div>` : ''}
    <div class="confirm-row confirm-total"><label>Valor</label>
      ${servicoCoberto(sel)
        ? `<span style="font-size:16px;">Incluso no plano ${nomeDoPlano(currentUser.plano)}</span>`
        : `<span>R$${Number(sel.price).toFixed(2).replace('.', ',')}</span>`}
    </div>`;
}

function sendWhatsAppNotification() {
  const sel = state.selected;
  const lines = [
    '*Novo Agendamento!*', '',
    '*Cliente:* ' + state.name,
    '*WhatsApp:* ' + state.phone,
    '*Servico:* ' + sel.name,
    '*Data:* ' + formatDate(state.date),
    '*Horario:* ' + state.time,
    servicoCoberto(sel)
      ? '*Valor:* Incluso no plano ' + nomeDoPlano(currentUser.plano) + ' (sem cobrança)'
      : '*Valor:* R$' + Number(sel.price).toFixed(2).replace('.', ','),
  ];
  if (state.obs) lines.push('*Obs:* ' + state.obs);
  window.open(`https://wa.me/${WHATSAPP_NOTIFY}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

function sendClientConfirmation() {
  const sel = state.selected;
  const primeiroNome = state.name.split(' ')[0];
  const lines = [
    `Olá, *${primeiroNome}*!`, '',
    'Recebemos seu agendamento na *Wellisson Barber* e em breve entraremos em contato para confirmar o horário.', '',
    '*Resumo do seu agendamento:*',
    '*Serviço:* ' + sel.name,
    '*Data:* ' + formatDate(state.date),
    '*Horário:* ' + state.time,
    '*Valor:* R$' + Number(sel.price).toFixed(2).replace('.', ','), '',
    'Qualquer dúvida, é só responder esta mensagem. Te esperamos!',
  ];
  const clientPhone = state.phone.replace(/\D/g, '').replace(/^55/, '');
  window.open(`https://wa.me/55${clientPhone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

window.submitBooking = async function() {
  if (window._submitting) return;
  window._submitting = true;
  const btn = document.querySelector('.btn-confirm');
  btn.textContent = 'Enviando...'; btn.disabled = true;
  try {
    if (DEMO_MODE) {
      // Modo demonstração: não grava no Firebase e não abre WhatsApp de verdade.
      console.log('[DEMO] Agendamento simulado:', { ...state });
    } else {
      const key = phoneKey(state.phone);
      await refreshPlano(); // confirma o plano no banco antes de definir o valor
      state.planoUso = await checarUsoPlano(state.date); // e o limite de uso, na hora de gravar
      const coberto  = servicoCoberto(state.selected);
      const obsFinal = coberto
        ? 'Plano ' + nomeDoPlano(currentUser.plano) + ' - sem cobrança' + (state.obs ? ' | ' + state.obs : '')
        : (limitePlanoAtingido() && PLAN_COVERAGE[currentUser.plano].includes(state.selected.id)
            ? 'Limite do plano atingido - cobrar' + (state.obs ? ' | ' + state.obs : '')
            : state.obs);
      await firebase.firestore().collection('agendamentos').add({
        tipo: 'servico', servico: state.selected.name, preco: precoCobrado(state.selected),
        cliente: state.name, telefone: key,
        data: state.date, horario: state.time, obs: obsFinal,
        status: 'agendado',
          criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
      sendWhatsAppNotification();
      // (confirmação para o cliente desativada: o agendamento vai só para o WhatsApp da barbearia)
    }
    document.getElementById('success-modal').classList.add('open');
    state = { selected: null, name: '', phone: '', date: '', time: '', obs: '' };
    window.state = state;
    const _now = new Date(); calAno = _now.getFullYear(); calMes = _now.getMonth();
    ['client-name','client-phone','pref-date','obs'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('pref-time').innerHTML = '<option value="">Selecione uma data primeiro</option>';
    document.getElementById('pref-time').disabled = true;
    const calWrap = document.getElementById('cal-wrap');
    if (calWrap) calWrap.innerHTML = '';
    renderServiceOptions();
    showStep(1);
    preencherDadosAgendamento();
  } catch (err) {
    console.error(err);
    alert('Erro ao enviar. Verifique a conexão e tente novamente.');
  } finally {
    btn.textContent = 'Confirmar'; btn.disabled = false;
    window._submitting = false;
  }
};

window.closeModal = function() {
  document.getElementById('success-modal').classList.remove('open');
};

// ─── Inicialização ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderServices();
  renderPlans();
  renderServiceOptions();
  initSlideshow(); // seguro: retorna cedo se não houver slider no HTML

  // Sessão
  currentUser = loadSession();
  renderAuthBar();
  if (currentUser) { preencherDadosAgendamento(); refreshPlano(); }

  // Máscara telefone (apenas se usuário não estiver logado)
  const phoneInput = document.getElementById('client-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', function() {
      if (currentUser) return; // não sobrescreve enquanto logado
      let v = this.value.replace(/\D/g, '').substring(0, 11);
      if (v.length > 6)      v = `(${v.substring(0,2)}) ${v.substring(2,7)}-${v.substring(7)}`;
      else if (v.length > 2) v = `(${v.substring(0,2)}) ${v.substring(2)}`;
      else if (v.length > 0) v = `(${v}`;
      this.value = v;
    });
  }

  // Máscara telefone do modal de login
  const loginPhoneInput = document.getElementById('login-phone-input');
  if (loginPhoneInput) {
    loginPhoneInput.addEventListener('input', function() {
      let v = this.value.replace(/\D/g, '').substring(0, 11);
      if (v.length > 6)      v = `(${v.substring(0,2)}) ${v.substring(2,7)}-${v.substring(7)}`;
      else if (v.length > 2) v = `(${v.substring(0,2)}) ${v.substring(2)}`;
      else if (v.length > 0) v = `(${v}`;
      this.value = v;
    });
  }
});
