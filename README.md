# 💰 FinanceFlow — Controle de Finanças Pessoais

Aplicação completa para gerenciamento financeiro pessoal com Node.js + MySQL + HTML/CSS/JS.

## 📁 Estrutura do Projeto

```
financeapp/
├── backend/
│   ├── server.js          ← API Node.js (todas as rotas)
│   ├── schema.sql         ← Banco de dados MySQL
│   ├── package.json       ← Dependências Node
│   └── .env               ← Configurações (edite este!)
└── frontend/
    ├── index.html         ← Interface principal
    ├── css/style.css      ← Estilos
    └── js/app.js          ← Lógica do frontend
```

---

## 🚀 Como Instalar e Rodar

### Passo 1 — Instalar o Node.js
Baixe em https://nodejs.org (versão LTS)

### Passo 2 — Instalar o MySQL
Baixe em https://dev.mysql.com/downloads/mysql/
Ou use XAMPP: https://www.apachefriends.org

### Passo 3 — Criar o Banco de Dados
Abra o MySQL Workbench ou terminal MySQL e execute:
```
mysql -u root -p < backend/schema.sql
```
Ou copie e cole o conteúdo de `schema.sql` no MySQL Workbench e execute.

### Passo 4 — Configurar a conexão
Edite o arquivo `backend/.env`:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=SUA_SENHA_DO_MYSQL
DB_NAME=financas_pessoais
DB_PORT=3306
PORT=3000
```

### Passo 5 — Instalar dependências Node.js
```bash
cd backend
npm install
```

### Passo 6 — Rodar o servidor
```bash
npm start
```
Ou para desenvolvimento (reinicia automático):
```bash
npm run dev
```

### Passo 7 — Acessar a aplicação
Abra no navegador: **http://localhost:3000**

---

## ✨ Funcionalidades

| Módulo | Funcionalidades |
|--------|----------------|
| 📊 Dashboard | Resumo do mês, gráficos de evolução e categorias, últimas transações |
| 💸 Transações | Lançar receitas e despesas, filtros, categorias, parcelamento |
| 💳 Cartões | Gerenciar cartões de crédito, limite disponível, vencimentos |
| 🏦 Contas | Contas corrente, poupança, carteira com saldo em tempo real |
| 🎯 Metas | Criar metas de economia com barra de progresso e depósitos |
| 📋 A Pagar/Receber | Controle de contas futuras, alertas de vencimento |
| 📈 Relatórios | Gráfico anual de receitas vs despesas por mês |

---

## 🔧 Tecnologias

- **Frontend**: HTML5 + CSS3 + JavaScript puro + Chart.js
- **Backend**: Node.js + Express
- **Banco de Dados**: MySQL
- **Fonte**: DM Sans + DM Serif Display (Google Fonts)

---

## ❓ Dúvidas Comuns

**Erro de conexão com banco?**
→ Verifique se o MySQL está rodando e se a senha no `.env` está correta.

**Porta 3000 em uso?**
→ Mude `PORT=3000` para outra porta no `.env`.

**Como adicionar usuário/login?**
→ Pode ser implementado com JWT. Entre em contato para expandir.
