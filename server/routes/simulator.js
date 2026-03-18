// server/routes/simulator.js
import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET todos os cenários
router.get('/scenarios', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM sim_scenarios ORDER BY created_at DESC
  `).all();
  res.json(rows.map(row => ({
    ...row,
    competition: row.name ? {
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      dayStart: row.day_start,
      dayEnd: row.day_end,
      interval: row.interval,
      courts: row.courts
    } : {},
    classes: row.classes_json ? JSON.parse(row.classes_json) : [],
    allocations: row.allocations_json ? JSON.parse(row.allocations_json) : []
  })));
});

// GET cenário por id
router.get('/scenarios/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM sim_scenarios WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Cenário não encontrado' });
  res.json({
    ...row,
    competition: row.name ? {
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      dayStart: row.day_start,
      dayEnd: row.day_end,
      interval: row.interval,
      courts: row.courts
    } : {},
    classes: row.classes_json ? JSON.parse(row.classes_json) : [],
    allocations: row.allocations_json ? JSON.parse(row.allocations_json) : []
  });
});

// POST novo cenário
router.post('/scenarios', (req, res) => {
  try {
    const comp = req.body.competition || {};
    const name = comp.name || '';
    const start_date = comp.startDate || '';
    const end_date = comp.endDate || '';
    const day_start = comp.dayStart || '';
    const day_end = comp.dayEnd || '';
    const interval = comp.interval || 15;
    const courts = comp.courts || 6;

    const classes_json = JSON.stringify(req.body.classes || []);
    const allocations_json = JSON.stringify(req.body.allocations || []);

    const stmt = db.prepare(`
      INSERT INTO sim_scenarios (
        name, start_date, end_date, day_start, day_end, interval, courts,
        classes_json, allocations_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(name, start_date, end_date, day_start, day_end, interval, courts,
      classes_json, allocations_json);

    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('Erro ao salvar cenário:', e);
    res.status(500).json({ error: 'Falha ao salvar cenário.' });
  }
});

// PUT update cenário
router.put('/scenarios/:id', (req, res) => {
  try {
    const comp = req.body.competition || {};
    const name = comp.name || '';
    const start_date = comp.startDate || '';
    const end_date = comp.endDate || '';
    const day_start = comp.dayStart || '';
    const day_end = comp.dayEnd || '';
    const interval = comp.interval || 15;
    const courts = comp.courts || 6;

    const classes_json = JSON.stringify(req.body.classes || []);
    const allocations_json = JSON.stringify(req.body.allocations || []);

    const stmt = db.prepare(`
      UPDATE sim_scenarios SET
        name = ?, start_date = ?, end_date = ?, day_start = ?, day_end = ?, interval = ?, courts = ?,
        classes_json = ?, allocations_json = ?
      WHERE id = ?
    `);

    const info = stmt.run(name, start_date, end_date, day_start, day_end, interval, courts,
      classes_json, allocations_json, req.params.id);

    res.json({ updated: info.changes });
  } catch (e) {
    console.error('Erro ao atualizar cenário:', e);
    res.status(500).json({ error: 'Falha ao atualizar cenário.' });
  }
});

// POST agenda granular para um cenário (opcional)
router.post('/scenarios/:id/agenda', (req, res) => {
  const { agenda } = req.body; // [{match_date, start_time, court, duration}]
  const scenario_id = Number(req.params.id);
  if (!Array.isArray(agenda)) return res.status(400).json({ error: 'Agenda inválida' });

  const del = db.prepare(`DELETE FROM sim_agenda WHERE scenario_id = ?`);
  const ins = db.prepare(`
    INSERT INTO sim_agenda (scenario_id, match_date, start_time, court, duration)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    del.run(scenario_id);
    for (const row of agenda) {
      ins.run(scenario_id, row.match_date, row.start_time, row.court, row.duration);
    }
  });

  tx();
  res.json({ inserted: agenda.length });
});

// GET agenda granular (opcional)
router.get('/scenarios/:id/agenda', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM sim_agenda WHERE scenario_id = ?
    ORDER BY match_date, start_time, court
  `).all(req.params.id);

  res.json(rows);
});

// DELETE cenário (e agenda granular relacionada)
router.delete('/scenarios/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM sim_agenda WHERE scenario_id = ?`).run(id);
      const info = db.prepare(`DELETE FROM sim_scenarios WHERE id = ?`).run(id);
      return info.changes;
    });
    const deleted = tx();
    if (!deleted) return res.status(404).json({ error: 'Cenário não encontrado' });
    res.json({ deleted });
  } catch (e) {
    console.error('Erro ao excluir cenário:', e);
    res.status(500).json({ error: 'Falha ao excluir cenário.' });
  }
});

export default router;
