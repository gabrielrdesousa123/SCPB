// client/js/pages/call-room-tv.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function escapeHTML(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

function cleanName(n) {
    if (!n) return 'A Definir';
    const s = String(n).trim();
    const l = s.toLowerCase();
    if (l.includes('atleta vermelho') || l.includes('atleta azul') || l === '-' || l === 'bye') return 'A Definir';
    return s;
}

function extractName(m, side) {
    let n = side === 1 ? (m.p1_name || m.entrant1_name || m.entrant_a_name) : (m.p2_name || m.entrant2_name || m.entrant_b_name);
    return cleanName(n);
}

function extractBib(m, side) {
    let b = side === 1 ? (m.p1_bib || m.entrant1_bib || m.entrant_a_bib) : (m.p2_bib || m.entrant2_bib || m.entrant_b_bib);
    if (!b || String(b).trim() === 'null' || String(b).trim() === '-' || String(b).trim() === 'undefined') return '';
    return String(b).trim();
}

function extractClubFull(m, side) { 
    let c = side === 1 ? (m.p1_club_nome || m.p1_club_sigla || m.p1_club || m.entrant1_club_nome || m.entrant_a_club_nome) :
                         (m.p2_club_nome || m.p2_club_sigla || m.p2_club || m.entrant2_club_nome || m.entrant_b_club_nome);
    if (!c || String(c).trim() === 'null' || String(c).trim() === '-' || String(c).trim() === 'undefined') return '';
    return String(c).trim();
}

function safeParse(data) { if (!data) return {}; if (typeof data === 'object') return data; try { let p = JSON.parse(data); return typeof p === 'object' && p !== null ? p : {}; } catch(e) { return {}; } }

function formatMatchTitle(m) {
    const isGroup = m.match_type === 'GROUP' || (m.round_name && m.round_name.toLowerCase().includes('round')) || m.pool_id;
    let mNum = (m.match_number && String(m.match_number) !== 'null') ? `J${m.match_number}` : '';
    
    let endStr = '';
    if (isGroup) {
        endStr = mNum || 'Grupo';
    } else {
        let rLabel = m.round_name || 'Eliminatórias';
        const map = {'Quarter Final': 'QF', 'Semi-Final': 'SF', 'Playoffs': 'PO', 'Final': 'Final', '3rd Place': '3º Lugar'};
        rLabel = map[rLabel] || rLabel;
        endStr = mNum ? `${rLabel} - ${mNum}` : rLabel;
    }
    
    return `${m.start_time} • ${escapeHTML(m.class_code)} - ${escapeHTML(endStr)}`;
}

function resolveClubInfo(rawClub, cId, clubesLookup) {
    let found = null;
    if (cId && String(cId) !== 'undefined' && String(cId) !== 'null') {
        found = clubesLookup.find(c => String(c.id) === String(cId) || String(c.old_id) === String(cId));
    }
    if (!found && rawClub && isNaN(Number(rawClub)) && rawClub !== '-') {
        const rawLower = String(rawClub).toLowerCase().trim();
        found = clubesLookup.find(c => (c.nome && c.nome.toLowerCase().trim() === rawLower) || (c.sigla && c.sigla.toLowerCase().trim() === rawLower));
    }
    if (found) return found.sigla || found.nome || rawClub;
    return rawClub !== '-' ? rawClub : '';
}

function getParticipantDisplay(m, side, clubesLookup) {
    const name = extractName(m, side);
    const bib = extractBib(m, side);
    const cId = side === 1 ? (m.entrant1_id || m.entrant_a_id) : (m.entrant2_id || m.entrant_b_id);
    const club = resolveClubInfo(extractClubFull(m, side), cId, clubesLookup);
    
    if (name !== 'A Definir') {
        let finalName = bib ? `${bib} - ${name}` : name;
        return { display: escapeHTML(finalName), club: escapeHTML(club) };
    }
    return { display: 'A DEFINIR', club: '' };
}

function hhmmToMin(str) { if (!str) return 0; const [h, m] = str.split(':').map(Number); return (h * 60) + (m || 0); }
function minToHhmm(min) { const h = String(Math.floor(min / 60)).padStart(2, '0'); const m = String(Math.floor(min % 60)).padStart(2, '0'); return `${h}:${m}`; }
function durationToMinutes(str) {
    if (!str) return 50; const parts = String(str).split(':').map(n => +n || 0);
    if (parts.length === 1) return parts[0] > 0 ? parts[0] : 50; 
    if (parts[0] > 0 && parts[0] < 10) return (parts[0] * 60) + (parts[1] || 0); 
    if (parts[0] === 0 && parts[1] > 0) return parts[1]; 
    return parts[0] > 0 ? parts[0] : 50; 
}
function subtractMinutes(timeStr, minsToSubtract) {
    if (!timeStr || !timeStr.includes(':')) return '--:--';
    let [h, m] = timeStr.split(':').map(Number);
    let totalMins = (h * 60) + m - minsToSubtract;
    if (totalMins < 0) totalMins += 24 * 60; 
    return `${Math.floor(totalMins / 60).toString().padStart(2, '0')}:${(totalMins % 60).toString().padStart(2, '0')}`;
}

export async function renderCallRoomTV(root, hashData) {
    const header = document.querySelector('header');
    if (header) header.style.display = 'none';
    document.body.style.backgroundColor = '#0f172a'; 
    root.style.padding = '0';
    root.style.maxWidth = '100%';

    let competitionId = null;
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/) || hash.match(/\/competitions\/([a-zA-Z0-9_-]+)/);
    if (idMatch) competitionId = idMatch[1];
    else if (hashData && (hashData.id || hashData.competitionId)) competitionId = hashData.id || hashData.competitionId;

    if (!competitionId) { root.innerHTML = `<div style="color:white; padding:40px; font-size:24px;">Erro: ID da competição ausente.</div>`; return; }

    const state = {
        competitionName: 'Carregando...',
        rounds: [], 
        clubes: [],
        classColors: {}, 
        courts: [1,2,3,4,5,6,7,8], 
        allMatches: [], 
        clockInterval: null,
        refreshInterval: null
    };

    async function loadData() {
        try {
            const compSnap = await getDoc(doc(db, "competitions", String(competitionId)));
            if (compSnap.exists()) state.competitionName = compSnap.data().nome || compSnap.data().name || 'Competição Oficial';

            const clubesSnap = await getDocs(collection(db, "clubes"));
            state.clubes = clubesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const classesSnap = await getDocs(collection(db, "classes"));
            classesSnap.forEach(d => {
                const c = d.data();
                const code = c.codigo || c.code || d.id;
                state.classColors[code] = { bg: c.ui_bg || '#e2e8f0', fg: c.ui_fg || '#0f172a', match_time: c.match_time || c.tempo_partida || 50 };
            });

            let rawMatches = [];
            const qGroup = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
            const snapGroup = await getDocs(qGroup);
            snapGroup.forEach(d => {
                const data = d.data(); const classCode = data.class_code;
                const pools = data.matches || data.data || [];
                pools.forEach(pool => { Object.values(pool.rounds || {}).forEach(roundMatches => { roundMatches.forEach(m => rawMatches.push({...m, class_code: classCode, match_type: 'GROUP'})); }); });
            });

            const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
            const snapKo = await getDocs(qKo);
            snapKo.forEach(d => {
                const data = d.data(); const classCode = data.class_code;
                const kos = data.matches || data.data || [];
                kos.forEach(m => rawMatches.push({...m, class_code: classCode, match_type: 'KO'}));
            });

            state.allMatches = rawMatches.filter(m => {
                if (!m.court || !m.match_date || !m.start_time || m.status === 'CANCELED') return false;
                if (String(m.status).toUpperCase() === 'SCHEDULED_WITH_BYE') return false;
                const p1N = String(m.p1_name || m.entrant1_name || m.entrant_a_name || '').toUpperCase();
                const p2N = String(m.p2_name || m.entrant2_name || m.entrant_b_name || '').toUpperCase();
                if (p1N === 'BYE' || p2N === 'BYE') return false;
                return true;
            });
            
            const roundsMap = {};
            state.allMatches.forEach(m => {
                const key = `${m.match_date} ${m.start_time}`;
                if (!roundsMap[key]) roundsMap[key] = { key, date: m.match_date, time: m.start_time, matches: [] };
                roundsMap[key].matches.push(m);
            });

            state.rounds = Object.values(roundsMap).sort((a, b) => a.key.localeCompare(b.key));
            
            renderLayout();
            startClocks();
        } catch (e) { root.innerHTML = `<div style="color:red; padding:40px; font-size:24px;">Erro de conexão: ${e.message}</div>`; }
    }

    function renderLayout() {
        const styles = `
            <style>
                .tv-app { display: flex; flex-direction: column; height: 100vh; width: 100vw; background: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; overflow: hidden; color: white; }
                
                .tv-header-center { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1vh 0; background: #0f172a; border-bottom: 4px solid #1e293b; z-index: 10; height: 26vh;}
                .tv-comp-title { font-size: 2.2vh; color: #94a3b8; text-transform: uppercase; font-weight: bold; letter-spacing: 3px; }
                .tv-clock { font-size: 22vh; font-weight: 900; color: #fbbf24; font-variant-numeric: tabular-nums; line-height: 0.8; text-shadow: 0 8px 16px rgba(0,0,0,0.8); margin: 0.5vh 0; }
                .tv-date { font-size: 3vh; color: #cbd5e1; text-transform: uppercase; font-weight: bold; letter-spacing: 2px; }
                
                .tv-status-bar { text-align: center; padding: 1vh; font-size: 3vh; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; transition: background 0.5s; display: flex; justify-content: center; align-items: center; gap: 2vw; box-shadow: inset 0 4px 10px rgba(0,0,0,0.3); z-index: 5; height: 6vh; box-sizing: border-box; }
                .st-yellow { background: #ca8a04; color: #000; }
                .st-green { background: #16a34a; color: #fff; }
                .st-red { background: #dc2626; color: #fff; }
                .st-none { background: #1e293b; color: #64748b; }

                .tv-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; background: #e2e8f0; padding: 1.5vh 1vw; }
                .tv-grid-wrapper { flex: 1; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; border: 1px solid #cbd5e1; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
                
                .grid-header { display: flex; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; height: 4vh; align-items: center; }
                .grid-time-col { width: 5vw; border-right: 1px solid #cbd5e1; height: 100%; }
                .grid-court-header { flex: 1; text-align: center; font-weight: 900; font-size: 1.8vh; color: #0f172a; text-transform: uppercase; border-right: 1px dashed #cbd5e1;}
                .grid-court-header:last-child { border-right: none; }
                
                .grid-body { position: relative; flex: 1; display: flex; overflow: hidden; background: #fff; }
                .grid-time-axis { width: 5vw; position: relative; border-right: 1px solid #cbd5e1; background: #f8fafc; }
                .grid-courts-area { flex: 1; position: relative; display: flex; }
                .grid-court-col { flex: 1; border-right: 1px dashed #cbd5e1; position: relative; }
                .grid-court-col:last-child { border-right: none; }
                
                .card-wrapper { position: absolute; padding: 2px 4px; box-sizing: border-box; }
                
                .match-card { display: flex; flex-direction: column; padding: 0.5vh 0.4vw; box-shadow: 0 4px 6px rgba(0,0,0,0.15); overflow: hidden; justify-content: space-evenly; border-radius: 6px; border: 2px solid rgba(0,0,0,0.3); width: 100%; height: 100%; box-sizing: border-box; }
                .match-card.ready { border: 4px solid #16a34a; box-shadow: 0 0 20px rgba(22,163,74,0.8); z-index: 100 !important; transform: scale(1.02); }
                .match-card.finished { filter: grayscale(30%); opacity: 0.85; }
                
                .mc-header { font-size: 1.1vh; font-weight: 900; text-align: center; border-bottom: 1px solid rgba(0,0,0,0.2); padding-bottom: 0.3vh; margin-bottom: 0.3vh; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.5px; }
                .mc-player { display: flex; justify-content: space-between; align-items: center; gap: 0.3vw; width: 100%; }
                .mc-info { display: flex; flex-direction: column; flex: 1; overflow: hidden; text-align: left; }
                
                .mc-name { font-size: 1.1vh; font-weight: 900; line-height: 1.05; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal; word-break: break-word; }
                .mc-club { font-size: 0.9vh; font-weight: bold; opacity: 0.9; margin-top: 0.1vh; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; }
                
                .mc-score { background: #000; color: #fff; font-weight: bold; font-size: 1.3vh; border-radius: 4px; padding: 0.2vh 0; width: 2vw; text-align: center; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2); margin-left: 0.2vw;}
                .mc-vs { text-align: center; font-size: 0.85vh; font-weight: 900; opacity: 0.7; margin: 0; letter-spacing: 1px; }
                
                .empty-msg { text-align: center; color: #94a3b8; font-size: 4vh; font-weight: bold; margin-top: 10vh; width: 100%; }
            </style>
        `;
        root.innerHTML = `
            ${styles}
            <div class="tv-app">
                <div class="tv-header-center">
                    <div class="tv-comp-title">${escapeHTML(state.competitionName)}</div>
                    <div class="tv-clock" id="clock-display">--:--:--</div>
                    <div class="tv-date" id="date-display">--</div>
                </div>
                <div class="tv-status-bar st-none" id="status-bar">SINCRONIZANDO...</div>
                <div class="tv-content">
                    <div class="tv-grid-wrapper">
                        <div class="grid-header">
                            <div class="grid-time-col"></div>
                            ${state.courts.map(c => `<div class="grid-court-header">Q.${c}</div>`).join('')}
                        </div>
                        <div class="grid-body" id="grid-body"></div>
                    </div>
                </div>
            </div>
        `;
    }

    function startClocks() {
        if (state.clockInterval) clearInterval(state.clockInterval);
        if (state.refreshInterval) clearInterval(state.refreshInterval);

        state.clockInterval = setInterval(() => {
            const now = new Date();
            document.getElementById('clock-display').innerText = now.toLocaleTimeString('pt-BR');
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            let dateStr = now.toLocaleDateString('pt-BR', options);
            document.getElementById('date-display').innerText = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
            updateLogic(now);
        }, 1000);

        state.refreshInterval = setInterval(() => { loadData(); }, 30000); // Recarrega do banco a cada 30 segundos
        updateLogic(new Date()); 
    }

    function updateLogic(now) {
        const yy = now.getFullYear();
        const mm = String(now.getMonth()+1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayStr = `${yy}-${mm}-${dd}`;

        // Garante que só olha para UM DIA específico (evita misturar as 08:00 de amanhã com hoje)
        let displayMatches = state.allMatches.filter(m => m.match_date === todayStr);

        if (displayMatches.length === 0 && state.allMatches.length > 0) {
            const availableDates = [...new Set(state.allMatches.map(m => m.match_date))].sort();
            const futureDates = availableDates.filter(d => d >= todayStr);
            const targetDate = futureDates.length > 0 ? futureDates[0] : availableDates[availableDates.length - 1];
            displayMatches = state.allMatches.filter(m => m.match_date === targetDate);
        }

        if (displayMatches.length === 0) {
            document.getElementById('grid-body').innerHTML = `<div class="empty-msg">Nenhum jogo programado!</div>`;
            return;
        }

        const pendingMatches = displayMatches.filter(m => m.status !== 'COMPLETED' && m.status !== 'FINISHED');
        if (pendingMatches.length === 0) {
            document.getElementById('grid-body').innerHTML = `<div class="empty-msg">Todos os jogos do dia foram finalizados!</div>`;
            return;
        }

        const uniqueTimes = [...new Set(displayMatches.map(m => m.start_time))].sort();
        const nowMins = now.getHours() * 60 + now.getMinutes();

        // Encontra a rodada atual ou a mais próxima
        let startIdx = 0;
        for (let i = 0; i < uniqueTimes.length; i++) {
            if (hhmmToMin(uniqueTimes[i]) + 50 >= nowMins) { startIdx = i; break; }
            startIdx = i;
        }

        let visibleTimes = uniqueTimes.slice(startIdx, startIdx + 4); 

        if (visibleTimes.length === 0) return;

        // ZOOM PERFEITO NA TELA TV: JANELA ABSOLUTA DE 3 HORAS
        const firstMatchMins = hhmmToMin(visibleTimes[0]);
        // Começa 30 minutos antes do primeiro jogo (Dá espaço em cima)
        const startMins = Math.floor(firstMatchMins / 30) * 30 - 30; 
        const totalMins = 180; // Total 3 horas na tela. 1 bloco de 50m ocupa mais espaço.

        // A Barra de Status sincroniza com a primeira rodada na tela
        const nextMainRoundStr = visibleTimes[0];
        const nextMainMins = hhmmToMin(nextMainRoundStr);
        updateStatusBar(now.getHours() * 60 + now.getMinutes(), nextMainMins, nextMainRoundStr);

        const visibleMatches = displayMatches.filter(m => {
            const mStart = hhmmToMin(m.start_time);
            return mStart >= startMins && mStart <= startMins + totalMins;
        });

        // Ordenação crucial para Z-INDEX: Os jogos mais tarde sobrepõem os mais cedo
        visibleMatches.sort((a,b) => hhmmToMin(a.start_time) - hhmmToMin(b.start_time));

        drawGrid(visibleMatches, startMins, totalMins);
    }

    function updateStatusBar(nowMins, roundMins, roundStr) {
        const bar = document.getElementById('status-bar');
        const openMins = roundMins - 35;
        const closeMins = roundMins - 20;

        if (nowMins < openMins) {
            bar.className = 'tv-status-bar st-yellow';
            bar.innerHTML = `<span>PRÓXIMA RODADA: <b>${roundStr}</b></span> <span>|</span> <span>AGUARDE: ABRE ÀS <b>${minToHhmm(openMins)}</b></span>`;
        } else if (nowMins >= openMins && nowMins < closeMins) {
            bar.className = 'tv-status-bar st-green';
            bar.innerHTML = `<span>RODADA <b>${roundStr}</b>: <b>CHAMADA ABERTA</b></span> <span>|</span> <span>FECHA ÀS <b>${minToHhmm(closeMins)}</b></span>`;
        } else {
            bar.className = 'tv-status-bar st-red';
            bar.innerHTML = `<span>RODADA <b>${roundStr}</b>: <b>CHAMADA FECHADA</b></span> <span>|</span> <span>DIRIJA-SE À QUADRA</span>`;
        }
    }

    function drawGrid(matches, startMins, totalMins) {
        let timeAxisHtml = '';
        const roundedStart = Math.floor(startMins / 30) * 30;
        for(let t = roundedStart; t <= startMins + totalMins; t += 30) {
            if (t <= startMins) continue;
            let topPct = ((t - startMins) / totalMins) * 100;
            if (topPct > 95) continue; 
            timeAxisHtml += `<div style="position:absolute; top:${topPct}%; right:0.5vw; transform:translateY(-50%); font-weight:900; font-size:2vh; color:#475569;">${minToHhmm(t)}</div>`;
            timeAxisHtml += `<div style="position:absolute; top:${topPct}%; left:5vw; width:100vw; height:1px; background:rgba(0,0,0,0.1); z-index:0;"></div>`;
        }

        const totalCourts = 8;
        let courtsHtml = Array.from({length: totalCourts}).map(() => `<div class="grid-court-col"></div>`).join('');

        let blocksHtml = '';
        matches.forEach(m => {
            const mStart = hhmmToMin(m.start_time);
            const cData = state.classColors[m.class_code] || { bg: '#e2e8f0', fg: '#0f172a', match_time: 50 };
            const dur = Number(cData.match_time) || 50;
            
            let topPct = ((mStart - startMins) / totalMins) * 100;
            let heightPct = (dur / totalMins) * 100;
            
            if (topPct < 0) topPct = 0;
            if (topPct + heightPct > 100) heightPct = 100 - topPct;

            const cNum = Number(m.court);
            if(cNum < 1 || cNum > totalCourts) return; 

            const courtIdx = cNum - 1;
            const leftPct = (courtIdx / totalCourts) * 100;
            const widthPct = (1 / totalCourts) * 100;

            const p1Data = getParticipantDisplay(m, 1, state.clubes);
            const p2Data = getParticipantDisplay(m, 2, state.clubes);
            
            // O cabeçalho no formato exato que você pediu (08:50 • BC4M - J4)
            const titleStr = formatMatchTitle(m);

            const isCompleted = m.status === 'COMPLETED' || m.status === 'FINISHED';
            
            let s1 = '-'; let s2 = '-';
            if (isCompleted) {
                const details = safeParse(m.details || m.match_details);
                if (details.is_wo) {
                    const wId = String(m.winner_entrant_id || m.winner_id);
                    const p1Id = String(m.entrant1_id || m.entrant_a_id);
                    s1 = wId === p1Id ? 'W' : 'O';
                    s2 = wId === p1Id ? 'O' : 'W';
                } else {
                    s1 = (m.p1_score !== null && m.p1_score !== undefined && String(m.p1_score) !== 'null') ? m.p1_score : (m.score1 ?? m.score_a ?? '-');
                    s2 = (m.p2_score !== null && m.p2_score !== undefined && String(m.p2_score) !== 'null') ? m.p2_score : (m.score2 ?? m.score_b ?? '-');
                }
            }

            let extraClasses = '';
            if (m.call_room_ready) extraClasses += ' ready';
            if (isCompleted) extraClasses += ' finished';

            // Z-Index usa a hora de início para sempre sobrepor corretamente
            blocksHtml += `
                <div class="card-wrapper" style="top:${topPct}%; left:${leftPct}%; width:${widthPct}%; height:${heightPct}%; z-index: ${mStart};">
                    <div class="match-card ${extraClasses}" style="background-color:${cData.bg}; color:${cData.fg};">
                        <div class="mc-header">${titleStr}</div>
                        
                        <div style="flex:1; display:flex; flex-direction:column; justify-content:space-evenly; gap:0.1vh;">
                            <div class="mc-player">
                                <div class="mc-info">
                                    <div class="mc-name" title="${p1Data.display}">${p1Data.display}</div>
                                    <div class="mc-club" title="${p1Data.club}">${p1Data.club}</div>
                                </div>
                                <div class="mc-score">${s1}</div>
                            </div>
                            
                            <div class="mc-vs">VS</div>
                            
                            <div class="mc-player">
                                <div class="mc-info">
                                    <div class="mc-name" title="${p2Data.display}">${p2Data.display}</div>
                                    <div class="mc-club" title="${p2Data.club}">${p2Data.club}</div>
                                </div>
                                <div class="mc-score">${s2}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        document.getElementById('grid-body').innerHTML = `
            <div class="grid-time-axis">${timeAxisHtml}</div>
            <div class="grid-courts-area">
                ${courtsHtml}
                ${blocksHtml}
            </div>
        `;
    }

    loadData();
}


export const renderCallRoomTv = renderCallRoomTV;