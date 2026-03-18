// server/routes/classes.js
// Rotas de Classes
// - lista para tela principal
// - lista para dropdown (atletas, CSV, etc.)
// - cria/edita/apaga classes
// - suporta tempo de partida, tempo por parcial e nº de parciais

import { Router } from 'express';
import db from '../db.js';

const router = Router();

function sendErr(res, msg, status = 500) {
  console.error('[classes]', msg);
  return res.status(status).json({ error: msg });
}

/* ============ Utils ============ */

// Normaliza "MM:SS" sem ser chato demais.
// Se vier "20" -> trata como 20 segundos (mas no front nós já mandamos match_time como "MM:00").
function normalizeTime(str) {
  if (str == null) return null;
  const raw = String(str).trim();
  if (!raw) return null;

  // Só dígitos => segundos
  if (/^\d+$/.test(raw)) {
    let total = parseInt(raw, 10);
    if (!Number.isFinite(total) || total < 0) return null;
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  // MM:SS ou M:SS
  const parts = raw.split(':');
  if (parts.length === 2) {
    let [m, s] = parts;
    m = m.trim();
    s = s.trim();
    if (!/^\d+$/.test(m) || !/^\d+$/.test(s)) return null;
    const mm = parseInt(m, 10);
    const ss = parseInt(s, 10);
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || mm < 0 || ss < 0) return null;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  return raw;
}

function intOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseTemposJson(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Monta o objeto enviado ao frontend principal:
 * { codigo, nome, ui_bg, ui_fg, match_time, turn_time, ends, tempos }
 */
function mapRow(row) {
  const tempos = parseTemposJson(row.tempos);

  const match_time = row.match_time || tempos?.match_time || null;
  const turn_time = row.turn_time || tempos?.turn_time || null;
  const ends = row.ends ?? tempos?.ends ?? null;

  return {
    codigo: row.codigo,
    nome: row.nome,
    ui_bg: row.ui_bg || null,
    ui_fg: row.ui_fg || null,
    match_time,
    turn_time,
    ends,
    tempos: tempos || null,
  };
}

function loadByCodigo(codigo) {
  return db.prepare('SELECT * FROM classes WHERE codigo = ?').get(codigo);
}

/* ============ LISTAGEM COMPLETA ============ */

router.get('/', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `
        SELECT codigo, nome, ui_bg, ui_fg, match_time, turn_time, ends, tempos
          FROM classes
         ORDER BY codigo COLLATE NOCASE
        `
      )
      .all();

    res.json({
      total: rows.length,
      items: rows.map(mapRow),
    });
  } catch (e) {
    sendErr(res, `Erro ao listar classes: ${e.message}`);
  }
});

/* ============ LISTA PARA DROPDOWN ============ */
// Usada em atletas.js, csv.js, atletas-bcms.js, etc.
// GET /api/classes/dropdown
// -> { items: [ { code, name, ui_bg, ui_fg }, ... ] } <-- AGORA INCLUI CORES

router.get('/dropdown', (_req, res) => {
  try {
    const items = db
      .prepare(
        `SELECT codigo as code, nome as name, ui_bg, ui_fg
           FROM classes
       ORDER BY codigo`
      )
      .all();
    res.json({ items });
  } catch (e) {
    sendErr(res, `Erro no dropdown: ${e.message}`);
  }
});
/* ============ CRIAR / ATUALIZAR ============ */

router.post('/', (req, res) => {
  try {
    let {
      codigo,
      nome,
      ui_bg,
      ui_fg,

      // tempo de partida
      match_time,
      matchTime,
      tempo_partida,
      tempoPartida,

      // tempo por parcial/jogada
      turn_time,
      turnTime,
      tempo_parcial,
      tempoParcial,
      tempo_jogada,
      tempoJogada,

      // nº de parciais
      ends,
      parciais,
      num_parciais,
    } = req.body || {};

    if (!codigo || !nome) {
      return sendErr(res, 'Campos obrigatórios: codigo e nome.', 400);
    }

    codigo = String(codigo).trim();
    nome = String(nome).trim();
    ui_bg = ui_bg ? String(ui_bg).trim() : null;
    ui_fg = ui_fg ? String(ui_fg).trim() : null;

    const matchRaw =
      match_time ??
      matchTime ??
      tempo_partida ??
      tempoPartida ??
      null;

    const turnRaw =
      turn_time ??
      turnTime ??
      tempo_parcial ??
      tempoParcial ??
      tempo_jogada ??
      tempoJogada ??
      null;

    const endsRaw = ends ?? parciais ?? num_parciais ?? null;

    const normMatch = matchRaw ? normalizeTime(matchRaw) : null;
    const normTurn = turnRaw ? normalizeTime(turnRaw) : null;
    const endsInt = intOrNull(endsRaw);

    const temposJson = JSON.stringify({
      match_time: normMatch,
      turn_time: normTurn,
      ends: endsInt,
    });

    const existing = loadByCodigo(codigo);

    const data = {
      codigo,
      nome,
      ui_bg,
      ui_fg,
      match_time: normMatch,
      turn_time: normTurn,
      ends: endsInt,
      tempos: temposJson,
    };

    if (!existing) {
      db.prepare(
        `
        INSERT INTO classes (codigo, nome, ui_bg, ui_fg, match_time, turn_time, ends, tempos)
        VALUES (@codigo, @nome, @ui_bg, @ui_fg, @match_time, @turn_time, @ends, @tempos)
        `
      ).run(data);
    } else {
      db.prepare(
        `
        UPDATE classes
           SET nome        = @nome,
               ui_bg       = @ui_bg,
               ui_fg       = @ui_fg,
               match_time  = @match_time,
               turn_time   = @turn_time,
               ends        = @ends,
               tempos      = @tempos
         WHERE codigo      = @codigo
        `
      ).run(data);
    }

    const updated = loadByCodigo(codigo);
    res.json({ ok: true, item: mapRow(updated) });
  } catch (e) {
    sendErr(res, `Erro ao salvar classe: ${e.message}`);
  }
});

/* ============ APAGAR ============ */

router.delete('/:codigo', (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim();
    if (!codigo) return sendErr(res, 'Código inválido.', 400);

    db.prepare('DELETE FROM classes WHERE codigo = ?').run(codigo);
    res.json({ ok: true });
  } catch (e) {
    sendErr(res, `Erro ao excluir classe: ${e.message}`);
  }
});

export default router;
