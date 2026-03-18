// server/routes/draw.js
import express from 'express';
import db from '../db.js';
import { generatePoolMatches, syncKnockoutStructure } from './competition-matches.js'; 

const router = express.Router();

try {
  const tableInfo = db.prepare("PRAGMA table_info(matches)").all();
  const columns = tableInfo.map(c => c.name);
  if (!columns.includes('score1')) db.prepare(`ALTER TABLE matches ADD COLUMN score1 INTEGER DEFAULT 0`).run();
  if (!columns.includes('score2')) db.prepare(`ALTER TABLE matches ADD COLUMN score2 INTEGER DEFAULT 0`).run();
  if (!columns.includes('match_details')) db.prepare(`ALTER TABLE matches ADD COLUMN match_details TEXT`).run();
  if (!columns.includes('referee_id')) db.prepare(`ALTER TABLE matches ADD COLUMN referee_id INTEGER`).run();
  if (!columns.includes('completed_at')) db.prepare(`ALTER TABLE matches ADD COLUMN completed_at TEXT`).run();
} catch (e) {}

function getBaseMatchNumber(classCode) {
  const code = String(classCode).toUpperCase();
  if (code.includes('BC1F')) return 101; else if (code.includes('BC1M')) return 201; else if (code.includes('BC2F')) return 301; else if (code.includes('BC2M')) return 401; else if (code.includes('BC3F')) return 501; else if (code.includes('BC3M')) return 601; else if (code.includes('BC4F')) return 701; else if (code.includes('BC4M')) return 801; else if (code.includes('TEAM') || code.includes('EQUIPE')) return 900; else return 101; 
}

router.post('/:competitionId/draw/world-boccia', async (req, res) => {
  const { competitionId } = req.params; const { class_code, format, draws } = req.body;
  if (!competitionId || !class_code || !draws) return res.status(400).json({ success: false, error: 'Dados incompletos.' });

  try {
    const cId = Number(competitionId);
    const cCode = String(class_code).trim();

    db.transaction(() => {
      db.prepare(`DELETE FROM matches WHERE competition_id = ? AND class_code = ?`).run(cId, cCode);
      db.prepare(`DELETE FROM pool_entries WHERE pool_id IN (SELECT id FROM pools WHERE competition_id = ? AND class_code = ?)`).run(cId, cCode);
      db.prepare(`DELETE FROM pools WHERE competition_id = ? AND class_code = ?`).run(cId, cCode);

      const checkEntrantStmt = db.prepare(`SELECT id FROM entrants WHERE competition_id = ? AND athlete_id = ? AND class_code = ?`);
      const insertEntrantStmt = db.prepare(`INSERT INTO entrants (competition_id, athlete_id, class_code, bib) VALUES (?, ?, ?, ?)`);
      const updateEntrantStmt = db.prepare(`UPDATE entrants SET bib = ? WHERE id = ?`);
      const insertPoolStmt = db.prepare(`INSERT INTO pools (competition_id, class_code, pool_number, pool_name) VALUES (?, ?, ?, ?)`);
      const insertPoolEntryStmt = db.prepare(`INSERT INTO pool_entries (pool_id, entrant_id, position) VALUES (?, ?, ?)`);
      const insertMatchStmt = db.prepare(`INSERT INTO matches (competition_id, class_code, pool_id, match_type, round_name, match_number, entrant1_id, entrant2_id, status) VALUES (?, ?, ?, 'GROUP', ?, ?, ?, ?, 'SCHEDULED')`);

      let globalMatchCounter = getBaseMatchNumber(cCode);

      draws.forEach((group, gIdx) => {
        const poolInfo = insertPoolStmt.run(cId, cCode, group.id || (gIdx + 1), group.name);
        const poolId = poolInfo.lastInsertRowid;

        const enrichedPlayers = group.players.map((player, pIdx) => {
          let entrantId;
          const existing = checkEntrantStmt.get(cId, player.id, cCode);
          if (existing) { updateEntrantStmt.run(player.bib, existing.id); entrantId = existing.id; } 
          else { entrantId = insertEntrantStmt.run(cId, player.id, cCode, player.bib).lastInsertRowid; }
          const finalPosition = player.position || (pIdx + 1);
          insertPoolEntryStmt.run(poolId, entrantId, finalPosition);
          return { ...player, entrant_id: entrantId, position: finalPosition };
        });

        const groupMatches = generatePoolMatches(cId, cCode, { id: poolId, players: enrichedPlayers }, globalMatchCounter);
        groupMatches.forEach(m => insertMatchStmt.run(cId, cCode, poolId, m.round_name, m.match_number, m.entrant1_id, m.entrant2_id));
        globalMatchCounter += groupMatches.length;
      });
      try { db.prepare(`UPDATE classes SET format = ? WHERE codigo = ?`).run(JSON.stringify(format), cCode); } catch(e){}
    })();

    // GERA A ÁRVORE DO MATA-MATA ASSIM QUE O SORTEIO ACABA
    await syncKnockoutStructure(competitionId, class_code);

    res.json({ success: true, message: 'Sorteio e partidas geradas!' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:competitionId/draw/world-boccia', (req, res) => {
  const { competitionId } = req.params; const { class_code } = req.query;
  try {
    const draws = db.prepare(`
      SELECT p.id AS group_id, p.pool_name AS group_name, e.athlete_id, a.nome, e.bib, pe.position, c.nome AS clube_nome, c.sigla AS clube_sigla
      FROM pools p JOIN pool_entries pe ON p.id = pe.pool_id JOIN entrants e ON pe.entrant_id = e.id JOIN atletas a ON e.athlete_id = a.id LEFT JOIN clubes c ON a.clube_id = c.id
      WHERE p.competition_id = ? AND p.class_code = ? ORDER BY p.pool_number, CAST(e.bib AS INTEGER) ASC
    `).all(Number(competitionId), String(class_code).trim());

    if (draws.length === 0) return res.json({ success: true, data: [] });
    const grouped = draws.reduce((acc, row) => {
      if (!acc[row.group_id]) acc[row.group_id] = { id: row.group_id, name: row.group_name, players: [] };
      acc[row.group_id].players.push({ id: row.athlete_id, nome: row.nome, bib: row.bib, position: row.position, clube_nome: row.clube_nome, clube_sigla: row.clube_sigla });
      return acc;
    }, {});
    res.json({ success: true, data: Object.values(grouped) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:competitionId/matches/group', (req, res) => {
  const { competitionId } = req.params; const { class_code } = req.query;
  try {
    const matches = db.prepare(`
      SELECT 
        m.*, p.pool_name,
        e1.athlete_id as entrant1_athlete_id, e1.bib as entrant1_bib, a1.nome as entrant1_name, c1.nome as entrant1_club_nome, c1.sigla as entrant1_club_sigla,
        e2.athlete_id as entrant2_athlete_id, e2.bib as entrant2_bib, a2.nome as entrant2_name, c2.nome as entrant2_club_nome, c2.sigla as entrant2_club_sigla
      FROM matches m
      JOIN pools p ON m.pool_id = p.id
      LEFT JOIN entrants e1 ON m.entrant1_id = e1.id
      LEFT JOIN atletas a1 ON e1.athlete_id = a1.id
      LEFT JOIN clubes c1 ON a1.clube_id = c1.id
      LEFT JOIN entrants e2 ON m.entrant2_id = e2.id
      LEFT JOIN atletas a2 ON e2.athlete_id = a2.id
      LEFT JOIN clubes c2 ON a2.clube_id = c2.id
      WHERE m.competition_id = ? AND m.class_code = ? AND m.match_type = 'GROUP'
      ORDER BY p.pool_number, m.match_number
    `).all(Number(competitionId), String(class_code).trim());

    const grouped = {};
    matches.forEach(m => {
      if (!grouped[m.pool_id]) grouped[m.pool_id] = { pool_id: m.pool_id, pool_name: m.pool_name, rounds: {} };
      if (!grouped[m.pool_id].rounds[m.round_name]) grouped[m.pool_id].rounds[m.round_name] = [];
      if (m.match_details) { try { m.details = JSON.parse(m.match_details); } catch(e) { m.details = {}; } }
      else { m.details = {}; }
      grouped[m.pool_id].rounds[m.round_name].push(m);
    });

    res.json({ success: true, data: { matches: Object.values(grouped) } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:competitionId/matches/ko', (req, res) => {
  const { competitionId } = req.params; const { class_code } = req.query;
  try {
    const groupMatches = db.prepare(`SELECT status FROM matches WHERE competition_id = ? AND class_code = ? AND match_type = 'GROUP'`).all(Number(competitionId), String(class_code).trim());
    const isGroupFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'COMPLETED');

    const matches = db.prepare(`
      SELECT 
        m.*, 
        e1.athlete_id as entrant_a_athlete_id, 
        e1.bib as entrant_a_bib, 
        a1.nome as entrant_a_name_real, 
        m.entrant1_name as entrant_a_rule,
        c1.nome as entrant_a_club_nome, c1.sigla as entrant_a_club_sigla,
        
        e2.athlete_id as entrant_b_athlete_id, 
        e2.bib as entrant_b_bib, 
        a2.nome as entrant_b_name_real, 
        m.entrant2_name as entrant_b_rule,
        c2.nome as entrant_b_club_nome, c2.sigla as entrant_b_club_sigla
      FROM matches m
      LEFT JOIN entrants e1 ON m.entrant1_id = e1.id
      LEFT JOIN atletas a1 ON e1.athlete_id = a1.id
      LEFT JOIN clubes c1 ON a1.clube_id = c1.id
      LEFT JOIN entrants e2 ON m.entrant2_id = e2.id
      LEFT JOIN atletas a2 ON e2.athlete_id = a2.id
      LEFT JOIN clubes c2 ON a2.clube_id = c2.id
      WHERE m.competition_id = ? AND m.class_code = ? AND (m.match_type = 'KO' OR m.match_type = 'KNOCKOUT')
      ORDER BY m.match_number
    `).all(Number(competitionId), String(class_code).trim());
    
    const mapped = matches.map(m => {
      let details = {}; if (m.match_details) { try { details = JSON.parse(m.match_details); } catch(e) {} }
      
      let p1Name = isGroupFinished && m.entrant_a_name_real ? m.entrant_a_name_real : (m.entrant_a_rule || 'A Definir');
      let p2Name = isGroupFinished && m.entrant_b_name_real ? m.entrant_b_name_real : (m.entrant_b_rule || 'A Definir');
      
      if (m.status === 'SCHEDULED_WITH_BYE' || !m.entrant2_name) {
          p2Name = 'BYE';
      }

      if (!isGroupFinished) {
          m.entrant1_id = null; m.entrant_a_athlete_id = null; m.entrant_a_bib = '-'; m.entrant_a_club_sigla = null;
          m.entrant2_id = null; m.entrant_b_athlete_id = null; m.entrant_b_bib = '-'; m.entrant_b_club_sigla = null;
      }

      return { 
          ...m, 
          details, 
          round: m.round_name, 
          score_a: m.score1, 
          score_b: m.score2, 
          winner_id: m.winner_entrant_id, 
          match_order: m.match_number, 
          entrant_a_id: m.entrant1_id, 
          entrant_b_id: m.entrant2_id,
          entrant_a_name: p1Name, 
          entrant_b_name: p2Name  
      };
    });
    res.json({ success: true, data: mapped });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/:competitionId/matches/:matchId/score', async (req, res) => {
  const { competitionId, matchId } = req.params;
  const { score1, score2, winner_entrant_id, status, details, referee_id } = req.body; 
  
  try {
    let query = `
      UPDATE matches 
      SET score1 = ?, score2 = ?, winner_entrant_id = ?, status = ?, match_details = ?, referee_id = ?
    `;
    let params = [score1, score2, winner_entrant_id, status, JSON.stringify(details || {}), referee_id || null];

    if (status === 'COMPLETED') {
        query += `, completed_at = DATETIME('now', 'localtime')`;
    }

    query += ` WHERE id = ? AND competition_id = ?`;
    params.push(Number(matchId), Number(competitionId));

    db.prepare(query).run(...params);
    
    // (A sua lógica de syncKnockoutStructure continua aqui, se existir)

    res.json({ success: true, message: 'Placar gravado!' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:competitionId/draw/world-boccia/summary', (req, res) => {
  const { competitionId } = req.params; const { class_code } = req.query;
  try {
    const cId = Number(competitionId), cCode = String(class_code).trim();
    
    const gCount = db.prepare(`SELECT COUNT(*) AS count FROM pools WHERE competition_id = ? AND class_code = ?`).get(cId, cCode).count;
    const aCount = db.prepare(`SELECT COUNT(*) AS count FROM pool_entries pe JOIN pools p ON pe.pool_id = p.id WHERE p.competition_id = ? AND p.class_code = ?`).get(cId, cCode).count;
    
    // Busca TODAS as partidas que possuem numeração válida
    const matches = db.prepare(`SELECT status, match_type FROM matches WHERE competition_id = ? AND class_code = ? AND match_number IS NOT NULL`).all(cId, cCode);
    
    const totalMatches = matches.length;
    const completedMatches = matches.filter(m => m.status === 'COMPLETED').length;
    
    let statusAtual = "Sorteio Pendente";
    
    if (totalMatches > 0) {
        const groupMatches = matches.filter(m => m.match_type === 'GROUP');
        const groupCompleted = groupMatches.filter(m => m.status === 'COMPLETED').length;
        
        if (completedMatches === totalMatches) {
            statusAtual = "Finalizado";
        } else if (groupMatches.length > 0 && groupCompleted === groupMatches.length) {
            statusAtual = "Mata-Mata";
        } else {
            statusAtual = "Fase de Grupos";
        }
    }

    res.json({ 
      success: true, 
      data: { 
        groups_count: gCount, 
        total_athletes: aCount, 
        total_matches: totalMatches, 
        completed_matches: completedMatches, 
        status_atual: statusAtual 
      } 
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/:competitionId/draw/world-boccia', (req, res) => {
  const { competitionId } = req.params; const { class_code } = req.query;
  try {
    db.transaction(() => {
      db.prepare(`DELETE FROM matches WHERE competition_id = ? AND class_code = ?`).run(competitionId, class_code);
      db.prepare(`DELETE FROM pool_entries WHERE pool_id IN (SELECT id FROM pools WHERE competition_id = ? AND class_code = ?)`).run(competitionId, class_code);
      db.prepare(`DELETE FROM pools WHERE competition_id = ? AND class_code = ?`).run(competitionId, class_code);
    })();
    res.json({ success: true, message: 'Sorteio eliminado.' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;