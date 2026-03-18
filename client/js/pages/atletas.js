// client/js/pages/atletas.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// 🔥 IMPORTAÇÃO DO CÉREBRO
import { canEditGlobal } from '../permissions.js';

function escapeHTML(s = '') { 
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); 
}

// ============================================================================
// LÓGICA DA ABA DE ATLETAS (INDIVIDUAL)
// ============================================================================
async function renderAbaAtletas(container, rootState) {
  // Verifica se o usuário pode editar atletas globalmente
  const canEdit = canEditGlobal('atletas');

  const state = {
    filtros: {
      q: '', classe_code: '', clube_id: '', genero: '', regiao: '',
      competition_id: '', page: 1, limit: 200,
      sort: 'nome',
    },
    items: [], total: 0,
    classes: rootState.classes, clubes: rootState.clubes, regions: rootState.regions, competitions: rootState.competitions,
    editingId: null,
    historicoMap: {} 
  };

  container.innerHTML = `
    <div style="display:grid; gap:10px; margin-bottom:10px;">
      <div class="filt-row1" style="display:grid; grid-template-columns: 3fr 2fr 3fr 1fr 2fr; gap:10px; align-items:end;">
        <label style="display:grid; gap:4px;">
          <span>Nome</span>
          <input id="flt-q" type="search" placeholder="Buscar por nome…" />
        </label>
        <label style="display:grid; gap:4px;">
          <span>Classe</span>
          <select id="flt-classe"><option value="">Todas</option></select>
        </label>
        <label style="display:grid; gap:4px;">
          <span>Clube</span>
          <select id="flt-clube"><option value="">Todos</option></select>
        </label>
        <label style="display:grid; gap:4px;">
          <span>Gênero</span>
          <select id="flt-genero">
            <option value="">Todos</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </label>
        <label style="display:grid; gap:4px;">
          <span>Região</span>
          <select id="flt-regiao"><option value="">Todas</option></select>
        </label>
      </div>

      <div class="filt-row2" style="display:grid; grid-template-columns: 5fr auto auto 1fr; gap:10px; align-items:end;">
        <label style="display:grid; gap:4px;">
          <span>Competição Base para Rank</span>
          <select id="flt-comp"><option value="">(Nenhuma - Rank oculto)</option></select>
        </label>
        <button id="btn-aplicar" style="background:#0f172a; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">Filtrar</button>
        <button id="btn-limpar" class="ghostbtn" style="padding:8px 16px; border-radius:6px; cursor:pointer;">Limpar</button>
        <span id="atl-count" aria-live="polite" style="justify-self:end; color:var(--muted); font-weight:bold;"></span>
      </div>
    </div>

    <div class="atl-toolbar" style="display:${canEdit ? 'flex' : 'none'}; gap:8px; margin:4px 0 10px;">
      <button id="btn-novo" style="background:#16a34a; color:white; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer;">Novo atleta</button>
      <button id="btn-export" class="ghostbtn">Exportar CSV</button>
      <label class="ghostbtn" style="display:inline-flex; gap:8px; align-items:center; cursor:pointer;">
        <input id="inp-import" type="file" accept=".csv,text/csv" hidden />
        Importar CSV
      </label>
    </div>

    <div role="region" aria-label="Lista de atletas" style="border:1px solid var(--card-border); border-radius:10px; overflow:auto;">
      <table id="tbl-atletas" style="width:100%; border-collapse:collapse; table-layout:fixed; background:white;">
        <colgroup>
          <col style="width:30%;">  <col style="width:8%;">   <col style="width:12%;">  <col style="width:22%;">  <col style="width:12%;">  <col style="width:8%;">   ${canEdit ? '<col style="width:8%;">' : ''}   
        </colgroup>
        <thead style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
          <tr>
            <th data-sort="nome" class="atl-sort" style="padding:12px; text-align:left;">Nome do Atleta</th>
            <th data-sort="genero" class="atl-sort" style="padding:12px; text-align:left;">Gênero</th>
            <th data-sort="classe_code" class="atl-sort" style="padding:12px; text-align:left;">Classe</th>
            <th data-sort="clube" class="atl-sort" style="padding:12px; text-align:left;">Clube(s)</th>
            <th data-sort="regiao" class="atl-sort" style="padding:12px; text-align:left;">Região</th>
            <th data-sort="rank" class="atl-sort" style="text-align:right; padding:12px;" id="th-rank">Rank</th>
            ${canEdit ? '<th style="text-align:right; padding:12px;">Ações</th>' : ''}
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <dialog id="dlg-form">
      <div style="background:white; padding:25px; border-radius:12px; min-width:520px; max-width:85vw;">
        <h3 id="dlg-title" style="margin-top:0; border-bottom:2px solid #e2e8f0; padding-bottom:10px; color:#0f172a;">Novo atleta</h3>
        <form id="frm-atleta">
          <div style="display:grid; gap:15px;">
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:13px; color:#475569;">Nome
              <input id="f-nome" type="text" required maxlength="200" style="padding:8px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px; font-size:14px;" />
            </label>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
              <label style="display:flex; flex-direction:column; font-weight:bold; font-size:13px; color:#475569;">Gênero
                <select id="f-genero" required style="padding:8px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px; font-size:14px;">
                  <option value="">Selecione…</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </label>
              <label style="display:flex; flex-direction:column; font-weight:bold; font-size:13px; color:#475569;">Classe
                <select id="f-classe" required style="padding:8px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px; font-size:14px;">
                  <option value="">Selecione…</option>
                </select>
              </label>
            </div>
            
            <div id="clubes-container" style="display:grid; gap:10px; background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; font-size:13px; color:#475569;">Clube(s) Vinculado(s)</span>
                    <button type="button" id="btn-add-clube" style="background:#0f172a; color:white; border:none; padding:6px 12px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">+ Adicionar Clube</button>
                </div>
                <div id="lista-selecao-clubes">
                    </div>
            </div>
            
            <div id="wrapper-rampa" style="display:none; background:#fff1f2; padding:15px; border-radius:8px; border:1px solid #fecdd3; margin-top:5px;">
                <label style="color:#be123c; font-weight:bold; font-size:13px; display:flex; flex-direction:column;">Operador de Rampa (Assistente BC3)
                    <input id="f-rampa" type="text" maxlength="200" placeholder="Nome completo do Operador de Rampa" style="padding:8px; border:1px solid #fda4af; border-radius:6px; margin-top:5px; font-size:14px;" />
                </label>
            </div>

          </div>
          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:25px; border-top:1px solid #e2e8f0; padding-top:15px;">
            <button type="button" id="btn-cancelar-modal" style="background:#e2e8f0; color:#475569; border:none; padding:10px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">Cancelar</button>
            <button type="submit" id="btn-salvar" style="background:#3b82f6; color:white; border:none; padding:10px 30px; border-radius:6px; font-weight:bold; cursor:pointer;">Salvar</button>
          </div>
        </form>
      </div>
    </dialog>
  `;

  const tbody = container.querySelector('#tbl-atletas');
  const frm = container.querySelector('#frm-atleta');
  const dlg = container.querySelector('#dlg-form');
  const btnCancel = container.querySelector('#btn-cancelar-modal');

  const on = (sel, ev, fn) => { const el = container.querySelector(sel); if (el) el.addEventListener(ev, fn); };
  const qs = (sel) => container.querySelector(sel);
  
  const escHtml = escapeHTML;
  const escAttr = (s = '') => String(s).replace(/"/g, '&quot;');
  const normalize = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const toast = (msg, type = 'info') => { if (window.__toast) window.__toast(msg, type); else alert(msg); };
  const setBusy = (on) => { const sec = qs('section'); if (sec) sec.setAttribute('aria-busy', on ? 'true' : 'false'); };

  // 🔥 FUNÇÃO PARA CRIAR DROPDOWN DINÂMICO DE CLUBES
  function criarSelectClube(valorInicial = "") {
      const wrapper = document.createElement('div');
      wrapper.style = "display:flex; gap:8px; margin-bottom:8px; align-items:center;";
      
      const clubesOrdenados = [...state.clubes].sort((a, b) => 
          (a.sigla || a.nome).localeCompare(b.sigla || b.nome)
      );

      const select = document.createElement('select');
      select.className = "f-clube-dinamico";
      select.style = "flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:14px;";
      
      select.innerHTML = `<option value="">(sem clube)</option>` +
          clubesOrdenados.map(c => `<option value="${c.id}" ${String(c.id) === String(valorInicial) ? 'selected' : ''}>${c.sigla ? escHtml(c.sigla) + ' - ' : ''}${escHtml(c.nome)}</option>`).join('');

      const btnRemove = document.createElement('button');
      btnRemove.type = "button";
      btnRemove.innerHTML = "✕";
      btnRemove.title = "Remover clube";
      btnRemove.style = "background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; border-radius:6px; padding:8px 12px; cursor:pointer; font-weight:bold;";
      btnRemove.onclick = () => {
          if (document.querySelectorAll('.f-clube-dinamico').length > 1) {
              wrapper.remove();
          } else {
              select.value = ""; 
          }
      };

      wrapper.appendChild(select);
      wrapper.appendChild(btnRemove);
      document.getElementById('lista-selecao-clubes').appendChild(wrapper);
  }

  on('#btn-aplicar', 'click', () => { capturaFiltros(); loadList(); });
  on('#btn-limpar', 'click', () => { limpaFiltros(); loadList(); });
  
  if (canEdit) {
    on('#btn-novo', 'click', () => openFormNovo());
    on('#btn-export', 'click', () => alert("Exportação CSV será implementada após a migração completa pro Firebase."));
    on('#inp-import', 'change', () => alert("Importação CSV será implementada após a migração completa pro Firebase."));
    
    // Evento do botão + Adicionar Clube no Modal
    on('#btn-add-clube', 'click', () => criarSelectClube());
  }

  const deb = debounce(() => { capturaFiltros(); loadList(); }, 350);
  on('#flt-q', 'input', deb);
  on('#f-classe', 'change', () => toggleRampaField());

  wireHeaderSort();

  btnCancel.addEventListener('click', () => dlg.close());

  frm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btnSalvar = qs('#btn-salvar');
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";

      try {
          const payload = coletaPayload();
          if (state.editingId) {
              await apiUpdateAtleta(state.editingId, payload);
              toast('Atleta atualizado com sucesso.', 'success');
          } else {
              await apiCreateAtleta(payload);
              toast('Atleta criado com sucesso.', 'success');
          }
          dlg.close();
          await loadList(); 
      } catch (err) {
          toast(err.message || 'Falha ao salvar', 'error');
      } finally {
          btnSalvar.disabled = false;
          btnSalvar.textContent = "Salvar";
      }
  });

  preencherSelects();
  capturaFiltros();
  await loadList();

  /* ===================== FIREBASE CALLS (Atletas) ===================== */
  async function apiListAtletas(filtros) {
    const atlRef = collection(db, "atletas");
    const snapshot = await getDocs(atlRef);
    
    let items = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // 🔥 LÓGICA DE MULTIPLOS CLUBES
      const cIds = data.clubes_ids || (data.clube_id ? [data.clube_id] : []);
      
      let nomesClubes = [];
      let regioesClubes = [];
      
      cIds.forEach(id => {
          const c = state.clubes.find(x => String(x.id) === String(id));
          if (c) {
              nomesClubes.push(c.nome);
              if (c.regiao) regioesClubes.push(c.regiao);
          }
      });

      const clube_nome_exibicao = nomesClubes.length > 0 ? nomesClubes.join(" / ") : '';
      const regiao_exibicao = regioesClubes.length > 0 ? [...new Set(regioesClubes)].join(" / ") : '';
      
      let dynRank = '-';
      if (filtros.competition_id && state.historicoMap[doc.id]) {
          dynRank = state.historicoMap[doc.id];
      }

      return { 
        id: doc.id, 
        ...data, 
        clubes_ids: cIds,
        clube_nome: clube_nome_exibicao, 
        regiao: regiao_exibicao,
        rank: dynRank
      };
    });

    if (filtros.classe_code) items = items.filter(i => i.classe_code === filtros.classe_code);
    if (filtros.genero) items = items.filter(i => i.genero === filtros.genero);
    
    // Verifica se o ID do clube buscado está dentro da Array de clubes_ids
    if (filtros.clube_id) items = items.filter(i => i.clubes_ids.includes(String(filtros.clube_id)));
    if (filtros.regiao) items = items.filter(i => i.regiao.includes(filtros.regiao));
    
    if (filtros.q) {
      const qn = normalize(filtros.q);
      items = items.filter(i => normalize(i.nome).includes(qn));
    }
    
    return { items, total: items.length };
  }

  async function loadHistoricoRank(compId) {
      state.historicoMap = {};
      if (!compId) return;
      try {
          const qStr = query(collection(db, "historical_results"), where("competition_id", "==", String(compId)));
          const snap = await getDocs(qStr);
          snap.forEach(doc => {
              const d = doc.data();
              state.historicoMap[String(d.athlete_id)] = Number(d.rank || d.posicao);
          });
      } catch (e) { console.warn("Erro ao buscar histórico para ranking", e); }
  }

  async function apiCreateAtleta(payload) { return await addDoc(collection(db, "atletas"), payload); }
  async function apiUpdateAtleta(id, payload) { return await updateDoc(doc(db, "atletas", id), payload); }
  async function apiDeleteAtleta(id) { return await deleteDoc(doc(db, "atletas", id)); }

  /* ============ Loads + UI (Atletas) ============ */
  function preencherSelects() {
    qs('#flt-classe').innerHTML = `<option value="">Todas</option>` +
      state.classes.map(c => `<option value="${escAttr(c.code || c.codigo)}">${escHtml(c.code || c.codigo)} — ${escHtml(c.name || c.nome || '')}</option>`).join('');

    const clubesOrdenados = [...state.clubes].sort((a, b) => (a.sigla || a.nome).localeCompare(b.sigla || b.nome));
    
    qs('#flt-clube').innerHTML = `<option value="">Todos</option>` +
      clubesOrdenados.map(c => `<option value="${escAttr(c.id)}">${c.sigla ? escHtml(c.sigla) + ' - ' : ''}${escHtml(c.nome)}</option>`).join('');

    qs('#flt-regiao').innerHTML = `<option value="">Todas</option>` +
      state.regions.map(r => `<option value="${escAttr(r)}">${escHtml(r)}</option>`).join('');

    qs('#flt-comp').innerHTML = `<option value="">(Nenhuma - Rank oculto)</option>` +
      state.competitions.map(c => `<option value="${escAttr(c.id)}">${escHtml(c.nome || ('Comp ' + c.id))}${c.data_inicio ? ' — ' + escHtml(c.data_inicio) : ''}</option>`).join('');
  }

  function capturaFiltros() {
    const get = sel => (qs(sel)?.value || '').trim();
    state.filtros.q = get('#flt-q');
    state.filtros.classe_code = get('#flt-classe');
    state.filtros.clube_id = get('#flt-clube');
    state.filtros.genero = get('#flt-genero').toUpperCase();
    state.filtros.regiao = get('#flt-regiao');
    state.filtros.competition_id = get('#flt-comp');
    state.filtros.page = 1;

    qs('#th-rank').textContent = state.filtros.competition_id ? 'Rank Oficial' : 'Rank';
  }

  function limpaFiltros() {
    ['#flt-q', '#flt-classe', '#flt-clube', '#flt-genero', '#flt-regiao', '#flt-comp'].forEach(sel => { const el = qs(sel); if (el) el.value = ''; });
    capturaFiltros();
  }

  async function loadList() {
    setBusy(true);
    try {
      if (state.filtros.competition_id) await loadHistoricoRank(state.filtros.competition_id);
      else state.historicoMap = {};

      const { items, total } = await apiListAtletas(state.filtros);

      const curSort = state.filtros.sort || 'nome';
      const curKey = stripSortKey(curSort);
      const curDesc = curSort.startsWith('-');
      const dir = curDesc ? 'desc' : 'asc';
      
      const filtered = sortLocal(items, curKey, dir);

      state.items = filtered;
      state.total = state.items.length || total;
      renderTable();
      qs('#atl-count').textContent = `${state.total} registro(s)`;

      renderSortIndicators();
    } catch (e) {
      state.items = []; state.total = 0; renderTable();
      toast(e.message || 'Falha ao carregar atletas', 'error');
    } finally { setBusy(false); }
  }

  function renderTable() {
    const tb = qs('#tbl-atletas tbody');
    tb.innerHTML = '';
    for (const a of state.items) {
      const tr = document.createElement('tr');
      const hasRampa = a.classe_code && a.classe_code.includes('BC3') && a.operador_rampa;
      
      tr.innerHTML = `
        <td>
            <div title="${escAttr(a.nome || '')}" style="font-weight:bold; color:#0f172a; font-size:14px;">${escHtml(a.nome || '')}</div>
            ${hasRampa ? `<div style="font-size:11px; color:#be123c; margin-top:2px;">Op. Rampa: ${escHtml(a.operador_rampa)}</div>` : ''}
        </td>
        <td style="color:#475569;">${escHtml(a.genero || '')}</td>
        <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:bold; color:#3b82f6;">${escHtml(a.classe_code || '')}</span></td>
        <td title="${escAttr(a.clube_nome || '')}" style="color:#334155; font-size:13px; font-weight:bold;">${escHtml(a.clube_nome || 'Sem Clube')}</td>
        <td style="color:#64748b; font-size:13px;">${escHtml(a.regiao || '')}</td>
        <td style="text-align:right; font-weight:bold; color: ${a.rank !== '-' ? '#2563eb' : '#94a3b8'};">${a.rank}</td>
        
        ${canEdit ? `
        <td style="text-align:right;">
          <button class="ghostbtn" data-ed="${a.id}" style="padding:6px 10px; font-size:12px;">Editar</button>
          <button class="ghostbtn danger" data-del="${a.id}" style="padding:6px 10px; font-size:12px; color:#ef4444;">Excluir</button>
        </td>` : ''}
      `;
      tb.appendChild(tr);
    }
    
    if (canEdit) {
        tb.querySelectorAll('[data-ed]').forEach(btn => {
          btn.addEventListener('click', () => openFormEditar(btn.getAttribute('data-ed')));
        });
        tb.querySelectorAll('[data-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-del');
            if (!confirm('Excluir este atleta?')) return;
            try { await apiDeleteAtleta(id); toast('Excluído.', 'success'); await loadList(); }
            catch (e) { toast(e.message || 'Falha ao excluir', 'error'); }
          });
        });
    }
  }

  function wireHeaderSort() {
    const ths = container.querySelectorAll('#tbl-atletas thead th[data-sort]');
    ths.forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (!key) return;

        const cur = state.filtros.sort || 'nome';
        const curKey = stripSortKey(cur);
        const curDesc = cur.startsWith('-');

        let next;
        if (curKey === key) {
          next = curDesc ? key : `-${key}`;
        } else {
          next = key;
        }

        state.filtros.sort = next;
        state.filtros.page = 1;
        loadList();
      });
    });
  }

  function renderSortIndicators() {
    const ths = container.querySelectorAll('#tbl-atletas thead th[data-sort]');
    const cur = state.filtros.sort || 'nome';
    const curKey = stripSortKey(cur);
    const curDesc = cur.startsWith('-');

    ths.forEach(th => {
      const key = th.getAttribute('data-sort');
      const baseLabel = th.textContent.replace(/\s+[▲▼]$/, '');
      if (key === curKey) th.textContent = `${baseLabel} ${curDesc ? '▼' : '▲'}`;
      else th.textContent = baseLabel;
    });
  }

  function stripSortKey(s) {
    const str = String(s || 'nome').trim();
    return str.startsWith('-') ? str.slice(1) : str;
  }

  function sortLocal(arr, key, dir) {
    const mul = dir === 'asc' ? 1 : -1;
    const copy = [...arr];
    copy.sort((a, b) => {
      if (key === 'rank') {
          const va = a.rank === '-' ? 9999 : Number(a.rank);
          const vb = b.rank === '-' ? 9999 : Number(b.rank);
          return (va - vb) * mul;
      }
      const sa = normalize(a?.[key] ?? '');
      const sb = normalize(b?.[key] ?? '');
      if (sa < sb) return -1 * mul;
      if (sa > sb) return 1 * mul;
      return 0;
    });
    return copy;
  }

  function toggleRampaField() {
      const classeSelect = qs('#f-classe');
      const rampaWrapper = qs('#wrapper-rampa');
      if (!classeSelect || !rampaWrapper) return;

      const classeCode = classeSelect.value || '';
      if (classeCode.toUpperCase().includes('BC3')) {
          rampaWrapper.style.display = 'block';
      } else {
          rampaWrapper.style.display = 'none';
          qs('#f-rampa').value = ''; 
      }
  }

  function openFormNovo() {
    state.editingId = null;
    qs('#dlg-title').textContent = 'Novo atleta';
    fillForm({ nome: '', genero: '', classe_code: '', clubes_ids: [], operador_rampa: '' }); 
    qs('#dlg-form').showModal();
  }

  function openFormEditar(id) {
    state.editingId = id;
    const row = state.items.find(x => String(x.id) === String(id));
    if (!row) return toast('Registro não encontrado.', 'error');
    qs('#dlg-title').textContent = 'Editar atleta';
    fillForm(row);
    qs('#dlg-form').showModal();
  }

  function fillForm(atleta) {
    const set = (sel, v) => { const el = qs(sel); if (el) el.value = (v ?? '') + ''; };
    const selClasse = qs('#f-classe');
    
    selClasse.innerHTML = `<option value="">Selecione…</option>` +
      state.classes.map(c => `<option value="${escAttr(c.code || c.codigo)}">${escHtml(c.code || c.codigo)} — ${escHtml(c.name || c.nome || '')}</option>`).join('');
    
    set('#f-nome', atleta.nome); 
    set('#f-genero', atleta.genero); 
    set('#f-classe', atleta.classe_code);

    // 🔥 Monta Dinamicamente os Selects de Clubes
    const container = document.getElementById('lista-selecao-clubes');
    container.innerHTML = ""; 

    const clubesDoAtleta = atleta.clubes_ids || (atleta.clube_id ? [atleta.clube_id] : []);

    if (clubesDoAtleta.length === 0) {
        criarSelectClube();
    } else {
        clubesDoAtleta.forEach(cid => criarSelectClube(cid));
    }

    set('#f-rampa', atleta.operador_rampa || '');
    toggleRampaField(); 
  }

  function coletaPayload() {
    const val = sel => (qs(sel)?.value || '').trim();
    const nome = val('#f-nome');
    const genero = val('#f-genero').toUpperCase();
    const classe_code = val('#f-classe');
    let operador_rampa = val('#f-rampa');

    if (!nome) throw new Error('Nome é obrigatório.');
    if (!classe_code) throw new Error('Classe é obrigatória.');
    if (!['M', 'F'].includes(genero)) throw new Error('Gênero inválido.');
    
    if (!classe_code.toUpperCase().includes('BC3')) operador_rampa = null;
    
    // 🔥 Captura todos os selects de clubes criados
    const selects = document.querySelectorAll('.f-clube-dinamico');
    const clubes_ids_raw = Array.from(selects).map(s => s.value).filter(v => v !== "");
    const clubes_ids = [...new Set(clubes_ids_raw)]; // Remove duplicatas de id igual

    return { 
        nome, 
        genero, 
        classe_code, 
        clubes_ids, // O Array Novo
        clube_id: clubes_ids[0] || null, // O antigo para não quebrar módulos que lêem só um
        operador_rampa 
    };
  }
}

// ============================================================================
// LÓGICA DA ABA DE PARES E EQUIPES
// ============================================================================
async function renderAbaEquipes(container, rootState) {
  const canEdit = canEditGlobal('atletas');

  const state = {
    teams: [],
    athletes: [],
    clubs: rootState.clubes,
    regions: rootState.regions,
    estados: rootState.estados,
    editingId: null,
    selectedAthletes: new Set()
  };

  const escapeHTML = (s = '') => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const toastSafe = (msg, type = 'info') => { if (window.__toast) window.__toast(msg, type); else alert(msg); };

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; margin-top: 10px;">
      <h2 style="margin: 0; color: #0f172a;">Gerenciamento de Pares e Equipes</h2>
      ${canEdit ? '<button class="btn btn-primary" id="btnNewTeam" style="background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">+ Novo Par / Equipe</button>' : ''}
    </div>

    <div class="table-responsive" style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
        <thead style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
          <tr>
            <th style="padding: 12px 15px; color: #475569;">Nome e Sigla</th>
            <th style="padding: 12px 15px; color: #475569;">Categoria</th>
            <th style="padding: 12px 15px; color: #475569;">Representação</th>
            <th style="padding: 12px 15px; color: #475569;">Atletas Vinculados</th>
            ${canEdit ? '<th style="padding: 12px 15px; color: #475569; text-align: center;">Ações</th>' : ''}
          </tr>
        </thead>
        <tbody id="teamsTbody">
          <tr><td colspan="5" style="text-align: center; padding: 20px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>

    <dialog id="modalTeam" style="width: 100%; max-width: 650px; border: none; border-radius: 12px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
      <form id="formTeam">
        <h3 id="modalTitle" style="margin-top: 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Nova Equipe / Par</h3>
        
        <div style="display: flex; gap: 15px; margin-top: 15px;">
            <div style="flex: 1;">
              <label style="display: block; font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 5px;">Categoria *</label>
              <select id="fCategoria" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight:bold; color:#0f172a;" required>
                  <option value="">Selecione...</option>
                  <option value="TEAM_BC1_BC2">Equipe BC1/BC2</option>
                  <option value="PAIR_BC3">Pares BC3</option>
                  <option value="PAIR_BC4">Pares BC4</option>
              </select>
            </div>
            <div style="flex: 1;">
              <label style="display: block; font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 5px;">Tipo de Representação *</label>
              <select id="fRepType" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px;" required>
                 <option value="">Selecione...</option>
                 <option value="CLUBE">Por Clube</option>
                 <option value="REGIAO">Por Região</option>
                 <option value="ESTADO">Por Estado</option>
                 <option value="OUTRO">Outro (Livre)</option>
              </select>
            </div>
            <div style="flex: 1; display: none;" id="boxRepValue">
              <label id="lblRepValue" style="display: block; font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 5px;">Selecione *</label>
              <select id="fRepValue" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px;"></select>
            </div>
        </div>

        <div style="display: flex; gap: 15px; margin-top: 15px;">
            <div style="flex: 2;">
              <label style="display: block; font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 5px;">Nome Completo da Equipe/Par *</label>
              <input type="text" id="fNome" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight:bold;" required readonly>
            </div>
            <div style="flex: 1;">
              <label style="display: block; font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 5px;">Sigla (Até 4 Letras) *</label>
              <input type="text" id="fSigla" maxlength="4" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; text-transform: uppercase; font-weight:bold;" required readonly>
            </div>
        </div>

        <div style="margin-top: 25px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
            <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 14px; color: #0f172a;">👥 Seleção de Atletas</h4>
            <p id="ruleHint" style="font-size: 11px; color: #dc2626; font-weight: bold; margin-top: 0;">Selecione a categoria e o tipo de representação para filtrar os atletas.</p>
            
            <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: white;" id="athletesList">
                <div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 12px;">Preencha os filtros acima para listar os atletas.</div>
            </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button type="button" id="btnCancelModal" style="background: transparent; border: 1px solid #94a3b8; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569;">Cancelar</button>
          <button type="submit" id="btnSaveTeam" style="background: #16a34a; color: white; border: none; padding: 10px 25px; border-radius: 6px; cursor: pointer; font-weight: bold;">💾 Salvar</button>
        </div>
      </form>
    </dialog>
  `;

  const tbody = container.querySelector('#teamsTbody');
  const modal = container.querySelector('#modalTeam');
  const form = container.querySelector('#formTeam');
  
  const catSelect = container.querySelector('#fCategoria');
  const repTypeSel = container.querySelector('#fRepType');
  const repValSel = container.querySelector('#fRepValue');
  const boxRepVal = container.querySelector('#boxRepValue');
  const lblRepVal = container.querySelector('#lblRepValue');
  
  const inNome = container.querySelector('#fNome');
  const inSigla = container.querySelector('#fSigla');
  
  const athletesList = container.querySelector('#athletesList');
  const ruleHint = container.querySelector('#ruleHint');

  async function load() {
    try {
      const [teamsSnap, athSnap] = await Promise.all([
        getDocs(collection(db, "equipes")),
        getDocs(collection(db, "atletas"))
      ]);

      state.teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const clubsMap = {};
      state.clubs.forEach(c => clubsMap[c.id] = c);

      state.athletes = athSnap.docs.map(d => {
        const a = d.data();
        const gen = String(a.genero || a.sexo || '').toUpperCase();
        
        // Verifica todos os clubes aos quais ele pertence
        const cIds = a.clubes_ids || (a.clube_id ? [a.clube_id] : []);
        let nomes = [];
        let siglas = [];
        let ufs = [];
        let regioes = [];
        
        cIds.forEach(cid => {
            const c = clubsMap[cid];
            if (c) {
                nomes.push(c.nome);
                if (c.sigla) siglas.push(c.sigla);
                if (c.estado || c.uf) ufs.push(c.estado || c.uf);
                if (c.regiao) regioes.push(c.regiao);
            }
        });

        return {
            id: d.id,
            ...a,
            clubes_ids: cIds, // Importante para o filtro
            clube_nome: nomes.length > 0 ? nomes.join(' / ') : 'Sem Clube',
            clube_sigla: siglas.length > 0 ? siglas.join(' / ') : '',
            estado: ufs.length > 0 ? [...new Set(ufs)].join(' / ') : '',
            regiao: regioes.length > 0 ? [...new Set(regioes)].join(' / ') : '',
            isMale: gen === 'M' || gen.startsWith('MAS'),
            isFemale: gen === 'F' || gen.startsWith('FEM')
        };
      });

      renderTable();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Erro ao carregar dados.</td></tr>`;
    }
  }

  function renderTable() {
    if (state.teams.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #64748b;">Nenhuma equipe ou par cadastrado.</td></tr>`;
      return;
    }

    const catMap = { 'TEAM_BC1_BC2': 'Equipe BC1/BC2', 'PAIR_BC3': 'Par BC3', 'PAIR_BC4': 'Par BC4' };
    const repMap = { 'CLUBE': 'Clube', 'REGIAO': 'Região', 'ESTADO': 'Estado', 'OUTRO': 'Outro' };

    tbody.innerHTML = state.teams.map(t => {
      const athNames = (t.athletes || []).map(id => {
          const a = state.athletes.find(x => String(x.id) === String(id));
          return a ? `• ${escapeHTML(a.nome)} <span style="font-size:10px; color:#94a3b8;">(${escapeHTML(a.classe_code)})</span>` : '• Desconhecido/Excluído';
      }).join('<br>');

      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 15px;">
            <div style="font-weight: bold; color: #0f172a;">${escapeHTML(t.name || t.nome)}</div>
            <div style="font-size: 11px; font-weight: bold; color: #64748b; margin-top:2px;">SIGLA: ${escapeHTML(t.club_sigla || t.sigla)}</div>
          </td>
          <td style="padding: 12px 15px;"><span style="background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${catMap[t.category] || t.category}</span></td>
          <td style="padding: 12px 15px; font-size: 12px;">
            <span style="font-weight:bold; color:#475569;">${repMap[t.rep_type] || 'Outro'}</span><br>
            <span style="color:#64748b;">${escapeHTML(t.rep_value_name || t.rep_value || '-')}</span>
          </td>
          <td style="padding: 12px 15px; font-size: 12px; color: #1e293b; line-height: 1.4;">${athNames}</td>
          
          ${canEdit ? `
          <td style="padding: 12px 15px; text-align: center; white-space: nowrap;">
            <button class="btn-edit" data-id="${t.id}" style="background: transparent; border: 1px solid #cbd5e1; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px;">✏️</button>
            <button class="btn-delete" data-id="${t.id}" style="background: transparent; border: 1px solid #fca5a5; color: #ef4444; padding: 5px 10px; border-radius: 4px; cursor: pointer;">🗑️</button>
          </td>` : ''}
        </tr>
      `;
    }).join('');
  }

  function renderAthleteCheckboxes() {
      const cat = catSelect.value;
      const repType = repTypeSel.value;
      const repVal = repValSel.value;

      if (!cat || !repType) {
          athletesList.innerHTML = `<div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 12px;">Selecione a Categoria e o Tipo de Representação acima.</div>`;
          ruleHint.textContent = "Selecione a categoria e a representação primeiro para ver as regras.";
          return;
      }

      if (repType !== 'OUTRO' && !repVal) {
          athletesList.innerHTML = `<div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 12px;">Selecione a opção específica no campo ao lado.</div>`;
          return;
      }

      let visibleAthletes = state.athletes;
      
      // 🔥 VERIFICA DENTRO DO ARRAY DE CLUBES
      if (repType === 'CLUBE' && repVal) {
          visibleAthletes = visibleAthletes.filter(a => a.clubes_ids && a.clubes_ids.includes(String(repVal).trim()));
      } else if (repType === 'REGIAO' && repVal) {
          visibleAthletes = visibleAthletes.filter(a => String(a.regiao).includes(String(repVal).trim()));
      } else if (repType === 'ESTADO' && repVal) {
          visibleAthletes = visibleAthletes.filter(a => String(a.estado).includes(String(repVal).trim()));
      }

      visibleAthletes.sort((a,b) => a.nome.localeCompare(b.nome));

      if (visibleAthletes.length === 0) {
          athletesList.innerHTML = `<div style="padding: 15px; text-align: center; color: #ef4444; font-weight:bold; font-size: 13px;">Nenhum atleta encontrado para a representação selecionada.</div>`;
          return;
      }

      let ruleText = "";
      if (cat === 'TEAM_BC1_BC2') ruleText = "⚠️ MÁX 4 ATLETAS. Obrigatório 1 Homem, 1 Mulher e 1 atleta BC1.";
      else if (cat === 'PAIR_BC3') ruleText = "⚠️ MÁX 3 ATLETAS. Obrigatório 1 Homem e 1 Mulher. Apenas BC3.";
      else if (cat === 'PAIR_BC4') ruleText = "⚠️ MÁX 3 ATLETAS. Obrigatório 1 Homem e 1 Mulher. Apenas BC4.";
      ruleHint.textContent = ruleText;

      athletesList.innerHTML = visibleAthletes.map(a => {
          const codeNorm = String(a.classe_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          
          let isEligibleClass = false;
          if (cat === 'TEAM_BC1_BC2') isEligibleClass = codeNorm.includes('BC1') || codeNorm.includes('BC2');
          else if (cat === 'PAIR_BC3') isEligibleClass = codeNorm.includes('BC3');
          else if (cat === 'PAIR_BC4') isEligibleClass = codeNorm.includes('BC4');

          const isChecked = state.selectedAthletes.has(a.id) ? 'checked' : '';
          const genIcon = a.isMale ? '♂' : (a.isFemale ? '♀' : '⚥');
          const genColor = a.isMale ? '#3b82f6' : (a.isFemale ? '#ec4899' : '#64748b');
          
          if (!isEligibleClass) {
              return `
              <label style="display: flex; align-items: center; gap: 10px; padding: 10px 15px; border-bottom: 1px solid #f1f5f9; cursor: not-allowed; opacity: 0.5; background: #f8fafc;" title="Atleta não pertence à classe exigida pela Categoria.">
                  <input type="checkbox" disabled style="transform: scale(1.2);">
                  <div style="flex: 1; display: flex; flex-direction: column;">
                      <span style="font-size: 13px; font-weight: bold; color: #64748b; text-decoration: line-through;">${escapeHTML(a.nome)}</span>
                      <span style="font-size: 11px; color: #94a3b8;">${escapeHTML(a.clube_sigla || 'Sem Clube')} ${a.regiao ? `(${escapeHTML(a.regiao)})` : ''}</span>
                  </div>
                  <span style="background: #e2e8f0; color: #94a3b8; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${escapeHTML(a.classe_code)} (Incompatível)</span>
                  <span style="color: ${genColor}; font-weight: bold; font-size: 14px; width: 20px; text-align: center;">${genIcon}</span>
              </label>
              `;
          }

          return `
            <label style="display: flex; align-items: center; gap: 10px; padding: 10px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s;">
                <input type="checkbox" value="${a.id}" class="ath-check" ${isChecked} style="transform: scale(1.2);">
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <span style="font-size: 13px; font-weight: bold; color: #1e293b;">${escapeHTML(a.nome)}</span>
                    <span style="font-size: 11px; color: #64748b;">${escapeHTML(a.clube_sigla || 'Sem Clube')} ${a.regiao ? `(${escapeHTML(a.regiao)})` : ''}</span>
                </div>
                <span style="background: #dbeafe; color: #1d4ed8; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${escapeHTML(a.classe_code)}</span>
                <span style="color: ${genColor}; font-weight: bold; font-size: 14px; width: 20px; text-align: center;">${genIcon}</span>
            </label>
          `;
      }).join('');

      athletesList.querySelectorAll('.ath-check').forEach(chk => {
          chk.addEventListener('change', (e) => {
              if (e.target.checked) state.selectedAthletes.add(e.target.value);
              else state.selectedAthletes.delete(e.target.value);
          });
      });
  }

  // EVENTOS DE REPRESENTAÇÃO
  repTypeSel.addEventListener('change', (e) => {
      const val = e.target.value;
      
      repValSel.innerHTML = '<option value="">Selecione...</option>';
      inNome.readOnly = true; inNome.style.background = '#f1f5f9';
      inSigla.readOnly = true; inSigla.style.background = '#f1f5f9';
      inNome.value = ''; inSigla.value = '';
      
      state.selectedAthletes.clear();

      if (val === 'CLUBE') {
          boxRepVal.style.display = 'block';
          lblRepVal.textContent = 'Selecione o Clube *';
          repValSel.required = true;
          const clubesEquipe = [...state.clubs].sort((a,b)=> {
              const labelA = (a.sigla || a.nome || '').toUpperCase();
              const labelB = (b.sigla || b.nome || '').toUpperCase();
              return labelA.localeCompare(labelB);
          });
          clubesEquipe.forEach(c => repValSel.innerHTML += `<option value="${c.id}">${c.sigla ? escHtml(c.sigla) + ' - ' : ''}${escHtml(c.nome)}</option>`);
      } else if (val === 'REGIAO') {
          boxRepVal.style.display = 'block';
          lblRepVal.textContent = 'Selecione a Região *';
          repValSel.required = true;
          state.regions.forEach(r => repValSel.innerHTML += `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`);
      } else if (val === 'ESTADO') {
          boxRepVal.style.display = 'block';
          lblRepVal.textContent = 'Selecione o Estado *';
          repValSel.required = true;
          state.estados.forEach(est => repValSel.innerHTML += `<option value="${escapeHTML(est)}">${escapeHTML(est)}</option>`);
      } else if (val === 'OUTRO') {
          boxRepVal.style.display = 'none';
          repValSel.required = false;
          inNome.readOnly = false; inNome.style.background = '#fff';
          inSigla.readOnly = false; inSigla.style.background = '#fff';
      } else {
          boxRepVal.style.display = 'none';
          repValSel.required = false;
      }
      
      renderAthleteCheckboxes();
  });

  repValSel.addEventListener('change', (e) => {
      const val = e.target.value;
      const type = repTypeSel.value;
      
      if (type === 'CLUBE') {
          const c = state.clubs.find(x => String(x.id) === String(val));
          if (c) {
              inNome.value = c.nome;
              inSigla.value = c.sigla ? c.sigla.substring(0, 4) : c.nome.substring(0, 4).toUpperCase();
          }
      } else if (type === 'REGIAO' || type === 'ESTADO') {
          inNome.value = `Seleção ${val}`;
          inSigla.value = val.substring(0, 4).toUpperCase();
      }
      
      state.selectedAthletes.clear();
      renderAthleteCheckboxes();
  });

  catSelect.addEventListener('change', () => {
      state.selectedAthletes.clear();
      renderAthleteCheckboxes();
  });

  function validateWorldBocciaRules(cat, selectedIds) {
      if (selectedIds.length === 0) return "Você precisa selecionar pelo menos 1 atleta.";
      
      const selected = selectedIds
        .map(id => state.athletes.find(a => String(a.id) === String(id)))
        .filter(a => a !== undefined && a !== null);
      
      if (selected.length === 0) return "Nenhum atleta válido selecionado.";

      const hasMale = selected.some(a => a.isMale);
      const hasFemale = selected.some(a => a.isFemale);
      
      if (!hasMale || !hasFemale) return "A equipe/par obrigatoriamente deve ser MISTA (ter atletas do gênero masculino e feminino).";

      if (cat === 'TEAM_BC1_BC2') {
          if (selected.length > 4) return "Equipes BC1/BC2 podem ter no máximo 4 atletas (3 titulares + 1 reserva).";
          
          const hasBC1 = selected.some(a => {
              const code = String(a.classe_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              return code.includes('BC1');
          });
          
          if (!hasBC1) return "Equipes BC1/BC2 exigem obrigatoriamente pelo menos UM atleta da classe BC1 selecionado.";
      } else {
          if (selected.length > 3) return "Pares podem ter no máximo 3 atletas (2 titulares + 1 reserva).";
      }
      return null;
  }

  if (canEdit) {
      container.querySelector('#btnNewTeam').onclick = () => {
          state.editingId = null;
          state.selectedAthletes.clear();
          form.reset();
          
          boxRepVal.style.display = 'none';
          inNome.readOnly = true; inNome.style.background = '#f1f5f9';
          inSigla.readOnly = true; inSigla.style.background = '#f1f5f9';
          
          container.querySelector('#modalTitle').textContent = 'Nova Equipe / Par';
          renderAthleteCheckboxes();
          modal.showModal();
      };
      
      container.querySelector('#btnCancelModal').onclick = () => modal.close();

      form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const name = inNome.value.trim();
          const sigla = inSigla.value.trim().toUpperCase();
          const cat = catSelect.value;
          const rType = repTypeSel.value;
          const rVal = repValSel.value;
          
          const athArray = Array.from(state.selectedAthletes);

          const errorMsg = validateWorldBocciaRules(cat, athArray);
          if (errorMsg) {
              toastSafe(errorMsg, 'error');
              return;
          }

          let repValueName = '';
          if (rType === 'CLUBE') {
              const c = state.clubs.find(x => String(x.id) === String(rVal));
              if (c) repValueName = c.nome;
          } else if (rType === 'REGIAO' || rType === 'ESTADO') {
              repValueName = rVal;
          }

          const payload = {
              name: name,
              nome: name,
              category: cat,
              sigla: sigla,
              club_sigla: sigla, 
              rep_type: rType,
              rep_value: rVal,
              rep_value_name: repValueName,
              athletes: athArray
          };

          const btn = container.querySelector('#btnSaveTeam');
          btn.disabled = true;
          btn.textContent = 'Salvando...';

          try {
              const docId = state.editingId || `TEAM_${Date.now()}`;
              await setDoc(doc(db, "equipes", docId), payload, { merge: true });
              toastSafe('Salvo com sucesso!', 'success');
              modal.close();
              await load();
          } catch (err) {
              toastSafe('Erro ao salvar.', 'error');
          } finally {
              btn.disabled = false;
              btn.textContent = '💾 Salvar';
          }
      });

      tbody.addEventListener('click', async (e) => {
          const btnEdit = e.target.closest('.btn-edit');
          const btnDel = e.target.closest('.btn-delete');

          if (btnEdit) {
              const t = state.teams.find(x => x.id === btnEdit.dataset.id);
              if (t) {
                  state.editingId = t.id;
                  state.selectedAthletes = new Set(t.athletes || []);
                  
                  catSelect.value = t.category || '';
                  repTypeSel.value = t.rep_type || 'OUTRO';
                  
                  repTypeSel.dispatchEvent(new Event('change'));
                  
                  setTimeout(() => {
                      if (t.rep_type !== 'OUTRO') {
                          repValSel.value = t.rep_value || '';
                          repValSel.dispatchEvent(new Event('change'));
                      }
                      
                      inNome.value = t.name || t.nome || '';
                      inSigla.value = t.sigla || t.club_sigla || '';
                      
                      state.selectedAthletes = new Set(t.athletes || []);
                      renderAthleteCheckboxes();
                  }, 100);

                  container.querySelector('#modalTitle').textContent = 'Editar Equipe / Par';
                  modal.showModal();
              }
          }

          if (btnDel) {
              if (confirm("Tem certeza que deseja excluir esta Equipe/Par? O sorteio de competições antigas pode ser afetado.")) {
                  await deleteDoc(doc(db, "equipes", btnDel.dataset.id));
                  toastSafe("Excluído com sucesso.", "success");
                  await load();
              }
          }
      });
  }

  await load();
}


// ============================================================================
// MAIN RENDER (ABAS DE NAVEGAÇÃO E REPASSE DE ESTADOS)
// ============================================================================
export async function renderAtletas(root) {
  const rootState = { classes: [], clubes: [], regions: [], estados: [], competitions: [] };
  
  try {
      // 🔥 REGRA DE OURO: Filtra Arquivados e Ordena por Data
      const [snapCls, snapClb, snapCmp] = await Promise.all([
          getDocs(collection(db, "classes")),
          getDocs(collection(db, "clubes")),
          getDocs(collection(db, "competitions"))
      ]);
      
      rootState.classes = snapCls.docs.map(d => ({ id: d.id, ...d.data() }));
      rootState.clubes = snapClb.docs.map(d => ({ id: d.id, ...d.data() }));
      
      let compsRaw = snapCmp.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // 1. Remove os Arquivados
      compsRaw = compsRaw.filter(c => 
          c.is_archived !== true && String(c.is_archived) !== "true" && 
          c.historica_csv !== true && String(c.historica_csv) !== "true"
      );
      
      // 2. Ordena por Data Recente no topo
      compsRaw.sort((a, b) => {
          const dateA = new Date(a.data_inicio || a.created_at || 0).getTime();
          const dateB = new Date(b.data_inicio || b.created_at || 0).getTime();
          return dateB - dateA;
      });

      rootState.competitions = compsRaw;
      
      const setReg = new Set();
      const setEst = new Set();
      for (const c of rootState.clubes) { 
          const r = String(c.regiao || '').trim(); if (r) setReg.add(r); 
          const e = String(c.estado || c.uf || '').trim(); if (e) setEst.add(e);
      }
      rootState.regions = Array.from(setReg).sort();
      rootState.estados = Array.from(setEst).sort();
  } catch (e) {
      console.warn("Aviso: Falha ao carregar dicionários globais.", e);
  }

  root.innerHTML = `
    <section data-scope="atletas" style="padding:16px;">
      <h1 id="atl-title" tabindex="-1" style="margin-bottom: 20px; color:#0f172a;">Cadastro de Atletas e Equipes</h1>
      
      <div style="display:flex; gap:10px; border-bottom:2px solid #e2e8f0; margin-bottom:20px;">
        <button id="tab-individuais" style="background:transparent; border:none; padding:10px 20px; font-size:16px; font-weight:bold; cursor:pointer; border-bottom:3px solid #3b82f6; color:#0f172a; transition:0.2s;">👤 Atletas Individuais</button>
        <button id="tab-equipes" style="background:transparent; border:none; padding:10px 20px; font-size:16px; font-weight:bold; cursor:pointer; border-bottom:3px solid transparent; color:#64748b; transition:0.2s;">👥 Pares e Equipes</button>
      </div>

      <div id="tab-content"></div>
    </section>
  `;

  const btnTabInd = root.querySelector('#tab-individuais');
  const btnTabEqp = root.querySelector('#tab-equipes');
  const tabContent = root.querySelector('#tab-content');

  const switchTab = async (tabName) => {
      tabContent.innerHTML = `<div style="padding: 40px; text-align: center; color: #64748b; font-weight:bold;">Carregando Interface...</div>`;
      
      if (tabName === 'individuais') {
          btnTabInd.style.borderBottomColor = '#3b82f6'; btnTabInd.style.color = '#0f172a';
          btnTabEqp.style.borderBottomColor = 'transparent'; btnTabEqp.style.color = '#64748b';
          await renderAbaAtletas(tabContent, rootState);
      } else {
          btnTabEqp.style.borderBottomColor = '#3b82f6'; btnTabEqp.style.color = '#0f172a';
          btnTabInd.style.borderBottomColor = 'transparent'; btnTabInd.style.color = '#64748b';
          await renderAbaEquipes(tabContent, rootState);
      }
  };

  btnTabInd.addEventListener('click', () => switchTab('individuais'));
  btnTabEqp.addEventListener('click', () => switchTab('equipes'));

  await switchTab('individuais');
}

export default renderAtletas;