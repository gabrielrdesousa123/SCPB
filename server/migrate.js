// server/migrate.js
import db from './db.js';

function log(message) {
  console.log(`[MIGRATE] ${message}`);
}

function hasColumn(tableName, columnName) {
  const info = db.prepare(`PRAGMA table_info(${tableName});`).all();
  return info.some(col => col.name === columnName);
}

export default function migrate() {
  log('Iniciando migração do schema do banco de dados...');

  // ===== CLASSES =====
  log('Garantindo tabela [classes]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo     TEXT UNIQUE NOT NULL,
      name       TEXT,
      ui_bg      TEXT,
      ui_fg      TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_classes_codigo ON classes(codigo);`);

  // ===== ATLETAS =====
  log('Garantindo tabela [atletas]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS atletas (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      nome           TEXT NOT NULL,
      genero         TEXT,
      data_nascimento TEXT,
      cpf            TEXT UNIQUE,
      rg             TEXT,
      email          TEXT,
      telefone       TEXT,
      classe_code    TEXT,
      c1             INTEGER,
      c2             INTEGER,
      c3             INTEGER,
      created_at     TEXT,
      updated_at     TEXT,
      FOREIGN KEY (classe_code) REFERENCES classes(codigo) ON DELETE SET NULL
    );
  `);
  if (!hasColumn('atletas', 'created_at')) db.exec(`ALTER TABLE atletas ADD COLUMN created_at TEXT;`);
  if (!hasColumn('atletas', 'updated_at')) db.exec(`ALTER TABLE atletas ADD COLUMN updated_at TEXT;`);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_atletas_nome ON atletas(nome);
    CREATE INDEX IF NOT EXISTS idx_atletas_classe ON atletas(classe_code);
  `);

  // ===== CLUBES =====
  log('Garantindo tabela [clubes]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS clubes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nome       TEXT NOT NULL,
      sigla      TEXT UNIQUE NOT NULL,
      cidade     TEXT,
      uf         TEXT,
      logo_url   TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  if (!hasColumn('clubes', 'created_at')) db.exec(`ALTER TABLE clubes ADD COLUMN created_at TEXT;`);
  if (!hasColumn('clubes', 'updated_at')) db.exec(`ALTER TABLE clubes ADD COLUMN updated_at TEXT;`);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_clubes_nome ON clubes(nome);
    CREATE INDEX IF NOT EXISTS idx_clubes_sigla ON clubes(sigla);
  `);

  // ===== ATHLETE_CLUBS =====
  log('Garantindo tabela [athlete_clubs]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS athlete_clubs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL,
      clube_id   INTEGER NOT NULL,
      is_active  INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (athlete_id) REFERENCES atletas(id) ON DELETE CASCADE,
      FOREIGN KEY (clube_id) REFERENCES clubes(id) ON DELETE CASCADE,
      UNIQUE(athlete_id, clube_id)
    );
  `);

  // ===== REFEREES =====
  log('Garantindo tabela [referees]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS referees (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      nome_completo  TEXT,
      nome_abreviado TEXT,
      uf             TEXT,
      nivel          TEXT
    );
  `);

  // ===== COMPETITIONS =====
  log('Garantindo tabela [competitions]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT,
      local       TEXT,
      data_inicio TEXT,
      data_fim    TEXT,
      metodo      TEXT,
      created_at  TEXT,
      status      TEXT NOT NULL DEFAULT 'DRAFT'
    );
  `);
  if (!hasColumn('competitions', 'status')) {
    db.exec(`ALTER TABLE competitions ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT';`);
  }

  // ===== COMPETITION_OFFICIALS =====
  log('Garantindo tabela [competition_officials]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS competition_officials (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      referee_id     INTEGER NOT NULL,
      role           TEXT NOT NULL,
      created_at     TEXT,
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (referee_id)     REFERENCES referees(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_off_unique ON competition_officials(competition_id, role, referee_id);`);

  // ===== TIME SLOTS (NOVO: Para Câmara de Chamada e Descanso) =====
  log('Garantindo tabela [competition_time_slots]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS competition_time_slots (
      competition_id INTEGER NOT NULL,
      match_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      call_room_ids TEXT DEFAULT '[]',
      rest_ids TEXT DEFAULT '[]',
      PRIMARY KEY (competition_id, match_date, start_time),
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
    );
  `);

  // ===== ENTRANTS & POOLS (MÓDULO DE SORTEIO) =====
  log('Garantindo tabelas de Sorteio (entrants, pools, ko_structure)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS entrants (
      id INTEGER PRIMARY KEY AUTOINCREMENT, competition_id INTEGER NOT NULL, athlete_id INTEGER NOT NULL, class_code TEXT NOT NULL, bib TEXT, seed INTEGER, created_at TEXT,
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE, FOREIGN KEY (athlete_id) REFERENCES atletas(id) ON DELETE CASCADE, UNIQUE(competition_id, athlete_id, class_code)
    );
    CREATE TABLE IF NOT EXISTS pools (
      id INTEGER PRIMARY KEY AUTOINCREMENT, competition_id INTEGER NOT NULL, class_code TEXT NOT NULL, pool_number INTEGER NOT NULL, pool_name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE, UNIQUE(competition_id, class_code, pool_number)
    );
    CREATE TABLE IF NOT EXISTS pool_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pool_id INTEGER NOT NULL, entrant_id INTEGER NOT NULL, position INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE, FOREIGN KEY (entrant_id) REFERENCES entrants(id) ON DELETE CASCADE, UNIQUE(pool_id, position)
    );
    CREATE TABLE IF NOT EXISTS ko_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT, competition_id INTEGER NOT NULL, class_code TEXT NOT NULL, round_name TEXT NOT NULL, match_number INTEGER NOT NULL, slot_label TEXT NOT NULL, position INTEGER NOT NULL, feeds_into_id INTEGER, created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE, FOREIGN KEY (feeds_into_id) REFERENCES ko_structure(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS ko_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ko_structure_id INTEGER NOT NULL, entrant_id INTEGER, source_type TEXT, source_reference TEXT, position INTEGER NOT NULL, is_bye INTEGER DEFAULT 0 CHECK (is_bye IN (0,1)), created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (ko_structure_id) REFERENCES ko_structure(id) ON DELETE CASCADE, FOREIGN KEY (entrant_id) REFERENCES entrants(id) ON DELETE SET NULL
    );
  `);

  // ==========================================================================
  // ✅ PARTIDAS (MATCHES - FASE DE GRUPOS) - INCLUINDO COLUNAS DE AGENDA/ÁRBITRO
  // ==========================================================================
  log('Garantindo tabela [matches] (partidas de grupo)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      class_code TEXT NOT NULL,
      pool_id INTEGER,
      match_type TEXT NOT NULL,
      round_name TEXT,
      match_number INTEGER,
      entrant1_id INTEGER,
      entrant2_id INTEGER,
      status TEXT DEFAULT 'SCHEDULED',
      court INTEGER,
      match_date TEXT,
      start_time TEXT,
      score1 INTEGER,
      score2 INTEGER,
      winner_entrant_id INTEGER,
      loser_entrant_id INTEGER,
      referee_principal_id INTEGER,
      referee_linha_id INTEGER,
      referee_mesa_id INTEGER,
      referee_shadow_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE,
      FOREIGN KEY (entrant1_id) REFERENCES entrants(id) ON DELETE SET NULL,
      FOREIGN KEY (entrant2_id) REFERENCES entrants(id) ON DELETE SET NULL
    );
  `);
  // Garantia de atualização se a tabela já existir (sem quebrar o banco atual)
  if (!hasColumn('matches', 'court')) db.exec(`ALTER TABLE matches ADD COLUMN court INTEGER;`);
  if (!hasColumn('matches', 'match_date')) db.exec(`ALTER TABLE matches ADD COLUMN match_date TEXT;`);
  if (!hasColumn('matches', 'start_time')) db.exec(`ALTER TABLE matches ADD COLUMN start_time TEXT;`);
  if (!hasColumn('matches', 'referee_principal_id')) db.exec(`ALTER TABLE matches ADD COLUMN referee_principal_id INTEGER;`);
  if (!hasColumn('matches', 'referee_linha_id')) db.exec(`ALTER TABLE matches ADD COLUMN referee_linha_id INTEGER;`);
  if (!hasColumn('matches', 'referee_mesa_id')) db.exec(`ALTER TABLE matches ADD COLUMN referee_mesa_id INTEGER;`);
  if (!hasColumn('matches', 'referee_shadow_id')) db.exec(`ALTER TABLE matches ADD COLUMN referee_shadow_id INTEGER;`);

  // ==========================================================================
  // ✅ PARTIDAS (COMPETITION_MATCHES - MATA-MATA) - INCLUINDO COLUNAS
  // ==========================================================================
  log('Garantindo tabela [competition_matches] (partidas eliminatórias)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS competition_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      class_code TEXT NOT NULL,
      phase TEXT NOT NULL,
      round TEXT NOT NULL,
      match_code TEXT NOT NULL,
      match_order INTEGER NOT NULL,
      ko_structure_id INTEGER,
      entrant_a_id INTEGER,
      entrant_b_id INTEGER,
      score_a INTEGER,
      score_b INTEGER,
      winner_id INTEGER,
      loser_id INTEGER,
      status TEXT DEFAULT 'SCHEDULED',
      court INTEGER,
      match_date TEXT,
      start_time TEXT,
      referee_principal_id INTEGER,
      referee_linha_id INTEGER,
      referee_mesa_id INTEGER,
      referee_shadow_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (ko_structure_id) REFERENCES ko_structure(id) ON DELETE SET NULL,
      FOREIGN KEY (entrant_a_id) REFERENCES entrants(id) ON DELETE SET NULL,
      FOREIGN KEY (entrant_b_id) REFERENCES entrants(id) ON DELETE SET NULL
    );
  `);
  // Garantia de atualização se a tabela já existir
  if (!hasColumn('competition_matches', 'court')) db.exec(`ALTER TABLE competition_matches ADD COLUMN court INTEGER;`);
  if (!hasColumn('competition_matches', 'match_date')) db.exec(`ALTER TABLE competition_matches ADD COLUMN match_date TEXT;`);
  if (!hasColumn('competition_matches', 'start_time')) db.exec(`ALTER TABLE competition_matches ADD COLUMN start_time TEXT;`);
  if (!hasColumn('competition_matches', 'referee_principal_id')) db.exec(`ALTER TABLE competition_matches ADD COLUMN referee_principal_id INTEGER;`);
  if (!hasColumn('competition_matches', 'referee_linha_id')) db.exec(`ALTER TABLE competition_matches ADD COLUMN referee_linha_id INTEGER;`);
  if (!hasColumn('competition_matches', 'referee_mesa_id')) db.exec(`ALTER TABLE competition_matches ADD COLUMN referee_mesa_id INTEGER;`);
  if (!hasColumn('competition_matches', 'referee_shadow_id')) db.exec(`ALTER TABLE competition_matches ADD COLUMN referee_shadow_id INTEGER;`);


  // ===== VIOLAÇÕES =====
  log('Garantindo tabela [match_violations]');
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      entrant_id INTEGER NOT NULL,
      violation_type TEXT NOT NULL,
      end_number INTEGER,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (entrant_id) REFERENCES entrants(id) ON DELETE CASCADE
    );
  `);

  log('Migração do schema concluída com sucesso. Banco perfeitamente alinhado com o Frontend!');
}