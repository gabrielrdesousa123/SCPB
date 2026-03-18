// client/js/pages/atletas-bcms.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

(function () {
  const DEBUG = false;
  const log = (...a) => DEBUG && console.log('[bcms]', ...a);

  function isAtletasRoute() {
    const h = String(location.hash || '');
    return h === '#/atletas' || h.startsWith('#/atletas/') || h.startsWith('#/atletas?') || h.startsWith('#/atletas');
  }

  window.addEventListener('hashchange', onRoute, { passive: true });
  window.addEventListener('load', onRoute, { passive: true });

  let mo = null;

  function onRoute() {
    if (!isAtletasRoute()) {
      stopObserver();
      removeFloatingButton();
      return;
    }
    if (attachNow()) return;
    ensureFloatingButton();
    startObserver();
  }

  function findActionsEl() {
    return (
      document.querySelector('.toolbar #toolbar-actions') ||
      document.querySelector('#toolbar-actions') ||
      document.querySelector('.toolbar') ||
      document.querySelector('[data-toolbar]') ||
      document.querySelector('[data-actions]') ||
      document.querySelector('.page-toolbar') ||
      document.querySelector('.page-actions') ||
      document.querySelector('.topbar .actions') ||
      document.querySelector('header .actions') ||
      null
    );
  }

  function attachNow() {
    if (!isAtletasRoute()) return false;
    const actions = findActionsEl();
    if (!actions) return false;

    const existing = document.querySelector('#btn-export-bcms');
    if (existing) {
      if (existing.dataset.mode === 'floating') {
        try {
          actions.appendChild(existing);
          existing.dataset.mode = 'toolbar';
          cleanFloatingStyles(existing);
        } catch {}
      }
      return true;
    }

    const btn = makeButton('toolbar');
    actions.appendChild(btn);
    return true;
  }

  function cleanFloatingStyles(btn) {
    btn.style.position = '';
    btn.style.right = '';
    btn.style.bottom = '';
    btn.style.zIndex = '';
    btn.style.borderRadius = '';
    btn.style.padding = '';
    btn.style.boxShadow = '';
    btn.style.border = '';
    btn.style.background = '';
    btn.style.cursor = '';
  }

  function makeButton(mode) {
    const btn = document.createElement('button');
    btn.id = 'btn-export-bcms';
    btn.className = 'btn';
    btn.textContent = 'Exportar BCMS';
    btn.style.marginLeft = '8px';
    btn.dataset.mode = mode;

    btn.addEventListener('click', async () => {
      try {
        await openModal();
      } catch (e) {
        console.error('[bcms] falha ao abrir modal:', e);
        alert('Falha ao abrir modal: ' + (e?.message || e));
      }
    });

    if (mode === 'floating') {
      Object.assign(btn.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: 9999,
        padding: '10px 12px',
        borderRadius: '12px',
        border: '1px solid rgba(0,0,0,.15)',
        background: 'white',
        boxShadow: '0 6px 20px rgba(0,0,0,.18)',
        cursor: 'pointer'
      });
    }

    return btn;
  }

  function ensureFloatingButton() {
    if (!isAtletasRoute()) return;
    const existing = document.querySelector('#btn-export-bcms');
    if (existing) return;

    const btn = makeButton('floating');
    document.body.appendChild(btn);
  }

  function removeFloatingButton() {
    const btn = document.querySelector('#btn-export-bcms');
    if (btn && btn.dataset.mode === 'floating') btn.remove();
  }

  function startObserver() {
    if (mo) return;
    mo = new MutationObserver(() => {
      if (!isAtletasRoute()) return;
      const ok = attachNow();
      if (ok) stopObserver();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (!mo) return;
    try { mo.disconnect(); } catch {}
    mo = null;
  }

  /* ===========================
   * Modal completo + ordenação
   * =========================== */
  async function openModal() {
    if (document.querySelector('#bcms-modal-root')) return;

    const modal = document.createElement('div');
    modal.id = 'bcms-modal-root';
    Object.assign(modal.style, {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.35)',
      display: 'grid',
      placeItems: 'center',
      zIndex: 10000
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: 'min(1040px, 96vw)',
      maxHeight: '88vh',
      overflow: 'auto',
      background: 'var(--card, #fff)',
      color: 'inherit',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid var(--card-border, #d9d9d9)',
      boxShadow: '0 6px 22px rgba(0,0,0,.18)'
    });

    card.innerHTML = `
      <style>
        .bcmsRow{ display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin:8px 0; }
        .bcmsRow label{ font-size:12px; opacity:.9; }
        .bcmsRow input, .bcmsRow select{ margin-top:4px; padding:6px 8px; border:1px solid #ddd; border-radius:8px; }
        .bcmsBtn{ padding:7px 10px; border-radius:10px; border:1px solid rgba(0,0,0,.12); background:#fff; cursor:pointer; }
        .bcmsBtn.good{ background:#1e8e3e; color:#fff; border-color:transparent; }
        .bcmsBtn.ghost{ background:transparent; }
        .bcmsTable{ width:100%; border-collapse:collapse; font-size:12px; }
        .bcmsTable th, .bcmsTable td{ padding:9px 8px; border-bottom:1px solid rgba(0,0,0,.06); }
        .bcmsTable thead th{ position:sticky; top:0; background:var(--card,#f7f9ff); z-index:1; }
        .bcmsThSort{ cursor:pointer; user-select:none; }
        .bcmsMuted{ font-size:12px; opacity:.75; }
        .bcmsPill{ display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid rgba(0,0,0,.12); }
      </style>

      <div style="display:flex; align-items:center; gap:10px; justify-content:space-between;">
        <h3 style="margin:0;">Exportação BCMS • Atletas</h3>
        <button class="bcmsBtn ghost" id="bcms-close">Fechar ✕</button>
      </div>

      <div class="bcmsRow">
        <label>Classe
          <select id="bcms-class" style="min-width:160px"></select>
        </label>

        <div style="width:1px; height:28px; background:rgba(0,0,0,.12); margin:0 4px;"></div>

        <label>Presets
          <select id="bcms-preset" style="min-width:220px"></select>
        </label>
        <input id="bcms-preset-name" type="text" placeholder="Nome do preset" style="min-width:220px" />
        <button class="bcmsBtn" id="bcms-preset-save">Salvar</button>
        <button class="bcmsBtn" id="bcms-preset-del">Apagar</button>
      </div>

      <div class="bcmsRow">
        <label>Critério 1
          <select id="bcms-crit1" style="min-width:260px"></select>
        </label>
        <label>Critério 2
          <select id="bcms-crit2" style="min-width:260px"></select>
        </label>
        <label>Critério 3
          <select id="bcms-crit3" style="min-width:260px"></select>
        </label>

        <button class="bcmsBtn" id="bcms-load">Carregar atletas</button>
        <div style="flex:1"></div>
        <button class="bcmsBtn good" id="bcms-export">Exportar CSV</button>
      </div>

      <div class="bcmsRow" style="align-items:center;">
        <div class="bcmsMuted">
          Ordenação: <span id="bcms-sort-label" class="bcmsPill">Nome (A–Z)</span>
        </div>
        <div class="bcmsMuted" id="bcms-count"></div>
      </div>

      <div style="border:1px solid rgba(0,0,0,.10); border-radius:12px; overflow:auto;">
        <table class="bcmsTable">
          <thead>
            <tr>
              <th style="width:44px;"><input type="checkbox" id="sel-all"></th>
              <th class="bcmsThSort" data-sort="nome">Nome</th>
              <th class="bcmsThSort" data-sort="genero">Gênero</th>
              <th class="bcmsThSort" data-sort="classe">Classe</th>
              <th class="bcmsThSort" data-sort="clube">Clube</th>
              <th class="bcmsThSort" data-sort="regiao">Região</th>
              <th class="bcmsThSort" data-sort="rank">Rank</th>
              <th class="bcmsThSort" data-sort="id">ID</th>
            </tr>
          </thead>
          <tbody id="bcms-tbody"></tbody>
        </table>
      </div>

      <p class="bcmsMuted" style="margin-top:10px;">
        Dica: clique no nome da coluna para alternar ASC/DESC.
      </p>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    card.querySelector('#bcms-close').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    const modalState = {
      athletes: [],
      sortKey: 'nome',
      sortDir: 'asc', 
    };

    card.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (!key) return;
        if (modalState.sortKey === key) modalState.sortDir = modalState.sortDir === 'asc' ? 'desc' : 'asc';
        else { modalState.sortKey = key; modalState.sortDir = 'asc'; }
        renderAthleteTable();
      });
    });

    card.querySelector('#sel-all').onchange = (e) => {
      card.querySelectorAll('#bcms-tbody input.sel').forEach(ch => ch.checked = e.target.checked);
    };

    const [classes, comps, presetsData] = await Promise.all([apiClasses(), apiCompetitions(), apiPresets()]);

    fillSelect(card.querySelector('#bcms-class'),
      [{ value: '', label: '— Selecione —' }, ...classes.map(c => ({ value: c.code || c.codigo, label: `${c.code || c.codigo} — ${c.name || c.nome}` }))]);

    const compOpts = [{ value: '', label: '(nenhum)' }, ...comps.map(c => ({ value: c.id, label: c.nome }))];
    fillSelect(card.querySelector('#bcms-crit1'), compOpts);
    fillSelect(card.querySelector('#bcms-crit2'), compOpts);
    fillSelect(card.querySelector('#bcms-crit3'), compOpts);

    const presetSel = card.querySelector('#bcms-preset');
    const presetName = card.querySelector('#bcms-preset-name');
    let currentPresetId = null;

    function renderPresetSelect(items) {
      const opts = [{ value: '', label: '— (nenhum) —' }, ...items.map(p => ({ value: String(p.id), label: p.name }))];
      fillSelect(presetSel, opts);
    }
    renderPresetSelect(presetsData.items || []);

    presetSel.onchange = () => {
      const id = presetSel.value;
      currentPresetId = id || null;
      const selected = (presetsData.items || []).find(p => String(p.id) === id);
      if (selected) {
        presetName.value = selected.name;
        setSelect(card.querySelector('#bcms-crit1'), selected.crit1);
        setSelect(card.querySelector('#bcms-crit2'), selected.crit2);
        setSelect(card.querySelector('#bcms-crit3'), selected.crit3);
      } else {
        presetName.value = '';
        setSelect(card.querySelector('#bcms-crit1'), '');
        setSelect(card.querySelector('#bcms-crit2'), '');
        setSelect(card.querySelector('#bcms-crit3'), '');
      }
    };

    card.querySelector('#bcms-preset-save').onclick = async () => {
      const body = {
        name: presetName.value.trim(),
        crit1: valNum(card.querySelector('#bcms-crit1').value),
        crit2: valNum(card.querySelector('#bcms-crit2').value),
        crit3: valNum(card.querySelector('#bcms-crit3').value),
      };
      if (!body.name) return alert('Dê um nome para o preset.');

      let saved;
      if (currentPresetId) saved = await apiPresetUpdate(currentPresetId, body);
      else saved = await apiPresetCreate(body);

      const fresh = await apiPresets();
      presetsData.items = fresh.items || [];
      renderPresetSelect(presetsData.items);
      presetSel.value = String(saved.id);
      currentPresetId = String(saved.id);
      alert('Preset salvo.');
    };

    card.querySelector('#bcms-preset-del').onclick = async () => {
      if (!currentPresetId) return alert('Selecione um preset para apagar.');
      if (!confirm('Apagar este preset?')) return;

      await apiPresetDelete(currentPresetId);
      const fresh = await apiPresets();
      presetsData.items = fresh.items || [];
      renderPresetSelect(presetsData.items);
      currentPresetId = null;
      presetSel.value = '';
      presetName.value = '';
      setSelect(card.querySelector('#bcms-crit1'), '');
      setSelect(card.querySelector('#bcms-crit2'), '');
      setSelect(card.querySelector('#bcms-crit3'), '');
      alert('Preset apagado.');
    };

    card.querySelector('#bcms-load').onclick = async () => {
      const cls = card.querySelector('#bcms-class').value;
      if (!/^BC[1-4][MF]?$/.test(cls)) return alert('Escolha uma classe (ex.: BC1F, BC2M, BC3).');

      const tbody = card.querySelector('#bcms-tbody');
      tbody.innerHTML = `<tr><td colspan="8" style="padding:12px;">Carregando…</td></tr>`;

      const atletas = await apiAtletasPorClasse(cls);
      modalState.athletes = atletas || [];
      modalState.sortKey = 'nome';
      modalState.sortDir = 'asc';
      renderAthleteTable();
    };

    // Função de exportação de CSV local
    card.querySelector('#bcms-export').onclick = () => {
      const cls = card.querySelector('#bcms-class').value;
      if (!/^BC[1-4][MF]?$/.test(cls)) return alert('Escolha uma classe.');

      const ids = Array.from(card.querySelectorAll('#bcms-tbody input.sel'))
        .filter(ch => ch.checked)
        .map(ch => ch.getAttribute('data-id'));

      if(ids.length === 0) return alert('Selecione pelo menos um atleta.');

      const selectedAthletes = modalState.athletes.filter(a => ids.includes(a.id));

      // Header do CSV
      let csvContent = "ID,NOME,CLASSE,GENERO,CLUBE,REGIAO,RANK\n";
      
      selectedAthletes.forEach(a => {
        csvContent += `"${a.id}","${a.nome}","${a.classe_code}","${a.genero}","${a.clube_nome || ''}","${a.regiao || ''}","${a.rank || ''}"\n`;
      });

      const blob = new Blob(["\uFEFF"+csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `BCMS_Export_${cls}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    function renderAthleteTable() {
      const tbody = card.querySelector('#bcms-tbody');
      const label = card.querySelector('#bcms-sort-label');
      const count = card.querySelector('#bcms-count');

      const list = sortedAthletes(modalState.athletes, modalState.sortKey, modalState.sortDir);
      label.textContent = sortLabel(modalState.sortKey, modalState.sortDir);
      count.textContent = `${list.length} atleta(s)`;

      tbody.innerHTML = '';
      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:12px; opacity:.8;">Nenhum atleta carregado.</td></tr>`;
        return;
      }

      for (const [i, a] of list.entries()) {
        const tr = document.createElement('tr');
        if (i % 2) tr.style.background = 'rgba(0,0,0,.02)';

        const genero = getField(a, 'genero') || '';
        const classe = getField(a, 'classe') || '';
        const clube = getField(a, 'clube') || '';
        const regiao = getField(a, 'regiao') || '';
        const rank = getField(a, 'rank');
        const rankTxt = (rank === 0 || rank) ? String(rank) : '';

        tr.innerHTML = `
          <td><input type="checkbox" class="sel" data-id="${esc(a.id)}" checked></td>
          <td>${esc(a.nome || '')}</td>
          <td>${esc(genero)}</td>
          <td>${esc(classe)}</td>
          <td>${esc(clube)}</td>
          <td>${esc(regiao)}</td>
          <td>${esc(rankTxt)}</td>
          <td>${esc(a.id)}</td>
        `;
        tbody.appendChild(tr);
      }
    }
  }

  function sortLabel(key, dir) {
    const map = {
      nome: 'Nome',
      genero: 'Gênero',
      classe: 'Classe',
      clube: 'Clube',
      regiao: 'Região',
      rank: 'Rank',
      id: 'ID',
    };
    if (key === 'rank' || key === 'id') {
      return `${map[key]} ${dir === 'asc' ? '(menor→maior)' : '(maior→menor)'}`;
    }
    return `${map[key] || 'Nome'} ${dir === 'asc' ? '(A–Z)' : '(Z–A)'}`;
  }

  function normalize(s) {
    return String(s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function getField(a, key) {
    if (!a) return '';
    if (key === 'nome') return a.nome;
    if (key === 'genero') return a.genero ?? a.sexo ?? a.gender ?? a.gen;
    if (key === 'classe') return a.classe_code ?? a.classe ?? a.class_code ?? a.class;
    if (key === 'clube') return a.clube_sigla ?? a.clube_nome ?? a.clube ?? a.club;
    if (key === 'regiao') return a.regiao ?? a.região ?? a.uf ?? a.estado ?? a.region;
    if (key === 'rank') return a.rank ?? a.ranking ?? a.posicao ?? a.posição;
    if (key === 'id') return a.id;
    return a[key];
  }

  function sortedAthletes(list, key, dir) {
    const mul = dir === 'asc' ? 1 : -1;
    const arr = [...(list || [])];

    arr.sort((a, b) => {
      const va = getField(a, key);
      const vb = getField(b, key);

      if (key === 'rank' || key === 'id') {
        const na = toNum(va);
        const nb = toNum(vb);
        if (na == null && nb == null) return 0;
        if (na == null) return 1;
        if (nb == null) return -1;
        return (na - nb) * mul;
      }

      const sa = normalize(va);
      const sb = normalize(vb);
      if (sa < sb) return -1 * mul;
      if (sa > sb) return 1 * mul;
      return 0;
    });

    return arr;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function fillSelect(sel, options) {
    sel.innerHTML = options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  }
  function setSelect(sel, value) {
    sel.value = (value == null ? '' : String(value));
  }
  function valNum(v) {
    const s = String(v || '').trim();
    return s ? Number(s) : '';
  }

  /* ===== API FIREBASE ===== */
  
  async function apiClasses() {
    const snap = await getDocs(collection(db, "classes"));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  
  // 🔥 REGRA DE OURO: Filtra Arquivados e Ordena por Data Descendente
  async function apiCompetitions() {
    const snap = await getDocs(collection(db, "competitions"));
    let comps = snap.docs.map(doc => {
        const d = doc.data();
        return { 
            id: doc.id, 
            nome: d.name || d.nome, 
            is_archived: d.is_archived, 
            historica_csv: d.historica_csv, 
            data_inicio: d.data_inicio || d.start_date || '', 
            created_at: d.created_at || '' 
        };
    });

    // 1. Remove Arquivados e Testes da visão pública/seleção
    comps = comps.filter(c => 
        c.is_archived !== true && String(c.is_archived) !== "true" && 
        c.historica_csv !== true && String(c.historica_csv) !== "true"
    );

    // 2. Ordena pelas datas mais recentes no topo
    comps.sort((a, b) => {
        const dateA = new Date(a.data_inicio || a.created_at || 0).getTime();
        const dateB = new Date(b.data_inicio || b.created_at || 0).getTime();
        return dateB - dateA;
    });

    return comps;
  }
  
  async function apiAtletasPorClasse(cls) {
    const q = query(collection(db, "atletas"), where("classe_code", "==", cls));
    const snap = await getDocs(q);
    const clubesSnap = await getDocs(collection(db, "clubes"));
    const clubes = clubesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return snap.docs.map(doc => {
      const data = doc.data();
      const clube = clubes.find(c => c.id === data.clube_id) || {};
      return { id: doc.id, ...data, clube_nome: clube.nome, regiao: clube.regiao };
    });
  }

  async function apiPresets() {
    const snap = await getDocs(collection(db, "bcms_presets"));
    return { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
  }
  
  async function apiPresetCreate(body) {
    const docRef = await addDoc(collection(db, "bcms_presets"), body);
    return { id: docRef.id, ...body };
  }
  
  async function apiPresetUpdate(id, body) {
    await updateDoc(doc(db, "bcms_presets", id), body);
    return { id, ...body };
  }
  
  async function apiPresetDelete(id) {
    await deleteDoc(doc(db, "bcms_presets", id));
    return { success: true };
  }

  onRoute();
})();