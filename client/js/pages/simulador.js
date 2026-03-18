// client/js/pages/simulador.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { formatosA1 } from '../data/formatosA1.js';
// 🔥 IMPORTAÇÃO DO CÉREBRO DE PERMISSÕES
import { canEditGlobal } from '../permissions.js';

/* ==================== API ==================== */
async function api_getClasses() {
  try {
    const snap = await getDocs(collection(db, "classes"));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return items.map((c) => {
      const ui_bg = c.ui_bg || '#3b5ddd';
      const ui_fg = c.ui_fg || '#ffffff';
      const match_time = c.match_time || c.tempo_partida || '50:00';
      const turn_time  = c.turn_time  || c.tempo_parcial || '05:00';
      const ends = typeof c.ends === 'number' ? c.ends : 4;
      return { ...c, codigo: c.codigo || c.code || c.id, ui_bg, ui_fg, match_time, turn_time, ends };
    });
  } catch (err) {
    console.error('Falha ao carregar classes do Firebase:', err);
    toast('Erro ao carregar classes do servidor.', 'error');
    return [];
  }
}

async function api_listScenarios() {
  try {
      const q = query(collection(db, "scenarios"), orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
      if(e.message.includes("index")) {
          const snap = await getDocs(collection(db, "scenarios"));
          return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      return [];
  }
}

async function api_loadScenario(id) {
  try {
      const d = await getDoc(doc(db, "scenarios", String(id)));
      if(d.exists()) return { id: d.id, ...d.data() };
      return null;
  } catch(e) { return null; }
}

async function api_saveScenario(payload) {
  try {
      payload.created_at = new Date().toISOString();
      payload.name = payload.competition?.name || 'Simulação Sem Nome';
      payload.start_date = payload.competition?.startDate || '';
      payload.end_date = payload.competition?.endDate || '';
      
      await addDoc(collection(db, "scenarios"), payload);
  } catch(e) {
      throw new Error('Falha ao salvar cenário no Firebase: ' + e.message);
  }
}

async function api_deleteScenario(id) {
  try {
      await deleteDoc(doc(db, "scenarios", String(id)));
      return { ok: true };
  } catch(e) {
      throw new Error('Falha ao excluir cenário no Firebase.');
  }
}

/* ==================== Estado ==================== */
const State = {
  competition: {
    name: 'Nova Competição',
    local: '',
    startDate: '',
    endDate: '',
    dayStart: '09:00',
    dayEnd: '18:00',
    interval: 15,
    courts: 6,
  },
  currentScenarioId: null,
  allClasses: [],
  classPlans: [],
  schedulingClasses: [],
  matchesPool: new Map(),
  allocations: [],
  expandedSidebar: {},
  dayIdx: 0,
  canEdit: false // Variável global de controle para essa tela
};

/* ==================== Utils ==================== */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.substring(2).toLowerCase(), v);
    else if (k === 'style' && v && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'class') node.className = v;
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  for (const c of children.flat()) node.append(c && c.nodeType ? c : document.createTextNode(c ?? ''));
  return node;
}

function toast(msg, type = 'info') { 
  if (window.__toast) { window.__toast(msg, type); } 
  else { alert(msg); }
}

function minToHHMM(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return h + ':' + m;
}

function hhmmToMinutes(str) {
  if (!str) return 0;
  const [h, m] = String(str).split(':').map((n) => +n || 0);
  return (h * 60) + m;
}

function durationToMinutes(str) {
  if (!str) return 0;
  const parts = String(str).split(':').map((n) => +n || 0);
  const a = parts[0] || 0;
  const b = parts[1] || 0;
  if (a > 0) return a;
  if (a === 0 && b > 0) return b;
  return 50;
}

function getDiasCompeticao() {
  if (!State.competition.startDate || !State.competition.endDate) return [];
  const start = new Date(State.competition.startDate + 'T00:00:00');
  const end = new Date(State.competition.endDate + 'T00:00:00');
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    days.push(dd + '/' + mm + '/' + yy);
  }
  return days;
}

/* ==================== Formatos / Geração ==================== */
function getChaveamentosDisponiveis(entries) {
  return formatosA1
    .filter((f) => f.entry === entries)
    .map((f) => ({
      key: String(f.pools) + 'x' + String(f.poolSize),
      label:
        f.pools + 'g de max ' + f.poolSize +
        ' (G:' + f.poolMatches + ', E:' + f.koMatches + ', T:' + f.totalMatches + ')' +
        (f.preferred ? ' ★' : ''),
      pools: f.pools,
      poolSize: f.poolSize,
      poolMatches: f.poolMatches,
      koMatches: f.koMatches,
      totalMatches: f.totalMatches,
      preferred: !!f.preferred,
    }));
}

const poolMatchesBySize = {
  2: [['1×2']],
  3: [['1×3'], ['2×3'], ['1×2']],
  4: [['1×4', '2×3'], ['1×3', '2×4'], ['1×2', '3×4']],
  5: [['1×5', '2×4'], ['1×4', '3×5'], ['1×3', '2×5'], ['2×3', '4×5'], ['1×2', '3×4']],
  6: [['1×6', '2×4', '3×5'], ['1×5', '2×3', '4×6'], ['1×4', '2×5', '3×6'], ['1×3', '2×6', '4×5'], ['1×2', '3×4', '5×6']],
  7: [['1×7', '2×6', '3×5'], ['1×6', '2×5', '3×4'], ['1×5', '2×4', '6×7'], ['2×7', '3×6', '4×5'], ['1×4', '2×3', '5×7'], ['1×3', '4×7', '5×6'], ['1×2', '3×7', '4×6']],
};

function generateGroupMatches(classCode, totalEntries, numPools, poolSizeLimit, matchDuration) {
  function grupoChar(i) { return String.fromCharCode(65 + i); }
  const matches = [];
  
  let poolSizes = Array(numPools).fill(Math.floor(totalEntries / numPools));
  let remainder = totalEntries % numPools;
  for (let i = 0; i < remainder; i++) {
      poolSizes[i]++;
  }

  for (let g = 0; g < numPools; g++) {
    const pSize = poolSizes[g];
    const rounds = poolMatchesBySize[pSize] || [];
    
    for (let r = 0; r < rounds.length; r++) {
      for (let m = 0; m < rounds[r].length; m++) {
        matches.push({
          id: classCode + '-G' + (g + 1) + '-R' + (r + 1) + '-J' + (m + 1),
          label: 'Grupo ' + grupoChar(g) + ' • Rodada ' + (r + 1),
          details: '(' + rounds[r][m] + ')',
          classCode: classCode,
          duration: matchDuration,
          meta: { type: 'Grupo', group: grupoChar(g), round: r + 1 },
        });
      }
    }
  }
  return matches;
}

function generateElimSkeleton(classCode, koCount, matchDuration) {
  const fases = [];
  
  if (koCount === 4) {
     fases.push('Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else if (koCount === 6) {
     fases.push('Playoff', 'Playoff', 'Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else if (koCount === 8) {
     fases.push('Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else if (koCount === 10) {
     fases.push('Playoff', 'Playoff', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else if (koCount === 12) {
     fases.push('Playoff', 'Playoff', 'Playoff', 'Playoff', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else if (koCount === 14) {
     fases.push('Playoff', 'Playoff', 'Playoff', 'Playoff', 'Playoff', 'Playoff', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else if (koCount === 16) {
     fases.push('Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else if (koCount === 18) {
     fases.push('Playoff', 'Playoff', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else if (koCount === 20) {
     fases.push('Playoff', 'Playoff', 'Playoff', 'Playoff', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Oitavas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Quartas de Final', 'Semifinal', 'Semifinal', 'Disputa de 3º', 'Final');
  } else {
     for (let i = 0; i < koCount; i++) fases.push('Fase Eliminatória');
  }

  let phaseCounts = {};
  return fases.map((fase) => {
    phaseCounts[fase] = (phaseCounts[fase] || 0) + 1;
    
    let displayFase = fase;
    if (fase !== 'Disputa de 3º' && fase !== 'Final') {
       displayFase = `${fase} ${phaseCounts[fase]}`;
    }
    
    return {
      id: classCode + '-ELIM-' + fase.replace(/ /g, '') + '-' + phaseCounts[fase],
      label: displayFase,
      details: '',
      classCode: classCode,
      duration: matchDuration,
      meta: { type: 'Elim', fase: displayFase },
    };
  });
}

/* ==================== Render principal ==================== */
export async function renderSimulador(container) {
  // 🔥 VERIFICA PERMISSÃO DE EDIÇÃO PARA O SIMULADOR (Bloqueia arrasto e botões se for falso)
  State.canEdit = canEditGlobal('simulador');

  State.allClasses = await api_getClasses();

  container.innerHTML = '';

  const top = el('div', { class: 'toolbar sim-toolbar' });
  container.append(top);
  renderTopControls(top);

  const simWrapper = el('div', { class: 'sim-wrapper', style: { display: 'flex', gap: '16px', alignItems: 'flex-start' } });
  const simSidebar = el('div', {
    class: 'sim-sidebar',
    style: {
      flex: '0 0 260px',
      position: 'sticky',
      top: '80px',
      alignSelf: 'flex-start',
      maxHeight: 'calc(100vh - 120px)',
      overflow: 'auto',
    },
  });
  const simMain = el('div', { class: 'sim-main', style: { flex: '1', minWidth: '400px' } });

  simSidebar.innerHTML = '<h3>Jogos para Agendar</h3><div id="class-panel"></div>';
  simMain.innerHTML = '<div id="agenda-panel"></div>';

  simWrapper.append(simSidebar, simMain);
  container.append(simWrapper);

  renderSidebarClasses();
  drawAgendaGrid();

  if (!window.__simKeyboardBound) {
      window.addEventListener('keydown', (ev) => {
          if (!document.querySelector('.sim-wrapper')) return; 
          if (ev.key === 'ArrowLeft') { goPrevDay(); }
          if (ev.key === 'ArrowRight') { goNextDay(); }
      });
      window.__simKeyboardBound = true;
  }
}

/* ==================== Top Controls + Linha de Classes ==================== */
function renderTopControls(container) {
  container.innerHTML = '';
  container.style.display = 'flex';
  container.style.flexWrap = 'wrap';
  container.style.gap = '15px';
  container.style.alignItems = 'flex-end';
  container.style.justifyContent = 'space-between';

  const inputStyle = 'padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; margin-top: 4px; font-size: 13px; height: 36px; box-sizing: border-box; background: white; color: #0f172a;';
  const labelStyle = 'display: flex; flex-direction: column; font-size: 12px; font-weight: bold; color: #475569; margin: 0;';

  // Desabilita inputs se for View-Only
  const maybeDisabled = State.canEdit ? {} : { disabled: true };

  const inputFields = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px', flex: '1' } },
    el('label', { style: labelStyle }, 'Competição:', el('input', { type: 'text', style: inputStyle, ...maybeDisabled, value: State.competition.name, oninput: (e) => { State.competition.name = e.target.value; } })),
    el('label', { style: labelStyle }, 'Local:', el('input', { type: 'text', style: inputStyle, ...maybeDisabled, value: State.competition.local || '', oninput: (e) => { State.competition.local = e.target.value; } })),
    el('label', { style: labelStyle }, 'Início:', el('input', { type: 'date', style: inputStyle, ...maybeDisabled, value: State.competition.startDate, onchange: (e) => { State.competition.startDate = e.target.value; drawAgendaGrid(); } })),
    el('label', { style: labelStyle }, 'Fim:', el('input', { type: 'date', style: inputStyle, ...maybeDisabled, value: State.competition.endDate, onchange: (e) => { State.competition.endDate = e.target.value; drawAgendaGrid(); } })),
    el('label', { style: labelStyle }, 'Início Dia:', el('input', { type: 'time', style: inputStyle, ...maybeDisabled, value: State.competition.dayStart, onchange: (e) => { State.competition.dayStart = e.target.value; drawAgendaGrid(); } })),
    el('label', { style: labelStyle }, 'Fim Dia:', el('input', { type: 'time', style: inputStyle, ...maybeDisabled, value: State.competition.dayEnd, onchange: (e) => { State.competition.dayEnd = e.target.value; drawAgendaGrid(); } })),
    el('label', { style: labelStyle }, 'Visão:', el('select', { style: inputStyle, ...maybeDisabled, onchange: (e) => { State.competition.interval = +e.target.value; drawAgendaGrid(); } }, [5, 10, 15, 20].map((i) => el('option', { value: i, selected: State.competition.interval == i }, i + ' min')))),
    el('label', { style: labelStyle }, 'Quadras:', el('input', { type: 'number', style: inputStyle + ' width: 60px;', ...maybeDisabled, min: 1, max: 24, value: State.competition.courts, onchange: (e) => { State.competition.courts = +e.target.value || 6; drawAgendaGrid(); } }))
  );

  const btnStyleBase = 'padding: 0 16px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; height: 36px; white-space: nowrap; font-family: sans-serif;';

  const actionsWrapper = el('div', { class: 'toolbar-actions', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } });
  
  if (State.canEdit) {
      actionsWrapper.append(
          el('button', { type: 'button', style: btnStyleBase + ' background: #2563eb; color: white; border: 1px solid #1d4ed8;', onclick: handleSaveScenario }, '💾 Salvar Simulação')
      );
  }
  
  // Qualquer um pode carregar para ver. Excluir só se tiver permissão (controlado lá no modal de picker)
  actionsWrapper.append(
      el('button', { type: 'button', style: btnStyleBase + ' background: #e2e8f0; color: #0f172a; border: 1px solid #cbd5e1;', onclick: handleLoadScenario }, '📂 Carregar')
  );

  if (State.canEdit) {
      actionsWrapper.append(
          el('button', { type: 'button', style: btnStyleBase + ' background: #ef4444; color: white;', onclick: handleResetCompetition }, '🗑️ Zerar')
      );
  }

  actionsWrapper.append(
      el('button', { type: 'button', style: btnStyleBase + ' background: #16a34a; color: white; border-color: #15803d;', onclick: handleExportExcel }, '📊 Excel'),
      el('button', { type: 'button', style: btnStyleBase + ' background: #0f172a; color: white;', onclick: handleExportPDF }, '🖨️ PDF')
  );

  container.append(inputFields, actionsWrapper);

  if (State.canEdit) {
      const bar = el('div', {
        id: 'class-inline-panel',
        class: 'class-inline-bar',
        role: 'region',
        'aria-label': 'Classes na Competição',
        style: { width: '100%', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '15px', marginTop: '5px' },
      });
      container.append(bar);
      renderClassInlineBar(bar);
  }
}

/* ==================== Linha "Classes na Competição" ==================== */
function renderClassInlineBar(host) {
  if (!State.canEdit) return;

  host.innerHTML = '';
  host.append(el('div', { style: { fontWeight: '700', fontSize: '1.05rem', marginBottom: '8px' } }, 'Classes na Competição'));

  const row = el('div', {
    role: 'group',
    'aria-label': 'Adicionar classe à competição',
    style: { display: 'grid', gridTemplateColumns: '1.2fr 0.7fr 1.5fr auto', gap: '10px', alignItems: 'end' },
  });

  const selClass = el('select', { 'aria-label': 'Classe', style: 'padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;' },
    State.allClasses.map((c) => el('option', { value: c.codigo }, c.nome || c.codigo))
  );
  const inEntries = el('input', { type: 'number', min: 2, max: 32, value: 8, 'aria-label': 'Atletas', style: 'padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;' });
  const selFormat = el('select', { 'aria-label': 'Formato', style: 'padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;' });

  function refreshFormats() {
    selFormat.innerHTML = '';
    const entries = parseInt(inEntries.value, 10) || 0;
    getChaveamentosDisponiveis(entries).forEach((opt) => {
      selFormat.append(el('option', { value: opt.key, selected: opt.preferred }, opt.label));
    });
  }
  inEntries.addEventListener('input', refreshFormats);
  refreshFormats();

  const btnAdd = el('button', {
    type: 'button',
    'aria-label': 'Adicionar classe',
    style: 'background: #0f172a; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; height: 32px;',
    onclick: () => {
      const code = selClass.value;
      const selectedClass = State.allClasses.find((c) => c.codigo === code);
      if (!selectedClass) return;
      if (State.classPlans.some((p) => p.code === code)) { toast('Esta classe já foi adicionada.', 'warn'); return; }

      const parts = (selFormat.value || '0x0').split('x');
      const pools = parseInt(parts[0], 10) || 0;
      const poolSize = parseInt(parts[1], 10) || 0;
      const entries = parseInt(inEntries.value, 10) || 0;

      const newPlan = { code, name: selectedClass.nome || selectedClass.codigo, entries, pools, poolSize };
      State.classPlans.push(newPlan);
      generateMatchesForClass(newPlan);
      State.schedulingClasses.push(code);
      State.expandedSidebar[code] = true;

      renderClassInlineBar(host);
      renderSidebarClasses();
      drawAgendaGrid();
    },
  }, 'Adicionar');

  const label = (t, elx) => el('div', {}, el('div', { style: { fontSize: '.85rem', color: 'var(--muted, #4b587a)', marginBottom: '4px', fontWeight: 'bold' } }, t), elx);
  row.append(label('Classe', selClass), label('Atletas', inEntries), label('Formato', selFormat), el('div', { style: { display: 'flex', alignItems: 'center' } }, btnAdd));
  host.append(row);

  const chips = el('div', { role: 'list', 'aria-label': 'Classes adicionadas', style: { display: 'flex', gap: '8px', overflowX: 'auto', paddingTop: '12px' } });
  State.classPlans.forEach((plan) => {
    const chip = el('div', {
      role: 'listitem',
      style: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '999px', background: '#f8fafc', whiteSpace: 'nowrap' },
    },
      el('span', { style: { fontWeight: 'bold', fontSize: '13px' } }, plan.name),
      el('span', { style: { color: '#64748b', fontSize: '12px' } }, ' • ' + plan.entries + ' • ' + plan.pools + '×' + plan.poolSize),
      el('button', {
        title: 'Remover', type: 'button', onclick: () => removeClassPlan(plan.code),
        style: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: '4px', fontSize: '10px', fontWeight: 'bold' },
      }, '✕')
    );
    chips.append(chip);
  });
  host.append(chips);
}

/* ==================== Sidebar (Jogos para Agendar) ==================== */
function renderSidebarClasses() {
  const sidebar = document.getElementById('class-panel');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  for (const code of State.schedulingClasses) {
    const plan = State.classPlans.find((c) => c.code === code);
    const cls  = State.allClasses.find((c) => c.codigo === code);
    if (!plan || !cls) continue;

    const matches = State.matchesPool.get(code) || [];
    const alocados = State.allocations.filter((a) => a.classCode === code).length;
    const pendentes = Math.max(0, matches.length - alocados);

    const fmt = formatosA1.find((f) => f.entry === plan.entries && f.pools === plan.pools && f.poolSize === plan.poolSize);
    const G = fmt?.poolMatches ?? 0;
    const E = fmt?.koMatches ?? 0;
    const T = fmt?.totalMatches ?? (G + E);

    const header = el('div', {
      class: 'classe-head',
      style: { background: cls.ui_bg || '#3b5ddd', color: cls.ui_fg || '#fff', cursor: 'pointer', padding: '10px', borderRadius: '8px', marginBottom: '8px', userSelect: 'none', fontWeight: 'bold', fontSize: '13px' },
      onclick: () => { State.expandedSidebar[code] = !State.expandedSidebar[code]; renderSidebarClasses(); },
    }, plan.name + ' • G:' + G + ' E:' + E + ' T:' + T + ' • Pendentes: ' + pendentes);

    const content = el('div', { style: { display: State.expandedSidebar[code] ? 'block' : 'none', paddingLeft: '6px' } });

    const restantes = matches.filter((m) => !State.allocations.some((a) => a.id === m.id));
    
    const groupedMatches = {};
    restantes.forEach((m) => {
        let groupKey = 'Fase Eliminatória';
        if (m.meta && m.meta.type === 'Grupo') {
            groupKey = 'Rodada ' + m.meta.round;
        }
        if (!groupedMatches[groupKey]) groupedMatches[groupKey] = [];
        groupedMatches[groupKey].push(m);
    });

    const sortedKeys = Object.keys(groupedMatches).sort((a, b) => {
        if (a.startsWith('Rodada') && b.startsWith('Rodada')) {
            return parseInt(a.replace('Rodada ', '')) - parseInt(b.replace('Rodada ', ''));
        }
        if (a.startsWith('Rodada')) return -1;
        if (b.startsWith('Rodada')) return 1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(key => {
        const groupHeader = el('div', {
            style: { fontSize: '11px', fontWeight: '900', color: '#475569', margin: '14px 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }
        }, key);
        content.append(groupHeader);

        groupedMatches[key].forEach((m) => {
            let displayLabel = m.label;
            if (m.meta?.type === 'Grupo') {
                displayLabel = `Grupo ${m.meta.group} ${m.details || ''}`;
            }

            content.append(el('div', {
                class: 'sidebar-game-block',
                draggable: State.canEdit, // 🔥 SE NÃO PUDER EDITAR, NÃO ARRASTA!
                ondragstart: (e) => { 
                    if (!State.canEdit) return;
                    e.dataTransfer.setData('application/json', JSON.stringify(m)); 
                    e.dataTransfer.effectAllowed = 'move'; 
                },
                style: { background: '#f1f5f9', color: '#1e293b', borderRadius: '6px', marginBottom: '6px', padding: '10px', fontSize: '13px', fontWeight: '500', cursor: State.canEdit ? 'grab' : 'default', border: '1px solid #cbd5e1', userSelect: 'none', WebkitUserSelect: 'none' },
            }, displayLabel));
        });
    });

    sidebar.append(header, content);
  }
}

/* ==================== Grade (Agenda) ==================== */
function goPrevDay() {
  const dias = getDiasCompeticao();
  if (!dias.length) return;
  if (State.dayIdx <= 0) return toast('Já está no primeiro dia.', 'info');
  State.dayIdx -= 1;
  drawAgendaGrid();
}
function goNextDay() {
  const dias = getDiasCompeticao();
  if (!dias.length) return;
  if (State.dayIdx >= dias.length - 1) return toast('Já está no último dia.', 'info');
  State.dayIdx += 1;
  drawAgendaGrid();
}

function drawAgendaGrid() {
  const agendaPanel = document.getElementById('agenda-panel');
  if (!agendaPanel) return;
  agendaPanel.innerHTML = '';

  const dias = getDiasCompeticao();
  if (!dias.length) {
    agendaPanel.textContent = 'Defina início e fim da competição para exibir a grelha.';
    return;
  }
  State.dayIdx = Math.max(0, Math.min(State.dayIdx, dias.length - 1));
  const currentDay = dias[State.dayIdx] || dias[0];

  const btnPrev = el('button', { style: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' }, type: 'button' }, '←');
  const btnNext = el('button', { style: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' }, type: 'button' }, '→');
  btnPrev.addEventListener('click', goPrevDay);
  btnNext.addEventListener('click', goNextDay);

  const nav = el('div', { class: 'agenda-nav', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0', gap: '16px' } },
    el('div', { class: 'agenda-date-nav', style: { display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1' } },
      btnPrev,
      el('h3', { style: { margin: '0', color: '#0f172a' } }, currentDay),
      btnNext
    )
  );
  agendaPanel.append(nav);

  const conf = State.competition;
  const startMin = hhmmToMinutes(conf.dayStart);
  const endMin   = hhmmToMinutes(conf.dayEnd);
  const interval = Math.max(5, Number(conf.interval) || 15);
  const totalMinutes = Math.max(0, endMin - startMin);
  
  if (startMin >= endMin) {
      agendaPanel.innerHTML = '<div style="padding:20px; color:#ef4444; font-weight:bold;">Aviso: O horário de término deve ser maior que o horário de início do dia.</div>';
      return;
  }

  const slotHeight = 40;
  const pxPerMin  = slotHeight / interval;
  const totalHeight = Math.max(0, totalMinutes * pxPerMin);

  const timelineWidth = 64;

  const gridLines = [];
  for (let t = 0; t <= totalMinutes; t += 10) {
      const y = t * pxPerMin;
      const isHour = ((startMin + t) % 60 === 0);
      gridLines.push(el('div', {
          style: {
              position: 'absolute', top: y + 'px', left: 0, right: 0, height: '0px',
              borderTop: isHour ? '2px solid #94a3b8' : '1px solid #e2e8f0', 
              zIndex: 1, pointerEvents: 'none'
          }
      }));
  }

  const columns = [];
  for (let i = 0; i < conf.courts; i++) {
    const body = el('div', {
      class: 'court-body',
      style: {
        position: 'relative',
        height: totalHeight + 'px',
        backgroundColor: '#ffffff',
      },
    });
    
    gridLines.forEach(line => body.append(line.cloneNode(true)));

    const header = el('div', {
      class: 'court-header',
      style: {
        textAlign: 'center',
        padding: '8px',
        fontWeight: '600',
        fontSize: (conf.courts > 10 ? '11px' : conf.courts > 6 ? '12px' : '13px'),
        backgroundColor: '#f7f9fb',
        borderBottom: '1px solid var(--border, #d8deea)',
        position: 'sticky',
        top: '0',
        zIndex: '10',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    }, 'Quadra ' + (i + 1));

    const col = el('div', {
      class: 'court-column',
      'data-court-id': String(i + 1),
      style: {
        flex: '1 1 0',
        minWidth: '0',
        position: 'relative',
        borderRight: '1px solid #eef2f7',
      },
    }, header, body);

    columns.push(col);
  }

  const courtsContainer = el('div', {
    class: 'agenda-courts',
    style: {
      display: 'flex',
      flex: '1 1 auto',
      position: 'relative',
      minWidth: '0',
      overflow: 'hidden',
    },
  }, columns);

  const timeline = el('div', {
    class: 'agenda-timeline',
    style: {
      flex: '0 0 ' + timelineWidth + 'px',
      position: 'relative',
      backgroundColor: '#f7f9fb',
      borderRight: '1px solid var(--border, #d8deea)',
      minWidth: timelineWidth + 'px',
    },
  });

  const agendaContainer = el('div', {
    class: 'agenda-container',
    style: {
      display: 'flex',
      border: '1px solid var(--border, #d8deea)',
      borderRadius: '14px',
      background: 'var(--bg-elev, #fff)',
      overflowX: 'hidden',
      overflowY: 'auto',
      marginTop: '12px',
      width: '100%',
    },
  }, timeline, courtsContainer);
  agendaPanel.append(agendaContainer);

  const headerHeight = 35; 
  timeline.style.paddingTop = headerHeight + 'px';

  for (let t = startMin; t < endMin; t += interval) {
    const top = headerHeight + (t - startMin) * pxPerMin;
    const mark = el('div', {
      class: 'timeline-marker',
      style: {
        position: 'absolute',
        left: '0',
        right: '6px',
        textAlign: 'right',
        fontSize: (conf.courts > 10 ? '10px' : '12px'),
        color: 'var(--muted, #4b587a)',
        lineHeight: '1',
        marginTop: '-7px',
        top: top + 'px',
        pointerEvents: 'none',
      },
    }, minToHHMM(t));
    timeline.append(mark);
  }

  // 🔥 SÓ HABILITA O DROP SE PUDER EDITAR
  if (State.canEdit) {
      courtsContainer.ondragover = (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
      };
      courtsContainer.ondragenter = (e) => {
          e.preventDefault();
      };
      
      courtsContainer.ondrop = (e) => {
        e.preventDefault();
        try {
            const dt = e.dataTransfer.getData('application/json');
            if (!dt) return;
            const match = JSON.parse(dt);

            const rect = courtsContainer.getBoundingClientRect();
            if (rect.width <= 0) return;
            
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const courtWidth = rect.width / conf.courts;
            let courtIndex = Math.floor(x / courtWidth);
            if (isNaN(courtIndex) || courtIndex < 0) courtIndex = 0;
            if (courtIndex >= conf.courts) courtIndex = conf.courts - 1;
            const courtId = courtIndex + 1;

            const scrollTop = agendaContainer.scrollTop || 0;
            const dropTime = (((y - headerHeight) + scrollTop) / pxPerMin) + startMin;

            if (dropTime >= startMin && dropTime < endMin) {
              setTimeout(() => handleDrop(match, courtId, dropTime, currentDay), 50);
            }
        } catch(err) {
            console.error("Drop mal formado.", err);
        }
      };
  }

  State.allocations.filter((a) => a.date === currentDay).forEach((alloc) => {
    const colIdx = (parseInt(alloc.court, 10) || 1) - 1;
    const col = columns[colIdx];
    if (col) {
        col.querySelector('.court-body').append(renderAgendaBlock(alloc));
    }
  });
}

function renderAgendaBlock(alloc) {
  const startMin  = hhmmToMinutes(State.competition.dayStart);
  const interval = Math.max(5, Number(State.competition.interval) || 15);
  const slotHeight = 40;
  const pxPerMin   = slotHeight / interval;

  const top    = (alloc.start - startMin) * pxPerMin;
  const height = alloc.duration * pxPerMin;
  
  if (isNaN(top) || isNaN(height)) return el('div');

  const cls = State.allClasses.find((c) => c.codigo === alloc.classCode);
  const bg  = (cls && cls.ui_bg) || '#3b5ddd';
  const fg  = (cls && cls.ui_fg) || '#fff';

  const line1 = alloc.classCode || (cls?.codigo) || (cls?.nome) || '';
  let   line2 = '';
  let   line3 = '';

  if (alloc.meta?.type === 'Grupo') {
    line2 = 'Grupo ' + (alloc.meta.group ?? '');
    line3 = 'Rodada ' + (alloc.meta.round ?? '');
  } else if (alloc.meta?.type === 'Elim') {
    line2 = 'Eliminatória';
    line3 = alloc.label || '';
  } else {
    const lbl = alloc.label || '';
    const gMatch = lbl.match(/Grupo\s+([A-Z])/i);
    const rMatch = lbl.match(/Rodada\s+(\d+)/i);
    if (gMatch) line2 = 'Grupo ' + gMatch[1].toUpperCase();
    if (rMatch) line3 = 'Rodada ' + rMatch[1];
  }

  const line4 = minToHHMM(alloc.start) + '–' + minToHHMM(alloc.start + alloc.duration);

  return el('div', {
    class: 'agenda-block',
    style: {
      position: 'absolute',
      left: '4px',
      right: '4px',
      padding: '4px 6px',
      borderRadius: '8px',
      boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
      fontSize: (State.competition.courts > 10 ? '11px' : '12px'),
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      cursor: State.canEdit ? 'grab' : 'default', // 🔥 SÓ ARRASTA SE PUDER EDITAR
      userSelect: 'none',
      WebkitUserSelect: 'none',
      border: '1px solid rgba(0,0,0,0.1)',
      background: bg,
      color: fg,
      top: String(top) + 'px',
      height: String(height) + 'px',
      zIndex: 2 
    },
    draggable: State.canEdit,
    ondragstart: (e) => {
        if(!State.canEdit) return;
        e.dataTransfer.setData('application/json', JSON.stringify(alloc))
    },
    ondblclick: () => {
      if (!State.canEdit) return;
      if (confirm('Deseja retornar este jogo para a lista de agendamento?')) {
        State.allocations = State.allocations.filter((a) => a.id !== alloc.id);
        setTimeout(() => {
            renderSidebarClasses();
            drawAgendaGrid();
        }, 50);
      }
    },
  },
    el('div', { style: { fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, line1),
    el('div', { style: { fontSize: (State.competition.courts > 10 ? '10px' : '11px') } }, line2),
    el('div', { style: { fontSize: (State.competition.courts > 10 ? '10px' : '11px') } }, line3),
    el('div', { style: { fontSize: (State.competition.courts > 10 ? '9px' : '10px'), opacity: '0.9' } }, line4)
  );
}

/* ==================== Mutações / Helpers ==================== */
function removeClassPlan(code) {
  if (!confirm('Remover esta classe e todos os seus jogos?')) return;
  State.classPlans = State.classPlans.filter((p) => p.code !== code);
  State.schedulingClasses = State.schedulingClasses.filter((c) => c !== code);
  State.matchesPool.delete(code);
  State.allocations = State.allocations.filter((a) => a.classCode !== code);
  const host = document.getElementById('class-inline-panel');
  if (host) renderClassInlineBar(host);
  renderSidebarClasses();
  drawAgendaGrid();
}

function generateMatchesForClass(plan) {
  const code = plan.code;
  const entries = plan.entries;
  const pools = plan.pools;
  const poolSizeLimit = plan.poolSize; 
  
  const cls = State.allClasses.find((c) => c.codigo === code);
  const matchDuration = cls ? (durationToMinutes(cls.match_time) || 50) : 50;

  const groupMatches = generateGroupMatches(code, entries, pools, poolSizeLimit, matchDuration);
  
  const formato = formatosA1.find((f) => f.entry === entries && f.pools === pools && f.poolSize === poolSizeLimit);
  const koCount = formato ? formato.koMatches : 0;
  const elimMatches = koCount > 0 ? generateElimSkeleton(code, koCount, matchDuration) : [];

  State.matchesPool.set(code, groupMatches.concat(elimMatches));
}

/* ==================== DnD (SNAP) ==================== */
function handleDrop(match, court, time, date) {
  const interval = Math.max(5, Number(State.competition.interval) || 15);
  const startMin = hhmmToMinutes(State.competition.dayStart);
  const timeFromStart = time - startMin;
  const snapped = (Math.round(timeFromStart / interval) * interval) + startMin;

  if (isNaN(snapped)) return;

  State.allocations = State.allocations.filter((a) => a.id !== match.id);
  State.allocations.push({ id: match.id, label: match.label, details: match.details, classCode: match.classCode, duration: match.duration, meta: match.meta, court: court, start: snapped, date });
  renderSidebarClasses();
  drawAgendaGrid();
}

/* ==================== Persistência ==================== */
async function handleSaveScenario() {
  const payload = { competition: State.competition, classes: State.classPlans, allocations: State.allocations };
  try {
      await api_saveScenario(payload);
      toast('Simulação salva com sucesso!', 'success');
  } catch(e) {
      toast(e.message, 'error');
  }
}

async function handleLoadScenario() {
  const scenarios = await api_listScenarios();
  if (!scenarios.length) return toast('Nenhuma agenda salva encontrada.', 'warn');
  openScenarioPicker(scenarios);
}

async function handleResetCompetition() {
  if (!confirm('Tem certeza que deseja zerar toda a competição?')) return;
  State.competition = { name: 'Nova Competição', local: '', startDate: '', endDate: '', dayStart: '09:00', dayEnd: '18:00', interval: 15, courts: 6 };
  State.currentScenarioId = null;
  State.classPlans = [];
  State.schedulingClasses = [];
  State.matchesPool = new Map();
  State.allocations = [];
  State.expandedSidebar = {};
  State.dayIdx = 0;
  renderSimulador(document.getElementById('app'));
  toast('Competição zerada.');
}

/* ===== Picker de Cenários (Editar/Excluir) ===== */
function openScenarioPicker(list) {
  const overlay = el('div', { class: 'modal-overlay', style: {
    position:'fixed', inset:'0', background:'rgba(0,0,0,.35)', display:'flex',
    alignItems:'center', justifyContent:'center', zIndex:'9999'
  }});
  const modal = el('div', { class: 'modal', role:'dialog', 'aria-label':'Agendas salvas', style:{
    background:'#fff', color:'#111', minWidth:'min(920px, 92vw)', maxWidth:'92vw',
    borderRadius:'14px', border:'1px solid #d8deea', boxShadow:'0 10px 40px rgba(0,0,0,.25)'
  }});
  const header = el('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #e7edf7'} },
    el('strong', { style:{ fontSize:'18px'} }, 'Agendas salvas na Nuvem'),
    el('button', { class:'btn ghost', onclick: () => overlay.remove() }, 'Fechar')
  );
  const body = el('div', { style:{ padding:'12px 16px', maxHeight:'70vh', overflow:'auto' } });

  const tbl = el('table', { style:{
    width:'100%', borderCollapse:'collapse', border:'1px solid #e3e8f0', borderRadius:'10px', overflow:'hidden'
  }});
  const thead = el('thead',{}, el('tr',{},
    th('ID'), th('Nome'), th('Período'), th('Criado em'), th('Ações')
  ));
  const tbody = el('tbody');
  tbl.append(thead, tbody);

  list.forEach(row => {
    const periodo = (row.start_date && row.end_date)
      ? `${row.start_date.split('-').reverse().join('/')} a ${row.end_date.split('-').reverse().join('/')}`
      : '—';
    const tr = el('tr', {},
      td(String(row.id).slice(0, 5) + '...'),
      td(row.name || '—'),
      td(periodo),
      td(new Date(row.created_at).toLocaleString() || '—'),
      td(el('div', { style:{ display:'flex', gap:'8px'} },
        el('button', { class:'btn btn-small', onclick: async ()=>{
          const data = await api_loadScenario(row.id);
          if (!data) return toast('Agenda não encontrada.', 'error');
          State.currentScenarioId = row.id;
          State.competition = data.competition || State.competition;
          State.classPlans = data.classes || [];
          
          State.allocations = (data.allocations || []).map(alloc => {
              const liveClass = State.allClasses.find(c => c.codigo === alloc.classCode);
              if (liveClass) {
                  alloc.duration = durationToMinutes(liveClass.match_time) || 50;
              }
              return alloc;
          });

          State.schedulingClasses = State.classPlans.map((c) => c.code);
          State.matchesPool.clear();
          State.classPlans.forEach((p) => generateMatchesForClass(p));
          renderSimulador(document.getElementById('app'));
          overlay.remove();
          toast('Agenda #' + String(row.id).slice(0,5) + ' carregada com sucesso.', 'success');
        }}, 'Carregar'),
        // 🔥 SÓ EXIBE BOTÃO EXCLUIR SE TIVER PERMISSÃO
        State.canEdit ? el('button', { class:'btn btn-small danger-btn', onclick: async ()=>{
          if (!confirm(`Excluir agenda #${String(row.id).slice(0,5)}? Esta ação não pode ser desfeita.`)) return;
          try { await api_deleteScenario(row.id); tr.remove(); toast('Agenda excluída.'); }
          catch(e){ toast(String(e.message||e), 'error'); }
        }}, 'Excluir') : ''
      ))
    );
    tbody.append(tr);
  });

  body.append(tbl);
  modal.append(header, body);
  overlay.append(modal);
  document.body.append(overlay);

  function th(txt){ return el('th', { style:{ textAlign:'left', padding:'10px 12px', background:'#f3f6fb', borderBottom:'1px solid #e3e8f0' }}, txt); }
  function td(txtOrNode){ return el('td', { style:{ padding:'10px 12px', borderBottom:'1px solid #eef2f7' }}, txtOrNode); }
}

/* ==================== Exportações (PDF & EXCEL) ==================== */
function ensureScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (globalName && window[globalName]) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

async function ensurePdfLibs() {
  await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
  await ensureScript('https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.3/dist/html2canvas-pro.min.js', 'html2canvas');
}

async function ensureExcelLibs() {
  await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js', 'ExcelJS');
}

function textRow(doc, x, y, key, value, keyWidth, pageWidth) {
  doc.setFont('helvetica', 'bold'); doc.text(key, x, y);
  doc.setFont('helvetica', 'normal');
  const maxWidth = pageWidth - x - 40;
  doc.text(String(value || ''), x + keyWidth, y, { maxWidth });
}

function classFormatText(plan) {
  const f = formatosA1.find((x) => x.entry === plan.entries && x.pools === plan.pools && x.poolSize === plan.poolSize);
  if (!f) return `${plan.entries} inscritos`;
  return `${plan.entries} • ${f.pools}x${f.poolSize}  (G:${f.poolMatches}  E:${f.koMatches}  T:${f.totalMatches})`;
}

// === Geração de Excel ===
async function handleExportExcel() {
  try {
    toast('A gerar Excel...', 'info');
    await ensureExcelLibs(); 
    const ExcelJS = window.ExcelJS;
    const wb = new ExcelJS.Workbook();
    
    const dias = getDiasCompeticao();
    const conf = State.competition;
    const startMin = hhmmToMinutes(conf.dayStart);
    const endMin   = hhmmToMinutes(conf.dayEnd);
    const interval = Math.max(5, Number(conf.interval) || 15);
    
    dias.forEach((dia) => {
      const wsName = dia.replace(/\//g, '-');
      const ws = wb.addWorksheet(wsName, {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] 
      });
      
      const headers = ['Horário'];
      for(let i=1; i<=conf.courts; i++) headers.push(`Quadra ${i}`);
      const headerRow = ws.addRow(headers);
      headerRow.height = 30; 
      
      headerRow.eachCell(cell => {
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
         cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
         cell.alignment = { horizontal: 'center', vertical: 'middle' };
         cell.border = {
            top: {style:'medium', color: {argb:'FF000000'}},
            left: {style:'medium', color: {argb:'FF000000'}},
            bottom: {style:'medium', color: {argb:'FF000000'}},
            right: {style:'medium', color: {argb:'FF000000'}}
         };
      });
      
      ws.getColumn(1).width = 15;
      for(let i=1; i<=conf.courts; i++) ws.getColumn(i+1).width = 25;
      
      const rowMap = {};
      let currentRow = 2;

      for(let t = startMin; t < endMin; t += interval) {
         const timeStr = minToHHMM(t);
         const row = ws.addRow([timeStr]);
         row.height = 20; 
         
         const timeCell = row.getCell(1);
         timeCell.alignment = { horizontal: 'center', vertical: 'top' };
         timeCell.font = { bold: true, color: { argb: 'FF475569' } };
         timeCell.border = {
            top: {style:'thin', color: {argb:'FFCBD5E1'}},
            bottom: {style:'thin', color: {argb:'FFCBD5E1'}},
            right: {style:'medium', color: {argb:'FF000000'}}
         };

         for(let i=1; i<=conf.courts; i++) {
            const emptyCell = row.getCell(i+1);
            emptyCell.border = {
               top: {style:'dotted', color: {argb:'FFE2E8F0'}},
               bottom: {style:'dotted', color: {argb:'FFE2E8F0'}},
               left: {style:'thin', color: {argb:'FFCBD5E1'}},
               right: {style:'thin', color: {argb:'FFCBD5E1'}}
            };
         }

         rowMap[t] = currentRow;
         currentRow++;
      }
      
      const dayAllocs = State.allocations.filter(a => a.date === dia);
      dayAllocs.forEach(alloc => {
          if(alloc.start < startMin || alloc.start >= endMin) return;
          
          const sRow = rowMap[alloc.start] || (2 + Math.floor((alloc.start - startMin) / interval));
          const blocks = Math.ceil(alloc.duration / interval);
          const eRow = sRow + blocks - 1;
          const col = alloc.court + 1;
          
          const maxRow = currentRow - 1;
          const finalERow = eRow > maxRow ? maxRow : eRow;
          
          if (sRow <= finalERow) {
              try { ws.mergeCells(sRow, col, finalERow, col); } catch(e) {}
              
              const cell = ws.getCell(sRow, col);
              const cls = State.allClasses.find((c) => c.codigo === alloc.classCode);
              const bg = (cls && cls.ui_bg) ? cls.ui_bg.replace('#', '') : '3B5DDD';
              const fg = (cls && cls.ui_fg) ? cls.ui_fg.replace('#', '') : 'FFFFFF';
              
              let line2 = '', line3 = '';
              if (alloc.meta?.type === 'Grupo') {
                line2 = 'Grupo ' + (alloc.meta.group ?? '');
                line3 = 'Rodada ' + (alloc.meta.round ?? '');
              } else if (alloc.meta?.type === 'Elim') {
                line2 = 'Eliminatória';
                line3 = alloc.label?.split('•')[0]?.trim() || alloc.label || '';
              } else {
                const lbl = alloc.label || '';
                const gMatch = lbl.match(/Grupo\s+([A-Z])/i);
                const rMatch = lbl.match(/Rodada\s+(\d+)/i);
                if (gMatch) line2 = 'Grupo ' + gMatch[1].toUpperCase();
                if (rMatch) line3 = 'Rodada ' + rMatch[1];
              }

              cell.value = `${alloc.classCode}\n${line2}\n${line3}`;
              cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
              
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg.toUpperCase() } };
              cell.font = { color: { argb: 'FF' + fg.toUpperCase() }, bold: true, size: 11 };
              
              cell.border = {
                top: {style:'medium', color: {argb:'FF000000'}},
                left: {style:'medium', color: {argb:'FF000000'}},
                bottom: {style:'medium', color: {argb:'FF000000'}},
                right: {style:'medium', color: {argb:'FF000000'}}
              };
          }
      });
    });
    
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (State.competition.name || 'agenda').replace(/[^\w\-]+/g, '_');
    a.download = `agenda_${safeName}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast('Excel transferido com sucesso!', 'success');
  } catch(e) {
    console.error(e);
    toast('Erro ao gerar Excel.', 'error');
  }
}

// === Geração de PDF ===
async function handleExportPDF() {
  const originalDayStart = State.competition.dayStart;
  const originalDayEnd = State.competition.dayEnd;
  const originalDayIdx = State.dayIdx;

  try {
    toast('A gerar PDF em Alta Definição (2 páginas por dia)...', 'info');
    await ensurePdfLibs();
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    // --- PÁGINA 1: CAPA COM FORMATOS ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Sistema Bocha BR — Programação Geral', pw / 2, 40, { align: 'center' });
    
    doc.setFontSize(12);
    let y = 80;
    const comp = State.competition;
    const periodo = (comp.startDate && comp.endDate) ? `${comp.startDate.split('-').reverse().join('/')} a ${comp.endDate.split('-').reverse().join('/')}` : '—';
    
    textRow(doc, 40, y, 'Competição:', comp.name || '—', 120, pw); y += 20;
    textRow(doc, 40, y, 'Local:', comp.local || '—', 120, pw); y += 20;
    textRow(doc, 40, y, 'Período:', periodo, 120, pw); y += 35;

    doc.setFontSize(14);
    doc.text('Resumo de Classes e Formatos:', 40, y); y += 15;
    doc.line(40, y, pw - 40, y); y += 20;

    doc.setFontSize(11);
    State.classPlans.forEach((plan, idx) => {
      if (idx % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(40, y - 10, pw - 80, 16, 'F'); }
      doc.setTextColor(0);
      doc.text(plan.name, 50, y);
      doc.text(classFormatText(plan), 280, y);
      y += 16;
    });

    // --- PÁGINAS DE AGENDA ---
    const dias = getDiasCompeticao();

    for (let di = 0; di < dias.length; di++) {
      const currentDayStr = dias[di];
      const dayAllocs = State.allocations.filter(a => a.date === currentDayStr);
      if (dayAllocs.length === 0) continue;

      const firstMatchMin = Math.min(...dayAllocs.map(a => a.start));
      const lastMatchMin = Math.max(...dayAllocs.map(a => a.start + a.duration));
      
      const cutPoint = 810; // 13:30h
      
      const turnos = [
        { label: 'Manhã/Início', start: firstMatchMin, end: Math.max(cutPoint, firstMatchMin + 180) },
        { label: 'Tarde/Fim', start: Math.min(cutPoint, lastMatchMin - 180), end: lastMatchMin }
      ];

      for (const turno of turnos) {
        const hasMatches = dayAllocs.some(a => (a.start >= turno.start && a.start < turno.end) || (a.start + a.duration > turno.start && a.start < turno.end));
        if (!hasMatches) continue;

        State.dayIdx = di;
        State.competition.dayStart = minToHHMM(Math.floor(turno.start / 60) * 60);
        State.competition.dayEnd = minToHHMM(Math.ceil(turno.end / 60) * 60);
        
        drawAgendaGrid();
        await new Promise(r => setTimeout(r, 150)); 

        const agendaContainer = document.querySelector('.agenda-container');
        if (!agendaContainer) continue;

        const canvas = await window.html2canvas(agendaContainer, {
          scale: 2, 
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            clonedDoc.body.style.color = '#0f172a';
            clonedDoc.body.style.backgroundColor = '#ffffff';
            const st = clonedDoc.createElement('style');
            st.textContent = `
              .agenda-container, .agenda-container * { box-shadow: none !important; text-shadow: none !important; }
              .agenda-container { background: #ffffff !important; border: none !important; }
              .agenda-container .agenda-timeline { background: #f7f9fb !important; }
              .agenda-container .timeline-marker { color: #4b587a !important; font-weight: bold !important; }
              .agenda-container .court-header { background: #f7f9fb !important; color: #111 !important; border-bottom: 2px solid #94a3b8 !important; }
              .agenda-container .court-body { background-color: #ffffff !important; }
            `;
            clonedDoc.head.appendChild(st);
          }
        });

        doc.addPage('a4', 'landscape');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(`Agenda — ${currentDayStr} (${turno.label})`, pw / 2, 35, { align: 'center' });

        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const usableTop = 50;
        const usableHeight = ph - usableTop - 30;
        const baseW = pw - 60;
        
        const ratio = canvas.height / canvas.width;
        let drawW = baseW;
        let drawH = baseW * ratio;

        if (drawH > usableHeight) {
          const f = usableHeight / drawH;
          drawH = usableHeight;
          drawW = baseW * f;
        }

        const xLeft = (pw - drawW) / 2;
        doc.addImage(imgData, 'JPEG', xLeft, usableTop, drawW, drawH, undefined, 'FAST');
      }
    }

    const safeName = (State.competition.name || 'agenda').replace(/[^\w\-]+/g, '_');
    doc.save(`programacao_${safeName}.pdf`);
    toast('PDF Gerado! Turnos divididos por página para melhor leitura.', 'success');

  } catch (err) {
    console.error(err);
    toast('Erro ao processar o PDF. Verifique o console.', 'error');
  } finally {
    // BLINDAGEM: Garante que os horários do ecrã voltem ao normal MESMO SE DER ERRO NO PDF
    State.competition.dayStart = originalDayStart;
    State.competition.dayEnd = originalDayEnd;
    State.dayIdx = originalDayIdx;
    drawAgendaGrid();
  }
}