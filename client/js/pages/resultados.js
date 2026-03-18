// client/js/pages/resultados.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// 🔥 O SEGREDO ESTÁ AQUI: Importando o Cérebro de Permissões
import { canEditGlobal } from '../permissions.js';

const state = {
  competitions: [],
  error: null,
  resultsCompId: null,
  results: [],
  preview: null, 
  csvColumns: [],
  draftRows: [],
  lookups: { classes: [], clubes: [], athletes: [] },
  canEdit: false // Variável global de controle de permissão
};

const debounce = (fn, ms = 250) => {
  let to = null;
  return (...a) => { clearTimeout(to); to = setTimeout(() => fn(...a), ms); };
};

function pad2(n) { return String(n).padStart(2, '0'); }

function isoToBR(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s; 
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function brToISO(br) {
  const s = String(br || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
  if (yyyy < 1900 || yyyy > 3000) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function todayBR() {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function normStr(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(str) {
  const s = normStr(str);
  if (!s) return [];
  const t = ` ${s} `;
  const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

function dice(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const map = new Map();
  for (const x of A) map.set(x, (map.get(x) || 0) + 1);
  let hits = 0;
  for (const x of B) {
    const n = map.get(x) || 0;
    if (n > 0) { hits++; map.set(x, n - 1); }
  }
  return (2 * hits) / (A.length + B.length);
}

function similarityPct(csvName, csvClub, sysName, sysClub) {
  const cn = normStr(csvName);
  const cc = normStr(csvClub);
  const sn = normStr(sysName);
  const sc = normStr(sysClub);
  if (cn && sn && cc && sc && cn === sn && cc === sc) return 100;
  const nameScore = dice(cn, sn);
  const clubScore = (cc || sc) ? dice(cc, sc) : 1;
  const s = (nameScore * 0.7) + (clubScore * 0.3);
  return Math.round(Math.max(0, Math.min(1, s)) * 100);
}

function clampPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function recomputeRowSimilarity(row) {
  row.similarity = similarityPct(row.csv?.name, row.csv?.club, row.athlete_nome, row.club_nome);
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function parseCSVFile(file) {
  const text = await file.text();
  const separator = text.includes(';') ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const headers = lines[0].split(separator).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const data = [];
  for(let i = 1; i < lines.length; i++) {
    const values = lines[i].match(new RegExp(`(?:\\"([^\"]*)\\")|([^\\${separator}]+)`, 'g'));
    if(!values) continue;
    const obj = {};
    headers.forEach((h, idx) => {
        if(h && values[idx]) { obj[h] = values[idx].replace(/^"|"$/g, '').trim(); }
    });
    data.push(obj);
  }
  return { fields: headers, items: data };
}

const el = (t, p = {}, c = []) => {
  const n = document.createElement(t);
  for (const [k, v] of Object.entries(p || {})) {
    if (k === 'class' || k === 'className') n.className = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('data-')) n.setAttribute(k, v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  (Array.isArray(c) ? c : [c]).forEach((k) => {
    if (k == null) return;
    n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  });
  return n;
};

function extractName(r) {
    const keys = ['atleta_nome', 'athlete_nome', 'nome', 'name', 'atleta', 'athlete', 'Atleta', 'Nome', 'Name', 'Atleta / Equipe', 'Atleta_Equipe'];
    for (let k of keys) { if (r[k] && String(r[k]).trim() !== '') return r[k]; }
    for (let k in r) { if (k.toLowerCase().includes('nome') || k.toLowerCase().includes('atleta') || k.toLowerCase().includes('name')) return r[k]; }
    return 'Atleta não identificado';
}

function extractClub(r) {
    const keys = ['clube_nome', 'club_nome', 'clube', 'club', 'Clube', 'Club', 'entidade', 'Entidade', 'uf', 'UF', 'equipe', 'Equipe'];
    for (let k of keys) { if (r[k] && String(r[k]).trim() !== '') return r[k]; }
    for (let k in r) { if (k.toLowerCase().includes('club') || k.toLowerCase().includes('entidade')) return r[k]; }
    return '-';
}

function extractClass(r) {
    const keys = ['class_code', 'classe', 'class', 'Classe', 'Class', 'categoria', 'Categoria'];
    for (let k of keys) { if (r[k] && String(r[k]).trim() !== '') return r[k]; }
    for (let k in r) { if (k.toLowerCase().includes('class')) return r[k]; }
    return 'Outros';
}

function extractRank(r) {
    const keys = ['rank', 'posição', 'posicao', 'pos', 'Rank', 'Posição', 'Pos', 'colocação', 'Colocação'];
    for (let k of keys) { if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return r[k]; }
    for (let k in r) { if (k.toLowerCase().includes('rank') || k.toLowerCase().includes('pos')) return r[k]; }
    return null;
}

function resolveClubInfo(r, clubesLookup) {
    let rawClub = extractClub(r);
    let cId = r.club_id || r.clube_id || r.id_clube;

    if (!isNaN(Number(rawClub)) && String(rawClub).trim() !== '') {
        cId = String(rawClub).trim();
    }

    let found = null;
    
    if (cId) {
        found = clubesLookup.find(c => String(c.id) === String(cId) || String(c.old_id) === String(cId) || String(c.codigo) === String(cId));
    }

    if (!found && rawClub && isNaN(Number(rawClub)) && rawClub !== '-') {
        const rawLower = String(rawClub).toLowerCase().trim();
        found = clubesLookup.find(c => 
            (c.nome && c.nome.toLowerCase().trim() === rawLower) || 
            (c.sigla && c.sigla.toLowerCase().trim() === rawLower)
        );
    }

    if (found) {
        let nomeStr = found.nome || found.name || 'Clube sem nome';
        let siglaStr = found.sigla ? ` - ${found.sigla}` : '';
        if (nomeStr.includes(found.sigla)) siglaStr = ''; 
        let ufStr = found.uf || found.estado || found.estado_sigla || '';
        let ufFormat = ufStr ? ` (${ufStr.toUpperCase()})` : '';

        return `${nomeStr}${siglaStr}${ufFormat}`;
    }

    if (rawClub && isNaN(Number(rawClub)) && rawClub !== '-') return rawClub;
    return 'Clube não informado';
}

export async function renderResultados(root) {
  const auth = getAuth();

  root.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:50vh; flex-direction:column;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #0d6efd; border-radius:50%; animation:spin 1s linear infinite;"></div>
      <p style="margin-top:15px; color:#64748b; font-family:sans-serif;">Carregando histórico do banco de dados...</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  
  const getEl = (form, nameOrId) => {
    if (!form) return null;
    const byName = form.elements?.namedItem?.(nameOrId);
    if (byName) return byName;
    return form.querySelector(`#${CSS.escape(nameOrId)}`) || form.querySelector(`[name="${CSS.escape(nameOrId)}"]`);
  };

  onAuthStateChanged(auth, async (user) => {
      // 🔥 AGORA SIM! Ele pergunta ao arquivo de permissões se você pode editar
      state.canEdit = canEditGlobal('resultados');
      
      renderLayout();
      await loadLookups();
      if (state.canEdit && $('#i_data') && !$('#i_data').value) $('#i_data').value = todayBR();
      await loadCompetitions();
  });

  function renderLayout() {
      root.innerHTML = `
        ${state.canEdit ? `
        <section class="card" id="importSection">
          <h2>Importar Resultados Históricos (CSV)</h2>
          <div class="row" style="display:flex; gap:10px; flex-wrap:wrap;">
            <label style="flex:2; min-width:240px;">Nome da competição<br>
              <input id="i_nome" class="w-100" placeholder="Ex: Copa Regional 2023">
            </label>
            <label style="flex:1; min-width:180px;">Local<br>
              <input id="i_local" class="w-100" placeholder="Cidade/UF">
            </label>
            <label style="min-width:160px;">Data<br>
              <input id="i_data" class="w-100" placeholder="DD/MM/AAAA">
            </label>
            <div style="display:flex; align-items:flex-end; gap:8px;">
              <button id="btnToday" class="btn small" type="button">📅 Hoje</button>
            </div>
          </div>
          <div style="margin-top:10px;">
            <input id="i_csv" type="file" accept=".csv,text/csv">
          </div>
          <div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
            <button id="btnPreview" class="btn">Ler CSV</button>
            <span style="flex:1"></span>
            <button id="btnSaveMapped" class="btn good">Salvar 0/0</button>
          </div>
          <div id="previewBox" style="margin-top:10px"></div>
        </section>
        ` : ''}

        <section class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
            <h2 style="margin:0;">Arquivo Geral de Resultados</h2>
            ${!state.canEdit ? `<button class="btn btn-outline-secondary" onclick="window.history.back()">← Voltar</button>` : ''}
          </div>
          <div id="compList"></div>
        </section>

        <div id="resultsPaneWrap" style="margin-top:14px"></div>

        ${state.canEdit ? `
        <dialog id="dlgPickAthlete" style="max-width:760px; width:96%; border:none; border-radius:12px; padding:0;">
          <div style="padding:12px 14px;">
            <h3 style="margin:0 0 10px 0;">Trocar atleta (buscar)</h3>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
              <label style="flex:1; min-width:220px;">
                <div style="font-size:12px; opacity:.8;">Nome (contém)</div>
                <input id="p_query" class="w-100" placeholder="digite parte do nome">
              </label>
              <label style="min-width:140px;">
                <div style="font-size:12px; opacity:.8;">Classe</div>
                <input id="p_class" class="w-100" placeholder="BC1M">
              </label>
              <label style="min-width:200px;">
                <div style="font-size:12px; opacity:.8;">Clube</div>
                <select id="p_club" class="w-100"></select>
              </label>
              <button id="btnPickSearch" class="btn">Buscar</button>
              <button id="btnPickClose" class="btn">Fechar</button>
            </div>
            <div id="pickResults" style="margin-top:10px"></div>
          </div>
        </dialog>

        <dialog id="dlgCreateAthlete" style="max-width:560px; width:95%; border:none; border-radius:12px; padding:0%;">
          <form id="frmCreateAthlete" style="padding:14px;">
            <h3 style="margin:0 0 10px 0;">Inserir atleta no sistema</h3>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <label style="flex:1; min-width:240px;">
                <div style="font-size:12px; opacity:.8;">Nome</div>
                <input name="nome" class="w-100" required />
              </label>
              <label style="flex:1; min-width:240px;">
                <div style="font-size:12px; opacity:.8;">Classe</div>
                <select name="class_code" class="w-100" required></select>
              </label>
            </div>
            <div style="margin-top:10px;">
              <div style="font-size:12px; opacity:.8; margin-bottom:6px;">Clube</div>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <label style="display:flex; gap:6px; align-items:center;">
                  <input type="radio" name="club_mode" id="club_mode_existing" />
                  <span>Selecionar existente</span>
                </label>
                <select name="club_id" class="w-100" style="max-width:320px;"></select>
                <label style="display:flex; gap:6px; align-items:center;">
                  <input type="radio" name="club_mode" id="club_mode_new" />
                  <span>Criar novo</span>
                </label>
                <input name="club_nome" class="w-100" placeholder="Nome do clube" style="max-width:320px;" />
              </div>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
              <button type="button" id="btnCancelCreateAthlete" class="btn">Cancelar</button>
              <button type="submit" class="btn good">Cadastrar</button>
            </div>
          </form>
        </dialog>

        <dialog id="dlgEditCompetition" style="max-width:520px; width:95%; border:none; border-radius:12px; padding:0%;">
          <form id="frmEditCompetition" style="padding:14px;">
            <h3 style="margin:0 0 10px 0;">Editar dados da competição</h3>
            <label style="display:block; margin-bottom:8px;">
              <div style="font-size:12px; opacity:.8;">Nome</div>
              <input id="e_nome" class="w-100" required>
            </label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <label style="flex:1; min-width:180px;">
                <div style="font-size:12px; opacity:.8;">Local</div>
                <input id="e_local" class="w-100">
              </label>
              <label style="min-width:160px;">
                <div style="font-size:12px; opacity:.8;">Data (DD/MM/AAAA)</div>
                <input id="e_data" class="w-100" placeholder="DD/MM/AAAA" required>
              </label>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
              <button type="button" id="btnCancelEditCompetition" class="btn">Cancelar</button>
              <button type="submit" class="btn good">Salvar</button>
            </div>
          </form>
        </dialog>
        ` : ''}
      `;

      if (state.canEdit) bindAdminEvents();
  }

  function bindAdminEvents() {
      $('#btnPreview')?.addEventListener('click', loadPreview);
      $('#btnSaveMapped')?.addEventListener('click', saveMapped);
      $('#btnToday')?.addEventListener('click', () => { $('#i_data').value = todayBR(); });
      $('#btnPickClose')?.addEventListener('click', () => $('#dlgPickAthlete').close());
      $('#btnPickSearch')?.addEventListener('click', runPickSearch);
      $('#p_query')?.addEventListener('input', runPickSearch);
      $('#p_class')?.addEventListener('input', runPickSearch);
      $('#p_club')?.addEventListener('change', runPickSearch);
      $('#frmCreateAthlete')?.addEventListener('submit', submitCreateAthlete);
      $('#btnCancelCreateAthlete')?.addEventListener('click', () => $('#dlgCreateAthlete').close());
      $('#frmEditCompetition')?.addEventListener('submit', submitEditCompetition);
      $('#btnCancelEditCompetition')?.addEventListener('click', () => $('#dlgEditCompetition').close());
  }

  async function loadLookups() {
    try {
      const [snapCls, snapClu, snapAth] = await Promise.all([
          getDocs(collection(db, "classes")),
          getDocs(collection(db, "clubes")),
          getDocs(collection(db, "atletas"))
      ]);
      state.lookups.classes = snapCls.docs.map(d => ({ id: d.id, ...d.data() }));
      state.lookups.clubes = snapClu.docs.map(d => ({ id: d.id, ...d.data() }));
      const clubMap = {};
      state.lookups.clubes.forEach(c => clubMap[c.id] = c.nome);
      state.lookups.athletes = snapAth.docs.map(d => {
          const a = d.data();
          return { id: d.id, ...a, clube_nome: clubMap[a.clube_id] || '' };
      });
    } catch (e) {}
  }

  async function loadCompetitions() {
    try {
      const q = query(collection(db, "competitions"), orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      let items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      state.competitions = items.filter(c => c.historica_csv === true || c.historica_csv === 1 || c.historica_csv === "1" || c.status === "FINISHED");
      state.error = null;
      renderList();
    } catch (e) {
      if(e.message.includes("index")) {
          const snap = await getDocs(collection(db, "competitions"));
          let items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          state.competitions = items.filter(c => c.historica_csv === true || c.historica_csv === 1 || c.historica_csv === "1" || c.status === "FINISHED");
          state.competitions.sort((a, b) => String(b.data_inicio || '').localeCompare(String(a.data_inicio || '')));
          state.error = null;
          renderList();
      } else {
          state.error = "Erro no banco de dados.";
          renderList();
      }
    }
  }

  async function loadResults(compId) {
    state.resultsCompId = String(compId); 
    const wrap = document.getElementById('resultsPaneWrap');
    if (wrap) wrap.innerHTML = '<div style="text-align:center; padding: 20px;">Carregando resultados...</div>';
    
    try {
      let rows = [];
      let q = query(collection(db, "historical_results"), where("competition_id", "==", String(compId)));
      let snap = await getDocs(q);
      
      if (snap.empty && !isNaN(Number(compId))) {
          q = query(collection(db, "historical_results"), where("competition_id", "==", Number(compId)));
          snap = await getDocs(q);
      }

      if (snap.empty) {
          const allSnap = await getDocs(collection(db, "historical_results"));
          allSnap.forEach(d => {
              const data = d.data();
              if (String(data.competition_id).trim() === String(compId).trim()) {
                  rows.push({ id: d.id, ...data });
              }
          });
      } else {
          rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      state.results = rows;
      
      renderResultsPane();
      const anchor = document.getElementById('resultsPaneWrap');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { alert('Falha ao carregar resultados: ' + e.message); }
  }

  function openEditCompetitionDialog(c) {
    if (!c || !state.canEdit) return;
    const dlg = $('#dlgEditCompetition');
    dlg.dataset.id = String(c.id);
    $('#e_nome').value = c.nome || c.name || '';
    $('#e_local').value = c.local || '';
    $('#e_data').value = isoToBR(c.data_inicio || '');
    dlg.showModal();
  }

  async function submitEditCompetition(e) {
    e.preventDefault();
    if(!state.canEdit) return;
    const dlg = $('#dlgEditCompetition');
    const id = dlg.dataset.id;
    if (!id) return;
    const nome = $('#e_nome').value.trim();
    const local = $('#e_local').value.trim();
    const dataISO = brToISO($('#e_data').value.trim());
    if (!nome) return alert('Informe o nome.');
    if (!dataISO) return alert('Data inválida. Use DD/MM/AAAA.');
    try {
      await updateDoc(doc(db, "competitions", id), { nome, name: nome, local, data_inicio: dataISO });
      dlg.close();
      await loadCompetitions();
      alert('Competição atualizada.');
    } catch (err) { alert('Falha ao editar competição: ' + err.message); }
  }

  async function deleteCompetition(id) {
    if (!state.canEdit) return;
    if (!confirm('Excluir esta competição histórica e todos os seus resultados importados?')) return;
    try {
      const q = query(collection(db, "historical_results"), where("competition_id", "==", String(id)));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "historical_results", d.id))));
      await deleteDoc(doc(db, "competitions", String(id)));
      if (state.resultsCompId === String(id)) {
        state.resultsCompId = null;
        state.results = [];
        $('#resultsPaneWrap').innerHTML = '';
      }
      await loadCompetitions();
      alert('Competição histórica excluída.');
    } catch (err) { alert('Falha ao excluir: ' + err.message); }
  }

  async function saveLine(tr, compId, rid) {
    if(!state.canEdit) return;
    const data = {};
    tr.querySelectorAll('[data-f]').forEach((inp) => { data[inp.getAttribute('data-f')] = inp.value; });
    
    data.athlete_id = data.athlete_id ? String(data.athlete_id) : null;
    data.club_id = data.club_id ? String(data.club_id) : null;
    data.rank = data.rank ? Number(data.rank) : null;
    
    try {
      await updateDoc(doc(db, "historical_results", rid), data);
      alert('Linha salva com sucesso!');
      await loadResults(compId);
    } catch (e) { alert('Falha ao salvar: ' + e.message); }
  }

  async function delLine(compId, rid) {
    if(!state.canEdit) return;
    if (!confirm('Remover esta linha?')) return;
    try {
      await deleteDoc(doc(db, "historical_results", rid));
      await loadResults(compId);
    } catch (e) { alert('Falha ao remover: ' + e.message); }
  }

  function renderResultsPane() {
    const wrap = $('#resultsPaneWrap');
    wrap.innerHTML = '';
    if (!state.resultsCompId) return;
    const rows = state.results || [];
    
    const compIdStr = String(state.resultsCompId);
    const compName = state.competitions.find(c => String(c.id) === compIdStr)?.nome || `#${compIdStr.slice(0,5)}`;

    const container = el('div', { className: 'card', style: 'border: 1px solid #cbd5e1; background: transparent; padding: 0; box-shadow: none;' });
    
    const headerBox = el('div', { style: 'background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #cbd5e1;' });
    headerBox.innerHTML = `
        <h2 style="color: #0f172a; margin-top:0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Resultados: ${escapeHTML(compName)}</h2>
        <div style="font-size:14px; color:#64748b; font-weight:bold; margin-top: 10px;">Total de Atletas: ${rows.length}</div>
    `;
    container.appendChild(headerBox);

    if (rows.length === 0) {
        headerBox.innerHTML += `<div style="margin-top:20px; color:#ef4444; font-weight:bold;">A base de dados retornou 0 atletas para esta competição.</div>`;
        wrap.appendChild(container);
        return;
    }

    const grouped = {};
    rows.forEach(r => {
        const cCode = extractClass(r);
        if (!grouped[cCode]) grouped[cCode] = [];
        grouped[cCode].push(r);
    });

    const sortedClasses = Object.keys(grouped).sort();

    sortedClasses.forEach(cCode => {
        const classRows = grouped[cCode];
        classRows.sort((a,b) => (Number(extractRank(a)) || 999) - (Number(extractRank(b)) || 999));

        const classBlock = el('div', { style: 'background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 30px; overflow: hidden;' });
        
        const classHeader = el('div', { style: 'background: #0f172a; color: #fff; padding: 12px 20px; font-weight: bold; font-size: 18px; display: flex; justify-content: space-between; align-items: center;' });
        classHeader.innerHTML = `<span>Classe: ${escapeHTML(cCode)}</span> <span style="font-size:12px; font-weight:normal; background:rgba(255,255,255,0.2); padding:4px 10px; border-radius:12px;">${classRows.length} Atletas</span>`;
        classBlock.appendChild(classHeader);

        const table = el('table', { className: 'tbl compact', style: 'width:100%; font-size: 14px; text-align: left; border-collapse: collapse;' });
        
        const theadArr = [
            el('th', {style:'padding:12px 15px; width:80px; text-align:center; border-bottom: 2px solid #cbd5e1; color: #475569;'}, 'Posição'), 
            el('th', {style:'padding:12px 15px; border-bottom: 2px solid #cbd5e1; color: #475569;'}, 'Atleta'), 
            el('th', {style:'padding:12px 15px; border-bottom: 2px solid #cbd5e1; color: #475569;'}, 'Clube / Região')
        ];
        // 🔥 SÓ MOSTRA COLUNAS DE ADMIN SE PUDER EDITAR
        if (state.canEdit) { 
            theadArr.push(el('th', {style:'padding:12px 15px; border-bottom: 2px solid #cbd5e1; color: #475569; width: 300px;'}, 'Painel Admin - Editar')); 
            theadArr.push(el('th', {style:'padding:12px 15px; border-bottom: 2px solid #cbd5e1; color: #475569; width: 150px;'}, 'Ações')); 
        }
        
        const thead = el('thead', {style: 'background: #f8fafc;'}, el('tr', {}, theadArr));
        const tbody = el('tbody');

        classRows.forEach(r => {
            const tr = el('tr', { style: 'border-bottom: 1px solid #e2e8f0;' });

            const rankVal = Number(extractRank(r)) || 0;
            let badgeStyle = 'background: #e2e8f0; color: #475569; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 14px;';
            if (rankVal === 1) badgeStyle = 'background: #fbbf24; color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(251, 191, 36, 0.4); border: 1px solid #d97706;';
            else if (rankVal === 2) badgeStyle = 'background: #94a3b8; color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(148, 163, 184, 0.4); border: 1px solid #64748b;';
            else if (rankVal === 3) badgeStyle = 'background: #b45309; color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(180, 83, 9, 0.4); border: 1px solid #78350f;';

            const rankTd = el('td', { style: 'padding:12px 15px; text-align:center; vertical-align: middle;' }, el('span', { style: badgeStyle }, rankVal ? `${rankVal}º` : '-'));
            tr.appendChild(rankTd);

            const aName = extractName(r);
            const cNameWithRegion = resolveClubInfo(r, state.lookups.clubes);

            tr.appendChild(el('td', { style: 'padding:12px 15px; font-weight: bold; color:#1e293b; font-size: 15px; vertical-align: middle;' }, escapeHTML(aName)));
            tr.appendChild(el('td', { style: 'padding:12px 15px; color: #64748b; font-size: 12px; font-weight:bold; vertical-align: middle;' }, escapeHTML(cNameWithRegion)));

            if (state.canEdit) {
                const boxTd = el('td', { style: 'padding:12px 15px; vertical-align: middle;' }, []);
                
                const hiddenAth = el('input', { type: 'hidden', value: r.athlete_id || '', 'data-f': 'athlete_id' });
                const hiddenClub = el('input', { type: 'hidden', value: r.club_id || '', 'data-f': 'club_id' });
                const hiddenAthName = el('input', { type: 'hidden', value: aName, 'data-f': 'atleta_nome' });
                const hiddenClubName = el('input', { type: 'hidden', value: extractClub(r), 'data-f': 'clube_nome' });

                const rankInput = el('input', { type: 'number', value: rankVal || '', 'data-f': 'rank', className: 'compact-inp', style: 'width:60px; margin-right:8px; padding: 6px; border: 1px solid #cbd5e1; border-radius:4px;' });
                const classInput = el('input', { value: cCode || '', 'data-f': 'class_code', className: 'compact-inp', style: 'width:80px; margin-right:8px; padding: 6px; border: 1px solid #cbd5e1; border-radius:4px;' });

                const rel = el('div', { className: 'rel', style: 'display:inline-block; width:100%; max-width: 200px; position:relative;' });
                const inp = el('input', { placeholder: 'Corrigir atleta...', className: 'w-100 compact-inp', style: 'padding: 6px; border: 1px solid #cbd5e1; border-radius:4px;' });
                const dd = el('div', { className: 'dropdown', hidden: true, style: 'z-index: 100; position:absolute; width:100%; background:#fff; border:1px solid #cbd5e1; border-radius:4px; max-height:200px; overflow-y:auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);' });

                inp.addEventListener('input', debounce(async () => {
                    const q = normStr(inp.value);
                    if (q.length < 2) { dd.hidden = true; dd.innerHTML = ''; return; }
                    let cands = state.lookups.athletes.filter(a => normStr(a.nome).includes(q)).slice(0, 5);
                    dd.innerHTML = '';
                    cands.forEach((c) => {
                        const b = el('button', { type: 'button', className: 'dd-item', style: 'width:100%; text-align:left; padding:8px; border:none; border-bottom:1px solid #eee; background:transparent; cursor:pointer;' }, `${c.nome} (${c.classe_code || ''})`);
                        b.addEventListener('click', () => {
                            hiddenAth.value = c.id; 
                            hiddenClub.value = c.clube_id || '';
                            hiddenAthName.value = c.nome;
                            hiddenClubName.value = c.clube_nome || '';
                            inp.value = c.nome; 
                            dd.hidden = true;
                        });
                        b.addEventListener('mouseover', () => b.style.background = '#f1f5f9');
                        b.addEventListener('mouseout', () => b.style.background = 'transparent');
                        dd.appendChild(b);
                    });
                    dd.hidden = cands.length === 0;
                }, 250));

                rel.appendChild(inp); rel.appendChild(dd);
                
                const divEdit = el('div', {style: 'display:flex; align-items:center;'});
                divEdit.appendChild(rankInput); divEdit.appendChild(classInput); divEdit.appendChild(rel);
                divEdit.appendChild(hiddenAth); divEdit.appendChild(hiddenClub);
                divEdit.appendChild(hiddenAthName); divEdit.appendChild(hiddenClubName);
                boxTd.appendChild(divEdit);
                tr.appendChild(boxTd);

                const act = el('td', { style: 'padding:12px 15px; vertical-align: middle;' }, []);
                const bSave = el('button', { className: 'btn small good', style: 'background: #16a34a; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;' }, 'Salvar');
                bSave.addEventListener('click', () => saveLine(tr, state.resultsCompId, r.id));
                const bDel = el('button', { className: 'btn small warn', style: 'background: #ef4444; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-left: 6px;' }, 'Excluir');
                bDel.addEventListener('click', () => delLine(state.resultsCompId, r.id));
                act.appendChild(bSave); act.appendChild(bDel);
                tr.appendChild(act);
            }

            tbody.appendChild(tr);
        });

        table.appendChild(thead); table.appendChild(tbody);
        classBlock.appendChild(table);
        container.appendChild(classBlock);
    });

    wrap.appendChild(container);
  }

  function updateRowFromAthlete(row, a) {
    row.athlete_id = a.id;
    row.athlete_nome = a.nome;
    row.class_code = a.classe_code || row.class_code;
    row.club_id = a.clube_id || null;
    row.club_nome = a.clube_nome || '';
    row.accepted = true;
    row.excluded = false;
    recomputeRowSimilarity(row);
  }

  function fillPickClubSelect() {
    const sel = $('#p_club');
    if (!sel) return;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = '(qualquer clube)';
    sel.appendChild(opt0);
    (state.lookups.clubes || []).forEach(c => {
      const o = document.createElement('option');
      o.value = String(c.id); o.textContent = c.nome;
      sel.appendChild(o);
    });
  }

  function openPickAthleteDialog(rowIndex) {
    const row = state.draftRows[rowIndex];
    if (!row) return;
    const dlg = $('#dlgPickAthlete');
    dlg.dataset.rowIndex = String(rowIndex);
    fillPickClubSelect();
    $('#p_query').value = row.csv.name || '';
    $('#p_class').value = row.class_code || row.csv.class || '';
    $('#p_club').value = row.club_id ? String(row.club_id) : '';
    $('#pickResults').innerHTML = '';
    dlg.showModal();
    runPickSearch();
  }

  const runPickSearch = debounce(async () => {
    const dlg = $('#dlgPickAthlete');
    const rowIndex = Number(dlg.dataset.rowIndex);
    const row = state.draftRows[rowIndex];
    if (!row) return;
    const query = normStr($('#p_query').value);
    const class_code = $('#p_class').value.trim().toLowerCase();
    const club_id = $('#p_club').value.trim();

    try {
      let list = state.lookups.athletes;
      if (query) list = list.filter(a => normStr(a.nome).includes(query));
      if (class_code) list = list.filter(a => (a.classe_code||'').toLowerCase() === class_code);
      if (club_id) list = list.filter(a => String(a.clube_id) === String(club_id));

      const box = $('#pickResults');
      box.innerHTML = '';

      if (!list.length) {
        box.appendChild(el('div', { style: 'font-size:12px; opacity:.8; text-align:center;' }, 'Nenhum atleta encontrado.'));
        return;
      }

      const t = el('table', { className: 'tbl compact', style: 'width:100%;' });
      t.appendChild(el('thead', {}, el('tr', {}, [
        el('th', { className: 'cell' }, 'Nome'), el('th', { className: 'cell' }, 'Classe'),
        el('th', { className: 'cell' }, 'Clube'), el('th', { className: 'cell' }, 'Semelhança'), el('th', { className: 'cell' }, '')
      ])));

      const tb = el('tbody');
      list.forEach(a => {
        const tr = el('tr', {}, []);
        const sim = similarityPct(row.csv?.name, row.csv?.club, a.nome, a.clube_nome);
        tr.appendChild(el('td', { className: 'cell' }, a.nome || ''));
        tr.appendChild(el('td', { className: 'cell' }, a.classe_code || ''));
        tr.appendChild(el('td', { className: 'cell' }, a.clube_nome || ''));
        tr.appendChild(el('td', { className: 'cell' }, `${sim}%`));
        const b = el('button', { className: 'btn small good' }, 'Selecionar');
        b.addEventListener('click', () => {
          updateRowFromAthlete(row, a);
          renderPreviewTable();
          $('#dlgPickAthlete').close();
        });
        tr.appendChild(el('td', { className: 'cell' }, b));
        tb.appendChild(tr);
      });
      t.appendChild(tb); box.appendChild(t);
    } catch (e) { $('#pickResults').innerHTML = `<div class="warn" style="text-align:center;">${e.message}</div>`; }
  }, 250);

  function openCreateAthleteDialog(rowIndex) {
    const r = state.draftRows[rowIndex];
    if (!r) return;
    const dlg = $('#dlgCreateAthlete');
    dlg.dataset.rowIndex = String(rowIndex);
    const form = $('#frmCreateAthlete');

    getEl(form, 'nome').value = r.csv.name || '';
    getEl(form, 'class_code').value = r.class_code || r.csv.class || '';

    const selClass = getEl(form, 'class_code');
    selClass.innerHTML = '';
    (state.lookups.classes || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.codigo || c.code || c.id;
      opt.textContent = `${opt.value} - ${c.nome || c.name}`;
      selClass.appendChild(opt);
    });

    const selClub = getEl(form, 'club_id');
    selClub.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = '(sem clube)';
    selClub.appendChild(opt0);
    (state.lookups.clubes || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = String(c.id); opt.textContent = c.nome || c.name;
      selClub.appendChild(opt);
    });

    getEl(form, 'club_id').value = r.club_id ? String(r.club_id) : '';
    getEl(form, 'club_nome').value = r.csv.club || '';

    const rbExisting = getEl(form, 'club_mode_existing');
    const rbNew = getEl(form, 'club_mode_new');

    const setMode = (mode) => {
      selClub.disabled = (mode !== 'existing');
      getEl(form, 'club_nome').disabled = (mode !== 'new');
      if (mode === 'existing') getEl(form, 'club_nome').value = r.csv.club || '';
      if (mode === 'new') selClub.value = '';
    };

    rbExisting.checked = true; setMode('existing');
    rbExisting.onchange = () => setMode('existing');
    rbNew.onchange = () => setMode('new');
    dlg.showModal();
  }

  async function submitCreateAthlete(e) {
    e.preventDefault();
    const dlg = $('#dlgCreateAthlete');
    const idx = Number(dlg.dataset.rowIndex);
    const row = state.draftRows[idx];
    if (!row) return;

    const form = $('#frmCreateAthlete');
    const nome = getEl(form, 'nome').value.trim();
    const class_code = getEl(form, 'class_code').value.trim();
    if (!nome) return alert('Informe o nome do atleta.');
    if (!class_code) return alert('Informe a classe.');

    const rbExisting = getEl(form, 'club_mode_existing');
    const mode = rbExisting.checked ? 'existing' : 'new';
    let club_id = mode === 'existing' ? (getEl(form, 'club_id').value ? String(getEl(form, 'club_id').value) : null) : null;
    let club_nome = mode === 'new' ? getEl(form, 'club_nome').value.trim() : '';

    try {
      if (mode === 'new' && club_nome) {
          const clubRef = await addDoc(collection(db, "clubes"), { nome: club_nome });
          club_id = clubRef.id;
      }
      const athData = { nome, classe_code: class_code, clube_id: club_id };
      const athRef = await addDoc(collection(db, "atletas"), athData);
      const a = { id: athRef.id, ...athData, clube_nome: club_nome || (club_id ? state.lookups.clubes.find(x=>x.id===club_id)?.nome : '') };

      updateRowFromAthlete(row, a);
      await loadLookups();
      renderPreviewTable();
      dlg.close();
    } catch (err) { alert('Falha ao cadastrar atleta: ' + err.message); }
  }

  async function loadPreview() {
    const file = $('#i_csv').files?.[0];
    if (!file) { alert('Selecione um CSV.'); return; }
    try {
      const prev = await parseCSVFile(file);
      state.preview = prev;
      state.csvColumns = prev.fields.slice();
      state.draftRows = prev.items.map((it) => {
        let bestAth = null;
        let maxSim = -1;
        state.lookups.athletes.forEach(a => {
            const sim = similarityPct(it.name || it.nome, it.club || it.clube, a.nome, a.clube_nome);
            if(sim > maxSim) { maxSim = sim; bestAth = a; }
        });
        return {
          csv: {
            class: it.class || it.classe || '',
            name: it.name || it.nome || '',
            club: it.club || it.clube || '',
            rank: (it.rank == null || it.rank === '') ? '' : it.rank,
          },
          class_code: bestAth?.classe_code || it.class || it.classe || '',
          athlete_id: bestAth?.id || null,
          athlete_nome: bestAth?.nome || '',
          club_id: bestAth?.clube_id || null,
          club_nome: bestAth?.clube_nome || '',
          similarity: maxSim,
          rank: Number.isFinite(Number(it.rank)) ? Number(it.rank) : null,
          excluded: false,
          accepted: false,
        };
      });
      renderPreviewTable();
      const anchor = $('#previewBox');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { alert('Falha no preview: ' + e.message); }
  }

  function renderPreviewTable() {
    const box = $('#previewBox');
    const draft = state.draftRows || [];
    box.innerHTML = '';
    if (!draft.length) {
      box.appendChild(el('div', { style: 'text-align:center;' }, 'Nenhuma linha no preview.'));
      return;
    }

    const style = el('style', {}, `
      .tbl.compact{ font-size:12px; width:100%; border-collapse:collapse; }
      .tbl.compact th,.tbl.compact td{ padding:6px 8px; border-bottom:1px solid rgba(0,0,0,.08); }
      .cell{ text-align:center; vertical-align:middle; }
      .rowZebra tbody tr:nth-child(odd){ background: rgba(255,255,255,0.04); }
      .rowZebra tbody tr:nth-child(even){ background: rgba(0,0,0,0.04); }
      .actions{ display:flex; gap:6px; align-items:center; justify-content:center; }
      .btnIcon{ width:30px; height:28px; padding:0; border-radius:8px; font-size:13px; line-height:28px; border:0; opacity:.28; filter: grayscale(1); cursor:pointer; }
      .btnIcon.active{ opacity:1; filter:none; box-shadow: 0 0 0 2px rgba(255,255,255,0.18) inset; }
      .btnRed{ background:#c0392b; color:#fff; }
      .btnGreen{ background:#1e8e3e; color:#fff; }
      .btnYel{ background:#f1c40f; color:#111; }
      .btnGray{ background:#bdc3c7; color:#111; }
      .rowExcluded{ opacity:.45; text-decoration:line-through; }
      .pctBadge{ display:inline-block; padding:2px 8px; border-radius:999px; font-weight:800; font-size:12px; border:1px solid rgba(0,0,0,.18); background: rgba(0,0,0,.04); }
      .pctGood{ background: rgba(30, 142, 62, .12); border-color: rgba(30, 142, 62, .35); }
      .pctMid{ background: rgba(241, 196, 15, .18); border-color: rgba(241, 196, 15, .5); }
      .pctBad{ background: rgba(192, 57, 43, .12); border-color: rgba(192, 57, 43, .35); }
    `);
    box.appendChild(style);

    const head = ['Classe (CSV)', 'Atleta (CSV)', 'Clube (CSV)', 'Rank (CSV)', 'Nome (sistema)', 'Clube (sistema)', '% semelhança', 'Ações'];
    const t = el('table', { className: 'tbl compact rowZebra', style: 'width:100%;' }, []);
    t.appendChild(el('thead', {}, el('tr', {}, head.map(h => el('th', { className: 'cell' }, h)))));

    const tb = el('tbody');
    draft.forEach((d, idx) => {
      recomputeRowSimilarity(d);
      const tr = el('tr', { className: d.excluded ? 'rowExcluded' : '' }, []);
      tr.appendChild(el('td', { className: 'cell' }, d.csv.class || ''));
      tr.appendChild(el('td', { className: 'cell' }, d.csv.name || ''));
      tr.appendChild(el('td', { className: 'cell' }, d.csv.club || ''));
      tr.appendChild(el('td', { className: 'cell' }, (d.csv.rank === '' ? '—' : String(d.csv.rank))));
      tr.appendChild(el('td', { className: 'cell' }, d.athlete_nome || '(não encontrado)'));
      tr.appendChild(el('td', { className: 'cell' }, d.club_nome || ''));

      const pct = clampPct(d.similarity || 0);
      const cls = pct >= 85 ? 'pctBadge pctGood' : pct >= 55 ? 'pctBadge pctMid' : 'pctBadge pctBad';
      tr.appendChild(el('td', { className: 'cell' }, el('span', { className: cls }, `${pct}%`)));

      const act = el('td', { className: 'cell' }, []);
      const wrap = el('div', { className: 'actions' });
      const bX = el('button', { type: 'button', className: 'btnIcon btnRed', title: 'Não computar o resultado' }, '✕');
      const bOk = el('button', { type: 'button', className: 'btnIcon btnGreen', title: 'Aceitar o resultado' }, '✓');
      const bWarn = el('button', { type: 'button', className: 'btnIcon btnYel', title: 'Alterar atleta' }, '!');
      const bIns = el('button', { type: 'button', className: 'btnIcon btnGray', title: 'Inserir atleta no sistema' }, '+');

      const setActive = () => {
        bX.classList.toggle('active', d.excluded);
        bOk.classList.toggle('active', d.accepted);
      };

      bX.addEventListener('click', () => { d.excluded = true; d.accepted = false; setActive(); renderPreviewTable(); });
      bOk.addEventListener('click', () => {
        if (!d.athlete_id) return alert('Para aceitar, use ! para escolher atleta ou + para cadastrar no sistema.');
        if (!d.class_code) return alert('Para aceitar, informe a classe.');
        d.accepted = true; d.excluded = false; setActive(); renderPreviewTable();
      });

      bWarn.addEventListener('click', () => openPickAthleteDialog(idx));
      bIns.addEventListener('click', () => openCreateAthleteDialog(idx));

      wrap.appendChild(bX); wrap.appendChild(bOk); wrap.appendChild(bWarn); wrap.appendChild(bIns);
      act.appendChild(wrap); tr.appendChild(act);
      tb.appendChild(tr); setActive();
    });

    t.appendChild(tb); box.appendChild(t);
    const valid = draft.filter(d => !d.excluded && d.accepted && d.athlete_id && d.class_code).length;
    const total = draft.length;
    $('#btnSaveMapped').textContent = `Salvar ${valid}/${total}`;
  }

  async function saveMapped() {
    const nome = $('#i_nome').value.trim();
    const local = $('#i_local').value.trim();
    const dataISO = brToISO($('#i_data').value.trim());
    if (!nome) { alert('Informe o nome da competição.'); return; }
    if (!dataISO) { alert('Data inválida. Use DD/MM/AAAA.'); return; }

    const rows = (state.draftRows || [])
      .filter(r => !r.excluded && r.accepted && r.athlete_id && r.class_code)
      .map(r => ({
        class_code: r.class_code,
        athlete_id: r.athlete_id,
        atleta_nome: r.athlete_nome,
        rank: r.rank,
        club_id: r.club_id,
        clube_nome: r.club_nome
      }));

    if (!rows.length) { alert('Nenhuma linha aceita para salvar.'); return; }

    try {
      const compRef = await addDoc(collection(db, "competitions"), {
          nome, name: nome, local, data_inicio: dataISO, start_date: dataISO, historica_csv: true, created_at: new Date().toISOString()
      });
      for (const row of rows) {
          await addDoc(collection(db, "historical_results"), { competition_id: compRef.id, ...row });
      }
      alert(`Importado: ${rows.length} linhas. Competição ID: ${compRef.id}`);
      state.preview = null;
      state.draftRows = [];
      $('#previewBox').innerHTML = '';
      await loadCompetitions();
    } catch (e) { alert('Falha ao importar pro Firebase: ' + e.message); }
  }

  function renderList() {
    const box = $('#compList');
    box.innerHTML = '';
    if (state.error) box.appendChild(el('div', { className: 'warn' }, state.error));
    const comps = (state.competitions || []).slice();
    if (!comps.length) {
      box.appendChild(el('div', { style: 'font-size:12px; opacity:.75; padding:10px; text-align:center;' }, 'Nenhum resultado finalizado encontrado no arquivo.'));
      return;
    }
    comps.sort((a, b) => String(b.data_inicio || '').localeCompare(String(a.data_inicio || '')));

    const t = el('table', { className: 'tbl compact', style: 'width:100%; text-align:left; font-size: 14px;' }, []);
    t.appendChild(el('thead', { style: 'background: #f8fafc; border-bottom: 2px solid #e2e8f0;' }, el('tr', {}, [
      el('th', { style: 'padding: 15px;' }, 'Nome da Competição'), el('th', { style: 'width:140px; padding: 15px;' }, 'Data'),
      el('th', { style: 'padding: 15px;' }, 'Local'), el('th', { style: 'width:400px; text-align:right; padding: 15px;' }, 'Ações e Relatórios'),
    ])));

    const tb = el('tbody');
    comps.forEach((c) => {
      const tr = el('tr', { style: 'border-bottom: 1px solid #eee;' }, []);
      tr.appendChild(el('td', { style: 'padding: 15px; font-weight: bold; color: #1e293b; font-size: 15px;' }, c.nome || c.name || ''));
      tr.appendChild(el('td', { style: 'padding: 15px; color: #64748b;' }, isoToBR(c.data_inicio || c.start_date || '')));
      tr.appendChild(el('td', { style: 'padding: 15px; color: #64748b;' }, c.local || ''));

      const tdA = el('td', { style: 'text-align:right; white-space:nowrap; padding: 15px;' }, []);
      
      const isSystemComp = c.status === "FINISHED"; 
      
      const podiumStyle = isSystemComp ? 'background: #fbbf24; color: #92400e; margin-right:6px; text-decoration:none; display:inline-block;' : 'background: #f1f5f9; color: #94a3b8; margin-right:6px; text-decoration:none; display:inline-block; border: 1px solid #cbd5e1; cursor:pointer; opacity:0.6;';
      const reportStyle = isSystemComp ? 'background: #16a34a; color: #fff; margin-right:6px; text-decoration:none; display:inline-block;' : 'background: #f1f5f9; color: #94a3b8; margin-right:6px; text-decoration:none; display:inline-block; border: 1px solid #cbd5e1; cursor:pointer; opacity:0.6;';

      const bPodium = el('a', { href: isSystemComp ? `#/competitions/final-results?id=${c.id}` : 'javascript:void(0)', className: 'btn small', style: podiumStyle }, '🏆 Pódio');
      const bReport = el('a', { href: isSystemComp ? `#/competitions/report?id=${c.id}` : 'javascript:void(0)', className: 'btn small', style: reportStyle }, '📄 Relatório');

      if (!isSystemComp) {
          bPodium.addEventListener('click', (e) => { e.preventDefault(); alert('Competição não realizada pelo sistema atual. Sem dados de Pódio.'); });
          bReport.addEventListener('click', (e) => { e.preventDefault(); alert('Competição não realizada pelo sistema atual. Sem dados de Relatório.'); });
      }

      if (state.canEdit) {
          const bEdit = el('button', { className: 'btn small', style: 'margin-right:6px;' }, '✏️ Editar');
          bEdit.addEventListener('click', () => openEditCompetitionDialog(c));
          
          const bRes = el('button', { className: 'btn small', style: 'margin-right:6px; background:#e2e8f0; color:#0f172a;' }, '⚙️ Ajustar CSV');
          bRes.addEventListener('click', () => loadResults(c.id));
          
          const bDel = el('button', { className: 'btn small warn' }, '🗑️ Excluir');
          bDel.addEventListener('click', () => deleteCompetition(c.id));

          tdA.appendChild(bPodium);
          tdA.appendChild(bReport);
          tdA.appendChild(bEdit);
          tdA.appendChild(bRes);
          tdA.appendChild(bDel);
      } else {
          const bRes = el('button', { className: 'btn small', style: 'background:#e2e8f0; color:#0f172a;' }, '📊 Tabela CSV');
          bRes.addEventListener('click', () => loadResults(c.id));
          
          tdA.appendChild(bPodium);
          tdA.appendChild(bReport);
          tdA.appendChild(bRes);
      }

      tr.appendChild(tdA);
      tb.appendChild(tr);
    });
    t.appendChild(tb); box.appendChild(t);
  }
}