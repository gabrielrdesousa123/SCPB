// client/js/pages/csv.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// 🔥 IMPORTAÇÃO DO CÉREBRO (Proteção extra de retaguarda)
import { canViewPage } from '../permissions.js';

export async function renderCsvHub(root) {
  // 🔥 DUPLA PROTEÇÃO: Se a pessoa não pode ver CSV, esvazia a tela e sai.
  if (!canViewPage('csv')) {
      root.innerHTML = `<div style="padding:40px; text-align:center;"><h3>Acesso Negado</h3><p>Seu usuário não possui privilégios para gerar Exportações CSV.</p></div>`;
      return;
  }

  root.innerHTML = `
    <h1 tabindex="-1">CSV • Importar / Exportar</h1>
    <div class="toolbar" role="tablist" aria-label="CSV Importar/Exportar" style="gap:8px; flex-wrap:wrap">
      <button class="btn" role="tab" aria-selected="true" id="tab-ref" aria-controls="panel-ref">Árbitros</button>
      <button class="btn" role="tab" aria-selected="false" id="tab-ath" aria-controls="panel-ath">Atletas e Equipes</button>
      <button class="btn" role="tab" aria-selected="false" id="tab-clu" aria-controls="panel-clu">Clubes</button>
      <div style="flex:1"></div>
      <a class="btn" href="#/csv">Voltar</a>
    </div>

    <section id="panel-ref" role="tabpanel" aria-labelledby="tab-ref"></section>
    <section id="panel-ath" role="tabpanel" aria-labelledby="tab-ath" hidden></section>
    <section id="panel-clu" role="tabpanel" aria-labelledby="tab-clu" hidden></section>
  `;

  const tabs = [
    { btn: root.querySelector('#tab-ref'), panel: root.querySelector('#panel-ref'), setup: setupReferees },
    { btn: root.querySelector('#tab-ath'), panel: root.querySelector('#panel-ath'), setup: setupAthletes },
    { btn: root.querySelector('#tab-clu'), panel: root.querySelector('#panel-clu'), setup: setupClubs },
  ];
  
  tabs.forEach((t, i) => {
    t.btn.addEventListener('click', () => {
      tabs.forEach((x, j) => {
        const sel = i === j;
        x.btn.setAttribute('aria-selected', sel ? 'true' : 'false');
        x.panel.hidden = !sel;
      });
      t.setup(t.panel);
    }, { once: true });
  });

  // Abre em Árbitros por padrão
  await setupReferees(root.querySelector('#panel-ref'));
}

/* ==================== Processador CSV Local ==================== */
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
        if(h && values[idx]) {
            obj[h] = values[idx].replace(/^"|"$/g, '').trim();
        }
    });
    data.push(obj);
  }
  return data;
}

function downloadCSV(filename, headers, dataArray) {
  let csv = headers.join(",") + "\r\n";
  dataArray.forEach(row => {
      csv += row.map(v => {
          let str = String(v ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
      }).join(",") + "\r\n";
  });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ==================== Árbitros ==================== */
async function setupReferees(panel) {
  panel.innerHTML = `
    <div class="toolbar" style="flex-wrap:wrap; gap:8px">
      <label>UF
        <select id="ref-uf" style="min-width:120px">
          <option value="">(todas)</option>
          ${ufs().map(uf => `<option value="${uf}">${uf}</option>`).join('')}
        </select>
      </label>
      <label>Nível
        <select id="ref-nivel" style="min-width:160px">
          <option value="">(todos)</option>
          ${niveis().map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </label>
      <input id="ref-q" type="search" placeholder="Buscar nome..." />
      <button class="btn" id="ref-load">Carregar</button>
      <div style="flex:1"></div>
      <button class="btn" id="ref-export" style="background:#16a34a; color:white;">⬇ Exportar BCMS</button>
    </div>
    <div id="ref-report" style="font-size:12px; color:var(--muted,#667); margin:.25rem 0 .5rem"></div>
    <div style="border:1px solid var(--table-border); border-radius:10px; overflow:auto;">
      <table>
        <thead>
          <tr><th><input type="checkbox" id="ref-all"></th><th>Nome</th><th>UF</th><th>ID</th></tr>
        </thead>
        <tbody id="ref-tbody"></tbody>
      </table>
    </div>
  `;
  const tbody = panel.querySelector('#ref-tbody');
  const report = panel.querySelector('#ref-report');
  let currentReferees = [];

  panel.querySelector('#ref-load').onclick = async (e) => {
    e.preventDefault();
    tbody.innerHTML = rowLoading(4);
    const uf = panel.querySelector('#ref-uf').value.toLowerCase();
    const nivel = panel.querySelector('#ref-nivel').value.toLowerCase();
    const q = panel.querySelector('#ref-q').value.trim().toLowerCase();
    
    try {
      const snap = await getDocs(collection(db, "referees"));
      let items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (uf) items = items.filter(a => (a.uf || a.estado || '').toLowerCase() === uf);
      if (nivel) items = items.filter(a => (a.nivel || '').toLowerCase() === nivel);
      if (q) items = items.filter(a => (a.nome || a.nome_completo || '').toLowerCase().includes(q));

      currentReferees = items;
      tbody.innerHTML = '';
      
      if(items.length === 0) {
         tbody.innerHTML = `<tr><td colspan="4" style="padding:12px; text-align:center;">Nenhum árbitro encontrado.</td></tr>`;
         return;
      }

      for (const [i, a] of items.entries()) {
        const nome = a.nome ?? a.nome_completo ?? a.nome_abreviado ?? '';
        const tr = document.createElement('tr');
        if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
        tr.innerHTML = `
          <td><input type="checkbox" class="sel" data-id="${a.id}"></td>
          <td>${esc(nome)}</td>
          <td>${esc(a.uf || a.estado || '')}</td>
          <td>${a.id}</td>
        `;
        tbody.appendChild(tr);
      }
      
      panel.querySelector('#ref-all').onchange = e => {
        tbody.querySelectorAll('input.sel').forEach(ch => ch.checked = e.target.checked);
      };
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding:12px;color:red;">Erro: ${e.message}</td></tr>`;
    }
  };

  panel.querySelector('#ref-export').onclick = (e) => {
    e.preventDefault();
    const ids = Array.from(tbody.querySelectorAll('input.sel')).filter(ch => ch.checked).map(ch => ch.getAttribute('data-id'));
    if(ids.length === 0) return alert("Selecione pelo menos um árbitro.");
    
    const selected = currentReferees.filter(r => ids.includes(r.id));
    const headers = ["ID", "NOME_COMPLETO", "NOME_ABREVIADO", "UF", "NIVEL"];
    const rows = selected.map(r => [
        r.id, r.nome_completo || r.nome || '', r.nome_abreviado || '', r.uf || r.estado || '', r.nivel || ''
    ]);
    
    downloadCSV("BCMS_Referees_Export.csv", headers, rows);
  };

  panel.querySelector('#ref-load').click();
}

/* ==================== Atletas e Equipes ==================== */
async function setupAthletes(panel) {
  // === SISTEMA DE BACKDROP BLINDADO ===
  const HISTORY_KEY = 'bcms_csv_history';

  function getHistory() {
      try { 
          const raw = localStorage.getItem(HISTORY_KEY);
          return raw ? JSON.parse(raw) : [];
      } catch { return []; }
  }
  function saveHistory(item) {
      try {
          const hist = getHistory();
          hist.unshift(item); 
          if(hist.length > 10) hist.pop(); // Limite de 10 para não estourar memória
          localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
      } catch (e) {
          console.error("Erro ao salvar no Backdrop (Memória cheia?):", e);
      }
  }
  function deleteHistory(id) {
      let hist = getHistory();
      hist = hist.filter(x => x.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  }

  function renderHistory() {
      const list = panel.querySelector('#ath-history-list');
      if(!list) return;

      const hist = getHistory();
      if(hist.length === 0) {
          list.innerHTML = '<span style="color:#94a3b8; font-size:13px; font-style:italic;">Nenhuma exportação salva. Ao clicar em Exportar BCMS, o arquivo será salvo automaticamente aqui.</span>';
          return;
      }
      
      list.innerHTML = hist.map(h => `
          <div style="min-width: 250px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 8px;">
              <div style="display:flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #0f172a; font-size:16px; background: #e2e8f0; padding: 2px 8px; border-radius: 4px;">${h.classCode}</strong>
                  <span style="font-size:11px; color:#64748b; font-weight:bold;">${h.dateStr}</span>
              </div>
              <div style="font-size:13px; color:#475569; font-weight: 500;">
                  👥 ${h.numAthletes} Selecionados
              </div>
              <div style="display:flex; gap: 5px; margin-top: auto;">
                  <button class="btn-load-hist" data-id="${h.id}" style="flex:1; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:6px; cursor:pointer; font-weight:bold; color:#334155; font-size:12px; transition:0.2s;">🔄 Carregar Fielmente</button>
                  <button class="btn-del-hist" data-id="${h.id}" style="background:#fef2f2; border:1px solid #fca5a5; border-radius:4px; padding:6px 12px; cursor:pointer; color:#ef4444; font-weight:bold; font-size:12px; transition:0.2s;">❌</button>
              </div>
          </div>
      `).join('');
      
      list.querySelectorAll('.btn-load-hist').forEach(b => {
          b.onclick = async (e) => {
              e.preventDefault();
              b.innerText = 'Carregando...';
              const h = hist.find(x => x.id === b.dataset.id);
              if(!h) return;
              
              // Restaura os filtros visuais apenas para informação
              panel.querySelector('#ath-class').value = h.classCode || '';
              panel.querySelector('#ath-reg').value = h.reg || '';
              panel.querySelector('#ath-clube').value = h.clube || '';
              panel.querySelector('#ath-crit1').value = h.c1 || '';
              panel.querySelector('#ath-crit2').value = h.c2 || '';
              panel.querySelector('#ath-crit3').value = h.c3 || '';
              
              currentAthletes = h.savedAthletes || [];
              
              const tbody = panel.querySelector('#ath-tbody');
              tbody.innerHTML = '';
              for (const [i, a] of currentAthletes.entries()) {
                  const tr = document.createElement('tr');
                  if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
                  
                  const isChecked = h.selectedIds.includes(a._systemId) ? 'checked' : '';
                  
                  tr.innerHTML = `
                    <td><input type="checkbox" class="sel" data-id="${a._systemId}" ${isChecked} style="transform:scale(1.2);"></td>
                    <td style="font-weight:bold; color:#0f172a;">${a.rank}</td>
                    <td style="font-weight:bold; color:#dc2626;">${a.c1 ?? '—'}</td>
                    <td style="font-weight:bold; color:#2563eb;">${a.c2 ?? '—'}</td>
                    <td style="font-weight:bold; color:#16a34a;">${a.c3 ?? '—'}</td>
                    <td style="font-weight:bold;">${esc(a.nome || '').toUpperCase()}</td>
                    <td style="color:#475569; font-weight:bold;">${esc(a.clubeDisplay || '')}</td>
                    <td>${esc(a.regiao || '')}</td>
                    <td style="font-size:11px; color:#94a3b8;">${a._systemId}</td>
                  `;
                  tbody.appendChild(tr);
              }
              
              enableAthletesTableSort(panel.querySelector('#ath-table'));
              panel.querySelector('#ath-all').onchange = e => {
                  tbody.querySelectorAll('input.sel').forEach(ch => ch.checked = e.target.checked);
              };

              const athReport = panel.querySelector('#ath-report');
              athReport.innerHTML = `✅ <strong>Backdrop Carregado com Sucesso!</strong> Você está vendo a cópia fiel do dia ${h.dateStr}. Pode editar e Exportar novamente.`;
              b.innerText = '🔄 Carregar Fielmente';
          };
      });
      
      list.querySelectorAll('.btn-del-hist').forEach(b => {
          b.onclick = (e) => {
              e.preventDefault();
              if(confirm('Tem certeza que deseja excluir esta memória de exportação?')) {
                  deleteHistory(b.dataset.id);
                  renderHistory();
              }
          };
      });

      // Botão de Limpar Tudo
      const btnClearAll = panel.querySelector('#btn-clear-all-hist');
      if (btnClearAll) {
          btnClearAll.onclick = (e) => {
              e.preventDefault();
              if (confirm('Apagar todo o histórico de Backdrops salvos?')) {
                  localStorage.removeItem(HISTORY_KEY);
                  renderHistory();
              }
          }
      }
  }

  panel.innerHTML = `
    <div class="toolbar" style="flex-wrap:wrap; gap:8px; align-items:end">
      <label>Classe (Atleta ou Equipe)
        <select id="ath-class" style="min-width:140px; font-weight:bold; color:#0f172a;"></select>
      </label>
      <label>Região
        <select id="ath-reg" style="min-width:160px"></select>
      </label>
      <label>Clube
        <select id="ath-clube" style="min-width:300px"></select>
      </label>

      <label>Critério Rank 1
        <select id="ath-crit1" style="min-width:220px"></select>
      </label>
      <label>Critério Rank 2
        <select id="ath-crit2" style="min-width:220px"></select>
      </label>
      <label>Critério Rank 3
        <select id="ath-crit3" style="min-width:220px"></select>
      </label>

      <div style="flex:1"></div>
      <button class="btn" id="ath-load" style="background:#0f172a; color:white;">Carregar da Nuvem</button>
      <button class="btn" id="ath-export" style="background:#16a34a; color:white;">⬇ Exportar BCMS</button>
    </div>

    <div style="margin: 15px 0; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="margin:0; font-size:16px; color:#0f172a;">💾 Backdrop de Exportações Salvas</h3>
          <button id="btn-clear-all-hist" style="background:transparent; border:none; color:#ef4444; font-size:12px; cursor:pointer; text-decoration:underline;">Apagar tudo</button>
      </div>
      <div id="ath-history-list" style="display:flex; gap:10px; overflow-x:auto; padding-bottom: 5px;"></div>
    </div>

    <p style="margin:.5rem 0 .75rem;color:var(--muted,#667)">
      <strong>⚠️ REGRAS DA EXPORTAÇÃO OFICIAL:</strong> Selecione os 3 Critérios antes de carregar! Ao clicar em "Exportar", o sistema recalcula os Rankings ignorando a tabela visual, e gerará os dados estritamente baseados nos Critérios.
    </p>

    <div id="ath-report" style="font-size:12px; color:var(--muted,#667); margin:.25rem 0 .5rem"></div>

    <div style="border:1px solid var(--table-border); border-radius:10px; overflow:auto;">
      <table id="ath-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="ath-all"></th>
            <th>#</th><th>C1</th><th>C2</th><th>C3</th>
            <th>Nome Completo</th><th>Clube Completo - SIGLA</th><th>Região</th><th>ID do Sistema</th>
          </tr>
        </thead>
        <tbody id="ath-tbody"></tbody>
      </table>
    </div>
  `;

  const [classes, clubes, regions, comps] = await Promise.all([
    apiClasses(), apiClubesAll(), apiRegioes(), apiCompetitionsDropdown()
  ]);

  fillSelect(panel.querySelector('#ath-class'), [{ value: '', label: '— Selecione a Classe —' }, ...classes.map(c => ({ value: c.code, label: c.code }))]);
  fillSelect(panel.querySelector('#ath-reg'), [{ value: '', label: '(todas)' }, ...regions.map(r => ({ value: r, label: r }))]);
  fillSelect(panel.querySelector('#ath-clube'), [{ value: '', label: '(todos)' }, ...clubes.map(c => ({ value: c.id, label: `${c.sigla ? c.sigla + ' — ' : ''}${c.nome || c.name}` }))]);

  const compOpts = [{ value: '', label: '(nenhum)' }, ...comps.map(c => ({ value: c.id, label: c.nome }))];
  fillSelect(panel.querySelector('#ath-crit1'), compOpts);
  fillSelect(panel.querySelector('#ath-crit2'), compOpts);
  fillSelect(panel.querySelector('#ath-crit3'), compOpts);

  const tbody = panel.querySelector('#ath-tbody');
  let currentAthletes = [];

  const loadAthletesData = async (e) => {
    if(e) e.preventDefault();
    const thead = panel.querySelector('#ath-table thead');
    if (thead) {
        thead.querySelectorAll('th').forEach((th, idx) => {
            if(idx === 0) return; 
            th.removeAttribute('data-sort');
            th.textContent = th.textContent.replace(/ [↑↓]$/, '');
        });
    }

    tbody.innerHTML = rowLoading(9);

    const cls = (panel.querySelector('#ath-class').value || '').toUpperCase().trim();
    if (!cls) { alert('Escolha uma Classe primeiro.'); tbody.innerHTML = ''; return; }

    const reg = panel.querySelector('#ath-reg').value;
    const clubeIdStr = panel.querySelector('#ath-clube').value;
    
    const c1Val = panel.querySelector('#ath-crit1').value;
    const c2Val = panel.querySelector('#ath-crit2').value;
    const c3Val = panel.querySelector('#ath-crit3').value;

    try {
      const qH = query(collection(db, "historical_results"));
      const snapH = await getDocs(qH);
      const histMap = new Map(); 
      
      snapH.forEach(d => {
        const dt = d.data();
        histMap.set(`${String(dt.athlete_id)}_${String(dt.competition_id)}`, Number(dt.posicao || dt.rank || 9999));
      });

      let items = [];
      const isTeamEvent = cls.includes('PAR') || cls.includes('PAIR') || cls.includes('EQUIP') || cls.includes('TEAM');

      if (isTeamEvent) {
          const snap = await getDocs(collection(db, "equipes"));
          snap.docs.forEach(doc => {
              const data = doc.data();
              if (!data.nome && !data.name) return;
              if (String(data.nome || data.name).trim() === '') return;

              const cat = String(data.category || '').toUpperCase();
              let isMatch = false;
              if (cat === 'TEAM_BC1_BC2' && (cls.includes('BC1') || cls.includes('BC2'))) isMatch = true;
              if (cat === 'PAIR_BC3' && cls.includes('BC3')) isMatch = true;
              if (cat === 'PAIR_BC4' && cls.includes('BC4')) isMatch = true;

              if (isMatch) {
                  let sigla = String(data.club_sigla || data.sigla || '').trim();
                  let repFull = String(data.rep_value_name || data.clube_nome || data.clube || data.club_sigla || data.sigla || 'Sem Clube').trim();
                  
                  if (data.rep_type === 'REGIAO' || data.rep_type === 'ESTADO') {
                      repFull = `Seleção ${data.rep_value}`;
                      sigla = data.rep_value; 
                  }

                  let clubeDisplay = repFull;
                  if (repFull && sigla && !repFull.toUpperCase().includes(sigla.toUpperCase()) && repFull.toUpperCase() !== sigla.toUpperCase()) {
                      clubeDisplay = `${repFull} - ${sigla}`;
                  } else if (!repFull && sigla) {
                      clubeDisplay = sigla;
                  }

                  const oldId = data.id !== undefined ? String(data.id) : doc.id;
                  const c1 = c1Val ? (histMap.get(`${oldId}_${c1Val}`) ?? histMap.get(`${doc.id}_${c1Val}`)) : null;
                  const c2 = c2Val ? (histMap.get(`${oldId}_${c2Val}`) ?? histMap.get(`${doc.id}_${c2Val}`)) : null;
                  const c3 = c3Val ? (histMap.get(`${oldId}_${c3Val}`) ?? histMap.get(`${doc.id}_${c3Val}`)) : null;

                  items.push({
                      _systemId: doc.id,
                      ...data,
                      nome: data.nome || data.name,
                      clube_nome: repFull,
                      clube_sigla: sigla,
                      clubeDisplay: clubeDisplay, 
                      regiao: (data.rep_type === 'REGIAO' || data.rep_type === 'ESTADO') ? data.rep_value : (data.regiao || ''),
                      c1: c1,
                      c2: c2,
                      c3: c3
                  });
              }
          });
      } else {
          const snap = await getDocs(collection(db, "atletas"));
          snap.docs.forEach(doc => {
              const data = doc.data();
              
              if (!data.nome && !data.name) return;
              if (String(data.nome || data.name).trim() === '') return;

              const athClass = String(data.classe_code || '').toUpperCase().trim();
              
              if (athClass.includes(cls) || cls.includes(athClass)) {
                  
                  const cid = String(data.clube_id || data.club_id || data.id_clube || '').trim();
                  const cnome = String(data.clube_nome || data.clube || data.club || data['representação/clube'] || data.representacao || '').trim();
                  const csigla = String(data.clube_sigla || data.sigla || '').trim();

                  let c = null;
                  
                  if (cid && cid !== 'undefined' && cid !== 'null') {
                      c = clubes.find(x => String(x.id) === cid);
                  }
                  
                  if (!c && csigla) {
                      c = clubes.find(x => String(x.sigla || '').trim().toUpperCase() === csigla.toUpperCase());
                  }
                  
                  if (!c && cnome) {
                      c = clubes.find(x => 
                          String(x.nome || x.name || '').trim().toUpperCase() === cnome.toUpperCase() ||
                          String(x.sigla || '').trim().toUpperCase() === cnome.toUpperCase()
                      );
                  }
                  
                  c = c || {}; // Fallback de segurança

                  const finalNomeClube = String(c.nome || c.name || cnome).trim();
                  const finalSiglaClube = String(c.sigla || csigla).trim();
                  
                  let clubeDisplay = finalNomeClube;
                  if (finalNomeClube && finalSiglaClube) {
                      if (!finalNomeClube.toUpperCase().includes(finalSiglaClube.toUpperCase()) && finalNomeClube.toUpperCase() !== finalSiglaClube.toUpperCase()) {
                          clubeDisplay = `${finalNomeClube} - ${finalSiglaClube}`;
                      }
                  } else if (!finalNomeClube && finalSiglaClube) {
                      clubeDisplay = finalSiglaClube;
                  } else if (!finalNomeClube && !finalSiglaClube) {
                      clubeDisplay = 'Sem Clube';
                  }

                  const oldId = data.id !== undefined ? String(data.id) : doc.id;
                  const c1 = c1Val ? (histMap.get(`${oldId}_${c1Val}`) ?? histMap.get(`${doc.id}_${c1Val}`)) : null;
                  const c2 = c2Val ? (histMap.get(`${oldId}_${c2Val}`) ?? histMap.get(`${doc.id}_${c2Val}`)) : null;
                  const c3 = c3Val ? (histMap.get(`${oldId}_${c3Val}`) ?? histMap.get(`${doc.id}_${c3Val}`)) : null;
                  
                  items.push({ 
                      _systemId: doc.id, 
                      ...data, 
                      clube_id: c.id || cid, 
                      clube_nome: finalNomeClube,
                      clube_sigla: finalSiglaClube, 
                      clubeDisplay: clubeDisplay,
                      regiao: c.regiao || data.regiao || '',
                      c1: c1,
                      c2: c2,
                      c3: c3
                  });
              }
          });
      }

      if (reg) items = items.filter(x => (x.regiao || '') === reg);
      if (clubeIdStr) items = items.filter(x => String(x.clube_id) === String(clubeIdStr));

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding:20px; text-align:center;">Nenhum participante encontrado para os filtros.</td></tr>`;
        return;
      }

      items.sort((a,b) => {
          if ((a.c1 || 9999) !== (b.c1 || 9999)) return (a.c1 || 9999) - (b.c1 || 9999);
          if ((a.c2 || 9999) !== (b.c2 || 9999)) return (a.c2 || 9999) - (b.c2 || 9999);
          if ((a.c3 || 9999) !== (b.c3 || 9999)) return (a.c3 || 9999) - (b.c3 || 9999);
          return (a.nome||'').localeCompare(b.nome||'');
      });

      items = items.map((it, idx) => ({ ...it, rank: idx + 1 }));
      currentAthletes = items;

      tbody.innerHTML = '';
      
      // 🔥 CHECKBOX DESMARCADA POR PADRÃO AQUI
      for (const [i, a] of items.entries()) {
        const tr = document.createElement('tr');
        if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
        
        tr.innerHTML = `
          <td><input type="checkbox" class="sel" data-id="${a._systemId}" style="transform:scale(1.2);"></td>
          <td style="font-weight:bold; color:#0f172a;">${a.rank}</td>
          <td style="font-weight:bold; color:#dc2626;">${a.c1 ?? '—'}</td>
          <td style="font-weight:bold; color:#2563eb;">${a.c2 ?? '—'}</td>
          <td style="font-weight:bold; color:#16a34a;">${a.c3 ?? '—'}</td>
          <td style="font-weight:bold;">${esc(a.nome || '').toUpperCase()}</td>
          <td style="color:#475569; font-weight:bold;">${esc(a.clubeDisplay)}</td>
          <td>${esc(a.regiao || '')}</td>
          <td style="font-size:11px; color:#94a3b8;">${a._systemId}</td>
        `;
        tbody.appendChild(tr);
      }

      enableAthletesTableSort(panel.querySelector('#ath-table'));
      
      // Garante que o input superior também inicie vazio
      panel.querySelector('#ath-all').checked = false;
      panel.querySelector('#ath-all').onchange = e => {
        tbody.querySelectorAll('input.sel').forEach(ch => ch.checked = e.target.checked);
      };
    } catch (err) {
      console.error('[athletes] preview falhou:', err);
      tbody.innerHTML = `<tr><td colspan="9" style="padding:12px;color:#b00">Erro ao cruzar dados do Ranking.</td></tr>`;
    }
  };

  panel.querySelector('#ath-load').onclick = loadAthletesData;

  panel.querySelector('#ath-export').onclick = (e) => {
    e.preventDefault(); 
    
    const checkboxes = Array.from(panel.querySelectorAll('#ath-tbody input.sel:checked'));
    if (!checkboxes.length) { alert('Selecione pelo menos um participante na lista.'); return; }

    const cls = panel.querySelector('#ath-class').value;
    const isTeamEvent = cls.includes('PAR') || cls.includes('PAIR') || cls.includes('EQUIP') || cls.includes('TEAM');
    
    const selectedClassObj = classes.find(c => c.code === cls);
    const bibBase = selectedClassObj ? selectedClassObj.bib_base : '';
    
    const headers = [
        "side_bib", "side_memebeship_id", "ranking", "side_name", "side_ioc",
        "organization_code", "event", "organization_email", "athlete_membership_id",
        "athlete_bib", "first_name", "last_name", "gender", "athlete_ioc",
        "is_cp", "assistant", "class", "category_code"
    ];
    
    const selectedIds = checkboxes.map(ch => ch.getAttribute('data-id'));
    let selectedAthletes = currentAthletes.filter(x => selectedIds.includes(x._systemId));

    selectedAthletes.sort((a, b) => {
        const aC1 = a.c1 != null ? Number(a.c1) : 9999;
        const bC1 = b.c1 != null ? Number(b.c1) : 9999;
        if (aC1 !== bC1) return aC1 - bC1;

        const aC2 = a.c2 != null ? Number(a.c2) : 9999;
        const bC2 = b.c2 != null ? Number(b.c2) : 9999;
        if (aC2 !== bC2) return aC2 - bC2;

        const aC3 = a.c3 != null ? Number(a.c3) : 9999;
        const bC3 = b.c3 != null ? Number(b.c3) : 9999;
        if (aC3 !== bC3) return aC3 - bC3;

        return (a.nome || '').localeCompare(b.nome || '');
    });
    
    const rowsData = selectedAthletes.map((a, index) => {
        const finalRank = index + 1; 
        const rankStr = String(finalRank).padStart(2, '0');
        
        let genderFull = "MIXED";
        const g = String(a.genero || a.sexo || '').toUpperCase();
        if (g === 'F' || g.startsWith('FEM') || cls.endsWith('F')) genderFull = 'FEMALE';
        else if (g === 'M' || g.startsWith('MAS') || cls.endsWith('M')) genderFull = 'MALE';

        // 🔥 GERAÇÃO DO BIB - CORREÇÃO DEFINITIVA
        let generatedBib = "";
        const m = cls.match(/BC(\d)/i);
        const classDigit = m ? m[1] : '9'; 

        if (bibBase) {
             const strBase = String(bibBase).trim();
             if (strBase.length >= 3) {
                 const prefix = strBase.slice(0, -2); 
                 generatedBib = `${prefix}${rankStr}`; 
             } else {
                 generatedBib = `${strBase}${rankStr}`; 
             }
        } else {
            if (isTeamEvent) {
                generatedBib = `${classDigit}${rankStr}`;
            } else {
                const genderDigit = genderFull === 'FEMALE' ? '1' : (genderFull === 'MALE' ? '2' : '9');
                generatedBib = `${genderDigit}${classDigit}${rankStr}`;
            }
        }
        
        let fName = '';
        let lName = '';
        let sideName = String(a.nome || a.name || '').trim().toUpperCase();

        if (!isTeamEvent) {
            let parts = sideName.split(' ');
            if (parts.length > 1) {
                const suffixes = ['JUNIOR', 'JÚNIOR', 'NETO', 'FILHO', 'SEGUNDO', 'TERCEIRO', 'SOBRINHO'];
                const connectors = ['DE', 'DA', 'DO', 'DAS', 'DOS'];
                
                let takeCount = 1;
                let lastWord = parts[parts.length - 1].toUpperCase();
                
                if (suffixes.includes(lastWord) && parts.length > 2) {
                    takeCount = 2;
                }
                
                let wordBeforeLastBlock = parts[parts.length - 1 - takeCount];
                if (wordBeforeLastBlock && connectors.includes(wordBeforeLastBlock.toUpperCase())) {
                    takeCount++;
                }
                
                lName = parts.slice(-takeCount).join(' ');
                fName = parts.slice(0, parts.length - takeCount).join(' ');
            } else {
                fName = sideName;
                lName = '';
            }
        }

        const sigla = String(a.clube_sigla || a.clube_nome || '').toUpperCase();
        const baseClass = cls.replace(/[^A-Z0-9]/g, '').replace(/M$|F$/i, ''); 

        if (isTeamEvent) {
            return [
                generatedBib,          
                a._systemId,           
                rankStr,               
                sideName,              
                sigla,                 
                sigla,                 
                "",                    
                "",                    
                "",                    
                "",                    
                "",                    
                "",                    
                "MIXED",               
                "",                    
                "",                    
                "",                    
                baseClass,             
                cls                    
            ];
        } else {
            return [
                generatedBib,          
                a._systemId,           
                rankStr,               
                sideName,              
                sigla,                 
                sigla,                 
                "",                    
                "",                    
                a._systemId,           
                generatedBib,          
                fName,                 
                lName,                 
                genderFull,            
                sigla,                 
                "",                    
                (a.operador_rampa || "").toUpperCase(), 
                baseClass,             
                cls                    
            ];
        }
    });

    const snapshotAthletes = currentAthletes.map(a => ({
        _systemId: a._systemId,
        rank: a.rank,
        c1: a.c1, c2: a.c2, c3: a.c3,
        nome: a.nome, name: a.name,
        clube_sigla: a.clube_sigla, clube_nome: a.clube_nome,
        clubeDisplay: a.clubeDisplay, 
        regiao: a.regiao, genero: a.genero, sexo: a.sexo,
        operador_rampa: a.operador_rampa,
        classe_code: a.classe_code
    }));

    const histItem = {
        id: Date.now().toString(),
        dateStr: new Date().toLocaleString('pt-BR').slice(0, 16),
        classCode: cls,
        c1: panel.querySelector('#ath-crit1').value,
        c2: panel.querySelector('#ath-crit2').value,
        c3: panel.querySelector('#ath-crit3').value,
        reg: panel.querySelector('#ath-reg').value,
        clube: panel.querySelector('#ath-clube').value,
        numAthletes: selectedAthletes.length, 
        selectedIds: selectedIds,
        savedAthletes: snapshotAthletes 
    };
    
    saveHistory(histItem);
    renderHistory();
    
    downloadCSV(`BCMS_Inscricoes_${cls}.csv`, headers, rowsData);

    const athReport = panel.querySelector('#ath-report');
    athReport.innerHTML = `✅ <strong>Sucesso!</strong> Arquivo CSV baixado e Backdrop salvo (${selectedAthletes.length} participantes).`;
  };

  renderHistory();
}

/* ==================== Clubes ==================== */
async function setupClubs(panel) {
  panel.innerHTML = `
    <div class="toolbar" style="flex-wrap:wrap; gap:8px">
      <label>Região
        <select id="clu-reg" style="min-width:160px"></select>
      </label>
      <input id="clu-q" type="search" placeholder="Buscar nome/sigla..." />
      <button class="btn" id="clu-load">Carregar</button>
      <div style="flex:1"></div>
      <button class="btn" id="clu-export" style="background:#16a34a; color:white;">⬇ Exportar BCMS</button>
    </div>
    <div id="clu-report" style="font-size:12px; color:var(--muted,#667); margin:.25rem 0 .5rem"></div>
    <div style="border:1px solid var(--table-border); border-radius:10px; overflow:auto;">
      <table>
        <thead><tr><th><input type="checkbox" id="clu-all"></th><th>Sigla</th><th>Nome</th><th>Região</th><th>ID</th></tr></thead>
        <tbody id="clu-tbody"></tbody>
      </table>
    </div>
  `;
  const tbody = panel.querySelector('#clu-tbody');
  const report = panel.querySelector('#clu-report');
  let currentClubs = [];

  const regions = await apiRegioes();
  fillSelect(panel.querySelector('#clu-reg'), [{ value: '', label: '(todas)' }, ...regions.map(r => ({ value: r, label: r }))]);

  panel.querySelector('#clu-load').onclick = async (e) => {
    e.preventDefault();
    tbody.innerHTML = rowLoading(5);
    const reg = panel.querySelector('#clu-reg').value.toLowerCase();
    const q = panel.querySelector('#clu-q').value.trim().toLowerCase();
    
    try {
      const snap = await getDocs(collection(db, "clubes"));
      let items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (reg) items = items.filter(a => (a.regiao || '').toLowerCase() === reg);
      if (q) items = items.filter(a => (a.nome || '').toLowerCase().includes(q) || (a.sigla || '').toLowerCase().includes(q));

      currentClubs = items;
      tbody.innerHTML = '';
      for (const [i, c] of items.entries()) {
        const tr = document.createElement('tr'); if (i % 2) tr.style.background = 'var(--row-alt,#f8fbff)';
        tr.innerHTML = `
          <td><input type="checkbox" class="sel" data-id="${c.id}"></td>
          <td>${esc(c.sigla || '')}</td>
          <td>${esc(c.nome || c.name || '')}</td>
          <td>${esc(c.regiao || '')}</td>
          <td>${c.id}</td>
        `; tbody.appendChild(tr);
      }
      panel.querySelector('#clu-all').onchange = e => {
        tbody.querySelectorAll('input.sel').forEach(ch => ch.checked = e.target.checked);
      };
    } catch(e) { tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Erro: ${e.message}</td></tr>`; }
  };

  panel.querySelector('#clu-export').onclick = (e) => {
    e.preventDefault();
    const ids = Array.from(panel.querySelectorAll('#clu-tbody input.sel')).filter(ch => ch.checked).map(ch => ch.getAttribute('data-id'));
    if(ids.length === 0) return alert("Selecione pelo menos um clube.");
    
    const selected = currentClubs.filter(r => ids.includes(r.id));
    const headers = ["ID", "SIGLA", "NOME", "REGIAO"];
    const rows = selected.map(r => [r.id, r.sigla || '', r.nome || '', r.regiao || '']);
    
    downloadCSV("BCMS_Clubs_Export.csv", headers, rows);
  };

  panel.querySelector('#clu-load').click();
}

/* ==================== helpers/APIs ==================== */
function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function fillSelect(sel, options) { sel.innerHTML = options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join(''); }
function rowLoading(cols) { return `<tr><td colspan="${cols}" style="padding:12px">Carregando da nuvem…</td></tr>`; }
function ufs() { return ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO','EXT']; }
function niveis() { return ['Local','Regional','Nacional','Internacional']; }

async function apiClasses() { 
    const snap = await getDocs(collection(db, "classes"));
    return snap.docs.map(doc => {
        const d = doc.data();
        return { code: d.codigo || d.code || doc.id, name: d.nome || d.name, bib_base: d.bib_base || '' };
    });
}
async function apiClubesAll() { 
    const snap = await getDocs(collection(db, "clubes"));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function apiRegioes() { 
    const clubes = await apiClubesAll();
    return Array.from(new Set(clubes.map(c => c.regiao).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' })); 
}
async function apiCompetitionsDropdown() { 
    const snap = await getDocs(collection(db, "competitions"));
    return snap.docs.map(doc => ({ id: doc.id, nome: doc.data().name || doc.data().nome }));
}

/* ===== Ordenação clicável da TABELA DE ATLETAS ===== */
function enableAthletesTableSort(table) {
  if (!table || table.dataset.sortReady) return;
  table.dataset.sortReady = "true";

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (!thead || !tbody) return;

  const numericCols = new Set([1, 2, 3, 4]); 

  function clearSortIndicators() {
    thead.querySelectorAll('th').forEach((th, idx) => {
      if (idx === 0) return; 
      th.removeAttribute('data-sort');
      th.textContent = th.textContent.replace(/ [↑↓]$/, '');
    });
  }

  thead.querySelectorAll('th').forEach((th, idx) => {
    if (idx === 0) return; 

    th.style.cursor = 'pointer';
    th.title = "Clique para ordenar visualmente (A Exportação seguirá o Critério)";

    th.addEventListener('click', () => {
      const current = th.getAttribute('data-sort'); 
      const dir = current === 'asc' ? 'desc' : 'asc';
      
      clearSortIndicators();
      th.setAttribute('data-sort', dir);
      th.textContent += (dir === 'asc' ? ' ↑' : ' ↓');

      const rows = Array.from(tbody.querySelectorAll('tr'));
      
      const getVal = (tr) => {
        const td = tr.children[idx];
        const raw = (td?.textContent || '').trim();
        if (numericCols.has(idx)) {
          if (raw === '—' || raw === '') return Number.POSITIVE_INFINITY; 
          const n = Number(raw);
          return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
        }
        return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      };

      rows.sort((a, b) => {
        const A = getVal(a);
        const B = getVal(b);
        
        if (A === B) {
          const aHash = Number((a.children[1]?.textContent || '').trim()) || 0;
          const bHash = Number((b.children[1]?.textContent || '').trim()) || 0;
          return dir === 'asc' ? (aHash - bHash) : (bHash - aHash);
        }
        
        if (dir === 'asc') return (A > B) ? 1 : -1;
        return (A < B) ? 1 : -1;
      });

      const frag = document.createDocumentFragment();
      rows.forEach(tr => frag.appendChild(tr));
      tbody.innerHTML = '';
      tbody.appendChild(frag);
    });
  });
}

export default renderCsvHub;