-- migrate-ko-complete.sql
-- Script SQL completo para criar todas as tabelas da estrutura KO/Eliminatória
-- Pode ser executado diretamente no SQLite sem Node.js
-- SEGURO: usa IF NOT EXISTS - não apaga nada!

-- ====================================================================
-- TABELA: entrants
-- Atletas inscritos na competição
-- BIB = número do atleta | SEED = posição no ranking (1=melhor)
-- ====================================================================
CREATE TABLE IF NOT EXISTS entrants (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id   INTEGER NOT NULL,
  athlete_id       INTEGER NOT NULL,
  class_code       TEXT NOT NULL,
  bib              TEXT,              -- número do atleta na competição
  seed             INTEGER,           -- posição no ranking
  created_at       TEXT,
  updated_at       TEXT,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (athlete_id)     REFERENCES atletas(id) ON DELETE CASCADE,
  UNIQUE (competition_id, athlete_id, class_code)
);

CREATE INDEX IF NOT EXISTS idx_entrants_comp_class ON entrants(competition_id, class_code);
CREATE INDEX IF NOT EXISTS idx_entrants_seed       ON entrants(competition_id, class_code, seed);

-- Triggers de timestamp
CREATE TRIGGER IF NOT EXISTS trg_entrants_insert_ts
AFTER INSERT ON entrants
BEGIN
  UPDATE entrants SET
    created_at = COALESCE(NEW.created_at, datetime('now')),
    updated_at = COALESCE(NEW.updated_at, datetime('now'))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_entrants_update_ts
AFTER UPDATE ON entrants
BEGIN
  UPDATE entrants SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ====================================================================
-- TABELA: pools
-- Grupos da fase classificatória (World Boccia A1)
-- Para eliminatória simples, pode não ser usado
-- ====================================================================
CREATE TABLE IF NOT EXISTS pools (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  class_code     TEXT NOT NULL,
  pool_label     TEXT NOT NULL,  -- 'A', 'B', 'C', 'D'
  created_at     TEXT,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  UNIQUE (competition_id, class_code, pool_label)
);

CREATE INDEX IF NOT EXISTS idx_pools_comp_class ON pools(competition_id, class_code);

-- ====================================================================
-- TABELA: pool_entries
-- Atletas em cada pool (World Boccia A1)
-- ====================================================================
CREATE TABLE IF NOT EXISTS pool_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id     INTEGER NOT NULL,
  entrant_id  INTEGER NOT NULL,
  position    INTEGER,           -- posição no pool
  created_at  TEXT,
  FOREIGN KEY (pool_id)    REFERENCES pools(id) ON DELETE CASCADE,
  FOREIGN KEY (entrant_id) REFERENCES entrants(id) ON DELETE CASCADE,
  UNIQUE (pool_id, entrant_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_entries_pool    ON pool_entries(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_entries_entrant ON pool_entries(entrant_id);

-- ====================================================================
-- TABELA: ko_structure
-- Estrutura da chave eliminatória
-- Define slots: QF1, QF2, SF1, SF2, B3, F
-- ====================================================================
CREATE TABLE IF NOT EXISTS ko_structure (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  class_code     TEXT NOT NULL,
  round_name     TEXT NOT NULL,   -- 'R32','R16','R8','QF','SF','B3','F'
  match_number   INTEGER,         -- 1, 2, 3, 4
  slot_label     TEXT,            -- 'QF1', 'SF1', 'F'
  position       INTEGER,         -- para ordenação visual
  feeds_into_id  INTEGER,         -- ID do slot que recebe o vencedor
  created_at     TEXT,
  FOREIGN KEY (competition_id)  REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (feeds_into_id)   REFERENCES ko_structure(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ko_struct_comp_class ON ko_structure(competition_id, class_code);
CREATE INDEX IF NOT EXISTS idx_ko_struct_round      ON ko_structure(competition_id, class_code, round_name);

-- ====================================================================
-- TABELA: ko_entries
-- Entradas em cada slot do KO
-- Cada slot tem 2 entries (position 1 e 2)
-- ====================================================================
CREATE TABLE IF NOT EXISTS ko_entries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ko_structure_id  INTEGER NOT NULL,
  entrant_id       INTEGER,           -- pode ser NULL se TBD ou BYE
  source_type      TEXT,              -- 'DIRECT', 'POOL', 'KO_WINNER', 'BYE'
  source_reference TEXT,              -- 'A1', 'B2', 'QF1_winner'
  position         INTEGER NOT NULL,  -- 1 ou 2 (lado A ou B)
  is_bye           INTEGER DEFAULT 0, -- 1 se for bye
  created_at       TEXT,
  FOREIGN KEY (ko_structure_id) REFERENCES ko_structure(id) ON DELETE CASCADE,
  FOREIGN KEY (entrant_id)      REFERENCES entrants(id) ON DELETE SET NULL,
  UNIQUE (ko_structure_id, position)
);

CREATE INDEX IF NOT EXISTS idx_ko_entries_struct  ON ko_entries(ko_structure_id);
CREATE INDEX IF NOT EXISTS idx_ko_entries_entrant ON ko_entries(entrant_id);

-- ====================================================================
-- TABELA: competition_matches
-- JOGOS OFICIAIS (grupos + eliminatória)
-- TABELA CENTRAL que unifica todos os jogos
-- ====================================================================
CREATE TABLE IF NOT EXISTS competition_matches (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id   INTEGER NOT NULL,
  class_code       TEXT NOT NULL,
  phase            TEXT NOT NULL,      -- 'POOL' ou 'KO'
  round            TEXT,               -- 'QF','SF','F','B3'
  match_code       TEXT,               -- 'QF1', 'SF1', 'F'
  match_order      INTEGER,            -- ordem do jogo
  
  -- Referências
  pool_id          INTEGER,
  ko_structure_id  INTEGER,
  
  -- Participantes
  entrant_a_id     INTEGER,
  entrant_b_id     INTEGER,
  
  -- Resultado
  score_a          INTEGER,
  score_b          INTEGER,
  winner_id        INTEGER,
  status           TEXT DEFAULT 'PENDING', -- 'PENDING','IN_PROGRESS','COMPLETED','CANCELLED'
  
  -- Agenda
  court            INTEGER,
  scheduled_date   TEXT,
  scheduled_time   TEXT,
  duration_minutes INTEGER,
  
  -- Timestamps
  created_at       TEXT,
  updated_at       TEXT,
  
  FOREIGN KEY (competition_id)   REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (pool_id)          REFERENCES pools(id) ON DELETE SET NULL,
  FOREIGN KEY (ko_structure_id)  REFERENCES ko_structure(id) ON DELETE SET NULL,
  FOREIGN KEY (entrant_a_id)     REFERENCES entrants(id) ON DELETE SET NULL,
  FOREIGN KEY (entrant_b_id)     REFERENCES entrants(id) ON DELETE SET NULL,
  FOREIGN KEY (winner_id)        REFERENCES entrants(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_matches_comp_class  ON competition_matches(competition_id, class_code);
CREATE INDEX IF NOT EXISTS idx_matches_phase       ON competition_matches(competition_id, phase);
CREATE INDEX IF NOT EXISTS idx_matches_status      ON competition_matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_schedule    ON competition_matches(scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_matches_court       ON competition_matches(court, scheduled_date);

-- Triggers de timestamp
CREATE TRIGGER IF NOT EXISTS trg_matches_insert_ts
AFTER INSERT ON competition_matches
BEGIN
  UPDATE competition_matches SET
    created_at = COALESCE(NEW.created_at, datetime('now')),
    updated_at = COALESCE(NEW.updated_at, datetime('now'))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_matches_update_ts
AFTER UPDATE ON competition_matches
BEGIN
  UPDATE competition_matches SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ====================================================================
-- TABELA: match_violations
-- Violações durante os jogos
-- ====================================================================
CREATE TABLE IF NOT EXISTS match_violations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id        INTEGER NOT NULL,
  entrant_id      INTEGER NOT NULL,
  violation_type  TEXT NOT NULL,     -- 'YELLOW_CARD', 'RED_CARD', 'TIME'
  end_number      INTEGER,           -- em qual end
  description     TEXT,
  created_at      TEXT,
  FOREIGN KEY (match_id)   REFERENCES competition_matches(id) ON DELETE CASCADE,
  FOREIGN KEY (entrant_id) REFERENCES entrants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_violations_match   ON match_violations(match_id);
CREATE INDEX IF NOT EXISTS idx_violations_entrant ON match_violations(entrant_id);

-- ====================================================================
-- COLUNAS EXTRAS EM COMPETITIONS
-- ====================================================================
-- Nota: SQLite não suporta "ADD COLUMN IF NOT EXISTS" nativamente
-- Estas linhas podem dar erro se as colunas já existirem - é esperado e seguro

-- ALTER TABLE competitions ADD COLUMN num_quadras INTEGER;
-- ALTER TABLE competitions ADD COLUMN hora_inicio TEXT;
-- ALTER TABLE competitions ADD COLUMN hora_fim TEXT;
-- ALTER TABLE competitions ADD COLUMN observacoes TEXT;

-- ====================================================================
-- FIM DA MIGRAÇÃO
-- ====================================================================
