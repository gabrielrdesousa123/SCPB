// client/js/pages/competition-partial-results.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionPartialResults(root, hashData) {
  let competitionId = null;
  
  if (typeof hashData === 'string' && hashData.includes('?')) {
    const urlParams = new URLSearchParams(hashData.split('?')[1]);
    competitionId = urlParams.get('id');
  } else if (hashData && hashData.competitionId) {
    competitionId = hashData.competitionId;
  } else {
     const match = window.location.hash.match(/id=([a-zA-Z0-9_-]+)/) || window.location.hash.match(/id=(\d+)/);
     if (match) competitionId = match[1];
  }

  if (!competitionId) {
    root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro: ID da competição ausente.</div>`;
    return;
  }

  const state = {
    competitionName: 'Carregando...',
    resultsByClass: {}, 
    colorsMap: {}
  };

  const API = {
    getCompetition: async (id) => {
      try {
         const docRef = doc(db, "competitions", String(id));
         const docSnap = await getDoc(docRef);
         return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : { name: 'Competição Oficial' };
      } catch(e) { return { name: 'Competição Oficial' }; }
    },
    getClasses: async (id) => {
      try {
         const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
         const snap = await getDocs(q);
         return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch(e) { return []; }
    },
    getGlobalColors: async () => {
      try {
         const snap = await getDocs(collection(db, "classes"));
         snap.forEach(doc => { 
             const c = doc.data();
             const code = c.codigo || c.code || doc.id;
             state.colorsMap[code] = { bg: c.ui_bg || '#f8f9fa', fg: c.ui_fg || '#212529' }; 
         });
      } catch(e) {}
    },
    getPools: async (compId, classCode) => {
      try {
         const q = query(collection(db, "draws"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
         const snap = await getDocs(q);
         if (!snap.empty) {
             const data = snap.docs[0].data();
             return data.data || data.groups || data.draw_data || [];
         }
         return [];
      } catch(e) { return []; }
    },
    getGroupMatches: async (compId, classCode) => {
      try {
         const q = query(collection(db, "matches_group"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
         const snap = await getDocs(q);
         if (!snap.empty) {
             const data = snap.docs[0].data();
             return data.matches || data.data || [];
         }
         return [];
      } catch(e) { return []; }
    },
    getKOMatches: async (compId, classCode) => {
      try {
         const q = query(collection(db, "matches_ko"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
         const snap = await getDocs(q);
         if (!snap.empty) {
             const data = snap.docs[0].data();
             return data.matches || data.data || [];
         }
         return [];
      } catch(e) { return []; }
    }
  };

  function safeParse(data) {
    if (!data) return {};
    if (typeof data === 'object') return data;
    try {
      let parsed = JSON.parse(data);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch(e) { return {}; }
  }

  // =========================================================================
  // MOTOR DE CÁLCULO DA WORLD BOCCIA (COM FILTRO BYE)
  // =========================================================================
  function calculateClassRanking(pools, groupMatches, koMatches) {
    let allPlayers = [];
    pools.forEach(pool => pool.players && pool.players.forEach(p => allPlayers.push(p)));
    if (allPlayers.length === 0) return [];

    const standings = {};
    pools.forEach((pool, index) => {
      const poolLetter = String.fromCharCode(65 + index); 
      const poolMatchData = groupMatches.find(pm => String(pm.pool_id) === String(pool.id) || String(pm.pool_name).toLowerCase() === String(pool.name).toLowerCase());
      const rounds = poolMatchData && poolMatchData.rounds ? poolMatchData.rounds : {};
      const matches = Object.values(rounds).flat();
      const hasMatches = matches.length > 0;
      const isFinished = hasMatches && matches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || !m.entrant2_id);
      
      let poolMaxDiff = 6;
      matches.forEach(m => {
        if (m.status === 'COMPLETED') {
          const details = safeParse(m.details || m.match_details);
          if (!details.is_wo) {
            const diff = Math.abs((Number(m.score1) || 0) - (Number(m.score2) || 0));
            if (diff > poolMaxDiff) poolMaxDiff = diff;
          }
        }
      });

      const stats = {};
      if(pool.players) {
        pool.players.forEach(p => {
          stats[p.id] = { ...p, wins: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0, endsWon: 0, pdiffMatch: 0, pdiffEnd: 0, vsRecord: {} };
        });
      }

      matches.forEach(m => {
        // 🔥 FILTRO BYE: Ignora jogos contra BYE para o ranking parcial não ficar sujo
        const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';
        if (isBye) return;

        if (m.status === 'COMPLETED') {
          const details = safeParse(m.details || m.match_details);
          const isWO = details.is_wo === true;
          const is1Winner = String(m.winner_entrant_id) === String(m.entrant1_id);
          const is2Winner = String(m.winner_entrant_id) === String(m.entrant2_id);

          let s1 = Number(m.score1) || 0; let s2 = Number(m.score2) || 0;
          if (isWO) {
             if (is1Winner) { s1 = poolMaxDiff; s2 = 0; }
             else if (is2Winner) { s1 = 0; s2 = poolMaxDiff; }
          }

          const p1Id = m.entrant1_athlete_id; const p2Id = m.entrant2_athlete_id;
          let p1Ends = 0, p2Ends = 0; let p1MaxEndDiff = 0, p2MaxEndDiff = 0;
          
          if (!isWO && Array.isArray(details.p1_partials) && Array.isArray(details.p2_partials)) {
            for (let i = 0; i < 4; i++) {
              const val1 = details.p1_partials[i]; const val2 = details.p2_partials[i];
              if ((val1 !== null && val1 !== undefined && val1 !== '') || (val2 !== null && val2 !== undefined && val2 !== '')) {
                const e1 = Number(val1) || 0; const e2 = Number(val2) || 0;
                if (e1 > e2) p1Ends++; else if (e2 > e1) p2Ends++;
                if (e1 - e2 > p1MaxEndDiff) p1MaxEndDiff = e1 - e2;
                if (e2 - e1 > p2MaxEndDiff) p2MaxEndDiff = e2 - e1;
              }
            }
          }

          if (p1Id && stats[p1Id]) {
            stats[p1Id].pointsFor += s1; stats[p1Id].pointsAgainst += s2; stats[p1Id].endsWon += p1Ends;
            if (is1Winner) stats[p1Id].wins++;
            const matchDiff1 = s1 - s2;
            if (matchDiff1 > stats[p1Id].pdiffMatch) stats[p1Id].pdiffMatch = matchDiff1;
            if (p1MaxEndDiff > stats[p1Id].pdiffEnd) stats[p1Id].pdiffEnd = p1MaxEndDiff;
            if (p2Id) stats[p1Id].vsRecord[p2Id] = { score: s1, isWinner: is1Winner };
          }
          if (p2Id && stats[p2Id]) {
            stats[p2Id].pointsFor += s2; stats[p2Id].pointsAgainst += s1; stats[p2Id].endsWon += p2Ends;
            if (is2Winner) stats[p2Id].wins++;
            const matchDiff2 = s2 - s1;
            if (matchDiff2 > stats[p2Id].pdiffMatch) stats[p2Id].pdiffMatch = matchDiff2;
            if (p2MaxEndDiff > stats[p2Id].pdiffEnd) stats[p2Id].pdiffEnd = p2MaxEndDiff;
            if (p1Id) stats[p2Id].vsRecord[p1Id] = { score: s2, isWinner: is2Winner };
          }
        }
      });

      Object.values(stats).forEach(s => s.pointsDiff = s.pointsFor - s.pointsAgainst);

      const winsGroups = {};
      Object.values(stats).forEach(s => {
        if (!winsGroups[s.wins]) winsGroups[s.wins] = [];
        winsGroups[s.wins].push(s);
      });

      function fallbackCompare(a, b) {
        if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
        if (b.endsWon !== a.endsWon) return b.endsWon - a.endsWon;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        if (b.pdiffMatch !== a.pdiffMatch) return b.pdiffMatch - a.pdiffMatch;
        if (b.pdiffEnd !== a.pdiffEnd) return b.pdiffEnd - a.pdiffEnd;
        return parseInt(a.bib, 10) - parseInt(b.bib, 10);
      }

      function resolveTie(group) {
        if (group.length <= 1) return group;
        if (group.length === 2) {
          const [p1, p2] = group;
          if (p1.vsRecord[p2.id] && p1.vsRecord[p2.id].isWinner) return [p1, p2];
          if (p2.vsRecord[p1.id] && p2.vsRecord[p1.id].isWinner) return [p2, p1];
          return [p1, p2].sort((a,b) => fallbackCompare(a,b));
        }
        group.sort((a, b) => fallbackCompare(a, b));
        return group;
      }

      let finalRanked = [];
      const sortedWins = Object.keys(winsGroups).map(Number).sort((a,b) => b - a);
      sortedWins.forEach(w => { finalRanked = finalRanked.concat(resolveTie(winsGroups[w])); });

      pool.players = finalRanked.map((p, i) => ({ ...p, rank: i + 1 }));
      standings[poolLetter] = { isFinished, players: pool.players };
    });

    const ranking = [];
    const finals = koMatches.filter(m => m.round_name === 'Final' || m.round === 'Final');
    const bronze = koMatches.filter(m => m.round_name === '3rd Place' || m.round === '3rd Place');
    
    const getAthleteIds = (m) => {
        const wEntrantId = m.winner_entrant_id || m.winner_id;
        const e1Id = m.entrant1_id || m.entrant_a_id;
        let wAthleteId = null; let lAthleteId = null;
        let wScore = 0; let lScore = 0;
        
        if (String(wEntrantId) === String(e1Id)) {
            wAthleteId = m.entrant1_athlete_id || m.entrant_a_athlete_id;
            lAthleteId = m.entrant2_athlete_id || m.entrant_b_athlete_id;
            wScore = Number(m.score1 ?? m.score_a) || 0;
            lScore = Number(m.score2 ?? m.score_b) || 0;
        } else {
            wAthleteId = m.entrant2_athlete_id || m.entrant_b_athlete_id;
            lAthleteId = m.entrant1_athlete_id || m.entrant_a_athlete_id;
            wScore = Number(m.score2 ?? m.score_b) || 0;
            lScore = Number(m.score1 ?? m.score_a) || 0;
        }
        return { wAthleteId, lAthleteId, wScore, lScore };
    };

    const addPlayer = (athleteId, position, phase) => {
      if (!athleteId || athleteId === 'BYE') return;
      const p = allPlayers.find(pl => String(pl.id) === String(athleteId));
      if (p && !ranking.some(r => String(r.id) === String(p.id))) {
        ranking.push({ ...p, finalPosition: position, phase });
      }
    };

    if (finals.length > 0 && finals[0].status === 'COMPLETED') {
      const { wAthleteId, lAthleteId } = getAthleteIds(finals[0]);
      addPlayer(wAthleteId, 1, 'Ouro');
      addPlayer(lAthleteId, 2, 'Prata');
    }

    if (bronze.length > 0 && bronze[0].status === 'COMPLETED') {
      const { wAthleteId, lAthleteId } = getAthleteIds(bronze[0]);
      addPlayer(wAthleteId, 3, 'Bronze');
      addPlayer(lAthleteId, 4, '4º Lugar');
    }

    // Filtra as eliminatórias (Quartas, Playoffs) e faz o ranking
    const quarters = koMatches.filter(m => m.round_name === 'Quarter Final' || m.round === 'Quarter Final' || String(m.round_name).includes('Quartas'));
    if (quarters.length > 0) {
      let qfLosers = [];
      quarters.forEach(m => {
        if (m.status === 'COMPLETED') {
          const { lAthleteId, wScore, lScore } = getAthleteIds(m);
          qfLosers.push({ athleteId: lAthleteId, pDiff: lScore - wScore, ptsFor: lScore });
        }
      });
      qfLosers.sort((a, b) => b.pDiff - a.pDiff || b.ptsFor - a.ptsFor);
      qfLosers.forEach((loser, idx) => addPlayer(loser.athleteId, 5 + idx, 'Quartas de Final'));
    }

    let poolRemaining = [];
    Object.keys(standings).forEach(poolLetter => {
      const pool = standings[poolLetter];
      if (pool.players) {
        pool.players.forEach(p => {
          if (!ranking.some(r => String(r.id) === String(p.id))) poolRemaining.push({ ...p, poolPosition: p.rank });
        });
      }
    });

    const maxPos = Math.max(...poolRemaining.map(p => p.poolPosition), 0);
    let currentGlobalPos = ranking.length + 1;

    for (let pos = 1; pos <= maxPos; pos++) {
      let groupOfPos = poolRemaining.filter(p => p.poolPosition === pos);
      groupOfPos.sort((a, b) => b.wins - a.wins || b.pointsDiff - a.pointsDiff || b.pointsFor - a.pointsFor);
      groupOfPos.forEach(p => { ranking.push({ ...p, finalPosition: currentGlobalPos++, phase: 'Fase de Grupos' }); });
    }

    return ranking;
  }

  async function loadData() {
    root.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 50vh; flex-direction: column;">
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0d6efd; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 15px; color: #64748b; font-family: sans-serif;">A extrair as posições de todas as classes na nuvem...</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </div>
    `;

    try {
      const compData = await API.getCompetition(competitionId);
      state.competitionName = compData.name || compData.nome || 'Competição Oficial';
      
      await API.getGlobalColors();
      const classes = await API.getClasses(competitionId);

      for (const cls of classes) {
         const code = cls.class_code || cls.codigo || cls.name || cls.id;
         const pools = await API.getPools(competitionId, code);
         
         if (pools && pools.length > 0) {
            const groupMatches = await API.getGroupMatches(competitionId, code);
            const koMatches = await API.getKOMatches(competitionId, code);
            
            const ranking = calculateClassRanking(pools, groupMatches, koMatches);
            state.resultsByClass[code] = ranking;
         }
      }

      render();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro crítico: ${e.message}</div>`;
    }
  }

  function escapeHTML(str) {
    if (!str) return '-';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function getMedalBadge(pos) {
      if (pos === 1) return `<div class="medal-badge" style="background:#fbbf24; color:#fff; border-color:#d97706;">1º</div>`;
      if (pos === 2) return `<div class="medal-badge" style="background:#cbd5e1; color:#fff; border-color:#94a3b8;">2º</div>`;
      if (pos === 3) return `<div class="medal-badge" style="background:#d97706; color:#fff; border-color:#b45309;">3º</div>`;
      return `<div class="medal-badge" style="background:#e2e8f0; color:#475569; border-color:#cbd5e1;">${pos}º</div>`;
  }

  function render() {
    const classCodes = Object.keys(state.resultsByClass).sort();
    let contentHtml = '';

    if (classCodes.length === 0) {
      contentHtml = `
        <div style="text-align:center; padding: 60px; background: #fff; border-radius: 8px; border: 1px dashed #cbd5e1; margin-top: 20px;">
            <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
            <h3 style="color: #475569; margin: 0;">Nenhuma classe com resultados</h3>
            <p style="color: #94a3b8; font-size: 14px; margin-top: 5px;">Os resultados parciais serão gerados assim que o sorteio for realizado.</p>
        </div>
      `;
    } else {
      contentHtml = classCodes.map(code => {
        const ranking = state.resultsByClass[code] || [];
        const colors = state.colorsMap[code] || { bg: '#0f172a', fg: '#ffffff' };
        
        return `
          <div class="print-break-inside-avoid" style="margin-bottom: 30px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid #cbd5e1;">
            <div style="background-color: ${colors.bg}; color: ${colors.fg}; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;" class="force-print-color">
                <h2 style="margin: 0; font-size: 16px; font-weight: 700; text-transform: uppercase;">Classe ${escapeHTML(code)}</h2>
                <span style="font-size: 12px; font-weight: bold; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 12px;">
                    ${ranking.length} Classificados
                </span>
            </div>
            
            <div style="overflow-x: auto; padding: 15px;">
              <table class="wb-table" style="width: 100%;">
                <thead>
                  <tr class="force-print-color">
                    <th style="width: 60px; text-align: center;">Pos</th>
                    <th style="width: 80px; text-align: center;">BIB</th>
                    <th style="width: 45%;">Atleta / Equipa</th>
                    <th>Clube / Delegação</th>
                  </tr>
                </thead>
                <tbody>
                  ${ranking.map(a => `
                    <tr>
                      <td style="text-align: center;">${getMedalBadge(a.finalPosition)}</td>
                      <td style="text-align: center;">
                        <div class="wb-bib-badge force-print-color">
                            ${escapeHTML(a.bib)}
                        </div>
                      </td>
                      <td style="font-weight: 600; color: #1e293b;">${escapeHTML(a.nome)}</td>
                      <td style="color: #475569;">
                        ${escapeHTML(a.clube_nome)} ${a.clube_sigla && a.clube_sigla !== a.clube_nome ? `<strong>(${escapeHTML(a.clube_sigla)})</strong>` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');
    }

    const styles = `
      <style>
        .wb-container { max-width: 1000px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
        .wb-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        
        .wb-table { border-collapse: collapse; font-size: 14px; border: 1px solid #e2e8f0; }
        .wb-table th { background: #f8fafc; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 12px; padding: 10px 15px; text-align: left; border: 1px solid #e2e8f0; }
        .wb-table td { padding: 8px 15px; border: 1px solid #e2e8f0; vertical-align: middle; }
        .wb-table tr:hover { background-color: #f8fafc; }
        
        .wb-bib-badge { background: #eff6ff; color: #2563eb; width: 40px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; font-weight: bold; margin: 0 auto; border: 1px solid #bfdbfe; font-size: 13px; }
        .medal-badge { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: bold; font-size: 12px; margin: 0 auto; border-width: 1px; border-style: solid; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }

        .btn-outline-secondary { border: 1px solid #cbd5e1; background: white; color: #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
        .btn-outline-secondary:hover { background: #f1f5f9; color: #0f172a; }
        
        .btn-primary-print { background: #0d6efd; border: 1px solid #0b5ed7; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-primary-print:hover { background: #0b5ed7; }

        @media print {
          @page { size: A4; margin: 1.5cm; }
          header, nav, .no-print { display: none !important; }
          body, html { background-color: #fff !important; font-size: 10pt !important; padding: 0 !important; }
          .wb-container { max-width: 100% !important; padding: 0 !important; }
          
          .force-print-color { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          .print-break-inside-avoid { 
            page-break-inside: avoid !important; 
            break-inside: avoid !important; 
            box-shadow: none !important; 
            margin-bottom: 25px !important; 
            border: 1px solid #cbd5e1 !important; 
          }
          
          h1 { font-size: 16pt !important; color: #000 !important; }
          .wb-header { border-bottom: 2px solid #000; margin-bottom: 20px !important; padding-bottom: 10px !important; }
          
          .wb-table { font-size: 10pt !important; }
          .wb-table th { font-size: 9pt !important; padding: 8px 10px !important; color: #000 !important; background: #eee !important; border: 1px solid #ccc !important; }
          .wb-table td { padding: 8px 10px !important; border: 1px solid #ccc !important; }
          .wb-bib-badge, .medal-badge { border: 1px solid #000 !important; }
          
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      </style>
    `;

    root.innerHTML = `
      ${styles}
      <div class="wb-container">
        <div class="wb-header">
          <div>
            <h1 style="margin: 0; font-size: 26px; color: #0f172a;">Classificação Parcial Oficial</h1>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">${escapeHTML(state.competitionName)}</p>
          </div>
          <div class="no-print" style="display: flex; gap: 10px;">
            <button class="btn-primary-print" onclick="window.print()">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
              Imprimir Relatório
            </button>
            <button class="btn-outline-secondary" onclick="window.history.back()">← Voltar</button>
          </div>
        </div>
        ${contentHtml}
      </div>
    `;
  }

  loadData();
}