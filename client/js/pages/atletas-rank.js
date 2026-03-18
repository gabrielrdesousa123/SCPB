// client/js/pages/atletas-rank.js

import { db } from '../firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

(function () {
  const api = {
    // 🔥 REGRA DE OURO: Filtra Arquivados e Ordena por Data Descendente
    competitions: async () => {
      try {
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
      } catch (e) {
        return [];
      }
    },
    ranks: async (competition_id, class_code) => {
      try {
        let q = query(collection(db, "results"), where("competition_id", "==", String(competition_id)));
        if (class_code) {
          q = query(q, where("class_code", "==", class_code));
        }
        const snap = await getDocs(q);
        return snap.docs.map(doc => doc.data());
      } catch (e) {
        return [];
      }
    },
    atletasAll: async () => {
      try {
        const snap = await getDocs(collection(db, "atletas"));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        return [];
      }
    },
  };

  const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, ' ').trim().toLowerCase();

  function onAtletasRoute(cb) {
    const runIfAtletas = () => {
      if (location.hash.includes('atletas')) cb();
    };
    window.addEventListener('hashchange', runIfAtletas);
    document.addEventListener('DOMContentLoaded', runIfAtletas);
    runIfAtletas();
  }

  function findTable(root) {
    return root.querySelector('#page table, main table, table');
  }

  function getClassFromHeader(root) {
    const el = root.querySelector('h1, h2, h3, .section-title');
    if (!el) return null;
    const m = el.textContent.match(/\bBC\d[MF]?\b/i);
    return m ? m[0].toUpperCase() : null;
  }

  function ensureToolbar(root, table) {
    let bar = root.querySelector('.filter-bar-rank');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'filter-bar-rank';
      bar.style.display = 'flex';
      bar.style.gap = '8px';
      bar.style.alignItems = 'center';
      bar.style.margin = '8px 0 12px';
      table.parentNode.insertBefore(bar, table);
    }
    return bar;
  }

  function ensureRankColumn(table) {
    const theadTr = table.querySelector('thead tr');
    if (!theadTr) return;
    const already = Array.from(theadTr.children)
      .some(th => th.textContent.trim().toLowerCase().startsWith('rank (comp.)'));
    if (!already) {
      const th = document.createElement('th');
      th.textContent = 'Rank (comp.)';
      th.style.whiteSpace = 'nowrap';
      theadTr.appendChild(th);
      table.querySelectorAll('tbody tr').forEach(tr => {
        const td = document.createElement('td');
        td.textContent = '—';
        tr.appendChild(td);
      });
    }
  }

  function detectAthleteIdOrName(tr) {
    let id = tr.getAttribute('data-id');
    if (id) return { id: id }; 

    const a = tr.querySelector('a[href*="id="], button[data-id], a[data-id]');
    if (a) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/id=([a-zA-Z0-9_-]+)/);
      if (m) return { id: m[1] };
      if (a.dataset.id) return { id: a.dataset.id };
    }

    const tds = tr.querySelectorAll('td');
    const nameCell = tds[0] || tds[1];
    if (nameCell) {
      const name = nameCell.textContent.trim();
      if (name) return { name };
    }
    return {};
  }

  async function buildNameToIdMap() {
    try {
      const atletas = await api.atletasAll();
      const map = new Map();
      atletas.forEach(a => map.set(norm(a.nome), a.id));
      return map;
    } catch {
      return new Map();
    }
  }

  function fillRankColumn(table, rankByAthleteId, nameToIdMap) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      const lastTd = tr.lastElementChild || tr.appendChild(document.createElement('td'));
      let id;
      const ident = detectAthleteIdOrName(tr);
      if (ident.id != null) {
        id = ident.id;
      } else if (ident.name) {
        id = nameToIdMap.get(norm(ident.name));
      }
      const rank = id != null ? rankByAthleteId.get(String(id)) : undefined;
      lastTd.textContent = (rank ?? '—');
    });
  }

  async function attach() {
    const app = document.getElementById('app') || document.body;
    const mo = new MutationObserver(() => tryEnhance());
    mo.observe(app, { childList: true, subtree: true });

    async function tryEnhance() {
      if (!location.hash.includes('atletas')) return;
      const table = findTable(app);
      if (!table || !table.querySelector('thead')) return;

      if (table.__rankEnhance) return;
      table.__rankEnhance = true;

      const bar = ensureToolbar(app, table);
      bar.innerHTML = '<strong>Competição:</strong> ';
      const sel = document.createElement('select');
      sel.style.padding = '6px 8px';
      sel.style.borderRadius = '8px';
      sel.style.border = '1px solid #dfe3eb';
      sel.innerHTML = '<option value="">Nenhuma</option>';
      bar.appendChild(sel);

      let comps = [];
      try { comps = await api.competitions(); } catch {}
      comps.forEach(c => {
        const o = document.createElement('option');
        o.value = String(c.id);
        o.textContent = c.nome || `Competição ${c.id}`;
        sel.appendChild(o);
      });

      ensureRankColumn(table);

      const nameToIdMap = await buildNameToIdMap();

      async function updateRanks() {
        const compId = sel.value ? sel.value : null;
        table.querySelectorAll('tbody tr').forEach(tr => {
          const lastTd = tr.lastElementChild || tr.appendChild(document.createElement('td'));
          lastTd.textContent = '—';
        });
        if (!compId) return;

        const classCode = getClassFromHeader(app); 
        let rows = [];
        try { rows = await api.ranks(compId, classCode); } catch { rows = []; }

        const rankMap = new Map();
        rows.forEach(r => { if (r.athlete_id) rankMap.set(String(r.athlete_id), r.rank ?? null); });

        fillRankColumn(table, rankMap, nameToIdMap);
      }

      sel.addEventListener('change', updateRanks);
      updateRanks();
    }

    tryEnhance();
  }

  onAtletasRoute(attach);
})();