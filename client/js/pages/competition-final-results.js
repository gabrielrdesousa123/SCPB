// client/js/pages/competition-final-results.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export async function renderCompetitionFinalResults(root, hashData) {
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const competitionId = idMatch ? idMatch[1] : (hashData ? hashData.id : null);

    if (!competitionId) {
        root.innerHTML = `<div style="padding:20px; color:red;">Erro: ID da competição ausente.</div>`;
        return;
    }

    const state = {
        competition: {}, classes: [], rankingsPerClass: {}, clubMedals: {}, allAthletes: []
    };

    let isAdmin = false;
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        isAdmin = !!user;
        if (Object.keys(state.competition).length > 0) render(); 
    });

    function escapeHTML(s = '') { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
    function safeParse(data) { try { let p = JSON.parse(data); return typeof p === 'object' && p !== null ? p : {}; } catch(e) { return {}; } }

    const API = {
        loadEverything: async () => {
            const compSnap = await getDoc(doc(db, "competitions", String(competitionId)));
            if (compSnap.exists()) state.competition = compSnap.data();

            const athSnap = await getDocs(collection(db, "atletas"));
            state.allAthletes = athSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const qClasses = query(collection(db, "competition_classes"), where("competition_id", "==", String(competitionId)));
            const snapClasses = await getDocs(qClasses);
            state.classes = snapClasses.docs.map(d => d.data().class_code).sort();

            const qDraw = query(collection(db, "draws"), where("competition_id", "==", String(competitionId)));
            const snapDraw = await getDocs(qDraw);
            const allPoolsRaw = snapDraw.docs.map(d => d.data());

            const qGM = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
            const snapGM = await getDocs(qGM);
            const allGMsRaw = snapGM.docs.map(d => d.data());

            const qKO = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
            const snapKO = await getDocs(qKO);
            const allKOsRaw = snapKO.docs.map(d => d.data());

            state.rankingsPerClass = {};
            state.clubMedals = {};

            for (const cCode of state.classes) {
                const drawData = allPoolsRaw.find(d => d.class_code === cCode) || {};
                const gmData = allGMsRaw.find(d => d.class_code === cCode) || {};
                const koData = allKOsRaw.find(d => d.class_code === cCode) || {};

                const pools = drawData.data || drawData.groups || drawData.draw_data || [];
                const groupMatchesArray = gmData.matches || gmData.data || [];
                const koMatchesArray = koData.matches || koData.data || [];

                let allPlayers = [];
                pools.forEach(pool => { if (pool.players) pool.players.forEach(p => allPlayers.push(p)); });

                const standings = calculatePoolStandings(pools, groupMatchesArray);
                
                // 🔥 VERIFICAÇÃO SE O TORNEIO ESTÁ REALMENTE CONCLUÍDO NESSA CLASSE ANTES DE RANKING
                let isClassFinished = false;
                const flatKOMatches = koMatchesArray.flatMap(km => km.matches || km.data || []);
                const allPoolsFinished = pools.length > 0 && Object.keys(standings).length > 0 && Object.values(standings).every(p => p.isFinished);
                
                if (flatKOMatches.length > 0) {
                    const finalsMatches = flatKOMatches.filter(m => m.round_name === 'Final' || m.round === 'Final');
                    const bronzeMatches = flatKOMatches.filter(m => m.round_name === 'Disputa de 3º Lugar' || String(m.round_name).includes('3º'));
                    
                    if (finalsMatches.length > 0) {
                        const finalCompleted = finalsMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.is_bye);
                        const bronzeCompleted = bronzeMatches.length === 0 || bronzeMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.is_bye);
                        isClassFinished = finalCompleted && bronzeCompleted; 
                    }
                } else if (allPoolsFinished) {
                    isClassFinished = true;
                }

                // Se não terminou ou foi resetado (0 jogos), pula a computação de medalhas!
                if (!isClassFinished) continue; 

                const ranking = calculateFinalRanking(standings, koMatchesArray, allPlayers);
                
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
                });
            }
        }
    };

    function calculatePoolStandings(pools, groupMatchesArray) {
        const standings = {};
        pools.forEach((pool, index) => {
            const poolLetter = String.fromCharCode(65 + index);
            let poolMatchData = groupMatchesArray.find(pm => String(pm.pool_id) === String(pool.id) || String(pm.pool_name).toLowerCase() === String(pool.name).toLowerCase());
            const matches = Object.values(poolMatchData?.rounds || {}).flat();
            
            let poolMaxDiff = 6;
            matches.forEach(m => { 
                if (m.status === 'COMPLETED') { 
                    const det = safeParse(m.details); 
                    if (!det.is_wo) { 
                        const diff = Math.abs((Number(m.score1??m.score_a)||0) - (Number(m.score2??m.score_b)||0)); 
                        if (diff>poolMaxDiff) poolMaxDiff=diff; 
                    } 
                } 
            });
            
            const stats = {};
            (pool.players || []).forEach(p => { stats[p.id] = { ...p, wins: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0 }; });
            
            matches.forEach(m => {
                const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye === true || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';
                if (isBye) return;

                if (m.status === 'COMPLETED') {
                    const det = safeParse(m.details); const isWO = det.is_wo === true; const wId = m.winner_entrant_id || m.winner_id;
                    let s1 = Number(m.score1??m.score_a)||0; let s2 = Number(m.score2??m.score_b)||0;
                    if (isWO) { if (String(wId) === String(m.entrant1_id||m.entrant_a_id)) { s1=poolMaxDiff; s2=0; } else { s1=0; s2=poolMaxDiff; } }
                    const p1Id = m.entrant1_athlete_id||m.entrant1_id||m.entrant_a_id; const p2Id = m.entrant2_athlete_id||m.entrant2_id||m.entrant_b_id;
                    if (p1Id && stats[p1Id]) { stats[p1Id].pointsFor+=s1; stats[p1Id].pointsAgainst+=s2; if(String(wId)===String(p1Id)) stats[p1Id].wins++; }
                    if (p2Id && stats[p2Id]) { stats[p2Id].pointsFor+=s2; stats[p2Id].pointsAgainst+=s1; if(String(wId)===String(p2Id)) stats[p2Id].wins++; }
                }
            });
            
            Object.values(stats).forEach(s => s.pointsDiff = s.pointsFor - s.pointsAgainst);
            const ranked = Object.values(stats).sort((a,b) => b.wins - a.wins || b.pointsDiff - a.pointsDiff || b.pointsFor - a.pointsFor);
            
            const hasMatches = matches.length > 0;
            const isFinished = hasMatches && matches.every(m => m.status === 'COMPLETED' || m.status === 'SCHEDULED_WITH_BYE' || m.status === 'BYE' || !m.entrant2_id);

            standings[poolLetter] = { isFinished: isFinished, players: ranked.map((p, i) => ({ ...p, rank: i + 1 })) };
        });
        return standings;
    }

    function calculateFinalRanking(standings, koMatchesArray, allPlayers) {
        const ranking = [];
        const finals = koMatchesArray.flatMap(km => km.matches || km.data || []).filter(m => m.round_name === 'Final' || m.round === 'Final');
        const bronze = koMatchesArray.flatMap(km => km.matches || km.data || []).filter(m => m.round_name === '3rd Place' || m.round === '3rd Place' || String(m.round_name).includes('3º'));
        const quarters = koMatchesArray.flatMap(km => km.matches || km.data || []).filter(m => m.round_name === 'Quarter Final' || m.round === 'Quarter Final' || String(m.round_name).includes('Quartas'));
        const playoffs = koMatchesArray.flatMap(km => km.matches || km.data || []).filter(m => m.round_name === 'Playoffs' || m.round === 'Playoffs');

        const getIds = (m) => { const wId = m.winner_entrant_id||m.winner_id; const e1Id = m.entrant1_id||m.entrant_a_id; return { wId, lId: String(wId)===String(e1Id)?(m.entrant2_id||m.entrant_b_id):e1Id }; };
        const addPlayer = (id, pos, phase) => { if(!id || id==='BYE') return; const p = allPlayers.find(pl=>String(pl.id)===String(id)); if(p && !ranking.find(r=>r.id===p.id)) ranking.push({...p, finalPosition: pos, phase}); };
        
        if (finals.length > 0 && finals[0].status === 'COMPLETED') { const { wId, lId } = getIds(finals[0]); addPlayer(wId, 1, 'Ouro'); addPlayer(lId, 2, 'Prata'); }
        if (bronze.length > 0 && bronze[0].status === 'COMPLETED') { const { wId, lId } = getIds(bronze[0]); addPlayer(wId, 3, 'Bronze'); addPlayer(lId, 4, '4º Lugar'); }
        
        if (quarters.length > 0) {
            let qf = [];
            quarters.forEach(m => { 
                const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye === true || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';
                if (!isBye && m.status === 'COMPLETED') { 
                    const { lId } = getIds(m); 
                    const scFor = String(m.winner_id)===String(m.entrant1_id) ? m.score2 : m.score1; 
                    const scAg = String(m.winner_id)===String(m.entrant1_id) ? m.score1 : m.score2; 
                    qf.push({ id: lId, pDiff: (scFor||0)-(scAg||0), pFor: scFor||0 }); 
                }
            });
            qf.sort((a,b)=>b.pDiff-a.pDiff || b.pFor-a.pFor).forEach((l,i)=>addPlayer(l.id, 5+i, 'Quartas de Final'));
        }
        
        if (playoffs.length > 0) {
            let pf = [];
            playoffs.forEach(m => { 
                const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye === true || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';
                if (!isBye && m.status === 'COMPLETED') { 
                    const { lId } = getIds(m); 
                    const scFor = String(m.winner_id)===String(m.entrant1_id) ? m.score2 : m.score1; 
                    const scAg = String(m.winner_id)===String(m.entrant1_id) ? m.score1 : m.score2; 
                    pf.push({ id: lId, pDiff: (scFor||0)-(scAg||0), pFor: scFor||0 }); 
                }
            });
            pf.sort((a,b)=>b.pDiff-a.pDiff || b.pFor-a.pFor).forEach((l,i)=>addPlayer(l.id, (quarters.length>0?9:5)+i, 'Playoffs'));
        }

        let poolRemaining = [];
        Object.values(standings).forEach(pool => pool.players.forEach(p => { if (!ranking.find(r => r.id === p.id)) poolRemaining.push({...p, poolRank: p.rank}); }));
        poolRemaining.sort((a,b) => a.poolRank-b.poolRank || b.wins-a.wins || b.pointsDiff-a.pointsDiff).forEach(p => { if(!ranking.find(r=>r.id===p.id)) ranking.push({...p, finalPosition: ranking.length+1, phase: 'Fase de Grupos'}); });
        return ranking;
    }

    function render() {
        const isFinished = state.competition.status === 'FINISHED' || state.competition.results_approved === true;
        const showAdminControls = isAdmin && !isFinished;

        const sortedClubs = Object.entries(state.clubMedals).map(([nome, m]) => ({ nome, ...m }))
            .sort((a, b) => b.ouro - a.ouro || b.prata - a.prata || b.bronze - a.bronze || b.pos4 - a.pos4 || b.pos5 - a.pos5 || b.total - a.total);

        for (let i = 0; i < sortedClubs.length; i++) { sortedClubs[i].rank = i + 1; sortedClubs[i].tieBreaker = '-'; }
        for (let i = 1; i < sortedClubs.length; i++) {
            const prev = sortedClubs[i - 1]; const curr = sortedClubs[i];
            if (prev.ouro === curr.ouro && prev.prata === curr.prata && prev.bronze === curr.bronze) {
                let tbReason = '';
                if (prev.pos4 !== curr.pos4) tbReason = 'Maior nº de 4º Lugares';
                else if (prev.pos5 !== curr.pos5) tbReason = 'Maior nº de 5º Lugares';
                if (tbReason) curr.tieBreaker = `Critério: ${tbReason}`; else { curr.rank = prev.rank; curr.tieBreaker = 'Empate Absoluto'; }
            }
        }

        const styles = `
            <style>
                .final-container { max-width: 1000px; margin: 0 auto; padding: 40px 20px; font-family: sans-serif; background: #fff; }
                .final-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                .final-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                .final-table th { background: #0f172a; color: white; padding: 12px; font-size: 13px; text-transform: uppercase; }
                .final-table td { padding: 12px; border: 1px solid #e2e8f0; text-align: center; font-size: 14px; }
                .text-left { text-align: left !important; }
                .btn-final { background: #0f172a; color: #fff; border: none; padding: 12px 25px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; }
                .btn-update { background: #3b82f6; margin-right: 10px; }
                @media print { .no-print { display: none !important; } }
            </style>
        `;

        let html = `
            ${styles}
            <div class="final-container">
                <div class="no-print" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1;">
                    <button onclick="window.history.back()" style="padding:10px 20px; cursor:pointer; background:white; border:1px solid #ccc; border-radius:6px; font-weight:bold;">← Voltar</button>
                    <div style="display:flex; align-items:center;">
                        ${showAdminControls ? `<button class="btn-final btn-update" id="btn-update">🔄 Atualizar Cálculos</button>` : ''}
                        <button class="btn-final" onclick="window.print()">🖨️ Imprimir Pódio</button>
                    </div>
                </div>

                <div class="final-header">
                    <h1 style="margin:0; font-size:28px;">QUADRO GERAL DE MEDALHAS</h1>
                    <p style="margin:5px 0; color:#475569; font-weight:bold; font-size:18px;">${escapeHTML(state.competition.nome || "Competição")}</p>
                </div>
        `;

        if (Object.keys(state.rankingsPerClass).length === 0) {
            html += `<div style="text-align:center; padding:50px; color:#64748b; font-size:18px; border:2px dashed #cbd5e1; border-radius:8px;">O Quadro Geral ficará disponível quando as finais da primeira classe forem concluídas.</div>`;
        } else {
            html += `
                <table class="final-table">
                    <thead><tr><th>Pos</th><th class="text-left">Clube</th><th>🥇</th><th>🥈</th><th>🥉</th><th>Total</th><th class="text-left">Desempate</th></tr></thead>
                    <tbody>${sortedClubs.map(c => `<tr><td style="font-weight:900;">${c.rank}º</td><td class="text-left"><strong>${c.nome}</strong></td><td>${c.ouro}</td><td>${c.prata}</td><td>${c.bronze}</td><td style="background:#f8fafc; font-weight:900;">${c.total}</td><td class="text-left" style="font-size:11px; font-style:italic;">${c.tieBreaker !== '-' ? c.tieBreaker : ''}</td></tr>`).join('')}</tbody>
                </table>
                <h2 style="font-size:20px; margin-top:50px; border-bottom:2px solid #eee; padding-bottom:10px;">🏅 RESULTADOS POR CLASSE</h2>
                ${state.classes.filter(c => state.rankingsPerClass[c]).map(c => {
                    const isBC3 = c.toUpperCase().includes('BC3');
                    return `
                    <div style="margin-bottom:30px;">
                        <h3 style="background:#f1f5f9; padding:10px; margin:0;">CLASSE ${c}</h3>
                        <table class="final-table">
                            <tbody>
                                ${(state.rankingsPerClass[c] || []).map(a => `
                                <tr>
                                    <td style="width:50px; font-weight:bold;">${a.finalPosition}º</td>
                                    <td class="text-left">
                                        <div style="font-weight:bold;">${escapeHTML(a.nome)}</div>
                                        ${isBC3 && a.operador_rampa ? `<div style="font-size:11px; color:#64748b;">Op. Rampa: ${escapeHTML(a.operador_rampa)}</div>` : ''}
                                    </td>
                                    <td class="text-left" style="color:#64748b;">${escapeHTML(a.clube_sigla || '')}</td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}).join('')}
            `;
        }

        html += `</div>`;
        root.innerHTML = html;

        if (showAdminControls) {
            document.getElementById('btn-update').onclick = async () => { root.innerHTML = `<div style="text-align:center; padding:50px;">Atualizando...</div>`; await API.loadEverything(); render(); };
        }
    }

    root.innerHTML = `<div style="text-align:center; padding:50px;">Carregando Resultados Oficiais...</div>`;
    await API.loadEverything();
    render();
}