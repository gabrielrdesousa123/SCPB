// client/js/pages/oficiais.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// 🔥 IMPORTAÇÃO DO CÉREBRO
import { canEditGlobal } from '../permissions.js';

function escapeHTML(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

const NIVEL = ['Aspirante Regional','Regional','Nacional I','Nacional II','Internacional'];
const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EXT'];

export async function renderOficiais(root) {
  // 🔥 VERIFICA SE PODE EDITAR
  const canEdit = canEditGlobal('oficiais');

  root.innerHTML = `
    <section class="page" id="oficiais-root" style="padding: 20px; max-width: 1200px; margin: 0 auto;">
      <header style="margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
        <h1 style="margin: 0; color: #0f172a;">Banco de Árbitros e Oficiais</h1>
        <p style="margin: 5px 0 0; color: #64748b; font-size: 14px;">Gerencie os oficiais que atuarão nas competições da Federação.</p>
      </header>
      
      <div class="section" style="display: ${canEdit ? 'block' : 'none'};">
        <form id="addOficialForm" style="display:grid; gap:10px; background:#f8fafc; padding:20px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:25px;">
          <h3 style="margin-top:0; margin-bottom:10px; font-size:16px; color:#1e293b;">Adicionar Novo Oficial</h3>
          
          <div style="display:grid; grid-template-columns:2fr 1fr 1.5fr; gap:15px;">
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">Nome Completo *
              <input type="text" id="addNome" required style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
            </label>
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">Nome Súmula (Abrev.)
              <input type="text" id="addAbrev" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
            </label>
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">E-mail
              <input type="email" id="addEmail" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
            </label>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; align-items:end;">
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">Nível
              <select id="addNivel" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
                ${NIVEL.map(n => `<option value="${n}">${n}</option>`).join("")}
              </select>
            </label>
            <label style="display:flex; flex-direction:column; font-weight:bold; font-size:12px; color:#475569;">UF
              <select id="addUF" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
                ${UF.map(u => `<option value="${u}">${u}</option>`).join("")}
              </select>
            </label>
            <button type="submit" class="btn" style="background:#16a34a; color:white; padding:10px; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">➕ Adicionar Oficial</button>
          </div>
        </form>
      </div>

      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
          <thead style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
              <tr>
                  <th style="padding: 12px 15px; color:#334155;">Nome Completo</th>
                  <th style="padding: 12px 15px; color:#334155;">Abreviado</th>
                  <th style="padding: 12px 15px; color:#334155;">E-mail</th>
                  <th style="padding: 12px 15px; color:#334155;">Nível e UF</th>
                  <th style="padding: 12px 15px; text-align:center; color:#334155;">Competições</th>
                  ${canEdit ? '<th style="padding: 12px 15px; text-align:right; color:#334155;">Ações</th>' : ''}
              </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <dialog id="dlg-hist-comp" style="border:none; border-radius:12px; padding:25px; max-width:550px; width:90%; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
        <h3 style="margin-top:0; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">🏆 Histórico de Atuação</h3>
        <div id="hist-comp-list" style="margin: 15px 0; max-height: 400px; overflow-y: auto; padding-right:10px;"></div>
        <div style="text-align:right; border-top:1px solid #e2e8f0; padding-top:15px; margin-top:15px;">
          <button type="button" onclick="this.closest('dialog').close()" style="background:#e2e8f0; color:#475569; border:none; padding:8px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">Fechar Histórico</button>
        </div>
      </dialog>
    </section>
  `;
  
  await attachOficiaisHandlers(root, canEdit);
}

async function attachOficiaisHandlers(root, canEdit) {
  const tbody = root.querySelector('.data-table tbody');
  
  let currentReferees = [];
  let refHist = {}; // Guarda o histórico de cada árbitro

  const createViewRow = (item) => {
    const tr = document.createElement('tr');
    tr.dataset.id = item.id;
    tr.style.borderBottom = '1px solid #f1f5f9';
    
    const hist = refHist[item.id] || [];
    
    // Botão de competições (mostra modal se > 0)
    let histHtml = hist.length > 0 
       ? `<button data-act="view-hist" data-id="${item.id}" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:4px 12px; border-radius:12px; font-weight:bold; font-size:12px; cursor:pointer; transition:0.2s;">${hist.length} Eventos</button>`
       : `<span style="color:#94a3b8; font-size:12px; font-weight:bold;">Nenhum</span>`;

    let html = `
        <td style="padding: 12px 15px; font-weight:bold; color:#1e293b;">${escapeHTML(item.nome_completo || '')}</td>
        <td style="padding: 12px 15px; color:#475569;">${escapeHTML(item.nome_abreviado || '—')}</td>
        <td style="padding: 12px 15px; color:#475569;">${escapeHTML(item.email || '—')}</td>
        <td style="padding: 12px 15px;">
           <span style="font-weight:bold; color:#0f172a;">${escapeHTML(item.nivel || '')}</span><br>
           <span style="font-size:11px; color:#64748b;">UF: ${escapeHTML(item.uf || '')}</span>
        </td>
        <td style="padding: 12px 15px; text-align:center; vertical-align:middle;">${histHtml}</td>
    `;
    
    if (canEdit) {
        html += `
        <td style="padding: 12px 15px; text-align:right;">
            <button data-act="edit" style="background:transparent; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; margin-right:5px;">✏️ Editar</button>
            <button data-act="delete" style="background:transparent; border:1px solid #fca5a5; color:#ef4444; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;">🗑️</button>
        </td>`;
    }
    
    tr.innerHTML = html;
    return tr;
  };

  const createEditRow = (item) => {
    const tr = document.createElement('tr');
    tr.dataset.id = item.id;
    tr.style.background = '#fffbeb';
    
    const nivelOpts = NIVEL.map(n => `<option value="${n}" ${n === item.nivel ? 'selected' : ''}>${n}</option>`).join('');
    const ufOpts = UF.map(u => `<option value="${u}" ${u === item.uf ? 'selected' : ''}>${u}</option>`).join('');
    
    let html = `
        <td style="padding: 12px 15px;"><input type="text" class="edit-nome" value="${escapeHTML(item.nome_completo || '')}" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;"></td>
        <td style="padding: 12px 15px;"><input type="text" class="edit-abrev" value="${escapeHTML(item.nome_abreviado || '')}" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;"></td>
        <td style="padding: 12px 15px;"><input type="email" class="edit-email" value="${escapeHTML(item.email || '')}" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;"></td>
        <td style="padding: 12px 15px;">
           <select class="edit-nivel" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px; margin-bottom:4px;">${nivelOpts}</select>
           <select class="edit-uf" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">${ufOpts}</select>
        </td>
        <td style="padding: 12px 15px; text-align:center; color:#94a3b8; font-size:11px;">(Bloqueado)</td>
    `;
    
    if (canEdit) {
        html += `
        <td style="padding: 12px 15px; text-align:right;">
            <button data-act="save" style="background:#16a34a; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold; margin-bottom:4px; width:100%;">Salvar</button>
            <button data-act="cancel" style="background:#e2e8f0; color:#475569; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; width:100%;">Cancelar</button>
        </td>`;
    }
    
    tr.innerHTML = html;
    return tr;
  };
  
  const refresh = async () => {
    try {
      // 🔥 Carrega Tudo de uma vez para cruzar os dados
      const [snapRefs, snapComps, snapCompOffs] = await Promise.all([
          getDocs(collection(db, "referees")),
          getDocs(collection(db, "competitions")),
          getDocs(collection(db, "competition_officials"))
      ]);

      // Mapeia Competições
      const compDict = {};
      snapComps.forEach(d => compDict[d.id] = d.data());

      // Mapeia o Histórico de cada Oficial
      refHist = {};
      snapCompOffs.forEach(d => {
          const data = d.data();
          const refId = data.official_id; // É assim que ligamos o oficial à competição
          
          if (refId) {
              if (!refHist[refId]) refHist[refId] = [];
              const compDate = compDict[data.competition_id]?.data_inicio || compDict[data.competition_id]?.start_date || 'N/A';
              
              refHist[refId].push({
                  compId: data.competition_id,
                  role: data.role || 'Oficial',
                  compName: compDict[data.competition_id]?.nome || compDict[data.competition_id]?.name || 'Competição Excluída',
                  compDate: compDate
              });
          }
      });

      // Carrega os Oficiais em si
      currentReferees = snapRefs.docs.map(d => ({ id: d.id, ...d.data() }));
      currentReferees.sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || ''));

      tbody.innerHTML = ''; 
      currentReferees.forEach(item => tbody.appendChild(createViewRow(item)));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; color:red; text-align:center;">Erro ao carregar dados do Firebase: ${e.message}</td></tr>`;
    }
  };

  if (canEdit) {
      const addForm = root.querySelector('#addOficialForm');
      
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = addForm.querySelector('button[type="submit"]');
        
        const body = {
          nome_completo: root.querySelector('#addNome').value.trim(),
          nome_abreviado: root.querySelector('#addAbrev').value.trim(),
          email: root.querySelector('#addEmail').value.trim(),
          nivel: root.querySelector('#addNivel').value,
          uf: root.querySelector('#addUF').value,
        };
        
        if (!body.nome_completo) return alert('O nome é obrigatório.');

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Aguarde...';

        try {
          await addDoc(collection(db, "referees"), body);
          addForm.reset(); 
          if(window.__toast) window.__toast('Oficial cadastrado!', 'success');
          await refresh(); 
        } catch (err) { 
          alert(`Erro ao adicionar no Firebase: ${err.message}`); 
        } finally {
          btnSubmit.disabled = false;
          btnSubmit.textContent = '➕ Adicionar Oficial';
        }
      });

      tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const { act, id } = btn.dataset;
        
        // Abre Histórico
        if (act === 'view-hist') {
            const hist = refHist[id] || [];
            const histList = root.querySelector('#hist-comp-list');
            
            // Ordena o histórico pelas datas mais recentes
            hist.sort((a,b) => b.compDate.localeCompare(a.compDate));
            
            histList.innerHTML = hist.map(h => `
                <div style="padding:15px; border-bottom:1px solid #f1f5f9; background:#f8fafc; border-radius:8px; margin-bottom:8px;">
                    <div style="font-weight:bold; color:#0f172a; font-size:15px;">${escapeHTML(h.compName)}</div>
                    <div style="display:flex; justify-content:space-between; margin-top:6px;">
                       <span style="font-size:13px; color:#64748b;">📅 ${escapeHTML(h.compDate)}</span>
                       <span style="background:#e0e7ff; color:#1d4ed8; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:bold;">🏷️ ${escapeHTML(h.role)}</span>
                    </div>
                </div>
            `).join('');
            
            root.querySelector('#dlg-hist-comp').showModal();
            return;
        }

        const row = btn.closest('tr');
        if (!row) return;
        const rowId = row.dataset.id;
        
        if (act === 'edit') {
          const item = currentReferees.find(i => i.id === rowId);
          if(item) row.replaceWith(createEditRow(item));
        }
        
        if (act === 'cancel') {
          const item = currentReferees.find(i => i.id === rowId);
          if(item) row.replaceWith(createViewRow(item));
        }
        
        if (act === 'delete') {
          if (!confirm(`Atenção: Excluir um oficial que já apitou em uma competição pode causar erros nas súmulas antigas. Continuar?`)) return;
          btn.disabled = true;
          try {
            await deleteDoc(doc(db, "referees", rowId));
            if(window.__toast) window.__toast('Excluído.', 'success');
            await refresh();
          } catch (err) { 
            alert(`Erro ao excluir: ${err.message}`); 
            btn.disabled = false;
          }
        }
        
        // 🔥 A LÓGICA DE SALVAMENTO CORRIGIDA (Buscando pela Classe CSS)
        if (act === 'save') {
          const body = {
            nome_completo: row.querySelector('.edit-nome').value.trim(),
            nome_abreviado: row.querySelector('.edit-abrev').value.trim(),
            email: row.querySelector('.edit-email').value.trim(),
            nivel: row.querySelector('.edit-nivel').value,
            uf: row.querySelector('.edit-uf').value,
          };
          
          if (!body.nome_completo) return alert('O nome é obrigatório.');
          
          btn.disabled = true;
          btn.textContent = '...';

          try {
            await updateDoc(doc(db, "referees", rowId), body);
            
            const index = currentReferees.findIndex(i => i.id === rowId);
            if (index !== -1) {
               // Atualiza local e recria a visualização
               currentReferees[index] = { ...currentReferees[index], ...body };
               row.replaceWith(createViewRow(currentReferees[index]));
               if(window.__toast) window.__toast('Salvo!', 'success');
            } else {
               await refresh();
            }
          } catch (err) { 
            alert(`Erro ao salvar: ${err.message}`); 
            btn.disabled = false;
            btn.textContent = 'Salvar';
          }
        }
      });
  } else {
      // Se não pode editar, pelo menos o botão de histórico funciona
      tbody.addEventListener('click', (e) => {
          const btn = e.target.closest('button');
          if (btn && btn.dataset.act === 'view-hist') {
              const hist = refHist[btn.dataset.id] || [];
              const histList = root.querySelector('#hist-comp-list');
              hist.sort((a,b) => b.compDate.localeCompare(a.compDate));
              histList.innerHTML = hist.map(h => `
                  <div style="padding:15px; border-bottom:1px solid #f1f5f9; background:#f8fafc; border-radius:8px; margin-bottom:8px;">
                      <div style="font-weight:bold; color:#0f172a; font-size:15px;">${escapeHTML(h.compName)}</div>
                      <div style="display:flex; justify-content:space-between; margin-top:6px;">
                         <span style="font-size:13px; color:#64748b;">📅 ${escapeHTML(h.compDate)}</span>
                         <span style="background:#e0e7ff; color:#1d4ed8; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:bold;">🏷️ ${escapeHTML(h.role)}</span>
                      </div>
                  </div>
              `).join('');
              root.querySelector('#dlg-hist-comp').showModal();
          }
      });
  }
  
  await refresh();
}