const API = '/api';
let TOKEN = localStorage.getItem('ff_token');
let USUARIO = JSON.parse(localStorage.getItem('ff_usuario') || 'null');

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN });

function toast(msg, tipo) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = tipo === 'erro' ? '#dc2626' : tipo === 'ok' ? '#059669' : '#0f172a';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function abrirModal(id) { document.getElementById(id).classList.add('open'); }
function fecharModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
});

async function fazerLogin() {
  const email = document.getElementById('loginEmail').value;
  const senha = document.getElementById('loginSenha').value;
  const erroEl = document.getElementById('loginErro');
  erroEl.textContent = '';
  if (!email || !senha) { erroEl.textContent = 'Preencha email e senha'; return; }
  try {
    const res = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    const data = await res.json();
    if (!res.ok) { erroEl.textContent = data.error || 'Erro ao fazer login'; return; }
    TOKEN = data.token; USUARIO = data.usuario;
    localStorage.setItem('ff_token', TOKEN);
    localStorage.setItem('ff_usuario', JSON.stringify(USUARIO));
    iniciarApp();
  } catch { erroEl.textContent = 'Erro de conexao. Tente novamente.'; }
}

document.getElementById('loginSenha').addEventListener('keydown', function(e) { if (e.key === 'Enter') fazerLogin(); });

function fazerLogout() {
  localStorage.removeItem('ff_token'); localStorage.removeItem('ff_usuario');
  TOKEN = null; USUARIO = null;
  document.getElementById('telaLogin').style.display = 'flex';
  document.getElementById('appPrincipal').style.display = 'none';
}

function iniciarApp() {
  document.getElementById('telaLogin').style.display = 'none';
  document.getElementById('appPrincipal').style.display = 'flex';
  document.getElementById('userInfo').innerHTML = '<div class="user-nome">' + USUARIO.nome + '</div><div class="user-conta">' + USUARIO.conta_nome + '</div><span class="user-perfil perfil-' + USUARIO.perfil + '">' + USUARIO.perfil + '</span>';
  document.getElementById('contaBadge').textContent = USUARIO.conta_nome;
  if (USUARIO.perfil === 'admin') document.getElementById('menuUsuarios').style.display = 'flex';
  init();
}

function navigate(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (el) el.classList.add('active');
  const titulos = { dashboard: 'Dashboard', transacoes: 'Transacoes', cartoes: 'Cartoes', contas: 'Contas Bancarias', metas: 'Metas', 'pagar-receber': 'A Pagar / Receber', relatorios: 'Relatorios', usuarios: 'Usuarios' };
  document.getElementById('pageTitle').textContent = titulos[page] || 'Dashboard';
  const semBtn = { cartoes: true, contas: true, metas: true, usuarios: true };
  document.getElementById('btnNovaTransacao').style.display = semBtn[page] ? 'none' : '';
  const loaders = { transacoes: carregarTransacoes, cartoes: carregarCartoes, contas: carregarContas, metas: carregarMetas, 'pagar-receber': carregarContasPR, relatorios: carregarRelatorios, usuarios: carregarUsuarios };
  if (loaders[page]) loaders[page]();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }

let chartMensal, chartCategorias;

async function carregarDashboard() {
  try {
    const res = await fetch(API + '/dashboard', { headers: headers() });
    if (res.status === 401) { fazerLogout(); return; }
    const data = await res.json();
    document.getElementById('resumoReceitas').textContent = fmt(data.resumo.receitas);
    document.getElementById('resumoDespesas').textContent = fmt(data.resumo.despesas);
    document.getElementById('resumoTotal').textContent = fmt(data.resumo.saldoTotal);
    const saldoEl = document.getElementById('resumoSaldo');
    saldoEl.textContent = fmt(data.resumo.saldo);
    saldoEl.style.color = data.resumo.saldo >= 0 ? 'var(--receita)' : 'var(--despesa)';
    renderAlertasAtraso(data.contasAtrasadas, data.contasAReceber);
    renderChartMensal(data.graficoMensal);
    renderChartCategorias(data.graficoCategorias);
    renderUltimasTransacoes(data.ultimasTransacoes);
  } catch (e) { console.error(e); }
}

function renderAlertasAtraso(atrasadas, aReceber) {
  const el = document.getElementById('alertasAtraso');
  if (!el) return;
  let html = '';
  if (atrasadas && parseInt(atrasadas.total) > 0) {
    html += '<div class="alerta-atraso alerta-pagar" onclick="navigate(\'pagar-receber\', document.querySelector(\'[onclick*=pagar-receber]\'))"><span class="alerta-icone">!</span><div class="alerta-info"><span class="alerta-titulo">' + atrasadas.total + ' conta(s) a pagar em atraso</span><span class="alerta-valor">Total: ' + fmt(atrasadas.valor_total) + '</span></div></div>';
  }
  if (aReceber && parseInt(aReceber.total) > 0) {
    html += '<div class="alerta-atraso alerta-receber" onclick="navigate(\'pagar-receber\', document.querySelector(\'[onclick*=pagar-receber]\'))"><span class="alerta-icone">!</span><div class="alerta-info"><span class="alerta-titulo">' + aReceber.total + ' valor(es) a receber em atraso</span><span class="alerta-valor">Total: ' + fmt(aReceber.valor_total) + '</span></div></div>';
  }
  el.innerHTML = html;
  el.style.display = html ? 'flex' : 'none';
}

function renderChartMensal(dados) {
  const ctx = document.getElementById('chartMensal').getContext('2d');
  if (chartMensal) chartMensal.destroy();
  chartMensal = new Chart(ctx, { type: 'bar', data: { labels: dados.map(d => d.mes), datasets: [{ label: 'Receitas', data: dados.map(d => d.receitas), backgroundColor: '#d1fae5', borderColor: '#059669', borderWidth: 2, borderRadius: 6 }, { label: 'Despesas', data: dados.map(d => d.despesas), backgroundColor: '#fee2e2', borderColor: '#dc2626', borderWidth: 2, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } }, scales: { y: { grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } } });
}

function renderChartCategorias(dados) {
  const ctx = document.getElementById('chartCategorias').getContext('2d');
  if (chartCategorias) chartCategorias.destroy();
  if (!dados.length) return;
  chartCategorias = new Chart(ctx, { type: 'doughnut', data: { labels: dados.map(d => d.nome), datasets: [{ data: dados.map(d => d.total), backgroundColor: dados.map(d => d.cor || '#6366f1'), borderWidth: 0, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } }, cutout: '65%' } });
}

function renderUltimasTransacoes(transacoes) {
  const el = document.getElementById('listaUltimasTransacoes');
  if (!transacoes.length) { el.innerHTML = '<div class="empty-state">Nenhuma transacao ainda</div>'; return; }
  el.innerHTML = transacoes.map(t => renderTransacaoItem(t)).join('');
}

function renderTransacaoItem(t) {
  const bg = t.categoria_cor ? t.categoria_cor + '22' : '#f1f5f9';
  const podeDeletar = USUARIO.perfil === 'admin' || t.usuario_id === USUARIO.id;
  return '<div class="transaction-item"><div class="transaction-cat-icon" style="background:' + bg + '">$</div><div class="transaction-info"><div class="transaction-desc">' + t.descricao + '</div><div class="transaction-meta">' + (t.categoria_nome || '-') + ' - ' + fmtDate(t.data_transacao) + '</div><div class="transaction-usuario">por ' + (t.usuario_nome || '-') + '</div></div><span class="transaction-value ' + t.tipo + '">' + (t.tipo === 'receita' ? '+' : '-') + fmt(t.valor) + '</span>' + (podeDeletar ? '<button class="transaction-delete" onclick="deletarTransacao(' + t.id + ', this)">x</button>' : '') + '</div>';
}

async function carregarTransacoes() {
  try {
    const mes = document.getElementById('filtroMes').value || '';
    const tipo = document.getElementById('filtroTipo').value || '';
    const cat = document.getElementById('filtroCategoria').value || '';
    const ano = new Date().getFullYear();
    let url = API + '/transacoes?ano=' + ano;
    if (mes) url += '&mes=' + mes;
    if (tipo) url += '&tipo=' + tipo;
    if (cat) url += '&categoria_id=' + cat;
    const res = await fetch(url, { headers: headers() });
    const data = await res.json();
    const el = document.getElementById('listaTransacoes');
    if (!data.length) { el.innerHTML = '<div class="empty-state">Nenhuma transacao encontrada</div>'; return; }
    el.innerHTML = data.map(t => renderTransacaoItem(t)).join('');
  } catch (e) { console.error(e); }
}

async function deletarTransacao(id, btn) {
  if (!confirm('Excluir esta transacao?')) return;
  const res = await fetch(API + '/transacoes/' + id, { method: 'DELETE', headers: headers() });
  if (res.ok) { btn.closest('.transaction-item').remove(); toast('Transacao excluida', 'ok'); }
  else { const d = await res.json(); toast(d.error, 'erro'); }
}

function setTipoTransacao(tipo) {
  document.getElementById('tipoTransacao').value = tipo;
  document.getElementById('btnReceita').classList.toggle('active', tipo === 'receita');
  document.getElementById('btnDespesa').classList.toggle('active', tipo === 'despesa');
  carregarCategoriasPorTipo(tipo);
}

async function carregarCategoriasPorTipo(tipo) {
  const res = await fetch(API + '/categorias?tipo=' + tipo, { headers: headers() });
  const cats = await res.json();
  const sel = document.getElementById('categoriaTransacao');
  sel.innerHTML = '<option value="">Sem categoria</option>' + cats.map(c => '<option value="' + c.id + '">' + c.nome + '</option>').join('');
}

async function salvarTransacao() {
  const body = { descricao: document.getElementById('descricaoTransacao').value, valor: document.getElementById('valorTransacao').value, tipo: document.getElementById('tipoTransacao').value, data_transacao: document.getElementById('dataTransacao').value, categoria_id: document.getElementById('categoriaTransacao').value, conta_bancaria_id: document.getElementById('contaTransacao').value, cartao_id: document.getElementById('cartaoTransacao').value, observacoes: document.getElementById('obsTransacao').value, total_parcelas: document.getElementById('parcelasTransacao').value };
  if (!body.descricao || !body.valor || !body.data_transacao) { toast('Preencha os campos obrigatorios', 'erro'); return; }
  const res = await fetch(API + '/transacoes', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const data = await res.json();
  if (data.success) { fecharModal('modalTransacao'); toast('Transacao salva!', 'ok'); carregarDashboard(); }
  else toast('Erro: ' + data.error, 'erro');
}

async function carregarCartoes() {
  const res = await fetch(API + '/cartoes', { headers: headers() });
  const cartoes = await res.json();
  const el = document.getElementById('listaCartoes');
  if (!cartoes.length) { el.innerHTML = '<div class="empty-state">Nenhum cartao cadastrado</div>'; return; }
  el.innerHTML = cartoes.map(c => { const usado = c.limite - c.limite_disponivel; const pct = Math.min((usado / c.limite) * 100, 100).toFixed(0); return '<div class="credit-card" style="background:' + (c.cor || '#1e293b') + '">' + (USUARIO.perfil === 'admin' ? '<button class="delete-btn-float" onclick="deletarCartao(' + c.id + ')">x Remover</button>' : '') + '<div><div class="credit-card-name">' + c.nome + '</div><div class="credit-card-bandeira">' + (c.bandeira || '') + '</div></div><div><div class="credit-card-progress"><div class="credit-card-progress-bar" style="width:' + pct + '%"></div></div><div class="credit-card-info" style="margin-top:8px"><div><div class="credit-card-label">Disponivel</div><div class="credit-card-value">' + fmt(c.limite_disponivel) + '</div><div class="credit-card-limit">de ' + fmt(c.limite) + '</div></div><div style="text-align:right"><div class="credit-card-label">Fecha dia</div><div class="credit-card-value">' + c.dia_fechamento + '</div><div class="credit-card-limit">Vence dia ' + c.dia_vencimento + '</div></div></div></div></div>'; }).join('');
}

async function salvarCartao() {
  const body = { nome: document.getElementById('nomeCartao').value, bandeira: document.getElementById('bandeiraCartao').value, limite: document.getElementById('limiteCartao').value, dia_fechamento: document.getElementById('fechamentoCartao').value, dia_vencimento: document.getElementById('vencimentoCartao').value, cor: document.getElementById('corCartao').value };
  if (!body.nome || !body.limite || !body.dia_fechamento || !body.dia_vencimento) { toast('Preencha os campos obrigatorios', 'erro'); return; }
  const res = await fetch(API + '/cartoes', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const data = await res.json();
  if (data.success) { fecharModal('modalCartao'); toast('Cartao cadastrado!', 'ok'); carregarCartoes(); }
  else toast('Erro: ' + data.error, 'erro');
}

async function deletarCartao(id) {
  if (!confirm('Remover este cartao?')) return;
  await fetch(API + '/cartoes/' + id, { method: 'DELETE', headers: headers() });
  toast('Cartao removido', 'ok'); carregarCartoes();
}

async function carregarContas() {
  const res = await fetch(API + '/contas', { headers: headers() });
  const contas = await res.json();
  const el = document.getElementById('listaContas');
  if (!contas.length) { el.innerHTML = '<div class="empty-state">Nenhuma conta cadastrada</div>'; return; }
  const tipos = { corrente: 'Conta Corrente', poupanca: 'Poupanca', carteira: 'Carteira', investimento: 'Investimento' };
  el.innerHTML = contas.map(c => '<div class="account-card"><div class="account-color-bar" style="background:' + c.cor + '"></div><div class="account-name">' + c.nome + '</div><div class="account-type">' + (tipos[c.tipo] || c.tipo) + '</div><div class="account-balance ' + (c.saldo_atual >= 0 ? 'positive' : 'negative') + '">' + fmt(c.saldo_atual) + '</div>' + (USUARIO.perfil === 'admin' ? '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" onclick="deletarConta(' + c.id + ')">Remover</button></div>' : '') + '</div>').join('');
}

async function salvarConta() {
  const body = { nome: document.getElementById('nomeConta').value, tipo: document.getElementById('tipoConta').value, saldo_inicial: document.getElementById('saldoConta').value, cor: document.getElementById('corConta').value };
  if (!body.nome) { toast('Informe o nome da conta', 'erro'); return; }
  const res = await fetch(API + '/contas', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const data = await res.json();
  if (data.success) { fecharModal('modalConta'); toast('Conta cadastrada!', 'ok'); carregarContas(); }
  else toast('Erro: ' + data.error, 'erro');
}

async function deletarConta(id) {
  if (!confirm('Remover esta conta?')) return;
  await fetch(API + '/contas/' + id, { method: 'DELETE', headers: headers() });
  toast('Conta removida', 'ok'); carregarContas();
}

async function carregarMetas() {
  const res = await fetch(API + '/metas', { headers: headers() });
  const metas = await res.json();
  const el = document.getElementById('listaMetas');
  if (!metas.length) { el.innerHTML = '<div class="empty-state">Nenhuma meta cadastrada</div>'; return; }
  el.innerHTML = metas.map(m => { const pct = Math.min((m.valor_atual / m.valor_meta) * 100, 100).toFixed(1); const podeDeletar = USUARIO.perfil === 'admin' || m.usuario_id === USUARIO.id; return '<div class="goal-card"><div class="goal-header"><div><div class="goal-name">' + m.nome + '</div><div class="goal-desc">' + (m.descricao || '') + '</div></div><span class="goal-badge badge-' + m.status + '">' + m.status + '</span></div><div class="goal-current" style="color:' + m.cor + '">' + fmt(m.valor_atual) + '</div><div class="goal-target">de ' + fmt(m.valor_meta) + '</div><div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + pct + '%;background:' + m.cor + '"></div></div><div class="goal-values"><span>' + pct + '% concluido</span><span>Faltam ' + fmt(m.valor_meta - m.valor_atual) + '</span></div><div class="goal-usuario">Criado por ' + (m.usuario_nome || '-') + '</div><div class="goal-actions">' + (m.status === 'ativa' ? '<button class="btn btn-success btn-sm" onclick="abrirDeposito(' + m.id + ', \'' + m.nome + '\')">+ Depositar</button>' : '') + (podeDeletar ? '<button class="btn btn-ghost btn-sm" onclick="deletarMeta(' + m.id + ')">Cancelar</button>' : '') + '</div></div>'; }).join('');
}

async function salvarMeta() {
  const body = { nome: document.getElementById('nomeMeta').value, descricao: document.getElementById('descMeta').value, valor_meta: document.getElementById('valorMeta').value, valor_atual: document.getElementById('valorAtualMeta').value, data_inicio: document.getElementById('dataInicioMeta').value, data_limite: document.getElementById('dataPrazoMeta').value, cor: document.getElementById('corMeta').value };
  if (!body.nome || !body.valor_meta || !body.data_inicio) { toast('Preencha os campos obrigatorios', 'erro'); return; }
  const res = await fetch(API + '/metas', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const data = await res.json();
  if (data.success) { fecharModal('modalMeta'); toast('Meta criada!', 'ok'); carregarMetas(); }
  else toast('Erro: ' + data.error, 'erro');
}

function abrirDeposito(id, nome) {
  document.getElementById('idMetaDeposito').value = id;
  document.getElementById('nomeMetaDeposito').textContent = 'Meta: ' + nome;
  document.getElementById('valorDeposito').value = '';
  abrirModal('modalDeposito');
}

async function fazerDeposito() {
  const id = document.getElementById('idMetaDeposito').value;
  const valor = document.getElementById('valorDeposito').value;
  if (!valor || valor <= 0) { toast('Informe um valor valido', 'erro'); return; }
  const res = await fetch(API + '/metas/' + id + '/deposito', { method: 'PUT', headers: headers(), body: JSON.stringify({ valor }) });
  const data = await res.json();
  if (data.success) { fecharModal('modalDeposito'); toast('Deposito realizado!', 'ok'); carregarMetas(); }
  else toast('Erro: ' + data.error, 'erro');
}

async function deletarMeta(id) {
  if (!confirm('Cancelar esta meta?')) return;
  await fetch(API + '/metas/' + id, { method: 'DELETE', headers: headers() });
  toast('Meta cancelada', 'ok'); carregarMetas();
}

let filtroTipoPR = '';

function setTipoPR(tipo) {
  document.getElementById('tipoPR').value = tipo;
  document.getElementById('btnPagar').classList.toggle('active', tipo === 'pagar');
  document.getElementById('btnReceber').classList.toggle('active', tipo === 'receber');
}

function filtrarContasPR(tipo, btn) {
  filtroTipoPR = tipo;
  document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  carregarContasPR();
}

async function carregarContasPR() {
  let url = API + '/contas-pagar-receber';
  if (filtroTipoPR) url += '?tipo=' + filtroTipoPR;
  const res = await fetch(url, { headers: headers() });
  const lista = await res.json();
  const el = document.getElementById('listaContasPR');
  if (!lista.length) { el.innerHTML = '<div class="empty-state">Nada aqui ainda</div>'; return; }
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  el.innerHTML = lista.map(item => {
    const venc = new Date(item.data_vencimento + 'T00:00:00');
    const vencido = venc < hoje && item.status === 'pendente';
    const statusLabel = vencido ? 'vencido' : item.status;
    const podeDeletar = USUARIO.perfil === 'admin' || item.usuario_id === USUARIO.id;
    const btnLabel = item.tipo === 'pagar' ? 'Pago' : 'Recebido';
    return '<div class="pr-item"><span class="pr-type-badge pr-' + item.tipo + '">' + (item.tipo === 'pagar' ? 'Pagar' : 'Receber') + '</span><div class="pr-info"><div class="pr-desc">' + item.descricao + '</div><div class="pr-venc">Vence em ' + fmtDate(item.data_vencimento) + '</div><div class="pr-usuario">por ' + (item.usuario_nome || '-') + '</div></div><span class="pr-value" style="color:' + (item.tipo === 'pagar' ? 'var(--despesa)' : 'var(--receita)') + '">' + fmt(item.valor) + '</span><span class="pr-status status-' + statusLabel + '">' + statusLabel + '</span>' + (item.status === 'pendente' ? '<button class="btn btn-success btn-sm" onclick="abrirModalBaixa(' + item.id + ', \'' + item.tipo + '\', ' + item.valor + ')">' + btnLabel + '</button>' : '') + (podeDeletar ? '<button class="transaction-delete" style="opacity:1" onclick="deletarContaPR(' + item.id + ')">x</button>' : '') + '</div>';
  }).join('');
}

async function salvarContaPR() {
  const descricao = document.getElementById('descPR').value;
  const valor = document.getElementById('valorPR').value;
  const tipo = document.getElementById('tipoPR').value;
  const dataBase = document.getElementById('vencimentoPR').value;
  const observacoes = document.getElementById('obsPR').value;
  const parcelas = parseInt(document.getElementById('parcelasPR').value) || 1;
  const intervaloDias = parseInt(document.getElementById('intervaloPR').value) || 30;
  if (!descricao || !valor || !dataBase) { toast('Preencha os campos obrigatorios', 'erro'); return; }
  let erros = 0;
  for (let i = 1; i <= parcelas; i++) {
    const dataVenc = new Date(dataBase + 'T00:00:00');
    dataVenc.setDate(dataVenc.getDate() + (intervaloDias * (i - 1)));
    const dataStr = dataVenc.toISOString().split('T')[0];
    const descParcela = parcelas > 1 ? descricao + ' (' + i + '/' + parcelas + ')' : descricao;
    const body = { descricao: descParcela, valor, tipo, data_vencimento: dataStr, observacoes };
    const res = await fetch(API + '/contas-pagar-receber', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.success) erros++;
  }
  fecharModal('modalContaPR');
  if (erros === 0) toast(parcelas + ' parcela(s) criada(s)!', 'ok');
  else toast('Erro em ' + erros + ' parcela(s)', 'erro');
  carregarContasPR();
}

async function abrirModalBaixa(id, tipo, valor) {
  document.getElementById('idBaixa').value = id;
  document.getElementById('tipoBaixa').value = tipo;
  document.getElementById('valorBaixa').value = valor;
  document.getElementById('dataBaixa').value = new Date().toISOString().split('T')[0];
  document.getElementById('tituloBaixa').textContent = tipo === 'pagar' ? 'Confirmar Pagamento' : 'Confirmar Recebimento';
  document.getElementById('labelContaBaixa').textContent = tipo === 'pagar' ? 'Conta debitada' : 'Conta creditada';
  const res = await fetch(API + '/contas', { headers: headers() });
  const contas = await res.json();
  const sel = document.getElementById('contaBaixa');
  sel.innerHTML = '<option value="">Selecione a conta</option>' + contas.map(c => '<option value="' + c.id + '">' + c.nome + '</option>').join('');
  abrirModal('modalBaixa');
}

async function confirmarBaixa() {
  const id = document.getElementById('idBaixa').value;
  const tipo = document.getElementById('tipoBaixa').value;
  const valorPago = document.getElementById('valorBaixa').value;
  const dataPagamento = document.getElementById('dataBaixa').value;
  const contaId = document.getElementById('contaBaixa').value;
  if (!dataPagamento || !valorPago) { toast('Preencha todos os campos', 'erro'); return; }
  const res = await fetch(API + '/contas-pagar-receber/' + id + '/pagar', { method: 'PUT', headers: headers(), body: JSON.stringify({ valor_pago: valorPago, data_pagamento: dataPagamento, conta_bancaria_id: contaId || null }) });
  const data = await res.json();
  if (data.success) { fecharModal('modalBaixa'); toast(tipo === 'pagar' ? 'Pagamento confirmado!' : 'Recebimento confirmado!', 'ok'); carregarContasPR(); carregarDashboard(); }
  else toast('Erro: ' + data.error, 'erro');
}

async function deletarContaPR(id) {
  if (!confirm('Excluir este registro?')) return;
  await fetch(API + '/contas-pagar-receber/' + id, { method: 'DELETE', headers: headers() });
  toast('Excluido', 'ok'); carregarContasPR();
}

let chartRelatorio;

async function carregarRelatorios() {
  const ano = document.getElementById('filtroAnoRelatorio').value || new Date().getFullYear();
  const res = await fetch(API + '/relatorios/mensal?ano=' + ano, { headers: headers() });
  const dados = await res.json();
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const receitas = Array(12).fill(0); const despesas = Array(12).fill(0);
  dados.forEach(d => { receitas[d.mes - 1] = parseFloat(d.receitas); despesas[d.mes - 1] = parseFloat(d.despesas); });
  const ctx = document.getElementById('chartRelatorioAnual').getContext('2d');
  if (chartRelatorio) chartRelatorio.destroy();
  chartRelatorio = new Chart(ctx, { type: 'line', data: { labels: meses, datasets: [{ label: 'Receitas', data: receitas, borderColor: '#059669', backgroundColor: '#d1fae540', fill: true, tension: 0.4, pointRadius: 5 }, { label: 'Despesas', data: despesas, borderColor: '#dc2626', backgroundColor: '#fee2e240', fill: true, tension: 0.4, pointRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } } });
  document.getElementById('chartRelatorioAnual').style.maxHeight = '400px';
}

async function carregarUsuarios() {
  if (USUARIO.perfil !== 'admin') return;
  const res = await fetch(API + '/usuarios', { headers: headers() });
  const usuarios = await res.json();
  const el = document.getElementById('listaUsuarios');
  if (!usuarios.length) { el.innerHTML = '<div class="empty-state">Nenhum usuario cadastrado</div>'; return; }
  el.innerHTML = usuarios.map(u => '<div class="usuario-item"><div class="usuario-avatar">' + u.nome.charAt(0).toUpperCase() + '</div><div class="usuario-info"><div class="usuario-nome">' + u.nome + '</div><div class="usuario-email">' + u.email + '</div></div><span class="user-perfil perfil-' + u.perfil + '">' + u.perfil + '</span><span class="pr-status ' + (u.ativo ? 'status-pago' : 'status-vencido') + '">' + (u.ativo ? 'ativo' : 'inativo') + '</span></div>').join('');
}

async function salvarNovoUsuario() {
  const body = { nome: document.getElementById('nomeNovoUsuario').value, email: document.getElementById('emailNovoUsuario').value, senha: document.getElementById('senhaNovoUsuario').value, perfil: document.getElementById('perfilNovoUsuario').value };
  if (!body.nome || !body.email || !body.senha) { toast('Preencha todos os campos', 'erro'); return; }
  const res = await fetch(API + '/usuarios', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const data = await res.json();
  if (data.success) { fecharModal('modalNovoUsuario'); toast('Usuario criado!', 'ok'); carregarUsuarios(); }
  else toast('Erro: ' + data.error, 'erro');
}

async function init() {
  const d = new Date();
  const meses = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const selMes = document.getElementById('filtroMes');
  if (selMes) { selMes.innerHTML = '<option value="">Todos os meses</option>'; meses.forEach((m, i) => selMes.add(new Option(m, i + 1))); }
  const anoAtual = d.getFullYear();
  const selAno = document.getElementById('filtroAnoRelatorio');
  for (let a = anoAtual; a >= anoAtual - 3; a--) selAno.add(new Option(a, a));
  setTipoTransacao('receita');
  document.getElementById('dataTransacao').value = d.toISOString().split('T')[0];
  document.getElementById('dataInicioMeta').value = d.toISOString().split('T')[0];
  const [contas, cartoes, cats] = await Promise.all([
    fetch(API + '/contas', { headers: headers() }).then(r => r.json()).catch(() => []),
    fetch(API + '/cartoes', { headers: headers() }).then(r => r.json()).catch(() => []),
    fetch(API + '/categorias', { headers: headers() }).then(r => r.json()).catch(() => [])
  ]);
  const selConta = document.getElementById('contaTransacao');
  contas.forEach(c => selConta.add(new Option(c.nome, c.id)));
  const selCartao = document.getElementById('cartaoTransacao');
  cartoes.forEach(c => selCartao.add(new Option(c.nome, c.id)));
  const selCat = document.getElementById('filtroCategoria');
  cats.forEach(c => selCat.add(new Option(c.nome, c.id)));
  await carregarDashboard();
}

if (TOKEN && USUARIO) { iniciarApp(); }
else { document.getElementById('telaLogin').style.display = 'flex'; document.getElementById('appPrincipal').style.display = 'none'; }
