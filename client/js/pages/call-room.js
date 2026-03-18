// client/js/pages/call-room.js
import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const VIOLATIONS_DICT = [
  { group: 'Retração (Art. 16.5)', penalty: 'Retração', rules: [ { code: '16.5.1', text: 'Lançamento antes da autorização' }, { code: '16.5.2', text: 'Atleta BC3 não libera a bola' }, { code: '16.5.3', text: 'Assistente toca no atleta/ponteira' }, { code: '16.5.4', text: 'Atleta e assist. soltam simultâneos' }, { code: '16.5.5', text: 'Colorida jogada antes do Jack' }, { code: '16.5.6', text: 'Primeira colorida dif. do Jack' }, { code: '16.5.7', text: 'Falta de swing do BC3 antes do Jack' }, { code: '16.5.8', text: 'Falta de swing após reorientação' }, { code: '16.5.9', text: 'Lado joga 2+ bolas ao mesmo tempo' } ]},
  { group: '1 Bola de Penalidade (Art. 16.6)', penalty: '1 Bola de Penalidade', rules: [ { code: '16.6.1', text: 'Atleta entra na área sem ser a vez' }, { code: '16.6.2', text: 'Calheiro olha para a área antes' }, { code: '16.6.3', text: 'Prep. jogada no tempo do adv.' }, { code: '16.6.4', text: 'Assist. move equip. sem pedido' }, { code: '16.6.5', text: 'Não sai do caminho após aviso' }, { code: '16.6.6', text: 'Tocar acidentalmente em bola' }, { code: '16.6.7', text: 'Atraso injustificado' }, { code: '16.6.8', text: 'Não aceitar decisão do árbitro' }, { code: '16.6.9', text: 'Assist./técnico entra sem permissão' }, { code: '16.6.10', text: 'Comportamento não cooperativo' } ]},
  { group: 'Retração + 1 Bola (Art. 16.7)', penalty: 'Retração + 1 Bola', rules: [ { code: '16.7.1', text: 'Lançar tocando a linha' }, { code: '16.7.2', text: 'Lançar com calha na linha' }, { code: '16.7.3', text: 'Lançar sem contato com assento' }, { code: '16.7.4', text: 'Lançar bola tocando fora' }, { code: '16.7.5', text: 'Lançar com assist. olhando' }, { code: '16.7.6', text: 'Lançar com assento > 66 cm' }, { code: '16.7.7', text: 'Lançar com parceiro retornando' }, { code: '16.7.8', text: 'Preparar e lançar no tempo do adv.' } ]},
  { group: '1 Bola + Amarelo (Art. 16.8)', penalty: 'Cartão Amarelo', rules: [ { code: '16.8.1', text: 'Interferência na concentração' }, { code: '16.8.2', text: 'Comunicação inapropriada' } ]},
  { group: 'Amarelo Direto (Art. 16.9)', penalty: 'Cartão Amarelo', rules: [ { code: '16.9.1', text: 'Entrada irregular no Call Room' }, { code: '16.9.2', text: 'Levar mais bolas que o permitido' }, { code: '16.9.3', text: 'Bola reprovada no teste' }, { code: '16.9.4', text: 'Sair da quadra sem permissão' }, { code: '16.9.5', text: 'Equipamento irregular' } ]},
  { group: 'Segundo Amarelo (Art. 16.10)', penalty: 'WO / Banimento', rules: [ { code: '16.10.1', text: 'Segunda advertência' }, { code: '16.10.2', text: 'Segundo amarelo Call Room (WO)' }, { code: '16.10.3', text: 'Segundo amarelo Quadra (Ban)' } ]},
  { group: 'Vermelho (Art. 16.11)', penalty: 'Cartão Vermelho', rules: [ { code: '16.11.1', text: 'Conduta antidesportiva grave' }, { code: '16.11.2', text: 'Conduta violenta' }, { code: '16.11.3', text: 'Linguagem ofensiva/abusiva' }, { code: '16.11.4', text: 'Desqualificação imediata' } ]},
  { group: 'Forfeit (Art. 16.12)', penalty: 'Forfeit', rules: [ { code: '16.12.1', text: 'Quebrar equipamento do adv.' }, { code: '16.12.2', text: 'Falha teste de bolas pós jogo' }, { code: '16.12.3', text: 'Sair da área sem permissão' } ]}
];

function escapeHTML(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function safeParse(data) { if (!data) return {}; if (typeof data === 'object') return data; try { let p = JSON.parse(data); return typeof p === 'object' && p !== null ? p : {}; } catch(e) { return {}; } }
function extractName(r, pfx) { const keys = [`${pfx}_name`, `${pfx}_nome`, 'nome', 'name']; if (pfx === 'p1') keys.push('entrant1_name', 'entrant_a_name'); if (pfx === 'p2') keys.push('entrant2_name', 'entrant_b_name'); for (let k of keys) { if (r[k] && String(r[k]).trim() !== '') return r[k]; } return 'A Definir'; }
function extractBib(r, pfx) { const keys = [`${pfx}_bib`, 'bib', 'numero']; if (pfx === 'p1') keys.push('entrant1_bib', 'entrant_a_bib'); if (pfx === 'p2') keys.push('entrant2_bib', 'entrant_b_bib'); for (let k of keys) { if (r[k] && String(r[k]).trim() !== '') return r[k]; } return '--'; }

function subtractMinutes(timeStr, minsToSubtract) {
    if (!timeStr || !timeStr.includes(':')) return '--:--';
    let [h, m] = timeStr.split(':').map(Number);
    let totalMins = (h * 60) + m - minsToSubtract;
    if (totalMins < 0) totalMins += 24 * 60; 
    let outH = Math.floor(totalMins / 60).toString().padStart(2, '0');
    let outM = (totalMins % 60).toString().padStart(2, '0');
    return `${outH}:${outM}`;
}

export async function renderCallRoom(root, hashData) {
    let competitionId = null;
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/) || hash.match(/\/competitions\/([a-zA-Z0-9_-]+)/);
    if (idMatch) competitionId = idMatch[1];
    else if (hashData && (hashData.id || hashData.competitionId)) competitionId = hashData.id || hashData.competitionId;

    if (!competitionId) { root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro: ID da competição ausente.</div>`; return; }

    let operSession = null;
    try {
        const raw = localStorage.getItem('wb_oper_session');
        if (raw) operSession = JSON.parse(raw);
    } catch(e) {}

    const auth = getAuth();
    
    // 🔥 MEMÓRIA LOCAL DA PRESENÇA NA CÂMARA DE CHAMADA
    const PRESENCE_KEY = `cr_presence_${competitionId}`;
    let presenceMap = {};
    try {
        const rawP = localStorage.getItem(PRESENCE_KEY);
        if (rawP) presenceMap = JSON.parse(rawP);
    } catch(e) {}
    
    const state = {
        competition: {},
        allMatches: [],
        matches: [],
        rounds: [], 
        selectedRound: null,
        penalties: {},
        currentMatchModal: null,
        modalState: { isSwapped: false, p1Violations: [], p2Violations: [], isWO: false, winnerId: null },
        clockInterval: null,
        isAdmin: false,
        hasControlPermission: operSession && String(operSession.compId) === String(competitionId)
    };

    async function atualizarPartidaNoBanco(collectionName, docId, matchId, updateFn) {
        const docRef = doc(db, collectionName, docId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) throw new Error("Documento não encontrado");
        const data = snap.data();
        let updated = false;

        if (collectionName === 'matches_group') {
            const pools = data.matches || data.data || [];
            pools.forEach(pool => {
                Object.values(pool.rounds || {}).forEach(roundMatches => {
                    const m = roundMatches.find(x => x.id === matchId);
                    if (m) { updateFn(m); updated = true; }
                });
            });
            if (updated) await updateDoc(docRef, { matches: data.matches || data.data });
        } else if (collectionName === 'matches_ko') {
            const kos = data.matches || data.data || [];
            const m = kos.find(x => x.id === matchId);
            if (m) { updateFn(m); updated = true; }
            if (updated) await updateDoc(docRef, { matches: data.matches || data.data });
        }
        return updated;
    }

    function calculatePenalties() {
        const pen = {};
        state.allMatches.forEach(m => {
            const details = safeParse(m.details || m.match_details);
            const p1Id = m.entrant1_id || m.entrant_a_id;
            const p2Id = m.entrant2_id || m.entrant_b_id;

            const p1V = details.p1_violations || [];
            const p2V = details.p2_violations || [];

            if (p1Id) {
                if (!pen[p1Id]) pen[p1Id] = { yellow: 0, red: 0 };
                pen[p1Id].yellow += p1V.filter(v => v.includes('Amarelo') || v.includes('16.8') || v.includes('16.9')).length;
                pen[p1Id].red += p1V.filter(v => v.includes('Vermelho') || v.includes('WO') || v.includes('Forfeit') || v.includes('Desqualificação') || v.includes('16.10') || v.includes('16.11') || v.includes('16.12')).length;
            }
            if (p2Id) {
                if (!pen[p2Id]) pen[p2Id] = { yellow: 0, red: 0 };
                pen[p2Id].yellow += p2V.filter(v => v.includes('Amarelo') || v.includes('16.8') || v.includes('16.9')).length;
                pen[p2Id].red += p2V.filter(v => v.includes('Vermelho') || v.includes('WO') || v.includes('Forfeit') || v.includes('Desqualificação') || v.includes('16.10') || v.includes('16.11') || v.includes('16.12')).length;
            }
        });
        state.penalties = pen;
    }

    async function loadData() {
        root.innerHTML = `<div style="padding:40px; text-align:center; color:#64748b;">A carregar Câmara de Chamada...</div>`;
        
        onAuthStateChanged(auth, async (user) => {
            try {
                // 🔥 REDE DE CAPTURA MÁXIMA E SOLTA (Libera para qualquer oficial da competição)
                if (user) {
                    const uid = user.uid;
                    let uEmail = user.email ? String(user.email).toLowerCase().trim() : '';
                    let uName = "";
                    let isGlobalAdmin = false;

                    try {
                        const uDoc = await getDoc(doc(db, "users", uid));
                        if (uDoc.exists()) {
                            const uData = uDoc.data();
                            uName = String(uData.nome || uData.name || '').toLowerCase().trim();
                            if (!uEmail && uData.email) uEmail = String(uData.email).toLowerCase().trim();
                            const r = String(uData.global_role || uData.role || '').toUpperCase();
                            if (r.includes('ADMIN')) isGlobalAdmin = true;
                        }
                    } catch(e) {}

                    const qOff = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
                    const snapOff = await getDocs(qOff);
                    let offList = [];
                    if (!snapOff.empty) offList = snapOff.docs[0].data().officials || [];

                    const cleanStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '');
                    const myCleanName = cleanStr(uName);

                    const isOfficial = offList.some(o => {
                        const oId = String(o.referee_id || o.uid || o.official_id || o.id || '');
                        const oEmail = String(o.email || '').toLowerCase().trim();
                        const oName = cleanStr(o.nome || o.nome_completo || o.nome_abreviado);
                        
                        if (uid && oId === String(uid)) return true;
                        if (uEmail && oEmail && oEmail === uEmail) return true;
                        if (myCleanName && oName && (oName.includes(myCleanName) || myCleanName.includes(oName))) return true;
                        return false;
                    });

                    // Se for admin ou estiver escalado como árbitro na competição, libera tudo!
                    if (isGlobalAdmin || isOfficial) {
                        state.hasControlPermission = true;
                        state.isAdmin = true;
                    }
                }

                const compSnap = await getDoc(doc(db, "competitions", String(competitionId)));
                state.competition = compSnap.exists() ? { id: compSnap.id, ...compSnap.data() } : {};

                let allMatches = [];
                const qGroup = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
                const snapGroup = await getDocs(qGroup);
                snapGroup.forEach(d => {
                    const data = d.data();
                    const pools = data.matches || data.data || [];
                    pools.forEach(pool => {
                        Object.values(pool.rounds || {}).forEach(rMatches => { rMatches.forEach(m => { allMatches.push({ ...m, db_collection: "matches_group", doc_id: d.id }); }); });
                    });
                });

                const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
                const snapKo = await getDocs(qKo);
                snapKo.forEach(d => {
                    const data = d.data();
                    const kos = data.matches || data.data || [];
                    kos.forEach(m => { allMatches.push({ ...m, db_collection: "matches_ko", doc_id: d.id }); });
                });

                state.allMatches = allMatches;
                calculatePenalties();

                state.matches = allMatches.filter(m => m.court && m.match_date && m.start_time);
                const roundSet = new Set();
                state.matches.forEach(m => roundSet.add(`${m.match_date} ${m.start_time}`));
                state.rounds = Array.from(roundSet).sort();
                if (state.rounds.length > 0 && !state.selectedRound) state.selectedRound = state.rounds[0]; 

                render();
            } catch (e) { root.innerHTML = `<div style="padding:20px; color:red;">Erro: ${e.message}</div>`; }
        });
    }

    function render() {
        const violOptionsHtml = VIOLATIONS_DICT.map(group => `<optgroup label="${group.group}">${group.rules.map(r => `<option value="${r.code}|${r.text}|${group.penalty}">${r.code} - ${r.text}</option>`).join('')}</optgroup>`).join('');

        const styles = `
            <style>
                .cr-container { max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
                .cr-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }
                
                .cr-bar { display: flex; flex-wrap: wrap; justify-content: space-between; background: #f8fafc; border: 1px solid #cbd5e1; padding: 15px 20px; border-radius: 8px; align-items: center; gap: 15px; margin-bottom: 20px; }
                .cr-selector-box { display: flex; align-items: center; gap: 10px; }
                .cr-select { padding: 10px; border-radius: 6px; border: 1px solid #94a3b8; font-size: 16px; font-weight: bold; background: #fff; min-width: 250px; cursor: pointer; }
                
                .cr-timing-box { display: flex; gap: 15px; background: white; padding: 8px 15px; border-radius: 6px; border: 1px solid #e2e8f0; align-items: center; }
                .cr-time-item { font-size: 13px; color: #475569; display: flex; align-items: center; gap: 5px; }
                .cr-time-val { font-weight: 900; font-size: 15px; color: #0f172a; }
                .cr-time-val.open { color: #16a34a; }
                .cr-time-val.close { color: #dc2626; }
                
                .cr-realtime { font-family: monospace; font-size: 20px; font-weight: bold; color: #0f172a; background: #e2e8f0; padding: 4px 10px; border-radius: 4px; letter-spacing: 1px; }

                .cr-table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
                .cr-row { background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-radius: 8px; transition: transform 0.1s; border: 2px solid transparent; }
                .cr-row:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                
                .cr-row.completed-row { opacity: 0.6; filter: grayscale(0.5); }
                .cr-row.forfeit-row { opacity: 0.8; border-color: #ef4444; background: #fef2f2; filter: none; }
                
                .cr-cell { padding: 15px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
                .cr-row td:first-child { border-left: 1px solid #e2e8f0; border-radius: 8px 0 0 8px; }
                .cr-row td:last-child { border-right: 1px solid #e2e8f0; border-radius: 0 8px 8px 0; }
                
                .cr-court { font-size: 18px; font-weight: 900; color: #0f172a; text-align: center; width: 80px; background: #f1f5f9; border-right: 1px solid #e2e8f0 !important; transition: all 0.3s; }
                .cr-court.ready { background: #22c55e !important; color: white !important; border-color: #16a34a !important; }
                
                .cr-player-box { display: flex; align-items: center; gap: 12px; }
                .check-icon { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #cbd5e1; display: flex; align-items: center; justify-content: center; cursor: pointer; background: #fff; transition: all 0.2s; flex-shrink: 0; }
                .check-icon svg { width: 20px; height: 20px; color: transparent; transition: color 0.2s; }
                
                .check-icon.present { border-color: #22c55e; background: #dcfce7; }
                .check-icon.present svg { color: #16a34a; }
                
                /* AUSÊNCIA (W.O.) */
                .check-icon.absent { border-color: #ef4444; background: #fef2f2; cursor: default; }
                .check-icon.absent svg { color: #dc2626; }

                .cr-player-info { display: flex; flex-direction: column; align-items: flex-start; }
                .cr-p-name-line { display: flex; align-items: center; gap: 8px; }
                .cr-p-bib { background: #1e293b; color: #fff; font-size: 11px; font-weight: 900; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px; }
                .cr-p-name { font-weight: bold; font-size: 15px; color: #1e293b; }
                
                .cr-vs { font-weight: 900; color: #94a3b8; font-size: 12px; text-align: center; width: 30px; }
                
                .btn-confirma { background: #f59e0b; color: #fff; border: none; padding: 10px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; width: 100%; justify-content: center; transition: background 0.2s; }
                .btn-confirma:hover { background: #d97706; }
                .btn-confirma.locked { background: #64748b; cursor: pointer; }
                .btn-confirma.locked:hover { background: #475569; }
                
                /* NOVO: Botão Verde para Partidas Prontas/Confirmadas */
                .btn-confirma.ready { background: #16a34a; color: white; }
                .btn-confirma.ready:hover { background: #15803d; }

                .btn-tv-link { background: #3b82f6; color: white; border: none; padding: 10px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; text-decoration: none; font-size: 13px; }
                .btn-tv-link:hover { background: #2563eb; }

                /* Modals */
                .cr-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: none; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(4px); }
                .cr-modal-overlay.active { display: flex; }
                .cr-modal-content { background: #fff; width: 95%; max-width: 600px; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
                .cr-modal-header { background: #0f172a; color: #fff; padding: 16px 20px; font-size: 18px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
                .cr-modal-close { background: transparent; border: none; color: #fff; font-size: 24px; cursor: pointer; line-height: 1; }
                .cr-modal-body { padding: 20px; }
                
                .cr-swap-btn { background: #4f46e5; color: white; width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; }
                .cr-swap-btn:hover { background: #4338ca; }
                
                .cr-teams-container { display: flex; gap: 15px; }
                .cr-team-side { flex: 1; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; }
                .cr-team-header { padding: 10px; font-weight: bold; text-align: center; color: white; font-size: 15px; }
                .cr-team-header.red { background: #dc2626; }
                .cr-team-header.blue { background: #2563eb; }
                .cr-team-content { padding: 15px; background: #f8fafc; display: flex; flex-direction: column; gap: 12px; }
                
                .cr-control-group { background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
                .cr-control-title { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
                
                .cr-viol-select { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; margin-bottom: 5px; }
                .cr-add-viol-btn { background: #e2e8f0; border: none; padding: 6px; width: 100%; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; }
                .cr-add-viol-btn:hover { background: #cbd5e1; }
                .cr-viol-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
                .cr-viol-item { background: #fff; border: 1px solid #e2e8f0; padding: 4px 6px; font-size: 10px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
                .cr-viol-item.yellow { border-left: 4px solid #eab308; }
                .cr-viol-item.red { border-left: 4px solid #ef4444; }
                .cr-viol-del { background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold; }

                .cr-wo-box { display: flex; align-items: center; gap: 8px; font-weight: bold; color: #0f172a; cursor: pointer; }
                .cr-wo-box input { transform: scale(1.3); }

                .cr-save-btn { background: #10b981; color: white; width: 100%; padding: 15px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 20px; display: flex; align-items: center; justify-content: center; gap: 10px; }
                .cr-save-btn:hover { background: #059669; }
                
                /* Modal de Resumo do Admin */
                .btn-admin-edit { transition: opacity 0.2s; } .btn-admin-edit:hover { opacity: 0.8; }
                .btn-admin-reset { transition: opacity 0.2s; } .btn-admin-reset:hover { opacity: 0.8; }
                .partial-pill { margin: 0 5px; background: #e2e8f0; padding: 4px 8px; border-radius: 6px; font-weight:bold; font-size: 12px; }
                .partial-pill.tb { background: #fef08a; }
            </style>
        `;

        let optionsHtml = state.rounds.map(r => {
            const [datePart, timePart] = r.split(' ');
            const formattedDate = datePart.split('-').reverse().join('/');
            return `<option value="${r}" ${state.selectedRound === r ? 'selected' : ''}>Dia ${formattedDate} às ${timePart}</option>`;
        }).join('');

        if (state.rounds.length === 0) optionsHtml = `<option value="">Nenhum jogo agendado</option>`;

        let rowsHtml = '';
        let openTimeStr = '--:--';
        let closeTimeStr = '--:--';

        if (state.selectedRound) {
            const [selDate, selTime] = state.selectedRound.split(' ');
            
            openTimeStr = subtractMinutes(selTime, 35);
            closeTimeStr = subtractMinutes(selTime, 20);

            const matchesInRound = state.matches.filter(m => m.match_date === selDate && m.start_time === selTime);
            matchesInRound.sort((a,b) => Number(a.court) - Number(b.court));

            if(matchesInRound.length === 0) {
                rowsHtml = `<tr><td colspan="5" style="text-align:center; padding: 30px; color: #64748b;">Nenhum jogo encontrado nesta rodada.</td></tr>`;
            } else {
                matchesInRound.forEach(m => {
                    const p1Id = m.entrant1_id || m.entrant_a_id;
                    const p2Id = m.entrant2_id || m.entrant_b_id;
                    const p1Name = extractName(m, 'p1'); const p1Bib = extractBib(m, 'p1');
                    const p2Name = extractName(m, 'p2'); const p2Bib = extractBib(m, 'p2');
                    
                    const details = safeParse(m.details || m.match_details);
                    const isForfeit = details.is_wo;
                    const isCompleted = m.status === 'COMPLETED';
                    const isReady = m.call_room_ready === true;

                    const p1TotalY = state.penalties[p1Id]?.yellow || 0;
                    const p1TotalR = state.penalties[p1Id]?.red || 0;
                    const p1Badges = `<span style="margin-left:6px; font-size:12px;">${'🟨'.repeat(p1TotalY)}${'🟥'.repeat(p1TotalR)}</span>`;

                    const p2TotalY = state.penalties[p2Id]?.yellow || 0;
                    const p2TotalR = state.penalties[p2Id]?.red || 0;
                    const p2Badges = `<span style="margin-left:6px; font-size:12px;">${'🟨'.repeat(p2TotalY)}${'🟥'.repeat(p2TotalR)}</span>`;

                    const matchDataStr = escapeHTML(JSON.stringify({
                        id: m.id, doc_id: m.doc_id, db_collection: m.db_collection, court: m.court, status: m.status,
                        p1Name, p1Bib, p1Id, p2Name, p2Bib, p2Id,
                        p1V: details.p1_violations || [], p2V: details.p2_violations || [],
                        isWO: !!isForfeit, winnerId: m.winner_entrant_id || m.winner_id,
                        score1: m.score1 ?? m.score_a ?? '-', score2: m.score2 ?? m.score_b ?? '-',
                        details: details
                    }));

                    let rowClasses = "cr-row";
                    if (isCompleted) rowClasses += " completed-row";
                    if (isForfeit) rowClasses += " forfeit-row";

                    let courtClass = "cr-cell cr-court";
                    if (isReady && !isCompleted) courtClass += " ready";

                    // 🔥 MEMÓRIA VISUAL: Lê do localStorage se a bolinha foi clicada
                    let p1PresentClass = presenceMap[`${m.id}_${p1Id}`] ? 'present' : '';
                    let p2PresentClass = presenceMap[`${m.id}_${p2Id}`] ? 'present' : '';
                    
                    // Se foi WO, o lado que perdeu fica "Absent" (Vermelho)
                    if (isForfeit && isCompleted) {
                        const winner = String(m.winner_entrant_id || m.winner_id);
                        if (winner !== String(p1Id)) p1PresentClass = 'absent';
                        if (winner !== String(p2Id)) p2PresentClass = 'absent';
                    }

                    // 🔥 BOTÕES DE AÇÃO COM O "CONFIRMADO" VERDE
                    let btnHTML = '';
                    if (state.hasControlPermission) {
                        if (isCompleted) {
                            btnHTML = `<button class="btn-confirma locked" data-match='${matchDataStr}'>🔒 Encerrado</button>`;
                        } else if (isReady) {
                            btnHTML = `<button class="btn-confirma ready" data-match='${matchDataStr}'>✅ Confirmado</button>`;
                        } else {
                            btnHTML = `<button class="btn-confirma" data-match='${matchDataStr}'>⚙️ Preparação</button>`;
                        }
                    }

                    rowsHtml += `
                        <tr class="${rowClasses}">
                            <td class="${courtClass}">Q. ${m.court}</td>
                            <td class="cr-cell" style="width: 35%;">
                                <div class="cr-player-box">
                                    <div class="check-icon js-presence ${p1PresentClass}" data-match-id="${m.id}" data-entrant-id="${p1Id}" title="Marcar Presença"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                                    <div class="cr-player-info">
                                        <div class="cr-p-name-line"><span class="cr-p-bib">#${escapeHTML(p1Bib)}</span><span class="cr-p-name">🔴 ${escapeHTML(p1Name)}</span> ${p1Badges}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="cr-cell cr-vs">X</td>
                            <td class="cr-cell" style="width: 35%;">
                                <div class="cr-player-box">
                                    <div class="check-icon js-presence ${p2PresentClass}" data-match-id="${m.id}" data-entrant-id="${p2Id}" title="Marcar Presença"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                                    <div class="cr-player-info">
                                        <div class="cr-p-name-line"><span class="cr-p-bib">#${escapeHTML(p2Bib)}</span><span class="cr-p-name">🔵 ${escapeHTML(p2Name)}</span> ${p2Badges}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="cr-cell cr-action">${btnHTML}</td>
                        </tr>
                    `;
                });
            }
        }

        root.innerHTML = `
            ${styles}
            <div class="cr-container">
                <div class="cr-header">
                    <div>
                        <h1 style="margin: 0; font-size: 26px; color: #0f172a;">Câmara de Chamada</h1>
                        <p style="margin: 4px 0 0 0; color: #64748b;">${escapeHTML(state.competition.nome || 'Competição')}</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <a href="#/call-room-tv?id=${competitionId}" target="_blank" class="btn-tv-link">📺 Telão Espectadores</a>
                        <button class="btn-confirma" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; width:auto;" onclick="window.history.back()">← Voltar</button>
                    </div>
                </div>

                <div class="cr-bar">
                    <div class="cr-selector-box">
                        <label style="font-weight: bold; color: #475569;">RODADA:</label>
                        <select id="round-select" class="cr-select">${optionsHtml}</select>
                    </div>
                    <div class="cr-timing-box">
                        <div class="cr-time-item">🟢 Abertura: <span class="cr-time-val open">${openTimeStr}</span></div>
                        <div class="cr-time-item" style="border-left:1px solid #e2e8f0; padding-left:15px;">🚪 Fechamento: <span class="cr-time-val close">${closeTimeStr}</span></div>
                        <div class="cr-time-item" style="border-left:1px solid #e2e8f0; padding-left:15px;">⌚ Relógio Oficial: <span class="cr-realtime" id="cr-clock">--:--:--</span></div>
                    </div>
                </div>

                <table class="cr-table"><tbody>${rowsHtml}</tbody></table>
            </div>

            <div id="cr-modal" class="cr-modal-overlay">
                <div class="cr-modal-content">
                    <div class="cr-modal-header">
                        <span id="cr-modal-title">Preparação - Quadra --</span>
                        <button class="cr-modal-close" onclick="document.getElementById('cr-modal').classList.remove('active')">&times;</button>
                    </div>
                    <div class="cr-modal-body">
                        <button class="cr-swap-btn" id="cr-swap-btn"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg> Inverter Cores (Vermelho ↔ Azul)</button>
                        <div class="cr-teams-container">
                            <div class="cr-team-side" id="side-left">
                                <div class="cr-team-header red" id="header-left">🔴 Lado Vermelho</div>
                                <div class="cr-team-content">
                                    <div style="font-weight:900; font-size:16px; color:#1e293b; text-align:center;" id="name-left">Nome</div>
                                    <div style="text-align:center; font-size:12px; color:#64748b;">BIB: <span id="bib-left">--</span></div>
                                    <div class="cr-control-group"><div class="cr-control-title">Violações de Câmara</div><select class="cr-viol-select" id="select-viol-left"><option value="">-- Selecione --</option>${violOptionsHtml}</select><button class="cr-add-viol-btn" data-side="left">+ Lançar Cartão</button><div class="cr-viol-list" id="list-viol-left"></div></div>
                                    <div class="cr-control-group"><label class="cr-wo-box"><input type="checkbox" id="wo-left"> ❌ Recebeu W.O.</label></div>
                                </div>
                            </div>
                            <div class="cr-team-side" id="side-right">
                                <div class="cr-team-header blue" id="header-right">🔵 Lado Azul</div>
                                <div class="cr-team-content">
                                    <div style="font-weight:900; font-size:16px; color:#1e293b; text-align:center;" id="name-right">Nome</div>
                                    <div style="text-align:center; font-size:12px; color:#64748b;">BIB: <span id="bib-right">--</span></div>
                                    <div class="cr-control-group"><div class="cr-control-title">Violações de Câmara</div><select class="cr-viol-select" id="select-viol-right"><option value="">-- Selecione --</option>${violOptionsHtml}</select><button class="cr-add-viol-btn" data-side="right">+ Lançar Cartão</button><div class="cr-viol-list" id="list-viol-right"></div></div>
                                    <div class="cr-control-group"><label class="cr-wo-box"><input type="checkbox" id="wo-right"> ❌ Recebeu W.O.</label></div>
                                </div>
                            </div>
                        </div>
                        <button class="cr-save-btn" id="cr-save-btn"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg> Confirmar Preparação da Quadra</button>
                    </div>
                </div>
            </div>

            <div id="admin-reset-modal" class="cr-modal-overlay">
                <div class="cr-modal-content" style="max-width: 500px;">
                    <div class="cr-modal-header" style="background: #0f172a;">
                        <span>🔒 Jogo Encerrado</span>
                        <button class="cr-modal-close" onclick="document.getElementById('admin-reset-modal').classList.remove('active')">&times;</button>
                    </div>
                    <div class="cr-modal-body">
                        <h3 style="margin-top:0; text-align: center; color: #1e293b;">Resumo da Súmula</h3>
                        
                        <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 900; margin-bottom: 15px;">
                                <div style="color: #dc2626; width: 40%; text-align: right;" id="locked-p1-name">Vermelho</div>
                                <div style="width: 20%; text-align: center; font-size: 26px; color: #0f172a;" id="locked-score">0 x 0</div>
                                <div style="color: #2563eb; width: 40%; text-align: left;" id="locked-p2-name">Azul</div>
                            </div>
                            
                            <div id="locked-partials" style="font-size: 13px; color: #475569; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
                                </div>
                        </div>

                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="btn-admin-edit" id="btn-execute-edit" style="flex: 1; background: #3b82f6; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                📝 Ver Súmula Completa
                            </button>
                            <button class="btn-admin-reset" id="btn-execute-reset" style="flex: 1; background: #ef4444; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; ${state.hasControlPermission ? '' : 'display:none;'}">
                                🔄 Resetar Partida
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const sel = root.querySelector('#round-select');
        if (sel) sel.addEventListener('change', (e) => { state.selectedRound = e.target.value; render(); });

        if (state.clockInterval) clearInterval(state.clockInterval);
        state.clockInterval = setInterval(() => {
            const clockEl = document.getElementById('cr-clock');
            if (clockEl) {
                clockEl.innerText = new Date().toLocaleTimeString('pt-BR');
            } else {
                clearInterval(state.clockInterval);
            }
        }, 1000);

        // 🔥 GRAVA A PRESENÇA NA MEMÓRIA LOCAL QUANDO CLICA NA BOLINHA
        root.querySelectorAll('.js-presence').forEach(icon => {
            icon.addEventListener('click', (e) => {
                if (!state.hasControlPermission) return;
                const btn = e.currentTarget;
                if (btn.classList.contains('absent')) return; 

                const matchId = btn.dataset.matchId;
                const entrantId = btn.dataset.entrantId;
                const key = `${matchId}_${entrantId}`;
                
                if (presenceMap[key]) {
                    delete presenceMap[key];
                    btn.classList.remove('present');
                } else {
                    presenceMap[key] = true;
                    btn.classList.add('present');
                }
                localStorage.setItem(PRESENCE_KEY, JSON.stringify(presenceMap));
            });
        });

        function updateModalUI() {
            const m = state.currentMatchModal; const ms = state.modalState;
            const leftKey = ms.isSwapped ? 'p2' : 'p1'; const rightKey = ms.isSwapped ? 'p1' : 'p2';

            document.getElementById('name-left').innerText = m[`${leftKey}Name`]; document.getElementById('bib-left').innerText = m[`${leftKey}Bib`];
            document.getElementById('wo-left').checked = ms.isWO && ms.winnerId !== m[`${leftKey}Id`];

            document.getElementById('name-right').innerText = m[`${rightKey}Name`]; document.getElementById('bib-right').innerText = m[`${rightKey}Bib`];
            document.getElementById('wo-right').checked = ms.isWO && ms.winnerId !== m[`${rightKey}Id`];

            const renderVList = (listId, violArray, key) => {
                document.getElementById(listId).innerHTML = violArray.map((v, i) => {
                    const colorClass = v.includes('Amarelo') ? 'yellow' : (v.includes('Vermelho') || v.includes('WO') ? 'red' : '');
                    return `<div class="cr-viol-item ${colorClass}"><span>${v.split(' | ')[0]}</span><button class="cr-viol-del" onclick="window.removeViol('${key}', ${i})">&times;</button></div>`;
                }).join('');
            };

            renderVList('list-viol-left', ms[`${leftKey}Violations`], leftKey);
            renderVList('list-viol-right', ms[`${rightKey}Violations`], rightKey);
        }

        window.removeViol = (key, index) => { 
            if (!state.hasControlPermission) return;
            state.modalState[`${key}Violations`].splice(index, 1); updateModalUI(); 
        };

        root.querySelectorAll('.btn-confirma[data-match]').forEach(btn => {
            btn.addEventListener('click', () => {
                const m = JSON.parse(btn.getAttribute('data-match'));
                state.currentMatchModal = m;

                if (m.status === 'COMPLETED') {
                    document.getElementById('locked-p1-name').innerText = `🔴 ${m.p1Name}`;
                    document.getElementById('locked-p2-name').innerText = `🔵 ${m.p2Name}`;
                    document.getElementById('locked-score').innerText = m.isWO ? "W.O." : `${m.score1} x ${m.score2}`;
                    
                    let p1P = m.details?.p1_partials || [];
                    let p2P = m.details?.p2_partials || [];
                    let partialsHtml = '';
                    
                    for(let i=0; i<4; i++) {
                        let v1 = p1P[i] !== undefined && p1P[i] !== null && p1P[i] !== '' ? p1P[i] : '-';
                        let v2 = p2P[i] !== undefined && p2P[i] !== null && p2P[i] !== '' ? p2P[i] : '-';
                        if (v1 !== '-' || v2 !== '-') partialsHtml += `<span class="partial-pill">${i+1}º: ${v1}-${v2}</span>`;
                    }
                    if ((p1P[4] !== undefined && p1P[4] !== null && p1P[4] !== '') || (p2P[4] !== undefined && p2P[4] !== null && p2P[4] !== '')) {
                         let tb1 = p1P[4] ?? '-'; let tb2 = p2P[4] ?? '-';
                         partialsHtml += `<span class="partial-pill tb">TB: ${tb1}-${tb2}</span>`;
                    }
                    
                    document.getElementById('locked-partials').innerHTML = partialsHtml || '<i>Sem parciais registradas.</i>';
                    document.getElementById('admin-reset-modal').classList.add('active');

                } else {
                    if (!state.hasControlPermission) {
                        alert("🔒 Acesso Negado!\n\nVocê não tem permissão de operação na Câmara de Chamada desta competição. Verifique o seu PIN.");
                        return;
                    }
                    state.modalState = { isSwapped: false, p1Violations: [...m.p1V], p2Violations: [...m.p2V], isWO: m.isWO, winnerId: m.winnerId };
                    document.getElementById('cr-modal-title').innerText = `Preparação - Quadra ${m.court}`;
                    updateModalUI();
                    document.getElementById('cr-modal').classList.add('active');
                }
            });
        });

        document.getElementById('cr-swap-btn').onclick = () => { 
            if (!state.hasControlPermission) return;
            state.modalState.isSwapped = !state.modalState.isSwapped; updateModalUI(); 
        };

        document.querySelectorAll('.cr-add-viol-btn').forEach(btn => {
            btn.onclick = (e) => {
                if (!state.hasControlPermission) return;
                const isLeft = e.target.dataset.side === 'left';
                const selectId = `select-viol-${isLeft ? 'left' : 'right'}`;
                const val = document.getElementById(selectId).value;
                if (!val) return alert("Selecione uma violação na lista primeiro.");

                const [code, text, penalty] = val.split('|');
                const now = new Date();
                const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                const violString = `CC - ${code} - ${text} - ${penalty} | ${timeStr}`;

                const targetKey = (isLeft && !state.modalState.isSwapped) || (!isLeft && state.modalState.isSwapped) ? 'p1' : 'p2';
                state.modalState[`${targetKey}Violations`].push(violString);
                document.getElementById(selectId).value = ""; updateModalUI();
            };
        });

        const woL = document.getElementById('wo-left'); const woR = document.getElementById('wo-right');
        const calcWOState = () => {
            const m = state.currentMatchModal; const ms = state.modalState;
            if (woL.checked) { ms.isWO = true; ms.winnerId = ms.isSwapped ? m.p1Id : m.p2Id; } 
            else if (woR.checked) { ms.isWO = true; ms.winnerId = ms.isSwapped ? m.p2Id : m.p1Id; } 
            else { ms.isWO = false; ms.winnerId = null; }
        };
        woL.onchange = () => { if (woL.checked) { woR.checked = false; } calcWOState(); };
        woR.onchange = () => { if (woR.checked) { woL.checked = false; } calcWOState(); };

        document.getElementById('cr-save-btn').onclick = async () => {
            if (!state.hasControlPermission) return;
            const m = state.currentMatchModal; const ms = state.modalState;
            const btn = document.getElementById('cr-save-btn');
            btn.innerHTML = "A gravar preparação..."; btn.disabled = true;

            try {
                await atualizarPartidaNoBanco(m.db_collection, m.doc_id, m.id, (match) => {
                    
                    if (ms.isSwapped) {
                        const allKeys = Object.keys(match);
                        const suffixes = new Set();
                        allKeys.forEach(k => {
                            if (k.startsWith('entrant1_')) suffixes.add(k.replace('entrant1_', ''));
                            if (k.startsWith('entrant2_')) suffixes.add(k.replace('entrant2_', ''));
                            if (k.startsWith('entrant_a_')) suffixes.add(k.replace('entrant_a_', ''));
                            if (k.startsWith('entrant_b_')) suffixes.add(k.replace('entrant_b_', ''));
                        });

                        suffixes.forEach(s => {
                            let val1 = match[`entrant1_${s}`];
                            let val2 = match[`entrant2_${s}`];
                            if (val1 !== undefined || val2 !== undefined) {
                                if (val2 !== undefined) match[`entrant1_${s}`] = val2; else delete match[`entrant1_${s}`];
                                if (val1 !== undefined) match[`entrant2_${s}`] = val1; else delete match[`entrant2_${s}`];
                            }

                            let valA = match[`entrant_a_${s}`];
                            let valB = match[`entrant_b_${s}`];
                            if (valA !== undefined || valB !== undefined) {
                                if (valB !== undefined) match[`entrant_a_${s}`] = valB; else delete match[`entrant_a_${s}`];
                                if (valA !== undefined) match[`entrant_b_${s}`] = valA; else delete match[`entrant_b_${s}`];
                            }
                        });
                    }

                    let details = safeParse(match.details || match.match_details);
                    details.p1_violations = ms.p1Violations;
                    details.p2_violations = ms.p2Violations;
                    details.is_wo = ms.isWO;
                    match.details = details; 
                    
                    match.call_room_ready = true; 

                    if (ms.isWO) { match.status = 'COMPLETED'; match.winner_id = ms.winnerId; match.winner_entrant_id = ms.winnerId; } 
                    else if (match.status === 'COMPLETED' && !ms.isWO) { match.status = 'SCHEDULED'; match.winner_id = null; match.winner_entrant_id = null; }
                });

                document.getElementById('cr-modal').classList.remove('active');
                loadData(); 
            } catch (e) { alert("Erro ao salvar: " + e.message); btn.innerHTML = "Tentar Novamente"; btn.disabled = false; }
        };

        document.getElementById('btn-execute-edit').onclick = () => {
            const m = state.currentMatchModal;
            window.open(`#/live/scoresheet?match_id=${m.id}&comp_id=${competitionId}`, '_blank');
            document.getElementById('admin-reset-modal').classList.remove('active');
        };

        const btnReset = document.getElementById('btn-execute-reset');
        if (btnReset) {
            btnReset.onclick = async () => {
                if (!state.hasControlPermission) return;
                const m = state.currentMatchModal;
                if(!confirm("Atenção: Você tem certeza que deseja RESETAR essa súmula? Todo o placar será apagado e a quadra ficará disponível novamente.")) return;

                try {
                    await atualizarPartidaNoBanco(m.db_collection, m.doc_id, m.id, (match) => {
                        match.status = 'SCHEDULED'; match.call_room_ready = false; 
                        match.winner_id = null; match.winner_entrant_id = null;
                        match.score1 = null; match.score_entrant1 = null; match.score_a = null;
                        match.score2 = null; match.score_entrant2 = null; match.score_b = null;
                        let details = safeParse(match.details || match.match_details);
                        details.is_wo = false; details.p1_partials = []; details.p2_partials = [];
                        match.details = details; 
                    });
                    
                    document.getElementById('admin-reset-modal').classList.remove('active');
                    loadData();
                } catch (e) { alert("Erro ao resetar: " + e.message); }
            }
        }
    }
    loadData();
}