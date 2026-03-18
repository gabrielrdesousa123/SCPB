// client/js/pages/competition-class-competition.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, query, where, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { canViewPage } from '../permissions.js';

const VIOLATIONS_DICT = [
  { group: 'Retração (Art. 16.5)', penalty: 'Retração', rules: [
    { code: '16.5.1', text: 'Lançamento antes da autorização do árbitro' },
    { code: '16.5.2', text: 'Atleta BC3 não é quem libera a bola' },
    { code: '16.5.3', text: 'Assistente toca no atleta, ponteira ou cadeira' },
    { code: '16.5.4', text: 'Atleta e assistente soltam a bola simultaneamente' },
    { code: '16.5.5', text: 'Bola colorida jogada antes da bola branca (Jack)' },
    { code: '16.5.6', text: 'Primeira colorida por atleta diferente do Jack' },
    { code: '16.5.7', text: 'Falta de balanceio (swing) do BC3 antes do Jack' },
    { code: '16.5.8', text: 'Falta de balanceio do BC3 após reorientação' },
    { code: '16.5.9', text: 'Lado joga duas ou mais bolas ao mesmo tempo' }
  ]},
  { group: '1 Bola de Penalidade (Art. 16.6)', penalty: '1 Bola de Penalidade', rules: [
    { code: '16.6.1', text: 'Atleta entra na área de jogo sem ser sua vez' },
    { code: '16.6.2', text: 'Calheiro olha para a área de jogo antes da hora' },
    { code: '16.6.3', text: 'Preparação da jogada no tempo do adversário' },
    { code: '16.6.4', text: 'Assistente move equipamento sem o atleta pedir' },
    { code: '16.6.5', text: 'Não sai do caminho após aviso verbal prévio' },
    { code: '16.6.6', text: 'Tocar acidentalmente em uma bola em quadra' },
    { code: '16.6.7', text: 'Causar atraso injustificado na partida' },
    { code: '16.6.8', text: 'Não aceitar uma decisão do árbitro' },
    { code: '16.6.9', text: 'Assistente/técnico entra na área sem permissão' },
    { code: '16.6.10', text: 'Comportamento não cooperativo no aquecimento' }
  ]},
  { group: 'Retração + 1 Bola de Penalidade (Art. 16.7)', penalty: 'Retração + 1 Bola de Penalidade', rules: [
    { code: '16.7.1', text: 'Lançar com pessoal/equipamento tocando a linha' },
    { code: '16.7.2', text: 'Lançar com a calha sobreposta à linha' },
    { code: '16.7.3', text: 'Lançar sem contato com o assento' },
    { code: '16.7.4', text: 'Lançar a bola enquanto ela toca a quadra fora' },
    { code: '16.7.5', text: 'Lançar enquanto o assistente olha para a área' },
    { code: '16.7.6', text: 'Lançar com altura do assento superior a 66 cm' },
    { code: '16.7.7', text: 'Lançar com parceiro retornando da área de jogo' },
    { code: '16.7.8', text: 'Preparar e lançar no tempo do adversário' }
  ]},
  { group: '1 Bola de Penalidade + Cartão Amarelo (Art. 16.8)', penalty: 'Cartão Amarelo', rules: [
    { code: '16.8.1', text: 'Interferência afetando concentração do oponente' },
    { code: '16.8.2', text: 'Comunicação inapropriada na equipe' }
  ]},
  { group: 'Cartão Amarelo Direto (Art. 16.9)', penalty: 'Cartão Amarelo', rules: [
    { code: '16.9.1', text: 'Entrada irregular/excesso de pessoal no Call Room' },
    { code: '16.9.2', text: 'Levar mais bolas do que o permitido' },
    { code: '16.9.3', text: 'Bola reprovada no teste oficial' },
    { code: '16.9.4', text: 'Sair da quadra sem permissão' },
    { code: '16.9.5', text: 'Uso de equipamento irregular' }
  ]},
  { group: 'Segundo Cartão Amarelo (Art. 16.10)', penalty: 'WO / Banimento', rules: [
    { code: '16.10.1', text: 'Segunda advertência na competição' },
    { code: '16.10.2', text: 'Segundo amarelo no Call Room (WO)' },
    { code: '16.10.3', text: 'Segundo amarelo em quadra (Banimento)' }
  ]},
  { group: 'Cartão Vermelho (Art. 16.11)', penalty: 'Cartão Vermelho', rules: [
    { code: '16.11.1', text: 'Conduta antidesportiva grave' },
    { code: '16.11.2', text: 'Conduta violenta' },
    { code: '16.11.3', text: 'Linguagem ofensiva ou abusiva' },
    { code: '16.11.4', text: 'Desqualificação imediata da competição' }
  ]},
  { group: 'Forfeit (Art. 16.12)', penalty: 'Forfeit', rules: [
    { code: '16.12.1', text: 'Quebrar bolas/equipamentos do adversário' },
    { code: '16.12.2', text: 'Falha no teste de bolas após a partida' },
    { code: '16.12.3', text: 'Sair da área da quadra sem permissão' }
  ]}
];

export async function renderCompetitionClassCompetition(root, hash) {
  const auth = getAuth();
  let canEditMatch = false;

  const matchUrl = hash.match(/#\/competitions\/(\d+)\/class\/([^/]+)\/competition-view/) || hash.match(/#\/competitions\/([a-zA-Z0-9_-]+)\/class\/([^/]+)\/competition-view/);
  if (!matchUrl) {
    root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro: Rota inválida.</div>`;
    return;
  }
  const competitionId = matchUrl[1];
  const classCode = decodeURIComponent(matchUrl[2]);

  const state = {
    colors: { bg: '#0d6efd', fg: '#ffffff' },
    pools: [], groupMatches: [], koMatches: [],
    allPlayers: [], penalties: {}, officials: [] 
  };

  const API = {
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
            if (data.format && data.format.type === 'PURE_KNOCKOUT') {
               if (data.seeds) data.seeds.forEach(p => { if (p) state.allPlayers.push(p); });
            } else if (Array.isArray(state.pools) && state.pools.length > 0) {
               state.pools.forEach(pool => { if(pool.players) pool.players.forEach(p => state.allPlayers.push(p)); });
            } else if (data.seeds) {
               data.seeds.forEach(p => { if (p) state.allPlayers.push(p); });
            }
        }
      } catch (e) { }
    },
    getGroupMatches: async () => {
      try {
        const q = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data();
            state.groupMatches = [{ docId: snap.docs[0].id, ...data }];
        }
      } catch (e) { }
    },
    getKOMatches: async () => {
      try {
        const q = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data();
            state.koMatches = [{ docId: snap.docs[0].id, ...data }];
        }
      } catch (e) { }
    },
    getOfficials: async () => {
      try {
        const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
        const snap = await getDocs(q);
        if (!snap.empty) return snap.docs[0].data().officials || [];
        return [];
      } catch (e) { return []; }
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
    } catch(e) { return {}; }
  }

  function getParticipantData(match, side, dynamicId = null) {
      const isGroup = match.match_type === 'GROUP' || match.pool_id || match.round_name?.includes('Round');
      const prefix = side === 1 ? (isGroup ? 'entrant1' : 'entrant_a') : (isGroup ? 'entrant2' : 'entrant_b');
      
      const mId = dynamicId || match[`${prefix}_athlete_id`] || match[`${prefix}_id`];
      const mName = match[`${prefix}_name`] || match[`p${side}_name`];
      const mBib = match[`${prefix}_bib`] || match[`p${side}_bib`];
      const mClubSigla = match[`${prefix}_club_sigla`] || match[`p${side}_club_sigla`];
      const mClubNome = match[`${prefix}_club_nome`] || match[`p${side}_club_nome`];

      let mLogo = match[`${prefix}_logo`] || match[`p${side}_logo`];

      const isBye = String(mName).toUpperCase().includes('BYE') || String(mId).toUpperCase().includes('BYE');
      if (isBye) return { id: null, name: 'BYE (Avança Direto)', bib: '--', clubFull: '', clubSigla: '', rampa: '', isBye: true, logo: null };

      const player = state.allPlayers.find(p => String(p.id) === String(mId)) || {};

      let finalName = player.nome || mName || 'A Definir';
      if (finalName === 'A Definir' && match[`${prefix}_name`]) finalName = match[`${prefix}_name`];

      const finalBib = player.bib || mBib || '---';
      
      let finalRampa = '';
      if (classCode.toUpperCase().includes('BC3') && player.operador_rampa) {
          finalRampa = player.operador_rampa;
      }
      
      let cNome = player.clube_nome || mClubNome || 'CLUBE NÃO INFORMADO';
      let cSigla = player.clube_sigla || mClubSigla || '';
      let finalClubFull = cNome;

      if (!mLogo && player.logo_url) mLogo = player.logo_url;

      if (cSigla && cNome !== cSigla && cNome !== 'CLUBE NÃO INFORMADO') {
          finalClubFull = `${cNome} - ${cSigla}`;
      } else if (cSigla && cNome === 'CLUBE NÃO INFORMADO') {
          finalClubFull = cSigla;
      } else if (!cSigla && cNome === 'CLUBE NÃO INFORMADO') {
          finalClubFull = '';
      }

      return {
          id: mId, name: finalName, bib: finalBib,
          clubFull: finalClubFull, clubSigla: cSigla || finalClubFull || '',
          rampa: finalRampa, isBye: false, logo: mLogo
      };
  }

  async function saveMatchToFirebase(mId, payload) {
      let foundAndUpdated = false;

      const qGroup = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
      const snapGroup = await getDocs(qGroup);
      if (!snapGroup.empty) {
          const docRef = doc(db, "matches_group", snapGroup.docs[0].id);
          const docData = snapGroup.docs[0].data();
          const fieldName = docData.matches ? "matches" : "data";
          const mainArr = docData[fieldName] || [];
          mainArr.forEach(pool => {
              Object.values(pool.rounds || {}).forEach(round => {
                  const idx = round.findIndex(x => String(x.id) === String(mId));
                  if (idx !== -1) { round[idx] = { ...round[idx], ...payload }; foundAndUpdated = true; }
              });
          });
          if (foundAndUpdated) { await updateDoc(docRef, { [fieldName]: mainArr }); return true; }
      }

      const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)), where("class_code", "==", classCode));
      const snapKo = await getDocs(qKo);
      if (!snapKo.empty) {
          const docRef = doc(db, "matches_ko", snapKo.docs[0].id);
          const docData = snapKo.docs[0].data();
          const fieldName = docData.matches ? "matches" : "data";
          const mainArr = docData[fieldName] || [];
          const idx = mainArr.findIndex(x => String(x.id) === String(mId));
          if (idx !== -1) { mainArr[idx] = { ...mainArr[idx], ...payload }; foundAndUpdated = true; }
          if (foundAndUpdated) { await updateDoc(docRef, { [fieldName]: mainArr }); return true; }
      }
      throw new Error("A partida não foi encontrada para atualização.");
  }

  async function loadData() {
    root.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 50vh; flex-direction: column;">
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0d6efd; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 15px; color: #64748b; font-family: sans-serif;">A montar as Tabelas e Chaves...</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </div>
    `;
    try {
      await Promise.all([ API.getClassColors(), API.getPools(), API.getGroupMatches(), API.getKOMatches() ]);
      state.officials = await API.getOfficials(); 
    } catch (e) {}
    
    onAuthStateChanged(auth, async (user) => {
        canEditMatch = false;
        
        if (user) {
            let isGlobalAdmin = false;
            let uName = "", uCpf = "", uEmail = user.email ? String(user.email).toLowerCase().trim() : null;

            try { 
                if (typeof canViewPage === 'function') { isGlobalAdmin = canViewPage('gestao'); } 
            } catch(e) {}

            try {
                const uDoc = await getDoc(doc(db, "users", user.uid));
                if (uDoc.exists()) {
                    const d = uDoc.data();
                    uName = String(d.nome || d.name || '').toLowerCase().trim();
                    uCpf = String(d.cpf || '').replace(/\D/g, '');
                    if (!uEmail && d.email) uEmail = String(d.email).toLowerCase().trim();
                    const r = String(d.role || d.nivel_acesso || d.global_role || '').toLowerCase();
                    if (r.includes('admin') || r === 'administrador') isGlobalAdmin = true;
                }
            } catch(e) {}

            // 🔥 REDE DE CAPTURA ABSOLUTA: Procura o usuário logado entre os oficiais da competição
            const cleanStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '');
            const myCleanName = cleanStr(uName);

            const myOfficialRecord = state.officials.find(o => {
                const oId = String(o.referee_id || o.uid || o.official_id || o.id || '');
                const oEmail = String(o.email || '').toLowerCase().trim();
                const oCpf = String(o.cpf || '').replace(/\D/g, '');
                const oName = cleanStr(o.nome || o.nome_completo || o.nome_abreviado);
                
                if (user.uid && oId === String(user.uid)) return true;
                if (uEmail && oEmail && oEmail === uEmail) return true;
                if (uCpf && oCpf && oCpf === uCpf) return true;
                if (myCleanName && oName && (oName === myCleanName || oName.includes(myCleanName) || myCleanName.includes(oName))) return true;
                
                return false;
            });

            if (isGlobalAdmin) {
                canEditMatch = true;
            } else if (myOfficialRecord) {
                const myRoles = myOfficialRecord.role ? String(myOfficialRecord.role).toLowerCase().split(',').map(r => r.trim()) : [];
                const normalizedRoles = myRoles.map(cleanStr);
                const highRoles = ['delegadotecnico', 'assistentedelegadotecnico', 'arbitrochefe', 'assistentearbitrochefe'];
                
                if (normalizedRoles.some(r => highRoles.includes(r))) {
                    canEditMatch = true;
                }
            }
        }
        render();
    });
  }

  function calculatePenalties() {
    const pen = {};
    const processMatch = (m) => {
      if (m.status !== 'COMPLETED') return;
      const details = safeParse(m.details || m.match_details);
      const p1Id = m.entrant1_id || m.entrant_a_id;
      const p2Id = m.entrant2_id || m.entrant_b_id;

      const p1V = details.p1_violations || [];
      const p2V = details.p2_violations || [];

      if (!pen[p1Id]) pen[p1Id] = { yellow: 0, red: 0 };
      if (!pen[p2Id]) pen[p2Id] = { yellow: 0, red: 0 };

      pen[p1Id].yellow += p1V.filter(v => v.includes('Cartão Amarelo') || v.includes('Amarelo')).length;
      pen[p1Id].red += p1V.filter(v => v.includes('Cartão Vermelho') || v.includes('Desqualificação') || v.includes('WO') || v.includes('Forfeit')).length;
      pen[p2Id].yellow += p2V.filter(v => v.includes('Cartão Amarelo') || v.includes('Amarelo')).length;
      pen[p2Id].red += p2V.filter(v => v.includes('Cartão Vermelho') || v.includes('Desqualificação') || v.includes('WO') || v.includes('Forfeit')).length;
    };

    state.groupMatches.forEach(gm => {
        const arr = gm.matches || gm.data || [];
        arr.forEach(pool => Object.values(pool.rounds || {}).flat().forEach(processMatch));
    });

    state.koMatches.forEach(km => {
        const arr = km.matches || km.data || [];
        arr.forEach(processMatch);
    });
    state.penalties = pen;
  }

  function calculatePoolStandings() {
    const standings = {};
    if (!Array.isArray(state.pools)) return standings; 
    
    state.pools.forEach((pool, index) => {
      const poolLetter = String.fromCharCode(65 + index); 
      let poolMatchData = null;
      for(const gm of state.groupMatches) {
          const arr = gm.matches || gm.data || [];
          
          const found = arr.find(pm => {
              const nameMatch = pm.pool_name && pool.name && String(pm.pool_name).toLowerCase() === String(pool.name).toLowerCase();
              const idMatch = pm.pool_id && pool.id && String(pm.pool_id) === String(pool.id);
              return nameMatch || idMatch;
          });
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
      players.forEach(p => { stats[p.id] = { ...p, wins: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0, endsWon: 0, pdiffMatch: 0, pdiffEnd: 0, vsRecord: {} }; });

      matches.forEach(m => {
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
          let p1Ends = 0, p2Ends = 0; let p1MaxEndDiff = 0, p2MaxEndDiff = 0;
          
          if (!isWO && Array.isArray(details.p1_partials) && Array.isArray(details.p2_partials)) {
            for (let i = 0; i < 4; i++) {
              const val1 = details.p1_partials[i]; const val2 = details.p2_partials[i];
              if ((val1 !== null && val1 !== undefined && String(val1) !== '') || (val2 !== null && val2 !== undefined && String(val2) !== '')) {
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
            if (p2Id) {
                if (!stats[p1Id].vsRecord[p2Id]) stats[p1Id].vsRecord[p2Id] = { wins: 0, ptsDiff: 0, scoreStr: '' };
                if (is1Winner) stats[p1Id].vsRecord[p2Id].wins++;
                stats[p1Id].vsRecord[p2Id].ptsDiff += matchDiff1;
                stats[p1Id].vsRecord[p2Id].scoreStr = stats[p1Id].vsRecord[p2Id].scoreStr ? `${stats[p1Id].vsRecord[p2Id].scoreStr} | ${s1}` : `${s1}`;
            }
          }
          if (p2Id && stats[p2Id]) {
            stats[p2Id].pointsFor += s2; stats[p2Id].pointsAgainst += s1; stats[p2Id].endsWon += p2Ends;
            if (is2Winner) stats[p2Id].wins++;
            const matchDiff2 = s2 - s1;
            if (matchDiff2 > stats[p2Id].pdiffMatch) stats[p2Id].pdiffMatch = matchDiff2;
            if (p2MaxEndDiff > stats[p2Id].pdiffEnd) stats[p2Id].pdiffEnd = p2MaxEndDiff;
            if (p1Id) {
                if (!stats[p2Id].vsRecord[p1Id]) stats[p2Id].vsRecord[p1Id] = { wins: 0, ptsDiff: 0, scoreStr: '' };
                if (is2Winner) stats[p2Id].vsRecord[p1Id].wins++;
                stats[p2Id].vsRecord[p1Id].ptsDiff += matchDiff2;
                stats[p2Id].vsRecord[p1Id].scoreStr = stats[p2Id].vsRecord[p1Id].scoreStr ? `${stats[p2Id].vsRecord[p1Id].scoreStr} | ${s2}` : `${s2}`;
            }
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
          const rec1 = p1.vsRecord[p2.id] || { wins: 0, ptsDiff: 0 };
          const rec2 = p2.vsRecord[p1.id] || { wins: 0, ptsDiff: 0 };
          if (rec1.wins > rec2.wins) return [p1, p2];
          if (rec2.wins > rec1.wins) return [p2, p1];
          return [p1, p2].sort((a,b) => fallbackCompare(a,b));
        }

        const groupIds = group.map(p => String(p.id));
        const miniStats = {};
        groupIds.forEach(id => miniStats[id] = { pdiff: 0, endsWon: 0, ptsFor: 0 });

        matches.forEach(m => {
          if (m.status === 'COMPLETED' && groupIds.includes(String(m.entrant1_athlete_id || m.entrant1_id)) && groupIds.includes(String(m.entrant2_athlete_id || m.entrant2_id))) {
            let s1 = Number(m.score1 ?? m.score_entrant1) || 0; let s2 = Number(m.score2 ?? m.score_entrant2) || 0;
            const det = safeParse(m.details || m.match_details);
            if (det.is_wo) {
               if (String(m.winner_entrant_id) === String(m.entrant1_id)) { s1 = poolMaxDiff; s2 = 0; }
               else if (String(m.winner_entrant_id) === String(m.entrant2_id)) { s1 = 0; s2 = poolMaxDiff; }
            }
            let e1w = 0, e2w = 0;
            if (!det.is_wo && Array.isArray(det.p1_partials)) {
              for (let i = 0; i < 4; i++) {
                const v1 = det.p1_partials[i]; const v2 = det.p2_partials[i];
                if ((v1 !== null && String(v1) !== '') || (v2 !== null && String(v2) !== '')) {
                  const e1 = Number(v1) || 0; const e2 = Number(v2) || 0;
                  if (e1 > e2) e1w++; else if (e2 > e1) e2w++;
                }
              }
            }
            const id1 = String(m.entrant1_athlete_id || m.entrant1_id);
            const id2 = String(m.entrant2_athlete_id || m.entrant2_id);
            miniStats[id1].ptsFor += s1; miniStats[id1].pdiff += (s1 - s2); miniStats[id1].endsWon += e1w;
            miniStats[id2].ptsFor += s2; miniStats[id2].pdiff += (s2 - s1); miniStats[id2].endsWon += e2w;
          }
        });

        group.forEach(p => p._mini = miniStats[String(p.id)]);
        group.sort((a, b) => {
          if (b._mini.pdiff !== a._mini.pdiff) return b._mini.pdiff - a._mini.pdiff;
          if (b._mini.endsWon !== a._mini.endsWon) return b._mini.endsWon - a._mini.endsWon;
          if (b._mini.ptsFor !== a._mini.ptsFor) return b._mini.ptsFor - a._mini.ptsFor;
          return fallbackCompare(a, b);
        });

        let subGroups = []; let currentSub = [group[0]];
        for (let i = 1; i < group.length; i++) {
          const prev = group[i-1]; const curr = group[i];
          if (curr._mini.pdiff === prev._mini.pdiff && curr._mini.endsWon === prev._mini.endsWon && curr._mini.ptsFor === prev._mini.ptsFor) currentSub.push(curr);
          else { subGroups.push(currentSub); currentSub = [curr]; }
        }
        subGroups.push(currentSub);

        let result = [];
        subGroups.forEach(sg => {
          if (sg.length === group.length) { sg.sort((a,b) => fallbackCompare(a,b)); result = result.concat(sg); } 
          else result = result.concat(resolveTie(sg)); 
        });
        return result;
      }

      let finalRanked = [];
      const sortedWins = Object.keys(winsGroups).map(Number).sort((a,b) => b - a);
      sortedWins.forEach(w => { finalRanked = finalRanked.concat(resolveTie(winsGroups[w])); });

      pool.players = finalRanked.map((p, i) => ({ ...p, rank: i + 1 }));

      standings[poolLetter] = {
        isFinished, first: isFinished && finalRanked[0] ? finalRanked[0] : null,
        second: isFinished && finalRanked[1] ? finalRanked[1] : null,
        players: pool.players, maxDiffForWO: poolMaxDiff
      };
    });
    
    return standings;
  }

  function calculateFinalRanking(standings, koMatchesArray, allPlayers) {
    const ranking = [];
    const koM = koMatchesArray.flatMap(km => km.matches || km.data || []);
    
    const finals = koM.filter(m => m.round_name === 'Final' || m.round === 'Final');
    const bronze = koM.filter(m => m.round_name === 'Disputa de 3º Lugar' || String(m.round_name).includes('3º'));
    const quarters = koM.filter(m => String(m.round_name).includes('Quartas'));
    const playoffs = koM.filter(m => String(m.round_name).includes('Playoffs'));
    const oitavas = koM.filter(m => String(m.round_name).includes('Oitavas'));

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
        if (m.status === 'COMPLETED' || m.status === 'BYE') {
          const { lAthleteId, wScore, lScore } = getAthleteIds(m);
          if (lAthleteId && lAthleteId !== 'BYE' && !String(lAthleteId).includes('BYE')) {
             qfLosers.push({ athleteId: lAthleteId, pDiff: lScore - wScore, ptsFor: lScore });
          }
        }
      });
      qfLosers.sort((a, b) => {
        if (b.pDiff !== a.pDiff) return b.pDiff - a.pDiff;
        return b.ptsFor - a.ptsFor;
      });
      qfLosers.forEach((loser, idx) => addPlayer(loser.athleteId, 5 + idx, 'Quartas de Final'));
    }

    const firstRoundFilter = oitavas.length > 0 ? oitavas : playoffs;
    if (firstRoundFilter.length > 0) {
      let fLosers = [];
      firstRoundFilter.forEach(m => {
        if (m.status === 'COMPLETED' || m.status === 'BYE') {
          const { lAthleteId, wScore, lScore } = getAthleteIds(m);
          if (lAthleteId && lAthleteId !== 'BYE' && !String(lAthleteId).includes('BYE')) {
             fLosers.push({ athleteId: lAthleteId, pDiff: lScore - wScore, ptsFor: lScore });
          }
        }
      });
      fLosers.sort((a, b) => {
        if (b.pDiff !== a.pDiff) return b.pDiff - a.pDiff;
        return b.ptsFor - a.ptsFor;
      });
      const offset = quarters.length > 0 ? 9 : 5;
      const fName = oitavas.length > 0 ? 'Oitavas de Final' : 'Playoffs';
      fLosers.forEach((loser, idx) => addPlayer(loser.athleteId, offset + idx, fName));
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

  function generateDynamicBracket(standings, numPools, startMatchNumber) {
    const flatKOMatches = state.koMatches.flatMap(km => km.matches || km.data || []);
    
    const bracket = {};
    const roundsList = ['16 avos de Final', 'Oitavas de Final', 'Quartas de Final', 'Semi-Final', 'Final'];
    const matchesByRound = {};
    roundsList.forEach(r => matchesByRound[r] = []);
    const bronzeMatches = [];

    if (flatKOMatches.length > 0) {
        flatKOMatches.forEach(m => {
           if (m.round_name === 'Disputa de 3º Lugar' || m.round_name?.includes('3º')) {
               bronzeMatches.push(m);
           } else {
               const r = roundsList.find(name => m.round_name?.includes(name)) || m.round_name;
               if (!matchesByRound[r]) matchesByRound[r] = [];
               matchesByRound[r].push(m);
           }
        });

        Object.values(matchesByRound).forEach(arr => arr.sort((a,b) => parseInt(a.bracket_index || a.match_number) - parseInt(b.bracket_index || b.match_number)));
        bronzeMatches.sort((a,b) => parseInt(a.bracket_index || a.match_number) - parseInt(b.bracket_index || b.match_number));

        const activeRounds = roundsList.filter(r => matchesByRound[r] && matchesByRound[r].length > 0);

        for (let rIdx = 1; rIdx < activeRounds.length; rIdx++) {
            const prevRound = matchesByRound[activeRounds[rIdx - 1]];
            const currRound = matchesByRound[activeRounds[rIdx]];
            
            for (let i = 0; i < currRound.length; i++) {
                if (prevRound[i * 2]) currRound[i]._origin_p1_match = prevRound[i * 2];
                if (prevRound[i * 2 + 1]) currRound[i]._origin_p2_match = prevRound[i * 2 + 1];
            }
        }
        
        if (bronzeMatches.length > 0 && activeRounds.includes('Semi-Final')) {
            const sfRound = matchesByRound['Semi-Final'];
            if (sfRound && sfRound.length >= 2) {
                bronzeMatches[0]._origin_p1_match = sfRound[0];
                bronzeMatches[0]._origin_p2_match = sfRound[1];
                bronzeMatches[0]._is_bronze = true;
            }
        }

        function resolveKnockoutPlayer(match, side) {
            const prefix1 = side === 1 ? 'entrant1' : 'entrant2';
            const prefix2 = side === 1 ? 'entrant_a' : 'entrant_b';
            const dbName = match[`${prefix1}_name`] || match[`${prefix2}_name`];
            
            if (String(dbName).toUpperCase().includes('BYE')) {
                return { id: null, name: 'BYE (Avança Direto)', bib: '--', clubFull: '', clubSigla: '', rampa: '', isBye: true, logo: null };
            }

            const eId = match[`${prefix1}_athlete_id`] || match[`${prefix1}_id`] || match[`${prefix2}_id`];
            if (eId) {
                const p = state.allPlayers.find(x => String(x.id) === String(eId));
                if (p) {
                    return {
                        id: p.id, name: p.nome || p.name, bib: p.bib || '--',
                        clubFull: p.clube_nome || p.clube_sigla || '', clubSigla: p.clube_sigla || p.clube_nome || '',
                        rampa: p.operador_rampa || '', isBye: false, logo: match[`${prefix1}_logo`] || match[`${prefix2}_logo`] || p.logo_url || null
                    };
                } else if (dbName && dbName !== 'A Definir' && !dbName.includes('Venc') && !dbName.includes('Perd')) {
                    return {
                        id: eId, name: dbName, bib: match[`${prefix1}_bib`] || match[`${prefix2}_bib`] || '--',
                        clubFull: match[`${prefix1}_club_sigla`] || match[`${prefix2}_club_sigla`] || '', clubSigla: match[`${prefix1}_club_sigla`] || match[`${prefix2}_club_sigla`] || '',
                        rampa: '', isBye: false, logo: match[`${prefix1}_logo`] || match[`${prefix2}_logo`] || null
                    };
                }
            }

            const originMatch = side === 1 ? match._origin_p1_match : match._origin_p2_match;
            if (originMatch) {
                const p1Origin = resolveKnockoutPlayer(originMatch, 1);
                const p2Origin = resolveKnockoutPlayer(originMatch, 2);

                let originWinnerId = originMatch.winner_entrant_id || originMatch.winner_id;
                const isOriginBye = originMatch.status === 'BYE' || (safeParse(originMatch.details || originMatch.match_details).is_wo === true && (p1Origin.isBye || p2Origin.isBye));
                
                if (originMatch.status === 'COMPLETED' || originMatch.status === 'BYE' || isOriginBye) {
                    if (!originWinnerId && (isOriginBye || originMatch.status === 'BYE')) {
                        originWinnerId = p1Origin.isBye ? p2Origin.id : p1Origin.id;
                    }

                    if (match._is_bronze) {
                        if (String(originWinnerId) === String(p1Origin.id)) return p2Origin;
                        if (String(originWinnerId) === String(p2Origin.id)) return p1Origin;
                    } else {
                        if (String(originWinnerId) === String(p1Origin.id)) return p1Origin;
                        if (String(originWinnerId) === String(p2Origin.id)) return p2Origin;
                    }
                }
            }

            return { id: null, name: 'A Definir', bib: '--', clubFull: 'AGUARDANDO DEFINIÇÃO', clubSigla: '', rampa: '', isBye: false, logo: null };
        }

        const allLinkedMatches = activeRounds.flatMap(r => matchesByRound[r]).concat(bronzeMatches);

        allLinkedMatches.forEach(dbM => {
            let rName = dbM.round_name || 'Desconhecida';
            if (rName.includes('16 avos')) rName = '16 avos de Final';
            if (rName.includes('Oitavas')) rName = 'Oitavas de Final';
            if (rName.includes('Quartas')) rName = 'Quartas de Final';
            if (rName.includes('3º')) rName = 'Disputa de 3º Lugar';
            if (!bracket[rName]) bracket[rName] = [];
            
            let p1 = resolveKnockoutPlayer(dbM, 1);
            let p2 = resolveKnockoutPlayer(dbM, 2);
            
            let s1 = dbM.score1 ?? dbM.score_a ?? '';
            let s2 = dbM.score2 ?? dbM.score_b ?? '';
            
            const det = safeParse(dbM.details || dbM.match_details);
            const isWO = det.is_wo === true;
            
            const isByePeaceful = (p1.isBye || p2.isBye) || dbM.status === 'BYE';
            let isCompleted = dbM.status === 'COMPLETED' || dbM.status === 'BYE' || isByePeaceful;
            
            let wId = dbM.winner_entrant_id || dbM.winner_id;
            if (isByePeaceful && !wId) {
                wId = p1.isBye ? p2.id : p1.id;
            }
            
            let is1Winner = isCompleted && !isByePeaceful && String(wId) === String(p1.id);
            let is2Winner = isCompleted && !isByePeaceful && String(wId) === String(p2.id);
            
            if (isCompleted && (isWO || isByePeaceful)) {
                if (isByePeaceful) {
                    s1 = ''; s2 = ''; 
                } else {
                    if (is1Winner) { s1 = 6; s2 = 0; }
                    else if (is2Winner) { s1 = 0; s2 = 6; }
                }
            }

            let shortCode = rName.substring(0, 3).toUpperCase();
            if (rName === 'Quartas de Final') shortCode = 'QF';
            if (rName === 'Semi-Final') shortCode = 'SF';
            if (rName === 'Oitavas de Final') shortCode = 'OIT';
            if (rName === '16 avos de Final') shortCode = '16V';
            if (rName === 'Final') shortCode = 'FIN';
            if (rName === 'Disputa de 3º Lugar') shortCode = 'DIS';
            
            bracket[rName].push({
                order: parseInt(dbM.bracket_index || dbM.match_number || 0), 
                match_number: dbM.match_number, 
                short: shortCode, dbId: dbM.id,
                p1: { entrantId: p1.id, name: escapeHTML(p1.name), club: escapeHTML(p1.clubSigla || '-'), filled: p1.id != null, score: s1, isWinner: is1Winner, isBye: p1.isBye, logo: p1.logo },
                p2: { entrantId: p2.id, name: escapeHTML(p2.name), club: escapeHTML(p2.clubSigla || '-'), filled: p2.id != null, score: s2, isWinner: is2Winner, isBye: p2.isBye, logo: p2.logo },
                isCompleted, isWO, isByePeaceful
            });
        });
        Object.keys(bracket).forEach(r => bracket[r].sort((a,b) => a.order - b.order));
    }
    return bracket;
  }

  function renderBracketSlotHtml(match) {
    let p1Class = match.p1.filled ? (match.p1.isWinner ? 'filled winner' : 'filled') : '';
    let p2Class = match.p2.filled ? (match.p2.isWinner ? 'filled winner' : 'filled') : '';
    
    if (match.p1.isBye) p1Class = 'filled is-bye-slot';
    if (match.p2.isBye) p2Class = 'filled is-bye-slot';

    if (match.isWO && !match.isByePeaceful) {
        if (!match.p1.isWinner && match.p2.isWinner) p1Class += ' wo-loser';
        if (!match.p2.isWinner && match.p1.isWinner) p2Class += ' wo-loser';
    }
    
    if (match.isByePeaceful) {
        p1Class = p1Class.replace('winner', '').trim();
        p2Class = p2Class.replace('winner', '').trim();
    }

    const dbIdAttr = match.dbId && !match.isByePeaceful ? `data-match-id="${match.dbId}" data-p1-id="${match.p1.entrantId || ''}" data-p2-id="${match.p2.entrantId || ''}" data-p1-name="${escapeHTML(match.p1.name)}" data-p2-name="${escapeHTML(match.p2.name)}"` : '';
    const clickStyle = match.isByePeaceful ? 'cursor: default; opacity: 0.9;' : (!match.dbId ? 'opacity: 0.6; cursor: not-allowed;' : 'cursor: pointer;');
    const titleText = match.isByePeaceful ? 'Avanço Automático (Sem Jogo)' : (!match.dbId ? 'Súmula não gerada' : 'Clique para abrir a súmula');
    
    let s1Html = match.p1.score !== undefined && match.p1.score !== '' ? match.p1.score : '';
    let s2Html = match.p2.score !== undefined && match.p2.score !== '' ? match.p2.score : '';

    if (match.isCompleted && !match.isWO && !match.isByePeaceful && match.p1.score === match.p2.score && match.p1.score !== '') {
        if (match.p1.isWinner) s1Html += ' <span style="font-size:10px; color:#16a34a; margin-left:3px;">(V)</span>';
        if (match.p2.isWinner) s2Html += ' <span style="font-size:10px; color:#16a34a; margin-left:3px;">(V)</span>';
    }

    const logoP1 = match.p1.logo ? `<img src="${match.p1.logo}" style="height: 12px; width: 18px; object-fit: contain; margin-right:4px;">` : '';
    const logoP2 = match.p2.logo ? `<img src="${match.p2.logo}" style="height: 12px; width: 18px; object-fit: contain; margin-right:4px;">` : '';

    const matchNumberDisplay = match.isByePeaceful ? '-' : (match.match_number || '-');
    const matchNumberHtml = `<div class="wb-bracket-number" style="${match.isByePeaceful ? 'opacity: 0.4;' : ''}">${matchNumberDisplay}</div>`;
    
    const noStubClass = (match.short === 'DIS') ? 'no-stub' : '';
    
    let shortCodeHtml = match.short ? `<div class="wb-bracket-shortcode">${match.short}</div>` : '';
    if (match.short === 'DIS') shortCodeHtml = `<div class="wb-bracket-shortcode" style="background:#fffbeb; color:#b45309; border-color:#fde68a;">${match.short}</div>`;

    return `
      <div class="wb-bracket-match ${noStubClass}" ${dbIdAttr} style="${clickStyle}" title="${titleText}">
        ${shortCodeHtml}
        ${matchNumberHtml}
        <div class="wb-bracket-slot ${p1Class}">
           <div style="display:flex; align-items:center; width: 35px; justify-content:center;">${logoP1}<div class="slot-circle" style="${logoP1 || match.p1.isBye ? 'display:none;' : ''}">${match.p1.club}</div></div>
           <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${match.p1.name}</div>
           <div class="slot-score">${s1Html}</div>
        </div>
        <div class="wb-bracket-slot ${p2Class}">
           <div style="display:flex; align-items:center; width: 35px; justify-content:center;">${logoP2}<div class="slot-circle" style="${logoP2 || match.p2.isBye ? 'display:none;' : ''}">${match.p2.club}</div></div>
           <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${match.p2.name}</div>
           <div class="slot-score">${s2Html}</div>
        </div>
      </div>
    `;
  }

  function renderDynamicKnockout(bracket) {
    if (!bracket) return ``;
    const roundsOrder = ['16 avos de Final', 'Oitavas de Final', 'Quartas de Final', 'Semi-Final', 'Final'];
    const activeRounds = roundsOrder.filter(r => bracket[r]);
    
    let html = `<div class="wb-bracket-container">`;
    activeRounds.forEach(round => {
      
      if (round === 'Final') {
          html += `<div class="wb-bracket-column" style="position: relative; min-width: 280px;">`;
          html += `<div class="wb-bracket-header">Final</div>`;
          
          if (bracket[round]) {
              html += `
                <div class="wb-bracket-matches-wrapper" style="position: absolute; top: 50%; left: 0; width: 100%; transform: translateY(-50%);">
                  ${bracket[round].map(m => renderBracketSlotHtml(m)).join('')}
                </div>
              `;
          }
          
          if (bracket['Disputa de 3º Lugar'] && bracket['Disputa de 3º Lugar'].length > 0) {
              html += `
                 <div style="position: absolute; top: 50%; left: 0; width: 100%; margin-top: 60px;">
                   <div class="wb-bracket-header" style="color: #b45309; text-transform: uppercase; font-size: 10px; margin-bottom: 8px;">Disputa de 3º Lugar</div>
                   ${bracket['Disputa de 3º Lugar'].map(m => { m.short = 'DIS'; return renderBracketSlotHtml(m); }).join('')}
                 </div>
              `;
          }
          
          html += `</div>`;
      } else {
          html += `<div class="wb-bracket-column">`;
          html += `<div class="wb-bracket-header">${round}</div>`;
          html += `<div class="wb-bracket-matches-wrapper">`;
          if (bracket[round]) html += bracket[round].map(m => renderBracketSlotHtml(m)).join('');
          html += `</div></div>`;
      }
      
    });
    html += `</div>`;

    return html;
  }

  function renderAllPools(standings) {
    if (!state.pools || state.pools.length === 0 || !Array.isArray(state.pools)) return ``;
    return state.pools.map((pool, index) => {
      const poolLetter = String.fromCharCode(65 + index); 
      let poolMatchData = null;
      
      for(const gm of state.groupMatches) {
          const arr = gm.matches || gm.data || [];
          
          const found = arr.find(pm => {
              const nameMatch = pm.pool_name && pool.name && String(pm.pool_name).toLowerCase() === String(pool.name).toLowerCase();
              const idMatch = pm.pool_id && pool.id && String(pm.pool_id) === String(pool.id);
              return nameMatch || idMatch;
          });
          
          if (found) { poolMatchData = found; break; }
      }

      const rounds = poolMatchData && poolMatchData.rounds ? poolMatchData.rounds : {};
      const players = pool.players || [];
      const sortedByBib = [...players].sort((a, b) => parseInt(a.bib, 10) - parseInt(b.bib, 10));

      return `
        <h2 class="wb-section-title">Grupo ${poolLetter}</h2>
        <div class="wb-table-wrapper"><table class="wb-table">
          <thead><tr>
            <th rowspan="2">#</th>
            <th rowspan="2" class="text-left">Atleta / Equipe</th>
            <th rowspan="2">Vitórias</th>
            <th rowspan="2">Saldo (Pts)</th>
            <th rowspan="2">Pró (Pts)</th>
            <th rowspan="2" style="color:#0d6efd; font-weight:800;">Parciais Venc.</th>
            <th rowspan="2">Saldo (Partida)</th>
            <th rowspan="2">Saldo (Parcial)</th>
            <th colspan="${sortedByBib.length}">Confronto Direto</th>
          </tr>
          <tr>${sortedByBib.map(op => `<th style="color: #475569;">${escapeHTML(op.bib)}</th>`).join('')}</tr></thead>
          <tbody>${players.map(p => `
            <tr><td><span class="wb-rank-badge">${p.rank || '-'}</span></td>
                <td class="text-left">
                  <div style="display:flex; align-items:center; gap: 12px;">
                    <div class="wb-bib-badge">${escapeHTML(p.bib)}</div>
                    <div>
                      <div class="wb-player-name">${escapeHTML(p.nome)}</div>
                      <div class="wb-club-name" style="display:flex; align-items:center; gap:6px;">
                        <span>${escapeHTML(p.clube_nome || p.clube_sigla || '-')}</span>
                        ${p.logo_url ? `<img src="${p.logo_url}" style="height: 12px; width: 18px; object-fit:contain; border-radius:2px;">` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td style="font-weight: bold; font-size: 14px; color: #2c3e50;">${p.wins || 0}</td>
                <td>${p.pointsDiff || 0}</td>
                <td>${p.pointsFor || 0}</td>
                <td style="font-weight: bold; font-size: 14px; color:#0d6efd;">${p.endsWon || 0}</td>
                <td>${p.pdiffMatch || 0}</td>
                <td>${p.pdiffEnd || 0}</td>
                ${sortedByBib.map(op => {
                   if (String(p.id) === String(op.id)) return `<td style="color: #cbd5e1; font-weight: bold;">-</td>`;
                   const rec = p.vsRecord ? p.vsRecord[op.id] : null;
                   if (rec) {
                     const oppRec = op.vsRecord[p.id] || { wins: 0, ptsDiff: 0, scoreStr: '0' };
                     let isW = rec.wins > oppRec.wins;
                     if (rec.wins === oppRec.wins) isW = rec.ptsDiff > 0;
                     const circleClass = isW ? 'vs-win' : (rec.wins === oppRec.wins && rec.ptsDiff === 0 ? 'vs-none' : 'vs-loss');
                     return `<td><div class="vs-circle ${circleClass}" style="width: auto; padding: 0 8px; border-radius: 12px;" title="${isW?'Vantagem':'Desvantagem'} no Confronto">${rec.scoreStr}</div></td>`;
                   }
                   return `<td><div class="vs-circle vs-none">-</div></td>`;
                }).join('')}
            </tr>`).join('')}</tbody></table></div>
        
        <h3 class="wb-subsection-title" style="margin-top: 40px;">Partidas do Grupo</h3>
        ${Object.keys(rounds).length === 0 ? `<p style="color: #7f8c8d; font-size: 13px;">Nenhuma partida encontrada.</p>` : ''}
        ${Object.keys(rounds).sort().map(roundName => `
          <div style="margin-bottom: 10px; color: #475569; font-size: 14px; font-weight: bold; text-transform: capitalize;">${escapeHTML(roundName).replace('Rodada', 'Round ')}</div>
          <div class="wb-matches-grid">
            ${rounds[roundName].map(match => renderGroupMatchCard(match, pool.maxDiffForWO)).join('')}
          </div>
        `).join('')}
      `;
    }).join('');
  }

  function renderGroupMatchCard(match, poolMaxDiff) {
    const isCompleted = match.status === 'COMPLETED'; 
    const isBye = match.status === 'SCHEDULED_WITH_BYE' || match.status === 'BYE' || !match.entrant2_id || !match.match_number;
    const details = safeParse(match.details || match.match_details);
    const isWO = details.is_wo === true;

    const p1 = getParticipantData(match, 1);
    const p2 = getParticipantData(match, 2);
    
    let finalS1 = match.score1 ?? match.score_entrant1 ?? match.score_a;
    let finalS2 = match.score2 ?? match.score_entrant2 ?? match.score_b;
    
    const isP1Winner = isCompleted && String(match.winner_entrant_id) === String(match.entrant1_id || match.entrant_a_id);
    const isP2Winner = isCompleted && !isBye && String(match.winner_entrant_id) === String(match.entrant2_id || match.entrant_b_id);

    if (isCompleted && isWO) {
       if (isP1Winner) { finalS1 = poolMaxDiff || 6; finalS2 = 0; }
       else if (isP2Winner) { finalS1 = 0; finalS2 = poolMaxDiff || 6; }
    }

    let dispS1 = finalS1;
    let dispS2 = finalS2;

    if (isCompleted && !isWO && finalS1 === finalS2) {
        if (isP1Winner) dispS1 = `${finalS1} <span style="font-size:9px; font-weight:900; color:#16a34a;">(V)</span>`;
        if (isP2Winner) dispS2 = `${finalS2} <span style="font-size:9px; font-weight:900; color:#16a34a;">(V)</span>`;
    }

    let mPs = [ { ...p1, score: dispS1, isWinner: isP1Winner }, { ...p2, score: dispS2, isWinner: isP2Winner } ];

    mPs.sort((a, b) => {
        if (a.isBye) return 1; if (b.isBye) return -1;
        const bA = parseInt(a.bib, 10); const bB = parseInt(b.bib, 10);
        if (isNaN(bA) && isNaN(bB)) return 0; if (isNaN(bA)) return 1; if (isNaN(bB)) return -1;
        return bA - bB;
    });
    
    const renderRow = (p) => {
      const isWOLoser = isCompleted && isWO && !p.isWinner && match.winner_entrant_id && !p.isBye;
      const playerClass = `wb-match-player ${p.isWinner ? 'winner' : ''} ${isWOLoser ? 'wo-loser' : ''} ${p.isBye ? 'is-bye' : ''}`;
      const nameStr = `<div class="wb-match-name">${escapeHTML(p.name).toUpperCase()}</div>${p.rampa ? `<div style="font-size:9px; color:#fca5a5; text-transform:none;">Op: ${escapeHTML(p.rampa)}</div>` : ''}`;
      const logoTag = p.logo ? `<img src="${p.logo}" style="height: 12px; width: 18px; object-fit: contain; border-radius: 2px;">` : '';

      return `
        <div class="${playerClass}">
          <div class="wb-match-player-info">
            <span class="wb-match-bib">${escapeHTML(p.bib)}</span>
            <div style="display:flex; flex-direction:column;">
              ${nameStr}
              <div style="display:flex; align-items:center; gap:4px; margin-top:2px;">
                 <span style="font-size:9px; color:#64748b; font-weight:bold;">${escapeHTML(p.clubSigla)}</span>
                 ${logoTag}
              </div>
            </div>
          </div>
          <div class="wb-match-score">${isCompleted && !p.isBye ? p.score : '-'}</div>
        </div>`;
    };

    return `<div class="wb-match-wrapper" data-match-id="${match.id}" data-is-bye="${isBye}"><div class="wb-match-number">${isBye ? '-' : (match.match_number || '-')}</div><div class="wb-match-content">${renderRow(mPs[0])}${renderRow(mPs[1])}</div></div>`;
  }

  function render() {
    calculatePenalties(); 
    const standings = calculatePoolStandings();

    let maxMatchNumber = 0;
    state.groupMatches.forEach(gm => { 
        const arr = gm.matches || gm.data || [];
        arr.forEach(pm => Object.values(pm.rounds || {}).flat().forEach(m => { 
            const num = parseInt(m.match_number, 10); if (!isNaN(num) && num > maxMatchNumber) maxMatchNumber = num; 
        })); 
    });

    if (maxMatchNumber === 0) {
      const code = String(classCode).toUpperCase();
      if (code.includes('BC1F')) maxMatchNumber = 100; else if (code.includes('BC1M')) maxMatchNumber = 200; else if (code.includes('BC2F')) maxMatchNumber = 300; else if (code.includes('BC2M')) maxMatchNumber = 400; else if (code.includes('BC3F')) maxMatchNumber = 500; else if (code.includes('BC3M')) maxMatchNumber = 600; else if (code.includes('BC4F')) maxMatchNumber = 700; else if (code.includes('BC4M')) maxMatchNumber = 800; else if (code.includes('TEAM') || code.includes('EQUIPE')) maxMatchNumber = 900; else maxMatchNumber = 100;
    }

    const flatKOMatches = state.koMatches.flatMap(km => km.matches || km.data || []);
    const allPoolsFinished = state.pools.length > 0 && Object.keys(standings).length > 0 && Object.values(standings).every(p => p.isFinished);
    
    let isClassFinished = false;
    
    if (flatKOMatches.length > 0) {
        const finalsMatches = flatKOMatches.filter(m => m.round_name === 'Final' || m.round === 'Final');
        const bronzeMatches = flatKOMatches.filter(m => m.round_name === 'Disputa de 3º Lugar' || String(m.round_name).includes('3º'));
        const semiMatches = flatKOMatches.filter(m => String(m.round_name).includes('Semi') || String(m.round).includes('Semi'));
        
        if (finalsMatches.length > 0) {
            const finalCompleted = finalsMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE');
            let bronzeCompleted = true;
            if (semiMatches.length > 0) {
                bronzeCompleted = bronzeMatches.length > 0 && bronzeMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE');
            }
            isClassFinished = finalCompleted && bronzeCompleted;
        }
    } else if (allPoolsFinished) {
        isClassFinished = true;
    }

    let placementHtml = '';
    if (isClassFinished) {
      const finalRanking = calculateFinalRanking(standings, state.koMatches, state.allPlayers);
      
      if (finalRanking.length > 0) {
          placementHtml = `
            <h2 class="wb-section-title" style="margin-top: 0;">Classificação Final</h2>
            <div class="wb-table-wrapper">
              <table class="wb-table">
                <thead>
                  <tr>
                    <th style="width: 80px;">Posição</th>
                    <th class="text-left">Atleta / Equipe</th>
                    <th>Fase Alcançada</th>
                  </tr>
                </thead>
                <tbody>
                  ${finalRanking.map(p => {
                    const logoHtml = p.logo_url ? `<img src="${p.logo_url}" style="height: 18px; width: 28px; object-fit: contain; border-radius: 2px;">` : '';
                    return `
                    <tr>
                      <td><span class="wb-rank-badge ${p.finalPosition === 1 ? 'medal-1' : p.finalPosition === 2 ? 'medal-2' : p.finalPosition === 3 ? 'medal-3' : ''}" style="font-size: 14px; padding: 6px 12px;">${p.finalPosition}º</span></td>
                      <td class="text-left">
                        <div style="display:flex; align-items:center; gap: 12px;">
                          <div class="wb-bib-badge">${escapeHTML(p.bib)}</div>
                          <div>
                            <div class="wb-player-name">${escapeHTML(p.nome)}</div>
                            ${p.operador_rampa ? `<div style="font-size:9px; color:#fca5a5;">Op: ${escapeHTML(p.operador_rampa)}</div>` : ''}
                            <div class="wb-club-name" style="display:flex; align-items:center; gap:6px;">
                               <span>${escapeHTML(p.clube_nome || p.clube_sigla || '-')}</span>
                               ${logoHtml}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><span style="color: #64748b; font-weight: bold; font-size: 12px; text-transform: uppercase;">${p.phase}</span></td>
                    </tr>
                  `}).join('')}
                </tbody>
              </table>
            </div>
          `;
      }
    }

    let knockoutHtml = '';
    const dynamicBracket = generateDynamicBracket(standings, state.pools.length || 0, maxMatchNumber + 1);
    
    if (Object.keys(dynamicBracket).length > 0) {
        knockoutHtml = `
            <h2 class="wb-section-title">Eliminatórias (Mata-Mata)</h2>
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 50px;">
                ${renderDynamicKnockout(dynamicBracket)}
            </div>
        `;
    } else if (state.pools.length > 0) {
        knockoutHtml = `
            <h2 class="wb-section-title">Eliminatórias (Mata-Mata)</h2>
            <p style="text-align:center; padding: 20px; color:#64748b; font-style:italic;">A fase de Mata-Mata não foi gerada no sorteio para esta classe.</p>
        `;
    }

    const styles = `
      <style>
        .wb-container { max-width: 1400px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
        .wb-class-header { display: flex; align-items: center; gap: 15px; margin-bottom: 30px; border-bottom: 2px solid #eaeaea; padding-bottom: 15px; }
        .wb-class-badge { background-color: ${state.colors.bg}; color: ${state.colors.fg}; padding: 6px 15px; border-radius: 6px; font-size: 24px; font-weight: bold; }
        .wb-section-title { font-size: 22px; color: #2c3e50; margin: 40px 0 20px 0; font-weight: 600; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .wb-table-wrapper { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow-x: auto; margin-bottom: 30px; border: 1px solid #f0f0f0; }
        .wb-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .wb-table th { background: #f8f9fa; color: #6c757d; font-weight: 600; text-transform: uppercase; font-size: 11px; padding: 12px 15px; text-align: center; border-bottom: 1px solid #eaeaea; }
        .wb-table td { padding: 12px 15px; text-align: center; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
        .text-left { text-align: left !important; }
        .wb-rank-badge { background: #e9ecef; color: #495057; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
        .wb-bib-badge { background-color: #eff6ff; color: #3b82f6; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: bold; font-size: 11px; flex-shrink: 0; }
        .wb-player-name { font-weight: 600; color: #2c3e50; font-size: 14px; }
        .wb-club-name { font-size: 11px; color: #888; margin-top: 2px; text-transform: uppercase; }
        
        .medal-1 { background-color: #fbbf24 !important; color: #fff !important; }
        .medal-2 { background-color: #94a3b8 !important; color: #fff !important; }
        .medal-3 { background-color: #b45309 !important; color: #fff !important; }

        .vs-circle { display: flex; justify-content: center; align-items: center; height: 26px; font-size: 11px; font-weight: bold; color: white; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .vs-none { background-color: #e2e8f0; color: #94a3b8; box-shadow: none; font-size: 12px; width: 22px; border-radius: 50%; }
        .vs-win { background-color: #22c55e; } 
        .vs-loss { background-color: #ef4444; }

        .wb-matches-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .wb-match-wrapper { display: flex; align-items: center; gap: 15px; cursor: pointer; } 
        .wb-match-number { width: 44px; height: 44px; border-radius: 50%; background-color: #cbd5e1; color: #1e293b; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0; }
        .wb-match-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
        .wb-match-player { background-color: #e2e8f0; border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; height: 44px; box-sizing: border-box; }
        .wb-match-player-info { display: flex; align-items: center; gap: 12px; }
        .wb-match-bib { background-color: #ffffff; color: #334155; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 4px; min-width: 38px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .wb-match-name { font-size: 12px; color: #0f172a; font-weight: 600; text-transform: uppercase; }
        .wb-match-score { width: 26px; height: 26px; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 13px; border-radius: 4px; background-color: #ffffff; border: 1px solid #cbd5e1; color: #334155; }
        
        .wb-match-player.wo-loser { background-color: #1e293b !important; border: 1px solid #0f172a !important; }
        .wb-match-player.wo-loser .wb-match-name { color: #64748b; text-decoration: line-through; }
        .wb-match-player.wo-loser .wb-match-score { background-color: #0f172a; color: #ef4444; border-color: #0f172a; }
        .wb-match-player.wo-loser .wb-match-bib { background-color: #334155; color: #94a3b8; border: none; box-shadow: none; }
        
        .wb-match-score.empty { color: transparent; background: transparent; border: none; }
        .wb-match-player.winner { background-color: #dcfce7; }
        .wb-match-player.winner .wb-match-score { background-color: #2ecc71; color: white; border-color: #2ecc71; }
        .wb-match-player.winner .wb-match-name { color: #166534; }
        .wb-match-player.is-bye { background-color: #f1f5f9; opacity: 0.7; cursor: default; }
        .wb-match-player.is-bye .wb-match-bib { background-color: transparent; box-shadow: none; border: 1px dashed #94a3b8; color: #64748b; }
        
        .wb-bracket-container { display: flex; gap: 20px; overflow-x: auto; padding: 20px 0 140px 40px; align-items: stretch; background: #f8fafc; }
        
        .wb-bracket-column { display: flex; flex-direction: column; min-width: 250px; flex: 1; gap: 10px; }
        .wb-bracket-header { text-align: center; font-size: 11px; color: #94a3b8; font-style: italic; margin-bottom: 5px; text-transform: uppercase; font-weight: bold; height: 15px; }
        .wb-bracket-matches-wrapper { display: flex; flex-direction: column; justify-content: space-around; flex: 1; gap: 10px; }
        
        .wb-bracket-match { position: relative; display: flex; flex-direction: column; margin-left: 20px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); width: 280px; }
        .wb-bracket-number { position: absolute; left: -26px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; border-radius: 50%; background-color: #cbd5e1; color: #1e293b; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; }
        
        .wb-bracket-shortcode { position: absolute; left: -38px; top: -14px; background: #eff6ff; color: #2563eb; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; border: 1px solid #bfdbfe; white-space: nowrap; z-index: 2; }

        .wb-bracket-slot { padding: 6px 10px; display: flex; align-items: center; gap: 8px; height: 38px; font-size: 12px; color: #64748b; }
        .wb-bracket-slot:first-child { border-bottom: 1px solid #e2e8f0; border-radius: 6px 6px 0 0; }
        .wb-bracket-slot:last-child { border-radius: 0 0 6px 6px; }

        .wb-bracket-slot.winner { background-color: #dcfce7; border-left: 4px solid #16a34a; color: #166534; font-weight: 500; }
        .wb-bracket-slot.filled:not(.winner) { border-left: 3px solid ${state.colors.bg}; color: #0f172a; font-weight: 600; }
        .slot-circle { width: 20px; height: 16px; background: #e2e8f0; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #475569; font-weight: bold; flex-shrink: 0; }
        .filled .slot-circle { background: #f1f5f9; border: 1px solid #cbd5e1; }
        .winner .slot-circle { background: #22c55e; color: white; border-color: #16a34a; }
        .slot-score { font-weight: bold; font-size: 13px; margin-left: auto; }
        
        .wb-bracket-slot.wo-loser { background-color: #1e293b !important; border-color: #0f172a !important; border-left: 4px solid #0f172a !important; color: #64748b !important; text-decoration: line-through; }
        .wb-bracket-slot.wo-loser .slot-circle { background-color: #334155 !important; color: #94a3b8 !important; border: none !important; }
        .wb-bracket-slot.wo-loser .slot-score { color: #ef4444 !important; }

        .wb-bracket-slot.is-bye-slot { background-color: #f8fafc !important; border-left: 3px solid #cbd5e1 !important; color: #94a3b8 !important; }
        .wb-bracket-slot.is-bye-slot .slot-circle { background-color: transparent !important; color: transparent !important; border: none !important; }
        .wb-bracket-slot.is-bye-slot .slot-score { display: none; }

        .wb-bracket-match::after { content: ''; position: absolute; right: -15px; top: 50%; width: 15px; border-top: 2px solid #cbd5e1; }
        .wb-bracket-column:last-child .wb-bracket-match::after { display: none; }
        .wb-bracket-match.no-stub::after { display: none !important; }

        .sumula-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 1000; display: flex; justify-content: center; align-items: center; padding: 10px; }
        .sumula-modal-content { background: white; border-radius: 12px; width: 100%; max-width: 850px; max-height: 98vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.2); font-family: sans-serif; position: relative; }
        .sumula-header { padding: 15px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: white; z-index: 10; }
        .sumula-teams-row { display: flex; position: relative; margin-bottom: 5px; align-items: center; }
        .team-panel { flex: 1; padding: 20px 10px; text-align: center; display: flex; flex-direction: column; align-items: center; min-width: 0; }
        .team-name { font-weight: bold; font-size: 15px; color: #0f172a; margin-bottom: 4px; max-width: 250px; word-wrap: break-word; overflow-wrap: break-word; }
        .team-club { font-size: 10px; color: #475569; margin-bottom: 12px; text-transform: uppercase; font-weight: 500; max-width: 250px; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.2; }
        .sumula-big-score { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: white; padding: 10px 25px; border-radius: 12px; font-size: 42px; font-weight: 300; color: #1e293b; letter-spacing: -2px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; z-index: 10; white-space: nowrap; }
        .s-row { display: flex; position: relative; width: 100%; border-bottom: 1px solid #cbd5e1; }
        .s-half { flex: 1; display: flex; align-items: center; padding: 8px 10px; }
        .s-half.left { justify-content: flex-end; gap: 10px; padding-right: 25px; }
        .s-half.right { justify-content: flex-start; gap: 10px; padding-left: 25px; }
        .bg-red { background-color: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
        .bg-blue { background-color: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
        .s-row.is-data:nth-child(even) .bg-red { background-color: #fca5a5; }
        .s-row.is-data:nth-child(even) .bg-blue { background-color: #dbeafe; }
        
        .s-input { border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-size: 14px; height: 32px; width: 65px; background: white; }
        .s-input:disabled { background: transparent; border-color: transparent; color: inherit; font-weight: bold; appearance: none; -webkit-appearance: none; opacity: 1; }
        
        .s-center-pill { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: white; padding: 4px 14px; border-radius: 16px; border: 1px solid #94a3b8; font-weight: bold; font-size: 14px; z-index: 2; }
        .sumula-bottom-grid { display: flex; width: 100%; align-items: stretch; }
        .viol-box { flex: 1; padding: 15px; display: flex; flex-direction: column; align-items: center; gap: 10px; border-bottom: 1px solid #cbd5e1; position: relative; }
        .sumula-footer-card { background: #f8fafc; border-top: 1px solid #cbd5e1; padding: 15px 20px; display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between; align-items: center; }
        .sumula-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 15px 20px; border-top: 1px solid #eee; }
        
        .team-select { padding: 6px 12px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1); font-size: 13px; font-weight: bold; outline: none; cursor: pointer; background: white; }
        .team-select:disabled { cursor: default; background: transparent; border: none; padding: 0; appearance: none; -webkit-appearance: none; }
        
        .badge-color { display: inline-block; padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: bold; border: 1px solid rgba(0,0,0,0.1); background: white; }
        .s-label-col { width: 70px; text-align: center; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; }
        .viol-title { font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 0; text-align: center; width: 100%; }
        .btn-action { background: rgba(0,0,0,0.4); color: white; border: none; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: bold; cursor: pointer; }
        .footer-col { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 250px; }
        .footer-label { font-size: 12px; font-weight: bold; color: #475569; text-transform: uppercase; }
        .s-input.full-width { width: 100%; height: 34px; text-align: left; padding: 0 10px; }
        .radio-group { display: flex; gap: 15px; background: white; border: 1px solid #cbd5e1; padding: 8px 15px; border-radius: 4px; align-items: center; height: 34px; }
        .s-input.inline { width: auto; height: 30px; display: inline-block; margin-left: 10px; }
        .btn-reset { background-color: #64748b; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
        .btn-save-match { background-color: #0d6efd; color: white; border: none; padding: 10px 30px; border-radius: 6px; font-weight: bold; cursor: pointer; }
        
        .viol-list { width: 100%; display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
        .viol-item { background: rgba(255,255,255,0.8); border: 1px solid rgba(0,0,0,0.1); border-radius: 4px; padding: 6px 10px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; text-align:left; line-height: 1.3;}
        .viol-item-text { font-weight: 500; color: #1e293b; }
        .viol-del { cursor: pointer; color: #ef4444; font-weight: bold; background: none; border: none; font-size: 14px; }
        .viol-submodal { display: none; position: absolute; top: 40px; left: 50%; transform: translateX(-50%); background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 100; width: 320px; }
        .viol-submodal.active { display: block; }
        .v-select { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; margin-bottom: 10px; }
      </style>
    `;

    root.innerHTML = `${styles}
      <div class="wb-container">
        <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;"><button class="btn btn-outline-secondary" onclick="window.history.back()">← Voltar</button></div>
        <div class="wb-class-header"><div class="wb-class-badge">${escapeHTML(classCode)}</div><h1 style="margin:0; font-size:24px;">Visão Geral da Classe</h1></div>
        ${placementHtml}
        ${renderAllPools(standings)}
        ${knockoutHtml}
      </div>
      <div id="match-modal-container"></div>
    `;

    bindEvents();
  }

  function bindEvents() {
    root.querySelectorAll('.wb-match-wrapper').forEach(card => {
      card.addEventListener('click', () => { if (card.dataset.isBye !== 'true') { const m = findMatchById(card.dataset.matchId); if (m) openScoreModal(m); } });
    });
    
    root.querySelectorAll('.wb-bracket-match').forEach(card => {
      card.addEventListener('click', () => {
        if (!card.dataset.matchId || card.style.cursor !== 'pointer') return;
        const matchId = card.dataset.matchId;
        const p1Id = card.dataset.p1Id;
        const p2Id = card.dataset.p2Id;
        const p1Name = card.dataset.p1Name;
        const p2Name = card.dataset.p2Name;
        if (matchId) { 
            const m = findMatchById(matchId); 
            if (m) openScoreModal(m, p1Id, p2Id, p1Name, p2Name); 
        } 
      });
    });
  }

  function findMatchById(matchId) {
    for (const gm of state.groupMatches) { 
        const arr = gm.matches || gm.data || [];
        for(const pool of arr) {
            for (const round of Object.values(pool.rounds || {})) { 
                const m = round.find(x => String(x.id) === String(matchId)); 
                if (m) return m; 
            } 
        }
    }
    for (const km of state.koMatches) {
        const arr = km.matches || km.data || [];
        const m = arr.find(x => String(x.id) === String(matchId));
        if (m) return m;
    }
    return null;
  }

  function openScoreModal(match, dynamicP1Id = null, dynamicP2Id = null, p1Placeholder = null, p2Placeholder = null) {
    
    const hasEditAccess = canEditMatch;

    const p1 = getParticipantData(match, 1, dynamicP1Id);
    const p2 = getParticipantData(match, 2, dynamicP2Id);

    if ((p1.name === 'A Definir' || p1.name === 'BYE') && p1Placeholder && p1Placeholder !== 'TBD') {
        p1.name = p1Placeholder; p1.clubFull = 'AGUARDANDO DEFINIÇÃO';
    }
    if ((p2.name === 'A Definir' || p2.name === 'BYE') && p2Placeholder && p2Placeholder !== 'TBD') {
        p2.name = p2Placeholder; p2.clubFull = 'AGUARDANDO DEFINIÇÃO';
    }

    const pDs = safeParse(match.details || match.match_details);
    const p1P = pDs.p1_partials || []; const p2P = pDs.p2_partials || []; 
    const p1T = pDs.p1_times || []; const p2T = pDs.p2_times || []; 
    const isWO = pDs.is_wo || false;
    
    let p1Violations = pDs.p1_violations || [];
    let p2Violations = pDs.p2_violations || [];
    
    const p1TotalY = state.penalties[p1.id]?.yellow || 0;
    const p2TotalY = state.penalties[p2.id]?.yellow || 0;
    const p1LocalY = p1Violations.filter(v => v.includes('Cartão Amarelo') || v.includes('Amarelo')).length;
    const p2LocalY = p2Violations.filter(v => v.includes('Cartão Amarelo') || v.includes('Amarelo')).length;

    const p1PreviousY = match.status === 'COMPLETED' ? Math.max(0, p1TotalY - p1LocalY) : p1TotalY;
    const p2PreviousY = match.status === 'COMPLETED' ? Math.max(0, p2TotalY - p2LocalY) : p2TotalY;
    
    const s1V = match.score1 ?? match.score_entrant1 ?? match.score_a ?? 0; 
    const s2V = match.score2 ?? match.score_entrant2 ?? match.score_b ?? 0;

    const violOptionsHtml = VIOLATIONS_DICT.map(group => `<optgroup label="${group.group}">${group.rules.map(r => `<option value="${r.code}|${r.text}|${group.penalty}">${r.code} - ${r.text}</option>`).join('')}</optgroup>`).join('');
    const eligibleReferees = state.officials.filter(o => o.role === 'Árbitro' || o.role === 'Cursista');
    const inputState = hasEditAccess ? '' : 'disabled="disabled" readonly';
    const hideIfNotAdmin = hasEditAccess ? '' : 'style="display: none;"';

    const logoP1 = p1.logo ? `<img src="${p1.logo}" style="height: 35px; max-width: 60px; object-fit: contain; margin-bottom: 5px; border-radius: 4px;">` : '';
    const logoP2 = p2.logo ? `<img src="${p2.logo}" style="height: 35px; max-width: 60px; object-fit: contain; margin-bottom: 5px; border-radius: 4px;">` : '';

    const modalHtml = `
      <div class="sumula-modal-overlay" id="sumula-modal">
        <div class="sumula-modal-content">
          <div class="sumula-header">
             <h3 class="sumula-title">Resultado do Jogo ${match.match_number || '-'}</h3>
             <button class="btn-close-modal" id="close-sumula" style="font-size:24px; border:none; background:none; cursor:pointer;">&times;</button>
          </div>
          <div class="sumula-teams-row">
            <div class="team-panel bg-red js-panel-left">
              ${logoP1}
              <div class="team-name">(${p1.bib}) ${escapeHTML(p1.name)} <span id="p1-modal-badges"></span></div>
              ${p1.rampa ? `<div style="font-size:11px; color:#fca5a5; margin-bottom:4px;">Op: ${escapeHTML(p1.rampa)}</div>` : ''}
              <div class="team-club">${escapeHTML(p1.clubFull)}</div>
              <select class="team-select" id="color-select-left" ${inputState}><option value="bg-red" selected>Cor: Vermelho</option><option value="bg-blue">Cor: Azul</option></select>
            </div>
            <div class="team-panel bg-blue js-panel-right">
              ${logoP2}
              <div class="team-name">(${p2.bib}) ${escapeHTML(p2.name)} <span id="p2-modal-badges"></span></div>
              ${p2.rampa ? `<div style="font-size:11px; color:#93c5fd; margin-bottom:4px;">Op: ${escapeHTML(p2.rampa)}</div>` : ''}
              <div class="team-club">${escapeHTML(p2.clubFull)}</div>
              <div class="badge-color" id="badge-right">Cor: Azul</div>
            </div>
            <div class="sumula-big-score" id="big-score">${s1V} <span>x</span> ${s2V}</div>
          </div>
          <div style="display: flex; flex-direction: column; width: 100%;">
            <div class="s-row" style="background:#f8f9fa;"><div class="s-half left bg-red"><div class="s-label-col">Tempo</div><div class="s-label-col">Pontos</div></div><div class="s-half right bg-blue"><div class="s-label-col">Pontos</div><div class="s-label-col">Tempo</div></div><div class="s-center-pill header" style="border:none; background:transparent;">Parcial</div></div>
            ${[1, 2, 3, 4].map((i, idx) => `
            <div class="s-row is-data">
                <div class="s-half left js-panel-left bg-red">
                    <input class="s-input time side-time" placeholder="mm:ss" maxlength="5" value="${p1T[idx] !== undefined && p1T[idx] !== null ? p1T[idx] : ''}" ${inputState}>
                    <input class="s-input score side-score" min="0" type="number" value="${p1P[idx] !== undefined && p1P[idx] !== null ? p1P[idx] : ''}" ${inputState}>
                </div>
                <div class="s-half right js-panel-right bg-blue">
                    <input class="s-input score side-score" min="0" type="number" value="${p2P[idx] !== undefined && p2P[idx] !== null ? p2P[idx] : ''}" ${inputState}>
                    <input class="s-input time side-time" placeholder="mm:ss" maxlength="5" value="${p2T[idx] !== undefined && p2T[idx] !== null ? p2T[idx] : ''}" ${inputState}>
                </div>
                <div class="s-center-pill">${i}º</div>
            </div>`).join('')}
            <div class="s-row" style="height: 25px;"><div class="s-half left js-panel-left bg-red"></div><div class="s-half right js-panel-right bg-blue"></div><div class="s-center-pill header" style="font-size: 11px;">Tie Break</div></div>
            ${[1, 2].map((i, idx) => `
            <div class="s-row is-data">
                <div class="s-half left js-panel-left bg-red">
                    <input class="s-input time side-time tb" placeholder="mm:ss" maxlength="5" value="${p1T[idx+4] !== undefined && p1T[idx+4] !== null ? p1T[idx+4] : ''}" ${inputState}>
                    <input class="s-input score side-score tb" min="0" type="number" value="${p1P[idx+4] !== undefined && p1P[idx+4] !== null ? p1P[idx+4] : ''}" ${inputState}>
                </div>
                <div class="s-half right js-panel-right bg-blue">
                    <input class="s-input score side-score tb" min="0" type="number" value="${p2P[idx+4] !== undefined && p2P[idx+4] !== null ? p2P[idx+4] : ''}" ${inputState}>
                    <input class="s-input time side-time tb" placeholder="mm:ss" maxlength="5" value="${p2T[idx+4] !== undefined && p2T[idx+4] !== null ? p2T[idx+4] : ''}" ${inputState}>
                </div>
                <div class="s-center-pill tb">TB ${i}º</div>
            </div>`).join('')}
          </div>
          <div class="sumula-bottom-grid">
            <div class="viol-box js-panel-left bg-red" style="border-right: 1px solid #cbd5e1;">
                <h4 class="viol-title">Violações</h4>
                <button class="btn-action btn-add-viol" data-side="p1" ${hideIfNotAdmin}>+ Adicionar Violação</button>
                <div class="viol-list" id="p1-viol-list"></div>
                <div class="viol-submodal" id="p1-viol-modal">
                    <select class="v-select" id="p1-viol-end">
                      <option value="CC">Câmara de Chamada (CC)</option>
                      <option value="1º P">1º Parcial</option>
                      <option value="2º P">2º Parcial</option>
                      <option value="3º P">3º Parcial</option>
                      <option value="4º P">4º Parcial</option>
                      <option value="TB">Tie Break</option>
                    </select>
                    <select class="v-select" id="p1-viol-rule"><option value="">-- Selecione a Violação --</option>${violOptionsHtml}</select>
                    <div style="display:flex; gap:10px; justify-content:center;"><button class="btn-action v-cancel" data-side="p1" style="background:#64748b;">Cancelar</button><button class="btn-action v-confirm" data-side="p1" style="background:#0d6efd;">Salvar Falta</button></div>
                </div>
            </div>
            <div class="viol-box js-panel-right bg-blue">
                <h4 class="viol-title">Violações</h4>
                <button class="btn-action btn-add-viol" data-side="p2" ${hideIfNotAdmin}>+ Adicionar Violação</button>
                <div class="viol-list" id="p2-viol-list"></div>
                <div class="viol-submodal" id="p2-viol-modal">
                    <select class="v-select" id="p2-viol-end">
                      <option value="CC">Câmara de Chamada (CC)</option>
                      <option value="1º P">1º Parcial</option>
                      <option value="2º P">2º Parcial</option>
                      <option value="3º P">3º Parcial</option>
                      <option value="4º P">4º Parcial</option>
                      <option value="TB">Tie Break</option>
                    </select>
                    <select class="v-select" id="p2-viol-rule"><option value="">-- Selecione a Violação --</option>${violOptionsHtml}</select>
                    <div style="display:flex; gap:10px; justify-content:center;"><button class="btn-action v-cancel" data-side="p2" style="background:#64748b;">Cancelar</button><button class="btn-action v-confirm" data-side="p2" style="background:#0d6efd;">Salvar Falta</button></div>
                </div>
            </div>
          </div>
          <div class="sumula-footer-card">
            <div class="footer-col">
              <label class="footer-label">Árbitro Principal</label>
              <select class="s-input full-width" id="match-referee-select" ${inputState}>
                <option value="">-- Selecione o Árbitro --</option>
                ${eligibleReferees.map(o => `<option value="${o.referee_id || o.id}" ${String(match.referee_id) === String(o.referee_id || o.id) ? 'selected' : ''}>${escapeHTML(o.nome_completo || o.nome)}</option>`).join('')}
              </select>
            </div>
            <div class="footer-col"><label class="footer-label">Forfeit / W.O.</label><div class="radio-group" style="${!hasEditAccess ? 'background:transparent; border:none;' : ''}">
                <label><input type="radio" name="match_status" value="NORMAL" ${!isWO ? 'checked' : ''} ${inputState}> Normal</label>
                <label><input type="radio" name="match_status" value="WO" ${isWO ? 'checked' : ''} ${inputState}> W.O.</label>
                <select class="s-input inline" id="wo-winner-select" ${!isWO || !hasEditAccess ? 'disabled' : ''}><option value="">- Vencedor -</option><option value="${p1.id}" ${String(match.winner_entrant_id) === String(p1.id) ? 'selected' : ''}>${escapeHTML(p1.name)}</option><option value="${p2.id}" ${String(match.winner_entrant_id) === String(p2.id) ? 'selected' : ''}>${escapeHTML(p2.name)}</option></select>
            </div></div>
          </div>
          <div class="sumula-actions" ${hideIfNotAdmin}><button class="btn-reset">Limpar</button><button class="btn-save-match">Salvar Súmula</button></div>
        </div>
      </div>
    `;

    document.getElementById('match-modal-container').innerHTML = modalHtml;
    const modal = document.getElementById('sumula-modal');
    document.getElementById('close-sumula').onclick = () => modal.remove();

    if(hasEditAccess) {
        modal.querySelectorAll('.time').forEach(input => {
            input.addEventListener('input', function(e) {
                let val = e.target.value.replace(/\D/g, ''); 
                if (val.length > 4) val = val.slice(0, 4); 
                if (val.length >= 3) {
                    e.target.value = val.slice(0, 2) + ':' + val.slice(2);
                } else {
                    e.target.value = val;
                }
            });
        });
    }

    function renderViolations() {
        document.getElementById('p1-viol-list').innerHTML = p1Violations.map((v, idx) => `<div class="viol-item"><span class="viol-item-text">${v.split(' | ')[0]}</span>${hasEditAccess ? `<button class="viol-del" data-side="p1" data-idx="${idx}">&times;</button>` : ''}</div>`).join('');
        document.getElementById('p2-viol-list').innerHTML = p2Violations.map((v, idx) => `<div class="viol-item"><span class="viol-item-text">${v.split(' | ')[0]}</span>${hasEditAccess ? `<button class="viol-del" data-side="p2" data-idx="${idx}">&times;</button>` : ''}</div>`).join('');
        
        if(hasEditAccess) {
          modal.querySelectorAll('.viol-del').forEach(btn => {
              btn.onclick = (e) => {
                  const side = e.target.dataset.side; const idx = e.target.dataset.idx;
                  if (side === 'p1') p1Violations.splice(idx, 1); else p2Violations.splice(idx, 1);
                  renderViolations();
              };
          });
        }

        const curP1_Y = p1Violations.filter(v => v.includes('Cartão Amarelo') || v.includes('Amarelo')).length;
        const curP2_Y = p2Violations.filter(v => v.includes('Cartão Amarelo') || v.includes('Amarelo')).length;
        const curP1_R = p1Violations.filter(v => v.includes('Cartão Vermelho') || v.includes('Desqualificação') || v.includes('WO') || v.includes('Forfeit')).length;
        const curP2_R = p2Violations.filter(v => v.includes('Cartão Vermelho') || v.includes('Desqualificação') || v.includes('WO') || v.includes('Forfeit')).length;

        const badgeStyle = 'font-size: 12px; margin-left: 6px; vertical-align: middle;';
        document.getElementById('p1-modal-badges').innerHTML = `<span style="${badgeStyle}">` + '🟨'.repeat(p1PreviousY + curP1_Y) + (state.penalties[p1.id]?.red > 0 || curP1_R > 0 ? '🟥' : '') + `</span>`;
        document.getElementById('p2-modal-badges').innerHTML = `<span style="${badgeStyle}">` + '🟨'.repeat(p2PreviousY + curP2_Y) + (state.penalties[p2.id]?.red > 0 || curP2_R > 0 ? '🟥' : '') + `</span>`;
    }

    if(hasEditAccess) {
      modal.querySelectorAll('.btn-add-viol').forEach(btn => btn.onclick = (e) => document.getElementById(`${e.target.dataset.side}-viol-modal`).classList.add('active'));
      modal.querySelectorAll('.v-cancel').forEach(btn => btn.onclick = (e) => document.getElementById(`${e.target.dataset.side}-viol-modal`).classList.remove('active'));

      modal.querySelectorAll('.v-confirm').forEach(btn => {
          btn.onclick = (e) => {
              const side = e.target.dataset.side;
              const end = document.getElementById(`${side}-viol-end`).value;
              const ruleVal = document.getElementById(`${side}-viol-rule`).value;
              if (!ruleVal) return alert("Selecione a violação na lista!");
              
              const [code, text, penalty] = ruleVal.split('|');
              const now = new Date();
              const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              const violString = `${end} - ${code} - ${text} - ${penalty} | ${timeStr}`;
              
              if (side === 'p1') p1Violations.push(violString); else p2Violations.push(violString);
              
              document.getElementById(`${side}-viol-modal`).classList.remove('active');
              renderViolations();

              const isYellow = violString.includes('Amarelo') || code.includes('16.10');
              const isRed = violString.includes('Vermelho') || violString.includes('Desqualificação') || violString.includes('Forfeit') || code.includes('16.11') || code.includes('16.12');
              
              if (isYellow || isRed) {
                 const curY = side === 'p1' ? p1Violations.filter(v => v.includes('Amarelo') || v.includes('16.10')).length : p2Violations.filter(v => v.includes('Amarelo') || v.includes('16.10')).length;
                 const prevY = side === 'p1' ? p1PreviousY : p2PreviousY;
                 
                 if (isRed || (prevY + curY) >= 2) {
                     setTimeout(() => {
                         const ladoNome = side === 'p1' ? 'Vermelho' : 'Azul';
                         alert(`🚨 ATENÇÃO: O atleta do lado ${ladoNome} será DESCLASSIFICADO da partida devido ao segundo Cartão Amarelo ou Cartão Vermelho direto!\nO jogo será encerrado automaticamente por W.O.`);
                         
                         const woRadio = modal.querySelector('input[name="match_status"][value="WO"]');
                         woRadio.checked = true;
                         
                         const winnerSelect = document.getElementById('wo-winner-select');
                         winnerSelect.disabled = false;
                         winnerSelect.value = side === 'p1' ? p2.id : p1.id;
                         
                         modal.querySelectorAll('.side-score, .side-time').forEach(input => { input.disabled = true; input.value = ''; });
                         calc();
                     }, 300);
                 }
              }
          };
      });
      
      modal.querySelectorAll('input[name="match_status"]').forEach(r => {
        r.addEventListener('change', (e) => {
          const isNormal = e.target.value === 'NORMAL';
          document.getElementById('wo-winner-select').disabled = isNormal;
          modal.querySelectorAll('.side-score, .side-time').forEach(input => { input.disabled = !isNormal; if (!isNormal) input.value = ''; });
          calc();
        });
      });

      const selectL = document.getElementById('color-select-left'); const badgeR = document.getElementById('badge-right');
      selectL.addEventListener('change', () => {
        const isRed = selectL.value === 'bg-red'; badgeR.textContent = isRed ? 'Cor: Azul' : 'Cor: Vermelho';
        document.querySelectorAll('.js-panel-left').forEach(el => { el.classList.remove('bg-red', 'bg-blue'); el.classList.add(isRed ? 'bg-red' : 'bg-blue'); });
        document.querySelectorAll('.js-panel-right').forEach(el => { el.classList.remove('bg-red', 'bg-blue'); el.classList.add(isRed ? 'bg-blue' : 'bg-red'); });
      });
      
      const btnS = modal.querySelector('.btn-save-match');
      if(btnS) {
        btnS.addEventListener('click', async () => {
          btnS.disabled = true; btnS.textContent = "A gravar...";
          const isW = modal.querySelector('input[name="match_status"][value="WO"]').checked; 
          const wS = document.getElementById('wo-winner-select').value;
          const refId = document.getElementById('match-referee-select').value;
          
          let p1P = Array.from(modal.querySelectorAll('.js-panel-left .side-score')).map(i => i.value !== '' ? Number(i.value) : null);
          let p2P = Array.from(modal.querySelectorAll('.js-panel-right .side-score')).map(i => i.value !== '' ? Number(i.value) : null);
          
          let p1T = Array.from(modal.querySelectorAll('.js-panel-left .side-time')).map(i => i.value !== '' ? i.value : null);
          let p2T = Array.from(modal.querySelectorAll('.js-panel-right .side-time')).map(i => i.value !== '' ? i.value : null);

          if (!isW) {
              for (let i = 0; i < 4; i++) {
                  if (p1P[i] === null) p1P[i] = 0;
                  if (p2P[i] === null) p2P[i] = 0;
                  if (p1T[i] === null) p1T[i] = "00:00";
                  if (p2T[i] === null) p2T[i] = "00:00";
              }
          }
          
          let l = 0, r = 0; let wId = null;
          if (isW) { wId = wS || null; } 
          else {
              const sL = modal.querySelectorAll('.js-panel-left .side-score:not(.tb)');
              const sR = modal.querySelectorAll('.js-panel-right .side-score:not(.tb)');
              sL.forEach(i => l += Number(i.value) || 0); sR.forEach(i => r += Number(i.value) || 0);
              if (l > r) wId = p1.id; else if (r > l) wId = p2.id; 
              else {
                 const t1L = p1P[4] !== null ? p1P[4] : 0; const t1R = p2P[4] !== null ? p2P[4] : 0;
                 if (p1P[4] !== null || p2P[4] !== null) {
                     if (t1L > t1R) wId = p1.id; else if (t1R > t1L) wId = p2.id;
                     else {
                         const t2L = p1P[5] !== null ? p1P[5] : 0; const t2R = p2P[5] !== null ? p2P[5] : 0;
                         if (p1P[5] !== null || p2P[5] !== null) {
                             if (t2L > t2R) wId = p1.id; else if (t2R > t2L) wId = p2.id;
                         }
                     }
                 }
              }
          }
          
          const mD = { 
              p1_partials: p1P, p2_partials: p2P, p1_times: p1T, p2_times: p2T, 
              is_wo: isW, p1_violations: p1Violations, p2_violations: p2Violations 
          };
          
          const payload = {
             score1: l, score_entrant1: l, score_a: l,
             score2: r, score_entrant2: r, score_b: r,
             winner_entrant_id: wId, winner_id: wId,
             status: 'COMPLETED',
             details: mD, match_details: mD,
             referee_id: refId ? refId : null
          };

          if (dynamicP1Id && dynamicP1Id !== 'null') {
             payload.entrant1_athlete_id = p1.id; payload.entrant1_id = p1.id; payload.entrant_a_id = p1.id;
             payload.entrant1_name = p1.name; payload.entrant_a_name = p1.name; payload.p1_name = p1.name;
             payload.p1_bib = p1.bib; payload.p1_club_sigla = p1.clubSigla; payload.p1_club_nome = p1.clubFull;
             payload.p1_logo = p1.logo; payload.entrant1_logo = p1.logo;
          }
          if (dynamicP2Id && dynamicP2Id !== 'null') {
             payload.entrant2_athlete_id = p2.id; payload.entrant2_id = p2.id; payload.entrant_b_id = p2.id;
             payload.entrant2_name = p2.name; payload.entrant_b_name = p2.name; payload.p2_name = p2.name;
             payload.p2_bib = p2.bib; payload.p2_club_sigla = p2.clubSigla; payload.p2_club_nome = p2.clubFull;
             payload.p2_logo = p2.logo; payload.entrant2_logo = p2.logo;
          }

          try {
            await saveMatchToFirebase(match.id, payload);
            window.__toast?.("Súmula salva com sucesso!", "success");
            modal.remove();
            await loadData(); 
          } catch (e) { 
            alert("Erro ao gravar: " + e.message); 
            btnS.disabled = false;
            btnS.textContent = "Salvar Súmula";
          }
        });
      }
    }

    function calc() {
      const isW = modal.querySelector('input[name="match_status"][value="WO"]').checked;
      const bS = document.getElementById('big-score');
      if (isW) { bS.innerHTML = `W <span>.</span> O`; return; }

      const sL = modal.querySelectorAll('.js-panel-left .side-score:not(.tb)');
      const sR = modal.querySelectorAll('.js-panel-right .side-score:not(.tb)');
      const tbL = modal.querySelectorAll('.js-panel-left .side-score.tb');
      const tbR = modal.querySelectorAll('.js-panel-right .side-score.tb');

      let lT = 0, rT = 0; sL.forEach(i => lT += Number(i.value) || 0); sR.forEach(i => rT += Number(i.value) || 0);
      let winnerSide = 0;
      if (lT > rT) winnerSide = 1; else if (rT > lT) winnerSide = 2;
      else {
        const t1L = Number(tbL[0].value) || 0; const t1R = Number(tbR[0].value) || 0;
        if (tbL[0].value !== '' || tbR[0].value !== '') {
          if (t1L > t1R) winnerSide = 1; else if (t1R > t1L) winnerSide = 2;
          else {
            const t2L = Number(tbL[1].value) || 0; const t2R = Number(tbR[1].value) || 0;
            if (tbL[1].value !== '' || tbR[1].value !== '') {
              if (t2L > t2R) winnerSide = 1; else if (t2R > t2L) winnerSide = 2;
            }
          }
        }
      }
      let t = `${lT} <span>x</span> ${rT}`; 
      if (winnerSide === 1) t = `${lT} <span style="font-size:24px; color:#166534;">(V)</span> <span>x</span> ${rT}`; 
      if (winnerSide === 2) t = `${lT} <span>x</span> ${rT} <span style="font-size:24px; color:#166534;">(V)</span>`;
      bS.innerHTML = t;
    }
    
    if(hasEditAccess) {
        modal.querySelectorAll('.side-score').forEach(input => input.addEventListener('input', calc)); 
    }
    renderViolations();
    calc();
  }

  loadData();
}

function getQuery(hash) {
  const idx = hash.indexOf('?');
  const q = idx >= 0 ? hash.slice(idx + 1) : '';
  const p = new URLSearchParams(q);
  const o = {};
  for (const [k, v] of p.entries()) o[k] = v;
  return o;
}

function escapeHTMLWrapper(s = '') {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

function escapeAttr(s=''){ return String(s).replace(/"/g,'&quot;'); }

const API_WRAPPER = {
  getCompetition: async (id) => {
    try {
        const docRef = doc(db, "competitions", String(id));
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
        throw new Error('Competição não encontrada');
    } catch(e) { throw { error: 'Falha ao carregar competição do Firebase' }; }
  },
  getClassesDropdown: async () => {
    try {
        const snap = await getDocs(collection(db, "classes"));
        return { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    } catch(e) { throw { error: 'Falha ao carregar classes do Firebase' }; }
  },
  getClassConfig: async (compId, clsCode) => {
    try {
        const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(compId)));
        const snap = await getDocs(q);
        let isKO = false;
        snap.forEach(doc => {
            const data = doc.data();
            if (data.class_code === clsCode) {
                if (data.type === 'ELIMINATORIA' || data.draw_format === 'KNOCKOUT' || data.is_knockout === true || data.format_type === 'KNOCKOUT' || data.type === 'KNOCKOUT') isKO = true;
            }
        });
        return isKO;
    } catch(e) { return false; }
  }
};

export async function renderCompetitionClass(root, hash) {
  const { id, class: classCode, step } = getQuery(hash);
  const compId = id ? String(id) : null; 
  const clsCode = (classCode || '').trim();

  if (!compId || !clsCode) {
    root.innerHTML = `<h1 tabindex="-1">Classe</h1><p>Competição ou classe inválida.</p>`;
    return;
  }

  let comp, dd, isClassKO;
  try {
    root.innerHTML = `<div style="padding: 40px; text-align: center;">A carregar dados do Torneio...</div>`;
    [comp, dd, isClassKO] = await Promise.all([ API_WRAPPER.getCompetition(compId), API_WRAPPER.getClassesDropdown(), API_WRAPPER.getClassConfig(compId, clsCode) ]);
  } catch (e) {
    root.innerHTML = `<p style="padding: 20px; color: red;">Falha ao carregar dados da competição ou classe.</p>`;
    return;
  }

  const isKnockout = isClassKO || (comp.metodo === 'ELIMINATORIA' || comp.tipo === 'ELIMINATORIA');
  const tabGroupsLabel = isKnockout ? 'Eliminatória Direta' : 'Grupos & Jogos';

  root.innerHTML = `
    <section class="cc-wrap">
      <header class="cc-head">
        <button type="button" class="cc-back" id="ccBack">&larr; Voltar</button>
        <div class="cc-head-text">
          <h1 id="ccTitle" tabindex="-1"></h1>
          <p id="ccSub" class="cc-sub"></p>
        </div>
      </header>
      <div class="cc-classbar" id="ccClassBar"></div>
      <nav class="cc-tabs" aria-label="Etapas da classe">
        <button type="button" data-step="draw">Selecção de Atletas</button>
        <button type="button" data-step="groups">${tabGroupsLabel}</button>
      </nav>
      <div id="ccContent" class="cc-content"></div>
    </section>
  `;

  root.querySelector('#ccBack').addEventListener('click', () => location.hash = `#/competitions/view?id=${encodeURIComponent(compId)}`);

  const titleEl = root.querySelector('#ccTitle');
  titleEl.textContent = (comp.nome || comp.name || '').toUpperCase();
  const sub = [comp.local || '', comp.data_inicio || comp.data_fim ? comp.data_inicio + ' – ' + comp.data_fim : ''].filter(Boolean).join(' · ');
  root.querySelector('#ccSub').textContent = sub;

  const ddItems = dd.items || dd.data || [];
  const info = ddItems.find(c => String(c.code||c.codigo||c.class_code||c.id||'').trim() === clsCode) || {};
  const bg = (info.ui_bg || info.color_bg || '').trim() || '#000000';
  const fg = (info.ui_fg || info.color_fg || '').trim() || '#ffffff';
  const name = info.name || info.nome || clsCode;

  root.querySelector('#ccClassBar').innerHTML = `
    <div class="cc-pill" style="background:${escapeAttr(bg)};color:${escapeAttr(fg)};">
      <span class="cc-dot" style="background:${escapeAttr(bg)};"></span>
      <span><strong>${escapeHTMLWrapper(clsCode)}</strong> — ${escapeHTMLWrapper(name)}</span>
    </div>
  `;

  const tabs = root.querySelector('.cc-tabs');
  const content = root.querySelector('#ccContent');
  const currentStep = (step || 'draw');

  function setActiveTab(stepKey){
    Array.from(tabs.querySelectorAll('button')).forEach(btn=>{ btn.dataset.active = btn.getAttribute('data-step') === stepKey ? 'true' : 'false'; });
  }

  async function renderStep(stepKey){
    setActiveTab(stepKey);
    if (stepKey === 'draw') {
      content.innerHTML = `<p style="padding: 20px;">A carregar selecção de atletas...</p>`;
      try {
        const mod = await import('./competition-class-select.js');
        content.innerHTML = '';
        await mod.renderCompetitionClassSelect(content, { competitionId: compId, classCode: clsCode });
      } catch (e) {
        console.error(e);
        content.innerHTML = `<p style="padding: 20px; color: red;">Falha ao carregar a página de seleção.</p>`;
      }
    } else if (stepKey === 'groups') {
      if (isKnockout) {
          content.innerHTML = `
            <h2 style="margin-top:0;">Mata-Mata / Eliminatória Direta</h2>
            <p style="font-size:13px;color:var(--muted);">Neste modo, não há Fase de Grupos. O Torneio desenrola-se em formato de chaves eliminatórias com base no Ranking.</p>
            <button class="btn btn-primary" onclick="location.hash='#/competitions/${compId}/class/${clsCode}/competition-view'">Abrir Árvore de Jogos e Súmulas</button>
          `;
      } else {
          content.innerHTML = `
            <h2 style="margin-top:0;">Grupos &amp; Jogos</h2>
            <p style="font-size:13px;color:var(--muted);">Visualização dos grupos, jogos da fase de pools e chave eliminatória.</p>
            <button class="btn btn-primary" onclick="location.hash='#/competitions/${compId}/class/${clsCode}/competition-view'">Abrir Tela de Partidas (Súmulas)</button>
            <button class="btn btn-outline-secondary" onclick="location.hash='#/competitions/${compId}/class/${clsCode}/draw-view'">Ver Potes e Grupos</button>
          `;
      }
    }
  }

  tabs.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-step]');
    if (!btn) return;
    const stepKey = btn.getAttribute('data-step');
    const url = `#/competitions/class?id=${encodeURIComponent(compId)}&class=${encodeURIComponent(clsCode)}&step=${encodeURIComponent(stepKey)}`;
    location.hash = url;
  });

  await renderStep(currentStep === 'groups' ? 'groups' : 'draw');
  titleEl.focus();
}

export default renderCompetitionClass;