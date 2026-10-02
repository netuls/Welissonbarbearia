#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  TESTES AUTOMÁTICOS DAS REGRAS DE PREÇO, PLANO, BENEFÍCIOS E RELATÓRIOS
//
//  Como usar (precisa do Node.js, versão 16 ou mais nova):
//     node testes/rodar.js                    -> testa os arquivos da pasta atual (ou da pasta acima)
//     node testes/rodar.js caminho/do/site    -> testa a pasta indicada (onde estão config.js, app.js e admin.js)
//     node testes/rodar.js --verbose          -> mostra cada teste que passou
//
//  Os testes carregam o app.js e o admin.js de verdade (sem navegador e sem Firebase: o banco é simulado em memória)
//  e conferem o que o site cobra do cliente e o que o painel conta como receita. Se algum teste falhar, o programa
//  termina com erro (código 1), então também serve para rodar automaticamente no GitHub (Actions).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const pasta = path.resolve(args.find(a => !a.startsWith('--')) || (fs.existsSync('config.js') ? '.' : '..'));
for (const f of ['config.js', 'app.js', 'admin.js']) {
  if (!fs.existsSync(path.join(pasta, f))) { console.error('Não achei ' + f + ' em ' + pasta + '. Passe a pasta do site: node testes/rodar.js caminho/do/site'); process.exit(2); }
}
const ler = f => fs.readFileSync(path.join(pasta, f), 'utf8');

// ── Hoje e datas relativas (os testes não dependem do dia em que rodam) ──
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dia = off => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return iso(d); };
const HOJE = dia(0), FUTURO = '2099-12-31';

// ── Banco de dados simulado (só o que o site usa: collection().where().where().get()) ──
function criarBanco(dados) {
  const consulta = lista => ({
    where(campo, op, valor) { return consulta(lista.filter(r => op === '==' ? r[campo] === valor : op === 'in' ? valor.includes(r[campo]) : true)); },
    get() { if (dados && dados.__erro) return Promise.reject(new Error('sem rede')); const docs = lista.map((r, i) => ({ id: r.id || 'id' + i, data: () => r, ref: {} })); return Promise.resolve({ docs, empty: !docs.length, forEach: f => docs.forEach(f) }); },
  });
  return { collection: nome => Object.assign(consulta((dados && dados[nome]) || []), { doc: () => ({ get: () => Promise.resolve({ exists: false, data: () => ({}) }) }) }) };
}

// ── Ambiente de navegador falso, só o suficiente para os arquivos carregarem ──
function criarContexto(dados) {
  const noop = () => {};
  const elemento = () => ({ style: { setProperty: noop }, setAttribute: noop, getAttribute: () => null, closest: () => null, querySelectorAll: () => [], dataset: {}, appendChild: noop, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop });
  const doc = { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: elemento,
    head: { appendChild: noop }, body: { appendChild: noop, style: {} }, documentElement: elemento(), readyState: 'loading' };
  const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
  const banco = criarBanco(dados || {});
  const firebase = { initializeApp: noop, messaging() { throw new Error('sem push nos testes'); } };
  firebase.firestore = Object.assign(() => banco, { FieldValue: { serverTimestamp: () => 'TS', delete: () => 'DEL', arrayUnion: (...a) => a } });
  firebase.auth = Object.assign(() => ({ setPersistence: () => Promise.resolve(), onAuthStateChanged: noop, signInWithEmailAndPassword: noop, signOut: noop }), { Auth: { Persistence: { LOCAL: 'local' } } });
  const timer = (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; };
  const ctx = { document: doc, window: { addEventListener: noop }, localStorage: mem(), sessionStorage: mem(), navigator: {}, location: { href: '' }, firebase,
    console: { log: noop, warn: noop, error: noop, info: noop }, setTimeout: timer, clearTimeout, setInterval: noop, Promise, Date, JSON, Math, Number, String, Array, Object, RegExp, Set, Map, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent };
  ctx.window.document = doc;
  return vm.createContext(ctx);
}
function carregar(arquivo, dados, api) {
  const ctx = criarContexto(dados);
  vm.runInContext(ler('config.js'), ctx, { filename: 'config.js' });
  vm.runInContext(ler(arquivo), ctx, { filename: arquivo });
  vm.runInContext('globalThis.__api = ' + api, ctx);
  return ctx.__api;
}

// Cenário padrão dos testes (independente dos serviços e planos reais do site)
const SERVICOS = [{ id: 'corte', name: 'Corte', price: 40, duracao: 30 }, { id: 'barba', name: 'Barba', price: 30, duracao: 30 }, { id: 'sob', name: 'Sobrancelha', price: 10, duracao: 15 }];
const PLANOS = [
  { id: 'simples', nome: 'Simples', preco: 50, itens: [], servicosIncluidos: ['corte'], limite: { qtd: 2, por: 'periodo' } },
  { id: 'livre', nome: 'Livre', preco: 90, itens: [], servicosIncluidos: ['corte', 'barba'] },
];
const API_APP = `{
  setPoliticas(p) { BARBEARIA.politicas = Object.assign({}, BARBEARIA.politicas, p); },
  setUser(u) { currentUser = u; }, getUser() { return currentUser; },
  setPlanoUso(u) { state.planoUso = u; }, selecionar(id) { state.selected = SERVICES.find(s => s.id === id) || null; },
  preco: id => precoCobrado(SERVICES.find(s => s.id === id)), coberto: id => servicoCoberto(SERVICES.find(s => s.id === id)),
  beneficio: id => beneficioDoAtendimento(SERVICES.find(s => s.id === id)), desconto: () => descontoAtual(),
  usoPlano: d => checarUsoPlano(d), refreshFid: () => refreshFidelidade(), aniv: () => aniversarioDisponivel(),
  init(servicos, planos) { SERVICES = servicos.map(s => Object.assign({}, s)); BARBEARIA.planos = planos; BARBEARIA.planosAtivos = true; montarPlanos(); },
}`;
const API_ADMIN = `{
  init(servicos, planos, ags, clientes) { SERVICES = servicos.map(s => Object.assign({}, s)); BARBEARIA.planos = planos; BARBEARIA.planosAtivos = true; montarPlanosAdmin(); allAgendamentos = ags; _clientesFirestore = clientes; },
  coberto: a => atendimentoCobertoPorPlano(a), receita: a => valorReceita(a), mes: m => relatorioDoMes(m), meses: (f, n) => relatorioPorMes(f, n),
  somar: (m, d) => relatSomarMeses(m, d), cobranca: (n, p, v) => mensagemCobrancaPlano(n, p, v), formas(f) { FORMAS_PAGAMENTO = f; },
}`;
function app(politicas, usuario, dados) {
  const a = carregar('app.js', dados, API_APP);
  a.init(SERVICOS, PLANOS);
  a.setPoliticas(Object.assign({ fidelAtivo: false, aniversarioDescPct: 0, retornoDescPct: 0, fidelTipo: 'desconto', aniversarioTipo: 'desconto', retornoTipo: 'desconto' }, politicas || {}));
  a.setUser(Object.assign({ nome: 'Cliente Teste', telefone: '85999990001' }, usuario || {}));
  return a;
}
const comPlano = (plano, extra) => Object.assign({ plano, planoPagoEm: dia(-5), planoVenceEm: FUTURO }, extra || {});

// ── Mini framework de teste ──
const fila = []; let passou = 0; const falhas = [];
const teste = (nome, fn) => fila.push({ nome, fn });
async function executar() {
  for (const t of fila) {
    try { await t.fn(); passou++; if (verbose) console.log('  ✓ ' + t.nome); }
    catch (e) { falhas.push({ nome: t.nome, erro: e }); console.log('  ✗ ' + t.nome + '\n      ' + String(e.message).split('\n').join('\n      ')); }
  }
  console.log('\n' + (falhas.length ? '✗ ' + falhas.length + ' teste(s) falharam, ' : '✓ ') + passou + ' passaram, total ' + fila.length + '  (pasta: ' + pasta + ')');
  process.exit(falhas.length ? 1 : 0);
}
const igual = assert.strictEqual;

// ═══════════════════════ SITE: PREÇO E PLANO ═══════════════════════
teste('sem plano e sem benefício: cobra o preço cheio', () => { const a = app(); igual(a.preco('corte'), 40); igual(a.coberto('corte'), false); });
teste('plano ativo: serviço coberto sai por R$ 0 e o resto é cobrado', () => {
  const a = app({}, comPlano('livre')); igual(a.coberto('corte'), true); igual(a.preco('corte'), 0); igual(a.preco('barba'), 0); igual(a.preco('sob'), 10); igual(a.coberto('sob'), false);
});
teste('plano que cobre só o corte não cobre a barba', () => { const a = app({}, comPlano('simples')); igual(a.preco('corte'), 0); igual(a.preco('barba'), 30); });
teste('plano vencido: cobra tudo', () => { const a = app({}, { plano: 'livre', planoPagoEm: '2020-01-01', planoVenceEm: '2020-02-01' }); igual(a.coberto('corte'), false); igual(a.preco('corte'), 40); });
teste('limite do plano atingido: o corte passa a ser cobrado', () => {
  const a = app({}, comPlano('simples')); a.setPlanoUso({ atingido: true, usados: 2, qtd: 2, por: 'periodo' }); igual(a.coberto('corte'), false); igual(a.preco('corte'), 40);
});

// Contagem do uso do plano (era o bug do "2 cortes por mês")
const ag = (o) => Object.assign({ telefone: '85999990001', servico: 'Corte', data: dia(-2), status: 'concluido', preco: 0, obs: 'Plano Simples - sem cobrança' }, o);
teste('uso do plano: 2 cortes no período atingem o limite de 2', async () => {
  const a = app({}, comPlano('simples'), { agendamentos: [ag({ data: dia(-3) }), ag({ data: dia(-1), status: 'agendado' })] });
  const r = await a.usoPlano(HOJE); igual(r.usados, 2); igual(r.atingido, true);
});
teste('uso do plano: cancelado não conta', async () => {
  const a = app({}, comPlano('simples'), { agendamentos: [ag({ data: dia(-3) }), ag({ data: dia(-1), status: 'cancelado' })] });
  const r = await a.usoPlano(HOJE); igual(r.usados, 1); igual(r.atingido, false);
});
teste('uso do plano: serviço que o plano não cobre não conta', async () => {
  const a = app({}, comPlano('simples'), { agendamentos: [ag({ servico: 'Barba', preco: 30, obs: '' }), ag({ data: dia(-1) })] });
  igual((await a.usoPlano(HOJE)).usados, 1);
});
teste('uso do plano: atendimento já gravado como "Limite do plano atingido" não conta', async () => {
  const a = app({}, comPlano('simples'), { agendamentos: [ag({ data: dia(-3) }), ag({ data: dia(-1), preco: 40, obs: 'Limite do plano atingido - cobrar' })] });
  igual((await a.usoPlano(HOJE)).usados, 1);
});
teste('uso do plano: atendimento avulso (sem "Plano" na obs e com preço) também conta', async () => {
  const a = app({}, comPlano('simples'), { agendamentos: [ag({ preco: 40, obs: '', origem: 'avulso', data: dia(-3) }), ag({ data: dia(-1) })] });
  const r = await a.usoPlano(HOJE); igual(r.usados, 2); igual(r.atingido, true);
});
teste('uso do plano: se a consulta falha, bloqueia o benefício (nunca libera de graça)', async () => {
  const a = app({}, comPlano('simples'), { __erro: true });
  const r = await a.usoPlano(HOJE); igual(r.atingido, true); igual(r.erro, true);
});

// ═══════════════════════ SITE: DESCONTOS E CORTESIAS ═══════════════════════
const FID = { fidelAtivo: true, fidelDescPct: 20 };
teste('fidelidade disponível: 20% de desconto (arredonda em centavos)', () => {
  const a = app(FID, { fid: { disponiveis: 1 } }); igual(a.preco('corte'), 32); igual(a.preco('barba'), 24);
  a.init([{ id: 'x', name: 'X', price: 19.99, duracao: 30 }], PLANOS); igual(a.preco('x'), 15.99);
});
teste('fidelidade sem prêmio disponível: não dá desconto', () => { const a = app(FID, { fid: { disponiveis: 0 } }); igual(a.preco('corte'), 40); igual(a.desconto(), null); });
teste('benefício não se aplica em serviço coberto pelo plano (e não é gasto)', () => {
  const a = app(FID, comPlano('livre', { fid: { disponiveis: 1 } })); igual(a.preco('corte'), 0); igual(a.beneficio('corte'), null);
  igual(a.beneficio('sob').tipo, 'fidelidade'); igual(a.preco('sob'), 8);
});
teste('plano com limite estourado: o corte cobrado recebe o desconto', () => {
  const a = app(FID, comPlano('simples', { fid: { disponiveis: 1 } })); a.setPlanoUso({ atingido: true }); igual(a.preco('corte'), 32);
});
teste('desconto de 100% deixa o atendimento em R$ 0', () => { const a = app({ fidelAtivo: true, fidelDescPct: 100 }, { fid: { disponiveis: 1 } }); igual(a.preco('corte'), 0); });
const MES = new Date().getMonth() + 1, nasc = (m) => '1990-' + String(m).padStart(2, '0') + '-15';
teste('aniversário: vale só no mês e uma vez por ano', () => {
  const p = { aniversarioDescPct: 10 };
  igual(app(p, { nascimento: nasc(MES) }).aniv(), true);
  igual(app(p, { nascimento: nasc(MES === 12 ? 1 : MES + 1) }).aniv(), false);
  igual(app(p, { nascimento: nasc(MES), anivUsadoAno: new Date().getFullYear() }).aniv(), false);
  igual(app(p, { nascimento: nasc(MES) }).preco('corte'), 36);
});
teste('vale um benefício só: o de maior valor; empate fica com a fidelidade', () => {
  const u = { fid: { disponiveis: 1 }, nascimento: nasc(MES), retornoOk: true };
  igual(app({ fidelAtivo: true, fidelDescPct: 20, aniversarioDescPct: 10, retornoDescPct: 15 }, u).desconto().tipo, 'fidelidade');
  igual(app({ fidelAtivo: true, fidelDescPct: 20, aniversarioDescPct: 50, retornoDescPct: 15 }, u).desconto().tipo, 'aniversario');
  igual(app({ fidelAtivo: true, fidelDescPct: 20, aniversarioDescPct: 10, retornoDescPct: 30 }, u).desconto().tipo, 'retorno');
  igual(app({ fidelAtivo: true, fidelDescPct: 20, aniversarioDescPct: 20 }, u).desconto().tipo, 'fidelidade');
  igual(app({ fidelAtivo: true, fidelDescPct: 20, aniversarioDescPct: 10, retornoDescPct: 15 }, u).preco('corte'), 32);   // não soma
});
teste('retorno: 15% só com retornoOk ligado', () => {
  igual(app({ retornoDescPct: 15 }, { retornoOk: true }).preco('corte'), 34);
  igual(app({ retornoDescPct: 15 }, { retornoOk: false }).preco('corte'), 40);
  igual(app({ retornoDescPct: 0 }, { retornoOk: true }).preco('corte'), 40);
});
teste('cortesia extra: o serviço principal continua com o preço cheio', () => {
  const a = app({ retornoTipo: 'servico', retornoServicoId: 'sob' }, { retornoOk: true });
  igual(a.preco('corte'), 40); const b = a.beneficio('corte'); igual(b.modo, 'servico'); igual(b.servico.id, 'sob');
});
teste('cortesia: se o cliente escolhe o próprio serviço de cortesia, sai por R$ 0', () => {
  const a = app({ retornoTipo: 'servico', retornoServicoId: 'sob' }, { retornoOk: true }); igual(a.preco('sob'), 0); igual(a.beneficio('sob').modo, 'servico');
});
teste('cortesia não vale em serviço coberto pelo plano', () => {
  const a = app({ retornoTipo: 'servico', retornoServicoId: 'sob' }, comPlano('livre', { retornoOk: true })); igual(a.beneficio('corte'), null); igual(a.preco('corte'), 0);
});
teste('cortesia com serviço apagado da lista: o benefício fica desligado', () => {
  const a = app({ retornoTipo: 'servico', retornoServicoId: 'nao-existe' }, { retornoOk: true }); igual(a.desconto(), null); igual(a.preco('corte'), 40);
});
teste('cortesia vs desconto: ganha o de maior valor (R$ 10 de cortesia x 15% de R$ 40 = R$ 6)', () => {
  const a = app({ fidelAtivo: true, fidelTipo: 'servico', fidelServicoId: 'sob', retornoDescPct: 15 }, { fid: { disponiveis: 1 }, retornoOk: true }); a.selecionar('corte');
  igual(a.desconto().tipo, 'fidelidade'); igual(a.desconto().modo, 'servico');
});

// Fidelidade e retorno calculados a partir do histórico (banco simulado)
const hist = (o) => Object.assign({ telefone: '85999990001', servico: 'Corte', data: dia(-10), status: 'concluido', preco: 40 }, o);
teste('fidelidade: a cada 5 atendimentos pagos e concluídos libera 1 prêmio', async () => {
  const lista = [1, 2, 3, 4, 5, 6].map(i => hist({ data: dia(-20 - i) }));
  const a = app({ fidelAtivo: true, fidelCada: 5, fidelDescPct: 20 }, {}, { agendamentos: lista }); await a.refreshFid();
  const f = a.getUser().fid; igual(f.contados, 6); igual(f.disponiveis, 1); igual(f.noCiclo, 1);
});
teste('fidelidade: atendimento pelo plano (R$ 0) e cancelado não contam; prêmio já usado é descontado', async () => {
  const lista = [1, 2, 3, 4, 5].map(i => hist({ data: dia(-20 - i) })).concat([hist({ preco: 0 }), hist({ status: 'cancelado' }), hist({ fidelidade: true, preco: 32 })]);
  const a = app({ fidelAtivo: true, fidelCada: 5, fidelDescPct: 20 }, {}, { agendamentos: lista }); await a.refreshFid();
  const f = a.getUser().fid; igual(f.contados, 5); igual(f.usados, 1); igual(f.disponiveis, 0);
});
teste('retorno: libera depois de N dias sem vir e sem horário marcado', async () => {
  const a = app({ retornoDescPct: 15, retornoDias: 45 }, {}, { agendamentos: [hist({ data: dia(-60) })] }); await a.refreshFid(); igual(a.getUser().retornoOk, true);
});
teste('retorno: não libera se veio há menos de N dias', async () => {
  const a = app({ retornoDescPct: 15, retornoDias: 45 }, {}, { agendamentos: [hist({ data: dia(-30) })] }); await a.refreshFid(); igual(a.getUser().retornoOk, false);
});
teste('retorno: não libera se já tem horário marcado', async () => {
  const a = app({ retornoDescPct: 15, retornoDias: 45 }, {}, { agendamentos: [hist({ data: dia(-60) }), hist({ data: dia(3), status: 'agendado', preco: 40 })] }); await a.refreshFid(); igual(a.getUser().retornoOk, false);
});
teste('retorno: quem nunca veio não ganha', async () => {
  const a = app({ retornoDescPct: 15, retornoDias: 45 }, {}, { agendamentos: [] }); await a.refreshFid(); igual(a.getUser().retornoOk, false);
});

// ═══════════════════════ PAINEL: PLANO, RECEITA E RELATÓRIOS ═══════════════════════
const admin = (ags, clientes) => { const a = carregar('admin.js', {}, API_ADMIN); a.init(SERVICOS, PLANOS, ags || [], clientes || {}); return a; };
const TEL = '85999990001';
const cli = { [TEL]: { nome: 'Cliente Teste', telefone: TEL, plano: 'simples', planoPagoEm: '2026-09-01', planoVenceEm: '2026-10-01', planoPagamentos: [{ data: '2026-09-01', valor: 50, plano: 'simples' }] } };
const pa = (o) => Object.assign({ id: 'a' + Math.random(), telefone: TEL, servico: 'Corte', data: '2026-09-10', horario: '10:00', status: 'concluido', preco: 40, criadoEm: { seconds: 1 } }, o);
teste('painel: com limite 2, o 3º corte do período deixa de ser coberto pelo plano (ordem de criação)', () => {
  const a1 = pa({ id: '1', criadoEm: { seconds: 1 } }), a2 = pa({ id: '2', data: '2026-09-12', criadoEm: { seconds: 2 } }), a3 = pa({ id: '3', data: '2026-09-14', criadoEm: { seconds: 3 } });
  const a = admin([a1, a2, a3], cli); igual(a.coberto(a1), true); igual(a.coberto(a2), true); igual(a.coberto(a3), false);
});
teste('painel: serviço fora do plano e data fora do período não são cobertos', () => {
  const b = pa({ servico: 'Barba', preco: 30 }), f = pa({ data: '2026-10-20' }); const a = admin([b, f], cli); igual(a.coberto(b), false); igual(a.coberto(f), false);
});
teste('painel: gravado como "Limite do plano atingido" é cobrado; gravado como plano é coberto', () => {
  const l = pa({ obs: 'Limite do plano atingido - cobrar' }), p = pa({ preco: 0, obs: 'Plano Simples - sem cobrança', data: '2026-07-01' }); const a = admin([l, p], cli); igual(a.coberto(l), false); igual(a.coberto(p), true);
});
teste('painel: receita do atendimento (pago, coberto pelo plano, zerado)', () => {
  const pago = pa({ servico: 'Barba', preco: 30 }), plano = pa({ id: 'p1' }), zerado = pa({ servico: 'Barba', preco: 30, receitaZerada: true }); const a = admin([pago, plano, zerado], cli);
  igual(a.receita(pago), 30); igual(a.receita(plano), 0); igual(a.receita(zerado), 0);
});
// Relatório de setembro/2026
const SET = [
  pa({ id: 'r1' }),                                                                                                  // corte pelo plano -> R$ 0
  pa({ id: 'r2', servico: 'Barba', preco: 30, formaPagamento: 'Pix' }),                                              // pago R$ 30
  pa({ id: 'r3', servico: 'Barba', preco: 24, precoOriginal: 30, formaPagamento: 'Dinheiro', fidelidade: true }),     // pago R$ 24, desconto R$ 6
  pa({ id: 'r4', servico: 'Sobrancelha', preco: 0, precoOriginal: 10, cortesia: 'Sobrancelha', formaPagamento: 'Cortesia' }), // cortesia
  pa({ id: 'r5', servico: 'Barba', preco: 30, status: 'cancelado' }),
  pa({ id: 'r6', servico: 'Barba', preco: 30, status: 'agendado', data: '2026-09-28' }),
  pa({ id: 'r7', servico: 'Barba', preco: 50, receitaZerada: true, formaPagamento: 'Pix' }),                           // zerado no painel: continua no histórico
  pa({ id: 'r8', servico: 'Barba', preco: 99, receitaRemovida: true, receitaZerada: true }),                          // tirado da receita: sai
  pa({ id: 'r9', servico: 'Barba', preco: 30, data: '2026-08-15', formaPagamento: 'Pix' }),                           // agosto
];
const cliRel = { [TEL]: Object.assign({}, cli[TEL], { planoPagamentos: [
  { data: '2026-09-01', valor: 50, plano: 'simples' }, { data: '2026-09-15', valor: 50, plano: 'simples', zerado: true }, { data: '2026-09-20', valor: 70, plano: 'simples', zerado: true, removido: true }, { data: '2026-08-01', valor: 50, plano: 'simples' }] }) };
teste('relatório do mês: receita, atendimentos, plano, cancelados e agendados', () => {
  const r = admin(SET, cliRel).mes('2026-09');
  igual(r.concluidos, 6); igual(r.cancelados, 1); igual(r.abertos, 1);
  igual(r.receitaServicos, 30 + 24 + 50);                 // r2 + r3 + r7
  igual(r.receitaPlanos, 100); igual(r.mensalidades, 2);   // 09-01 e 09-15 (o removido fica de fora)
  igual(r.total, 204); igual(r.pagos, 3); igual(r.pelosPlano, 1);
  igual(Math.round(r.ticket * 100) / 100, Math.round(104 / 3 * 100) / 100);
});
teste('relatório do mês: descontos e cortesias (cortesia não conta como desconto)', () => {
  const r = admin(SET, cliRel).mes('2026-09'); igual(r.descontos, 6); igual(r.cortesias, 1);
});
teste('relatório por serviço: soma, ordem por receita e atendimentos do plano', () => {
  const s = admin(SET, cliRel).mes('2026-09').servicos;
  igual(s[0].nome, 'Barba'); igual(s[0].receita, 104); igual(s[0].pagos, 3);
  const corte = s.find(x => x.nome === 'Corte'); igual(corte.plano, 1); igual(corte.receita, 0);
});
teste('relatório por forma de pagamento: só o que foi pago', () => {
  const f = admin(SET, cliRel).mes('2026-09').pagamentos; const pix = f.find(x => x.forma === 'Pix'), din = f.find(x => x.forma === 'Dinheiro');
  igual(pix.valor, 80); igual(pix.qtd, 2); igual(din.valor, 24); igual(f.some(x => x.forma === 'Cortesia'), false);
});
teste('relatório: mês sem movimento volta zerado, sem quebrar', () => {
  const r = admin(SET, cliRel).mes('2025-01'); igual(r.total, 0); igual(r.concluidos, 0); igual(r.servicos.length, 0); igual(r.ticket, 0);
});
teste('relatório por mês: 12 meses seguidos terminando no mês pedido (virada de ano)', () => {
  const m = admin(SET, cliRel).meses('2026-02', 12); igual(m.length, 12); igual(m[0].mes, '2025-03'); igual(m[11].mes, '2026-02'); igual(m[9].mes, '2025-12'); igual(m[10].mes, '2026-01');
  igual(admin().somar('2026-01', -1), '2025-12'); igual(admin().somar('2026-12', 1), '2027-01');
  const ago = admin(SET, cliRel).meses('2026-09', 2)[0]; igual(ago.mes, '2026-08'); igual(ago.receitaServicos, 30); igual(ago.receitaPlanos, 50);
});
teste('cobrança do plano: cita nome, valor e, se houver Pix ativo, a chave', () => {
  const a = admin([], cli); const sem = a.cobranca('Maria Silva', 'simples', '2026-09-01');
  assert.ok(/Maria/.test(sem) && /Simples/.test(sem) && /50,00/.test(sem));
  a.formas([{ id: 'pix', nome: 'Pix', tipo: 'pix', ativo: true, pixChave: 'chave-teste@pix.com' }]);
  assert.ok(a.cobranca('Maria Silva', 'simples', '2026-09-01').includes('chave-teste@pix.com'));
});

executar();
