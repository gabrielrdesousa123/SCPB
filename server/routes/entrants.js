// server/routes/entrants.js
// Rotas para gerenciar atletas inscritos (entrants) nas competições

import express from 'express';
import db from '../db.js';

const router = express.Router();

// ============================================================================
// GET /api/competitions/:competitionId/entrants
// Lista todos os atletas inscritos em uma competição
// Query params: ?class_code=BC1 (opcional - filtrar por classe)
// ============================================================================
router.get('/:competitionId/entrants', (req, res) => {
  const { competitionId } = req.params;
  const { class_code } = req.query;

  try {
    let query = `
      SELECT 
        e.id,
        e.competition_id,
        e.athlete_id,
        e.class_code,
        e.bib,
        e.seed,
        e.created_at,
        e.updated_at,
        a.nome as athlete_name,
        a.genero as athlete_gender,
        c.nome as club_name,
        c.sigla as club_sigla
      FROM entrants e
      LEFT JOIN atletas a ON e.athlete_id = a.id
      LEFT JOIN clubes c ON a.clube_id = c.id
      WHERE e.competition_id = ?
    `;

    const params = [competitionId];

    if (class_code) {
      query += ` AND e.class_code = ?`;
      params.push(class_code);
    }

    query += ` ORDER BY e.seed ASC, e.bib ASC, a.nome ASC`;

    const entrants = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: entrants,
      count: entrants.length
    });
  } catch (error) {
    console.error('Erro ao buscar entrants:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar atletas inscritos',
      details: error.message
    });
  }
});

// ============================================================================
// GET /api/competitions/:competitionId/entrants/:id
// Busca um entrant específico por ID
// ============================================================================
router.get('/:competitionId/entrants/:id', (req, res) => {
  const { competitionId, id } = req.params;

  try {
    const entrant = db.prepare(`
      SELECT 
        e.*,
        a.nome as athlete_name,
        a.genero as athlete_gender,
        c.nome as club_name,
        c.sigla as club_sigla
      FROM entrants e
      LEFT JOIN atletas a ON e.athlete_id = a.id
      LEFT JOIN clubes c ON a.clube_id = c.id
      WHERE e.id = ? AND e.competition_id = ?
    `).get(id, competitionId);

    if (!entrant) {
      return res.status(404).json({
        success: false,
        error: 'Atleta inscrito não encontrado'
      });
    }

    res.json({
      success: true,
      data: entrant
    });
  } catch (error) {
    console.error('Erro ao buscar entrant:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar atleta inscrito',
      details: error.message
    });
  }
});

// ============================================================================
// POST /api/competitions/:competitionId/entrants
// Inscreve um ou mais atletas na competição
// Body: { athletes: [{ athlete_id: 1, class_code: 'BC1' }, ...] }
// ============================================================================
router.post('/:competitionId/entrants', (req, res) => {
  const { competitionId } = req.params;
  const { athletes } = req.body;

  if (!athletes || !Array.isArray(athletes) || athletes.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'É necessário fornecer uma lista de atletas para inscrever'
    });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO entrants (competition_id, athlete_id, class_code)
      VALUES (?, ?, ?)
      ON CONFLICT (competition_id, athlete_id, class_code) DO NOTHING
    `);

    const inserted = db.transaction((athletes) => {
      const results = [];
      for (const athlete of athletes) {
        const result = stmt.run(competitionId, athlete.athlete_id, athlete.class_code);
        if (result.changes > 0) {
          results.push({
            id: result.lastInsertRowid,
            athlete_id: athlete.athlete_id,
            class_code: athlete.class_code
          });
        }
      }
      return results;
    })(athletes);

    res.status(201).json({
      success: true,
      message: `${inserted.length} atleta(s) inscrito(s) com sucesso`,
      data: inserted
    });
  } catch (error) {
    console.error('Erro ao inscrever atletas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao inscrever atletas',
      details: error.message
    });
  }
});

// ============================================================================
// PUT /api/competitions/:competitionId/entrants/:id
// Atualiza BIB e/ou SEED de um entrant
// Body: { bib: '1', seed: 1 }
// ============================================================================
router.put('/:competitionId/entrants/:id', (req, res) => {
  const { competitionId, id } = req.params;
  const { bib, seed } = req.body;

  try {
    // Verificar se o entrant existe
    const entrant = db.prepare(`
      SELECT * FROM entrants WHERE id = ? AND competition_id = ?
    `).get(id, competitionId);

    if (!entrant) {
      return res.status(404).json({
        success: false,
        error: 'Atleta inscrito não encontrado'
      });
    }

    // Construir query de update dinamicamente
    const updates = [];
    const params = [];

    if (bib !== undefined) {
      updates.push('bib = ?');
      params.push(bib);
    }

    if (seed !== undefined) {
      updates.push('seed = ?');
      params.push(seed);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum campo para atualizar'
      });
    }

    updates.push('updated_at = datetime("now")');
    params.push(id, competitionId);

    const query = `
      UPDATE entrants 
      SET ${updates.join(', ')}
      WHERE id = ? AND competition_id = ?
    `;

    db.prepare(query).run(...params);

    // Buscar entrant atualizado
    const updated = db.prepare(`
      SELECT 
        e.*,
        a.nome as athlete_name,
        c.nome as club_name
      FROM entrants e
      LEFT JOIN atletas a ON e.athlete_id = a.id
      LEFT JOIN clubes c ON a.clube_id = c.id
      WHERE e.id = ?
    `).get(id);

    res.json({
      success: true,
      message: 'Atleta atualizado com sucesso',
      data: updated
    });
  } catch (error) {
    console.error('Erro ao atualizar entrant:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar atleta',
      details: error.message
    });
  }
});

// ============================================================================
// PUT /api/competitions/:competitionId/entrants/batch
// Atualiza BIB e SEED de múltiplos entrants de uma vez
// Body: { entrants: [{ id: 1, bib: '1', seed: 1 }, ...] }
// ============================================================================
router.put('/:competitionId/entrants-batch', (req, res) => {
  const { competitionId } = req.params;
  const { entrants } = req.body;

  if (!entrants || !Array.isArray(entrants) || entrants.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'É necessário fornecer uma lista de entrants para atualizar'
    });
  }

  try {
    const stmt = db.prepare(`
      UPDATE entrants 
      SET bib = ?, seed = ?, updated_at = datetime('now')
      WHERE id = ? AND competition_id = ?
    `);

    const updated = db.transaction((entrants) => {
      let count = 0;
      for (const entrant of entrants) {
        const result = stmt.run(
          entrant.bib || null,
          entrant.seed || null,
          entrant.id,
          competitionId
        );
        count += result.changes;
      }
      return count;
    })(entrants);

    res.json({
      success: true,
      message: `${updated} atleta(s) atualizado(s) com sucesso`
    });
  } catch (error) {
    console.error('Erro ao atualizar entrants em lote:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar atletas',
      details: error.message
    });
  }
});

// ============================================================================
// DELETE /api/competitions/:competitionId/entrants/:id
// Remove um atleta da competição
// ============================================================================
router.delete('/:competitionId/entrants/:id', (req, res) => {
  const { competitionId, id } = req.params;

  try {
    const result = db.prepare(`
      DELETE FROM entrants 
      WHERE id = ? AND competition_id = ?
    `).run(id, competitionId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Atleta inscrito não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Atleta removido da competição com sucesso'
    });
  } catch (error) {
    console.error('Erro ao remover entrant:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao remover atleta',
      details: error.message
    });
  }
});

// ============================================================================
// GET /api/competitions/:competitionId/available-athletes
// Lista atletas disponíveis para inscrição (ainda não inscritos)
// Query params: ?class_code=BC1 (obrigatório)
// ============================================================================
router.get('/:competitionId/available-athletes', (req, res) => {
  const { competitionId } = req.params;
  const { class_code } = req.query;

  if (!class_code) {
    return res.status(400).json({
      success: false,
      error: 'É necessário fornecer o código da classe'
    });
  }

  try {
    const athletes = db.prepare(`
      SELECT 
        a.id,
        a.nome,
        a.genero,
        a.classe_code,
        a.rank,
        c.nome as club_name,
        c.sigla as club_sigla
      FROM atletas a
      LEFT JOIN clubes c ON a.clube_id = c.id
      WHERE a.classe_code = ?
        AND a.id NOT IN (
          SELECT athlete_id 
          FROM entrants 
          WHERE competition_id = ? AND class_code = ?
        )
      ORDER BY a.rank ASC, a.nome ASC
    `).all(class_code, competitionId, class_code);

    res.json({
      success: true,
      data: athletes,
      count: athletes.length
    });
  } catch (error) {
    console.error('Erro ao buscar atletas disponíveis:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar atletas disponíveis',
      details: error.message
    });
  }
});

export default router;