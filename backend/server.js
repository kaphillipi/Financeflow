require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

  const JWT_SECRET = process.env.JWT_SECRET;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'railway',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10
});

// =============================================
// MIDDLEWARE DE AUTENTICACAO
// =============================================
const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token nao fornecido' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.usuario.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito ao administrador' });
  next();
};

// =============================================
// AUTH
// =============================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const [rows] = await pool.query(`
      SELECT u.*, cs.nome as conta_nome, cs.slug as conta_slug
      FROM usuarios u
      JOIN contas_sistema cs ON u.conta_sistema_id = cs.id
      WHERE u.email = ? AND u.ativo = TRUE AND cs.ativo = TRUE
    `, [email]);

    if (!rows.length) return res.status(401).json({ error: 'Email ou senha invalidos' });
    const user = rows[0];
    const senhaOk = await bcrypt.compare(senha, user.senha);
    if (!senhaOk) return res.status(401).json({ error: 'Email ou senha invalidos' });

    const token = jwt.sign({
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      conta_sistema_id: user.conta_sistema_id,
      conta_nome: user.conta_nome
    }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, usuario: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, conta_nome: user.conta_nome } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// USUARIOS (admin only)
// =============================================
app.get('/api/usuarios', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, nome, email, perfil, ativo, created_at FROM usuarios
      WHERE conta_sistema_id = ? ORDER BY nome
    `, [req.usuario.conta_sistema_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', auth, adminOnly, async (req, res) => {
  try {
    const { nome, email, senha, perfil } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: 'Preencha todos os campos' });
    const hash = await bcrypt.hash(senha, 10);
    await pool.query(
      'INSERT INTO usuarios (conta_sistema_id, nome, email, senha, perfil) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.conta_sistema_id, nome, email, hash, perfil || 'usuario']
    );
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email ja cadastrado' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nome, perfil, ativo } = req.body;
    await pool.query(
      'UPDATE usuarios SET nome=?, perfil=?, ativo=? WHERE id=? AND conta_sistema_id=?',
      [nome, perfil, ativo, req.params.id, req.usuario.conta_sistema_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// DASHBOARD
// =============================================
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const cid = req.usuario.conta_sistema_id;

    const [receitas] = await pool.query(`
      SELECT COALESCE(SUM(valor), 0) as total FROM transacoes
      WHERE conta_sistema_id=? AND tipo='receita' AND MONTH(data_transacao)=MONTH(CURDATE())
      AND YEAR(data_transacao)=YEAR(CURDATE()) AND status='confirmado'
    `, [cid]);

    const [despesas] = await pool.query(`
      SELECT COALESCE(SUM(valor), 0) as total FROM transacoes
      WHERE conta_sistema_id=? AND tipo='despesa' AND MONTH(data_transacao)=MONTH(CURDATE())
      AND YEAR(data_transacao)=YEAR(CURDATE()) AND status='confirmado'
    `, [cid]);

    const [saldoTotal] = await pool.query(`
      SELECT COALESCE(SUM(saldo_atual), 0) as total FROM contas_bancarias WHERE conta_sistema_id=? AND ativa=TRUE
    `, [cid]);

    const [graficoMensal] = await pool.query(`
      SELECT DATE_FORMAT(data_transacao,'%m/%Y') as mes,
        SUM(CASE WHEN tipo='receita' THEN valor ELSE 0 END) as receitas,
        SUM(CASE WHEN tipo='despesa' THEN valor ELSE 0 END) as despesas
      FROM transacoes
      WHERE conta_sistema_id=? AND data_transacao >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) AND status='confirmado'
      GROUP BY DATE_FORMAT(data_transacao,'%m/%Y'), YEAR(data_transacao), MONTH(data_transacao)
      ORDER BY YEAR(data_transacao), MONTH(data_transacao)
    `, [cid]);

    const [graficoCategorias] = await pool.query(`
      SELECT c.nome, c.cor, COALESCE(SUM(t.valor),0) as total
      FROM categorias c
      LEFT JOIN transacoes t ON t.categoria_id=c.id AND t.tipo='despesa'
        AND MONTH(t.data_transacao)=MONTH(CURDATE()) AND YEAR(t.data_transacao)=YEAR(CURDATE())
        AND t.status='confirmado' AND t.conta_sistema_id=?
      WHERE c.conta_sistema_id=? AND c.tipo='despesa'
      GROUP BY c.id, c.nome, c.cor HAVING total > 0 ORDER BY total DESC LIMIT 6
    `, [cid, cid]);

    const [ultimasTransacoes] = await pool.query(`
      SELECT t.*, c.nome as categoria_nome, c.cor as categoria_cor,
        u.nome as usuario_nome
      FROM transacoes t
      LEFT JOIN categorias c ON t.categoria_id=c.id
      LEFT JOIN usuarios u ON t.usuario_id=u.id
      WHERE t.conta_sistema_id=?
      ORDER BY t.data_transacao DESC, t.created_at DESC LIMIT 10
    `, [cid]);

    const [contasAtrasadas] = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(valor),0) as valor_total
      FROM contas_pagar_receber
      WHERE conta_sistema_id=? AND status='pendente' AND data_vencimento < CURDATE() AND tipo='pagar'
    `, [cid]);

    const [contasAReceber] = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(valor),0) as valor_total
      FROM contas_pagar_receber
      WHERE conta_sistema_id=? AND status='pendente' AND data_vencimento < CURDATE() AND tipo='receber'
    `, [cid]);

    res.json({
      resumo: {
        receitas: receitas[0].total,
        despesas: despesas[0].total,
        saldo: receitas[0].total - despesas[0].total,
        saldoTotal: saldoTotal[0].total
      },
      graficoMensal,
      graficoCategorias,
      ultimasTransacoes,
      contasAtrasadas: contasAtrasadas[0],
      contasAReceber: contasAReceber[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// TRANSACOES
// =============================================
app.get('/api/transacoes', auth, async (req, res) => {
  try {
    const { mes, ano, tipo, categoria_id } = req.query;
    const cid = req.usuario.conta_sistema_id;
    let where = ['t.conta_sistema_id = ?'];
    let params = [cid];

    if (mes) { where.push('MONTH(t.data_transacao) = ?'); params.push(mes); }
    if (ano) { where.push('YEAR(t.data_transacao) = ?'); params.push(ano); }
    if (tipo) { where.push('t.tipo = ?'); params.push(tipo); }
    if (categoria_id) { where.push('t.categoria_id = ?'); params.push(categoria_id); }

    const [rows] = await pool.query(`
      SELECT t.*, c.nome as categoria_nome, c.cor as categoria_cor,
        cb.nome as conta_nome, ca.nome as cartao_nome,
        u.nome as usuario_nome
      FROM transacoes t
      LEFT JOIN categorias c ON t.categoria_id=c.id
      LEFT JOIN contas_bancarias cb ON t.conta_bancaria_id=cb.id
      LEFT JOIN cartoes ca ON t.cartao_id=ca.id
      LEFT JOIN usuarios u ON t.usuario_id=u.id
      WHERE ${where.join(' AND ')}
      ORDER BY t.data_transacao DESC, t.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transacoes', auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { descricao, valor, tipo, data_transacao, categoria_id, conta_bancaria_id, cartao_id, status, observacoes, total_parcelas } = req.body;
    const cid = req.usuario.conta_sistema_id;
    const uid = req.usuario.id;
    const parcelas = parseInt(total_parcelas) || 1;
    const valorParcela = parseFloat(valor) / parcelas;

    for (let i = 1; i <= parcelas; i++) {
      const dt = new Date(data_transacao);
      dt.setMonth(dt.getMonth() + (i - 1));
      await conn.query(`
        INSERT INTO transacoes (conta_sistema_id, usuario_id, descricao, valor, tipo, data_transacao, categoria_id, conta_bancaria_id, cartao_id, status, observacoes, total_parcelas, parcela_atual)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [cid, uid, parcelas > 1 ? `${descricao} (${i}/${parcelas})` : descricao, valorParcela, tipo, dt.toISOString().split('T')[0], categoria_id || null, conta_bancaria_id || null, cartao_id || null, status || 'confirmado', observacoes || null, parcelas, i]);
    }

    if (conta_bancaria_id && status !== 'pendente') {
      const sinal = tipo === 'receita' ? '+' : '-';
      await conn.query(`UPDATE contas_bancarias SET saldo_atual = saldo_atual ${sinal} ? WHERE id=? AND conta_sistema_id=?`, [valor, conta_bancaria_id, cid]);
    }

    await conn.commit();
    conn.release();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transacoes/:id', auth, async (req, res) => {
  try {
    const cid = req.usuario.conta_sistema_id;
    const uid = req.usuario.id;
    const perfil = req.usuario.perfil;
    let query = 'DELETE FROM transacoes WHERE id=? AND conta_sistema_id=?';
    let params = [req.params.id, cid];
    if (perfil !== 'admin') { query += ' AND usuario_id=?'; params.push(uid); }
    await pool.query(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// CATEGORIAS
// =============================================
app.get('/api/categorias', auth, async (req, res) => {
  try {
    const { tipo } = req.query;
    let query = 'SELECT * FROM categorias WHERE conta_sistema_id=?';
    let params = [req.usuario.conta_sistema_id];
    if (tipo) { query += ' AND tipo=?'; params.push(tipo); }
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// CONTAS BANCARIAS
// =============================================
app.get('/api/contas', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM contas_bancarias WHERE conta_sistema_id=? AND ativa=TRUE ORDER BY nome', [req.usuario.conta_sistema_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contas', auth, async (req, res) => {
  try {
    const { nome, tipo, saldo_inicial, cor } = req.body;
    const saldo = parseFloat(saldo_inicial) || 0;
    await pool.query(
      'INSERT INTO contas_bancarias (conta_sistema_id, nome, tipo, saldo_inicial, saldo_atual, cor) VALUES (?,?,?,?,?,?)',
      [req.usuario.conta_sistema_id, nome, tipo, saldo, saldo, cor || '#6366f1']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/contas/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE contas_bancarias SET ativa=FALSE WHERE id=? AND conta_sistema_id=?', [req.params.id, req.usuario.conta_sistema_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// CARTOES
// =============================================
app.get('/api/cartoes', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cartoes WHERE conta_sistema_id=? AND ativo=TRUE ORDER BY nome', [req.usuario.conta_sistema_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cartoes', auth, async (req, res) => {
  try {
    const { nome, bandeira, limite, dia_fechamento, dia_vencimento, cor } = req.body;
    await pool.query(
      'INSERT INTO cartoes (conta_sistema_id, nome, bandeira, limite, limite_disponivel, dia_fechamento, dia_vencimento, cor) VALUES (?,?,?,?,?,?,?,?)',
      [req.usuario.conta_sistema_id, nome, bandeira, limite, limite, dia_fechamento, dia_vencimento, cor || '#1e293b']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cartoes/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE cartoes SET ativo=FALSE WHERE id=? AND conta_sistema_id=?', [req.params.id, req.usuario.conta_sistema_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// METAS
// =============================================
app.get('/api/metas', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, u.nome as usuario_nome FROM metas m
      LEFT JOIN usuarios u ON m.usuario_id=u.id
      WHERE m.conta_sistema_id=? AND m.status != 'cancelada' ORDER BY m.data_limite ASC
    `, [req.usuario.conta_sistema_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/metas', auth, async (req, res) => {
  try {
    const { nome, descricao, valor_meta, valor_atual, data_inicio, data_limite, icone, cor } = req.body;
    await pool.query(
      'INSERT INTO metas (conta_sistema_id, usuario_id, nome, descricao, valor_meta, valor_atual, data_inicio, data_limite, icone, cor) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [req.usuario.conta_sistema_id, req.usuario.id, nome, descricao, valor_meta, valor_atual || 0, data_inicio, data_limite || null, icone || '-', cor || '#10b981']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/metas/:id/deposito', auth, async (req, res) => {
  try {
    const { valor } = req.body;
    await pool.query(`
      UPDATE metas SET valor_atual = LEAST(valor_atual + ?, valor_meta),
      status = CASE WHEN valor_atual + ? >= valor_meta THEN 'concluida' ELSE status END
      WHERE id=? AND conta_sistema_id=?
    `, [valor, valor, req.params.id, req.usuario.conta_sistema_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/metas/:id', auth, async (req, res) => {
  try {
    const cid = req.usuario.conta_sistema_id;
    const uid = req.usuario.id;
    const perfil = req.usuario.perfil;
    let query = "UPDATE metas SET status='cancelada' WHERE id=? AND conta_sistema_id=?";
    let params = [req.params.id, cid];
    if (perfil !== 'admin') { query += ' AND usuario_id=?'; params.push(uid); }
    await pool.query(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// CONTAS A PAGAR / RECEBER
// =============================================
app.get('/api/contas-pagar-receber', auth, async (req, res) => {
  try {
    const { tipo, status } = req.query;
    let where = ['cpr.conta_sistema_id = ?'];
    let params = [req.usuario.conta_sistema_id];
    if (tipo) { where.push('cpr.tipo = ?'); params.push(tipo); }
    if (status) { where.push('cpr.status = ?'); params.push(status); }

    const [rows] = await pool.query(`
      SELECT cpr.*, u.nome as usuario_nome
      FROM contas_pagar_receber cpr
      LEFT JOIN usuarios u ON cpr.usuario_id=u.id
      WHERE ${where.join(' AND ')} ORDER BY cpr.data_vencimento ASC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contas-pagar-receber', auth, async (req, res) => {
  try {
    const { descricao, valor, tipo, data_vencimento, observacoes } = req.body;
    await pool.query(
      'INSERT INTO contas_pagar_receber (conta_sistema_id, usuario_id, descricao, valor, tipo, data_vencimento, observacoes) VALUES (?,?,?,?,?,?,?)',
      [req.usuario.conta_sistema_id, req.usuario.id, descricao, valor, tipo, data_vencimento, observacoes || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/contas-pagar-receber/:id/pagar', auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { valor_pago, data_pagamento, conta_bancaria_id } = req.body;
    const cid = req.usuario.conta_sistema_id;
    const uid = req.usuario.id;
    const [rows] = await conn.query('SELECT * FROM contas_pagar_receber WHERE id=? AND conta_sistema_id=?', [req.params.id, cid]);
    if (!rows.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Registro nao encontrado' }); }

    const item = rows[0];
    const valorFinal = parseFloat(valor_pago) || parseFloat(item.valor);
    const dataFinal = data_pagamento || new Date().toISOString().split('T')[0];

    // Atualizar status da conta
    await conn.query("UPDATE contas_pagar_receber SET status='pago', data_pagamento=? WHERE id=? AND conta_sistema_id=?", [dataFinal, req.params.id, cid]);

    if (conta_bancaria_id) {
      // Movimentar saldo da conta bancaria
      const sinal = item.tipo === 'pagar' ? '-' : '+';
      await conn.query('UPDATE contas_bancarias SET saldo_atual = saldo_atual ' + sinal + ' ? WHERE id=? AND conta_sistema_id=?', [valorFinal, conta_bancaria_id, cid]);

      // Criar transacao correspondente para aparecer no dashboard
      const tipoTransacao = item.tipo === 'pagar' ? 'despesa' : 'receita';
      await conn.query(
        'INSERT INTO transacoes (conta_sistema_id, usuario_id, descricao, valor, tipo, data_transacao, conta_bancaria_id, categoria_id, status, observacoes) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [cid, uid, item.descricao, valorFinal, tipoTransacao, dataFinal, conta_bancaria_id, item.categoria_id || null, 'confirmado', 'Baixa automatica de conta a ' + item.tipo]
      );
    }

    await conn.commit();
    conn.release();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/contas-pagar-receber/:id', auth, async (req, res) => {
  try {
    const cid = req.usuario.conta_sistema_id;
    const uid = req.usuario.id;
    const perfil = req.usuario.perfil;
    let query = 'DELETE FROM contas_pagar_receber WHERE id=? AND conta_sistema_id=?';
    let params = [req.params.id, cid];
    if (perfil !== 'admin') { query += ' AND usuario_id=?'; params.push(uid); }
    await pool.query(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// RELATORIOS
// =============================================
app.get('/api/relatorios/mensal', auth, async (req, res) => {
  try {
    const { ano } = req.query;
    const anoRef = ano || new Date().getFullYear();
    const [dados] = await pool.query(`
      SELECT MONTH(data_transacao) as mes,
        SUM(CASE WHEN tipo='receita' THEN valor ELSE 0 END) as receitas,
        SUM(CASE WHEN tipo='despesa' THEN valor ELSE 0 END) as despesas
      FROM transacoes
      WHERE conta_sistema_id=? AND YEAR(data_transacao)=? AND status='confirmado'
      GROUP BY MONTH(data_transacao) ORDER BY MONTH(data_transacao)
    `, [req.usuario.conta_sistema_id, anoRef]);
    res.json(dados);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.use(express.static(path.join(__dirname, 'frontend')));


app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
