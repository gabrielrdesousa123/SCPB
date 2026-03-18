// server/routes/clubes.js
// CRUD + filtros + import CSV (multipart) para a tabela `clubes`.
// Colunas esperadas: id, sigla, nome, regiao.

import { Router } from 'express';
import db from '../db.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function toInt(v, d = null) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function norm(s = '') {
  return String(s)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* ================================================
   GET /api/clubes
   Query: q (nome/sigla), regiao, limit, page
================================================ */
router.get('/', (req, res) => {
  try {
    const { q = '', regiao = '', limit = '5000', page = '1' } = req.query;

    const where = [];
    const params = [];

    if (q) {
      where.push('(LOWER(sigla) LIKE ? OR LOWER(nome) LIKE ?)');
      const n = `%${norm(q)}%`;
      params.push(n, n);
    }
    if (regiao) {
      where.push('regiao = ?');
      params.push(String(regiao));
    }

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const limitN = Math.min(Math.max(toInt(limit, 5000), 1), 5000);
    const offset = Math.max((toInt(page, 1) - 1), 0) * limitN;

    const rows = db.prepare(`
      SELECT id, sigla, nome, regiao
      FROM clubes
      ${whereSql}
      ORDER BY nome COLLATE NOCASE ASC
      LIMIT ${limitN} OFFSET ${offset}
    `).all(...params);

    const total = db.prepare(`
      SELECT COUNT(1) AS n
      FROM clubes
      ${whereSql}
    `).get(...params).n;

    res.json({ items: rows, total });
  } catch (e) {
    console.error('GET /clubes failed:', e);
    res.status(500).json({ error: 'Falha ao listar clubes.' });
  }
});

/* ================================================
   POST /api/clubes
   Body: { nome, sigla?, regiao? }
================================================ */
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    const { nome, sigla = null, regiao = null } = body;

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      return res.status(400).json({ error: 'Campo "nome" é obrigatório.' });
    }

    const info = db.prepare(`
      INSERT INTO clubes (sigla, nome, regiao)
      VALUES (?, ?, ?)
    `).run(sigla ? String(sigla).trim() : null, String(nome).trim(), regiao ? String(regiao).trim() : null);

    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    console.error('POST /clubes failed:', e);
    res.status(500).json({ error: 'Falha ao criar clube.' });
  }
});

/* ================================================
   PUT /api/clubes/:id
   Body: { nome?, sigla?, regiao? }
================================================ */
router.put('/:id', (req, res) => {
  try {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    const cur = db.prepare('SELECT * FROM clubes WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'Clube não encontrado.' });

    const body = req.body || {};
    const nome  = (body.nome  !== undefined) ? String(body.nome).trim()  : cur.nome;
    const sigla = (body.sigla !== undefined) ? (body.sigla ? String(body.sigla).trim() : null) : cur.sigla;
    const regiao= (body.regiao!== undefined) ? (body.regiao ? String(body.regiao).trim() : null) : cur.regiao;

    if (!nome) return res.status(400).json({ error: 'Campo "nome" não pode ficar vazio.' });

    db.prepare(`
      UPDATE clubes
         SET nome = ?, sigla = ?, regiao = ?
       WHERE id = ?
    `).run(nome, sigla, regiao, id);

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /clubes/:id failed:', e);
    res.status(500).json({ error: 'Falha ao atualizar clube.' });
  }
});

/* ================================================
   DELETE /api/clubes/:id
================================================ */
router.delete('/:id', (req, res) => {
  try {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    const info = db.prepare('DELETE FROM clubes WHERE id = ?').run(id);
    if (!info.changes) return res.status(404).json({ error: 'Clube não encontrado.' });

    res.status(204).send();
  } catch (e) {
    console.error('DELETE /clubes/:id failed:', e);
    res.status(500).json({ error: 'Falha ao excluir clube.' });
  }
});

/* ================================================
   POST /api/clubes/import
   Recebe FormData com `file` (CSV). Cabeçalhos aceitos:
   - sigla, nome, regiao
   - ou "nome", "sigla", "regiao" em qualquer ordem (case-insensitive)
================================================ */
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const buf = req.file?.buffer;
    if (!buf || !buf.length) return res.status(400).json({ error: 'Arquivo CSV não enviado.' });

    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // remove BOM
    text = text.replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: 'CSV vazio.' });

    // detecta separador ; ou , ou \t
    const headerLine = lines[0];
    const sep = headerLine.includes('\t') ? '\t' : ((headerLine.match(/;/g)||[]).length > (headerLine.match(/,/g)||[]).length ? ';' : ',');

    const headers = headerLine.split(sep).map(h => h.trim());
    const Hn = headers.map(h => norm(h));

    const idxNome  = Hn.findIndex(h => h === 'nome');
    const idxSigla = Hn.findIndex(h => h === 'sigla');
    const idxReg   = Hn.findIndex(h => h === 'regiao' || h === 'região');

    if (idxNome < 0) return res.status(400).json({ error: 'Cabeçalho "nome" é obrigatório no CSV.' });

    const rows = lines.slice(1).map(l => l.split(sep).map(c => c.trim()));

    const ins = db.prepare('INSERT INTO clubes (sigla, nome, regiao) VALUES (?, ?, ?)');
    const upd = db.prepare('UPDATE clubes SET sigla=?, regiao=? WHERE id=?');
    const sel = db.prepare('SELECT id FROM clubes WHERE LOWER(nome)=?');

    const tx = db.transaction(() => {
      let inserted = 0, updated = 0, skipped = 0;
      for (const cols of rows) {
        const nome = cols[idxNome] || '';
        if (!nome) { skipped++; continue; }
        const sigla = (idxSigla >= 0 ? (cols[idxSigla] || null) : null) || null;
        const regiao = (idxReg >= 0 ? (cols[idxReg] || null) : null) || null;

        const found = sel.get(norm(nome));
        if (found) {
          upd.run(sigla, regiao, found.id);
          updated++;
        } else {
          ins.run(sigla, nome, regiao);
          inserted++;
        }
      }
      return { inserted, updated, skipped };
    });

    const rep = tx();
    res.json(rep);
  } catch (e) {
    console.error('POST /clubes/import failed:', e);
    res.status(500).json({ error: 'Falha ao importar CSV de clubes.' });
  }
});

export default router;
