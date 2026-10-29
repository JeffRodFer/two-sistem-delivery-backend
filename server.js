const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();

// LIBERAÇÃO CORRETA DE CORS PARA O FRONTEND NA VERCEL
app.use(cors({
  origin: '*', // Se preferir mais segurança, pode substituir '*' pelo link exato do seu frontend na Vercel
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. GET /api/cardapio
app.get('/api/cardapio', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nome, preco, categoria, disponivel, estoque FROM produtos ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar cardápio:", err);
    res.status(500).json({ erro: "Erro interno ao carregar cardápio." });
  }
});

// 2. POST /admin/login
app.post('/admin/login', (req, res) => {
  const { senha } = req.body;
  const senhaAdmin = process.env.ADMIN_PASSWORD || '123456';

  if (senha === senhaAdmin) {
    res.json({ autorizado: true, token: 'admin-token-seguro' });
  } else {
    res.status(401).json({ autorizado: false, erro: 'Senha incorreta.' });
  }
});

// 3. POST /admin/atualizar-lote
app.post('/admin/atualizar-lote', async (req, res) => {
  const { produtos } = req.body;
  if (!Array.isArray(produtos)) {
    return res.status(400).json({ erro: 'Formato inválido.' });
  }

  try {
    for (let p of produtos) {
      await pool.query(
        'UPDATE produtos SET preco = $1, estoque = $2, disponivel = $3 WHERE id = $4',
        [p.preco, p.estoque, p.disponivel, p.id]
      );
    }
    res.json({ sucesso: true, mensagem: 'Estoque e preços atualizados com sucesso!' });
  } catch (err) {
    console.error("Erro ao atualizar lote:", err);
    res.status(500).json({ erro: 'Erro ao atualizar dados no banco.' });
  }
});

// 4. POST /api/registrar-venda (Baixa no estoque)
app.post('/api/registrar-venda', async (req, res) => {
  const { itensCarrinho } = req.body;

  if (!Array.isArray(itensCarrinho) || itensCarrinho.length === 0) {
    return res.status(400).json({ erro: 'Carrinho vazio ou inválido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let item of itensCarrinho) {
      const check = await client.query('SELECT estoque, nome FROM produtos WHERE id = $1', [item.id]);
      if (check.rows.length === 0) {
        throw new Error(`Produto ID ${item.id} não encontrado.`);
      }

      const produto = check.rows[0];
      if (produto.estoque < item.quantidade) {
        throw new Error(`Estoque insuficiente para o item: ${produto.nome}. Disponível: ${produto.estoque}`);
      }

      await client.query(
        'UPDATE produtos SET estoque = estoque - $1 WHERE id = $2',
        [item.quantidade, item.id]
      );
    }

    await client.query('COMMIT');
    res.json({ sucesso: true, mensagem: 'Venda registada e estoque atualizado com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Erro na venda:", err);
    res.status(400).json({ erro: err.message || 'Erro ao processar baixa no estoque.' });
  } finally {
    client.release();
  }
});

// 5. POST /admin/estornar
app.post('/admin/estornar', async (req, res) => {
  const { itensEstorno } = req.body;

  if (!Array.isArray(itensEstorno) || itensEstorno.length === 0) {
    return res.status(400).json({ erro: 'Dados de estorno inválidos.' });
  }

  try {
    for (let item of itensEstorno) {
      await pool.query(
        'UPDATE produtos SET estoque = estoque + $1 WHERE id = $2',
        [item.quantidade, item.id]
      );
    }
    res.json({ sucesso: true, mensagem: 'Estorno realizado com sucesso.' });
  } catch (err) {
    console.error("Erro ao estornar:", err);
    res.status(500).json({ erro: 'Erro ao processar estorno.' });
  }
});

// EXPORTAÇÃO OBRIGATÓRIA PARA A VERCEL (Sem app.listen)
module.exports = app;