-- =============================================
-- SCHEMA V2: Multi-tenant com usuarios
-- =============================================

USE railway;

-- Contas do sistema (ex: Phillipi, Cliente X)
CREATE TABLE IF NOT EXISTS contas_sistema (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usuarios vinculados a uma conta do sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_sistema_id INT NOT NULL,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  perfil ENUM('admin', 'usuario') DEFAULT 'usuario',
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conta_sistema_id) REFERENCES contas_sistema(id) ON DELETE CASCADE
);

-- Categorias por conta do sistema
CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_sistema_id INT NOT NULL,
  nome VARCHAR(100) NOT NULL,
  tipo ENUM('receita', 'despesa') NOT NULL,
  icone VARCHAR(10) DEFAULT '-',
  cor VARCHAR(7) DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conta_sistema_id) REFERENCES contas_sistema(id) ON DELETE CASCADE
);

-- Contas bancarias por conta do sistema
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_sistema_id INT NOT NULL,
  nome VARCHAR(100) NOT NULL,
  tipo ENUM('corrente', 'poupanca', 'carteira', 'investimento') NOT NULL,
  saldo_inicial DECIMAL(15,2) DEFAULT 0.00,
  saldo_atual DECIMAL(15,2) DEFAULT 0.00,
  cor VARCHAR(7) DEFAULT '#6366f1',
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conta_sistema_id) REFERENCES contas_sistema(id) ON DELETE CASCADE
);

-- Cartoes por conta do sistema
CREATE TABLE IF NOT EXISTS cartoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_sistema_id INT NOT NULL,
  nome VARCHAR(100) NOT NULL,
  bandeira VARCHAR(50),
  limite DECIMAL(15,2) NOT NULL,
  limite_disponivel DECIMAL(15,2) NOT NULL,
  dia_fechamento INT NOT NULL,
  dia_vencimento INT NOT NULL,
  cor VARCHAR(7) DEFAULT '#1e293b',
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conta_sistema_id) REFERENCES contas_sistema(id) ON DELETE CASCADE
);

-- Transacoes com usuario que criou
CREATE TABLE IF NOT EXISTS transacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_sistema_id INT NOT NULL,
  usuario_id INT NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(15,2) NOT NULL,
  tipo ENUM('receita', 'despesa') NOT NULL,
  data_transacao DATE NOT NULL,
  categoria_id INT,
  conta_bancaria_id INT,
  cartao_id INT,
  status ENUM('confirmado', 'pendente', 'cancelado') DEFAULT 'confirmado',
  observacoes TEXT,
  parcela_atual INT DEFAULT 1,
  total_parcelas INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conta_sistema_id) REFERENCES contas_sistema(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  FOREIGN KEY (cartao_id) REFERENCES cartoes(id) ON DELETE SET NULL
);

-- Metas por conta do sistema
CREATE TABLE IF NOT EXISTS metas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_sistema_id INT NOT NULL,
  usuario_id INT NOT NULL,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  valor_meta DECIMAL(15,2) NOT NULL,
  valor_atual DECIMAL(15,2) DEFAULT 0.00,
  data_inicio DATE NOT NULL,
  data_limite DATE,
  icone VARCHAR(10) DEFAULT '-',
  cor VARCHAR(7) DEFAULT '#10b981',
  status ENUM('ativa', 'concluida', 'cancelada') DEFAULT 'ativa',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conta_sistema_id) REFERENCES contas_sistema(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Contas a pagar/receber
CREATE TABLE IF NOT EXISTS contas_pagar_receber (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_sistema_id INT NOT NULL,
  usuario_id INT NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(15,2) NOT NULL,
  tipo ENUM('pagar', 'receber') NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  categoria_id INT,
  conta_bancaria_id INT,
  status ENUM('pendente', 'pago', 'vencido', 'cancelado') DEFAULT 'pendente',
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conta_sistema_id) REFERENCES contas_sistema(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- =============================================
-- DADOS INICIAIS
-- =============================================

-- Conta Phillipi
INSERT IGNORE INTO contas_sistema (nome, slug) VALUES ('Phillipi', 'phillipi');

-- Categorias iniciais para conta Phillipi
INSERT IGNORE INTO categorias (conta_sistema_id, nome, tipo, icone, cor) VALUES
(1, 'Salario', 'receita', '$', '#10b981'),
(1, 'Freelance', 'receita', '$', '#6366f1'),
(1, 'Investimentos', 'receita', '$', '#f59e0b'),
(1, 'Outros Receita', 'receita', '$', '#14b8a6'),
(1, 'Moradia', 'despesa', '$', '#ef4444'),
(1, 'Alimentacao', 'despesa', '$', '#f97316'),
(1, 'Transporte', 'despesa', '$', '#8b5cf6'),
(1, 'Saude', 'despesa', '$', '#ec4899'),
(1, 'Educacao', 'despesa', '$', '#3b82f6'),
(1, 'Lazer', 'despesa', '$', '#f59e0b'),
(1, 'Vestuario', 'despesa', '$', '#6366f1'),
(1, 'Contas e Servicos', 'despesa', '$', '#64748b'),
(1, 'Outros Despesa', 'despesa', '$', '#94a3b8');

-- Contas bancarias iniciais
INSERT IGNORE INTO contas_bancarias (conta_sistema_id, nome, tipo, saldo_inicial, saldo_atual, cor) VALUES
(1, 'Conta Corrente', 'corrente', 0.00, 0.00, '#6366f1'),
(1, 'Poupanca', 'poupanca', 0.00, 0.00, '#10b981'),
(1, 'Carteira', 'carteira', 0.00, 0.00, '#f59e0b');
