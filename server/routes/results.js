// server/routes/results.js (ESM)
import express from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import db from '../db.js';

const router = express.Router();
const upload = multer();

const norm = (v) => (v ?? '').toString().trim();
const isNum = (v) => v !== null && v !== undefined && String(v).trim() !== '' && !Number.isNaN(Number(v));

function parseDate(v) {
  const s = norm(v);
  if (!s) return null;

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900) {
      return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : s;
}

function hasTable(name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

function getCompetitionColumns() {
  const info = db.prepare(`PRAGMA table_info(competitions)`).all();
  const cols = new Set(info.map(r => r.name.toLowerCase()));
  const pick = (...cands) => cands.find(c => cols.has(c)) || null;
  return {
    id: pick('id') || 'id',
    name: pick('nome', 'name', 'title'),
    location: pick('local', 'location', 'venue'),
    start: pick('data_inicio', 'start_date', 'inicio', 'start'),
    end: pick('data_fim', 'end_date', 'fim', 'end'),
    method: pick('metodo', 'method', 'modo', 'mode'),
    created: pick('created_at', 'createdat', 'created'),
    updated: pick('updated_at', 'updatedat', 'updated'),
    all: info.map(r => r.name)
  };
}

/**
 * MIGRAÇÃO ROBUSTA: garante que comp_results existe e possui colunas esperadas
 * (incluindo a obrigatória source_name quando existir NOT NULL no banco atual).
 */
function ensureCompResultsSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comp_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      class_code TEXT,
      athlete_id INTEGER,
      club_id INTEGER,
      rank INTEGER
    );
  `);

  const cols = db.prepare(`PRAGMA table_info(comp_results)`).all();
  const names = new Set(cols.map(c => c.name));

  const addCol = (name, ddl) => {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE comp_results ADD COLUMN ${ddl};`);
      names.add(name);
    }
  };

  // colunas comuns
  addCol('created_at', `created_at TEXT`);
  addCol('updated_at', `updated_at TEXT`);

  // ✅ FIX DO ERRO: se o banco atual exige source_name (NOT NULL), precisamos garantir que exista
  // e sempre tenha default para inserts antigos.
  // SQLite permite ADD COLUMN com NOT NULL se tiver DEFAULT.
  addCol('source_name', `source_name TEXT NOT NULL DEFAULT 'import'`);

  // (Opcional) se você tiver outras colunas "source_*" no seu schema real,
  // pode adicionar aqui da mesma forma para ficar a prova de versões.
}

/**
 * Similaridade (preview)
 */
function lev(a, b) {
  const A = norm(a).toLowerCase();
  const B = norm(b).toLowerCase();
  const m = A.length, n = B.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const A = norm(a).toLowerCase();
  const B = norm(b).toLowerCase();
  if (!A || !B) return 0;
  const maxLen = Math.max(A.length, B.length);
  const levd = lev(A, B);
  let score = 1 - (levd / maxLen);
  if (B.startsWith(A) || A.startsWith(B)) score += 0.1;

  const at = new Set(A.split(/\s+/).filter(Boolean));
  const bt = new Set(B.split(/\s+/).filter(Boolean));
  let inter = 0;
  at.forEach((t) => { if (bt.has(t)) inter++; });
  score += inter * 0.02;

  return Math.max(0, Math.min(1, score));
}

function tablesWithCompetitionId() {
  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
  `).all().map(r => r.name);

  const out = [];
  for (const t of tables) {
    try {
      const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map(r => r.name);
      if (cols.includes('competition_id')) out.push({ table: t, col: 'competition_id' });
      else if (cols.includes('competitionId')) out.push({ table: t, col: 'competitionId' });
    } catch {
      // ignore
    }
  }
  out.sort((a, b) => (a.table === 'comp_results' ? -1 : b.table === 'comp_results' ? 1 : 0));
  return out;
}

/* ============================ LISTAGEM DE COMPETIÇÕES ============================ */
router.get('/competitions', (req, res) => {
  try {
    const cc = getCompetitionColumns();
    const hasResults = String(req.query.hasResults || '').toLowerCase() === 'true';

    ensureCompResultsSchema();

    const orderBy = cc.start ? `${cc.start} DESC` : `${cc.id} DESC`;

    let sql = `
      SELECT
        ${cc.all.map(c => `c."${c}"`).join(', ')},
        (
          SELECT COUNT(DISTINCT r.athlete_id)
          FROM comp_results r
          WHERE r.competition_id = c."${cc.id}"
            AND r.athlete_id IS NOT NULL
        ) AS num_competidores
      FROM competitions c
    `;

    if (hasResults) {
      sql += ` WHERE c."${cc.id}" IN (SELECT DISTINCT competition_id FROM comp_results) `;
    }

    sql += ` ORDER BY ${orderBy} LIMIT 200`;
    const rows = db.prepare(sql).all();

    const out = rows.map(r => ({
      id: r[cc.id],
      nome: r[cc.name] ?? r.nome ?? r.name ?? '',
      local: r[cc.location] ?? r.local ?? '',
      data_inicio: r[cc.start] ?? r.data_inicio ?? null,
      data_fim: r[cc.end] ?? r.data_fim ?? null,
      metodo: r[cc.method] ?? r.metodo ?? '',
      created_at: r[cc.created] ?? r.created_at ?? null,
      updated_at: r[cc.updated] ?? r.updated_at ?? null,
      num_competidores: Number(r.num_competidores || 0),
    }));

    return res.json({ competitions: out });
  } catch (err) {
    console.error('GET /api/results/competitions ->', err);
    return res.status(500).json({ error: 'Falha ao listar competições.' });
  }
});

/* ============================ EDITAR COMPETIÇÃO (RESULTADOS) ============================ */
router.put('/competitions/:id', express.json(), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    const cc = getCompetitionColumns();
    const cur = db.prepare(`SELECT * FROM competitions WHERE "${cc.id}"=?`).get(id);
    if (!cur) return res.status(404).json({ error: 'Competição não encontrada.' });

    const nome = norm(req.body?.nome ?? req.body?.name ?? cur[cc.name] ?? cur.nome ?? cur.name ?? '');
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

    const local = norm(req.body?.local ?? req.body?.location ?? cur[cc.location] ?? cur.local ?? '');
    const data_inicio = parseDate(req.body?.data_inicio ?? req.body?.start_date ?? cur[cc.start] ?? cur.data_inicio ?? null);
    const data_fim = parseDate(req.body?.data_fim ?? req.body?.end_date ?? cur[cc.end] ?? cur.data_fim ?? null);
    const metodo = norm(req.body?.metodo ?? req.body?.method ?? cur[cc.method] ?? cur.metodo ?? '');

    const sets = [];
    const vals = [];
    if (cc.name) { sets.push(`"${cc.name}"=?`); vals.push(nome); }
    if (cc.location) { sets.push(`"${cc.location}"=?`); vals.push(local || null); }
    if (cc.start) { sets.push(`"${cc.start}"=?`); vals.push(data_inicio); }
    if (cc.end) { sets.push(`"${cc.end}"=?`); vals.push(data_fim); }
    if (cc.method) { sets.push(`"${cc.method}"=?`); vals.push(metodo || null); }
    if (cc.updated) { sets.push(`"${cc.updated}"=datetime('now')`); }

    if (!sets.length) return res.json({ ok: true });

    const sql = `UPDATE competitions SET ${sets.join(', ')} WHERE "${cc.id}"=?`;
    vals.push(id);

    const info = db.prepare(sql).run(...vals);
    if (!info.changes) return res.status(404).json({ error: 'Competição não encontrada.' });

    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/results/competitions/:id ->', err);
    return res.status(500).json({ error: 'Falha ao editar competição.' });
  }
});

/* ============================ EXCLUIR COMPETIÇÃO (ROBUSTO) ============================ */
router.delete('/competitions/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    const cc = getCompetitionColumns();

    const tx = db.transaction(() => {
      const cur = db.prepare(`SELECT "${cc.id}" AS id FROM competitions WHERE "${cc.id}"=?`).get(id);
      if (!cur) throw new Error('NOT_FOUND');

      const refs = tablesWithCompetitionId();
      for (const ref of refs) {
        try {
          db.prepare(`DELETE FROM "${ref.table}" WHERE "${ref.col}"=?`).run(id);
        } catch (e) {
          console.error(`[results] delete cascade falhou em ${ref.table}.${ref.col}`, e);
          throw new Error(`CASCADE_FAIL:${ref.table}`);
        }
      }

      const info = db.prepare(`DELETE FROM competitions WHERE "${cc.id}"=?`).run(id);
      if (!info.changes) throw new Error('NOT_FOUND');
    });

    tx();
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/results/competitions/:id ->', err);
    if (String(err?.message || '') === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Competição não encontrada.' });
    }
    return res.status(500).json({ error: 'Falha ao excluir competição.' });
  }
});

/* ============================ RESULTADOS POR COMPETIÇÃO ============================ */
router.get('/competitions/:id/results', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    ensureCompResultsSchema();

    const rows = db.prepare(`
      SELECT r.*, a.nome AS atleta_nome, a.classe_code AS atleta_classe, c.nome AS clube_nome
      FROM comp_results r
      LEFT JOIN atletas a ON a.id = r.athlete_id
      LEFT JOIN clubes c ON c.id = r.club_id
      WHERE r.competition_id = ?
      ORDER BY r.class_code ASC, r.rank ASC, r.id ASC
    `).all(id);

    return res.json({ results: rows });
  } catch (err) {
    console.error('GET /api/results/competitions/:id/results ->', err);
    return res.status(500).json({ error: 'Falha ao carregar resultados.' });
  }
});

router.put('/competitions/:id/results/:rid', express.json(), (req, res) => {
  try {
    const id = Number(req.params.id);
    const rid = Number(req.params.rid);
    if (!id || !rid) return res.status(400).json({ error: 'IDs inválidos.' });

    ensureCompResultsSchema();

    const { class_code, athlete_id, club_id, rank } = req.body || {};
    const upd = db.prepare(`
      UPDATE comp_results
      SET class_code=?, athlete_id=?, club_id=?, rank=?, updated_at=datetime('now')
      WHERE id=? AND competition_id=?
    `);
    const info = upd.run(
      norm(class_code) || null,
      athlete_id ? Number(athlete_id) : null,
      club_id ? Number(club_id) : null,
      isNum(rank) ? Number(rank) : null,
      rid, id
    );
    if (!info.changes) return res.status(404).json({ error: 'Linha não encontrada.' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/results/competitions/:id/results/:rid ->', err);
    return res.status(500).json({ error: 'Falha ao atualizar linha.' });
  }
});

router.delete('/competitions/:id/results/:rid', (req, res) => {
  try {
    const id = Number(req.params.id);
    const rid = Number(req.params.rid);
    if (!id || !rid) return res.status(400).json({ error: 'IDs inválidos.' });

    ensureCompResultsSchema();

    const del = db.prepare(`DELETE FROM comp_results WHERE id=? AND competition_id=?`);
    const info = del.run(rid, id);
    if (!info.changes) return res.status(404).json({ error: 'Linha não encontrada.' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/results/competitions/:id/results/:rid ->', err);
    return res.status(500).json({ error: 'Falha ao remover linha.' });
  }
});

/* ============================ LOOKUPS (Classes/Clubes) ============================ */
router.get('/lookups', (req, res) => {
  try {
    const classes = hasTable('classes')
      ? db.prepare(`SELECT codigo, nome FROM classes ORDER BY codigo ASC`).all()
      : [];
    const clubes = hasTable('clubes')
      ? db.prepare(`SELECT id, nome FROM clubes ORDER BY nome ASC`).all()
      : [];
    return res.json({ classes, clubes });
  } catch (err) {
    console.error('GET /api/results/lookups ->', err);
    return res.status(500).json({ error: 'Falha ao carregar lookups.' });
  }
});

/* ============================ BUSCA DE ATLETAS (popup troca) ============================ */
router.get('/athletes', (req, res) => {
  try {
    const query = norm(req.query.query);
    const class_code = norm(req.query.class_code);
    const club_id_raw = norm(req.query.club_id);
    const club_id = club_id_raw && !Number.isNaN(Number(club_id_raw)) ? Number(club_id_raw) : null;

    const where = [];
    const params = [];

    if (query) { where.push(`lower(a.nome) LIKE lower(?)`); params.push(`%${query}%`); }
    if (class_code) { where.push(`upper(a.classe_code) = upper(?)`); params.push(class_code); }
    if (club_id) { where.push(`a.clube_id = ?`); params.push(club_id); }

    const sql = `
      SELECT a.id, a.nome, a.classe_code, a.clube_id, c.nome AS clube_nome
      FROM atletas a
      LEFT JOIN clubes c ON c.id = a.clube_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.nome ASC
      LIMIT 200
    `;

    const rows = db.prepare(sql).all(...params);
    return res.json({ athletes: rows });
  } catch (err) {
    console.error('GET /api/results/athletes ->', err);
    return res.status(500).json({ error: 'Falha ao buscar atletas.' });
  }
});

/* ============================ PREVIEW DO CSV ============================ */
router.post('/preview', upload.single('file'), (req, res) => {
  try {
    let csvText = '';
    if (req.file?.buffer) csvText = req.file.buffer.toString('utf8');
    else if (req.is('application/json') && req.body?.csv) csvText = String(req.body.csv);
    else return res.status(400).json({ error: 'Envie arquivo CSV (file) ou JSON { csv }.' });

    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (parsed.errors?.length) {
      return res.status(400).json({ error: 'CSV inválido', details: parsed.errors.slice(0, 5) });
    }

    const fields = parsed.meta.fields || [];
    const lower = fields.map(f => f.toLowerCase().trim());
    const idx = (names) => {
      for (const n of names) {
        const i = lower.indexOf(n.toLowerCase());
        if (i >= 0) return i;
      }
      return -1;
    };

    const iClass = idx(['classe', 'class', 'class_code', 'categoria']);
    const iName = idx(['nome', 'atleta', 'athlete', 'name']);
    const iClub = idx(['clube', 'club', 'equipe', 'team']);
    const iRank = idx(['rank', 'colocacao', 'posição', 'posicao']);

    const atletas = db.prepare(`
      SELECT a.id, a.nome, a.classe_code AS classe, c.nome AS clube_nome, c.id AS clube_id
      FROM atletas a
      LEFT JOIN clubes c ON c.id = a.clube_id
    `).all();

    const items = [];
    for (const row of parsed.data) {
      const get = (i) => (i >= 0 ? row[fields[i]] : '');
      const csv_class = norm(get(iClass));
      const csv_name = norm(get(iName));
      const csv_club = norm(get(iClub));
      const rank = isNum(get(iRank)) ? Number(get(iRank)) : null;

      const pool = atletas.filter(a => !csv_class || (a.classe || '').toUpperCase() === csv_class.toUpperCase());
      const scored = (pool.length ? pool : atletas)
        .map(a => ({
          a,
          s: similarity(csv_name, a.nome) + (csv_club && a.clube_nome ? similarity(csv_club, a.clube_nome) * 0.2 : 0)
        }))
        .sort((x, y) => y.s - x.s)
        .slice(0, 10);

      const best = scored[0];
      items.push({
        csv_class, csv_name, csv_club, rank,
        best: best ? {
          athlete_id: best.a.id,
          nome: best.a.nome,
          classe: best.a.classe,
          clube: best.a.clube_nome,
          clube_id: best.a.clube_id,
          similarity: Math.round(best.s * 100)
        } : null,
        candidates: scored.map(x => ({
          athlete_id: x.a.id,
          nome: x.a.nome,
          classe: x.a.classe,
          clube: x.a.clube_nome,
          clube_id: x.a.clube_id,
          similarity: Math.round(x.s * 100)
        }))
      });
    }

    return res.json({ fields, items });
  } catch (err) {
    console.error('POST /api/results/preview ->', err);
    return res.status(500).json({ error: 'Falha no preview do CSV.' });
  }
});

/* ============================ IMPORTAR LINHAS MAPEADAS ============================ */
router.post('/import-rows', express.json(), (req, res) => {
  try {
    const { competition, rows } = req.body || {};
    if (!competition || !(competition.nome || competition.name)) {
      return res.status(400).json({ error: 'Dados da competição ausentes: nome/name obrigatório.' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Nenhuma linha válida para importar.' });
    }

    ensureCompResultsSchema();

    const cc = getCompetitionColumns();
    const nome = norm(competition.nome || competition.name);
    const local = norm(competition.local || competition.location);
    const ini = parseDate(competition.data_inicio || competition.start_date || competition.start);
    const fim = parseDate(competition.data_fim || competition.end_date || competition.end);
    const metodo = norm(competition.metodo || competition.method);

    const cols = db.prepare(`PRAGMA table_info(competitions)`).all().map(r => r.name);
    const has = (c) => cols.includes(c);

    const fields = [];
    const vals = [];
    fields.push(cc.name); vals.push(nome);
    if (cc.location) { fields.push(cc.location); vals.push(local || null); }
    if (cc.start) { fields.push(cc.start); vals.push(ini); }
    if (cc.end) { fields.push(cc.end); vals.push(fim); }
    if (cc.method) { fields.push(cc.method); vals.push(metodo || null); }
    if (has('created_at')) { fields.push('created_at'); vals.push(new Date().toISOString()); }
    if (has('updated_at')) { fields.push('updated_at'); vals.push(new Date().toISOString()); }

    const q = `INSERT INTO competitions (${fields.map(f => `"${f}"`).join(',')}) VALUES (${fields.map(() => '?').join(',')})`;
    const info = db.prepare(q).run(...vals);
    const competition_id = Number(info.lastInsertRowid);

    // preparar lookup do nome do atleta (para preencher source_name)
    const getAthName = db.prepare(`SELECT nome FROM atletas WHERE id=?`);

    // ✅ inserir SEMPRE preenchendo source_name
    const ins = db.prepare(`
      INSERT INTO comp_results (competition_id, class_code, athlete_id, club_id, rank, source_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const tx = db.transaction((items) => {
      for (const r of items) {
        const aid = r.athlete_id ? Number(r.athlete_id) : null;
        const ath = aid ? getAthName.get(aid) : null;

        // Se não achar nome do atleta, ainda assim não pode ser NULL
        const sourceName = norm(ath?.nome) || 'import';

        ins.run(
          competition_id,
          norm(r.class_code) || null,
          aid,
          r.club_id ? Number(r.club_id) : null,
          isNum(r.rank) ? Number(r.rank) : null,
          sourceName
        );
      }
    });

    tx(rows);

    return res.json({ ok: true, competition_id, imported: rows.length });
  } catch (err) {
    console.error('POST /api/results/import-rows ->', err);
    return res.status(500).json({ error: 'Falha ao importar resultados.' });
  }
});

export default router;
