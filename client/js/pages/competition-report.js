// client/js/pages/competition-report.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export async function renderCompetitionReport(root, hashData) {
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const competitionId = idMatch ? idMatch[1] : (hashData ? hashData.id : null);

    if (!competitionId) {
        root.innerHTML = `<div style="padding:20px; color:red;">Erro: ID da competição ausente.</div>`;
        return;
    }

    const state = {
        competition: {}, classes: [], rankingsPerClass: {}, standingsPerClass: {}, 
        clubMedals: {}, allGMsRaw: [], allKOsRaw: [], allPoolsRaw: [], athletesByClub: {}, officials: [], allAthletes: []
    };

    let isAdmin = false;
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        isAdmin = !!user;
        if (Object.keys(state.competition).length > 0) render();
    });

    function escapeHTML(s = '') { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
    function safeParse(data) {
        if (!data) return {}; if (typeof data === 'object') return data;
        try { let p = JSON.parse(data); return typeof p === 'object' && p !== null ? p : {}; } catch(e) { return {}; }
    }

    const API = {
        loadEverything: async () => {
            const compSnap = await getDoc(doc(db, "competitions", String(competitionId)));
            if (compSnap.exists()) state.competition = compSnap.data();

            const athSnap = await getDocs(collection(db, "atletas"));
            state.allAthletes = athSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const qOff = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
            const snapOff = await getDocs(qOff);
            if (!snapOff.empty) state.officials = snapOff.docs[0].data().officials || [];

            const qClasses = query(collection(db, "competition_classes"), where("competition_id", "==", String(competitionId)));
            const snapClasses = await getDocs(qClasses);
            state.classes = snapClasses.docs.map(d => d.data().class_code).sort();

            const qDraw = query(collection(db, "draws"), where("competition_id", "==", String(competitionId)));
            const snapDraw = await getDocs(qDraw);
            state.allPoolsRaw = snapDraw.docs.map(d => d.data());

            const qGM = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
            const snapGM = await getDocs(qGM);
            state.allGMsRaw = snapGM.docs.map(d => d.data());

            const qKO = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
            const snapKO = await getDocs(qKO);
            state.allKOsRaw = snapKO.docs.map(d => d.data());

            state.rankingsPerClass = {};
            state.clubMedals = {};
            state.athletesByClub = {};

            for (const cCode of state.classes) {
                const drawData = state.allPoolsRaw.find(d => d.class_code === cCode) || {};
                const gmData = state.allGMsRaw.find(d => d.class_code === cCode) || {};
                const koData = state.allKOsRaw.find(d => d.class_code === cCode) || {};

                const pools = drawData.data || drawData.groups || drawData.draw_data || [];
                const groupMatchesArray = gmData.matches || gmData.data || [];
                const koMatchesArray = koData.matches || koData.data || [];

                let allPlayers = [];
                pools.forEach(pool => { 
                    if (pool.players) {
                        pool.players.forEach(p => {
                            if (p.id === 'BYE') return; // 🔥 Ignora atletas BYE na contagem de clubes
                            allPlayers.push(p);
                            const clu = p.clube_nome || p.clube_sigla || "Independente";
                            if(!state.athletesByClub[clu]) state.athletesByClub[clu] = [];
                            
                            const athInfo = state.allAthletes.find(a => String(a.id) === String(p.id));
                            if(!state.athletesByClub[clu].find(x => x.id === p.id)) {
                                state.athletesByClub[clu].push({ 
                                    name: p.nome, 
                                    class: cCode, 
                                    id: p.id,
                                    operador_rampa: athInfo ? athInfo.operador_rampa : null
                                });
                            }
                        });
                    }
                });

                const standings = calculatePoolStandings(pools, groupMatchesArray);
                const ranking = calculateFinalRanking(standings, koMatchesArray, allPlayers);

                state.standingsPerClass[cCode] = standings;
                state.rankingsPerClass[cCode] = ranking.map(r => {
                    const athInfo = state.allAthletes.find(a => String(a.id) === String(r.id));
                    return { ...r, operador_rampa: athInfo ? athInfo.operador_rampa : null };
                });

                ranking.forEach(atleta => {
                    const clube = atleta.clube_nome || atleta.clube_sigla || "Independente";
                    if (!state.clubMedals[clube]) state.clubMedals[clube] = { ouro: 0, prata: 0, bronze: 0, pos4: 0, pos5: 0, pos6: 0, total: 0 };
                    if (atleta.finalPosition === 1) { state.clubMedals[clube].ouro++; state.clubMedals[clube].total++; }
                    else if (atleta.finalPosition === 2) { state.clubMedals[clube].prata++; state.clubMedals[clube].total++; }
                    else if (atleta.finalPosition === 3) { state.clubMedals[clube].bronze++; state.clubMedals[clube].total++; }
                    else if (atleta.finalPosition === 4) state.clubMedals[clube].pos4++;
                    else if (atleta.finalPosition === 5) state.clubMedals[clube].pos5++;
                    else if (atleta.finalPosition === 6) state.clubMedals[clube].pos6++;
                });
            }
        },
        approveResults: async () => {
            if(!confirm("Aprovar os resultados publicará a Classificação Final no histórico. Continuar?")) return;
            try {
                const qHist = query(collection(db, "historical_results"), where("competition_id", "==", String(competitionId)));
                const snapHist = await getDocs(qHist);
                await Promise.all(snapHist.docs.map(d => deleteDoc(doc(db, "historical_results", d.id))));
                const insertPromises = [];
                for (const cCode of state.classes) {
                    (state.rankingsPerClass[cCode] || []).forEach(a => {
                        insertPromises.push(addDoc(collection(db, "historical_results"), {
                            competition_id: String(competitionId), class_code: cCode, athlete_id: String(a.id),
                            atleta_nome: a.nome, club_id: String(a.clube_id || ''), clube_nome: a.clube_sigla || a.clube_nome || '', rank: a.finalPosition
                        }));
                    });
                }
                await Promise.all(insertPromises);
                await updateDoc(doc(db, "competitions", String(competitionId)), { results_approved: true, status: "FINISHED" });
                alert("Resultados Aprovados!");
                window.location.hash = `#/resultados`;
            } catch (e) { alert("Erro: " + e.message); }
        }
    };

    function calculatePoolStandings(pools, groupMatchesArray) {
        const standings = {};
        pools.forEach((pool, index) => {
            const poolLetter = String.fromCharCode(65 + index);
            let poolMatchData = groupMatchesArray.find(pm => String(pm.pool_id) === String(pool.id) || String(pm.pool_name).toLowerCase() === String(pool.name).toLowerCase());
            const matches = Object.values(poolMatchData?.rounds || {}).flat();
            
            let poolMaxDiff = 6;
            const stats = {};
            (pool.players || []).filter(p => p.id !== 'BYE').forEach(p => { 
                stats[p.id] = { ...p, wins: 0, losses: 0, played: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0 }; 
            });

            matches.forEach(m => {
                const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye === true || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';
                if (isBye) return; // 🔥 FILTRO BYE: Não conta estatística para folgas

                if (m.status === 'COMPLETED') {
                    const det = safeParse(m.details); const isWO = det.is_wo === true; const wId = m.winner_entrant_id || m.winner_id;
                    let s1 = Number(m.score1??m.score_a)||0; let s2 = Number(m.score2??m.score_b)||0;
                    if (isWO) { if (String(wId) === String(m.entrant1_id)) { s1=6; s2=0; } else { s1=0; s2=6; } }
                    const p1Id = m.entrant1_athlete_id||m.entrant1_id; const p2Id = m.entrant2_athlete_id||m.entrant2_id;
                    if (p1Id && stats[p1Id]) { stats[p1Id].played++; stats[p1Id].pointsFor+=s1; stats[p1Id].pointsAgainst+=s2; if(String(wId)===String(p1Id)) stats[p1Id].wins++; else stats[p1Id].losses++; }
                    if (p2Id && stats[p2Id]) { stats[p2Id].played++; stats[p2Id].pointsFor+=s2; stats[p2Id].pointsAgainst+=s1; if(String(wId)===String(p2Id)) stats[p2Id].wins++; else stats[p2Id].losses++; }
                }
            });

            const ranked = Object.values(stats).sort((a,b) => b.wins - a.wins || b.pointsDiff - a.pointsDiff || b.pointsFor - a.pointsFor);
            standings[poolLetter] = { players: ranked.map((p, i) => ({ ...p, rank: i + 1 })) };
        });
        return standings;
    }

    function calculateFinalRanking(standings, koMatchesArray, allPlayers) {
        const ranking = [];
        const getIds = (m) => { const wId = m.winner_entrant_id||m.winner_id; const e1Id = m.entrant1_id; return { wId, lId: String(wId)===String(e1Id)?(m.entrant2_id):e1Id }; };
        const addPlayer = (id, pos, phase) => { if(!id || id === 'BYE') return; const p = allPlayers.find(pl=>String(pl.id)===String(id)); if(p && !ranking.find(r=>r.id===p.id)) ranking.push({...p, finalPosition: pos, phase}); };
        
        const koM = koMatchesArray.filter(m => {
             return m.status !== 'BYE' && m.status !== 'SCHEDULED_WITH_BYE' && !m.is_bye && String(m.entrant1_name).toUpperCase() !== 'BYE' && String(m.entrant2_name).toUpperCase() !== 'BYE';
        });

        const finals = koM.filter(m => m.round_name === 'Final');
        if (finals.length > 0 && finals[0].status === 'COMPLETED') { const { wId, lId } = getIds(finals[0]); addPlayer(wId, 1, 'Ouro'); addPlayer(lId, 2, 'Prata'); }
        
        const bronze = koM.filter(m => m.round_name === '3rd Place');
        if (bronze.length > 0 && bronze[0].status === 'COMPLETED') { const { wId, lId } = getIds(bronze[0]); addPlayer(wId, 3, 'Bronze'); addPlayer(lId, 4, '4º Lugar'); }
        
        const quarters = koM.filter(m => m.round_name === 'Quarter Final');
        if (quarters.length > 0) {
            let qf = [];
            quarters.forEach(m => { if (m.status === 'COMPLETED') { const { lId } = getIds(m); qf.push({ id: lId, pDiff: (Number(m.score2)-Number(m.score1)) }); }});
            qf.sort((a,b)=>b.pDiff-a.pDiff).forEach((l,i)=>addPlayer(l.id, 5+i, 'Quartas de Final'));
        }

        let poolRemaining = [];
        Object.values(standings).forEach(pool => pool.players.forEach(p => { if (!ranking.find(r => r.id === p.id)) poolRemaining.push({...p, poolRank: p.rank}); }));
        poolRemaining.sort((a,b) => a.poolRank-b.poolRank || b.wins-a.wins).forEach(p => { if(!ranking.find(r=>r.id===p.id)) ranking.push({...p, finalPosition: ranking.length+1, phase: 'Fase de Grupos'}); });
        return ranking;
    }

    function renderReportScoreSheet(m, roundMaxDiff = 6, cCode = '') {
        const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';
        if (isBye) return ''; // 🔥 FILTRO BYE: Não gera linha de jogo no relatório para folgas

        const isCompleted = m.status === 'COMPLETED';
        const details = safeParse(m.details || m.match_details);
        let s1 = Number(m.score1 ?? m.score_a) || 0;
        let s2 = Number(m.score2 ?? m.score_b) || 0;
        const is1W = isCompleted && String(m.winner_entrant_id) === String(m.entrant1_id);
        const is2W = isCompleted && String(m.winner_entrant_id) === String(m.entrant2_id);

        const ref = state.officials.find(o => String(o.referee_id || o.id) === String(m.referee_id));
        const refName = ref ? (ref.nome_abreviado || ref.nome) : '-';

        let rampa1 = ''; let rampa2 = '';
        if (cCode.toUpperCase().includes('BC3')) {
            const a1 = state.allAthletes.find(a => String(a.id) === String(m.entrant1_athlete_id));
            if (a1?.operador_rampa) rampa1 = ` <small>(Op: ${a1.operador_rampa})</small>`;
            const a2 = state.allAthletes.find(a => String(a.id) === String(m.entrant2_athlete_id));
            if (a2?.operador_rampa) rampa2 = ` <small>(Op: ${a2.operador_rampa})</small>`;
        }

        return `
        <div style="border: 1px solid #000; margin-bottom: 5px; font-size: 11px; page-break-inside: avoid; display: flex; align-items: center; padding: 4px;">
            <b style="width: 80px;">JOGO ${m.match_number||'-'}</b>
            <div style="flex:1; text-align:right; ${is1W?'font-weight:bold; color:green;':''}">
                ${escapeHTML(m.entrant1_name)} ${rampa1} <small>(${escapeHTML(m.entrant1_club_sigla || '-')})</small>
            </div>
            <div style="width:60px; text-align:center; font-weight:900; font-size:13px;">
                ${isCompleted ? `${s1} x ${s2}` : '- x -'}
            </div>
            <div style="flex:1; text-align:left; ${is2W?'font-weight:bold; color:green;':''}">
                <small>(${escapeHTML(m.entrant2_club_sigla || '-')})</small> ${escapeHTML(m.entrant2_name)} ${rampa2}
            </div>
            <div style="width:120px; text-align:right; font-size:9px; color:#555;">Ref: ${refName}</div>
        </div>`;
    }

    function render() {
        const sortedClubs = Object.entries(state.clubMedals).map(([nome, m]) => ({ nome, ...m }))
            .sort((a, b) => b.ouro - a.ouro || b.prata - a.prata || b.bronze - a.bronze || b.total - a.total);

        const dtObj = state.officials.find(o => String(o.role).toLowerCase().includes('delegado'));
        const dtName = dtObj ? (dtObj.nome_completo || dtObj.nome) : '________________________________________';

        const styles = `
            <style>
                .report-wrapper { max-width: 900px; margin: 0 auto; padding: 30px; font-family: sans-serif; background: #fff; color: #000; }
                h1, h2, h3, h4 { text-transform: uppercase; margin-top: 25px; border-bottom: 1px solid #000; padding-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
                th, td { border: 1px solid #000; padding: 6px; text-align: center; }
                th { background: #f0f0f0; }
                .text-left { text-align: left !important; }
                .page-break { page-break-before: always; }
                .header-relatorio { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 15px;}
                .nav-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1; }
                .btn { background: #0f172a; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; }
                @media print { .no-print { display: none !important; } .report-wrapper { padding: 0; } }
            </style>
        `;

        let htmlContent = `
            ${styles}
            <div class="report-wrapper">
                <div class="nav-bar no-print">
                    <button class="btn" style="background:#64748b;" onclick="window.history.back()">← Voltar</button>
                    <div style="display:flex; gap:10px;">
                        <button class="btn" onclick="window.print()">🖨️ Imprimir</button>
                        ${isAdmin && state.competition.status !== 'FINISHED' ? `<button class="btn" style="background:#16a34a;" id="btn-approve">✅ Finalizar Competição</button>` : ''}
                    </div>
                </div>

                <div class="header-relatorio">
                    <h1 style="border:none; margin:0; font-size:24px;">RELATÓRIO TÉCNICO OFICIAL</h1>
                    <p style="font-size:16px; margin:5px 0;"><strong>${escapeHTML(state.competition.nome)}</strong></p>
                    <p style="font-size:12px;">${escapeHTML(state.competition.local || '')} | ${escapeHTML(state.competition.data_inicio || '')}</p>
                </div>

                <h2>1. Resumo de Inscritos por Clube</h2>
                <table>
                    <thead>
                        <tr><th class="text-left">Clube</th>${state.classes.map(c => `<th>${c}</th>`).join('')}<th>Total</th></tr>
                    </thead>
                    <tbody>
                        ${Object.keys(state.athletesByClub).sort().map(clube => {
                            let total = 0;
                            return `<tr>
                                <td class="text-left"><b>${clube}</b></td>
                                ${state.classes.map(c => { const cnt = state.athletesByClub[clube].filter(a => a.class === c).length; total += cnt; return `<td>${cnt || '-'}</td>`; }).join('')}
                                <td style="font-weight:bold;">${total}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>

                <h2>2. Quadro Geral de Medalhas</h2>
                <table>
                    <thead><tr><th>Pos</th><th class="text-left">Clube</th><th>🥇 Ouro</th><th>🥈 Prata</th><th>🥉 Bronze</th><th>Total</th></tr></thead>
                    <tbody>${sortedClubs.map((c, i) => `<tr><td>${i+1}º</td><td class="text-left">${c.nome}</td><td>${c.ouro}</td><td>${c.prata}</td><td>${c.bronze}</td><td><b>${c.total}</b></td></tr>`).join('')}</tbody>
                </table>

                <div class="page-break"></div>
                <h2 style="text-align:center;">3. Resultados Detalhados</h2>
        `;

        state.classes.forEach(cCode => {
            const gmData = state.allGMsRaw.find(m => m.class_code === cCode) || {};
            const pools = gmData.matches || gmData.data || [];
            const koData = state.allKOsRaw.find(m => m.class_code === cCode) || {};
            const koM = koData.matches || koData.data || [];
            const rnk = state.rankingsPerClass[cCode] || [];

            htmlContent += `
                <div style="margin-top:30px; border-top: 2px solid #000; padding-top:10px;">
                    <h3 style="background:#000; color:#fff; padding:5px 15px;">CLASSE ${cCode}</h3>
            `;

            if (pools.length > 0) {
                htmlContent += `<h4>Fase de Grupos</h4>`;
                pools.forEach(p => {
                    Object.keys(p.rounds || {}).sort().forEach(r => {
                        p.rounds[r].forEach(m => { htmlContent += renderReportScoreSheet(m, 6, cCode); });
                    });
                });
            }

            if (koM.length > 0) {
                htmlContent += `<h4>Eliminatórias</h4>`;
                koM.forEach(m => { htmlContent += renderReportScoreSheet(m, 6, cCode); });
            }

            if (rnk.length > 0) {
                htmlContent += `<h4>Classificação Final - ${cCode}</h4>
                <table>
                    <thead><tr><th style="width:40px;">Pos</th><th class="text-left">Atleta</th><th class="text-left">Clube</th></tr></thead>
                    <tbody>${rnk.map(a => `<tr><td><b>${a.finalPosition}º</b></td><td class="text-left">${escapeHTML(a.nome)}</td><td class="text-left">${escapeHTML(a.clube_sigla || '-')}</td></tr>`).join('')}</tbody>
                </table>`;
            }
            htmlContent += `</div>`;
        });

        htmlContent += `
                <div style="margin-top: 60px; text-align: center; page-break-inside: avoid;">
                    <div style="display:inline-block; width: 300px; border-top: 1px solid #000; padding-top:5px;">
                        <strong style="font-size: 14px;">${escapeHTML(dtName)}</strong><br>
                        <span>Delegado Técnico</span>
                    </div>
                </div>
            </div>`;

        root.innerHTML = htmlContent;
        if (isAdmin) {
            const btnApp = document.getElementById('btn-approve');
            if(btnApp) btnApp.onclick = API.approveResults;
        }
    }

    await API.loadEverything();
}