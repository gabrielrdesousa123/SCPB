// server/routes/competitions.js
// CRUD + summary + atletas_full + officials + reset + schedule + scores
import express from 'express';
import db from '../db.js';

const router = express.Router();
router.use(express.json());

/* ========= helpers ========= */
function bad(res, msg, field) { return res.status(400).json({ error: msg, field }); }
function normRow(r) {
  if (!r) return r;
  const o = { ...r };
  if (o.data_inicio) o.data_inicio = String(o.data_inicio);
  if (o.data_fim) o.data_fim = String(o.data_fim);
  if (o.metodo) o.metodo = String(o.metodo);
  if (o.name) o.nome = o.name;
  return o;
}
function hasTable(table) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  return !!row;
}
function tableInfo(table) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all(); } catch { return []; }
}

/* ========= schema detect ========= */
const COMP_TABLE = 'competitions';
const COMP_COLS = tableInfo(COMP_TABLE).map(r => r.name);

const pick = (...cands) => cands.find(c => COMP_COLS.includes(c)) || null;

const COL = {
  id: pick('id'),
  nome: pick('nome', 'name', 'title'),
  local: pick('local', 'location', 'venue'),
  data_ini: pick('data_inicio', 'start_date', 'inicio', 'start'),
  data_fim: pick('data_fim', 'end_date', 'fim', 'end'),
  metodo: pick('metodo', 'method', 'modo', 'mode'),
};

const COMP_CLASSES_TABLE = hasTable('competition_classes') ? 'competition_classes' : (
  hasTable('competitions_classes') ? 'competitions_classes' : null
);
let CCOL = { table: COMP_CLASSES_TABLE, comp_id: null, class_code: null };
if (CCOL.table) {
  const cols = tableInfo(CCOL.table).map(r => r.name);
  CCOL.comp_id = cols.includes('competition_id') ? 'competition_id' : (cols.includes('comp_id') ? 'comp_id' : null);
  CCOL.class_code = cols.includes('class_code') ? 'class_code' : (cols.includes('classe_code') ? 'classe_code' : (cols.includes('class') ? 'class' : null));
}

const METODOS = new Set(['WORLD_BOCCIA', 'ELIMINATORIA']);

/* =========================
   CREATE competição (sistema)
   ========================= */
router.post('/', (req, res) => {
  try {
    let { nome, local, data_inicio, data_fim, metodo, classes } = req.body || {};
    if (!nome) return bad(res, 'Nome é obrigatório', 'nome');
    if (!local) return bad(res, 'Local é obrigatório', 'local');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data_inicio || '')) return bad(res, 'Data início inválida', 'data_inicio');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data_fim || '')) return bad(res, 'Data fim inválida', 'data_fim');
    if (data_fim < data_inicio) return bad(res, 'Data fim antes de início', 'data_fim');
    if (!METODOS.has(String(metodo || '').toUpperCase())) return bad(res, 'Método inválido', 'metodo');
    if (!Array.isArray(classes) || classes.length === 0) return bad(res, 'Selecione ao menos uma classe', 'classes');

    const cols = [COL.nome, COL.local, COL.data_ini, COL.data_fim, COL.metodo].filter(Boolean);
    const sql = `INSERT INTO ${COMP_TABLE} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;

    const tx = db.transaction(() => {
      const id = db.prepare(sql).run(nome, local, data_inicio, data_fim, metodo).lastInsertRowid;
      if (CCOL.table && CCOL.comp_id && CCOL.class_code) {
        const ins = db.prepare(`INSERT INTO ${CCOL.table} (${CCOL.comp_id}, ${CCOL.class_code}) VALUES (?, ?)`);
        for (const c of classes) ins.run(id, String(c));
      }
      return Number(id);
    });

    const id = tx();
    res.status(201).json({ id, nome, local, data_inicio, data_fim, metodo, classes });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno ao criar competição' });
  }
});

/* =========================
   LIST competições (menu)
   ========================= */
router.get('/', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const all = String(req.query.all || '').trim() === '1';

    const order = [];
    if (COL.data_ini) order.push(`${COL.data_ini} ASC`);
    if (COL.data_fim) order.push(`${COL.data_fim} ASC`);
    if (COL.nome)     order.push(`${COL.nome} ASC`);
    const ORDER_BY = order.length ? order.join(',') : `${COL.id} ASC`;

    let where = '1=1';
    const params = [];

    if (q && COL.nome) { where += ` AND ${COL.nome} LIKE ?`; params.push(`%${q}%`); }
    if (q && COL.local) { where += ` OR ${COL.local} LIKE ?`; params.push(`%${q}%`); }

    if (!all) {
      if (COL.data_fim) where += ` AND ${COL.data_fim} IS NOT NULL AND ${COL.data_fim} <> ''`;
      if (COL.metodo) where += ` AND ${COL.metodo} IS NOT NULL AND ${COL.metodo} <> ''`;
    }

    const rows = db.prepare(`SELECT * FROM ${COMP_TABLE} WHERE ${where} ORDER BY ${ORDER_BY}`).all(...params);
    const items = rows.map(normRow);
    res.json({ items, total: items.length, filtered_system_only: !all });
  } catch (e) { res.status(500).json({ error: 'Erro interno' }); }
});

router.get('/with-results', (req, res) => {
  const competitionId = req.query.id; 
  try {
    let query = `
      SELECT DISTINCT c.id, c.nome
      FROM competitions c
      JOIN comp_results cr ON c.id = cr.competition_id
    `;
    const params = [];
    if (competitionId) {
      const parsedId = parseInt(competitionId, 10);
      if (isNaN(parsedId) || parsedId <= 0) return res.status(400).json({ error: 'ID da competição inválido.' });
      query += ` WHERE c.id = ?`;
      params.push(parsedId);
    }
    const competitions = db.prepare(query).all(...params);
    res.json(competitions);
  } catch (error) { res.status(500).json({ error: 'Falha interna.' }); }
});

/* ===== GET competição ===== */
router.get('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return bad(res, 'id inválido');
    const r = db.prepare(`SELECT * FROM ${COMP_TABLE} WHERE ${COL.id}=?`).get(id);
    if (!r) return res.status(404).json({ error: 'Competição não encontrada' });
    res.json(normRow(r));
  } catch (e) { res.status(500).json({ error: 'Erro interno' }); }
});

/* ===== CLASSES DA COMPETIÇÃO ===== */
router.get('/:id/classes', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return bad(res, 'id inválido');
    if (!CCOL.table || !CCOL.comp_id || !CCOL.class_code) return res.json({ classes: [], items: [] });
    const rows = db.prepare(`SELECT ${CCOL.class_code} AS class_code FROM ${CCOL.table} WHERE ${CCOL.comp_id}=? ORDER BY ${CCOL.class_code} ASC`).all(id);
    const codes = rows.map(r => r.class_code);
    res.json({ classes: codes, items: rows });
  } catch (e) { res.status(500).json({ error: 'Erro interno' }); }
});

router.post('/:id/classes', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return bad(res, 'id inválido');
    const { classes, replace } = req.body || {};
    if (!Array.isArray(classes)) return bad(res, 'classes inválidas', 'classes');
    if (!CCOL.table || !CCOL.comp_id || !CCOL.class_code) return bad(res, 'Tabela indisponível');

    const tx = db.transaction(() => {
      if (replace) db.prepare(`DELETE FROM ${CCOL.table} WHERE ${CCOL.comp_id}=?`).run(id);
      const existing = db.prepare(`SELECT ${CCOL.class_code} FROM ${CCOL.table} WHERE ${CCOL.comp_id}=?`).all(id);
      const existingSet = new Set(existing.map(r => r[CCOL.class_code]));
      const ins = db.prepare(`INSERT INTO ${CCOL.table} (${CCOL.comp_id}, ${CCOL.class_code}) VALUES (?, ?)`);
      for (const c of classes) {
        const code = String(c).trim();
        if (code && !existingSet.has(code)) { ins.run(id, code); existingSet.add(code); }
      }
    });
    tx();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro interno' }); }
});

/* ===== SUMMARY ===== */
router.get('/:id/summary', (req,res)=>{
  try{
    const id = Number(req.params.id);
    if (!id) return bad(res,'id inválido');
    res.json({ id, pools: 0, matches: 0, athletes: 0, officials: 0 });
  }catch(e){ res.status(500).json({ error:'Erro interno' }); }
});

/* ===== ATHLETES ===== */
router.get('/:id/athletes', (req, res) => {
  try {
    const compId = Number(req.params.id);
    const athletes = db.prepare(`
      SELECT e.class_code, e.bib, a.nome AS athlete_name, c.nome AS club_name, c.sigla AS club_sigla
      FROM entrants e JOIN atletas a ON e.athlete_id = a.id LEFT JOIN clubes c ON a.clube_id = c.id
      WHERE e.competition_id = ? ORDER BY e.class_code ASC, CAST(e.bib AS INTEGER) ASC
    `).all(compId);
    res.json({ success: true, data: athletes });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:id/athletes_full', (req,res)=>{ try{ res.json({ items: [] }); }catch(e){ res.status(500).json({ error:'Erro' }); }});

router.get('/:id/athlete-ranks', (req, res) => {
  try {
    const competitionId = req.params.id;
    const athleteRanks = db.prepare(`
      SELECT cr.athlete_id, cr.rank, a.nome AS athlete_name, a.genero AS athlete_gender, a.clube_id, cl.nome AS club_name
      FROM comp_results cr JOIN athletes a ON cr.athlete_id = a.id LEFT JOIN clubs cl ON a.clube_id = cl.id
      WHERE cr.competition_id = ? ORDER BY cr.rank ASC;
    `).all(competitionId);
    res.json(athleteRanks);
  } catch (error) { res.status(500).json({ error: 'Falha ranks.' }); }
});

/* ===== OFFICIALS ===== */
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS competition_officials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      referee_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      FOREIGN KEY (competition_id) REFERENCES competitions (id) ON DELETE CASCADE,
      FOREIGN KEY (referee_id) REFERENCES referees (id) ON DELETE CASCADE
    )
  `).run();
} catch (e) {}

router.get('/:id/officials', (req, res) => {
  try {
    const compId = Number(req.params.id);
    const data = db.prepare(`
      SELECT co.id as bond_id, co.role, r.id as referee_id, r.nome_completo, r.nome_abreviado, r.uf, r.nivel
      FROM competition_officials co
      JOIN referees r ON co.referee_id = r.id
      WHERE co.competition_id = ?
      ORDER BY 
        CASE co.role
          WHEN 'Delegado Técnico' THEN 1 WHEN 'Assistente Delegado Técnico' THEN 2
          WHEN 'Árbitro chefe' THEN 3 WHEN 'Assistente Árbitro Chefe' THEN 4
          WHEN 'Árbitro' THEN 5 WHEN 'Cursista' THEN 6 ELSE 7
        END, r.nome_completo ASC
    `).all(compId);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/:id/officials', (req, res) => {
  try {
    const compId = Number(req.params.id);
    const { referee_id, role } = req.body;
    if (!referee_id || !role) return res.status(400).json({ success: false, error: 'Dados incompletos.' });
    const exists = db.prepare(`SELECT id FROM competition_officials WHERE competition_id = ? AND referee_id = ?`).get(compId, referee_id);
    if (exists) return res.status(400).json({ success: false, error: 'Este oficial já está.' });
    db.prepare(`INSERT INTO competition_officials (competition_id, referee_id, role) VALUES (?, ?, ?)`).run(compId, referee_id, role);
    res.json({ success: true, message: 'Adicionado' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/:id/officials/:bondId', (req, res) => {
  try {
    const compId = Number(req.params.id);
    const bondId = Number(req.params.bondId);
    db.prepare(`DELETE FROM competition_officials WHERE id = ? AND competition_id = ?`).run(bondId, compId);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

/* ============================================================================
   MÓDULO DE AGENDA E ARBITRAGEM (BUILDER) E TIME SLOTS
   ============================================================================ */
try {
  const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
  const columns = tableInfo.map(c => c.name);
  if (!columns.includes('court')) db.prepare(`ALTER TABLE matches ADD COLUMN court INTEGER`).run();
  if (!columns.includes('match_date')) db.prepare(`ALTER TABLE matches ADD COLUMN match_date TEXT`).run();
  if (!columns.includes('start_time')) db.prepare(`ALTER TABLE matches ADD COLUMN start_time TEXT`).run();
  if (!columns.includes('referee_id')) db.prepare(`ALTER TABLE matches ADD COLUMN referee_id INTEGER`).run();
  if (!columns.includes('referee_principal_id')) db.prepare(`ALTER TABLE matches ADD COLUMN referee_principal_id INTEGER`).run();
  if (!columns.includes('referee_shadow_id')) db.prepare(`ALTER TABLE matches ADD COLUMN referee_shadow_id INTEGER`).run();
  if (!columns.includes('referee_linha_id')) db.prepare(`ALTER TABLE matches ADD COLUMN referee_linha_id INTEGER`).run();
  if (!columns.includes('referee_mesa_id')) db.prepare(`ALTER TABLE matches ADD COLUMN referee_mesa_id INTEGER`).run();

  // Tabela para as Câmaras de Chamada e Descanso (por Horário)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS competition_time_slots (
      competition_id INTEGER,
      match_date TEXT,
      start_time TEXT,
      call_room_ids TEXT,
      rest_ids TEXT,
      PRIMARY KEY (competition_id, match_date, start_time)
    )
  `).run();
} catch (e) { console.log("Schema de arbitragem validado."); }


router.get('/:id/time_slots', (req, res) => {
    try {
        const data = db.prepare(`SELECT * FROM competition_time_slots WHERE competition_id = ?`).all(Number(req.params.id));
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id/time_slots', (req, res) => {
    try {
        const { match_date, start_time, call_room_ids, rest_ids } = req.body;
        db.prepare(`
            INSERT OR REPLACE INTO competition_time_slots (competition_id, match_date, start_time, call_room_ids, rest_ids)
            VALUES (?, ?, ?, ?, ?)
        `).run(Number(req.params.id), match_date, start_time, JSON.stringify(call_room_ids || []), JSON.stringify(rest_ids || []));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/* ============================================================================
   A MÁGICA ACONTECE AQUI: GET ALL MATCHES (INTEGRAÇÃO TOTAL)
   ============================================================================ */
router.get('/:id/matches/all', (req, res) => {
  try {
    const compId = Number(req.params.id);
    
    // Esta Query centraliza tudo: Puxa o jogo, os atletas, os clubes, e MAPEIA os scores
    const matches = db.prepare(`
      SELECT m.*, 
             m.score1 as p1_score,
             m.score2 as p2_score,
             p.pool_name,
             COALESCE(a1.nome, 'A Definir') as p1_name, 
             COALESCE(e1.bib, '-') as p1_bib, 
             COALESCE(c1.sigla, '-') as p1_club,
             COALESCE(a2.nome, 'A Definir') as p2_name, 
             COALESCE(e2.bib, '-') as p2_bib,
             COALESCE(c2.sigla, '-') as p2_club
      FROM matches m
      LEFT JOIN pools p ON m.pool_id = p.id
      LEFT JOIN entrants e1 ON m.entrant1_id = e1.id
      LEFT JOIN atletas a1 ON e1.athlete_id = a1.id
      LEFT JOIN clubes c1 ON a1.clube_id = c1.id
      LEFT JOIN entrants e2 ON m.entrant2_id = e2.id
      LEFT JOIN atletas a2 ON e2.athlete_id = a2.id
      LEFT JOIN clubes c2 ON a2.clube_id = c2.id
      WHERE m.competition_id = ?
    `).all(compId);
    res.json({ success: true, data: matches });
  } catch (error) { 
    res.status(500).json({ success: false, error: error.message }); 
  }
});

/* Atualiza a quadra e hora (Drag & Drop da Agenda) */
router.put('/:id/matches/:matchId/schedule', (req, res) => {
  try {
    const { court, match_date, start_time } = req.body;
    db.prepare(`
      UPDATE matches 
      SET court = ?, match_date = ?, start_time = ? 
      WHERE id = ? AND competition_id = ?
    `).run(court, match_date, start_time, Number(req.params.matchId), Number(req.params.id));
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

/* Atualiza os árbitros (Escala de Arbitragem) */
router.put('/:id/matches/:matchId/referee', (req, res) => {
  try {
    const { referee_id, referee_mesa_id, referee_time_id, referee_shadow_id } = req.body; // legado
    const { principal_id, shadow_id, linha_id, mesa_id } = req.body; // atual
    
    db.prepare(`
      UPDATE matches 
      SET referee_id = ?, referee_principal_id = ?, referee_shadow_id = ?, referee_linha_id = ?, referee_mesa_id = ? 
      WHERE id = ? AND competition_id = ?
    `).run(
        principal_id || referee_id || null, 
        principal_id || referee_id || null, 
        shadow_id || referee_shadow_id || null, 
        linha_id || null, 
        mesa_id || referee_mesa_id || null, 
        Number(req.params.matchId), 
        Number(req.params.id)
    );
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

/* Insere/Atualiza os Placares e muda o status da Partida */
router.put('/:id/matches/:matchId/score', (req, res) => {
  try {
    const { score1, score2, status } = req.body;
    db.prepare(`
      UPDATE matches 
      SET score1 = ?, score2 = ?, status = ?
      WHERE id = ? AND competition_id = ?
    `).run(score1, score2, status || 'COMPLETED', Number(req.params.matchId), Number(req.params.id));
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

/* ===== DELETE ===== */
router.delete('/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const relatedTables = [
      { table: 'competition_classes', col: 'competition_id' },
      { table: 'competition_matches', col: 'competition_id' },
      { table: 'entrants', col: 'competition_id' },
      { table: 'comp_results', col: 'competition_id' },
      { table: 'competition_officials', col: 'competition_id' },
      { table: 'competition_time_slots', col: 'competition_id' }
    ];

    for (const { table, col } of relatedTables) {
      try {
        const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
        if (exists) db.prepare(`DELETE FROM "${table}" WHERE "${col}"=?`).run(id);
      } catch (e) { }
    }

    const info = db.prepare(`DELETE FROM ${COMP_TABLE} WHERE ${COL.id}=?`).run(id);
    if (!info.changes) return res.status(404).json({ error:'Competição não encontrada' });
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:'Erro interno' }); }
});

export default router;