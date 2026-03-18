// client/js/pages/competition-dashboard.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { canEditInCompetition, canViewInCompetition, currentUser } from '../permissions.js';

const API = {
  getCompetition: async (id) => {
    const docRef = doc(db, "competitions", String(id));
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Falha ao carregar competição');
    return { id: docSnap.id, ...docSnap.data() };
  },
  getCompetitionClasses: async (id) => {
    const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  getClassesGlobal: async () => {
    const snap = await getDocs(collection(db, "classes"));
    return { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
  },
  getDrawSummary: async (compId, classCode) => {
    try {
      let total_athletes = 0;
      let groups_count = 0;
      let total_matches = 0;
      let completed_matches = 0;
      let status_atual = "Fase de Grupos";

      const qDraw = query(collection(db, "draws"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
      const snapDraw = await getDocs(qDraw);
      
      if (snapDraw.empty) return null; 
      
      const drawData = snapDraw.docs[0].data();
      
      if (drawData.format && drawData.format.type === 'PURE_KNOCKOUT') {
          status_atual = "Mata-Mata";
          groups_count = 0; 
          total_athletes = drawData.seeds ? drawData.seeds.filter(s => s && s.id !== 'BYE').length : 0;
      } else {
          const pools = drawData.data || drawData.groups || drawData.draw_data || [];
          groups_count = pools.length;
          pools.forEach(p => { if (p.players) total_athletes += p.players.filter(x => x && x.id !== 'BYE').length; });
      }

      const qGroupMatches = query(collection(db, "matches_group"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
      const snapGM = await getDocs(qGroupMatches);
      
      let allGroupFinished = true;
      if (!snapGM.empty) {
         const gmData = snapGM.docs[0].data();
         const gMatches = gmData.matches || gmData.data || [];
         gMatches.forEach(pool => {
            Object.values(pool.rounds || {}).forEach(round => {
               round.forEach(m => {
                  const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye === true || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE' || String(m.p1_name).toUpperCase() === 'BYE' || String(m.p2_name).toUpperCase() === 'BYE';
                  if (isBye) return; 
                  
                  total_matches++;
                  if (m.status === 'COMPLETED') {
                     completed_matches++;
                  } else {
                     allGroupFinished = false;
                  }
               });
            });
         });
      } else {
         allGroupFinished = false;
      }

      const qKoMatches = query(collection(db, "matches_ko"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
      const snapKO = await getDocs(qKoMatches);
      
      if (!snapKO.empty) {
         const koData = snapKO.docs[0].data();
         const kMatches = koData.matches || koData.data || [];
         if (kMatches.length > 0) {
             if (allGroupFinished || status_atual === "Mata-Mata") status_atual = "Mata-Mata";
             kMatches.forEach(m => {
                 const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye === true || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';
                 if (isBye) return; 

                 total_matches++;
                 if (m.status === 'COMPLETED' || (m.details && typeof m.details==='object' && m.details.is_wo)) completed_matches++;
             });
         }
      }

      if (total_matches > 0 && completed_matches === total_matches) {
          status_atual = "Finalizado";
      }

      return { total_athletes, groups_count, total_matches, completed_matches, status_atual };
    } catch (e) { return null; }
  },
  deleteDraw: async (compId, classCode) => {
    const qDraw = query(collection(db, "draws"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
    const snapDraw = await getDocs(qDraw);
    
    if (!snapDraw.empty) {
        const drawData = snapDraw.docs[0].data();
        let extractedAthletes = [];
        if (drawData.seeds) {
            drawData.seeds.forEach(s => { if(s && s.id !== 'BYE' && s.firebase_id) extractedAthletes.push(s); });
        }
        if (drawData.groups) {
            drawData.groups.forEach(g => {
                if(g.players) g.players.forEach(p => { if(p && p.id !== 'BYE' && p.firebase_id) extractedAthletes.push(p); });
            });
        }
        if (extractedAthletes.length > 0) {
            const docRefAthletes = doc(db, "competition_athletes", `${compId}_${classCode}`);
            const existSnap = await getDoc(docRefAthletes);
            if (!existSnap.exists()) {
                await setDoc(docRefAthletes, {
                    competition_id: String(compId),
                    class_code: classCode,
                    athletes: extractedAthletes
                });
            }
        }
    }

    const queries = [
        qDraw,
        query(collection(db, "matches_group"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode)),
        query(collection(db, "matches_ko"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode))
    ];
    for (let q of queries) {
        const snap = await getDocs(q);
        snap.forEach(async (d) => { await deleteDoc(doc(db, d.ref.parent.path, d.id)); });
    }
    return { success: true };
  },
  deleteClass: async (compId, classCode) => {
    await API.deleteDraw(compId, classCode);
    const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(compId)), where("class_code", "==", classCode));
    const snap = await getDocs(q);
    snap.forEach(async (d) => { await deleteDoc(doc(db, "competition_classes", d.id)); });
    return { success: true };
  }
};

function escapeHTML(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

export function renderCompetitionDashboard(root, hashData) {
  const auth = getAuth();
  
  let competitionId = hashData;
  if (typeof hashData === 'string' && hashData.includes('?')) {
    const urlParams = new URLSearchParams(hashData.split('?')[1]);
    competitionId = urlParams.get('id');
  }

  let competition = null;
  let classColorsMap = {};
  let userCompRole = null; 

  // 🔥 REDE DE CAPTURA ABSOLUTA APLICADA NO MENU
  async function loadUserRoleInCompetition(user) {
    if (!user || !user.uid) return null;
    if (currentUser && currentUser.globalRole === 'ADMIN_GERAL') return 'DELEGADO_TECNICO'; 

    try {
        const uid = user.uid;
        let uName = "", uCpf = "", uEmail = user.email ? String(user.email).toLowerCase().trim() : null;
        let isGlobalAdmin = false;

        try {
            const uDoc = await getDoc(doc(db, "users", uid));
            if (uDoc.exists()) {
                const d = uDoc.data();
                uName = String(d.nome || d.name || '').toLowerCase().trim();
                uCpf = String(d.cpf || '').replace(/\D/g, '');
                if (!uEmail && d.email) uEmail = String(d.email).toLowerCase().trim();
                const r = String(d.role || d.nivel_acesso || d.global_role || '').toLowerCase();
                if (r.includes('admin') || r === 'administrador') isGlobalAdmin = true;
            }
        } catch(e) {}

        if (isGlobalAdmin) return 'DELEGADO_TECNICO';

        const qOff = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
        const snapOff = await getDocs(qOff);
        
        let foundRole = null;
        const cleanStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '');
        const myCleanName = cleanStr(uName);

        snapOff.forEach(doc => {
            const data = doc.data();
            const offList = data.officials || [];
            
            const myOff = offList.find(o => {
                const oId = String(o.referee_id || o.uid || o.official_id || o.id || '');
                const oEmail = String(o.email || '').toLowerCase().trim();
                const oCpf = String(o.cpf || '').replace(/\D/g, '');
                const oName = cleanStr(o.nome || o.nome_completo || o.nome_abreviado);

                if (uid && oId === String(uid)) return true;
                if (uEmail && oEmail && oEmail === uEmail) return true;
                if (uCpf && oCpf && oCpf === uCpf) return true;
                if (myCleanName && oName && (oName === myCleanName || oName.includes(myCleanName) || myCleanName.includes(oName))) return true;

                return false;
            });

            if (myOff && myOff.role) {
                foundRole = myOff.role;
            }
        });

        // Converte o nome escrito pelo Admin para a chave de permissão do sistema
        if (foundRole) {
            const rolesArr = String(foundRole).split(',').map(cleanStr);
            if (rolesArr.some(r => ['delegadotecnico', 'assistentedelegadotecnico'].includes(r))) return 'DELEGADO_TECNICO';
            if (rolesArr.some(r => ['arbitrochefe', 'assistentearbitrochefe'].includes(r))) return 'ARBITRO_CHEFE';
            return 'ARBITRO';
        }

        return null;
    } catch(e) {
        console.warn("Erro ao buscar papel na competição", e);
        return null;
    }
  }

  async function loadCompetition(user) {
    if (!competitionId) {
      root.innerHTML = `<div class="card" style="margin:20px; color:#dc3545; padding:20px;">Erro: ID da competição ausente na URL.</div>`;
      return;
    }
    try {
      competition = await API.getCompetition(competitionId);
      userCompRole = await loadUserRoleInCompetition(user);

      const rawClasses = await API.getCompetitionClasses(competitionId);
      
      competition.classes = await Promise.all(rawClasses.map(async (cls) => {
          const code = cls.class_code || cls.codigo || cls.name || cls.id;
          const summary = await API.getDrawSummary(competitionId, code);
          return { ...cls, class_code: code, drawSummary: summary };
      }));

      competition.classes.sort((a, b) => a.class_code.localeCompare(b.class_code));

      const globalClasses = await API.getClassesGlobal();
      const items = globalClasses.items || [];
      items.forEach(c => { 
          const key = c.codigo || c.code || c.id;
          classColorsMap[key] = { bg: c.ui_bg || '#f8f9fa', fg: c.ui_fg || '#212529' }; 
      });
      render();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="card" style="margin:20px; color:#dc3545; padding:20px;">Erro ao carregar dados do Firebase.</div>`;
    }
  }

  function render() {
    if (!competition) return;

    let globalPlayed = 0;
    let globalTotal = 0;
    
    competition.classes.forEach(cls => {
        if(cls.drawSummary) {
            globalPlayed += (cls.drawSummary.completed_matches || 0); 
            globalTotal += (cls.drawSummary.total_matches || 0);
        }
    });
    const globalPerc = globalTotal > 0 ? Math.round((globalPlayed / globalTotal) * 100) : 0;

    let navMenuHtml = `
      <button class="btn-nav-dash" onclick="location.hash='#/competitions/athletes?id=${competitionId}'">Atletas</button>
      
      ${canViewInCompetition(userCompRole, 'oficiais') ? 
          `<button class="btn-nav-dash" onclick="location.hash='#/competitions/officials?id=${competitionId}'">Oficiais</button>` : ''}
      
      <button class="btn-nav-dash" onclick="location.hash='#/competitions/schedule?id=${competitionId}'">Agenda</button>
      
      ${canViewInCompetition(userCompRole, 'sumulas') ? 
          `<button class="btn-nav-dash" onclick="location.hash='#/competitions/match-sheets?id=${competitionId}'">Súmulas</button>` : ''}
      
      ${canViewInCompetition(userCompRole, 'camara_chamada') ? 
          `<button class="btn-nav-dash" style="background:#fef3c7; border-color:#fcd34d; color:#b45309;" onclick="location.hash='#/call-room?id=${competitionId}'">📋 Câmara de Chamada</button>` : ''}
      
      <button class="btn-nav-dash" onclick="location.hash='#/competitions/violations?id=${competitionId}'">Violações</button>
      
      <button class="btn-nav-dash btn-nav-highlight" onclick="location.hash='#/competitions/scoreboard?id=${competitionId}'">📺 Scoreboard</button>
      
      <button class="btn-nav-dash" style="background:#4f46e5; color:white; border-color:#4338ca; font-weight:bold;" onclick="location.hash='#/competitions/final-results?id=${competitionId}'">🏆 Resultado Final</button>
      
      ${canEditInCompetition(userCompRole, 'all') ? 
          `<button class="btn-nav-dash" style="background:#eff6ff; border-color:#93c5fd; color:#1d4ed8; margin-left:auto;" onclick="location.hash='#/competitions/access?id=${competitionId}'">🔑 Gerar Acessos (PINs)</button>` : ''}
    `;

    root.innerHTML = `
      <style>
        .card-menu-container { position: relative; }
        .btn-dots { background: transparent; border: none; color: inherit; font-size: 20px; cursor: pointer; padding: 0 8px; border-radius: 4px; }
        .btn-dots:hover { background: rgba(0,0,0,0.1); }
        .card-dropdown { 
          position: absolute; right: 0; top: 100%; margin-top: 4px; 
          background: var(--card); border: 1px solid var(--card-border); 
          box-shadow: var(--shadow); border-radius: 8px; min-width: 180px; 
          display: none; flex-direction: column; z-index: 1000; overflow: hidden;
        }
        .card-dropdown.show { display: flex; }
        .card-dropdown button { background: transparent; border: none; padding: 10px 16px; text-align: left; cursor: pointer; color: var(--fg); font-size: 13px; font-weight: 500; }
        .card-dropdown button:hover { background: var(--bg); }
        .text-danger { color: var(--danger-color, #dc3545) !important; font-weight: 600 !important; }
        .text-warning { color: #d97706 !important; font-weight: 600 !important; }
        
        .progress-bar { width: 100%; background-color: #e2e8f0; border-radius: 6px; height: 8px; margin-top: 6px; overflow: hidden; }
        .progress-fill { height: 100%; background-color: #0d6efd; border-radius: 6px; transition: width 0.4s ease; }
        
        .dash-nav-menu { display: flex; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--card-border); padding-top: 16px; }
        .btn-nav-dash { background: #f8fafc; border: 1px solid #cbd5e1; color: #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        .btn-nav-dash:hover { background: #e2e8f0; color: #0f172a; }
        .btn-nav-highlight { background: #1e293b; color: white; border-color: #0f172a; }
        .btn-nav-highlight:hover { background: #0f172a; color: white; }
      </style>
      <section style="max-width: 1200px; margin: 0 auto; padding: 16px;">
        <header class="card" style="margin-bottom: 24px; padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
            <div>
              <h1 style="margin: 0; font-size: 26px;">${escapeHTML(competition.name || competition.nome || 'Competição')}</h1>
              <p style="margin: 4px 0 16px 0; color: var(--muted); font-size: 14px;">
                ${escapeHTML(competition.date || competition.start_date || competition.data_inicio || "")} - ${escapeHTML(competition.location || competition.local || "")}
              </p>
            </div>
            <div style="text-align: right; min-width: 200px;">
              <div style="font-size: 13px; color: var(--muted); margin-bottom: 4px;">Progresso da Competição</div>
              <div style="font-size: 18px; font-weight: bold;">${globalPlayed} / ${globalTotal} jogos <span style="font-weight: normal; font-size: 14px; color: var(--primary-color);">(${globalPerc}%)</span></div>
              <div class="progress-bar"><div class="progress-fill" style="width: ${globalPerc}%;"></div></div>
            </div>
          </div>
          
          <div class="dash-nav-menu">
            ${navMenuHtml}
          </div>
        </header>
        
        <h2 style="font-size: 18px; margin-bottom: 16px; color: #1e293b;">Painel das Classes</h2>
        <div id="classes-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
          ${renderClasses()}
        </div>
      </section>
    `;
    bindEvents();
  }

  function renderClasses() {
    if (!competition.classes || competition.classes.length === 0) return `<p style="color: var(--muted);">Nenhuma classe cadastrada.</p>`;

    const canEditFull = canEditInCompetition(userCompRole, 'all');

    return competition.classes.map(cls => {
      const code = cls.class_code || cls.codigo || cls.name || 'Desconhecida';
      const colors = classColorsMap[code] || { bg: '#f8f9fa', fg: '#212529' };
      const summary = cls.drawSummary;
      
      const hasDraw = summary !== null;
      let cardBody = '';

      if (!hasDraw) {
        if (canEditFull) {
          cardBody = `
            <div style="padding: 24px 16px; text-align: center; background: rgba(0,0,0,0.02);">
              <p style="margin: 0 0 16px 0; color: var(--muted); font-size: 13px;">Sorteio e chaves ainda não definidos.</p>
              <button class="btn btn-fazer-sorteio" data-id="${escapeHTML(code)}" style="width: 100%; justify-content: center; background: #0d6efd; color: #fff;">Sortear Atletas</button>
            </div>`;
        } else {
          cardBody = `
            <div style="padding: 36px 16px; text-align: center; background: rgba(0,0,0,0.02);">
              <p style="margin: 0; color: var(--muted); font-size: 15px; font-weight: 600;">⏳ Aguardando sorteio</p>
            </div>`;
        }
      } else {
        const played = summary.completed_matches || 0;
        const total = summary.total_matches || 0;
        const statusText = summary.status_atual || 'Desconhecido';
        
        let statusColor = "#64748b"; 
        if (statusText === 'Mata-Mata') statusColor = "#b45309";
        if (statusText === 'Finalizado') statusColor = "#16a34a";

        cardBody = `
          <div style="padding: 16px; display: flex; flex-direction: column; gap: 10px; font-size: 14px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--table-border); padding-bottom: 4px;">
              <span style="color: var(--muted);">Atletas / Grupos:</span> <strong>${summary.total_athletes || 0} / ${summary.groups_count || 0}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--table-border); padding-bottom: 4px;">
              <span style="color: var(--muted);">Fase Atual:</span> <strong style="color: ${statusColor};">${escapeHTML(statusText)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--muted);">Andamento (Jogos):</span> <strong>${played} / ${total}</strong>
            </div>
          </div>`;
          
        if (!canEditFull) {
          cardBody += `
            <div style="padding: 0 16px 16px; margin-top: auto;">
              <button class="btn" onclick="location.hash='#/competitions/${competitionId}/class/${escapeHTML(code)}/competition-view'" style="width: 100%; justify-content: center; background: #1e293b; color: #fff; font-weight: bold;">Abrir Classe</button>
            </div>`;
        }
      }

      let adminMenuHTML = '';
      if (canEditFull) {
        adminMenuHTML = `
          <div class="card-menu-container">
            <button class="btn-dots">⋮</button>
            <div class="card-dropdown">
              ${hasDraw ? `<button data-action="abrir" data-id="${escapeHTML(code)}">Jogos e Tabelas</button>` : ''}
              ${hasDraw ? `<button data-action="ver-sorteio" data-id="${escapeHTML(code)}">Sorteio</button>` : ''}
              ${hasDraw ? `<button data-action="resultados" data-id="${escapeHTML(code)}">Resultados</button>` : ''}
              ${hasDraw ? `<button data-action="resetar" data-id="${escapeHTML(code)}" class="text-warning">Reiniciar classe</button>` : ''}
              <button data-action="excluir" data-id="${escapeHTML(code)}" class="text-danger">Excluir classe</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="card" style="padding: 0; overflow: visible; align-items: stretch; text-align: left; display: flex; flex-direction: column;">
          <div style="background-color: ${colors.bg}; color: ${colors.fg}; padding: 12px 16px; font-size: 16px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); border-radius: 15px 15px 0 0;">
            <span>${escapeHTML(cls.name || code)}</span>
            ${adminMenuHTML}
          </div>
          ${cardBody}
        </div>`;
    }).join("");
  }

  function bindEvents() {
    if (canEditInCompetition(userCompRole, 'all')) {
      document.querySelectorAll(".btn-fazer-sorteio").forEach(btn =>
        btn.addEventListener("click", () => { location.hash = `#/competitions/class?id=${encodeURIComponent(competitionId)}&class=${encodeURIComponent(btn.dataset.id)}`; })
      );

      const allDropdowns = document.querySelectorAll('.card-dropdown');
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-menu-container')) allDropdowns.forEach(d => d.classList.remove('show'));
      });

      document.querySelectorAll('.btn-dots').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const dropdown = btn.nextElementSibling;
          const isShowing = dropdown.classList.contains('show');
          allDropdowns.forEach(d => d.classList.remove('show'));
          if (!isShowing) dropdown.classList.add('show');
        });
      });

      document.querySelectorAll('.card-dropdown button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const action = btn.dataset.action;
          const classCode = btn.dataset.id;
          
          switch (action) {
            case 'abrir': location.hash = `#/competitions/${competitionId}/class/${classCode}/competition-view`; break;
            case 'ver-sorteio': location.hash = `#/competitions/${competitionId}/class/${classCode}/draw-view`; break;
            case 'resultados': location.hash = `#/competitions/${competitionId}/class/${classCode}/results`; break;
            case 'resetar':
              if (confirm(`Atenção: Você irá APAGAR TODOS OS JOGOS e a chave da classe ${classCode}. Os atletas selecionados serão mantidos intactos. Deseja reiniciar a classe?`)) {
                await API.deleteDraw(competitionId, classCode);
                window.__toast?.('A classe foi reiniciada.', 'success');
                loadCompetition(auth.currentUser);
              }
              break;
            case 'excluir':
              if (confirm(`Excluir esta classe do evento?`)) { await API.deleteClass(competitionId, classCode); loadCompetition(auth.currentUser); }
              break;
          }
        });
      });
    }
  }

  onAuthStateChanged(auth, (user) => {
      loadCompetition(user);
  });
}