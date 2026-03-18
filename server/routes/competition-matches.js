// server/routes/competition-matches.js
import express from 'express';
import db from '../db.js';

const router = express.Router({ mergeParams: true });

function getBackendPoolRanking(poolId, poolMatches) {
  const stats = {};
  
  const players = db.prepare(`
    SELECT e.id as entrant_id, e.athlete_id, a.nome, e.bib 
    FROM pool_entries pe 
    JOIN entrants e ON pe.entrant_id = e.id 
    JOIN atletas a ON e.athlete_id = a.id
    WHERE pe.pool_id = ?
  `).all(poolId);

  players.forEach(p => {
    stats[p.entrant_id] = { ...p, wins: 0, pointsDiff: 0, pointsFor: 0, endsWon: 0, vsRecord: {} };
  });

  poolMatches.forEach(m => {
    if (m.status === 'COMPLETED' && m.pool_id === poolId) {
      const s1 = Number(m.score1) || 0;
      const s2 = Number(m.score2) || 0;
      const wId = m.winner_entrant_id;

      let p1Ends = 0, p2Ends = 0;
      let details = {};
      try { details = JSON.parse(m.match_details || '{}'); } catch(e) {}
      
      if (details && Array.isArray(details.p1_partials) && Array.isArray(details.p2_partials)) {
        for (let i = 0; i < 4; i++) {
          const val1 = details.p1_partials[i]; const val2 = details.p2_partials[i];
          if ((val1 !== null && val1 !== undefined && val1 !== '') || (val2 !== null && val2 !== undefined && val2 !== '')) {
            const e1 = Number(val1) || 0; const e2 = Number(val2) || 0;
            if (e1 > e2) p1Ends++; else if (e2 > e1) p2Ends++;
          }
        }
      }

      if (stats[m.entrant1_id]) {
        stats[m.entrant1_id].pointsFor += s1;
        stats[m.entrant1_id].pointsDiff += (s1 - s2);
        stats[m.entrant1_id].endsWon += p1Ends;
        if (String(wId) === String(m.entrant1_id)) stats[m.entrant1_id].wins++;
        stats[m.entrant1_id].vsRecord[m.entrant2_id] = (String(wId) === String(m.entrant1_id));
      }
      if (stats[m.entrant2_id]) {
        stats[m.entrant2_id].pointsFor += s2;
        stats[m.entrant2_id].pointsDiff += (s2 - s1);
        stats[m.entrant2_id].endsWon += p2Ends;
        if (String(wId) === String(m.entrant2_id)) stats[m.entrant2_id].wins++;
        stats[m.entrant2_id].vsRecord[m.entrant1_id] = (String(wId) === String(m.entrant2_id));
      }
    }
  });

  return Object.values(stats).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.vsRecord[b.entrant_id]) return -1;
    if (b.vsRecord[a.entrant_id]) return 1;
    if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
    if (b.endsWon !== a.endsWon) return b.endsWon - a.endsWon;
    return b.pointsFor - a.pointsFor;
  });
}

export function generatePoolMatches(competitionId, classCode, pool, startMatchNumber = 1) {
  const players = [...pool.players].sort((a, b) => a.position - b.position);
  const matches = [];
  let matchNumber = startMatchNumber;

  const addMatch = (roundName, p1Idx, p2Idx) => {
    const isBye = p2Idx === null || !players[p2Idx];
    matches.push({
      round_name: roundName,
      match_number: isBye ? null : matchNumber++,
      entrant1_id: players[p1Idx] ? players[p1Idx].entrant_id : null,
      entrant2_id: !isBye ? players[p2Idx].entrant_id : null
    });
  };

  const n = players.length;
  if (n === 2) { addMatch('Round 1', 0, 1); addMatch('Round 2', 0, 1); }
  else if (n === 3) {
    addMatch('Round 1', 0, 2); addMatch('Round 1', 1, null);
    addMatch('Round 2', 1, 2); addMatch('Round 2', 0, null);
    addMatch('Round 3', 0, 1); addMatch('Round 3', 2, null);
  } else if (n === 4) {
    addMatch('Round 1', 0, 3); addMatch('Round 1', 1, 2);
    addMatch('Round 2', 0, 2); addMatch('Round 2', 1, 3);
    addMatch('Round 3', 0, 1); addMatch('Round 3', 2, 3);
  } else if (n === 5) {
    addMatch('Round 1', 0, 4); addMatch('Round 1', 1, 3); addMatch('Round 1', 2, null);
    addMatch('Round 2', 0, 3); addMatch('Round 2', 2, 4); addMatch('Round 2', 1, null);
    addMatch('Round 3', 0, 2); addMatch('Round 3', 1, 4); addMatch('Round 3', 3, null);
    addMatch('Round 4', 1, 2); addMatch('Round 4', 3, 4); addMatch('Round 4', 0, null);
    addMatch('Round 5', 0, 1); addMatch('Round 5', 2, 3); addMatch('Round 5', 4, null);
  } else if (n === 6) {
    addMatch('Round 1', 0, 5); addMatch('Round 1', 1, 3); addMatch('Round 1', 2, 4);
    addMatch('Round 2', 0, 4); addMatch('Round 2', 1, 2); addMatch('Round 2', 3, 5);
    addMatch('Round 3', 0, 3); addMatch('Round 3', 1, 4); addMatch('Round 3', 2, 5);
    addMatch('Round 4', 0, 2); addMatch('Round 4', 1, 5); addMatch('Round 4', 3, 4);
    addMatch('Round 5', 0, 1); addMatch('Round 5', 2, 3); addMatch('Round 5', 4, 5);
  } else if (n === 7) {
    addMatch('Round 1', 0, 6); addMatch('Round 1', 1, 5); addMatch('Round 1', 2, 4); addMatch('Round 1', 3, null);
    addMatch('Round 2', 0, 5); addMatch('Round 2', 1, 4); addMatch('Round 2', 2, 3); addMatch('Round 2', 6, null);
    addMatch('Round 3', 5, 6); addMatch('Round 3', 0, 4); addMatch('Round 3', 1, 3); addMatch('Round 3', 2, null);
    addMatch('Round 4', 3, 4); addMatch('Round 4', 2, 5); addMatch('Round 4', 1, 6); addMatch('Round 4', 0, null);
    addMatch('Round 5', 4, 6); addMatch('Round 5', 0, 3); addMatch('Round 5', 1, 2); addMatch('Round 5', 5, null);
    addMatch('Round 6', 4, 5); addMatch('Round 6', 3, 6); addMatch('Round 6', 0, 2); addMatch('Round 6', 1, null);
    addMatch('Round 7', 2, 6); addMatch('Round 7', 3, 5); addMatch('Round 7', 0, 1); addMatch('Round 7', 4, null);
  }
  return matches;
}

export async function syncKnockoutStructure(competitionId, classCode) {
  const cId = Number(competitionId);
  const cCode = String(classCode).trim();

  const pools = db.prepare(`SELECT id FROM pools WHERE competition_id = ? AND class_code = ? ORDER BY id`).all(cId, cCode);
  const numPools = pools.length;

  if (numPools === 0) return false;

  const allMatches = db.prepare(`SELECT * FROM matches WHERE competition_id = ? AND class_code = ?`).all(cId, cCode);
  const lastGroupMatch = db.prepare(`SELECT MAX(match_number) as max FROM matches WHERE competition_id = ? AND class_code = ? AND match_type = 'GROUP'`).get(cId, cCode);
  
  // Pegamos quem venceu ou perdeu nos jogos anteriores para "jogar para frente"
  function getKO(num) {
    const m = allMatches.find(x => x.match_number == num && (x.match_type === 'KO' || x.match_type === 'KNOCKOUT'));
    if (m && m.status === 'COMPLETED') {
        const w = m.winner_entrant_id;
        const l = String(w) === String(m.entrant1_id) ? m.entrant2_id : m.entrant1_id;
        return { w, l };
    }
    return { w: null, l: null };
  }

  const winners = {};
  pools.forEach((pool, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const ranked = getBackendPoolRanking(pool.id, allMatches);
    winners[letter] = { 
      first: ranked[0] ? ranked[0].entrant_id : null, 
      second: ranked[1] ? ranked[1].entrant_id : null 
    };
  });

  let koPlan = [];
  let n = (lastGroupMatch.max || 100) + 1;

  if (numPools === 1) {
    koPlan = [
      { round: 'Final', num: n, p1: winners.A?.first, p2: winners.A?.second }
    ];
  } else if (numPools === 2) {
    const sf1 = getKO(n);
    const sf2 = getKO(n+1);
    koPlan = [
      { round: 'Semi-Final', num: n, p1: winners.A?.first, p2: winners.B?.second },
      { round: 'Semi-Final', num: n+1, p1: winners.B?.first, p2: winners.A?.second },
      { round: '3rd Place', num: n+2, p1: sf1.l, p2: sf2.l },
      { round: 'Final', num: n+3, p1: sf1.w, p2: sf2.w }
    ];
  } else if (numPools === 3) {
    const po1 = getKO(n);
    const po2 = getKO(n+1);
    const sf1 = getKO(n+2);
    const sf2 = getKO(n+3);
    koPlan = [
      { round: 'Playoffs', num: n, p1: winners.C?.first, p2: winners.B?.second },
      { round: 'Playoffs', num: n+1, p1: winners.A?.second, p2: winners.C?.second },
      { round: 'Semi-Final', num: n+2, p1: winners.A?.first, p2: po1.w }, 
      { round: 'Semi-Final', num: n+3, p1: winners.B?.first, p2: po2.w },
      { round: '3rd Place', num: n+4, p1: sf1.l, p2: sf2.l },
      { round: 'Final', num: n+5, p1: sf1.w, p2: sf2.w }
    ];
  } else if (numPools === 4) {
    const qf1 = getKO(n);
    const qf2 = getKO(n+1);
    const qf3 = getKO(n+2);
    const qf4 = getKO(n+3);
    const sf1 = getKO(n+4);
    const sf2 = getKO(n+5);
    koPlan = [
      { round: 'Quarter Final', num: n, p1: winners.A?.first, p2: winners.C?.second },
      { round: 'Quarter Final', num: n+1, p1: winners.D?.first, p2: winners.B?.second },
      { round: 'Quarter Final', num: n+2, p1: winners.B?.first, p2: winners.D?.second },
      { round: 'Quarter Final', num: n+3, p1: winners.C?.first, p2: winners.A?.second },
      { round: 'Semi-Final', num: n+4, p1: qf1.w, p2: qf2.w },
      { round: 'Semi-Final', num: n+5, p1: qf3.w, p2: qf4.w },
      { round: '3rd Place', num: n+6, p1: sf1.l, p2: sf2.l },
      { round: 'Final', num: n+7, p1: sf1.w, p2: sf2.w }
    ];
  }

  db.transaction(() => {
    koPlan.forEach(kp => {
      const existing = db.prepare(`SELECT id FROM matches WHERE competition_id = ? AND class_code = ? AND match_number = ?`).get(cId, cCode, kp.num);
      if (existing) {
        db.prepare(`UPDATE matches SET entrant1_id = ?, entrant2_id = ? WHERE id = ?`).run(kp.p1, kp.p2, existing.id);
      } else {
        db.prepare(`
          INSERT INTO matches (competition_id, class_code, match_type, round_name, match_number, entrant1_id, entrant2_id, status)
          VALUES (?, ?, 'KO', ?, ?, ?, ?, 'SCHEDULED')
        `).run(cId, cCode, kp.round, kp.num, kp.p1, kp.p2);
      }
    });
  })();

  return true;
}

// ROTAS HTTP DO EXPRESS
router.post('/sync-ko-structure', async (req, res) => {
  const { competitionId } = req.params;
  const { class_code } = req.body;
  try {
    await syncKnockoutStructure(competitionId, class_code);
    res.json({ success: true, message: 'Estrutura sincronizada e avançada!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/group', (req, res) => {
  const { competitionId } = req.params;
  const { class_code } = req.query;
  try {
    const cId = Number(competitionId);
    const cCode = String(class_code).trim();
    const matches = db.prepare(`
      SELECT m.*, p.pool_name,
        e1.athlete_id as entrant1_athlete_id, e1.bib as entrant1_bib, a1.nome as entrant1_name, c1.sigla as entrant1_club_sigla,
        e2.athlete_id as entrant2_athlete_id, e2.bib as entrant2_bib, a2.nome as entrant2_name, c2.sigla as entrant2_club_sigla
      FROM matches m JOIN pools p ON m.pool_id = p.id
      LEFT JOIN entrants e1 ON m.entrant1_id = e1.id LEFT JOIN atletas a1 ON e1.athlete_id = a1.id LEFT JOIN clubes c1 ON a1.clube_id = c1.id
      LEFT JOIN entrants e2 ON m.entrant2_id = e2.id LEFT JOIN atletas a2 ON e2.athlete_id = a2.id LEFT JOIN clubes c2 ON a2.clube_id = c2.id
      WHERE m.competition_id = ? AND m.class_code = ? AND m.match_type = 'GROUP' ORDER BY p.pool_number, m.match_number
    `).all(cId, cCode);
    const grouped = {};
    matches.forEach(m => {
      if (!grouped[m.pool_id]) grouped[m.pool_id] = { pool_id: m.pool_id, pool_name: m.pool_name, rounds: {} };
      if (!grouped[m.pool_id].rounds[m.round_name]) grouped[m.pool_id].rounds[m.round_name] = [];
      m.score1 = m.score1 !== undefined ? m.score1 : m.score_entrant1;
      m.score2 = m.score2 !== undefined ? m.score2 : m.score_entrant2;
      grouped[m.pool_id].rounds[m.round_name].push(m);
    });
    res.json({ success: true, data: { matches: Object.values(grouped) } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/ko', (req, res) => {
  const { competitionId } = req.params;
  const { class_code } = req.query;
  try {
    const cId = Number(competitionId);
    const cCode = String(class_code).trim();
    const matches = db.prepare(`
      SELECT m.*, 
        e1.athlete_id as entrant_a_athlete_id, e1.bib as entrant_a_bib, a1.nome as entrant_a_name, c1.sigla as entrant_a_club,
        e2.athlete_id as entrant_b_athlete_id, e2.bib as entrant_b_bib, a2.nome as entrant_b_name, c2.sigla as entrant_b_club
      FROM matches m
      LEFT JOIN entrants e1 ON m.entrant1_id = e1.id LEFT JOIN atletas a1 ON e1.athlete_id = a1.id LEFT JOIN clubes c1 ON a1.clube_id = c1.id
      LEFT JOIN entrants e2 ON m.entrant2_id = e2.id LEFT JOIN atletas a2 ON e2.athlete_id = a2.id LEFT JOIN clubes c2 ON a2.clube_id = c2.id
      WHERE m.competition_id = ? AND m.class_code = ? AND (m.match_type = 'KO' OR m.match_type = 'KNOCKOUT') ORDER BY m.match_number
    `).all(cId, cCode);
    const mapped = matches.map(m => ({ ...m, round: m.round_name, score_a: m.score1, score_b: m.score2, winner_id: m.winner_entrant_id, match_order: m.match_number, entrant_a_id: m.entrant1_id, entrant_b_id: m.entrant2_id }));
    res.json({ success: true, data: mapped });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;