// client/js/pages/live-scoresheet.js
import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let audioCtx = null;
function playBeep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.5);
    } catch(e) {}
}

const VIOLATIONS_DICT = [
  { group: 'Retração (Art. 16.5)', penalty: 'Retração', rules: [ { code: '16.5.1', text: 'Lançamento antes da autorização' }, { code: '16.5.2', text: 'Atleta BC3 não libera a bola' }, { code: '16.5.3', text: 'Assistente toca no atleta/ponteira' }, { code: '16.5.4', text: 'Atleta e assist. soltam simultâneos' }, { code: '16.5.5', text: 'Colorida jogada antes do Jack' }, { code: '16.5.6', text: 'Primeira colorida dif. do Jack' }, { code: '16.5.7', text: 'Falta de swing do BC3 antes do Jack' }, { code: '16.5.8', text: 'Falta de swing após reorientação' }, { code: '16.5.9', text: 'Lado joga 2+ bolas ao mesmo tempo' } ]},
  { group: '1 Bola de Penalidade (Art. 16.6)', penalty: '1 Bola de Penalidade', rules: [ { code: '16.6.1', text: 'Atleta entra na área sem ser a vez' }, { code: '16.6.2', text: 'Calheiro olha para a área antes' }, { code: '16.6.3', text: 'Prep. jogada no tempo do adv.' }, { code: '16.6.4', text: 'Assist. move equip. sem pedido' }, { code: '16.6.5', text: 'Não sai do caminho após aviso' }, { code: '16.6.6', text: 'Tocar acidentalmente em bola' }, { code: '16.6.7', text: 'Atraso injustificado' }, { code: '16.6.8', text: 'Não aceitar decisão do árbitro' }, { code: '16.6.9', text: 'Assist./técnico entra sem permissão' }, { code: '16.6.10', text: 'Comportamento não cooperativo' } ]},
  { group: 'Retração + 1 Bola (Art. 16.7)', penalty: 'Retração + 1 Bola de Penalidade', rules: [ { code: '16.7.1', text: 'Lançar tocando a linha' }, { code: '16.7.2', text: 'Lançar com calha na linha' }, { code: '16.7.3', text: 'Lançar sem contato com assento' }, { code: '16.7.4', text: 'Lançar bola tocando fora' }, { code: '16.7.5', text: 'Lançar com assist. olhando' }, { code: '16.7.6', text: 'Lançar com assento > 66 cm' }, { code: '16.7.7', text: 'Lançar com parceiro retornando' }, { code: '16.7.8', text: 'Preparar e lançar no tempo do adv.' } ]},
  { group: '1 Bola + Amarelo (Art. 16.8)', penalty: 'Cartão Amarelo', rules: [ { code: '16.8.1', text: 'Interferência na concentração' }, { code: '16.8.2', text: 'Comunicação inapropriada' } ]},
  { group: 'Amarelo Direto (Art. 16.9)', penalty: 'Cartão Amarelo', rules: [ { code: '16.9.1', text: 'Entrada irregular no Call Room' }, { code: '16.9.2', text: 'Levar mais bolas que o permitido' }, { code: '16.9.3', text: 'Bola reprovada no teste' }, { code: '16.9.4', text: 'Sair da quadra sem permissão' }, { code: '16.9.5', text: 'Equipamento irregular' } ]},
  { group: 'Segundo Amarelo (Art. 16.10)', penalty: 'WO / Banimento', rules: [ { code: '16.10.1', text: 'Segunda advertência' }, { code: '16.10.2', text: 'Segundo amarelo Call Room (WO)' }, { code: '16.10.3', text: 'Segundo amarelo Quadra (Ban)' } ]},
  { group: 'Vermelho (Art. 16.11)', penalty: 'Cartão Vermelho', rules: [ { code: '16.11.1', text: 'Conduta antidesportiva grave' }, { code: '16.11.2', text: 'Conduta violenta' }, { code: '16.11.3', text: 'Linguagem ofensiva/abusiva' }, { code: '16.11.4', text: 'Desqualificação imediata' } ]},
  { group: 'Forfeit (Art. 16.12)', penalty: 'Forfeit', rules: [ { code: '16.12.1', text: 'Quebrar equipamento do adv.' }, { code: '16.12.2', text: 'Falha teste de bolas pós jogo' }, { code: '16.12.3', text: 'Sair da área sem permissão' } ]}
];

function formatViolationString(rawViolStr) {
    const baseStr = rawViolStr.split(' | ')[0]; 
    const parts = baseStr.split(' - ');
    if (parts.length >= 4) {
        let end = parts[0].trim();
        if (end.includes('1º P')) end = '1P'; else if (end.includes('2º P')) end = '2P'; else if (end.includes('3º P')) end = '3P'; else if (end.includes('4º P')) end = '4P'; else if (end === 'Câmara de Chamada (CC)') end = 'CC'; else if (end === 'Tie Break') end = 'TB'; else if (end.match(/^P\d$/)) end = end.replace('P', '') + 'P'; 
        let penalty = parts[3].trim(); if (penalty === '1 Bola de Penalidade') penalty = '1 Bola de Penalização';
        return `${end} - ${parts[1].trim()} ${parts[2].trim()} - ${penalty}`;
    }
    return baseStr;
}

export async function renderLiveScoresheet(root) {
    const hashStr = window.location.hash || '';
    const params = new URLSearchParams(hashStr.includes('?') ? hashStr.split('?')[1] : '');
    const matchId = params.get('match_id'); const compId = params.get('comp_id');
    if (!matchId || !compId) { root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro: ID do jogo ausente.</div>`; return; }

    const headerEl = document.querySelector('header');
    if (headerEl) headerEl.style.display = 'none';

    let operSession = null;
    try { const raw = localStorage.getItem('wb_oper_session'); if (raw) operSession = JSON.parse(raw); } catch(e) {}
    
    const auth = getAuth();
    let state = {
        hasControlPermission: operSession && String(operSession.compId) === String(compId),
        isAdmin: false,
        competition: {}, logos: [], match: {}, allAthletes: [], allTeams: [], allClubs: [],
        p1: { id: null, name: 'A Definir', displayName: '', bib: '-', club: '', clubFull: '', rampa: '', totalScore: 0, tbScore: 0, seconds: 300, ballsCount: 0, balls: Array(6).fill(false), violations: [], yellowCards: 0, redCards: 0, penalties: [], logoUrl: null },
        p2: { id: null, name: 'A Definir', displayName: '', bib: '-', club: '', clubFull: '', rampa: '', totalScore: 0, tbScore: 0, seconds: 300, ballsCount: 0, balls: Array(6).fill(false), violations: [], yellowCards: 0, redCards: 0, penalties: [], logoUrl: null },
        partials: [], ballHistory: [], currentEnd: 1, maxEnds: 4, initialTime: 300, activeTimer: null, showReport: false, isStarted: false, globalTimer: { active: false, paused: false, seconds: 0, label: '', interval: null }
    };

    let timerInterval = null; let actionHistory = []; let tempScoreP1 = 0; let tempScoreP2 = 0;
    const channel = new BroadcastChannel('bocha_live_scoreboard');

    const API = {
        getComp: async () => { const docSnap = await getDoc(doc(db, "competitions", String(compId))); return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : {}; },
        getMatches: async () => {
            let allMatches = [];
            const snapGroup = await getDocs(query(collection(db, "matches_group"), where("competition_id", "==", String(compId))));
            snapGroup.forEach(d => { const data = d.data(); (data.matches || data.data || []).forEach(pool => { Object.values(pool.rounds || {}).forEach(rms => { rms.forEach(m => { allMatches.push({ ...m, class_code: data.class_code, match_type: 'GROUP' }); }); }); }); });
            const snapKo = await getDocs(query(collection(db, "matches_ko"), where("competition_id", "==", String(compId))));
            snapKo.forEach(d => { const data = d.data(); (data.matches || data.data || []).forEach(m => { allMatches.push({ ...m, class_code: data.class_code, match_type: 'KO' }); }); });
            return { success: true, data: allMatches };
        },
        getClasses: async () => { const snap = await getDocs(collection(db, "classes")); return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); },
        getAthletes: async () => { const snap = await getDocs(collection(db, "atletas")); return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); },
        getTeams: async () => { const snap = await getDocs(collection(db, "equipes")); return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); },
        getClubs: async () => { const snap = await getDocs(collection(db, "clubes")); return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); },
        getOfficials: async () => { const snap = await getDocs(query(collection(db, "competition_officials"), where("competition_id", "==", String(compId)))); if (!snap.empty) return snap.docs[0].data().officials || []; return []; },
        _updateMatchInFirebase: async (mId, updatePayload) => {
            let matchDocId = null; let isGroup = true; let collectionName = "matches_group";
            const snapg = await getDocs(query(collection(db, "matches_group"), where("competition_id", "==", String(compId))));
            let currentArray = null;
            snapg.forEach(d => { let pools = d.data().matches || d.data().data || []; pools.forEach(pool => { Object.values(pool.rounds || {}).forEach(rms => { let idx = rms.findIndex(x => String(x.id) === String(mId)); if(idx !== -1) { matchDocId = d.id; currentArray = pools; rms[idx] = { ...rms[idx], ...updatePayload }; } }); }); });
            if (!matchDocId) {
                isGroup = false; collectionName = "matches_ko";
                const snapk = await getDocs(query(collection(db, "matches_ko"), where("competition_id", "==", String(compId))));
                snapk.forEach(d => { let kos = d.data().matches || d.data().data || []; let idx = kos.findIndex(x => String(x.id) === String(mId)); if(idx !== -1) { matchDocId = d.id; currentArray = kos; kos[idx] = { ...kos[idx], ...updatePayload }; } });
            }
            if (matchDocId) { await updateDoc(doc(db, collectionName, matchDocId), { [isGroup ? "matches" : "data"]: currentArray }); } else { throw new Error("Súmula não encontrada na nuvem Firebase."); }
        }
    };

    const cleanName = str => !str ? '' : String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const escapeHTML = cleanName;
    const formatTime = sec => { if (sec < 0) sec = 0; return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
    const parseTimeString = (timeStr, defaultSec = 300) => { if (!timeStr) return defaultSec; const str = String(timeStr); if (str.includes(':')) { const p = str.split(':').map(Number); return (p[0] * 60) + (p[1] || 0); } const val = Number(str); return isNaN(val) ? defaultSec : (val > 60 ? val : val * 60); };

    // 🔥 FUNÇÃO RESTAURADA: Calcula o tamanho da fonte baseado no tamanho do nome
    const getDynamicFontSizeTablet = (text) => {
        if (!text) return '26px';
        const len = text.length;
        if (len > 35) return '16px';
        if (len > 25) return '18px';
        if (len > 15) return '22px';
        return '26px';
    };

    function processParticipant(m, side) {
        let athId = side === 1 ? (m.entrant1_athlete_id || m.entrant1_id || m.entrant_a_id) : (m.entrant2_athlete_id || m.entrant2_id || m.entrant_b_id);
        let rawName = side === 1 ? (m.p1_name || m.entrant1_name || m.entrant_a_name) : (m.p2_name || m.entrant2_name || m.entrant_b_name);
        let bib = side === 1 ? (m.p1_bib || m.entrant1_bib || m.entrant_a_bib) : (m.p2_bib || m.entrant2_bib || m.entrant_b_bib);
        let club = side === 1 ? (m.p1_club_sigla || m.p1_club_nome || m.p1_club || m.entrant1_club_sigla || m.entrant_a_club_sigla) : (m.p2_club_sigla || m.p2_club_nome || m.p2_club || m.entrant2_club_sigla || m.entrant_b_club_sigla);
        let logo = side === 1 ? (m.p1_logo || m.entrant1_logo) : (m.p2_logo || m.entrant2_logo); 

        let finalName = cleanName(rawName); let displayName = escapeHTML(finalName); let isTeam = false; let rampa = ''; let clubIdFallback = null;
        const formatShort = (fullName) => { if (!fullName) return ''; const parts = fullName.trim().split(/\s+/); return parts.length <= 1 ? fullName : `${parts[0]} ${parts[parts.length - 1]}`; };

        if (athId && state.allTeams && state.allTeams.length > 0) {
            const teamObj = state.allTeams.find(t => String(t.id) === String(athId));
            if (teamObj && teamObj.athletes) {
                isTeam = true; clubIdFallback = teamObj.rep_value || teamObj.clube_id || null;
                displayName = teamObj.athletes.map(aId => { const aObj = state.allAthletes.find(a => String(a.id) === String(aId)); return aObj ? escapeHTML(formatShort(aObj.nome)) : 'Desconhecido'; }).join('<br>');
                finalName = teamObj.nome || teamObj.name || finalName; club = teamObj.sigla || teamObj.club_sigla || club;
            }
        }

        if (!isTeam) {
            displayName = escapeHTML(formatShort(finalName));
            if (athId && state.allAthletes && state.allAthletes.length > 0) {
                const athObj = state.allAthletes.find(a => String(a.id) === String(athId));
                if (athObj) { clubIdFallback = athObj.clube_id || (athObj.clubes_ids && athObj.clubes_ids[0]) || null; if (athObj.operador_rampa) rampa = athObj.operador_rampa; }
            }
        }
        if (!logo && clubIdFallback && state.allClubs && state.allClubs.length > 0) { const cObj = state.allClubs.find(c => String(c.id) === String(clubIdFallback)); if (cObj && cObj.logo_url) logo = cObj.logo_url; }

        return { id: athId, name: finalName, displayName: displayName, bib: bib || '-', club: club, clubFull: club, rampa: rampa, logoUrl: logo };
    }

    async function loadData() {
        root.innerHTML = `<div style="padding:40px; text-align:center; color: white; font-family: sans-serif;">A carregar Mesa de Controle...</div>`;
        document.body.style.backgroundColor = '#000';

        onAuthStateChanged(auth, async (user) => {
            try {
                const [comp, matchesRes, classesRes, athletesRes, teamsRes, clubsRes, offList] = await Promise.all([ API.getComp(), API.getMatches(), API.getClasses(), API.getAthletes(), API.getTeams(), API.getClubs(), API.getOfficials() ]);
                state.competition = comp; state.allAthletes = athletesRes; state.allTeams = teamsRes; state.allClubs = clubsRes; 
                state.logos = comp.logos && Array.isArray(comp.logos) && comp.logos.length > 0 ? comp.logos : ['/img/world-boccia.png', '/img/ande.png'];

                state.match = (matchesRes.success ? matchesRes.data : []).find(x => String(x.id) === matchId);
                if (!state.match) throw new Error("Jogo não encontrado na nuvem.");

                if (user) {
                    const uid = user.uid;
                    let uName = "", uEmail = user.email || "", uCpf = "", isGlobalAdmin = false;

                    try {
                        const uDoc = await getDoc(doc(db, "users", uid));
                        if (uDoc.exists()) {
                            uName = uDoc.data().nome || uDoc.data().name || '';
                            uCpf = String(uDoc.data().cpf || '').replace(/\D/g, '');
                            if (!uEmail) uEmail = uDoc.data().email || '';
                            if (String(uDoc.data().global_role || uDoc.data().role || '').toUpperCase().includes('ADMIN')) isGlobalAdmin = true;
                        }
                    } catch(e) {}

                    const cleanStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    const myCleanName = cleanStr(uName);

                    const myOfficialRecord = offList.find(o => {
                        if (uid && (o.referee_id === uid || o.uid === uid || o.official_id === uid || o.id === uid)) return true;
                        if (uEmail && o.email && cleanStr(o.email) === cleanStr(uEmail)) return true;
                        if (uCpf && o.cpf && String(o.cpf).replace(/\D/g, '') === uCpf) return true;
                        const oCleanName = cleanStr(o.nome || o.nome_completo || o.nome_abreviado);
                        if (myCleanName && oCleanName && (oCleanName === myCleanName || oCleanName.includes(myCleanName) || myCleanName.includes(oCleanName))) return true;
                        return false;
                    });

                    if (isGlobalAdmin) {
                        state.hasControlPermission = true; state.isAdmin = true;
                    } else if (myOfficialRecord) {
                        const rolesArr = (myOfficialRecord.role ? String(myOfficialRecord.role).split(',') : []).map(cleanStr);
                        const highRoles = ['delegadotecnico', 'assistentedelegadotecnico', 'arbitrochefe', 'assistentearbitrochefe'];
                        if (rolesArr.some(r => highRoles.includes(r))) {
                            state.hasControlPermission = true; state.isAdmin = true;
                        } else {
                            const myOffId = String(myOfficialRecord.referee_id || myOfficialRecord.id);
                            if (String(state.match.referee_principal_id) === myOffId || (!state.match.referee_principal_id && String(state.match.referee_id) === myOffId) || String(state.match.referee_shadow_id) === myOffId || String(state.match.referee_linha_id) === myOffId || String(state.match.referee_mesa_id) === myOffId) {
                                state.hasControlPermission = true;
                            }
                        }
                    }
                }

                const cDef = (Array.isArray(classesRes) ? classesRes : []).find(c => c.codigo === state.match.class_code || c.code === state.match.class_code || c.id === state.match.class_code) || {};
                state.maxEnds = cDef.ends || 4; state.initialTime = parseTimeString(cDef.turn_time || cDef.tempos || cDef.tempo_end || 5, 300);

                const dataP1 = processParticipant(state.match, 1);
                state.p1.id = dataP1.id; state.p1.name = dataP1.name; state.p1.displayName = dataP1.displayName; state.p1.bib = dataP1.bib; state.p1.club = dataP1.club; state.p1.clubFull = dataP1.clubFull; state.p1.rampa = dataP1.rampa; state.p1.logoUrl = dataP1.logoUrl;
                const dataP2 = processParticipant(state.match, 2);
                state.p2.id = dataP2.id; state.p2.name = dataP2.name; state.p2.displayName = dataP2.displayName; state.p2.bib = dataP2.bib; state.p2.club = dataP2.club; state.p2.clubFull = dataP2.clubFull; state.p2.rampa = dataP2.rampa; state.p2.logoUrl = dataP2.logoUrl;

                let details = {}; try { if (state.match.details || state.match.match_details) details = typeof(state.match.details) === 'object' ? state.match.details : JSON.parse(state.match.details || state.match.match_details); } catch(e){}

                state.currentEnd = 1;
                if (state.match.status === 'COMPLETED' || state.match.status === 'ONGOING' || (details.p1_partials && details.p1_partials.length > 0)) { state.isStarted = true; }

                if (details.p1_partials && details.p1_partials.length > 0) {
                    for (let i = 0; i < details.p1_partials.length; i++) {
                        if (details.p1_partials[i] !== null && String(details.p1_partials[i]) !== '') {
                            state.partials.push({ s1: details.p1_partials[i], s2: details.p2_partials[i], t1: details.p1_times?.[i] || "00:00", t2: details.p2_times?.[i] || "00:00", b1: 0, b2: 0 });
                            if (i < state.maxEnds) { state.p1.totalScore += Number(details.p1_partials[i]); state.p2.totalScore += Number(details.p2_partials[i]); } else { state.p1.tbScore += Number(details.p1_partials[i]); state.p2.tbScore += Number(details.p2_partials[i]); }
                            state.currentEnd++;
                        }
                    }
                }

                state.p1.violations = details.p1_violations || []; state.p2.violations = details.p2_violations || [];
                recalcCards('p1'); recalcCards('p2');
                state.p1.seconds = state.initialTime; state.p2.seconds = state.initialTime;
                
                render(); syncTV();
            } catch (e) { root.innerHTML = `<div class="alert alert-danger" style="margin:20px;">Erro: ${e.message}</div>`; }
        });
    }

    function recalcCards(side) {
        let y = 0, r = 0;
        state[side].violations.forEach(v => { if (v.includes('Amarelo')) y++; if (v.includes('Vermelho')) r++; });
        state[side].yellowCards = y; state[side].redCards = r;
    }

    function syncTV() {
        const isP1Disqualified = state.p1.yellowCards >= 2 || state.p1.violations.some(v => v.includes('Vermelho') || v.includes('WO') || v.includes('Banimento') || v.includes('Forfeit') || v.includes('Desqualificação'));
        const isP2Disqualified = state.p2.yellowCards >= 2 || state.p2.violations.some(v => v.includes('Vermelho') || v.includes('WO') || v.includes('Banimento') || v.includes('Forfeit') || v.includes('Desqualificação'));
        const isTie = state.p1.totalScore === state.p2.totalScore; const tbTie = state.p1.tbScore === state.p2.tbScore;
        const isGameOver = (state.currentEnd > state.maxEnds && (!isTie || !tbTie)) || isP1Disqualified || isP2Disqualified;
        let p1Wins = false; let p2Wins = false;
        
        if (isGameOver) {
            if (isP1Disqualified && !isP2Disqualified) p2Wins = true; 
            else if (isP2Disqualified && !isP1Disqualified) p1Wins = true; 
            else {
                if (state.p1.totalScore > state.p2.totalScore) p1Wins = true; else if (state.p2.totalScore > state.p1.totalScore) p2Wins = true;
                else if (state.p1.tbScore > state.p2.tbScore) p1Wins = true; else if (state.p2.tbScore > state.p1.tbScore) p2Wins = true;
            }
        }

        channel.postMessage({
            type: 'SYNC',
            payload: {
                compName: state.competition.nome || state.competition.name || 'Competição',
                matchInfo: `${state.match.class_code} • Quadra ${state.match.court || '-'} • Jogo ${state.match.match_number || '-'}`,
                p1Name: state.p1.name, p1FullName: state.p1.name, p1DisplayName: state.p1.displayName, p1Bib: state.p1.bib, p1Club: state.p1.club, p1ClubFull: state.p1.clubFull, p1Rampa: state.p1.rampa, p1LogoUrl: state.p1.logoUrl, p1Score: state.p1.totalScore, p1TbScore: state.p1.tbScore, p1Time: formatTime(state.p1.seconds), p1BallsCount: state.p1.ballsCount, p1Violations: state.p1.violations, p1Penalties: state.p1.penalties,
                p2Name: state.p2.name, p2FullName: state.p2.name, p2DisplayName: state.p2.displayName, p2Bib: state.p2.bib, p2Club: state.p2.club, p2ClubFull: state.p2.clubFull, p2Rampa: state.p2.rampa, p2LogoUrl: state.p2.logoUrl, p2Score: state.p2.totalScore, p2TbScore: state.p2.tbScore, p2Time: formatTime(state.p2.seconds), p2BallsCount: state.p2.ballsCount, p2Violations: state.p2.violations, p2Penalties: state.p2.penalties,
                currentEnd: state.currentEnd > state.maxEnds ? (state.currentEnd === state.maxEnds + 1 ? '1º Tie-Break' : '2º Tie-Break') : `${state.currentEnd}º Parcial`,
                partials: state.partials, activeTimer: state.activeTimer, ballHistory: state.ballHistory, 
                globalTimer: state.globalTimer.active ? { label: state.globalTimer.label, time: formatTime(state.globalTimer.seconds) } : null,
                p1Winner: p1Wins, p2Winner: p2Wins, isGameOver: isGameOver, showReport: state.showReport, isStarted: state.isStarted, reportHTML: state.showReport ? generateReportHTML() : ''
            }
        });
    }

    function generateReportHTML() {
        let logosHtml = (state.logos || []).map(url => `<img src="${url}" style="max-height:60px; max-width:120px; object-fit:contain; margin: 0 15px;">`).join('');

        let html = `
        <div style="font-family: sans-serif; background: white; border-radius: 8px; color: #000; padding: 20px;">
            <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px;">
                ${logosHtml}
            </div>
            <h4 style="text-align:center; text-transform:uppercase; margin-top:0; color:#000; margin-bottom:10px; font-size:22px;">SÚMULA DE JOGO - ${escapeHTML(state.competition.nome || 'COMPETIÇÃO')}</h4>
            <p style="text-align:center; font-size:14px; color:#64748b; margin-top:0; margin-bottom:20px;">Dica: Clique nos números dos pontos para editar uma parcial passada.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: center; border: 2px solid #000;">
                <thead>
                    <tr style="background: #f1f5f9; border-bottom: 2px solid #000;">
                        <th style="border: 1px solid #000; padding: 12px; width:20%; color: #dc2626; font-size: 16px;">Tempo (V)</th>
                        <th style="border: 1px solid #000; padding: 12px; width:15%; color: #dc2626; font-size: 16px;">Pontos</th>
                        <th style="border: 1px solid #000; padding: 12px; width:30%; font-size: 16px; color: #000;">PARCIAL</th>
                        <th style="border: 1px solid #000; padding: 12px; width:15%; color: #2563eb; font-size: 16px;">Pontos</th>
                        <th style="border: 1px solid #000; padding: 12px; width:20%; color: #2563eb; font-size: 16px;">Tempo (A)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        for (let i = 0; i < state.maxEnds + 2; i++) {
            const p = state.partials[i] || { s1: '', s2: '', t1: '', t2: '' };
            const label = i < state.maxEnds ? `P${i+1}` : (i === state.maxEnds ? 'TB 1' : 'TB 2');
            const isTB = i >= state.maxEnds;
            if (isTB && !state.partials[i]) continue; 
            html += `
                    <tr>
                        <td style="border: 1px solid #000; padding: 10px; font-size: 18px; font-weight: bold; color: #000;">${p.t1}</td>
                        <td class="edit-score" data-idx="${i}" data-side="p1" style="border: 1px solid #000; padding: 10px; font-weight:bold; font-size:24px; color: #dc2626; cursor:pointer;">${p.s1 !== '' ? p.s1 : '-'}</td>
                        <td style="border: 1px solid #000; padding: 10px; font-weight:bold; font-size:18px; background: #f8fafc; color: #000;">${label}</td>
                        <td class="edit-score" data-idx="${i}" data-side="p2" style="border: 1px solid #000; padding: 10px; font-weight:bold; font-size:24px; color: #2563eb; cursor:pointer;">${p.s2 !== '' ? p.s2 : '-'}</td>
                        <td style="border: 1px solid #000; padding: 10px; font-size: 18px; font-weight: bold; color: #000;">${p.t2}</td>
                    </tr>
            `;
        }
        
        html += `
                </tbody>
                <tfoot>
                    <tr style="border-top: 2px solid #000; background: #e2e8f0;">
                        <td colspan="2" style="border: 1px solid #000; padding: 15px; font-size:32px; font-weight:bold; color: #dc2626;">${state.p1.totalScore}</td>
                        <td style="border: 1px solid #000; padding: 15px; font-weight:bold; font-size:20px; color: #000;">PLACAR FINAL</td>
                        <td colspan="2" style="border: 1px solid #000; padding: 15px; font-size:32px; font-weight:bold; color: #2563eb;">${state.p2.totalScore}</td>
                    </tr>
                </tfoot>
            </table>
            
            <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
                <tr>
                    <td style="width: 50%; border: 1px solid #000; padding: 15px; background: #fef2f2; vertical-align: top;">
                        <div style="font-weight:bold; font-size:14px; margin-bottom:10px; color:#dc2626; border-bottom: 2px solid #000; padding-bottom:6px;">VIOLAÇÕES (VERMELHO):</div>
                        <div style="font-size:14px; color:#000; line-height: 1.4;">${state.p1.violations.length ? state.p1.violations.map(v=>`• ${escapeHTML(formatViolationString(v))}`).join('<br>') : 'Nenhuma violação registrada.'}</div>
                    </td>
                    <td style="width: 50%; border: 1px solid #000; padding: 15px; background: #eff6ff; vertical-align: top;">
                        <div style="font-weight:bold; font-size:14px; margin-bottom:10px; color:#2563eb; border-bottom: 2px solid #000; padding-bottom:6px;">VIOLAÇÕES (AZUL):</div>
                        <div style="font-size:14px; color:#000; line-height: 1.4;">${state.p2.violations.length ? state.p2.violations.map(v=>`• ${escapeHTML(formatViolationString(v))}`).join('<br>') : 'Nenhuma violação registrada.'}</div>
                    </td>
                </tr>
            </table>
        </div>
        `;
        return html;
    }

    function saveStateForUndo() {
        actionHistory.push(JSON.stringify({
            p1: { ...state.p1, balls: [...state.p1.balls], violations: [...state.p1.violations], penalties: [...state.p1.penalties] },
            p2: { ...state.p2, balls: [...state.p2.balls], violations: [...state.p2.violations], penalties: [...state.p2.penalties] },
            currentEnd: state.currentEnd, 
            partials: JSON.parse(JSON.stringify(state.partials)), 
            ballHistory: [...state.ballHistory]
        }));
        if(actionHistory.length > 30) actionHistory.shift();
        const btnUndo = document.getElementById('btn-undo');
        if(btnUndo) btnUndo.disabled = false;
    }

    function undoAction() {
        if(actionHistory.length === 0) return;
        const last = JSON.parse(actionHistory.pop());
        Object.assign(state.p1, last.p1); Object.assign(state.p2, last.p2);
        state.currentEnd = last.currentEnd; 
        state.partials = last.partials; 
        state.ballHistory = last.ballHistory || []; 
        const btnUndo = document.getElementById('btn-undo'); if(btnUndo) btnUndo.disabled = actionHistory.length === 0;
        updateCounters();
    }

    function updateCounters() {
        document.getElementById('p1-time-disp').innerText = formatTime(state.p1.seconds);
        document.getElementById('p2-time-disp').innerText = formatTime(state.p2.seconds);
        document.getElementById('p1-end-score').innerText = state.p1.totalScore;
        document.getElementById('p2-end-score').innerText = state.p2.totalScore;

        const tb1El = document.getElementById('p1-tb-score'); const tb2El = document.getElementById('p2-tb-score');
        if (state.currentEnd > state.maxEnds && (state.p1.tbScore > 0 || state.p2.tbScore > 0 || state.partials.length > state.maxEnds)) {
            tb1El.innerText = `(${state.p1.tbScore})`; tb2El.innerText = `(${state.p2.tbScore})`; tb1El.style.display = 'block'; tb2El.style.display = 'block';
        } else { tb1El.style.display = 'none'; tb2El.style.display = 'none'; }

        const isP1Disqualified = state.p1.yellowCards >= 2 || state.p1.violations.some(v => v.includes('Vermelho') || v.includes('WO') || v.includes('Banimento') || v.includes('Forfeit') || v.includes('Desqualificação'));
        const isP2Disqualified = state.p2.yellowCards >= 2 || state.p2.violations.some(v => v.includes('Vermelho') || v.includes('WO') || v.includes('Banimento') || v.includes('Forfeit') || v.includes('Desqualificação'));
        const isTie = state.p1.totalScore === state.p2.totalScore; const tbTie = state.p1.tbScore === state.p2.tbScore;
        const isGameOver = (state.currentEnd > state.maxEnds && (!isTie || !tbTie)) || isP1Disqualified || isP2Disqualified;
        let p1Wins = false; let p2Wins = false;
        
        if (isGameOver) {
            if (isP1Disqualified && !isP2Disqualified) p2Wins = true; 
            else if (isP2Disqualified && !isP1Disqualified) p1Wins = true; 
            else {
                if (state.p1.totalScore > state.p2.totalScore) p1Wins = true; else if (state.p2.totalScore > state.p1.totalScore) p2Wins = true;
                else if (state.p1.tbScore > state.p2.tbScore) p1Wins = true; else if (state.p2.tbScore > state.p1.tbScore) p2Wins = true;
            }
        }

        const p1PlayBtn = document.getElementById('btn-play-p1'); const p2PlayBtn = document.getElementById('btn-play-p2');
        if (p1PlayBtn && p2PlayBtn) {
            p1PlayBtn.innerText = state.activeTimer === 'p1' ? '⏸' : '▶'; p2PlayBtn.innerText = state.activeTimer === 'p2' ? '⏸' : '▶';
            p1PlayBtn.style.color = state.activeTimer === 'p1' ? '#fbbf24' : 'rgba(255,255,255,0.8)';
            p2PlayBtn.style.color = state.activeTimer === 'p2' ? '#fbbf24' : 'rgba(255,255,255,0.8)';
        }

        if (state.globalTimer.active) {
            document.getElementById('center-stopped').style.display = 'none'; document.getElementById('center-global-timer').style.display = 'flex';
            document.getElementById('global-timer-label').innerText = state.globalTimer.label; document.getElementById('global-timer-disp').innerText = formatTime(state.globalTimer.seconds);
        } else {
            document.getElementById('center-global-timer').style.display = 'none'; document.getElementById('center-stopped').style.display = 'flex';
        }
        
        const p1Lock = document.getElementById('p1-interactive'); const p2Lock = document.getElementById('p2-interactive');
        if (state.globalTimer.active || isGameOver || !state.hasControlPermission) {
            p1Lock.classList.add('locked'); p2Lock.classList.add('locked');
            if(p1PlayBtn) p1PlayBtn.disabled = true; if(p2PlayBtn) p2PlayBtn.disabled = true;
        } else {
            p1Lock.classList.remove('locked'); p2Lock.classList.remove('locked');
            if(p1PlayBtn) p1PlayBtn.disabled = false; if(p2PlayBtn) p2PlayBtn.disabled = false;
        }

        let p1NameHtml = state.p1.displayName !== 'A Definir' ? `${state.p1.bib && state.p1.bib !== '-' ? `${escapeHTML(state.p1.bib)} - ` : ''}${state.p1.displayName}` : 'A Definir';
        let p2NameHtml = state.p2.displayName !== 'A Definir' ? `${state.p2.bib && state.p2.bib !== '-' ? `${escapeHTML(state.p2.bib)} - ` : ''}${state.p2.displayName}` : 'A Definir';
        
        const btnNext = document.getElementById('btn-next-end'); const btnFinish = document.getElementById('btn-finish-match');
        
        if (isGameOver) {
            if (p1Wins) { p1NameHtml += ' <span style="color:#22c55e; margin-left:8px; font-weight:900;">VENCEDOR</span>'; document.getElementById('tv-p1-side-container').style.backgroundColor = '#166534'; }
            if (p2Wins) { p2NameHtml += ' <span style="color:#22c55e; margin-left:8px; font-weight:900;">VENCEDOR</span>'; document.getElementById('tv-p2-side-container').style.backgroundColor = '#166534'; }
            document.getElementById('top-end-indicator').innerText = 'JOGO FINALIZADO';
            btnNext.style.display = 'none'; if(btnFinish) btnFinish.style.display = 'block';
        } else {
            document.getElementById('tv-p1-side-container').style.backgroundColor = ''; document.getElementById('tv-p2-side-container').style.backgroundColor = '';
            document.getElementById('top-end-indicator').innerText = state.currentEnd > state.maxEnds ? (state.currentEnd === state.maxEnds + 1 ? '1º TIE-BREAK' : '2º TIE-BREAK') : `${state.currentEnd}º PARCIAL`;
            btnNext.style.display = 'block'; btnNext.disabled = false; btnNext.style.background = '#334155'; btnNext.innerText = '✅ Encerrar Parcial e Mudar End';
            if(btnFinish) btnFinish.style.display = 'none';
        }

        document.getElementById('p1-logo-container').innerHTML = state.p1.logoUrl ? `<img src="${state.p1.logoUrl}" class="logo-corner-p1">` : '';
        document.getElementById('p2-logo-container').innerHTML = state.p2.logoUrl ? `<img src="${state.p2.logoUrl}" class="logo-corner-p2">` : '';

        let p1C = '🟨'.repeat(state.p1.yellowCards) + '🟥'.repeat(state.p1.redCards); if(p1C) p1C = `<span style="font-size:0.6em; margin-right:0.5vw; vertical-align: middle;">${p1C}</span>`;
        document.getElementById('p1-name-display').style.fontSize = getDynamicFontSizeTablet(p1NameHtml); document.getElementById('p1-name-display').innerHTML = `${p1C}${p1NameHtml}`;
        
        let p2C = '🟨'.repeat(state.p2.yellowCards) + '🟥'.repeat(state.p2.redCards); if(p2C) p2C = `<span style="font-size:0.6em; margin-right:0.5vw; vertical-align: middle;">${p2C}</span>`;
        document.getElementById('p2-name-display').style.fontSize = getDynamicFontSizeTablet(p2NameHtml); document.getElementById('p2-name-display').innerHTML = `${p2C}${p2NameHtml}`;
        
        document.getElementById('p1-club-display').innerHTML = `${escapeHTML(state.p1.clubFull || '-')} ${state.p1.rampa ? `<br><span style="color:#fca5a5; font-weight:normal; font-size:12px;">Op: ${escapeHTML(state.p1.rampa)}</span>` : ''}`;
        document.getElementById('p2-club-display').innerHTML = `${escapeHTML(state.p2.clubFull || '-')} ${state.p2.rampa ? `<br><span style="color:#93c5fd; font-weight:normal; font-size:12px;">Op: ${escapeHTML(state.p2.rampa)}</span>` : ''}`;
        
        document.getElementById('p1-balls').innerHTML = Array.from({length: state.p1.ballsCount}).map((_, i) => `<div class="boccia-ball red-ball ${state.p1.balls[i] ? 'played' : ''}" data-side="p1" data-idx="${i}"></div>`).join('');
        document.getElementById('p2-balls').innerHTML = Array.from({length: state.p2.ballsCount}).map((_, i) => `<div class="boccia-ball blue-ball ${state.p2.balls[i] ? 'played' : ''}" data-side="p2" data-idx="${i}"></div>`).join('');
        document.getElementById('p1-1p-container').innerHTML = state.p1.penalties.map((played, i) => `<button class="btn-1p ${played ? 'played' : ''}" data-side="p1" data-idx="${i}">1P</button>`).join('');
        document.getElementById('p2-1p-container').innerHTML = state.p2.penalties.map((played, i) => `<button class="btn-1p ${played ? 'played' : ''}" data-side="p2" data-idx="${i}">1P</button>`).join('');
        
        const renderViolationsToGrid = (viols, side) => {
            if (!viols || !viols.length) return '';
            return viols.map((v, i) => `<div class="viol-item" title="${escapeHTML(v.split(' | ')[0])}"><span>⚠️ ${escapeHTML(formatViolationString(v))}</span> ${state.hasControlPermission ? `<button class="btn-del-viol main-del-viol" data-side="${side}" data-idx="${i}">&times;</button>` : ''}</div>`).join('');
        };

        document.getElementById('main-p1-viol-list').innerHTML = renderViolationsToGrid(state.p1.violations, 'p1');
        document.getElementById('main-p2-viol-list').innerHTML = renderViolationsToGrid(state.p2.violations, 'p2');
        syncTV();
    }

    function updateScoreModalUI() {
        document.querySelectorAll('.btn-score-opt').forEach(btn => {
            const side = btn.dataset.side; const val = parseInt(btn.dataset.val);
            btn.classList.remove('active-p1', 'active-p2');
            if (side === 'p1' && val === tempScoreP1) btn.classList.add('active-p1');
            if (side === 'p2' && val === tempScoreP2) btn.classList.add('active-p2');
        });
    }

    function toggleTimer(side) {
        if (!state.hasControlPermission) return;
        if (state.activeTimer === side || side === 'stop') { state.activeTimer = null; clearInterval(timerInterval); } 
        else {
            if(!audioCtx) playBeep();
            state.activeTimer = side; clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                if (state.activeTimer === 'p1') { if (state.p1.seconds > 0) { state.p1.seconds--; if ([60, 30, 10, 0].includes(state.p1.seconds)) playBeep(); } else toggleTimer('stop'); } 
                else if (state.activeTimer === 'p2') { if (state.p2.seconds > 0) { state.p2.seconds--; if ([60, 30, 10, 0].includes(state.p2.seconds)) playBeep(); } else toggleTimer('stop'); }
                updateCounters();
            }, 1000);
        }
        updateCounters();
    }

    function startGlobalTimer(seconds, label) {
        if (!state.hasControlPermission) return;
        if (state.activeTimer !== null) toggleTimer('stop');
        clearInterval(state.globalTimer.interval); if(!audioCtx) playBeep();

        state.globalTimer.active = true; state.globalTimer.paused = false; state.globalTimer.seconds = seconds; state.globalTimer.label = label;
        
        const btnPause = document.getElementById('btn-pause-resume-global');
        if(btnPause) { btnPause.innerText = "⏸ PAUSAR"; btnPause.style.background = "#fbbf24"; btnPause.style.color = "#000"; }

        state.globalTimer.interval = setInterval(() => {
            if (!state.globalTimer.paused) {
                if (state.globalTimer.seconds > 0) { state.globalTimer.seconds--; if (state.globalTimer.label === 'Entre Parciais' && state.globalTimer.seconds === 15) playBeep(); } 
                else { stopGlobalTimer(); }
                updateCounters();
            }
        }, 1000);
        updateCounters();
    }

    function stopGlobalTimer() { clearInterval(state.globalTimer.interval); state.globalTimer.active = false; updateCounters(); }

    function renderViolationsModal() {
        const renderList = (viols, side) => {
            if (!viols || !viols.length) return '';
            return viols.map((v, i) => {
                const colorClass = v.includes('Amarelo') ? 'yellow' : (v.includes('Vermelho') || v.includes('WO') ? 'red' : '');
                return `<div class="viol-item" style="color: #1e293b; display:flex; justify-content:space-between; align-items:center; padding: 10px; background: rgba(255,255,255,0.8); border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; margin-bottom: 5px;"><span class="viol-item-text" style="font-weight:bold;">⚠️ ${escapeHTML(formatViolationString(v))}</span>${state.hasControlPermission ? `<button class="modal-del-viol" data-side="${side}" data-idx="${i}" style="background:transparent; border:none; color:#ef4444; font-size:20px; font-weight:bold; cursor:pointer;">&times;</button>` : ''}</div>`;
            }).join('');
        };
        const mList1 = document.getElementById('modal-p1-viol-list'); const mList2 = document.getElementById('modal-p2-viol-list');
        if(mList1) mList1.innerHTML = renderList(state.p1.violations, 'p1'); if(mList2) mList2.innerHTML = renderList(state.p2.violations, 'p2');

        if(state.hasControlPermission) {
            document.querySelectorAll('.modal-del-viol').forEach(btn => {
                btn.onclick = (e) => {
                    const side = e.target.dataset.side; const idx = e.target.dataset.idx;
                    saveStateForUndo(); state[side].violations.splice(idx, 1); recalcCards(side); renderViolationsModal(); updateCounters(); 
                };
            });
        }
    }

    function render() {
        const violOptionsHtml = VIOLATIONS_DICT.map(g => `<optgroup label="${g.group}">${g.rules.map(r => `<option value="${r.code}|${r.text}|${g.penalty}">${r.code} - ${r.text}</option>`).join('')}</optgroup>`).join('');

        let logoutBtnHtml = '';
        if (state.hasControlPermission) {
            logoutBtnHtml = `<button class="sidebar-btn" id="btn-menu-logout" style="color: #ef4444; border-top: 1px dashed #334155; margin-top: 10px;">🚪 Encerrar Turno (Logout)</button>`;
        }

        const resetBtnHtml = state.hasControlPermission ? `<button class="sidebar-btn" id="btn-menu-restart-match" style="color: #fca5a5;">⚠️ Apagar Todo o Jogo</button>` : '';

        const styles = `
            <style>
                html, body { overflow: hidden !important; height: 100vh; width: 100vw; margin: 0; padding: 0; background: #000; }
                body::-webkit-scrollbar { display: none; }
                .live-container { margin: 0; padding: 0; font-family: sans-serif; background: #000; height: 100vh; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; }
                .live-header { display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 0 25px; border-bottom: 2px solid #334155; color: white; height: 60px; box-sizing: border-box; flex-shrink: 0; }
                .btn-hamburger { background: transparent; border: none; color: white; font-size: 24px; cursor: pointer; padding: 10px; transition: 0.2s; }
                .btn-hamburger:hover { color: #3b82f6; }
                .header-end-title { text-align: center; font-size: 20px; font-weight: 900; color: #fbbf24; text-transform: uppercase; letter-spacing: 2px; }
                .header-match-info { text-align: right; font-size: 14px; font-weight: bold; color: #94a3b8; }
                .sidebar { position: fixed; top: 0; left: -320px; width: 300px; height: 100%; background: #0f172a; border-right: 2px solid #334155; z-index: 9999; display: flex; flex-direction: column; transition: left 0.3s ease; box-shadow: 10px 0 30px rgba(0,0,0,0.8); }
                .sidebar.open { left: 0; }
                .sidebar-header { padding: 20px; font-size: 20px; font-weight: bold; color: white; border-bottom: 1px solid #334155; text-align: center; background: #020617; }
                .sidebar-btn { background: transparent; color: white; border: none; padding: 20px; text-align: left; font-size: 16px; font-weight: bold; cursor: pointer; border-bottom: 1px solid #1e293b; transition: 0.2s; }
                .sidebar-btn:hover { background: #1e293b; color: #3b82f6; padding-left: 25px; }
                .sidebar-btn.close-btn { background: #7f1d1d; text-align: center; border: none; margin-top: auto; }
                .sidebar-btn.close-btn:hover { background: #b91c1c; padding-left: 20px; }
                .panels-grid { display: flex; position: relative; flex: 1; overflow: hidden; }
                .panel { flex: 1; display: flex; flex-direction: column; color: white; position: relative; transition: background-color 0.3s ease; overflow: hidden; }
                .panel-red { background: #dc2626; border-right: 2px solid #000; } 
                .panel-blue { background: #2563eb; border-left: 2px solid #000; }
                .center-overlay { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; width: 100%; }
                .box-stopped { display: flex; flex-direction: column; gap: 15px; background: rgba(15, 23, 42, 0.95); padding: 25px 20px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); border: 2px solid #334155; backdrop-filter: blur(5px); pointer-events: auto; }
                .btn-center { background: #334155; color: white; border: 2px solid #475569; padding: 15px 30px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3); text-transform: uppercase; letter-spacing: 1px; }
                .btn-center:hover:not(:disabled) { background: #475569; border-color: #94a3b8; transform: translateY(-2px); }
                .btn-center:disabled { opacity: 0.3; cursor: not-allowed; box-shadow: none; }
                .btn-center-highlight { border-color: #fbbf24; color: #fef08a; background: #854d0e; }
                .global-timer-box { display: flex; flex-direction: column; align-items: center; background: rgba(15, 23, 42, 0.95); border: 3px solid #fbbf24; padding: 20px 30px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.9); backdrop-filter: blur(5px); pointer-events: auto; }
                .gt-label { font-size: 16px; font-weight: 900; color: #fbbf24; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 1px; }
                .gt-time { font-size: 50px; font-weight: bold; color: white; line-height: 1; font-variant-numeric: tabular-nums; margin-bottom: 15px; text-shadow: 0 4px 10px rgba(0,0,0,0.5); }
                .btn-gt-ctrl { background: #fbbf24; color: #000; border: none; padding: 20px; border-radius: 12px; font-weight: 900; cursor: pointer; font-size: 24px; width: 100%; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
                .btn-gt-close { background: #ef4444; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; width: 100%; transition: 0.2s; margin-top: 5px; }
                .p-head { padding: 20px 15px; text-align: center; text-transform: uppercase; line-height: 1.2; background: rgba(0,0,0,0.2); position: relative; min-height: 140px; display: flex; flex-direction: column; justify-content: center; align-items: center; flex-shrink: 0; }
                .logo-corner-p1 { position: absolute; top: 15px; left: 15px; height: 90px; max-width: 120px; object-fit: contain; background: white; border-radius: 8px; padding: 5px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 1; }
                .logo-corner-p2 { position: absolute; top: 15px; right: 15px; height: 90px; max-width: 120px; object-fit: contain; background: white; border-radius: 8px; padding: 5px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 1; }
                #p1-name-display, #p2-name-display { font-weight: 900; letter-spacing: 1px; z-index: 2; position: relative; text-shadow: 0 2px 4px rgba(0,0,0,0.5); margin-top: 10px; padding: 0 10vw; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
                .p-club-name { font-size: 16px; font-weight: bold; color: rgba(255,255,255,0.9); margin-top: 6px; letter-spacing: 1px; z-index: 2; position: relative; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }
                .p-body { padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; flex: 1; overflow-y: hidden; position: relative; }
                .score-area { width: 100%; display: flex; flex-direction: column; align-items: center; position: relative; border-bottom: 2px dashed rgba(255,255,255,0.2); padding-bottom: 2vh; margin-bottom: 2vh; }
                .score-label { font-weight: bold; color: rgba(255,255,255,0.8); font-size: 14px; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 1px; }
                .score-val { font-size: 130px; font-weight: bold; user-select: none; background: rgba(0,0,0,0.4); border-radius: 20px; padding: 0 60px; border: 2px solid rgba(255,255,255,0.2); text-shadow: 0 4px 10px rgba(0,0,0,0.4); box-shadow: inset 0 4px 10px rgba(0,0,0,0.2); line-height: 1; margin: 0; color: #fff; }
                .timer-row { display: flex; align-items: center; justify-content: center; position: relative; width: 100%; max-width: 450px; background: #000; padding: 1vh 2vw; border-radius: 2vh; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 4px 10px rgba(0,0,0,0.5); gap: 2vw; }
                .time-display { font-size: 100px; font-weight: bold; font-variant-numeric: tabular-nums; line-height: 1; color: white; cursor: pointer; transition: 0.2s; text-shadow: 0 4px 10px rgba(0,0,0,0.3); }
                .time-display:hover { opacity: 0.8; }
                .btn-play-icon { font-size: 80px; background: transparent; border: none; color: rgba(255,255,255,0.8); cursor: pointer; transition: 0.2s; outline: none; display: flex; align-items: center; justify-content: center; padding: 0; }
                .btn-play-icon:hover:not(:disabled) { color: white; transform: scale(1.1); filter: drop-shadow(0 0 15px rgba(255,255,255,0.5)); }
                .btn-play-icon:disabled { opacity: 0.3; cursor: not-allowed; }
                .penalty-ball-container { position: absolute; right: -70px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 8px; z-index: 10; }
                .btn-1p { background: #eab308; color: #1e293b; border: 3px solid #fef08a; border-radius: 50%; width: 45px; height: 45px; font-size: 16px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5); transition: 0.2s; }
                .btn-1p:hover:not(.played) { transform: scale(1.1); background: #fef08a; }
                .btn-1p.played { opacity: 0.4; filter: grayscale(80%); box-shadow: none; transform: scale(0.9); }
                .interactive-area { width: 100%; display: flex; flex-direction: column; align-items: center; transition: 0.3s; margin-top: 10px; }
                .locked { pointer-events: none; opacity: 0.5; filter: grayscale(50%); }
                .balls-wrapper { display: flex; align-items: center; gap: 15px; margin-top: 15px; background: rgba(0,0,0,0.25); padding: 12px 20px; border-radius: 30px; border: 1px solid rgba(255,255,255,0.1); width: 100%; max-width: 350px; justify-content: space-between; box-sizing: border-box; }
                .btn-ball-ctrl { background: rgba(255,255,255,0.2); border: none; color: white; font-size: 24px; font-weight: bold; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; transition: 0.2s; }
                .btn-ball-ctrl:hover { background: rgba(255,255,255,0.4); transform: scale(1.1); }
                .balls-container { display: flex; gap: 6px; flex: 1; justify-content: center; min-height: 25px; }
                .boccia-ball { width: 25px; height: 25px; border-radius: 50%; box-shadow: inset -3px -3px 6px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4); cursor: pointer; }
                .red-ball { background: #fca5a5; }
                .blue-ball { background: #93c5fd; }
                .boccia-ball.played { opacity: 0.2; filter: grayscale(70%); box-shadow: none; transform: scale(0.85); }
                .btn-viol { background: rgba(0,0,0,0.5); color: #fbbf24; border: 1px dashed rgba(255,255,255,0.4); padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 20px; width: 100%; max-width: 350px; text-transform: uppercase; font-size: 13px; transition: 0.2s; }
                .btn-viol:hover { background: rgba(0,0,0,0.8); border-style: solid; }
                .viol-list-main { display: flex; flex-direction: column; gap: 5px; margin-top: 15px; width: 100%; max-width: 80%; align-self: center; max-height: 140px; overflow-y: auto; padding-right: 5px; }
                #main-p1-viol-list { align-self: flex-start; margin-left: 20px; }
                #main-p2-viol-list { align-self: flex-end; margin-right: 20px; }
                .viol-list-main::-webkit-scrollbar { width: 6px; }
                .viol-list-main::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
                .viol-list-main::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.4); border-radius: 4px; }
                .viol-item { background: rgba(0,0,0,0.6); border: 1px solid rgba(251,191,36,0.4); padding: 10px 12px; border-radius: 6px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box; color: #fbbf24; font-weight: bold; text-align: left; }
                .viol-item span { white-space: normal; word-wrap: break-word; flex: 1; line-height: 1.3; }
                .main-del-viol { background: transparent; border: none; color: #fca5a5; font-weight: bold; cursor: pointer; font-size: 20px; margin-left: 10px; padding: 0; line-height: 1; transition: 0.2s; }
                .main-del-viol:hover { color: #ef4444; transform: scale(1.2); }
                .viol-list-modal { width: 100%; display: flex; flex-direction: column; gap: 5px; margin-top: 10px; max-height: 150px; overflow-y: auto; padding-right: 5px; }
                .viol-list-modal::-webkit-scrollbar { width: 6px; }
                .viol-list-modal::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 4px; }
                .viol-list-modal::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.3); border-radius: 4px; }
                .viol-list-modal .viol-item { background: rgba(255,255,255,0.8); border: 1px solid rgba(0,0,0,0.1); color: #1e293b; }
                .modal-del-viol { cursor: pointer; color: #ef4444; font-weight: bold; background: none; border: none; font-size: 18px; padding: 0 5px; }
                .central-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 25px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: flex; flex-direction: column; gap: 20px; z-index: 10000; color: black; border: 4px solid #0f172a; display: none; min-width: 750px; width: 80%; max-width: 1000px; max-height: 90vh; overflow-y: auto; }
                .central-modal h3 { margin: 0; font-size: 18px; text-transform: uppercase; color: #1e293b; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
                .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 999; display: none; }
                .score-options { display: flex; gap: 5px; margin-top: 10px; justify-content: space-between; }
                .btn-score-opt { flex: 1; padding: 12px 0; font-size: 20px; font-weight: bold; border-radius: 6px; border: 2px solid rgba(0,0,0,0.1); cursor: pointer; background: white; transition: 0.2s; color: #0f172a; }
                .btn-score-opt:hover { background: #f1f5f9; transform: scale(1.05); }
                .btn-score-opt.active-p1 { background: #dc2626; color: white; border-color: #7f1d1d; transform: scale(1.1); box-shadow: 0 4px 8px rgba(220,38,38,0.4); }
                .btn-score-opt.active-p2 { background: #2563eb; color: white; border-color: #1e3a8a; transform: scale(1.1); box-shadow: 0 4px 8px rgba(37,99,235,0.4); }
                .modal-btns { display: flex; gap: 10px; }
                .modal-btns button { flex: 1; padding: 15px; font-size: 16px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; }
                .btn-primary { background: #0d6efd; color: white; }
                .btn-secondary { background: #e2e8f0; color: #475569; }
                .footer-controls { background: #0f172a; padding: 15px 25px; display: flex; gap: 15px; border-top: 2px solid #334155; position: relative; z-index: 100; flex-shrink: 0; height: 80px; box-sizing: border-box; }
                .big-btn { flex: 1; padding: 15px; font-size: 16px; font-weight: bold; border-radius: 8px; border: none; cursor: pointer; text-transform: uppercase; transition: 0.2s; }
                .btn-next { background: #3b82f6; color: white; }
                .btn-next:hover { background: #2563eb; }
                .btn-finish { background: #16a34a; color: white; display: none; }
                #overlay-start-match { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15,23,42,0.98); z-index: 8500; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
            </style>
        `;

        root.innerHTML = `
            ${styles}
            <div id="overlay-start-match" style="display: ${state.isStarted ? 'none' : 'flex'};">
                <div style="font-size:24px; color:#94a3b8; font-weight:bold; margin-bottom:20px;">PRÓXIMO JOGO DA QUADRA ${escapeHTML(state.match.court || '-')}</div>
                <div style="font-size:30px; color:white; font-weight:900; margin-bottom:40px; text-align:center; line-height: 1.3; width:100%; padding: 0 20px;">
                    <div style="color:#ffffff; display:flex; flex-direction:column; align-items:center;">
                       ${state.p1.logoUrl ? `<img src="${state.p1.logoUrl}" style="height: 60px; max-width: 100px; object-fit: contain; margin-bottom: 10px; border-radius:6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); background: white; padding: 4px;">` : ''}
                       ${state.p1.displayName !== 'A Definir' ? `${escapeHTML(state.p1.bib)} - ${state.p1.displayName}` : 'A Definir'}<br>
                       <span style="font-size: 18px; color: #94a3b8; font-weight: bold;">${escapeHTML(state.p1.clubFull) || '-'}</span>
                    </div> 
                    <div style="color:#64748b; font-size: 24px; margin: 30px 0;">VS</div> 
                    <div style="color:#ffffff; display:flex; flex-direction:column; align-items:center;">
                       ${state.p2.logoUrl ? `<img src="${state.p2.logoUrl}" style="height: 60px; max-width: 100px; object-fit: contain; margin-bottom: 10px; border-radius:6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); background: white; padding: 4px;">` : ''}
                       ${state.p2.displayName !== 'A Definir' ? `${escapeHTML(state.p2.bib)} - ${state.p2.displayName}` : 'A Definir'}<br>
                       <span style="font-size: 18px; color: #94a3b8; font-weight: bold;">${escapeHTML(state.p2.clubFull) || '-'}</span>
                    </div>
                </div>
                <button id="btn-start-game" style="background:#16a34a; color:white; border:none; padding:20px 50px; font-size:24px; font-weight:bold; border-radius:12px; cursor:pointer; box-shadow:0 10px 20px rgba(0,0,0,0.5); transition:0.2s;">▶ INICIAR PARTIDA</button>
            </div>

            <div id="sidebar" class="sidebar">
                <div class="sidebar-header">MENU DA MESA</div>
                <button class="sidebar-btn" id="btn-menu-back">🔙 Voltar à Lista de Partidas</button>
                <button class="sidebar-btn" id="btn-menu-report" style="color: #fbbf24;">📄 Ver Súmula (Report)</button>
                <button class="sidebar-btn" id="btn-menu-restart-end">🔄 Reiniciar Parcial Atual</button>
                <button class="sidebar-btn" id="btn-menu-swap">🔀 Trocar Lados (Cores)</button>
                <button class="sidebar-btn" id="btn-menu-status">📡 Status Conexão TV</button>
                ${state.hasControlPermission ? `<button class="sidebar-btn" id="btn-menu-restart-match" style="color: #fca5a5;">⚠️ Apagar Todo o Jogo</button>` : ''}
                ${state.hasControlPermission ? `<button class="sidebar-btn" id="btn-menu-logout" style="color: #ef4444; border-top: 1px dashed #334155; margin-top: 10px;">🚪 Encerrar Turno (Logout)</button>` : ''}
                <button class="sidebar-btn close-btn" id="btn-menu-close">FECHAR MENU</button>
            </div>

            <div class="modal-overlay" id="modal-bg"></div>
            
            <div class="central-modal" id="modal-report">
                <div id="report-content" style="color: #334155;"></div>
                <div class="modal-btns" style="margin-top:20px;"><button class="btn-secondary" id="btn-close-report">Voltar à Mesa</button><button class="btn-primary" id="btn-confirm-send-report" style="display:none; background: #16a34a;">Confirmar e Enviar para a Nuvem</button></div>
            </div>

            <div class="central-modal" id="modal-tempos" style="min-width: 400px; max-width: 500px;">
                <h3>Cronômetro Central</h3>
                <div class="tm-list" style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn-tm-sel" data-sec="60" data-label="Entre Parciais" style="padding: 15px; font-size: 16px; font-weight: bold; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer;">1 Minuto (Entre Parciais)</button>
                    <button class="btn-tm-sel" data-sec="120" data-label="Aquecimento" style="padding: 15px; font-size: 16px; font-weight: bold; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer;">2 Minutos (Aquecimento)</button>
                    <button class="btn-tm-sel" data-sec="600" data-label="Tempo Médico" style="padding: 15px; font-size: 16px; font-weight: bold; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer;">10 Minutos (Médico/Técnico)</button>
                </div>
                <div class="modal-btns" style="margin-top: 15px;"><button class="btn-secondary" id="btn-close-tempos">Cancelar</button></div>
            </div>

            <div class="central-modal" id="modal-violation" style="min-width: 400px; max-width: 500px;">
                <h3 id="viol-title">Violação</h3>
                <select id="sel-viol" style="padding:15px; border-radius:8px; width:100%; border:1px solid #ccc; font-size: 16px;"><option value="">-- Selecione a Regra --</option>${violOptionsHtml}</select>
                <div style="display:flex; gap:20px; margin-top:20px;">
                    <div style="flex:1;">
                        <h4 style="font-size:12px; color:#64748b; margin-bottom:5px;">VIOLAÇÕES (VERMELHO)</h4>
                        <div class="viol-list-modal" id="modal-p1-viol-list"></div>
                    </div>
                    <div style="flex:1;">
                        <h4 style="font-size:12px; color:#64748b; margin-bottom:5px;">VIOLAÇÕES (AZUL)</h4>
                        <div class="viol-list-modal" id="modal-p2-viol-list"></div>
                    </div>
                </div>
                <div class="modal-btns" style="margin-top: 15px;"><button class="btn-secondary" id="btn-close-viol">Concluir</button><button class="btn-primary" id="btn-save-viol">Aplicar Falta</button></div>
            </div>

            <div class="central-modal" id="modal-end-score" style="min-width: 450px;">
                <h3>Resultado do Parcial</h3>
                <div style="display:flex; flex-direction:column; gap:15px;">
                    <div style="background:#fee2e2; padding:15px; border-radius:8px;"><strong style="color:#b91c1c; font-size: 16px;">Pontos do VERMELHO</strong><div class="score-options" id="p1-score-options"></div></div>
                    <div style="background:#dbeafe; padding:15px; border-radius:8px;"><strong style="color:#1d4ed8; font-size: 16px;">Pontos do AZUL</strong><div class="score-options" id="p2-score-options"></div></div>
                </div>
                <div class="modal-btns" style="margin-top:10px;"><button class="btn-secondary" id="btn-cancel-score">Cancelar</button><button class="btn-primary" id="btn-confirm-score">Confirmar e Iniciar Timer</button></div>
            </div>

            <div class="live-container">
                <div class="live-header">
                    <div class="live-header-left" style="width: 33%;"><button class="btn-hamburger" id="btn-menu" title="Menu">☰</button><button id="btn-sync-tv" style="background: transparent; border: none; color: #16a34a; font-size: 20px; cursor: pointer; padding-left: 15px;" title="Sincronizar TV">🔄</button></div>
                    <div class="header-end-title" id="top-end-indicator" style="width: 34%;">1º PARCIAL</div>
                    <div class="header-match-info" style="width: 33%;">${escapeHTML(state.match.class_code)} • Quadra ${state.match.court || '-'}</div>
                </div>

                <div class="panels-grid">
                    <div class="panel panel-red" id="tv-p1-side-container">
                        <div class="p-head">
                            <div id="p1-logo-container"></div>
                            <div id="p1-name-display">--</div>
                            <div class="p-club-name" id="p1-club-display">--</div>
                        </div>
                        <div class="p-body">
                            
                            <div class="interactive-area" id="p1-interactive">
                                <div class="score-area">
                                    <div class="score-label">PONTOS</div>
                                    <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                                        <div class="score-val" id="p1-end-score">0</div>
                                        <div id="p1-tb-score" style="position:absolute; right: -50px; font-size:30px; color:#fbbf24; font-weight:bold; display:none;"></div>
                                        <div id="p1-1p-container" class="penalty-ball-container" style="right: -80px;"></div>
                                    </div>
                                </div>

                                <div class="timer-row">
                                    <button class="btn-play-icon" id="btn-play-p1" title="Play/Pause Vermelho">▶</button>
                                    <div class="time-display" id="p1-time-disp">00:00</div>
                                </div>

                                <div class="balls-wrapper"><button class="btn-ball-ctrl btn-ball-minus" data-side="p1">-</button><div class="balls-container" id="p1-balls"></div><button class="btn-ball-ctrl btn-ball-plus" data-side="p1">+</button></div>
                                <button class="btn-viol" data-side="p1">⚠️ Adicionar Violação</button>
                                <div class="viol-list-main" id="main-p1-viol-list"></div>
                            </div>
                        </div>
                    </div>

                    <div class="center-overlay">
                        <div class="box-stopped" id="center-stopped"><button class="btn-center btn-center-highlight" id="btn-open-tempos">⏳ TEMPOS</button><button class="btn-center" id="btn-undo" disabled>↩ VOLTAR AÇÃO</button></div>
                        
                        <div class="global-timer-box" id="center-global-timer" style="display:none;">
                            <div class="gt-label" id="global-timer-label">AQUECIMENTO</div>
                            <div class="gt-time" id="global-timer-disp">02:00</div>
                            <div style="display:flex; gap:10px; width:100%; margin-bottom:10px;">
                                <button class="btn-gt-ctrl" id="btn-pause-resume-global">⏸ PAUSAR</button>
                            </div>
                            <button class="btn-gt-close" id="btn-stop-global">FECHAR</button>
                        </div>
                    </div>

                    <div class="panel panel-blue" id="tv-p2-side-container">
                        <div class="p-head">
                            <div id="p2-logo-container"></div>
                            <div id="p2-name-display">--</div>
                            <div class="p-club-name" id="p2-club-display">--</div>
                        </div>
                        <div class="p-body">
                            
                            <div class="interactive-area" id="p2-interactive">
                                <div class="score-area">
                                    <div class="score-label">PONTOS</div>
                                    <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                                        <div id="p2-1p-container" class="penalty-ball-container" style="right: auto; left: -80px;"></div>
                                        <div class="score-val" id="p2-end-score">0</div>
                                        <div id="p2-tb-score" style="position:absolute; left: -50px; font-size:30px; color:#fbbf24; font-weight:bold; display:none;"></div>
                                    </div>
                                </div>

                                <div class="timer-row">
                                    <div class="time-display" id="p2-time-disp">00:00</div>
                                    <button class="btn-play-icon" id="btn-play-p2" title="Play/Pause Azul">▶</button>
                                </div>

                                <div class="balls-wrapper"><button class="btn-ball-ctrl btn-ball-minus" data-side="p2">-</button><div class="balls-container" id="p2-balls"></div><button class="btn-ball-ctrl btn-ball-plus" data-side="p2">+</button></div>
                                <button class="btn-viol" data-side="p2">⚠️ Adicionar Violação</button>
                                <div class="viol-list-main" id="main-p2-viol-list"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="footer-controls">
                    <button class="big-btn btn-next" id="btn-next-end">✅ Encerrar Parcial e Mudar End</button>
                    <button class="big-btn btn-finish" id="btn-finish-match">🏁 Finalizar Jogo e Salvar</button>
                </div>
            </div>
        `;

        bindEvents();
        updateCounters();
    }

    function bindEvents() {
        const mBg = document.getElementById('modal-bg');

        const btnStart = document.getElementById('btn-start-game');
        if (btnStart) {
            btnStart.onclick = async () => {
                if (!state.hasControlPermission) return alert("Você não tem permissão para iniciar a partida.");
                if(!audioCtx) playBeep(); 
                btnStart.innerText = "INICIANDO...";
                btnStart.disabled = true;
                try {
                    await API._updateMatchInFirebase(matchId, { status: 'ONGOING' });
                    window.location.reload(true); 
                } catch (e) {
                    alert("Erro ao iniciar a partida: " + e.message);
                    btnStart.innerText = "▶ INICIAR PARTIDA";
                    btnStart.disabled = false;
                }
            };
        }

        const btnLogout = document.getElementById('btn-menu-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                if(confirm("Deseja encerrar seu turno e bloquear o tablet?")) {
                    localStorage.removeItem('wb_oper_session');
                    window.location.hash = '#/';
                    setTimeout(() => window.location.reload(), 100);
                }
            });
        }

        document.getElementById('btn-sync-tv').onclick = () => { syncTV(); };

        document.getElementById('btn-menu').onclick = () => document.getElementById('sidebar').classList.add('open');
        document.getElementById('btn-menu-close').onclick = () => document.getElementById('sidebar').classList.remove('open');
        
        document.getElementById('btn-menu-back').onclick = () => {
            window.location.hash = `#/competitions/scoreboard?id=${compId}`;
        };

        document.getElementById('btn-menu-report').onclick = () => {
            document.getElementById('sidebar').classList.remove('open');
            const reportHtml = generateReportHTML();
            document.getElementById('report-content').innerHTML = reportHtml;
            document.getElementById('btn-close-report').innerText = "Fechar Súmula";
            document.getElementById('btn-confirm-send-report').style.display = "none";
            mBg.style.display = 'block'; 
            document.getElementById('modal-report').style.display = 'flex';
            state.showReport = true;
            syncTV();
        };
        
        document.getElementById('btn-close-report').onclick = () => {
            mBg.style.display = 'none'; 
            document.getElementById('modal-report').style.display = 'none';
            state.showReport = false;
            syncTV(); 
        };
        
        document.getElementById('btn-menu-restart-end').onclick = () => {
            if (!state.hasControlPermission) return;
            if(!confirm("Tem certeza que deseja zerar os pontos e bolas deste parcial?")) return;
            saveStateForUndo();
            state.p1.ballsCount = 0; state.p2.ballsCount = 0;
            state.p1.balls.fill(false); state.p2.balls.fill(false);
            state.p1.seconds = state.initialTime; state.p2.seconds = state.initialTime;
            state.ballHistory = []; 
            document.getElementById('sidebar').classList.remove('open');
            updateCounters();
        };

        const btnRestartMatch = document.getElementById('btn-menu-restart-match');
        if (btnRestartMatch) {
            btnRestartMatch.onclick = () => {
                if (!state.hasControlPermission) return;
                if(!confirm("ATENÇÃO: Isto apagará todo o placar e histórico do jogo. Continuar?")) return;
                state.p1.totalScore = 0; state.p2.totalScore = 0;
                state.p1.tbScore = 0; state.p2.tbScore = 0;
                state.p1.endScore = 0; state.p2.endScore = 0;
                state.partials = []; state.currentEnd = 1;
                state.p1.ballsCount = 0; state.p2.ballsCount = 0;
                state.p1.balls.fill(false); state.p2.balls.fill(false);
                state.p1.violations = []; state.p2.violations = [];
                state.p1.penalties = []; state.p2.penalties = [];
                state.ballHistory = []; 
                recalcCards('p1'); recalcCards('p2');
                state.p1.seconds = state.initialTime; state.p2.seconds = state.initialTime;
                actionHistory = []; document.getElementById('btn-undo').disabled = true;
                document.getElementById('sidebar').classList.remove('open');
                updateCounters();
            };
        }

        document.getElementById('btn-menu-swap').onclick = () => {
            if (!state.hasControlPermission) return alert("Você não tem permissão.");
            if(!confirm("Deseja trocar os atletas de lado?")) return;
            saveStateForUndo();
            const temp = JSON.parse(JSON.stringify(state.p1));
            state.p1 = JSON.parse(JSON.stringify(state.p2));
            state.p2 = temp;
            state.ballHistory = state.ballHistory.map(side => side === 'p1' ? 'p2' : 'p1');
            document.getElementById('sidebar').classList.remove('open');
            updateCounters();
        };

        document.getElementById('btn-menu-status').onclick = () => alert(`Conexão com a TV está ATIVA via canal: bocha_live_scoreboard`);

        document.getElementById('btn-play-p1').onclick = () => toggleTimer('p1');
        document.getElementById('btn-play-p2').onclick = () => toggleTimer('p2');

        document.getElementById('p1-time-disp').onclick = () => { if (!state.hasControlPermission) return; if(state.activeTimer !== null) return; const t = prompt("Novo tempo Vermelho (Ex: 04:30):", formatTime(state.p1.seconds)); if (t) { saveStateForUndo(); state.p1.seconds = parseTimeString(t); updateCounters(); } };
        document.getElementById('p2-time-disp').onclick = () => { if (!state.hasControlPermission) return; if(state.activeTimer !== null) return; const t = prompt("Novo tempo Azul (Ex: 04:30):", formatTime(state.p2.seconds)); if (t) { saveStateForUndo(); state.p2.seconds = parseTimeString(t); updateCounters(); } };

        document.getElementById('btn-undo').onclick = () => { if (!state.hasControlPermission) return; undoAction(); };

        document.getElementById('btn-open-tempos').onclick = () => { if (!state.hasControlPermission) return; mBg.style.display = 'block'; document.getElementById('modal-tempos').style.display = 'flex'; };
        document.getElementById('btn-close-tempos').onclick = () => { mBg.style.display = 'none'; document.getElementById('modal-tempos').style.display = 'none'; };
        
        document.querySelectorAll('.btn-tm-sel').forEach(b => {
            b.onclick = () => {
                mBg.style.display = 'none'; document.getElementById('modal-tempos').style.display = 'none';
                startGlobalTimer(parseInt(b.dataset.sec), b.dataset.label);
            };
        });

        document.getElementById('btn-pause-resume-global').onclick = () => {
            if (!state.hasControlPermission) return;
            state.globalTimer.paused = !state.globalTimer.paused;
            const btn = document.getElementById('btn-pause-resume-global');
            if (state.globalTimer.paused) {
                btn.innerText = "▶ RETOMAR";
                btn.style.background = "#22c55e";
                btn.style.color = "#fff";
            } else {
                btn.innerText = "⏸ PAUSAR";
                btn.style.background = "#fbbf24";
                btn.style.color = "#000";
            }
            updateCounters(); 
        };

        document.getElementById('btn-stop-global').onclick = stopGlobalTimer;

        document.querySelectorAll('.btn-ball-plus').forEach(b => {
            b.onclick = () => { 
                if (!state.hasControlPermission) return;
                saveStateForUndo(); 
                const s = b.dataset.side; 
                if(state[s].ballsCount < 6) { state[s].ballsCount++; state.ballHistory.push(s); }
                updateCounters(); 
            };
        });

        document.querySelectorAll('.btn-ball-minus').forEach(b => {
            b.onclick = () => { 
                if (!state.hasControlPermission) return;
                saveStateForUndo(); 
                const s = b.dataset.side; 
                if(state[s].ballsCount > 0) { 
                    state[s].ballsCount--; state[s].balls[state[s].ballsCount] = false; 
                    for (let i = state.ballHistory.length - 1; i >= 0; i--) {
                        if (state.ballHistory[i] === s) { state.ballHistory.splice(i, 1); break; }
                    }
                } 
                updateCounters(); 
            };
        });

        let activeViolSide = null;
        
        document.querySelectorAll('.btn-viol').forEach(b => {
            b.onclick = () => {
                if (!state.hasControlPermission) return;
                activeViolSide = b.dataset.side;
                document.getElementById('viol-title').innerText = `Violação - ${activeViolSide === 'p1' ? 'Vermelho' : 'Azul'}`;
                mBg.style.display = 'block'; document.getElementById('modal-violation').style.display = 'flex';
                renderViolationsModal(); 
            };
        });
        
        document.getElementById('btn-close-viol').onclick = () => { mBg.style.display = 'none'; document.getElementById('modal-violation').style.display = 'none'; };
        
        document.getElementById('btn-save-viol').onclick = () => {
            if (!state.hasControlPermission) return;
            saveStateForUndo();
            const val = document.getElementById('sel-viol').value;
            if(!val) return alert("Selecione uma violação.");
            const [code, text, penalty] = val.split('|');
            state[activeViolSide].violations.push(`P${state.currentEnd} - ${code} - ${text} - ${penalty} | ${new Date().toLocaleTimeString().slice(0,5)}`);
            recalcCards(activeViolSide);
            if (penalty.includes('1 Bola')) { const opp = activeViolSide === 'p1' ? 'p2' : 'p1'; state[opp].penalties.push(false); }

            if (state[activeViolSide].yellowCards >= 2) {
                alert("🚨 ATENÇÃO 🚨\n\nEste é o SEGUNDO CARTÃO AMARELO do atleta!\nDe acordo com as regras, o atleta sofre FORFEIT e perde o jogo imediatamente.");
            } else if (penalty.includes('Vermelho') || penalty.includes('Forfeit') || penalty.includes('WO') || penalty.includes('Banimento')) {
                alert("🚨 ATENÇÃO 🚨\n\nFalta eliminatória aplicada!\nO atleta sofre FORFEIT e perde o jogo imediatamente.");
            }

            document.getElementById('sel-viol').value = '';
            renderViolationsModal();
            updateCounters();
        };

        document.addEventListener('click', e => {
            if (e.target.classList.contains('edit-score')) {
                if (!state.hasControlPermission) return;
                const idx = parseInt(e.target.dataset.idx);
                const side = e.target.dataset.side;
                if (!state.partials[idx]) { alert('Este parcial ainda não foi fechado/iniciado.'); return; }

                const currentVal = side === 'p1' ? state.partials[idx].s1 : state.partials[idx].s2;
                const newVal = prompt(`Editar pontos do Parcial ${idx + 1} (${side === 'p1' ? 'Vermelho' : 'Azul'}):`, currentVal);
                
                if (newVal !== null && !isNaN(parseInt(newVal))) {
                    saveStateForUndo();
                    state.partials[idx][side === 'p1' ? 's1' : 's2'] = parseInt(newVal);
                    state.p1.totalScore = 0; state.p1.tbScore = 0; state.p2.totalScore = 0; state.p2.tbScore = 0;
                    
                    state.partials.forEach((p, i) => {
                        if (i < state.maxEnds) {
                            state.p1.totalScore += (parseInt(p.s1) || 0); state.p2.totalScore += (parseInt(p.s2) || 0);
                        } else {
                            state.p1.tbScore += (parseInt(p.s1) || 0); state.p2.tbScore += (parseInt(p.s2) || 0);
                        }
                    });
                    
                    state.p1.endScore = state.p1.totalScore; state.p2.endScore = state.p2.totalScore;
                    document.getElementById('report-content').innerHTML = generateReportHTML();
                    updateCounters();
                    if(state.showReport) { channel.postMessage({ type: 'SYNC', payload: { showReport: true, reportHTML: generateReportHTML() } }); }
                }
            }

            if (e.target.classList.contains('main-del-viol')) {
                if (!state.hasControlPermission) return;
                saveStateForUndo();
                const s = e.target.dataset.side; const idx = e.target.dataset.idx;
                state[s].violations.splice(idx, 1); recalcCards(s); updateCounters();
            }

            if (e.target.classList.contains('btn-1p')) {
                if (!state.hasControlPermission) return;
                saveStateForUndo();
                const s = e.target.dataset.side; const idx = parseInt(e.target.dataset.idx);
                state[s].penalties[idx] = !state[s].penalties[idx];
                if (state[s].penalties[idx]) state[s].seconds = 60; 
                updateCounters();
            }
            if (e.target.classList.contains('boccia-ball')) {
                if (!state.hasControlPermission) return;
                saveStateForUndo();
                const s = e.target.dataset.side; const idx = parseInt(e.target.dataset.idx);
                if (state[s].balls[idx]) {
                    for (let i = state.ballHistory.length - 1; i >= 0; i--) {
                        if (state.ballHistory[i] === s) { state.ballHistory.splice(i, 1); break; }
                    }
                } else { state.ballHistory.push(s); }
                state[s].balls[idx] = !state[s].balls[idx];
                updateCounters();
            }
        });

        document.getElementById('btn-next-end').onclick = () => {
            if (!state.hasControlPermission) return alert("Você não tem permissão.");
            if (state.activeTimer !== null || state.globalTimer.active) return alert("Pare o tempo antes de encerrar o parcial.");
            
            const unplayedP1 = state.p1.penalties.some(p => p === false);
            const unplayedP2 = state.p2.penalties.some(p => p === false);
            if (unplayedP1 || unplayedP2) { alert("Atenção: Não é possível encerrar o parcial! Existem bolas de penalização que não foram cobradas."); return; }
            
            tempScoreP1 = 0; tempScoreP2 = 0;
            const p1Opts = Array.from({length: state.p1.ballsCount + 1}, (_, i) => i);
            const p2Opts = Array.from({length: state.p2.ballsCount + 1}, (_, i) => i);
            
            document.getElementById('p1-score-options').innerHTML = p1Opts.map(v => `<button class="btn-score-opt" data-side="p1" data-val="${v}">${v}</button>`).join('');
            document.getElementById('p2-score-options').innerHTML = p2Opts.map(v => `<button class="btn-score-opt" data-side="p2" data-val="${v}">${v}</button>`).join('');
            
            document.querySelectorAll('.btn-score-opt').forEach(b => {
                b.onclick = () => {
                    const side = b.dataset.side; const val = parseInt(b.dataset.val);
                    if(side === 'p1') { tempScoreP1 = val; } else { tempScoreP2 = val; }
                    updateScoreModalUI();
                };
            });
            
            updateScoreModalUI();
            mBg.style.display = 'block'; 
            document.getElementById('modal-end-score').style.display = 'flex';
        };

        document.getElementById('btn-cancel-score').onclick = () => { mBg.style.display = 'none'; document.getElementById('modal-end-score').style.display = 'none'; };

        document.getElementById('btn-confirm-score').onclick = () => {
            if (!state.hasControlPermission) return;
            saveStateForUndo();
            state.partials.push({ s1: tempScoreP1, s2: tempScoreP2, t1: formatTime(state.p1.seconds), t2: formatTime(state.p2.seconds), b1: 6 - state.p1.ballsCount, b2: 6 - state.p2.ballsCount });
            
            if (state.currentEnd <= state.maxEnds) { state.p1.totalScore += tempScoreP1; state.p2.totalScore += tempScoreP2; } 
            else { state.p1.tbScore += tempScoreP1; state.p2.tbScore += tempScoreP2; }
            
            state.p1.endScore = state.p1.totalScore; state.p2.endScore = state.p2.totalScore;
            state.p1.seconds = state.initialTime; state.p2.seconds = state.initialTime;
            state.p1.penalties = []; state.p2.penalties = [];
            state.p1.ballsCount = 0; state.p2.ballsCount = 0;
            state.p1.balls.fill(false); state.p2.balls.fill(false);
            state.ballHistory = []; actionHistory = []; document.getElementById('btn-undo').disabled = true;
            state.currentEnd++;
            
            const isTie = state.p1.totalScore === state.p2.totalScore;
            const tbTie = state.p1.tbScore === state.p2.tbScore;
            const isGameOver = state.currentEnd > state.maxEnds && (!isTie || !tbTie);
            const isTieBreak = state.currentEnd > state.maxEnds && isTie;
            
            updateCounters();
            mBg.style.display = 'none'; document.getElementById('modal-end-score').style.display = 'none';

            if (!isGameOver && !isTieBreak) { startGlobalTimer(60, 'Entre Parciais'); }
        };

        document.getElementById('btn-finish-match').onclick = () => {
            if (!state.hasControlPermission) return alert("Você não tem permissão para encerrar o jogo.");
            if (state.activeTimer !== null) toggleTimer('stop');
            if (state.globalTimer.active) stopGlobalTimer();

            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('report-content').innerHTML = generateReportHTML();
            document.getElementById('btn-close-report').innerText = "Voltar e Corrigir";
            document.getElementById('btn-confirm-send-report').style.display = "block";
            mBg.style.display = 'block'; document.getElementById('modal-report').style.display = 'flex';
            
            state.showReport = true; syncTV();
        };

        document.getElementById('btn-confirm-send-report').onclick = async () => {
            if (!state.hasControlPermission) return;
            if (!confirm("Atenção: Após enviar, o jogo será encerrado. Confirmar Súmula?")) return;

            const btnSend = document.getElementById('btn-confirm-send-report');
            btnSend.disabled = true; btnSend.innerText = "Salvando...";

            let p1P = [null,null,null,null,null,null], p2P = [null,null,null,null,null,null];
            let p1T = [null,null,null,null,null,null], p2T = [null,null,null,null,null,null];

            for (let i = 0; i < state.partials.length; i++) {
                if (i < 6) { p1P[i] = state.partials[i].s1; p2P[i] = state.partials[i].s2; p1T[i] = state.partials[i].t1; p2T[i] = state.partials[i].t2; }
            }
            for (let i = 0; i < state.maxEnds; i++) {
                if (p1P[i] === null) { p1P[i] = 0; p2P[i] = 0; p1T[i] = "00:00"; p2T[i] = "00:00"; }
            }

            let wId = null;
            if (state.p1.totalScore > state.p2.totalScore) wId = state.p1.id;
            else if (state.p2.totalScore > state.p1.totalScore) wId = state.p2.id;
            else if (state.p1.tbScore > state.p2.tbScore) wId = state.p1.id;
            else if (state.p2.tbScore > state.p1.tbScore) wId = state.p2.id;

            let finalP1Score, finalP2Score, finalP1P, finalP2P, finalP1T, finalP2T, finalV1, finalV2;
            if (state.p1.id === state.match.entrant1_id || state.p1.id === state.match.entrant_a_id) {
                finalP1Score = state.p1.totalScore; finalP2Score = state.p2.totalScore;
                finalP1P = p1P; finalP2P = p2P; finalP1T = p1T; finalP2T = p2T;
                finalV1 = state.p1.violations; finalV2 = state.p2.violations;
            } else {
                finalP1Score = state.p2.totalScore; finalP2Score = state.p1.totalScore;
                finalP1P = p2P; finalP2P = p1P; finalP1T = p2T; finalP2T = p1T;
                finalV1 = state.p2.violations; finalV2 = state.p1.violations;
            }

            const details = { p1_partials: finalP1P, p2_partials: finalP2P, p1_times: finalP1T, p2_times: finalP2T, is_wo: false, p1_violations: finalV1, p2_violations: finalV2 };

            try {
                await API._updateMatchInFirebase(matchId, {
                    score1: finalP1Score, score2: finalP2Score, score_a: finalP1Score, score_b: finalP2Score,
                    winner_entrant_id: wId, winner_id: wId, status: 'COMPLETED', details: details, match_details: details, referee_id: state.match.referee_id || null 
                });
                
                state.showReport = false; syncTV();

                const allMatchesRes = await API.getMatches();
                const allMatches = allMatchesRes.success ? allMatchesRes.data : [];
                const nextMatch = allMatches.filter(m => String(m.court) === String(state.match.court || '-') && m.status !== 'COMPLETED' && m.status !== 'FINISHED' && m.status !== 'CANCELED' && String(m.id) !== String(matchId))
                    .sort((a, b) => { return Number(a.start_time ? a.start_time.replace(':','') : '9999') - Number(b.start_time ? b.start_time.replace(':','') : '9999') || a.id - b.id; })[0];

                if (nextMatch) {
                    alert(`Jogo finalizado! Carregando o próximo jogo da Quadra...`);
                    window.location.hash = `#/live/scoresheet?match_id=${nextMatch.id}&comp_id=${compId}`;
                    setTimeout(() => window.location.reload(true), 500); 
                } else {
                    alert("Jogo finalizado! Não há mais jogos agendados para esta quadra.");
                    window.location.hash = `#/competitions/scoreboard?id=${compId}`;
                }
            } catch (e) { alert("Erro: " + e.message); btnSend.disabled = false; btnSend.innerText = "Confirmar e Enviar para a Nuvem"; }
        };
    }

    loadData();
}

export const renderLiveScoreSheet = renderLiveScoresheet;