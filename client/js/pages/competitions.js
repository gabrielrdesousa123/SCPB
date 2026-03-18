// client/js/pages/competitions.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, query, where, orderBy, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { canEditGlobal, currentUser } from '../permissions.js';

// ============================================================
//   API: COMUNICAÇÃO COM O FIREBASE
// ============================================================
const API = {
  list: async (params = {}) => {
    let items = [];
    try {
      const q = query(collection(db, "competitions"), orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch(e) { 
      console.warn("Fallback ativado (sem orderBy):", e);
      const snap = await getDocs(collection(db, "competitions"));
      items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    let filtered = items.filter(i => 
        i.historica_csv !== true && 
        i.historica_csv !== "true" && 
        i.historica_csv !== 1 && 
        i.historica_csv !== "1"
    );

    if (params.q) {
       const term = params.q.toLowerCase();
       filtered = filtered.filter(i => 
           (i.nome && i.nome.toLowerCase().includes(term)) || 
           (i.name && i.name.toLowerCase().includes(term)) || 
           (i.local && i.local.toLowerCase().includes(term))
       );
    }

    // 🔥 FILTRO DE DATAS E ORDENAÇÃO: Campeonatos mais recentes (pela Data de Início) primeiro
    filtered.sort((a, b) => {
        const dA = new Date(a.data_inicio || a.start_date || a.created_at || 0).getTime();
        const dB = new Date(b.data_inicio || b.start_date || b.created_at || 0).getTime();
        return dB - dA;
    });

    return { items: filtered, total: filtered.length };
  },
  
  getClassesDropdown: async () => {
    try {
        const snap = await getDocs(collection(db, "classes"));
        return { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    } catch(e) { throw { error: 'Falha ao carregar classes do Firebase' }; }
  },
  getCompetition: async (id) => {
    try {
        const docRef = doc(db, "competitions", String(id));
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
        throw new Error('Competição não encontrada');
    } catch(e) { throw { error: 'Falha ao carregar competição do Firebase' }; }
  },
  getCompetitionClasses: async (id) => {
    try {
        const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
        const snap = await getDocs(q);
        return { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    } catch(e) { throw { error: 'Falha ao carregar classes da competição' }; }
  },
  createCompetition: async (payload) => {
    try {
        const classesArray = payload.classes || [];
        delete payload.classes; 
        
        payload.created_at = new Date().toISOString(); 
        
        const docRef = await addDoc(collection(db, "competitions"), payload);
        
        for (const clsCode of classesArray) {
            await addDoc(collection(db, "competition_classes"), {
                competition_id: docRef.id,
                class_code: clsCode,
                type: payload.metodo 
            });
        }
        return { id: docRef.id };
    } catch(e) { throw { error: 'Falha ao criar competição no Firebase: ' + e.message }; }
  },
  updateCompetition: async (id, payload) => {
    try {
        const classesArray = payload.classes || [];
        delete payload.classes;
        
        payload.updated_at = new Date().toISOString();
        
        await updateDoc(doc(db, "competitions", String(id)), payload);
        
        const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
        const snap = await getDocs(q);
        const delPromises = snap.docs.map(d => deleteDoc(doc(db, "competition_classes", d.id)));
        await Promise.all(delPromises);

        for (const clsCode of classesArray) {
            await addDoc(collection(db, "competition_classes"), {
                competition_id: String(id),
                class_code: clsCode,
                type: payload.metodo
            });
        }
        return { id };
    } catch(e) { throw { error: 'Falha ao atualizar competição no Firebase: ' + e.message }; }
  },

  duplicate: async (id) => {
    try {
        const compSnap = await getDoc(doc(db, "competitions", String(id)));
        if (!compSnap.exists()) throw new Error("Competição não encontrada.");
        
        const compData = compSnap.data();
        const newName = (compData.nome || compData.name || "Competição") + " (Cópia)";
        
        const newCompData = {
            ...compData,
            nome: newName,
            name: newName,
            is_archived: true, 
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        delete newCompData.historica_csv; 

        const newCompRef = await addDoc(collection(db, "competitions"), newCompData);
        const newId = newCompRef.id;

        const copyCollection = async (collectionName) => {
            const foreignKeys = ["competition_id", "comp_id", "id_competicao", "competicao_id"];
            let snap = null;
            let matchedKey = null;

            for (const fk of foreignKeys) {
                const qStr = query(collection(db, collectionName), where(fk, "==", String(id)));
                const resStr = await getDocs(qStr);
                if (!resStr.empty) { snap = resStr; matchedKey = fk; break; }
                
                if (!isNaN(id)) {
                    const qNum = query(collection(db, collectionName), where(fk, "==", Number(id)));
                    const resNum = await getDocs(qNum);
                    if (!resNum.empty) { snap = resNum; matchedKey = fk; break; }
                }
            }

            if (!snap || snap.empty) return;

            const promises = [];
            snap.forEach(d => {
                const item = d.data();
                item[matchedKey] = String(newId);
                promises.push(addDoc(collection(db, collectionName), item));
            });
            await Promise.all(promises);
        };

        await copyCollection("competition_classes");
        await copyCollection("competition_officials");
        
        const colecoesAtletas = [
            "competition_athletes", "inscriptions", "inscricoes", "inscritos",
            "atletas_competicao", "competition_class_athletes",
            "class_inscriptions", "participantes", "participants"
        ];
        
        for (const col of colecoesAtletas) {
            await copyCollection(col);
        }

        return { success: true, newId };
    } catch(e) { 
        throw { error: 'Falha ao duplicar no Firebase: ' + e.message }; 
    }
  },
  
  reset: async (id) => {
    try {
        const qDraws = query(collection(db, "draws"), where("competition_id", "==", String(id)));
        const snapDraws = await getDocs(qDraws);
        for (let d of snapDraws.docs) {
            const drawData = d.data();
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
                const safeClassCode = drawData.class_code;
                const docRefAthletes = doc(db, "competition_athletes", `${id}_${safeClassCode}`);
                const existSnap = await getDoc(docRefAthletes);
                if (!existSnap.exists()) {
                    await setDoc(docRefAthletes, {
                        competition_id: String(id),
                        class_code: safeClassCode,
                        athletes: extractedAthletes
                    });
                }
            }
        }

        const queries = [
            qDraws,
            query(collection(db, "matches_group"), where("competition_id", "==", String(id))),
            query(collection(db, "matches_ko"), where("competition_id", "==", String(id))),
            query(collection(db, "time_slots"), where("competition_id", "==", String(id)))
        ];
        for (let q of queries) {
            const snap = await getDocs(q);
            snap.forEach(async (d) => { await deleteDoc(doc(db, d.ref.parent.path, d.id)); });
        }
        return { success: true };
    } catch(e) { throw { error: 'Falha ao resetar no Firebase' }; }
  },
  
  remove: async (id) => {
    try {
        await API.reset(id);
        const qClasses = query(collection(db, "competition_classes"), where("competition_id", "==", String(id)));
        const snapClasses = await getDocs(qClasses);
        snapClasses.forEach(async (d) => { await deleteDoc(doc(db, "competition_classes", d.id)); });
        
        const qOff = query(collection(db, "competition_officials"), where("competition_id", "==", String(id)));
        const snapOff = await getDocs(qOff);
        snapOff.forEach(async (d) => { await deleteDoc(doc(db, "competition_officials", d.id)); });

        await deleteDoc(doc(db, "competitions", String(id)));
        return { success: true };
    } catch(e) { throw { error: 'Falha ao deletar do Firebase' }; }
  },
};

// ============================================================
//   HELPERS GERAIS
// ============================================================
function fmtDate(d) {
  if (!d) return '';
  if (typeof d === 'string') {
      const dateOnly = d.split('T')[0]; 
      const parts = dateOnly.split('-');
      if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`; 
      }
  }
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const dd = String(dt.getDate()).padStart(2,'0'); 
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function fmtDateRange(ini, fim){
  const fIni = fmtDate(ini);
  const fFim = fmtDate(fim);
  if (fIni && fFim && fIni !== fFim) return `${fIni} até ${fFim}`;
  return fIni || fFim;
}

function escapeHTML(s=''){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }

function getQuery(hash) {
  const idx = hash.indexOf('?');
  const q = idx >= 0 ? hash.slice(idx + 1) : '';
  const p = new URLSearchParams(q);
  const o = {};
  for (const [k, v] of p.entries()) o[k] = v;
  return o;
}

function toInputDate(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = String(s).split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (y && m && d) return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

function fromInputDate(s) {
  return s || null;
}

function METODO_NORMALIZADO(v) {
  const up = String(v || '').toUpperCase();
  if (up === 'WORLD_BOCCIA') return 'WORLD_BOCCIA';
  if (up === 'ELIMINATORIA') return 'ELIMINATORIA';
  return 'ELIMINATORIA'; 
}

function showFormError(form, msg) {
  let el = form.querySelector('.comp-error');
  if (!el) {
    el = document.createElement('div');
    el.className = 'comp-error';
    el.style.color = '#dc2626';
    el.style.background = '#fee2e2';
    el.style.padding = '12px';
    el.style.borderRadius = '8px';
    el.style.fontWeight = 'bold';
    el.style.marginBottom = '20px';
    form.prepend(el);
  }
  el.textContent = msg;
}

// ============================================================
//   TELA 1: LISTA DE COMPETIÇÕES (#/competitions/load) 
// ============================================================
export async function renderLoadCompetition(root) {
  const canEdit = canEditGlobal('competicoes');

  root.innerHTML = `
    <section>
      <h1 tabindex="-1">Campeonatos em Andamento</h1>

      <div class="toolbar" style="margin:8px 0 20px; display: flex; gap: 8px;">
        <input id="q" type="search" placeholder="Buscar campeonato ou cidade…" aria-label="Buscar" style="flex:1;" />
        <button class="ghostbtn" id="btnSearch">Buscar</button>
        
        <div id="adminPanel" style="display: ${canEdit ? 'block' : 'none'};">
          <a class="btn" href="#/competitions/new" id="btnNew">Criar competição</a>
        </div>
      </div>

      <div id="activeListWrap" aria-busy="true"></div>

      <div id="archivedSection" style="display: none; margin-top: 50px;">
          <h2 style="font-size: 20px; color: #64748b; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 25px; font-weight: 800;">
             📁 Competições Arquivadas / Testes
          </h2>
          <div id="archivedListWrap" aria-busy="true"></div>
      </div>
    </section>
  `;

  const activeListWrap = root.querySelector('#activeListWrap');
  const archivedListWrap = root.querySelector('#archivedListWrap');
  const archivedSection = root.querySelector('#archivedSection');
  const qEl = root.querySelector('#q');
  const btnSearch = root.querySelector('#btnSearch');

  const renderGrid = (items, container, isEmptyMsg) => {
    if (!items.length) {
      container.innerHTML = `<p style="color: #64748b;">${isEmptyMsg}</p>`;
      return;
    }

    const html = `
      <div class="comp-grid" role="list" style="display: grid !important; gap: 20px !important;">
        ${items.map(it => {
          const href = `#/competitions/view?id=${encodeURIComponent(it.id||'')}`;
          const mid = `m_${it.id}`;
          const period = fmtDateRange(it.data_inicio || it.start_date, it.data_fim || it.end_date);
          
          const adminMenu = canEdit ? `
            <button class="menu-dot" aria-haspopup="true" aria-expanded="false" data-menu="${mid}" title="Mais ações">⋯</button>
            <div id="${mid}" class="menu-panel" hidden role="menu">
              <button class="ghostbtn" data-act="edit" data-id="${it.id}" role="menuitem">✏️ Editar Info</button>
              <button class="ghostbtn" data-act="resultado" data-id="${it.id}" role="menuitem">📊 Resultado</button>
              <button class="ghostbtn" data-act="relatorio" data-id="${it.id}" role="menuitem">📄 Relatório</button>
              <hr class="menu-sep">
              <button class="ghostbtn" data-act="duplicate" data-id="${it.id}" role="menuitem">📑 Duplicar Competição</button>
              <hr class="menu-sep">
              <button class="ghostbtn warning" data-act="reset" data-id="${it.id}" role="menuitem">🧹 Apagar Sorteios e Jogos</button>
              <button class="ghostbtn danger" data-act="delete" data-id="${it.id}" role="menuitem">🗑️ Excluir Competição</button>
            </div>
          ` : '';

          return `
            <div class="card comp-card ${it.is_archived ? 'archived-card' : ''}" role="listitem">
              ${adminMenu}

              <div class="icon" aria-hidden="true" style="color: ${it.is_archived ? '#94a3b8' : '#3b82f6'}; margin-bottom: 10px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>
              </div>

              <div class="card-title comp-title">${escapeHTML(it.nome || it.name || '')}</div>
              <div class="card-sub comp-date" style="display:flex; align-items:center; gap:5px;"><span style="font-size:16px;">📅</span> ${escapeHTML(period)}</div>

              <div class="comp-label">Local</div>
              <div class="card-sub comp-loc">${escapeHTML(it.local || it.location || '')}</div>

              <a class="btn comp-select" href="${href}" style="${!canEdit ? 'background: #1e293b; color: #fff;' : ''}">${canEdit ? 'Gerenciar' : 'Acompanhar'}</a>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.innerHTML = html;
  };

  const styleId = 'competitions-list-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .comp-grid { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)) !important; gap: 25px !important; align-items: start; padding-bottom: 20px; }
      .comp-card { position: relative; width: 100%; min-height: 240px; padding: 20px; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; border-radius: 12px; transition: transform 0.2s; background: #fff; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
      .comp-card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
      .comp-card.archived-card { background: #f8fafc; border: 1px dashed #cbd5e1; opacity: 0.9; }
      .comp-card .icon svg { width:32px; height:32px; }
      .comp-title { font-size:18px; margin-top:8px; font-weight: 800; color: #0f172a; line-height: 1.3; }
      .comp-date { margin:4px 0 12px; color: #64748b; font-size: 13px; font-weight: 500; }
      .comp-label { font-size:11px; font-weight:800; text-transform: uppercase; letter-spacing: 0.5px; color:var(--muted); margin-top:auto; }
      .comp-loc { margin-top:2px; font-weight: 600; margin-bottom: 20px; color: #334155; }
      .comp-select { width:100%; text-align:center; padding:12px; border-radius:8px; font-weight: bold; font-size: 14px; background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; }
      .comp-select:hover { background: #e2e8f0; }
      
      .menu-dot { position:absolute; top:12px; right:12px; width:30px; height:30px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#475569; line-height:0; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size: 18px; font-weight: bold; }
      .menu-dot:hover { background: #f1f5f9; border-color: #94a3b8; }
      .menu-panel[hidden]{ display:none !important; }
      .menu-panel { position:absolute; right:12px; top:46px; z-index:10; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 8px; min-width: 240px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); }
      .menu-panel .ghostbtn { width:100%; text-align:left; padding: 10px 12px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; background: transparent; border-radius: 6px; color: #334155; }
      .menu-panel .ghostbtn:hover { background: #f1f5f9; color: #0f172a; }
      .menu-panel .danger { color:#ef4444; }
      .menu-panel .danger:hover { background: #fef2f2; color: #b91c1c; }
      .menu-panel .warning { color:#f59e0b; }
      .menu-panel .warning:hover { background: #fffbeb; color: #d97706; }
      .menu-panel .menu-sep { width:100%; border:none; border-top:1px solid #e2e8f0; margin:6px 0; }
    `;
    document.head.appendChild(style);
  }

  const bindMenuEvents = () => {
    if (!canEdit) return;

    const closeAll = () => root.querySelectorAll('.menu-panel').forEach(p => p.setAttribute('hidden',''));

    root.querySelectorAll('button[data-menu]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute('data-menu');
        const panel = root.querySelector('#' + CSS.escape(id));
        if(!panel) return;
        const willOpen = panel.hasAttribute('hidden');
        closeAll();
        if (willOpen) {
          panel.removeAttribute('hidden');
          btn.setAttribute('aria-expanded','true');
        } else {
          panel.setAttribute('hidden','');
          btn.setAttribute('aria-expanded','false');
        }
      });
    });

    document.addEventListener('click', (ev) => { if (!root.contains(ev.target)) closeAll(); }, true);

    root.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const act = btn.getAttribute('data-act');
        const id  = btn.getAttribute('data-id');

        if (act === 'edit') {
          location.hash = `#/competitions/new?id=${encodeURIComponent(id)}`;
          closeAll(); return;
        }
        if (act === 'relatorio') { 
          location.hash = `#/competitions/report?id=${encodeURIComponent(id)}`; 
          closeAll(); return; 
        }
        if (act === 'resultado') { 
          location.hash = `#/competitions/final-results?id=${encodeURIComponent(id)}`; 
          closeAll(); return; 
        }

        if (act === 'duplicate') {
          if (!confirm('Deseja criar uma cópia exata desta competição?\nAs Classes, Árbitros e Atletas serão copiados.\nOs Sorteios e Jogos NÃO serão copiados (nascerão zerados).\n\nA cópia nascerá como Oculta/Teste por padrão.')) return;
          try {
            activeListWrap.setAttribute('aria-busy','true');
            await API.duplicate(id);
            window.__toast?.('Competição duplicada com sucesso!', 'success');
          } catch (e) {
            window.__toast?.(e?.error || 'Falha ao duplicar', 'error');
          } finally {
            closeAll(); load(); 
          }
          return;
        }
        
        if (act === 'reset') {
          if (!confirm('Tem certeza que deseja APAGAR TODOS OS JOGOS, SORTEIOS e PLACARES desta competição?\nOs atletas inscritos serão mantidos intactos.')) return;
          try {
            await API.reset(id);
            window.__toast?.('Sorteios e Jogos apagados. Atletas mantidos.', 'info');
          } catch (e) {
            window.__toast?.(e?.error || 'Erro ao resetar', 'error');
          } finally {
            closeAll();
          }
          return;
        }

        if (act === 'delete') {
          if (!confirm('Excluir definitivamente esta competição? Esta ação não pode ser desfeita e apagará os atletas vinculados, as súmulas e o sorteio.')) return;
          try { 
              await API.remove(id); 
              window.__toast?.('Competição deletada.', 'info'); 
          } catch (e) { 
              window.__toast?.(e?.error || 'Falha ao deletar', 'error'); 
          } finally { 
              closeAll(); load(); 
          }
          return;
        }
      });
    });
  };

  const load = async () => {
    activeListWrap.setAttribute('aria-busy','true');
    archivedListWrap.setAttribute('aria-busy','true');
    
    try {
      const { items = [] } = await API.list({ q: qEl.value?.trim() });
      const auth = getAuth();
      await auth.authStateReady(); 
      const user = auth.currentUser;
      const uid = user ? user.uid : null;
      
      const myCompIds = new Set();
      
      let myName = "";
      let myCpf = "";
      let userEmail = user && user.email ? user.email.toLowerCase().trim() : null;

      const isGlobalAdmin = currentUser && currentUser.globalRole && currentUser.globalRole.includes('ADMIN');
      
      if (uid && !isGlobalAdmin && !canEdit) {
          try {
              const uDoc = await getDoc(doc(db, "users", uid));
              if (uDoc.exists()) {
                  myName = String(uDoc.data().nome || uDoc.data().name || '').toLowerCase().trim();
                  myCpf = String(uDoc.data().cpf || '').replace(/\D/g, '');
                  if (!userEmail && uDoc.data().email) userEmail = String(uDoc.data().email).toLowerCase().trim();
              }
              
              // 🔥 BUSCA UNIVERSAL NO CLIENTE PARA NÃO SER BLOQUEADO PELO FIREBASE
              const offSnap = await getDocs(collection(db, "competition_officials"));
              offSnap.forEach(d => {
                  const data = d.data();
                  const compId = data.competition_id || d.id;
                  const offList = data.officials || [];
                  
                  const cleanStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '');
                  const myCleanName = cleanStr(myName);

                  const isUserHere = offList.some(o => {
                      const oId = String(o.referee_id || o.uid || o.official_id || o.id || '');
                      const oEmail = String(o.email || '').toLowerCase().trim();
                      const oCpf = String(o.cpf || '').replace(/\D/g, '');
                      const oName = cleanStr(o.nome || o.nome_completo || o.nome_abreviado);
                      
                      if (uid && oId === String(uid)) return true;
                      if (userEmail && oEmail && oEmail === userEmail) return true;
                      if (myCpf && oCpf && oCpf === myCpf) return true;
                      if (myCleanName && oName && (oName === myCleanName || oName.includes(myCleanName) || myCleanName.includes(oName))) return true;
                      
                      return false;
                  });
                  
                  if (isUserHere) {
                      myCompIds.add(String(compId));
                  }
              });
          } catch(e) { console.warn("Erro ao buscar vínculos do usuário", e); }
      }
      
      const activeItems = items.filter(i => i.is_archived !== true && String(i.is_archived) !== "true");
      
      const archivedItems = items.filter(i => {
          const isArch = i.is_archived === true || String(i.is_archived) === "true";
          if (!isArch) return false;
          if (canEdit || isGlobalAdmin) return true; // Mostra para qualquer admin
          if (myCompIds.has(String(i.id))) return true; // Mostra se a rede de captura o achou lá dentro
          return false;
      });

      renderGrid(activeItems, activeListWrap, "Nenhum campeonato em andamento encontrado.");
      
      archivedItems.sort((a, b) => {
          const dA = new Date(a.data_inicio || a.start_date || a.created_at || 0).getTime();
          const dB = new Date(b.data_inicio || b.start_date || b.created_at || 0).getTime();
          return dB - dA;
      });

      if (archivedItems.length > 0) {
          archivedSection.style.display = 'block';
          renderGrid(archivedItems, archivedListWrap, "Nenhuma competição arquivada ou teste encontrada.");
      } else {
          archivedSection.style.display = 'none';
      }

      bindMenuEvents(); 
    } catch (e) {
      activeListWrap.innerHTML = `<p>Falha ao carregar lista de campeonatos.</p>`;
    } finally {
      activeListWrap.setAttribute('aria-busy','false');
      archivedListWrap.setAttribute('aria-busy','false');
    }
  };

  btnSearch.addEventListener('click', load);
  qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });

  await load();
}

// ============================================================
//   TELA 2: NOVA COMPETIÇÃO (E EDIÇÃO) (#/competitions/new)
// ============================================================

const state = {
  competitionId: null,
  allClasses: [],              
  selectedClassCodes: new Set(),  
  classesUI: null,              
};

export async function renderCompetitionNew(root, hash) {
  if (!canEditGlobal('competicoes')) {
      window.__toast?.('Acesso Negado.', 'error');
      location.hash = '#/competitions/load';
      return;
  }

  const currentHash = hash || window.location.hash;
  const { id } = getQuery(currentHash);
  
  state.competitionId = id;
  const isEdit = !!state.competitionId;

  root.innerHTML = `
    <section class="comp-new" style="max-width: 900px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
      <header style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
        <button type="button" id="btnBack" style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569; transition: 0.2s;">&larr; Voltar</button>
        <h1 id="compNewTitle" style="margin: 0; color: #0f172a; font-size: 24px;">Carregando...</h1>
      </header>

      <form id="compForm" style="background: #fff; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.05);" novalidate>
        <h3 style="margin-top: 0; color: #334155; margin-bottom: 20px; font-size: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">📋 Dados do Torneio</h3>
        
        <div style="display: flex; flex-direction: column; gap: 20px; margin-bottom: 30px;">
            <div>
              <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Nome da Competição <span style="color:red;">*</span></label>
              <input type="text" name="nome" id="fNome" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required />
            </div>
            
            <div>
              <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Local (Cidade/Ginásio) <span style="color:red;">*</span></label>
              <input type="text" name="local" id="fLocal" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required />
            </div>

            <div>
              <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Nível</label>
              <select name="nivel" id="fNivel" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;">
                <option value="">Selecione o nível</option>
                <option value="Local">Local</option>
                <option value="Estadual">Estadual</option>
                <option value="Regional">Regional</option>
                <option value="Nacional">Nacional</option>
                <option value="Internacional">Internacional</option>
              </select>
            </div>

            <div style="display: flex; gap: 30px;">
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Data Início <span style="color:red;">*</span></label>
                <input type="date" name="data_inicio" id="fDataIni" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required />
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; color: #475569; margin-bottom: 5px; font-size: 13px; text-transform: uppercase;">Data Fim <span style="color:red;">*</span></label>
                <input type="date" name="data_fim" id="fDataFim" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 15px;" required />
              </div>
            </div>

            <div style="margin-top: 10px; padding: 15px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 15px; color: #334155; margin: 0; font-weight: bold;">
                    <input type="checkbox" name="is_archived" id="fArchived" style="width: 20px; height: 20px; cursor: pointer; accent-color: #3b82f6;" />
                    Ocultar do Público (Marcar como Competição Arquivada ou de Teste)
                </label>
                <p style="margin: 6px 0 0 30px; font-size: 12px; color: #64748b;">Se marcado, este campeonato não aparecerá na tela inicial para árbitros comuns e visitantes, ficando visível apenas para os Administradores.</p>
            </div>
        </div>

        <h3 style="margin-top: 0; color: #334155; margin-bottom: 10px; font-size: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">🏷️ Classes da Competição <span style="color:red;">*</span></h3>
        <p style="font-size: 13px; color: #64748b; margin-top: 0; margin-bottom: 15px;">Clique na caixa abaixo para adicionar ou remover as classes que farão parte do torneio.</p>
        
        <div id="classesSelectorContainer" style="position: relative; margin-bottom: 30px;">
          <div class="multi-select-container" style="min-height: 50px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; cursor: pointer; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; transition: border-color 0.2s;">
            <span class="multi-select-placeholder" style="color: #94a3b8; font-style: italic;">Carregando classes disponíveis...</span>
          </div>
          <div class="multi-select-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; max-height: 250px; overflow-y: auto; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.15); margin-top: 5px;"></div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 15px; border-top: 2px solid #e2e8f0; padding-top: 20px;">
          <button type="button" id="btnCancel" style="background: transparent; border: 1px solid #94a3b8; color: #475569; padding: 12px 25px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s;">Cancelar</button>
          <button type="submit" id="btnSave" style="background: #3b82f6; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 4px 6px rgba(59,130,246,0.3); transition: 0.2s;">
            ${isEdit ? '💾 Salvar Alterações' : '✨ Criar Competição'}
          </button>
        </div>
      </form>
    </section>
  `;

  const titleEl = root.querySelector('#compNewTitle');
  titleEl.textContent = isEdit ? 'Editar Competição' : 'Nova Competição';

  const btnBack = root.querySelector('#btnBack');
  const btnCancel = root.querySelector('#btnCancel');
  
  const backUrl = isEdit ? `#/competitions/view?id=${state.competitionId}` : '#/competitions/load';
  btnBack.addEventListener('click', () => { location.hash = backUrl; });
  btnCancel.addEventListener('click', () => { location.hash = backUrl; });

  const form = root.querySelector('#compForm');
  const classesSelectorContainer = root.querySelector('#classesSelectorContainer');
  const chipsContainer = classesSelectorContainer.querySelector('.multi-select-container');
  const dropdown = classesSelectorContainer.querySelector('.multi-select-dropdown');
  const btnSave = root.querySelector('#btnSave');

  state.classesUI = { chipsContainer, dropdown };

  btnBack.addEventListener('mouseover', () => btnBack.style.background = '#e2e8f0');
  btnBack.addEventListener('mouseout', () => btnBack.style.background = '#f1f5f9');
  btnSave.addEventListener('mouseover', () => btnSave.style.background = '#2563eb');
  btnSave.addEventListener('mouseout', () => btnSave.style.background = '#3b82f6');

  chipsContainer.addEventListener('click', (ev) => {
    ev.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    chipsContainer.style.borderColor = dropdown.style.display === 'block' ? '#3b82f6' : '#cbd5e1';
  });
  
  document.addEventListener('click', (ev) => {
    if (!classesSelectorContainer.contains(ev.target)) {
      dropdown.style.display = 'none';
      chipsContainer.style.borderColor = '#cbd5e1';
    }
  });

  function renderClassDropdownOptions() {
    dropdown.innerHTML = '';
    const classesJaRenderizadas = new Set();

    state.allClasses.forEach((cls) => {
      const code = (cls.code || cls.codigo || cls.class_code || cls.id || '').trim();
      if (!code || classesJaRenderizadas.has(code)) return; 
      classesJaRenderizadas.add(code);

      const isSelected = state.selectedClassCodes.has(code);
      const option = document.createElement('div');
      option.style.padding = '12px 15px';
      option.style.cursor = 'pointer';
      option.style.borderBottom = '1px solid #f1f5f9';
      option.style.background = isSelected ? '#eff6ff' : '#fff';
      option.style.fontWeight = isSelected ? 'bold' : 'normal';
      option.style.color = isSelected ? '#2563eb' : '#334155';
      
      option.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events: none; transform: scale(1.2);"> 
            <span>${code} ${cls.name || cls.nome || cls.description || ''}</span>
        </div>
      `;
      
      option.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (state.selectedClassCodes.has(code)) state.selectedClassCodes.delete(code);
        else state.selectedClassCodes.add(code);
        renderSelectedClassChips();
        renderClassDropdownOptions();
      });
      
      dropdown.appendChild(option);
    });
  }

  function renderSelectedClassChips() {
    chipsContainer.innerHTML = '';

    if (state.selectedClassCodes.size === 0) {
      chipsContainer.innerHTML = '<span style="color: #94a3b8; font-style: italic;">Clique aqui para selecionar classes...</span>';
      return;
    }

    state.selectedClassCodes.forEach((code) => {
      const chip = document.createElement('div');
      chip.style.background = '#0f172a';
      chip.style.color = '#fff';
      chip.style.padding = '6px 12px';
      chip.style.borderRadius = '20px';
      chip.style.fontSize = '13px';
      chip.style.fontWeight = 'bold';
      chip.style.display = 'flex';
      chip.style.alignItems = 'center';
      chip.style.gap = '8px';
      chip.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

      const text = document.createElement('span');
      text.textContent = code; 

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.innerHTML = '&times;';
      closeBtn.style.background = 'transparent';
      closeBtn.style.border = 'none';
      closeBtn.style.color = '#fca5a5';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontSize = '18px';
      closeBtn.style.lineHeight = '1';
      closeBtn.style.padding = '0';
      closeBtn.title = "Remover classe";
      
      closeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.selectedClassCodes.delete(code);
        renderSelectedClassChips();
        renderClassDropdownOptions();
      });

      chip.appendChild(text);
      chip.appendChild(closeBtn);
      chipsContainer.appendChild(chip);
    });
  }

  try {
    const [dd, existingComp, compCls] = await Promise.all([
      API.getClassesDropdown(),
      isEdit ? API.getCompetition(state.competitionId) : Promise.resolve(null),
      isEdit ? API.getCompetitionClasses(state.competitionId) : Promise.resolve(null),
    ]);

    state.allClasses = dd.items || dd.data || [];

    if (isEdit && existingComp) {
      form.fNome.value = existingComp.nome || existingComp.name || '';
      form.fLocal.value = existingComp.local || '';
      form.fDataIni.value = toInputDate(existingComp.data_inicio || existingComp.start_date);
      form.fDataFim.value = toInputDate(existingComp.data_fim || existingComp.end_date);
      if (form.fNivel && existingComp.nivel) form.fNivel.value = existingComp.nivel;
      
      form.fArchived.checked = existingComp.is_archived === true || String(existingComp.is_archived) === "true";
    }

    state.selectedClassCodes.clear();
    
    if (isEdit && compCls) {
      const items = compCls.items || compCls.data || [];
      items.forEach((c) => {
        const code = (c.class_code || c.code || c.codigo || '').trim();
        if (code) state.selectedClassCodes.add(code);
      });
    }

    renderClassDropdownOptions();
    renderSelectedClassChips();
  } catch (err) {
    console.error(err);
    chipsContainer.innerHTML = `<span style="color:red; font-weight:bold;">Erro ao carregar dados do servidor.</span>`;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = form.fNome.value.trim();
    const local = form.fLocal.value.trim();
    const nivel = form.fNivel.value || null; 
    const data_inicio = fromInputDate(form.fDataIni.value);
    const data_fim = fromInputDate(form.fDataFim.value);
    const is_archived = form.fArchived.checked; 

    if (!nome || !local || !data_inicio || !data_fim) {
      showFormError(form, 'Atenção: Preencha Nome, Local e as Datas de Início e Fim.');
      return;
    }

    const classes = Array.from(state.selectedClassCodes);

    const payload = { 
        nome, name: nome, local, nivel, 
        data_inicio, start_date: data_inicio, 
        data_fim, end_date: data_fim, 
        classes, is_archived 
    };

    if (classes.length === 0) {
      showFormError(form, 'Atenção: Você precisa selecionar pelo menos uma Classe para esta competição.');
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Aguarde... Salvando...';

    try {
      if (isEdit) {
        await API.updateCompetition(state.competitionId, payload);
        window.__toast?.('Competição atualizada com sucesso!', 'success');
        location.hash = `#/competitions/view?id=${state.competitionId}`;
      } else {
        await API.createCompetition(payload);
        window.__toast?.('Competição criada com sucesso!', 'success');
        location.hash = '#/competitions/load';
      }
    } catch (err) {
      console.error(err);
      showFormError(form, err?.error || 'Ocorreu um erro ao salvar no banco de dados. Tente novamente.');
      btnSave.disabled = false;
      btnSave.textContent = isEdit ? '💾 Salvar Alterações' : '✨ Criar Competição';
    }
  });
}

export const renderCompetitionEdit = renderCompetitionNew;
export default { renderLoadCompetition, renderCompetitionNew };