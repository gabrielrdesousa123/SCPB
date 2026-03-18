// server/fix-classes-schema.js
// Corrige a tabela [classes] para garantir a coluna match_time e valores consistentes.
// Uso: node server/fix-classes-schema.js

import migrate from './migrate.js';

migrate();
console.log('[fix-classes] OK (migração executada).');

function log(msg) {
  console.log(`[fix-classes] ${msg}`);
}

function hasTable(name) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return !!row;
}

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function mmToStr(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  const mm = Math.trunc(n);
  const mmStr = mm >= 100 ? String(mm) : String(mm).padStart(2, '0');
  return `${mmStr}:00`;
}

function normalizeTime(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Só minutos (ex: "50")
  if (/^\d+$/.test(s)) {
    return mmToStr(Number(s));
  }

  // Formato MM:SS (ex: "50:00")
  const m = s.match(/^(\d{1,3}):([0-5]\d)$/);
  if (m) {
    const mm = Number(m[1]);
    if (!Number.isFinite(mm) || mm < 0) return null;
    const mmStr = mm >= 100 ? String(mm) : String(mm).padStart(2, '0');
    return `${mmStr}:${m[2]}`;
  }

  // Outros formatos são ignorados
  return null;
}

function migrateClasses() {
  log('Iniciando correção de schema de [classes]');

  if (!hasTable('classes')) {
    log('Tabela [classes] não existe; nada a fazer.');
    return;
  }

  // 1) Garante a coluna match_time
  if (!hasColumn('classes', 'match_time')) {
    log('Adicionando coluna match_time (TEXT) em classes');
    db.exec('ALTER TABLE classes ADD COLUMN match_time TEXT');
  } else {
    log('Coluna match_time já existe; mantendo dados atuais');
  }

  // 2) Preenche match_time a partir de tempos JSON ou match_minutes
  const rows = db
    .prepare(
      'SELECT id, tempos, match_minutes, match_time FROM classes'
    )
    .all();

  const update = db.prepare(
    'UPDATE classes SET match_time = ? WHERE id = ?'
  );

  const tx = db.transaction((list) => {
    for (const row of list) {
      // Se já tem valor, não mexe
      if (row.match_time) continue;

      let matchTime = null;

      // Preferência: tempos JSON
      if (row.tempos) {
        try {
          const t = JSON.parse(row.tempos);
          matchTime = normalizeTime(t.match_time ?? t.matchTime);
        } catch {
          // JSON inválido -> ignora
        }
      }

      // Fallback: match_minutes (inteiro)
      if (!matchTime && row.match_minutes != null) {
        matchTime = mmToStr(row.match_minutes);
      }

      if (!matchTime) continue;

      update.run(matchTime, row.id);
    }
  });

  tx(rows);

  log('Correção de [classes] concluída.');
}

// Executa automaticamente se rodar via `node server/fix-classes-schema.js`
migrateClasses();

export default migrateClasses;
