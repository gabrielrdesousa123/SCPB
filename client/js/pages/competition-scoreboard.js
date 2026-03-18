// client/js/pages/competition-scoreboard.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Funções Extratoras Limpas
function escapeHTML(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

function cleanName(n) {
    if (!n) return 'A Definir';
    const s = String(n).trim();
    if (s.toLowerCase().includes('atleta vermelho') || s.toLowerCase().includes('atleta azul') || s === '-' || s.toLowerCase() === 'bye') return 'A Definir';
    return s;
}

function extractParticipant(m, side, allAthletes) {
    let athId = side === 1 ? (m.entrant1_athlete_id || m.entrant1_id || m.entrant_a_id) : (m.entrant2_athlete_id || m.entrant2_id || m.entrant_b_id);
    let name = side === 1 ? (m.p1_name || m.entrant1_name || m.entrant_a_name) : (m.p2_name || m.entrant2_name || m.entrant_b_name);
    let bib = side === 1 ? (m.p1_bib || m.entrant1_bib || m.entrant_a_bib) : (m.p2_bib || m.entrant2_bib || m.entrant_b_bib);
    let club = side === 1 ? (m.p1_club_sigla || m.p1_club_nome || m.p1_club || m.entrant1_club_sigla || m.entrant_a_club_sigla) : (m.p2_club_sigla || m.p2_club_nome || m.p2_club || m.entrant2_club_sigla || m.entrant_b_club_sigla);
    
    name = cleanName(name);
    bib = (!bib || String(bib).trim() === 'null' || String(bib).trim() === '-') ? '' : String(bib).trim();
    club = (!club || String(club).trim() === 'null' || String(club).trim() === '-') ? '' : String(club).trim();

    // Tenta achar o operador de rampa no banco de dados de atletas
    let rampaStr = '';
    if (athId && allAthletes && allAthletes.length > 0) {
        const athObj = allAthletes.find(a => String(a.id) === String(athId));
        if (athObj && athObj.operador_rampa && String(athObj.classe_code || '').toUpperCase().includes('BC3')) {
            rampaStr = ` <br><span style="font-size:12px; color:#64748b; font-weight:normal;">Op: ${escapeHTML(athObj.operador_rampa)}</span>`;
        }
    }

    if (name !== 'A Definir') {
        let display = bib ? `${bib} - ${name}` : name;
        if (club) display += ` - ${club}`;
        return escapeHTML(display) + rampaStr;
    }
    return 'A DEFINIR';
}

function formatMatchTitle(m) {
    const isGroup = m.match_type === 'GROUP' || (m.round_name && m.round_name.toLowerCase().includes('round')) || m.pool_id;
    let mNum = (m.match_number && String(m.match_number) !== 'null') ? `J${m.match_number}` : '';
    if (isGroup) return mNum || 'Grupo';
    let rLabel = m.round_name || 'Eliminatórias';
    const map = {'Quarter Final': 'QF', 'Semi-Final': 'SF', 'Playoffs': 'PO', 'Final': 'Final', '3rd Place': '3º Lugar'};
    rLabel = map[rLabel] || rLabel;
    return mNum ? `${rLabel} - ${mNum}` : rLabel;
}

export async function renderCompetitionScoreboard(root, hashData) {
    const header = document.querySelector('header');
    
    let competitionId = null;
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/) || hash.match(/\/competitions\/([a-zA-Z0-9_-]+)/);
    if (idMatch) competitionId = idMatch[1];
    else if (hashData && (hashData.id || hashData.competitionId)) competitionId = hashData.id || hashData.competitionId;

    if (!competitionId) { root.innerHTML = `<div style="padding:20px; color:red;">Erro: ID da competição ausente.</div>`; return; }

    let operSession = null;
    try {
        const raw = localStorage.getItem('wb_oper_session');
        if (raw) operSession = JSON.parse(raw);
    } catch(e) {}

    const isOper = operSession && operSession.type === 'COURT' && String(operSession.compId) === String(competitionId);
    const operCourt = isOper ? Number(operSession.court) : null;
    if (header) header.style.display = isOper ? 'none' : 'flex';
    document.body.style.backgroundColor = '#f1f5f9';

    const state = {
        competitionName: 'Carregando...',
        allMatches: [],
        allAthletes: [],
        currentFilter: isOper ? operCourt : 'ALL'
    };

    async function loadData() {
        root.innerHTML = `<div style="padding: 40px; text-align: center; font-size: 18px; color: #64748b;">Carregando Hub de Quadras...</div>`;
        try {
            const compSnap = await getDoc(doc(db, "competitions", String(competitionId)));
            if (compSnap.exists()) state.competitionName = compSnap.data().nome || compSnap.data().name || 'Competição';

            // Carrega atletas para pegar operador de rampa
            const athSnap = await getDocs(collection(db, "atletas"));
            state.allAthletes = athSnap.docs.map(d => ({id: d.id, ...d.data()}));

            let rawMatches = [];
            const qGroup = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
            const snapGroup = await getDocs(qGroup);
            snapGroup.forEach(d => {
                const data = d.data(); const classCode = data.class_code;
                const pools = data.matches || data.data || [];
                pools.forEach(pool => { 
                    Object.values(pool.rounds || {}).forEach(roundMatches => { 
                        roundMatches.forEach(m => {
                            // 🔥 FILTRO BYE CADASTRADO NO MOMENTO DO LOAD
                            if (String(m.status).toUpperCase() === 'BYE' || String(m.status).toUpperCase() === 'SCHEDULED_WITH_BYE' || m.is_bye || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE') return;
                            rawMatches.push({...m, class_code: classCode, match_type: 'GROUP'}); 
                        }); 
                    }); 
                });
            });

            const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
            const snapKo = await getDocs(qKo);
            snapKo.forEach(d => {
                const data = d.data(); const classCode = data.class_code;
                const kos = data.matches || data.data || [];
                kos.forEach(m => {
                    // 🔥 FILTRO BYE CADASTRADO NO MOMENTO DO LOAD
                    if (String(m.status).toUpperCase() === 'BYE' || String(m.status).toUpperCase() === 'SCHEDULED_WITH_BYE' || m.is_bye || String(m.entrant_a_name || m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant_b_name || m.entrant2_name).toUpperCase() === 'BYE') return;
                    rawMatches.push({...m, class_code: classCode, match_type: 'KO'})
                });
            });

            state.allMatches = rawMatches.filter(m => m.court && m.match_date && m.start_time && m.status !== 'CANCELED');
            
            state.allMatches.sort((a,b) => {
                if (a.match_date !== b.match_date) return a.match_date.localeCompare(b.match_date);
                if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
                return Number(a.court) - Number(b.court);
            });

            render();
        } catch (e) {
            root.innerHTML = `<div style="color:red; padding:40px; font-size:18px;">Erro: ${e.message}</div>`;
        }
    }

    function render() {
        const styles = `
            <style>
                .hub-container { max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
                .hub-header { display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 20px; border-radius: 12px; color: white; margin-bottom: 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
                .hub-title { font-size: 24px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
                .hub-subtitle { font-size: 14px; color: #94a3b8; margin: 5px 0 0 0; }
                
                .btn-logout { background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
                .btn-logout:hover { background: #dc2626; }
                
                .court-filters { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                .btn-filter { background: white; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; font-weight: bold; color: #475569; cursor: pointer; }
                .btn-filter.active { background: #3b82f6; color: white; border-color: #2563eb; }

                .match-list { display: flex; flex-direction: column; gap: 15px; }
                .match-card { background: white; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; overflow: hidden; }
                .match-card.completed { filter: grayscale(80%); opacity: 0.8; }
                
                .m-head { background: #f8fafc; padding: 10px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; color: #0f172a; }
                .m-body { padding: 20px; display: flex; justify-content: space-between; align-items: center; gap: 20px; }
                
                .m-players { flex: 1; display: flex; flex-direction: column; gap: 8px; font-size: 18px; font-weight: 900; color: #1e293b; }
                .m-vs { font-size: 12px; color: #94a3b8; font-weight: bold; margin-left: 20px; }
                
                .m-actions { display: flex; gap: 10px; }
                .btn-action { padding: 15px 25px; border-radius: 8px; font-weight: 900; font-size: 14px; cursor: pointer; border: none; text-transform: uppercase; transition: transform 0.2s; text-decoration: none; display: flex; align-items: center; justify-content: center; }
                .btn-action:hover { transform: translateY(-3px); }
                
                .btn-sumula { background: #16a34a; color: white; box-shadow: 0 4px 10px rgba(22,163,74,0.3); }
                .btn-placar { background: #0f172a; color: white; box-shadow: 0 4px 10px rgba(15,23,42,0.3); }
            </style>
        `;

        let headerHtml = '';
        if (isOper) {
            headerHtml = `
                <div class="hub-header">
                    <div>
                        <h1 class="hub-title">PAINEL DO MESÁRIO - QUADRA ${operCourt}</h1>
                        <p class="hub-subtitle">${escapeHTML(state.competitionName)}</p>
                    </div>
                    <button class="btn-logout" id="btn-oper-logout">Sair / Encerrar Turno</button>
                </div>
            `;
        } else {
            const uniqueCourts = [...new Set(state.allMatches.map(m => Number(m.court)))].sort((a,b) => a-b);
            let filters = `<button class="btn-filter ${state.currentFilter === 'ALL' ? 'active' : ''}" data-c="ALL">Todas</button>`;
            uniqueCourts.forEach(c => {
                filters += `<button class="btn-filter ${state.currentFilter === c ? 'active' : ''}" data-c="${c}">Quadra ${c}</button>`;
            });

            headerHtml = `
                <div class="hub-header" style="background:#3b82f6;">
                    <div>
                        <h1 class="hub-title">Hub de Quadras (Admin)</h1>
                        <p class="hub-subtitle" style="color:#dbeafe;">Selecione a quadra para ver as súmulas.</p>
                    </div>
                    <button class="btn-filter" onclick="window.history.back()" style="background:transparent; border-color:white; color:white;">Voltar</button>
                </div>
                <div class="court-filters">${filters}</div>
            `;
        }

        let matchesToShow = state.allMatches;
        if (state.currentFilter !== 'ALL') {
            matchesToShow = matchesToShow.filter(m => Number(m.court) === state.currentFilter);
        }

        let listHtml = '<div class="match-list">';
        
        if (matchesToShow.length === 0) {
            listHtml += `<div style="text-align:center; padding:40px; color:#64748b; font-size:18px;">Nenhum jogo programado para esta quadra.</div>`;
        } else {
            matchesToShow.forEach(m => {
                const dateStr = m.match_date.split('-').reverse().join('/');
                const p1Str = extractParticipant(m, 1, state.allAthletes);
                const p2Str = extractParticipant(m, 2, state.allAthletes);
                const title = formatMatchTitle(m);
                const isCompleted = m.status === 'COMPLETED' || m.status === 'FINISHED';

                const urlSumula = `#/live/scoresheet?match_id=${m.id}&comp_id=${competitionId}`;
                const urlPlacar = `#/live/scoreboard?match_id=${m.id}&comp_id=${competitionId}`;

                listHtml += `
                    <div class="match-card ${isCompleted ? 'completed' : ''}">
                        <div class="m-head">
                            <span>📅 ${dateStr} às ${m.start_time} | 📍 Quadra ${m.court}</span>
                            <span style="color:#3b82f6;">${escapeHTML(m.class_code)} - ${escapeHTML(title)}</span>
                        </div>
                        <div class="m-body">
                            <div class="m-players">
                                <div><span style="color:#dc2626;">🔴</span> ${p1Str}</div>
                                <div class="m-vs">VS</div>
                                <div><span style="color:#2563eb;">🔵</span> ${p2Str}</div>
                            </div>
                            <div class="m-actions">
                                <a href="${urlSumula}" class="btn-action btn-sumula" title="Abre a mesa de controle">📝 Súmula</a>
                                <a href="${urlPlacar}" target="_blank" class="btn-action btn-placar" title="Abre o placar em nova aba para jogar na TV">📺 Telão (Placar)</a>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        listHtml += '</div>';

        root.innerHTML = `${styles}<div class="hub-container">${headerHtml}${listHtml}</div>`;

        const btnLogout = document.getElementById('btn-oper-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                if(confirm("Deseja encerrar seu turno e bloquear o tablet?")) {
                    localStorage.removeItem('wb_oper_session');
                    window.location.hash = '#/';
                    setTimeout(() => window.location.reload(), 100);
                }
            });
        }

        if (!isOper) {
            document.querySelectorAll('.btn-filter').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const val = e.target.dataset.c;
                    state.currentFilter = val === 'ALL' ? 'ALL' : Number(val);
                    render();
                });
            });
        }
    }

    loadData();
}