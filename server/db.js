// server/db.js (ESM)
// Abre SEMPRE o arquivo data/app.sqlite do projeto (sem criar duplicatas em outras pastas)
// Aplica PRAGMAs exigidos pelo projeto.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// 1) Raiz do projeto = pasta acima de `server/`
const projectRoot = path.resolve(__dirname, '..');

// 2) Candidatos “seguros” para o banco (em ordem de preferência)
const candidates = [
  // Caminho oficial (projeto rodando do root)
  path.resolve(projectRoot, 'data', 'app.sqlite'),

  // Caso algum processo mude o CWD para o root do projeto
  path.resolve(process.cwd(), 'data', 'app.sqlite'),
];

// 3) Se o usuário setar APP_DB_PATH no ambiente, priorize
if (process.env.APP_DB_PATH) {
  candidates.unshift(path.resolve(process.env.APP_DB_PATH));
}

function pickExistingFile(paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

let dbPath = pickExistingFile(candidates);

// Se nenhum candidato existir, caia no caminho oficial (criará o arquivo lá)
if (!dbPath) {
  dbPath = candidates[0];
  // Garante que a pasta `data/` exista
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`[db] Using SQLite at: ${dbPath}`);

let db;
try {
  // fileMustExist: true para NÃO criar arquivo em locais errados sem perceber.
  // Se for a primeira vez e você REALMENTE quer criar, comente fileMustExist
  // ou rode uma vez sem a flag e depois volte a ativar.
  db = new Database(dbPath, { fileMustExist: fs.existsSync(dbPath) });
} catch (e) {
  console.error('[db] Failed to open database:', e.message);
  // Tentativa de fallback sem fileMustExist (último recurso)
  db = new Database(dbPath);
}

// PRAGMAs do projeto
try {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  console.log('[db] PRAGMAs applied: foreign_keys=ON, journal_mode=WAL, synchronous=NORMAL');
} catch (e) {
  console.warn('[db] Failed to set PRAGMAs:', e.message);
}

export default db;
