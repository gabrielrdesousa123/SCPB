// server/routes/referees-csv.js (ESM)
// Import/Export CSV de Árbitros — usa db comum (data/app.sqlite) e schema oficial.

import express from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import db from '../db.js';

const router = express.Router();
const upload = multer();

function normalizeStr(s) { return (s || '').toString().trim(); }

function toCSV(rows, fields) {
  return Papa.unparse(
    rows.map(r => {
      const out = {};
      for (const f of fields) out[f] = r[f] ?? '';
      return out;
    }),
    { quotes: true }
  );
}

/**
 * POST /import
 * Aceita arquivo CSV (multipart campo "file") ou JSON { csv }
 * Colunas aceitas (case-insensitive):
 * - nome_completo (ou: nome)
 * - nome_abreviado (ou: apelido)
 * - uf
 * - nivel
 */
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    let csvText = '';

    if (req.file?.buffer) {
      csvText = req.file.buffer.toString('utf8');
    } else if (req.is('application/json') && req.body?.csv) {
      csvText = String(req.body.csv);
    } else {
      return res.status(400).json({ error: 'Envie um arquivo CSV (campo "file") ou JSON { csv }.' });
    }

    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (parsed.errors?.length) {
      return res.status(400).json({ error: 'CSV inválido', details: parsed.errors.slice(0, 5) });
    }

    const rows = parsed.data || [];
    const mapCol = (h) => h ? h.toString().trim().toLowerCase() : '';

    const headers = (parsed.meta.fields || []).map(mapCol);
    const idx = (aliases) => {
      const a = (Array.isArray(aliases) ? aliases : [aliases]).map(mapCol);
      for (let i = 0; i < headers.length; i++) if (a.includes(headers[i])) return i;
      return -1;
    };

    const colNomeCompleto = idx(['nome_completo', 'nome', 'nome completo']);
    const colNomeAbrev    = idx(['nome_abreviado', 'apelido', 'nome abreviado']);
    const colUF           = idx(['uf', 'estado']);
    const colNivel        = idx(['nivel', 'nível', 'level']);

    if (colNomeCompleto === -1) {
      return res.status(400).json({ error: 'CSV precisa ter coluna "nome_completo" (ou "nome").' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO referees (nome_completo, nome_abreviado, uf, nivel)
      VALUES (@nome_completo, @nome_abreviado, @uf, @nivel)
    `);

    const findDupStmt = db.prepare(`
      SELECT id FROM referees
      WHERE lower(trim(nome_completo)) = lower(trim(@nome_completo))
        AND (uf IS @uf OR lower(trim(uf)) = lower(trim(@uf)))
    `);

    let saved = 0, duplicates = 0, errors = 0;

    const trx = db.transaction((items) => {
      for (const r of items) {
        const nome_completo = normalizeStr(colNomeCompleto >= 0 ? r[parsed.meta.fields[colNomeCompleto]] : '');
        if (!nome_completo) { errors++; continue; }

        const nome_abreviado = normalizeStr(colNomeAbrev >= 0 ? r[parsed.meta.fields[colNomeAbrev]] : '');
        const uf = normalizeStr(colUF >= 0 ? r[parsed.meta.fields[colUF]] : '');
        const nivel = normalizeStr(colNivel >= 0 ? r[parsed.meta.fields[colNivel]] : '');

        const dup = findDupStmt.get({ nome_completo, uf });
        if (dup) { duplicates++; continue; }

        insertStmt.run({ nome_completo, nome_abreviado, uf, nivel });
        saved++;
      }
    });

    trx(rows);
    return res.json({ saved, duplicates, errors });
  } catch (err) {
    console.error('Erro /referees/import:', err);
    return res.status(500).json({ error: 'Falha ao importar árbitros.' });
  }
});

/**
 * GET /export.csv
 * Filtros: ?q=, ?uf=, ?nivel=, ?ids=1,2,3
 * CSV com: id,nome_completo,nome_abreviado,uf,nivel
 */
router.get('/export.csv', (req, res) => {
  try {
    const { q, uf, nivel, ids } = req.query;

    const where = [];
    const params = {};
    if (q)    { where.push(`lower(nome_completo) LIKE lower(@q)`); params.q = `%${q}%`; }
    if (uf)   { where.push(`lower(uf) = lower(@uf)`); params.uf = String(uf); }
    if (nivel){ where.push(`lower(nivel) = lower(@nivel)`); params.nivel = String(nivel); }
    if (ids) {
      const list = String(ids).split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(Number.isInteger);
      if (list.length) {
        where.push(`id IN (${list.map(() => '?').join(',')})`);
        // Vamos montar dois statements para lidar com placeholders posicionais
        const base = `SELECT id, nome_completo, nome_abreviado, uf, nivel FROM referees`;
        const sql = base + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ` ORDER BY nome_completo ASC`;
        const stmt = db.prepare(sql);
        const rows = stmt.all(...list);
        const csv = toCSV(rows, ['id', 'nome_completo', 'nome_abreviado', 'uf', 'nivel']);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="referees.csv"');
        return res.status(200).send(csv);
      }
    }

    const sql = `
      SELECT id, nome_completo, nome_abreviado, uf, nivel
      FROM referees
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY nome_completo ASC
    `;
    const rows = db.prepare(sql).all(params);

    const csv = toCSV(rows, ['id', 'nome_completo', 'nome_abreviado', 'uf', 'nivel']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="referees.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    console.error('Erro /referees/export.csv:', err);
    return res.status(500).json({ error: 'Falha ao exportar árbitros.' });
  }
});

export default router;
