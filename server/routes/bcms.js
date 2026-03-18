// server/routes/bcms.js
// Endpoints BCMS: preview de atletas por critérios (competições), export CSV (atletas/clubes/árbitros),
// dropdown de competições e presets de ranking (crit1..crit3).

import { Router } from 'express';
import db from '../db.js';
import { stringify as csvStringify } from 'csv-stringify/sync';

const router = Router();

/* ========================= helpers ========================= */
function toInt(v, d = null) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function splitIds(s = '') { return String(s || '').split(',').map(x => Number(x.trim())).filter(Boolean); }

// --- Helpers para CSV BCMS:
function genderDigit(g) {
  const x = String(g || '').toUpperCase();
  if (x === 'F') return '1';
  if (x === 'M') return '2';
  return '9'; // reserva (desconhecido)
}
function classDigit(class_code) {
  // BC1, BC2, BC3, BC4 -> 1..4 ; futuro: BC5..BC9 -> 5..9 ; default 9
  const m = String(class_code || '').toUpperCase().match(/^BC(\d)/);
  if (!m) return '9';
  const d = parseInt(m[1], 10);
  if (!Number.isFinite(d) || d < 1) return '9';
  return String(Math.min(d, 9));
}
const pad2 = n => String(n).padStart(2, '0');
const toSexWord = g => (String(g).toUpperCase() === 'M' ? 'MALE' : String(g).toUpperCase() === 'F' ? 'FEMALE' : '');

function csvEsc(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const up = (s) => String(s ?? '').toLocaleUpperCase('pt-BR');

function baseClass(classe_code) {
  const m = String(classe_code || '').toUpperCase().match(/BC(\d)/);
  return m ? `BC${m[1]}` : '';
}

// particulas/sufixos para sobrenome correto
const PARTICLES = new Set(['DA','DE','DO','DAS','DOS','DI','DU','DEL','DELLA','LA','LE','VAN','VON','E','Y'].map(up));
const SUFFIXES  = new Set(['JUNIOR','JÚNIOR','FILHO','NETO','SOBRINHO'].map(up));
function splitName(full) {
  const parts = up(full).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || '', last: '' };

  const outLast = [];
  let i = parts.length - 1;
  outLast.unshift(parts[i]); i--;
  while (i >= 0) {
    const tok = parts[i];
    if (PARTICLES.has(tok)) { outLast.unshift(tok); i--; continue; }
    if (SUFFIXES.has(outLast[outLast.length - 1] || '')) { outLast.unshift(tok); i--; continue; }
    break;
  }
  return { first: parts.slice(0, i + 1).join(' '), last: outLast.join(' ') };
}

/* ========================= /bcms/competitions-dropdown ========================= */
router.get('/competitions-dropdown', (req, res) => {
  try {
    // tenta (id,nome) e fallback (id,name)
    try {
      const rows = db.prepare(`
        SELECT id, nome, COALESCE(data_inicio, data_fim, NULL) AS d
        FROM competitions
        ORDER BY COALESCE(data_inicio, data_fim, id) DESC
      `).all();
      return res.json({ items: rows.map(r => ({ id: r.id, nome: r.nome })) });
    } catch {
      const rows = db.prepare(`
        SELECT id, name, COALESCE(data_inicio, data_fim, NULL) AS d
        FROM competitions
        ORDER BY COALESCE(data_inicio, data_fim, id) DESC
      `).all();
      return res.json({ items: rows.map(r => ({ id: r.id, nome: r.name })) });
    }
  } catch (e) {
    console.error('GET /bcms/competitions-dropdown failed:', e);
    res.status(500).json({ error: 'Falha ao listar competições.' });
  }
});

/* ========================= /bcms/athletes-preview ========================= */
/**
 * Preview de atletas ordenado por até 3 competições (crit1,crit2,crit3)
 * Query:
 *   class_code=BC1F|BC2M ... (obrigatório)
 *   crit1=ID?  crit2=ID?  crit3=ID?
 * Retorna: id, nome, genero, classe_code, clube_id, clube_nome, regiao, c1, c2, c3
 */
router.get('/athletes-preview', (req, res) => {
  try {
    const class_code = String(req.query.class_code || '').toUpperCase().trim();
    if (!/^BC\d[MF]$/.test(class_code)) {
      return res.status(400).json({ error: 'class_code inválido (ex.: BC1F, BC2M).' });
    }

    const crit1 = toInt(req.query.crit1, null);
    const crit2 = toInt(req.query.crit2, null);
    const crit3 = toInt(req.query.crit3, null);

    const joins = [];
    const selectCrits = [];
    const orderParts = [];

    const addCrit = (cid, alias, label) => {
      if (cid) {
        joins.push(`
          LEFT JOIN (
            SELECT athlete_id, MIN(rank) AS r
            FROM comp_results
            WHERE competition_id = ${Number(cid)}
            GROUP BY athlete_id
          ) ${alias} ON ${alias}.athlete_id = a.id
        `);
        selectCrits.push(`${alias}.r AS ${label}`);
        orderParts.push(`(${alias}.r IS NULL)`, `${alias}.r ASC`);
      } else {
        selectCrits.push(`NULL AS ${label}`);
      }
    };

    addCrit(crit1, 'x1', 'c1');
    addCrit(crit2, 'x2', 'c2');
    addCrit(crit3, 'x3', 'c3');

    const sql = `
      SELECT
        a.id, a.nome, a.genero, a.classe_code, a.clube_id,
        c.nome AS clube_nome, c.regiao AS regiao,
        ${selectCrits.join(',\n        ')}
      FROM atletas a
      LEFT JOIN clubes c ON c.id = a.clube_id
      ${joins.join('\n')}
      WHERE a.classe_code = ?
      ORDER BY
        ${orderParts.length ? orderParts.join(', ') + ',' : ''}
        a.nome COLLATE NOCASE ASC
    `;

    const rows = db.prepare(sql).all(class_code);
    res.json({ items: rows });
  } catch (e) {
    console.error('GET /bcms/athletes-preview failed:', e);
    res.status(500).json({ error: 'Falha ao gerar preview de atletas.' });
  }
});

/* ========================= /bcms/athletes.csv (BCMS) ========================= */
// Regras:
// - A ORDEM dos ids na query é a ordem do preview (#) ⇒ define ranking e BIB.
// - O CSV sai **na mesma ordem** (#).
// - class = BC1|BC2|BC3|BC4  (apenas a base)
// - category_code = ex. BC1F / BC2M
// - Nomes em MAIÚSCULAS
router.get('/athletes.csv', (req, res) => {
  try {
    const idsParam = String(req.query.ids || '').trim();
    if (!idsParam) return res.status(400).send('Faltou ids (lista de IDs na ordem do preview).');

    const ids = idsParam.split(',').map(s => Number(s)).filter(Number.isFinite);
    if (!ids.length) return res.status(400).send('Nenhum ID válido.');

    // id -> posição (#) começando em 1
    const posById = new Map(ids.map((id, i) => [id, i + 1]));

    const rows = db.prepare(`
      SELECT
        a.id,
        a.nome,
        UPPER(a.genero) AS genero,
        UPPER(a.classe_code) AS classe_code,
        c.sigla AS clube_sigla
      FROM atletas a
      LEFT JOIN clubes c ON c.id = a.clube_id
      WHERE a.id IN (${ids.map(() => '?').join(',')})
    `).all(...ids);

    const lines = rows.map(r => {
      const pos   = posById.get(r.id) || 99;
      const pos2  = pad2(pos);
      const bib   = `${genderDigit(r.genero)}${classDigit(r.classe_code)}${pos2}`;

      const sideIOC = up(r.clube_sigla || '');
      const clazz   = baseClass(r.classe_code);
      const catCode = clazz && r.genero ? `${clazz}${r.genero}` : '';

      const fullU = up(r.nome);
      const { first, last } = splitName(fullU);

      return {
        pos,
        csv: [
          bib,
          r.id,
          pos2,
          csvEsc(fullU),
          csvEsc(sideIOC),
          csvEsc(sideIOC),
          '',
          '',
          r.id,
          bib,
          csvEsc(first),
          csvEsc(last),
          csvEsc(toSexWord(r.genero)),
          csvEsc(sideIOC),
          '',
          '',
          csvEsc(clazz),
          csvEsc(catCode)
        ].join(',')
      };
    });

    lines.sort((a, b) => a.pos - b.pos);

    const header = [
      'side_bib','side_memebeship_id','ranking','side_name','side_ioc','organization_code',
      'event','organization_email','athlete_membership_id','athlete_bib','first_name','last_name',
      'gender','athlete_ioc','is_cp','assistant','class','category_code'
    ];

    const csvOut = [header.join(','), ...lines.map(l => l.csv)].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bcms-athletes.csv"');
    res.send(csvOut);
  } catch (e) {
    console.error('GET /bcms/athletes.csv failed:', e);
    res.status(500).send('Falha ao gerar CSV (BCMS).');
  }
});

/* ========================= /bcms/clubs.csv ========================= */
router.get('/clubs.csv', (req, res) => {
  try {
    const ids = splitIds(req.query.ids);
    const where = []; const params = [];
    if (ids.length) { where.push(`id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
    const rows = db.prepare(`
      SELECT id, sigla, nome, regiao
      FROM clubes
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY nome COLLATE NOCASE ASC
    `).all(...params);
    const csv = csvStringify(rows, {
      header: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'sigla', header: 'Sigla' },
        { key: 'nome', header: 'Nome' },
        { key: 'regiao', header: 'Região' },
      ]
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clubs-bcms.csv"');
    res.send(csv);
  } catch (e) {
    console.error('GET /bcms/clubs.csv failed:', e);
    res.status(500).json({ error: 'Falha ao exportar clubes.' });
  }
});

/* ========================= /bcms/referees.csv ========================= */
router.get('/referees.csv', (req, res) => {
  try {
    const ids = splitIds(req.query.ids);
    const where = []; const params = [];
    if (ids.length) { where.push(`id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
    const rows = db.prepare(`
      SELECT id, nome_completo, nome_abreviado, uf, nivel
      FROM referees
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY nome_completo COLLATE NOCASE ASC
    `).all(...params);
    const out = rows.map(r => ({
      id: r.id,
      nome: r.nome_completo || r.nome_abreviado || '',
      uf: r.uf || '',
      nivel: r.nivel || '',
    }));
    const csv = csvStringify(out, {
      header: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'nome', header: 'Nome' },
        { key: 'uf', header: 'UF' },
        { key: 'nivel', header: 'Nível' },
      ]
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="referees-bcms.csv"');
    res.send(csv);
  } catch (e) {
    console.error('GET /bcms/referees.csv failed:', e);
    res.status(500).json({ error: 'Falha ao exportar árbitros.' });
  }
});

/* ========================= Presets de Ranking (crit1..3) ========================= */
function ensurePresetTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bcms_rank_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      crit1 INTEGER,
      crit2 INTEGER,
      crit3 INTEGER
    );
  `);
}

router.get('/rank-presets', (req, res) => {
  try {
    ensurePresetTable();
    const items = db.prepare(`SELECT id, name, crit1, crit2, crit3 FROM bcms_rank_presets ORDER BY name COLLATE NOCASE ASC`).all();
    res.json({ items });
  } catch (e) {
    console.error('GET /bcms/rank-presets failed:', e);
    res.status(500).json({ error: 'Falha ao listar presets.' });
  }
});

router.post('/rank-presets', (req, res) => {
  try {
    ensurePresetTable();
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const crit1 = toInt(req.body?.crit1, null);
    const crit2 = toInt(req.body?.crit2, null);
    const crit3 = toInt(req.body?.crit3, null);
    const info = db.prepare(`
      INSERT INTO bcms_rank_presets (name, crit1, crit2, crit3)
      VALUES (?, ?, ?, ?)
    `).run(name, crit1, crit2, crit3);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, crit1, crit2, crit3 });
  } catch (e) {
    console.error('POST /bcms/rank-presets failed:', e);
    res.status(500).json({ error: 'Falha ao criar preset.' });
  }
});

router.put('/rank-presets/:id', (req, res) => {
  try {
    ensurePresetTable();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const cur = db.prepare('SELECT * FROM bcms_rank_presets WHERE id=?').get(id);
    if (!cur) return res.status(404).json({ error: 'Preset não encontrado' });

    const name = String(req.body?.name ?? cur.name).trim();
    const crit1 = (req.body?.crit1 !== undefined) ? toInt(req.body.crit1, null) : cur.crit1;
    const crit2 = (req.body?.crit2 !== undefined) ? toInt(req.body.crit2, null) : cur.crit2;
    const crit3 = (req.body?.crit3 !== undefined) ? toInt(req.body.crit3, null) : cur.crit3;

    db.prepare(`UPDATE bcms_rank_presets SET name=?, crit1=?, crit2=?, crit3=? WHERE id=?`)
      .run(name, crit1, crit2, crit3, id);
    res.json({ id, name, crit1, crit2, crit3 });
  } catch (e) {
    console.error('PUT /bcms/rank-presets/:id failed:', e);
    res.status(500).json({ error: 'Falha ao atualizar preset.' });
  }
});

router.delete('/rank-presets/:id', (req, res) => {
  try {
    ensurePresetTable();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const info = db.prepare('DELETE FROM bcms_rank_presets WHERE id=?').run(id);
    if (!info.changes) return res.status(404).json({ error: 'Preset não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /bcms/rank-presets/:id failed:', e);
    res.status(500).json({ error: 'Falha ao apagar preset.' });
  }
});

export default router;
