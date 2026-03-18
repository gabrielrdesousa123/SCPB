import { Router } from 'express';
import db from '../db.js';

const router = Router();

const handleError = (res, message, status = 500) => {
  console.error(message);
  return res.status(status).json({ error: message });
};

// GET /api/referees - Listar todos os oficiais
router.get('/', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM referees ORDER BY nome_completo COLLATE NOCASE ASC').all();
    res.json({ items, total: items.length });
  } catch (e) {
    handleError(res, `Erro ao listar oficiais: ${e.message}`);
  }
});

// POST /api/referees - Criar novo oficial
router.post('/', (req, res) => {
  const { nome_completo, nome_abreviado, uf, nivel } = req.body;
  if (!nome_completo || !uf || !nivel) {
    return res.status(400).json({ error: 'Campos (nome_completo, uf, nivel) são obrigatórios.' });
  }
  try {
    const info = db.prepare(
      'INSERT INTO referees (nome_completo, nome_abreviado, uf, nivel) VALUES (?, ?, ?, ?)'
    ).run(nome_completo, nome_abreviado, uf, nivel);
    
    const newItem = db.prepare('SELECT * FROM referees WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(newItem);
  } catch (e) {
    handleError(res, `Erro ao criar oficial: ${e.message}`);
  }
});

// PUT /api/referees/:id - Atualizar um oficial
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { nome_completo, nome_abreviado, uf, nivel } = req.body;
  if (!nome_completo || !uf || !nivel) {
    return res.status(400).json({ error: 'Campos (nome_completo, uf, nivel) são obrigatórios.' });
  }
  try {
    const info = db.prepare(
      'UPDATE referees SET nome_completo = ?, nome_abreviado = ?, uf = ?, nivel = ? WHERE id = ?'
    ).run(nome_completo, nome_abreviado, uf, nivel, id);

    if (info.changes === 0) return handleError(res, 'Oficial não encontrado.', 404);
    
    const updatedItem = db.prepare('SELECT * FROM referees WHERE id = ?').get(id);
    res.json(updatedItem);
  } catch (e) {
    handleError(res, `Erro ao atualizar oficial: ${e.message}`);
  }
});

// DELETE /api/referees/:id - Excluir um oficial
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM referees WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return handleError(res, 'Oficial não encontrado.', 404);
    res.status(204).send();
  } catch (e) {
    handleError(res, `Erro ao excluir oficial: ${e.message}`);
  }
});

// POST /api/referees/bulk-delete - Excluir em massa
router.post('/bulk-delete', (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'A lista de IDs é inválida.' });
    }
    const stmt = db.prepare('DELETE FROM referees WHERE id = ?');
    const transact = db.transaction((idList) => {
        let deleted = 0;
        for (const id of idList) {
            deleted += stmt.run(id).changes;
        }
        return { deleted };
    });
    try {
        const { deleted } = transact(ids);
        res.json({ success: true, deleted });
    } catch (e) {
        handleError(res, `Erro na exclusão em massa: ${e.message}`);
    }
});

export default router;