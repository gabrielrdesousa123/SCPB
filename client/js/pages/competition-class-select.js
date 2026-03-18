// client/js/pages/competition-class-select.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionClassSelect(root, { competitionId, classCode }) {
  const safeCompId = String(competitionId || '').trim();
  const safeClassCode = String(classCode || '').trim();

  if (!safeCompId || !safeClassCode) {
    root.innerHTML = `<div class="alert alert-danger">Erro: Dados da competição ou classe inválidos.</div>`;
    return;
  }

  const classCodeUp = safeClassCode.toUpperCase();
  let initialIsTeamEvent = classCodeUp.includes('PAR') || classCodeUp.includes('PAIR') || classCodeUp.includes('EQUIP') || classCodeUp.includes('TEAM');

  const modalState = {
    competitionId: safeCompId,
    classCode: safeClassCode,
    bibBase: null, 
    isTeamEvent: initialIsTeamEvent,
    athletes: [],
    competitions: [],
    sortKey: 'pos',
    sortDir: 'asc',
    filterRegion: '',
    filterClub: '',
    filterName: '',
    athletesForDraw: [],
  };

  const qs = (selector) => root.querySelector(selector);
  const qsAll = (selector) => root.querySelectorAll(selector);

  const toastSafe = (message, type = 'info') => {
    const fn = window.toast || window.__toast;
    if (typeof fn === 'function') fn(message, type);
    else console.warn(`Toast: ${message} (${type})`);
  };

  function escapeHTML(s = '') {
    return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function normalize(s) {
    return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function getField(a, key) {
    if (!a) return '';
    if (key === 'pos') return a.pos;
    if (key === 'c1') return a.c1;
    if (key === 'c2') return a.c2;
    if (key === 'c3') return a.c3;
    if (key === 'nome') return a.nome;
    if (key === 'clube_nome') return a.clube_nome;
    if (key === 'regiao') return a.regiao;
    if (key === 'id') return a.id;
    return a[key];
  }

  function sortedAthletes(list, key, dir) {
    const mul = dir === 'asc' ? 1 : -1;
    const arr = [...(list || [])];
    arr.sort((a, b) => {
      const va = getField(a, key);
      const vb = getField(b, key);
      if (['pos', 'c1', 'c2', 'c3', 'id'].includes(key)) {
        const na = toNum(va), nb = toNum(vb);
        if (na == null && nb == null) return 0;
        if (na == null) return 1;
        if (nb == null) return -1;
        return (na - nb) * mul;
      }
      const sa = normalize(va), sb = normalize(vb);
      if (sa < sb) return -1 * mul;
      if (sa > sb) return 1 * mul;
      return 0;
    });
    return arr;
  }

  function generateBib(item, position) {
    if (modalState.bibBase) {
        const match = String(modalState.bibBase).match(/^(.*?)(\d+)$/);
        if (match) {
            const prefix = match[1]; 
            const baseNum = parseInt(match[2], 10); 
            const finalNum = baseNum + position; 
            const paddedNum = String(finalNum).padStart(match[2].length, '0');
            return `${prefix}${paddedNum}`;
        } else {
            return `${modalState.bibBase}${String(position).padStart(2, '0')}`;
        }
    }

    const pad2 = n => String(n).padStart(2, '0');

    if (modalState.isTeamEvent) {
        if (classCodeUp.includes('BC3')) return `3${pad2(position)}`;
        if (classCodeUp.includes('BC4')) return `4${pad2(position)}`;
        return `1${pad2(position)}`; 
    }

    const g = String(item.genero || item.sexo || '').toUpperCase();
    const genderDigit = (g === 'F' || g.startsWith('FEM')) ? '1' : ((g === 'M' || g.startsWith('MAS')) ? '2' : '9');
    
    const m = String(item.classe_code || modalState.classCode || '').toUpperCase().match(/BC(\d)/);
    const classDigit = m ? m[1] : '9';
    
    return `${genderDigit}${classDigit}${pad2(position)}`;
  }

  function getRankJustification(item) {
    if (item.c1 != null) return `C1-${String(item.c1).padStart(2, '0')}`;
    if (item.c2 != null) return `C2-${String(item.c2).padStart(2, '0')}`;
    if (item.c3 != null) return `C3-${String(item.c3).padStart(2, '0')}`;
    return 'S/R';
  }

  const STORAGE_KEY = `draw_selection_${safeCompId}_${safeClassCode}`;

  async function saveState() {
    const state = { athletesForDraw: modalState.athletesForDraw, timestamp: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    
    try {
        const docRef = doc(db, "competition_athletes", `${safeCompId}_${safeClassCode}`);
        await setDoc(docRef, {
            competition_id: safeCompId,
            class_code: safeClassCode,
            athletes: modalState.athletesForDraw
        });
    } catch(e) { console.error("Erro ao salvar seleção", e); }
  }

  async function loadState() {
    let loadedFromSession = false;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (Date.now() - (state.timestamp || 0) < 24 * 60 * 60 * 1000) { 
          modalState.athletesForDraw = state.athletesForDraw || [];
          loadedFromSession = modalState.athletesForDraw.length > 0;
        }
      }
    } catch (e) {}
    
    if (!loadedFromSession) {
        try {
            const docRef = doc(db, "competition_athletes", `${safeCompId}_${safeClassCode}`);
            const snap = await getDoc(docRef);
            if (snap.exists() && snap.data().athletes) {
                modalState.athletesForDraw = snap.data().athletes || [];
                return true;
            }
        } catch(e) { console.error(e); }
    }
    return loadedFromSession;
  }

  async function clearState() {
    sessionStorage.removeItem(STORAGE_KEY);
    try {
        await deleteDoc(doc(db, "competition_athletes", `${safeCompId}_${safeClassCode}`));
    } catch(e) {}
  }

  function fixBibsAutomatically() {
    modalState.athletesForDraw.sort((a, b) => a.pos - b.pos);
    modalState.athletesForDraw.forEach((a, idx) => {
      if (!a.manualBib) a.bib = generateBib(a, idx + 1);
    });
  }

  const API = {
    // 🔥 REGRA DE OURO APLICADA: Filtra Arquivados e Ordena por Data
    fetchCompetitionsDropdown: async () => {
      try {
        const snap = await getDocs(collection(db, "competitions"));
        let comps = snap.docs.map(doc => {
            const d = doc.data();
            return { 
                id: d.id || doc.id, 
                nome: d.name || d.nome,
                is_archived: d.is_archived,
                historica_csv: d.historica_csv,
                data_inicio: d.data_inicio || d.start_date || '',
                created_at: d.created_at || ''
            };
        });

        // 1. Esconde Arquivadas e Testes
        comps = comps.filter(c => 
            c.is_archived !== true && String(c.is_archived) !== "true" &&
            c.historica_csv !== true && String(c.historica_csv) !== "true"
        );

        // 2. Ordena pelas mais recentes no topo (Data de Início)
        comps.sort((a, b) => {
            const dateA = new Date(a.data_inicio || a.created_at || 0).getTime();
            const dateB = new Date(b.data_inicio || b.created_at || 0).getTime();
            return dateB - dateA;
        });

        return comps;
      } catch (e) { return []; }
    },
    
    fetchAthletesPreview: async (classCode, crit1, crit2, crit3) => {
      try {
        const classSnap = await getDocs(collection(db, "classes"));
        let targetGenders = null;
        let targetClassesArray = [];

        classSnap.forEach(doc => {
            const data = doc.data();
            const dbCode = String(data.codigo || data.code || doc.id).toUpperCase().trim();
            const dbName = String(data.nome || data.name || '').toUpperCase().trim();
            
            if (dbCode === classCodeUp) {
                targetGenders = String(data.genders || data.genero || 'MF').toUpperCase(); 
                modalState.bibBase = data.bib_base || null; 

                if (data.class_group && data.class_group.trim() !== '') {
                    targetClassesArray = data.class_group.split(',').map(c => c.trim().toUpperCase());
                } else {
                    const baseClassMatch = dbCode.match(/BC\d/);
                    targetClassesArray = baseClassMatch ? [baseClassMatch[0]] : [dbCode];
                }

                if (dbName.includes('PAR') || dbName.includes('PAIR') || dbName.includes('EQUIP') || dbName.includes('TEAM')) {
                    modalState.isTeamEvent = true;
                }
            }
        });

        if (!targetGenders) {
             if (classCodeUp.endsWith('F') || classCodeUp.includes('FEM')) targetGenders = 'F';
             else if (classCodeUp.endsWith('M') || classCodeUp.includes('MAS')) targetGenders = 'M';
             else targetGenders = 'MF'; 
             
             const baseClassMatch = classCodeUp.match(/BC\d/);
             targetClassesArray = baseClassMatch ? [baseClassMatch[0]] : [classCodeUp];
        }

        const thNome = qs('#th-nome');
        if (thNome) thNome.innerHTML = modalState.isTeamEvent ? 'Equipes / Pares ↕' : 'Atleta ↕';

        const historicoMap = {}; 
        const fetchHistorico = async (compId, critKey) => {
          if (!compId) return;
          const qStr = query(collection(db, "historical_results")); 
          const snap = await getDocs(qStr);
          snap.forEach(doc => {
             const d = doc.data();
             if (String(d.competition_id) === String(compId)) {
                 const aId = String(d.athlete_id);
                 if (!historicoMap[aId]) historicoMap[aId] = {};
                 historicoMap[aId][critKey] = Number(d.rank || d.posicao);
             }
          });
        };

        await Promise.all([
          fetchHistorico(crit1, 'c1'),
          fetchHistorico(crit2, 'c2'),
          fetchHistorico(crit3, 'c3')
        ]);

        let listData = [];

        if (modalState.isTeamEvent) {
             let teamCategoryMatch = 'TEAM_BC1_BC2';
             if (classCodeUp.includes('BC3')) teamCategoryMatch = 'PAIR_BC3';
             else if (classCodeUp.includes('BC4')) teamCategoryMatch = 'PAIR_BC4';

             const allAthletesSnap = await getDocs(collection(db, "atletas"));
             const athMap = {};
             allAthletesSnap.docs.forEach(d => { athMap[d.id] = d.data(); });

             const snap = await getDocs(collection(db, "equipes"));
             snap.docs.forEach(doc => {
                 const data = doc.data();
                 if (data.category !== teamCategoryMatch) return;

                 const oldId = doc.id;
                 const ranks = historicoMap[oldId] || {};

                 let repFull = data.rep_value_name || data.club_sigla || 'Sem Clube';
                 if (data.rep_type === 'REGIAO' || data.rep_type === 'ESTADO') {
                     repFull = `Seleção ${data.rep_value}`;
                 }

                 const athNames = (data.athletes || []).map(id => {
                     const a = athMap[id];
                     return a ? a.nome : 'Desconhecido';
                 }).join(', ');

                 listData.push({
                    id: doc.id,
                    firebase_id: doc.id,
                    nome: data.nome || data.name,
                    clube_nome: repFull,
                    sigla: data.club_sigla || data.sigla || '',
                    clube_sigla: data.club_sigla || data.sigla || '',
                    regiao: (data.rep_type === 'REGIAO' || data.rep_type === 'ESTADO') ? data.rep_value : '—',
                    genero: 'MF',
                    classe_code: data.category === 'TEAM_BC1_BC2' ? 'Equipe BC1/BC2' : (data.category === 'PAIR_BC3' ? 'Par BC3' : 'Par BC4'),
                    c1: ranks.c1 || null,
                    c2: ranks.c2 || null,
                    c3: ranks.c3 || null,
                    pos: 0,
                    team_athletes_names: athNames
                 });
             });
        } else {
             const clubesSnap = await getDocs(collection(db, "clubes"));
             const clubesMap = {};
             clubesSnap.forEach(d => { clubesMap[d.id] = d.data(); });

             const allAthletesSnap = await getDocs(collection(db, "atletas"));
             
             allAthletesSnap.docs.forEach(doc => {
                 const data = doc.data();
                 const athClass = String(data.classe_code || '').toUpperCase().trim();
                 const athGender = String(data.genero || data.sexo || '').toUpperCase().trim();

                 let matchesClass = false;
                 for (const tClass of targetClassesArray) {
                     if (athClass.includes(tClass)) {
                         matchesClass = true;
                         break;
                     }
                 }
                 if (!matchesClass) return;

                 if (targetGenders && targetGenders !== 'MF' && targetGenders !== 'M/F' && targetGenders !== 'MISTO') {
                     const isAthFemale = athGender === 'F' || athGender === 'FEMININO' || athGender.startsWith('FEM');
                     const isAthMale = athGender === 'M' || athGender === 'MASCULINO' || athGender.startsWith('MAS');
                     
                     if (targetGenders === 'M' && !isAthMale) return;
                     if (targetGenders === 'F' && !isAthFemale) return;
                 }

                 const clube = clubesMap[data.clube_id] || {};
                 const oldId = data.id !== undefined ? String(data.id) : doc.id;
                 const ranks = historicoMap[oldId] || historicoMap[doc.id] || {};

                 listData.push({
                     id: doc.id,
                     firebase_id: doc.id,
                     nome: data.nome,
                     clube_nome: clube.nome || '—',
                     sigla: clube.sigla || '',
                     clube_sigla: clube.sigla || '',
                     regiao: clube.regiao || data.regiao || '—',
                     genero: data.genero || data.sexo || '',
                     classe_code: data.classe_code,
                     c1: ranks.c1 || null,
                     c2: ranks.c2 || null,
                     c3: ranks.c3 || null,
                     pos: 0
                 });
             });
        }

        listData.sort((a, b) => {
          if ((a.c1 || 999) !== (b.c1 || 999)) return (a.c1 || 999) - (b.c1 || 999);
          if ((a.c2 || 999) !== (b.c2 || 999)) return (a.c2 || 999) - (b.c2 || 999);
          if ((a.c3 || 999) !== (b.c3 || 999)) return (a.c3 || 999) - (b.c3 || 999);
          return a.nome.localeCompare(b.nome);
        });
        
        return listData.map((a, idx) => ({ ...a, pos: idx + 1 }));
      } catch (e) { 
        throw new Error("Falha ao cruzar dados no Firebase: " + e.message); 
      }
    }
  };

  function renderAthleteTable() {
    const tbody = qs('#bcms-tbody');
    if (!tbody) return;

    const available = modalState.athletes.filter(a => 
      !modalState.athletesForDraw.some(d => d.firebase_id === a.firebase_id)
    );

    const filtered = available.filter(a => {
      const n = normalize(a.nome).includes(normalize(modalState.filterName));
      const r = normalize(a.regiao).includes(normalize(modalState.filterRegion));
      const c = normalize(a.clube_nome).includes(normalize(modalState.filterClub));
      return n && r && c;
    });

    const sorted = sortedAthletes(filtered, modalState.sortKey, modalState.sortDir);

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4">Nenhum participante disponível.</td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.map(a => `
      <tr>
        <td class="text-center">${a.pos}</td>
        <td style="min-width: 320px;">
          <div style="display: flex; flex-direction: column;">
            <div style="display: flex; align-items: center; gap: 8px;">
               <strong>${escapeHTML(a.nome)}</strong>
               <span style="font-size: 0.85em; font-weight: bold; color: #555; background: #eee; padding: 2px 5px; border-radius: 4px;">
                 ${escapeHTML(a.sigla || a.clube_sigla || '')}
               </span>
               ${!modalState.isTeamEvent ? `
                 <span style="font-size: 0.75em; color: #fff; background: #3b82f6; padding: 2px 4px; border-radius: 4px;">
                   ${escapeHTML(a.classe_code)}
                 </span>
               ` : ''}
            </div>
            <small style="color: #777; margin-top:2px;">${escapeHTML(a.clube_nome)}</small>
            ${modalState.isTeamEvent && a.team_athletes_names ? `
                <small style="color: #64748b; font-size: 10.5px; margin-top: 3px; line-height: 1.2;">
                    👥 ${escapeHTML(a.team_athletes_names)}
                </small>
            ` : ''}
          </div>
        </td>
        <td class="text-center">${escapeHTML(a.regiao)}</td>
        <td class="text-center" style="padding: 10px 20px; font-weight: 500;">
          ${a.c1??'-'} / ${a.c2??'-'} / ${a.c3??'-'}
        </td>
        <td class="text-center">
          <button class="btn btn-primary btn-sm add-btn" data-id="${a.firebase_id}">Adicionar</button>
        </td>
      </tr>
    `).join('');
  }

  function renderDrawList() {
    const tbody = qs('#draw-list-tbody');
    if (!tbody) return;

    qs('#draw-list-count').textContent = modalState.athletesForDraw.length;
    const btnSorteio = qs('#btn-realizar-sorteio');
    const btnLimpar = qs('#btn-limpar-selecao');
    const btnGerarBib = qs('#btn-gerar-bib');

    if (btnSorteio) btnSorteio.disabled = modalState.athletesForDraw.length === 0;
    if (btnLimpar) btnLimpar.disabled = modalState.athletesForDraw.length === 0;
    if (btnGerarBib) btnGerarBib.disabled = modalState.athletesForDraw.length === 0;

    if (modalState.athletesForDraw.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4">Lista de sorteio vazia.</td></tr>`;
      return;
    }

    const sortedDraw = [...modalState.athletesForDraw].sort((a, b) => a.pos - b.pos);

    tbody.innerHTML = sortedDraw.map((a, idx) => `
      <tr>
        <td class="text-center">
          <input type="text" class="form-control form-control-sm text-center fw-bold bib-input"
                 style="width: 75px; margin: 0 auto; ${a.manualBib ? 'border-color: #f59e0b; background-color: #fffbeb; color: #b45309;' : ''}"
                 data-id="${a.firebase_id}"
                 value="${escapeHTML(a.bib || '')}"
                 placeholder="BIB">
        </td>
        <td>
            <div style="font-weight:bold;">${escapeHTML(a.nome)} ${!modalState.isTeamEvent ? `<small style="color: #64748b; font-weight:normal;">(${escapeHTML(a.classe_code)})</small>` : ''}</div>
            ${modalState.isTeamEvent && a.team_athletes_names ? `<div style="font-size:10px; color:#64748b; margin-top:2px;">👥 ${escapeHTML(a.team_athletes_names)}</div>` : ''}
        </td>
        <td class="text-center"><small>${getRankJustification(a)}</small></td>
        <td class="text-center">
          <button class="btn btn-sm btn-danger remove-btn" data-id="${a.firebase_id}">Remover</button>
        </td>
      </tr>
    `).join('');
  }

  const loadAthletes = async () => {
    try {
      const c1 = qs('#bcms-crit1')?.value || '';
      const c2 = qs('#bcms-crit2')?.value || '';
      const c3 = qs('#bcms-crit3')?.value || '';
      
      const btn = qs('#bcms-crit1'); 
      if (btn) btn.disabled = true; 
      
      modalState.athletes = await API.fetchAthletesPreview(modalState.classCode, c1, c2, c3);
      
      modalState.athletesForDraw.forEach(ad => {
          const updated = modalState.athletes.find(a => a.firebase_id === ad.firebase_id);
          if (updated) { ad.c1 = updated.c1; ad.c2 = updated.c2; ad.c3 = updated.c3; ad.pos = updated.pos; }
      });

      renderAthleteTable();
      renderDrawList();
      
      if (btn) btn.disabled = false;
    } catch (e) {
      toastSafe(e.message, 'error');
    }
  };

  function setupEventListeners() {
    const onFilter = () => {
      modalState.filterRegion = qs('#bcms-filter-region').value;
      modalState.filterClub = qs('#bcms-filter-club').value;
      modalState.filterName = qs('#bcms-filter-name').value;
      renderAthleteTable();
    };

    qsAll('.f-input').forEach(i => i.addEventListener('input', onFilter));
    qsAll('.c-select').forEach(s => s.addEventListener('change', loadAthletes));

    qsAll('th[data-sort]').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (modalState.sortKey === key) {
          modalState.sortDir = modalState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          modalState.sortKey = key;
          modalState.sortDir = 'asc';
        }
        renderAthleteTable();
      });
    });

    qs('#draw-list-tbody')?.addEventListener('input', (e) => {
      if (e.target.classList.contains('bib-input')) {
        const fId = e.target.dataset.id;
        const athlete = modalState.athletesForDraw.find(a => a.firebase_id === fId);
        if (athlete) {
          athlete.bib = e.target.value.trim();
          athlete.manualBib = true; 
          saveState();
          e.target.style.borderColor = '#f59e0b';
          e.target.style.backgroundColor = '#fffbeb';
          e.target.style.color = '#b45309';
        }
      }
    });

    qs('#bcms-tbody').addEventListener('click', (e) => {
      const btn = e.target.closest('.add-btn');
      if (!btn) return;
      const fId = btn.dataset.id;
      const athlete = modalState.athletes.find(a => a.firebase_id === fId);
      if (athlete) {
        modalState.athletesForDraw.push({...athlete, manualBib: false});
        fixBibsAutomatically(); 
        saveState();
        renderAthleteTable();
        renderDrawList();
      }
    });

    qs('#draw-list-tbody').addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-btn');
      if (!btn) return;
      const fId = btn.dataset.id;
      modalState.athletesForDraw = modalState.athletesForDraw.filter(a => a.firebase_id !== fId);
      fixBibsAutomatically(); 
      saveState();
      renderAthleteTable();
      renderDrawList();
    });

    qs('#btn-limpar-selecao')?.addEventListener('click', async () => {
      if (confirm('Deseja realmente limpar toda a seleção?')) {
        modalState.athletesForDraw = [];
        await clearState();
        renderAthleteTable();
        renderDrawList();
      }
    });

    qs('#btn-gerar-bib')?.addEventListener('click', () => {
      if (modalState.athletesForDraw.length === 0) return;
      modalState.athletesForDraw.forEach(a => { a.manualBib = false; });
      fixBibsAutomatically();
      saveState();
      renderDrawList();
      toastSafe('Todos os BIBs foram recalculados de acordo com o Ranking!', 'success');
    });

    qs('#btn-realizar-sorteio').addEventListener('click', async () => {
      if (modalState.athletesForDraw.length === 0) return;
      
      const exactKey = `draw_athletes_${modalState.competitionId}_${modalState.classCode}`;
      sessionStorage.setItem(exactKey, JSON.stringify({
        athletesForDraw: modalState.athletesForDraw,
        competitionId: modalState.competitionId,
        classCode: modalState.classCode,
        timestamp: Date.now()
      }));

      await saveState();
      location.hash = `#/competitions/draw?id=${encodeURIComponent(modalState.competitionId)}&class=${encodeURIComponent(modalState.classCode)}`;
    });

    // 🔥 EVENTOS DO MODAL DE IMPORTAÇÃO
    qs('#btn-open-import')?.addEventListener('click', async () => {
      const modal = qs('#modal-import-class');
      const sel = qs('#import-comp-select');
      sel.innerHTML = '<option value="">Carregando...</option>';
      modal.showModal();
      
      try {
        const comps = await API.fetchCompetitionsDropdown();
        sel.innerHTML = '<option value="">-- Selecione uma Competição --</option>' + 
          comps.filter(c => String(c.id) !== String(modalState.competitionId))
               .map(c => `<option value="${c.id}">${escapeHTML(c.nome)}</option>`).join('');
      } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar</option>';
      }
    });

    qs('#btn-import-class-cancel')?.addEventListener('click', () => {
      qs('#modal-import-class').close();
    });

    qs('#btn-import-class-confirm')?.addEventListener('click', async () => {
      const sel = qs('#import-comp-select');
      const sourceId = sel.value;
      if (!sourceId) return alert("Selecione um campeonato de origem primeiro!");
      
      const btnConf = qs('#btn-import-class-confirm');
      btnConf.disabled = true;
      btnConf.textContent = "A importar...";
      
      try {
         let importedAthletes = [];

         try {
             const docRef = doc(db, "competition_athletes", `${sourceId}_${modalState.classCode}`);
             const snap = await getDoc(docRef);
             if (snap.exists() && snap.data().athletes) {
                 importedAthletes = snap.data().athletes;
             }
         } catch(e) {}

         if (importedAthletes.length === 0) {
             const ids = [String(sourceId), Number(sourceId)];
             for (let id of ids) {
                 if(importedAthletes.length > 0) break;
                 try {
                     const qDraw = query(collection(db, "draws"), where("competition_id", "==", id), where("class_code", "==", modalState.classCode));
                     const snapDraw = await getDocs(qDraw);
                     if (!snapDraw.empty) {
                         const drawData = snapDraw.docs[0].data();
                         if (drawData.seeds) drawData.seeds.forEach(s => { if (s && s.id !== 'BYE' && s.firebase_id) importedAthletes.push(s); });
                         if (drawData.groups) drawData.groups.forEach(g => {
                             if (g.players) g.players.forEach(p => { if (p && p.id !== 'BYE' && p.firebase_id) importedAthletes.push(p); });
                         });
                     }
                 } catch(e) {}
             }
         }

         if (importedAthletes.length === 0) {
             const colecoes = ["competition_athletes", "inscriptions", "inscritos", "inscricoes", "participantes"];
             for (const col of colecoes) {
                 if(importedAthletes.length > 0) break;
                 const fks = ["competition_id", "comp_id", "id_competicao"];
                 for (const fk of fks) {
                     if(importedAthletes.length > 0) break;
                     for (let id of [String(sourceId), Number(sourceId)]) {
                         try {
                             const qStr = query(collection(db, col), where(fk, "==", id));
                             const resStr = await getDocs(qStr);
                             resStr.forEach(d => {
                                 const data = d.data();
                                 const dataCode = String(data.class_code || data.codigo_classe || data.classe_code || '').trim();
                                 if (dataCode === modalState.classCode) {
                                     if (data.athletes && Array.isArray(data.athletes)) {
                                         importedAthletes = importedAthletes.concat(data.athletes);
                                     } else if (data.firebase_id || data.id) {
                                         importedAthletes.push(data);
                                     }
                                 }
                             });
                         } catch(e) {}
                     }
                 }
             }
         }

         if (importedAthletes.length === 0) {
             toastSafe("Nenhum atleta inscrito nesta classe no campeonato selecionado.", "warning");
         } else {
             let addedCount = 0;
             importedAthletes.forEach(imp => {
                 if (!modalState.athletesForDraw.some(a => a.firebase_id === imp.firebase_id || a.id === imp.id)) {
                     modalState.athletesForDraw.push({...imp, manualBib: false});
                     addedCount++;
                 }
             });
             
             if (addedCount > 0) {
                 fixBibsAutomatically();
                 await saveState(); 
                 renderAthleteTable();
                 renderDrawList();
                 toastSafe(`${addedCount} atletas importados com sucesso!`, "success");
             } else {
                 toastSafe("Todos os atletas daquele campeonato já estão na sua lista.", "info");
             }
         }
         qs('#modal-import-class').close();
      } catch(e) {
         alert("Erro na importação: " + e.message);
      } finally {
         btnConf.disabled = false;
         btnConf.textContent = "✅ Confirmar";
      }
    });
  }

  async function init() {
    const listTitle = modalState.isTeamEvent ? 'Equipes / Pares ↕' : 'Atleta ↕';
    
    root.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 20px;">
          <h3 style="margin: 0; white-space: nowrap;">Sorteio: Classe ${escapeHTML(modalState.classCode)}</h3>
          
          <div style="display: flex; align-items: flex-end; gap: 15px; flex-grow: 1; justify-content: flex-end;">
            <div style="min-width: 150px;">
              <label class="form-label mb-1 small" style="display: block;">Critério Histórico 1 (Maior Peso)</label>
              <select id="bcms-crit1" class="form-select form-select-sm c-select" style="width: 100%;"></select>
            </div>
            <div style="min-width: 150px;">
              <label class="form-label mb-1 small" style="display: block;">Critério Histórico 2</label>
              <select id="bcms-crit2" class="form-select form-select-sm c-select" style="width: 100%;"></select>
            </div>
            <div style="min-width: 150px;">
              <label class="form-label mb-1 small" style="display: block;">Critério Histórico 3</label>
              <select id="bcms-crit3" class="form-select form-select-sm c-select" style="width: 100%;"></select>
            </div>
          </div>
        </div>

        <div class="row" style="display: flex; gap: 20px;">
          <div style="flex: 7; background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="padding: 15px; border-bottom: 1px solid #eee; display: flex; gap: 10px;">
              <input type="text" id="bcms-filter-name" class="form-control form-control-sm f-input" placeholder="Buscar por Nome...">
              <input type="text" id="bcms-filter-club" class="form-control form-control-sm f-input" placeholder="Buscar por Representação...">
              <input type="text" id="bcms-filter-region" class="form-control form-control-sm f-input" placeholder="Buscar por Região...">
            </div>
            <div style="max-height: 600px; overflow-y: auto;">
              <table class="table table-hover table-sm align-middle mb-0">
                <thead class="table-dark">
                  <tr>
                    <th class="text-center" data-sort="pos">Rank Oficial ↕</th>
                    <th data-sort="nome" id="th-nome">${listTitle}</th>
                    <th class="text-center" data-sort="regiao">Região ↕</th>
                    <th class="text-center" style="min-width: 120px;">C1 / C2 / C3</th>
                    <th class="text-center">Ação</th>
                  </tr>
                </thead>
                <tbody id="bcms-tbody"></tbody>
              </table>
            </div>
          </div>

          <div style="flex: 5; background: #f8f9fa; border: 2px solid #0d6efd; border-radius: 8px; display: flex; flex-direction: column;">
            <div style="padding: 15px; background: #0d6efd; color: white; display: flex; justify-content: space-between;">
              <h5 class="mb-0">Selecionados para Sorteio</h5>
              <span id="draw-list-count" class="badge bg-white text-primary">0</span>
            </div>
            <div style="flex: 1; max-height: 500px; overflow-y: auto;">
              <table class="table table-sm align-middle">
                <thead>
                  <tr>
                    <th class="text-center">BIB</th>
                    <th>Nome</th>
                    <th class="text-center">Critério de Rank</th>
                    <th class="text-center"></th>
                  </tr>
                </thead>
                <tbody id="draw-list-tbody"></tbody>
              </table>
            </div>
            <div style="padding: 15px; border-top: 1px solid #ddd; display: flex; gap: 10px; flex-wrap: wrap;">
              <button id="btn-open-import" class="btn btn-sm" style="background:#10b981; color:white; border:none; font-weight:bold; padding: 0 15px;">📥 Importar</button>
              <button id="btn-limpar-selecao" class="btn btn-outline-danger btn-sm" disabled>Limpar Tudo</button>
              <button id="btn-gerar-bib" class="btn btn-warning btn-sm fw-bold" disabled>Gerar BIBs</button>
              <button id="btn-realizar-sorteio" class="btn btn-success flex-grow-1 fw-bold" disabled>AVANÇAR PARA SORTEIO</button>
            </div>
          </div>
        </div>
      </div>

      <dialog id="modal-import-class" style="border: none; border-radius: 12px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); width: 500px; max-width: 90vw;">
        <h3 style="margin-top: 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">📥 Importar Inscritos (${escapeHTML(modalState.classCode)})</h3>
        <p style="font-size: 14px; color: #475569; margin-bottom: 20px;">Escolha uma competição do histórico. Os atletas inscritos nesta mesma classe serão copiados e adicionados à lista atual (sem duplicar nomes que já existam).</p>
        <select id="import-comp-select" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 25px; font-size: 14px; background: #f8fafc; outline: none;"></select>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button id="btn-import-class-cancel" style="background: transparent; border: 1px solid #94a3b8; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569; font-size: 14px;">Cancelar</button>
          <button id="btn-import-class-confirm" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">✅ Confirmar</button>
        </div>
      </dialog>
    `;

    const comps = await API.fetchCompetitionsDropdown();
    const opts = `<option value="">(nenhum)</option>` + comps.map(c => `<option value="${c.id}">${escapeHTML(c.nome)}</option>`).join('');
    qsAll('.c-select').forEach(sel => sel.innerHTML = opts);

    setupEventListeners();
    await loadState(); 
    await loadAthletes();
  }

  init();
}

export default renderCompetitionClassSelect;