// client/js/pages/competition-class-results.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionClassResults(root, hash) {
    const matchUrl = hash.match(/#\/competitions\/(\d+)\/class\/([^/]+)\/results/) || hash.match(/#\/competitions\/([a-zA-Z0-9_-]+)\/class\/([^/]+)\/results/);
    if (!matchUrl) {
        root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro: Rota inválida.</div>`;
        return;
    }
    
    const competitionId = matchUrl[1];
    const classCode = decodeURIComponent(matchUrl[2]);

    const state = {
        competition: {},
        colors: { bg: '#0d6efd', fg: '#ffffff' },
        pools: [],
        groupMatches: [],
        koMatches: [],
        allPlayers: []
    };

    const API = {
        getComp: async () => {
            const docRef = doc(db, "competitions", String(competitionId));
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) state.competition = { id: docSnap.id, ...docSnap.data() };
        },
        getClassColors: async () => {
            try {
                const snap = await getDocs(collection(db, "classes"));
                snap.forEach(doc => {
                    const c = doc.data();
                    if (c.codigo === classCode || c.code === classCode || doc.id === classCode) {
                        state.colors = { bg: c.ui_bg || '#0d6efd', fg: c.ui_fg || '#ffffff' };
                    }
                });
            } catch (e) { }
        },
        getPools: async () => {
            try {
                const q = query(collection(db, "draws"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const data = snap.docs[0].data();
                    state.pools = data.data || data.groups || data.draw_data || [];
                    state.allPlayers = [];
                    state.pools.forEach(pool => { if (pool.players) pool.players.forEach(p => state.allPlayers.push(p)); });
                }
            } catch (e) { }
        },
        getGroupMatches: async () => {
            try {
                const q = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    state.groupMatches = [{ docId: snap.docs[0].id, ...snap.docs[0].data() }];
                }
            } catch (e) { }
        },
        getKOMatches: async () => {
            try {
                const q = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    state.koMatches = [{ docId: snap.docs[0].id, ...snap.docs[0].data() }];
                }
            } catch (e) { }
        }
    };

    function escapeHTML(s = '') {
        return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function safeParse(data) {
        if (!data) return {};
        if (typeof data === 'object') return data;
        try {
            let parsed = JSON.parse(data);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch (e) { return {}; }
    }

    function getParticipantData(match, side) {
        const isGroup = match.match_type === 'GROUP' || match.pool_id || match.round_name?.includes('Round');
        const prefix = side === 1 ? (isGroup ? 'entrant1' : 'entrant_a') : (isGroup ? 'entrant2' : 'entrant_b');

        const mId = match[`${prefix}_athlete_id`] || match[`${prefix}_id`];
        const mName = match[`${prefix}_name`];
        const mBib = match[`${prefix}_bib`];
        const mClubSigla = match[`${prefix}_club_sigla`];
        const mClubNome = match[`${prefix}_club_nome`];

        const isBye = String(mName).toUpperCase() === 'BYE' || (side === 2 && String(match.entrant_b_name).toUpperCase() === 'BYE');
        if (isBye) return { id: null, name: 'BYE', bib: '--', clubFull: '', isBye: true };

        const player = state.allPlayers.find(p => String(p.id) === String(mId)) || {};
        let finalName = player.nome || mName || 'A Definir';
        if (finalName === 'A Definir' && match[`${prefix}_name`]) finalName = match[`${prefix}_name`];

        const finalBib = player.bib || mBib || '---';

        let cNome = player.clube_nome || mClubNome || 'CLUBE NÃO INFORMADO';
        let cSigla = player.clube_sigla || mClubSigla || '';
        let finalClubFull = cNome;

        if (cSigla && cNome !== cSigla && cNome !== 'CLUBE NÃO INFORMADO') {
            finalClubFull = `${cNome} - ${cSigla}`;
        } else if (cSigla && cNome === 'CLUBE NÃO INFORMADO') {
            finalClubFull = cSigla;
        } else if (!cSigla && cNome === 'CLUBE NÃO INFORMADO') {
            finalClubFull = '';
        }

        return { id: mId, name: finalName, bib: finalBib, clubFull: finalClubFull, isBye: false };
    }

    function calculatePoolStandings() {
        const standings = {};

        state.pools.forEach((pool, index) => {
            const poolLetter = String.fromCharCode(65 + index);
            let poolMatchData = null;

            for (const gm of state.groupMatches) {
                const arr = gm.matches || gm.data || [];
                const found = arr.find(pm => String(pm.pool_id) === String(pool.id) || String(pm.pool_name).toLowerCase() === String(pool.name).toLowerCase());
                if (found) { poolMatchData = found; break; }
            }

            const rounds = poolMatchData && poolMatchData.rounds ? poolMatchData.rounds : {};
            const players = pool.players || [];
            const matches = Object.values(rounds).flat();
            const hasMatches = matches.length > 0;
            const isFinished = hasMatches && matches.every(m => m.status === 'COMPLETED' || m.status === 'SCHEDULED_WITH_BYE' || m.status === 'BYE' || !m.entrant2_id);

            let poolMaxDiff = 6;
            matches.forEach(m => {
                if (m.status === 'COMPLETED') {
                    const details = safeParse(m.details || m.match_details);
                    if (!details.is_wo) {
                        const diff = Math.abs((Number(m.score1 ?? m.score_entrant1 ?? m.score_a) || 0) - (Number(m.score2 ?? m.score_entrant2 ?? m.score_b) || 0));
                        if (diff > poolMaxDiff) poolMaxDiff = diff;
                    }
                }
            });

            const stats = {};
            players.forEach(p => {
                stats[p.id] = { ...p, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0 };
            });

            matches.forEach(m => {
                // 🔥 IGNORA JOGOS CONTRA "BYE" NO CÁLCULO
                if (m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE') return;

                if (m.status === 'COMPLETED') {
                    const details = safeParse(m.details || m.match_details);
                    const isWO = details.is_wo === true;
                    const is1Winner = String(m.winner_entrant_id) === String(m.entrant1_id || m.entrant_a_id);
                    const is2Winner = String(m.winner_entrant_id) === String(m.entrant2_id || m.entrant_b_id);

                    let s1 = Number(m.score1 ?? m.score_entrant1 ?? m.score_a) || 0;
                    let s2 = Number(m.score2 ?? m.score_entrant2 ?? m.score_b) || 0;

                    if (isWO) {
                        if (is1Winner) { s1 = poolMaxDiff; s2 = 0; }
                        else if (is2Winner) { s1 = 0; s2 = poolMaxDiff; }
                    }

                    const p1Id = m.entrant1_athlete_id || m.entrant1_id || m.entrant_a_id;
                    const p2Id = m.entrant2_athlete_id || m.entrant2_id || m.entrant_b_id;

                    if (p1Id && stats[p1Id]) {
                        stats[p1Id].played++;
                        stats[p1Id].pointsFor += s1;
                        stats[p1Id].pointsAgainst += s2;
                        if (is1Winner) stats[p1Id].wins++; else stats[p1Id].losses++;
                    }
                    if (p2Id && stats[p2Id]) {
                        stats[p2Id].played++;
                        stats[p2Id].pointsFor += s2;
                        stats[p2Id].pointsAgainst += s1;
                        if (is2Winner) stats[p2Id].wins++; else stats[p2Id].losses++;
                    }
                }
            });

            Object.values(stats).forEach(s => s.pointsDiff = s.pointsFor - s.pointsAgainst);
            
            const rankedPlayers = Object.values(stats).sort((a, b) => {
                if (b.wins !== a.wins) return b.wins - a.wins;
                if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
                return b.pointsFor - a.pointsFor;
            }).map((p, i) => ({ ...p, rank: i + 1 }));

            standings[poolLetter] = {
                isFinished: isFinished,
                players: rankedPlayers,
                maxDiffForWO: poolMaxDiff
            };
        });

        return standings;
    }

    function calculateFinalRanking(standings, koMatchesArray, allPlayers) {
        const ranking = [];
        const koM = koMatchesArray.flatMap(km => km.matches || km.data || []);
        
        const finals = koM.filter(m => m.round_name === 'Final' || m.round === 'Final');
        const bronze = koM.filter(m => m.round_name === '3rd Place' || m.round === '3rd Place' || m.round_name === 'Disputa de 3º Lugar');
        const quarters = koM.filter(m => m.round_name === 'Quarter Final' || m.round === 'Quarter Final' || m.round_name === 'Quartas de Final');
        const playoffs = koM.filter(m => m.round_name === 'Playoffs' || m.round === 'Playoffs');

        const getAthleteIds = (m) => {
            const wEntrantId = m.winner_entrant_id || m.winner_id;
            const e1Id = m.entrant1_id || m.entrant_a_id;
            let wAthleteId = null; let lAthleteId = null;
            let wScore = 0; let lScore = 0;
            
            if (String(wEntrantId) === String(e1Id)) {
                wAthleteId = m.entrant1_athlete_id || m.entrant_a_athlete_id || m.entrant1_id;
                lAthleteId = m.entrant2_athlete_id || m.entrant_b_athlete_id || m.entrant2_id;
                wScore = Number(m.score1 ?? m.score_a) || 0;
                lScore = Number(m.score2 ?? m.score_b) || 0;
            } else {
                wAthleteId = m.entrant2_athlete_id || m.entrant_b_athlete_id || m.entrant2_id;
                lAthleteId = m.entrant1_athlete_id || m.entrant_a_athlete_id || m.entrant1_id;
                wScore = Number(m.score2 ?? m.score_b) || 0;
                lScore = Number(m.score1 ?? m.score_a) || 0;
            }
            return { wAthleteId, lAthleteId, wScore, lScore };
        };

        const addPlayer = (athleteId, position, phase) => {
            if (athleteId === null || athleteId === undefined || athleteId === 'BYE') return;
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

        if (quarters.length > 0) {
            let qfLosers = [];
            quarters.forEach(m => {
                if (m.status === 'COMPLETED') {
                    const { lAthleteId, wScore, lScore } = getAthleteIds(m);
                    qfLosers.push({ athleteId: lAthleteId, pDiff: lScore - wScore, ptsFor: lScore });
                }
            });
            qfLosers.sort((a, b) => {
                if (b.pDiff !== a.pDiff) return b.pDiff - a.pDiff;
                return b.ptsFor - a.ptsFor;
            });
            qfLosers.forEach((loser, idx) => addPlayer(loser.athleteId, 5 + idx, 'Quartas de Final'));
        }

        if (playoffs.length > 0) {
            let pfLosers = [];
            playoffs.forEach(m => {
                if (m.status === 'COMPLETED') {
                    const { lAthleteId, wScore, lScore } = getAthleteIds(m);
                    pfLosers.push({ athleteId: lAthleteId, pDiff: lScore - wScore, ptsFor: lScore });
                }
            });
            pfLosers.sort((a, b) => {
                if (b.pDiff !== a.pDiff) return b.pDiff - a.pDiff;
                return b.ptsFor - a.ptsFor;
            });
            const offset = quarters.length > 0 ? 9 : 5;
            pfLosers.forEach((loser, idx) => addPlayer(loser.athleteId, offset + idx, 'Playoffs'));
        }

        let poolRemaining = [];
        Object.keys(standings).forEach(poolLetter => {
            const pool = standings[poolLetter];
            if (pool.isFinished && pool.players) {
                pool.players.forEach(p => {
                    if (!ranking.some(r => String(r.id) === String(p.id))) poolRemaining.push({ ...p, poolPosition: p.rank });
                });
            }
        });

        const maxPos = Math.max(...poolRemaining.map(p => p.poolPosition), 0);
        let currentGlobalPos = ranking.length + 1;

        for (let pos = 1; pos <= maxPos; pos++) {
            let groupOfPos = poolRemaining.filter(p => p.poolPosition === pos);
            groupOfPos.sort((a, b) => {
                if (b.wins !== a.wins) return b.wins - a.wins;
                if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
                if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
                if (b.endsWon !== a.endsWon) return b.endsWon - a.endsWon;
                return parseInt(a.bib) - parseInt(b.bib);
            });
            groupOfPos.forEach(p => { ranking.push({ ...p, finalPosition: currentGlobalPos++, phase: 'Fase de Grupos' }); });
        }

        return ranking;
    }

    function formatScoreDisplay(m, p1, p2, roundMaxDiff) {
        const details = safeParse(m.details || m.match_details);
        const isWO = details.is_wo === true;
        const isCompleted = m.status === 'COMPLETED';
        const isBye = m.status === 'SCHEDULED_WITH_BYE' || m.status === 'BYE' || m.is_bye || !m.entrant2_id || !m.match_number || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';

        if (isBye) return `<span style="color:#94a3b8; font-style:italic; font-size:12px;">BYE</span>`;
        if (!isCompleted) return `<span style="color:#94a3b8; font-weight:bold;">- x -</span>`;

        let s1 = Number(m.score1 ?? m.score_entrant1 ?? m.score_a);
        let s2 = Number(m.score2 ?? m.score_entrant2 ?? m.score_b);

        if (isNaN(s1)) s1 = 0;
        if (isNaN(s2)) s2 = 0;

        const is1Winner = String(m.winner_entrant_id) === String(p1.id || m.entrant1_id || m.entrant_a_id);
        const is2Winner = String(m.winner_entrant_id) === String(p2.id || m.entrant2_id || m.entrant_b_id);

        if (isWO) {
            if (is1Winner) { s1 = roundMaxDiff || 6; s2 = 0; }
            else if (is2Winner) { s1 = 0; s2 = roundMaxDiff || 6; }
        }

        let str1 = `<span style="font-size: 16px; color: ${is1Winner ? '#16a34a' : '#1e293b'};">${s1}</span>`;
        let str2 = `<span style="font-size: 16px; color: ${is2Winner ? '#16a34a' : '#1e293b'};">${s2}</span>`;

        if (isWO) {
            if (is1Winner) str1 += ' <span style="font-size:11px; font-weight:900; color:#dc2626; margin-left:4px;">(W.O.)</span>';
            if (is2Winner) str2 += ' <span style="font-size:11px; font-weight:900; color:#dc2626; margin-left:4px;">(W.O.)</span>';
        } else if (s1 === s2 && isCompleted && m.winner_entrant_id) {
            if (is1Winner) str1 += ' <span style="font-size:12px; font-weight:900; color:#16a34a; margin-left:4px;">(V)</span>';
            if (is2Winner) str2 += ' <span style="font-size:12px; font-weight:900; color:#16a34a; margin-left:4px;">(V)</span>';
        }

        return `${str1} <span style="margin:0 10px; color:#cbd5e1; font-size:14px;">x</span> ${str2}`;
    }

    function renderMatchList(matches, title, roundMaxDiff = 6) {
        if (!matches || matches.length === 0) return '';
        
        // 🔥 FILTRA JOGOS 'BYE' PARA ELES NÃO APARECEREM NA LISTA DE RESULTADOS PÚBLICA
        const filteredMatches = matches.filter(m => {
            return m.status !== 'BYE' && m.status !== 'SCHEDULED_WITH_BYE' && m.is_bye !== true && m.entrant2_id && String(m.entrant1_name).toUpperCase() !== 'BYE' && String(m.entrant2_name).toUpperCase() !== 'BYE';
        });
        
        if (filteredMatches.length === 0) return ''; // Se a rodada inteira era só folga, não mostra nada.

        let html = `
        <div class="results-section">
            <h3 class="results-section-title">${title}</h3>
            <div class="results-table-wrapper">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th style="width: 100px;">Grupo / Fase</th>
                            <th style="width: 70px;">Jogo</th>
                            <th style="text-align: right; width: 35%;">Atleta A</th>
                            <th style="text-align: center; width: 140px;">Placar Oficial</th>
                            <th style="text-align: left; width: 35%;">Atleta B</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        filteredMatches.sort((a, b) => parseInt(a.match_number) - parseInt(b.match_number)).forEach(m => {
            const p1 = getParticipantData(m, 1);
            const p2 = getParticipantData(m, 2);
            
            const isCompleted = m.status === 'COMPLETED';
            const is1Winner = isCompleted && String(m.winner_entrant_id) === String(p1.id || m.entrant1_id || m.entrant_a_id);
            const is2Winner = isCompleted && String(m.winner_entrant_id) === String(p2.id || m.entrant2_id || m.entrant_b_id);

            const scoreHtml = formatScoreDisplay(m, p1, p2, roundMaxDiff);
            const groupName = m._poolName ? (m._poolName.toLowerCase().includes('grupo') ? m._poolName : `Grupo ${m._poolName}`) : (m.round_name || '-');

            html += `
                <tr>
                    <td style="color:#475569; font-weight:bold; font-size:12px;">${escapeHTML(groupName)}</td>
                    <td style="color:#94a3b8; font-weight:bold;">${m.match_number || '-'}</td>
                    <td style="text-align: right;">
                        <div class="player-name ${is1Winner ? 'winner-text' : ''}">${escapeHTML(p1.name)}</div>
                        <div class="player-club">${escapeHTML(p1.clubFull)}</div>
                    </td>
                    <td style="text-align: center; background: #f8fafc; border-left: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9;">
                        <div class="score-badge">${scoreHtml}</div>
                    </td>
                    <td style="text-align: left;">
                        <div class="player-name ${is2Winner ? 'winner-text' : ''}">${escapeHTML(p2.name)}</div>
                        <div class="player-club">${escapeHTML(p2.clubFull)}</div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div></div>`;
        return html;
    }

    async function loadData() {
        root.innerHTML = `
          <div style="display: flex; justify-content: center; align-items: center; height: 50vh; flex-direction: column;">
            <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0d6efd; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 15px; color: #64748b; font-family: sans-serif;">Processando Resultados Oficiais...</p>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
          </div>
        `;
        try {
            await Promise.all([
                API.getComp(), API.getClassColors(), API.getPools(), API.getGroupMatches(), API.getKOMatches()
            ]);
            render();
        } catch (e) {
            console.error(e);
            root.innerHTML = `<div class="alert alert-danger">Erro ao carregar dados.</div>`;
        }
    }

    function render() {
        const standings = calculatePoolStandings();

        const groupRounds = {};
        state.groupMatches.forEach(gm => {
            const arr = gm.matches || gm.data || [];
            arr.forEach(pool => {
                const pMaxDiff = pool.maxDiffForWO || 6;
                Object.keys(pool.rounds || {}).forEach(rName => {
                    let formattedName = rName.replace(/Round/i, 'Rodada').toUpperCase();
                    if (!groupRounds[formattedName]) groupRounds[formattedName] = { matches: [], maxDiff: 6 };
                    
                    pool.rounds[rName].forEach(m => {
                        m._poolName = pool.pool_name || pool.name || '';
                        groupRounds[formattedName].matches.push(m);
                    });
                    
                    if (pMaxDiff > groupRounds[formattedName].maxDiff) {
                        groupRounds[formattedName].maxDiff = pMaxDiff;
                    }
                });
            });
        });

        const koRounds = {};
        state.koMatches.forEach(km => {
            const arr = km.matches || km.data || [];
            arr.forEach(m => {
                let rName = m.round_name || m.round || 'Eliminatórias';
                const map = { 'Quarter Final': 'Quartas de Final', 'Semi-Final': 'Semi-Final', 'Playoffs': 'Playoffs', 'Final': 'Final', '3rd Place': 'Disputa de 3º Lugar' };
                rName = map[rName] || rName;
                if (!koRounds[rName]) koRounds[rName] = { matches: [], maxDiff: 6 };
                koRounds[rName].matches.push(m);
            });
        });

        Object.keys(koRounds).forEach(rName => {
            let rMax = 6;
            koRounds[rName].matches.forEach(m => {
                if (m.status === 'COMPLETED') {
                    const det = safeParse(m.details || m.match_details);
                    if (!det.is_wo) {
                        const d = Math.abs((Number(m.score1 ?? m.score_a) || 0) - (Number(m.score2 ?? m.score_b) || 0));
                        if (d > rMax) rMax = d;
                    }
                }
            });
            koRounds[rName].maxDiff = rMax;
        });

        let matchesHtml = '';
        
        const sortedGroupRounds = Object.keys(groupRounds).sort();
        sortedGroupRounds.forEach(rName => {
            matchesHtml += renderMatchList(groupRounds[rName].matches, escapeHTML(rName), groupRounds[rName].maxDiff);
        });

        const orderKO = ['Playoffs', 'Quartas de Final', 'Semi-Final', 'Disputa de 3º Lugar', 'Final'];
        
        const allPoolsFinished = Object.values(standings).length > 0 && Object.values(standings).every(p => p.isFinished);
        if (allPoolsFinished) {
            orderKO.forEach(rName => {
                if (koRounds[rName]) {
                    matchesHtml += renderMatchList(koRounds[rName].matches, escapeHTML(rName).toUpperCase(), koRounds[rName].maxDiff);
                }
            });
        }

        let isClassFinished = false;
        const flatKOMatches = state.koMatches.flatMap(km => km.matches || km.data || []);
        
        if (flatKOMatches.length > 0) {
            const finalsMatches = flatKOMatches.filter(m => m.round_name === 'Final' || m.round === 'Final');
            const bronzeMatches = flatKOMatches.filter(m => m.round_name === '3rd Place' || m.round === '3rd Place' || m.round_name === 'Disputa de 3º Lugar');
            
            if (finalsMatches.length > 0) {
                // 🔥 SÓ CONSIDERA TERMINADO SE FINAL E BRONZE TIVEREM STATUS VÁLIDO (BYE OU COMPLETED)
                const finalCompleted = finalsMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.is_bye);
                const bronzeCompleted = bronzeMatches.length === 0 || bronzeMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.is_bye);
                isClassFinished = finalCompleted && bronzeCompleted; 
            }
        } else if (allPoolsFinished) {
            isClassFinished = true; 
        }

        let standingsHtml = '';
        let placementHtml = '';

        if (isClassFinished) {
            const finalRanking = calculateFinalRanking(standings, state.koMatches, state.allPlayers);
            
            const globalStats = {};
            state.allPlayers.forEach(p => {
                globalStats[p.id] = { wins: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0, endsWon: 0 };
            });
            
            const allCompletedMatches = [];
            state.groupMatches.forEach(gm => {
                (gm.matches || gm.data || []).forEach(pool => {
                    Object.values(pool.rounds || {}).flat().forEach(m => allCompletedMatches.push(m));
                });
            });
            state.koMatches.forEach(km => {
                (km.matches || km.data || []).forEach(m => allCompletedMatches.push(m));
            });

            allCompletedMatches.forEach(m => {
                // 🔥 IGNORA JOGOS CONTRA "BYE" PARA NÃO INFLACIONAR AS ESTATÍSTICAS DO ATLETA NO RELATÓRIO GERAL
                if (m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE') return;

                if (m.status === 'COMPLETED') {
                    const details = safeParse(m.details || m.match_details);
                    const isWO = details.is_wo === true;
                    const p1Id = m.entrant1_athlete_id || m.entrant1_id || m.entrant_a_id;
                    const p2Id = m.entrant2_athlete_id || m.entrant2_id || m.entrant_b_id;
                    const wId = m.winner_entrant_id || m.winner_id;

                    let s1 = Number(m.score1 ?? m.score_entrant1 ?? m.score_a) || 0;
                    let s2 = Number(m.score2 ?? m.score_entrant2 ?? m.score_b) || 0;
                    
                    if (isWO && s1 === 0 && s2 === 0) {
                        if (String(wId) === String(p1Id)) { s1 = 6; s2 = 0; }
                        else if (String(wId) === String(p2Id)) { s1 = 0; s2 = 6; }
                    }

                    let p1Ends = 0, p2Ends = 0;
                    if (!isWO && Array.isArray(details.p1_partials)) {
                        for(let i=0; i<4; i++) {
                            const v1 = details.p1_partials[i]; const v2 = details.p2_partials[i];
                            if ((v1 !== null && String(v1) !== '') || (v2 !== null && String(v2) !== '')) {
                                const e1 = Number(v1)||0; const e2 = Number(v2)||0;
                                if (e1 > e2) p1Ends++; else if (e2 > e1) p2Ends++;
                            }
                        }
                    }

                    if (p1Id && globalStats[p1Id]) {
                        globalStats[p1Id].pointsFor += s1;
                        globalStats[p1Id].pointsAgainst += s2;
                        globalStats[p1Id].endsWon += p1Ends;
                        if (String(wId) === String(p1Id)) globalStats[p1Id].wins++;
                    }
                    if (p2Id && globalStats[p2Id]) {
                        globalStats[p2Id].pointsFor += s2;
                        globalStats[p2Id].pointsAgainst += s1;
                        globalStats[p2Id].endsWon += p2Ends;
                        if (String(wId) === String(p2Id)) globalStats[p2Id].wins++;
                    }
                }
            });
            
            Object.values(globalStats).forEach(s => s.pointsDiff = s.pointsFor - s.pointsAgainst);

            finalRanking.forEach(p => {
                const st = globalStats[p.id] || {};
                p.wins = st.wins || 0;
                p.pointsFor = st.pointsFor || 0;
                p.pointsDiff = st.pointsDiff || 0;
                p.endsWon = st.endsWon || 0;
            });

            if (finalRanking.length > 0) {
                placementHtml = `
                  <h2 class="wb-section-title" style="margin-top: 0; color: #0f172a; font-weight: 900; text-transform: uppercase;">Classificação Final Geral</h2>
                  <div class="results-table-wrapper" style="margin-bottom: 40px; border: 2px solid #cbd5e1;">
                    <table class="results-table">
                      <thead>
                        <tr style="background: #f1f5f9;">
                          <th style="width: 80px; font-size: 13px;">Posição</th>
                          <th class="text-left" style="font-size: 13px;">Atleta / Equipe</th>
                          <th style="font-size: 13px;" title="Total de Vitórias no Torneio">Vitórias</th>
                          <th style="font-size: 13px;" title="Pontos Pró">Pró</th>
                          <th style="font-size: 13px; color:#0d6efd;" title="Parciais Vencidas no Torneio">Parciais</th>
                          <th style="font-size: 13px;" title="Saldo Final de Pontos">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${finalRanking.map(p => `
                          <tr>
                            <td><span class="wb-rank-badge ${p.finalPosition === 1 ? 'medal-1' : p.finalPosition === 2 ? 'medal-2' : p.finalPosition === 3 ? 'medal-3' : ''}" style="font-size: 16px; padding: 8px 16px;">${p.finalPosition}º</span></td>
                            <td class="text-left">
                              <div style="display:flex; align-items:center; gap: 12px;">
                                <div class="wb-bib-badge" style="width: 40px; height: 40px; font-size: 13px;">${escapeHTML(p.bib)}</div>
                                <div>
                                  <div class="player-name" style="font-size: 16px;">${escapeHTML(p.nome)}</div>
                                  <div class="player-club" style="font-size: 12px; color: #64748b;">${escapeHTML(p.clube_nome || p.clube_sigla || '-')}</div>
                                </div>
                              </div>
                            </td>
                            <td style="font-weight:bold; color:#16a34a; font-size:15px;">${p.wins}</td>
                            <td style="font-size:15px; font-weight:bold; color:#334155;">${p.pointsFor}</td>
                            <td style="font-weight:bold; color:#0d6efd; font-size:15px;">${p.endsWon}</td>
                            <td style="font-weight:bold; font-size:15px; color:${p.pointsDiff > 0 ? '#16a34a' : (p.pointsDiff < 0 ? '#dc2626' : '#475569')}">${p.pointsDiff > 0 ? '+'+p.pointsDiff : p.pointsDiff}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                `;
            }

            if (Object.keys(standings).length > 0) {
                standingsHtml += `<h2 class="wb-section-title" style="margin-top: 40px; border-top: 2px dashed #cbd5e1; padding-top: 30px;">Tabelas Finais - Fase de Grupos</h2>`;
                Object.keys(standings).sort().forEach(poolLetter => {
                    const pool = standings[poolLetter];
                    if (!pool.players || pool.players.length === 0) return;
                    
                    standingsHtml += `
                        <h3 style="color:#0f172a; margin-bottom:10px; font-size: 16px; text-transform: uppercase;">Grupo ${poolLetter}</h3>
                        <div class="results-table-wrapper" style="margin-bottom: 30px;">
                            <table class="results-table">
                                <thead>
                                    <tr>
                                        <th style="width: 50px;">Pos</th>
                                        <th style="text-align: left;">Atleta / Equipe</th>
                                        <th title="Jogos Disputados">J</th>
                                        <th title="Vitórias">V</th>
                                        <th title="Derrotas">D</th>
                                        <th title="Pontos a Favor (Pró)">Pró</th>
                                        <th title="Pontos Contra">Contra</th>
                                        <th title="Saldo de Pontos">Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${pool.players.map(p => `
                                        <tr>
                                            <td><span class="wb-rank-badge">${p.rank || '-'}º</span></td>
                                            <td style="text-align: left;">
                                                <div class="player-name">${escapeHTML(p.nome)}</div>
                                                <div class="player-club">${escapeHTML(p.clube_sigla || p.clube_nome)}</div>
                                            </td>
                                            <td style="font-weight:bold; font-size:14px;">${(p.wins || 0) + (p.losses || 0) || (p.played || 0)}</td>
                                            <td style="color:#16a34a; font-weight:bold; font-size:14px;">${p.wins || 0}</td>
                                            <td style="color:#dc2626; font-weight:bold; font-size:14px;">${p.played ? p.played - p.wins : 0}</td>
                                            <td style="font-size:14px;">${p.pointsFor || 0}</td>
                                            <td style="font-size:14px;">${p.pointsAgainst || 0}</td>
                                            <td style="font-weight:bold; font-size:14px; color:${p.pointsDiff > 0 ? '#16a34a' : (p.pointsDiff < 0 ? '#dc2626' : '#475569')}">${p.pointsDiff > 0 ? '+'+p.pointsDiff : p.pointsDiff || 0}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                });
            }
        } else {
            standingsHtml = `
                <div style="padding: 30px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; color: #64748b; text-align: center; margin: 40px 0; font-size: 16px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">🏆</div>
                    <strong style="color: #0f172a;">A Classificação Final está oculta.</strong><br>
                    O Pódio Geral e a Tabela de Grupos só serão exibidos após o término de todas as partidas da Fase Eliminatória (Mata-Mata).
                </div>
            `;
        }

        const styles = `
            <style>
                .wb-container { max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
                .wb-header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                .wb-class-badge { background-color: ${state.colors.bg}; color: ${state.colors.fg}; padding: 8px 20px; border-radius: 6px; font-size: 24px; font-weight: 900; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .wb-title-area h1 { margin: 0 0 5px 0; font-size: 26px; color: #0f172a; }
                .wb-title-area p { margin: 0; color: #64748b; font-size: 14px; }
                
                .btn-print { background: #0f172a; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .btn-print:hover { background: #1e293b; transform: translateY(-2px); }

                .results-section { margin-bottom: 40px; }
                .results-section-title { font-size: 16px; color: #16a34a; margin: 0 0 15px 0; font-weight: 900; border-bottom: 2px solid #dcfce7; padding-bottom: 5px; text-transform: uppercase; }
                
                .results-table-wrapper { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e2e8f0; }
                .results-table { width: 100%; border-collapse: collapse; font-size: 13px; }
                .results-table th { background: #f8fafc; color: #475569; font-weight: bold; text-transform: uppercase; font-size: 11px; padding: 12px 15px; text-align: center; border-bottom: 1px solid #cbd5e1; }
                .results-table td { padding: 12px 15px; text-align: center; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
                .results-table tr:last-child td { border-bottom: none; }
                
                .player-name { font-weight: 600; color: #334155; font-size: 14px; }
                .player-name.winner-text { color: #16a34a; font-weight: 900; }
                .player-club { font-size: 11px; color: #94a3b8; margin-top: 2px; text-transform: uppercase; font-weight: bold; }
                
                .score-badge { font-weight: bold; display: inline-flex; align-items: center; justify-content: center; }
                
                .wb-rank-badge { background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 4px; font-weight: 900; font-size: 12px; }
                .wb-bib-badge { background-color: #eff6ff; color: #3b82f6; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: bold; font-size: 11px; flex-shrink: 0; }

                .medal-1 { background-color: #fbbf24 !important; color: #fff !important; }
                .medal-2 { background-color: #94a3b8 !important; color: #fff !important; }
                .medal-3 { background-color: #b45309 !important; color: #fff !important; }

                @media print {
                    body * { visibility: hidden; }
                    .wb-container, .wb-container * { visibility: visible; }
                    .wb-container { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0; }
                    .btn-print, .btn-outline-secondary { display: none !important; }
                    .results-table-wrapper { box-shadow: none; border: 1px solid #000; }
                    .results-table th, .results-table td { border: 1px solid #000; padding: 8px !important; }
                    .results-section { page-break-inside: avoid; margin-bottom: 20px; }
                    .wb-section-title { page-break-before: always; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            </style>
        `;

        root.innerHTML = `
            ${styles}
            <div class="wb-container">
                <div class="wb-header-bar">
                    <div style="display: flex; align-items: center; gap: 20px;">
                        <div class="wb-class-badge">${escapeHTML(classCode)}</div>
                        <div class="wb-title-area">
                            <h1>Resultados Oficiais</h1>
                            <p>${escapeHTML(state.competition.nome || state.competition.name || 'Competição')}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-outline-secondary" onclick="window.history.back()" style="padding: 10px 20px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; cursor: pointer; font-weight: bold;">← Voltar</button>
                        <button class="btn-print" onclick="window.print()">🖨️ Imprimir Resultados</button>
                    </div>
                </div>

                ${placementHtml}
                
                ${matchesHtml}
                
                ${standingsHtml}
            </div>
        `;
    }

    loadData();
}