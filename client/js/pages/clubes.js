// client/js/pages/clubes.js

import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// 🔥 IMPORTAÇÃO DO CÉREBRO
import { canEditGlobal } from '../permissions.js';

let state = { all: [], editingId: null, sortKey: 'nome', sortDir: 'asc' };

// 🔥 LISTAS DE UNIFORMIZAÇÃO
const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO","EXT"];
const REGIOES_LIST = ["Centro-Oeste", "Leste", "Nordeste", "Norte", "Sudeste", "Sul", "Exterior"];

export async function renderClubes(root) {
  const canEdit = canEditGlobal('clubes');

  root.innerHTML = `
    <style>
      .logo-preview-box {
        width: 120px; height: 80px; border: 2px dashed #cbd5e1; border-radius: 8px;
        display: flex; align-items: center; justify-content: center; background: #f8fafc;
        overflow: hidden; position: relative; cursor: pointer; transition: 0.2s; margin-top: 5px;
      }
      .logo-preview-box:hover { border-color: #3b82f6; background: #eff6ff; }
      .logo-preview-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .logo-preview-text { font-size: 11px; color: #64748b; text-align: center; padding: 5px; font-weight: bold; }
    </style>

    <section class="page" style="padding: 20px; max-width: 1100px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
        <h1 style="margin: 0; color: #0f172a;">Gestão • Clubes</h1>
        ${canEdit ? `<button id="btn-novo-clube" style="background:#16a34a; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:bold; cursor:pointer;">+ Novo Clube</button>` : ''}
      </div>

      <div class="table-wrap" style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <table class="data-table" aria-describedby="clubes-total" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
          <thead style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
            <tr>
              <th style="width: 80px; text-align:center; padding: 12px;">Logo</th>
              <th data-key="nome"  class="sortable" scope="col" style="padding: 12px; cursor: pointer;">Nome do Clube</th>
              <th data-key="sigla" class="sortable" scope="col" style="padding: 12px; cursor: pointer;">Sigla</th>
              <th data-key="uf"    class="sortable" scope="col" style="padding: 12px; cursor: pointer;">UF</th>
              <th data-key="regiao"class="sortable" scope="col" style="padding: 12px; cursor: pointer;">Região</th>
              ${canEdit ? '<th style="width: 180px; text-align:right; padding: 12px;">Ações</th>' : ''}
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <p id="clubes-total" style="margin-top:10px; color: #64748b; font-size: 13px; font-weight: bold;"></p>
    </section>

    <dialog id="dlg-clube" style="border: none; border-radius: 12px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); width: 90%; max-width: 600px;">
      <h3 id="dlg-title" style="margin-top: 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">Novo Clube</h3>
      
      <form id="formClube">
        <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px; margin-top: 15px;">
          
          <div>
              <label style="display:block; font-weight:bold; font-size:13px; color:#475569;">Logo / Bandeira</label>
              <div class="logo-preview-box" id="logoPreviewContainer" title="Clique para enviar logo">
                  <span class="logo-preview-text" id="logoPreviewText">Clique p/ Enviar<br>(Máx 230x150)</span>
                  <img id="logoPreviewImg" style="display: none;" src="" alt="Preview da Logo">
              </div>
              <input type="file" id="fLogo" accept="image/png, image/jpeg, image/webp" style="display: none;">
              <input type="hidden" id="fLogoBase64">
          </div>
          
          <div style="flex: 1; display: flex; flex-direction: column; gap: 15px;">
              <div>
                <label style="display:block; font-weight:bold; font-size:13px; color:#475569; margin-bottom:5px;">Nome Completo do Clube *</label>
                <input type="text" id="fNome" required minlength="2" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing: border-box;">
              </div>
              
              <div style="display: flex; gap: 15px;">
                <div style="flex: 1;">
                  <label style="display:block; font-weight:bold; font-size:13px; color:#475569; margin-bottom:5px;">Sigla *</label>
                  <input type="text" id="fSigla" maxlength="4" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing: border-box; text-transform: uppercase;" required>
                </div>
                <div style="flex: 1;">
                  <label style="display:block; font-weight:bold; font-size:13px; color:#475569; margin-bottom:5px;">Estado (UF) *</label>
                  <select id="fUF" required style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing: border-box; background: white;">
                      <option value="">Selecione...</option>
                      ${UF_LIST.map(uf => `<option value="${uf}">${uf}</option>`).join("")}
                  </select>
                </div>
              </div>

              <div>
                <label style="display:block; font-weight:bold; font-size:13px; color:#475569; margin-bottom:5px;">Região Esportiva *</label>
                <select id="fRegiao" required style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing: border-box; background: white;">
                    <option value="">Selecione a região...</option>
                    ${REGIOES_LIST.map(r => `<option value="${r}">${r}</option>`).join("")}
                </select>
              </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
          <button type="button" id="btnCancel" style="background: transparent; border: 1px solid #94a3b8; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569;">Cancelar</button>
          <button type="submit" id="btnSubmit" style="background: #16a34a; color: white; border: none; padding: 10px 25px; border-radius: 6px; cursor: pointer; font-weight: bold;">Salvar Clube</button>
        </div>
      </form>
    </dialog>
  `;
  
  await attachClubesHandlers(root, canEdit);
}

function cmp(a,b,key){
  const av = a[key], bv = b[key];
  const na = typeof av==='number' || (/^\d+(\.\d+)?$/.test(String(av)));
  const nb = typeof bv==='number' || (/^\d+(\.\d+)?$/.test(String(bv)));
  if (na && nb) return Number(av) - Number(bv);
  return String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR', { sensitivity:'base' });
}

async function attachClubesHandlers(root, canEdit) {
  const tbody = root.querySelector('.data-table tbody');
  const thead = root.querySelector('thead');
  const totalEl = root.querySelector('#clubes-total');
  
  const dlg = root.querySelector('#dlg-clube');
  const form = root.querySelector('#formClube');
  const dlgTitle = root.querySelector('#dlg-title');
  
  const inNome = root.querySelector('#fNome');
  const inSigla = root.querySelector('#fSigla');
  const inUf = root.querySelector('#fUF');
  const inRegiao = root.querySelector('#fRegiao');
  const btnSubmit = root.querySelector('#btnSubmit');
  const btnCancel = root.querySelector('#btnCancel');
  const btnNovo = root.querySelector('#btn-novo-clube');

  // Elementos da Logo
  const logoContainer = root.querySelector('#logoPreviewContainer');
  const fLogoInput = root.querySelector('#fLogo');
  const logoPreviewImg = root.querySelector('#logoPreviewImg');
  const logoPreviewText = root.querySelector('#logoPreviewText');
  const fLogoBase64 = root.querySelector('#fLogoBase64');

  const clubesRef = collection(db, "clubes");

  const refresh = async () => {
    try {
      const snapshot = await getDocs(clubesRef);
      state.all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      paint();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:red; padding: 20px; text-align: center;">Erro ao carregar clubes: ${e.message}</td></tr>`;
      totalEl.textContent = '';
    }
  };

  function paint(){
    const arr = [...state.all].sort((a,b)=>{
      const r = cmp(a,b,state.sortKey);
      return state.sortDir==='asc' ? r : -r;
    });
    
    tbody.innerHTML = arr.map(clube => {
      // Renderiza a logo na tabela a partir da string Base64
      const logoHtml = clube.logo_url 
          ? `<img src="${clube.logo_url}" style="max-width:50px; max-height:35px; object-fit:contain; border-radius:4px;">`
          : `<div style="width:40px; height:30px; background:#f1f5f9; border-radius:4px; display:inline-block; border: 1px dashed #cbd5e1;"></div>`;

      return `
      <tr data-id="${clube.id}" style="border-bottom: 1px solid #f1f5f9;">
        <td style="text-align:center; vertical-align:middle; padding: 10px;">${logoHtml}</td>
        <td style="font-weight:bold; color:#0f172a; vertical-align:middle; padding: 10px;">${escapeHtml(clube.nome)}</td>
        <td style="font-weight:bold; color:#475569; vertical-align:middle; padding: 10px;">${escapeHtml(clube.sigla || '—')}</td>
        <td style="vertical-align:middle; padding: 10px;"><span style="background:#e2e8f0; color:#334155; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:bold;">${escapeHtml(clube.uf || '—')}</span></td>
        <td style="vertical-align:middle; padding: 10px; color: #475569;">${escapeHtml(clube.regiao || '—')}</td>
        ${canEdit ? `
        <td style="text-align:right; vertical-align:middle; padding: 10px;">
            <button data-act="edit" data-id="${clube.id}" style="background:transparent; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; color:#475569; margin-right:5px; transition: 0.2s;">✏️ Editar</button>
            <button data-act="del" data-id="${clube.id}" style="background:transparent; border:1px solid #fca5a5; color:#ef4444; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; transition: 0.2s;">🗑️ Excluir</button>
        </td>` : ''}
      </tr>
      `;
    }).join('');
    
    thead.querySelectorAll('th.sortable').forEach(th => {
        th.removeAttribute('aria-sort');
        th.innerHTML = th.innerHTML.replace(' ▼', '').replace(' ▲', ''); // Limpa setinhas antigas
    });
    
    const th = thead.querySelector(`th[data-key="${state.sortKey}"]`);
    if (th) {
        th.setAttribute('aria-sort', state.sortDir==='asc' ? 'ascending' : 'descending');
        th.innerHTML += state.sortDir==='asc' ? ' ▲' : ' ▼'; // Adiciona setinha
    }

    totalEl.textContent = `Total de clubes cadastrados: ${arr.length}`;
  }

  thead.addEventListener('click', (e)=>{
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const key = th.dataset.key;
    if (state.sortKey === key) state.sortDir = state.sortDir==='asc' ? 'desc' : 'asc';
    else { state.sortKey = key; state.sortDir = 'asc'; }
    paint();
  });

  if (canEdit) {
      // Abre Modal para Novo Clube
      if (btnNovo) {
          btnNovo.addEventListener('click', () => {
              resetForm();
              dlgTitle.textContent = "Cadastrar Novo Clube";
              btnSubmit.textContent = "Adicionar Clube";
              btnSubmit.style.background = "#16a34a";
              dlg.showModal();
          });
      }

      // Fecha Modal
      btnCancel.addEventListener('click', () => {
          dlg.close();
      });

      // Lógica de Processamento da Imagem
      logoContainer.addEventListener('click', () => fLogoInput.click());

      fLogoInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                  const MAX_WIDTH = 230;
                  const MAX_HEIGHT = 150;
                  let width = img.width;
                  let height = img.height;

                  if (width > height) {
                      if (width > MAX_WIDTH) {
                          height *= MAX_WIDTH / width;
                          width = MAX_WIDTH;
                      }
                  } else {
                      if (height > MAX_HEIGHT) {
                          width *= MAX_HEIGHT / height;
                          height = MAX_HEIGHT;
                      }
                  }

                  const canvas = document.createElement('canvas');
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  
                  ctx.clearRect(0, 0, width, height);
                  ctx.drawImage(img, 0, 0, width, height);

                  const dataUrl = canvas.toDataURL('image/png');
                  
                  fLogoBase64.value = dataUrl;
                  logoPreviewImg.src = dataUrl;
                  logoPreviewImg.style.display = 'block';
                  logoPreviewText.style.display = 'none';
              };
              img.src = event.target.result;
          };
          reader.readAsDataURL(file);
      });

      const resetForm = () => {
        form.reset();
        state.editingId = null;
        fLogoBase64.value = '';
        logoPreviewImg.src = '';
        logoPreviewImg.style.display = 'none';
        logoPreviewText.style.display = 'block';
      };

      // Salva no Firebase
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Salvando...";

        try {
          const siglaText = inSigla.value.trim().toUpperCase();
          const docId = state.editingId || `CLUB_${Date.now()}`;

          const body = {
            nome: inNome.value.trim(),
            sigla: siglaText,
            uf: inUf.value,
            regiao: inRegiao.value,
          };

          if (fLogoBase64.value) {
              body.logo_url = fLogoBase64.value;
          }
          
          if (state.editingId) {
            const clubeDoc = doc(db, "clubes", state.editingId);
            await updateDoc(clubeDoc, body);
            window.__toast?.('Clube atualizado com sucesso.', 'success');
          } else {
            const clubeDoc = doc(db, "clubes", docId);
            await setDoc(clubeDoc, body);
            window.__toast?.('Clube criado com sucesso.', 'success');
          }
          
          dlg.close();
          await refresh();
        } catch (err) { 
            alert(`Erro ao salvar: ${err.message}`); 
            console.error(err);
        } finally {
            btnSubmit.disabled = false;
        }
      });

      // Botões de Ação na Tabela (Editar e Excluir)
      tbody.addEventListener('click', async e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const { act, id } = btn.dataset;

        if (act === 'edit') {
          const clube = state.all.find(c => c.id == id);
          if (!clube) return;
          
          resetForm();
          state.editingId = id;
          dlgTitle.textContent = "Editar Clube";
          btnSubmit.textContent = "Salvar Alterações";
          btnSubmit.style.background = "#3b82f6";
          
          inNome.value = clube.nome || '';
          inSigla.value = clube.sigla || '';
          
          if (clube.logo_url) {
              logoPreviewImg.src = clube.logo_url;
              logoPreviewImg.style.display = 'block';
              logoPreviewText.style.display = 'none';
          } 
          
          if (UF_LIST.includes(clube.uf)) {
              inUf.value = clube.uf;
          } else {
              inUf.value = ''; 
          }

          if (REGIOES_LIST.includes(clube.regiao)) {
              inRegiao.value = clube.regiao;
          } else {
              if (clube.regiao) {
                  const opt = document.createElement('option');
                  opt.value = clube.regiao;
                  opt.textContent = `${clube.regiao} (Legado - Atualize!)`;
                  inRegiao.appendChild(opt);
                  inRegiao.value = clube.regiao;
              } else {
                  inRegiao.value = '';
              }
          }
          
          dlg.showModal();
        }
        
        if (act === 'del') {
          if (!confirm(`Tem certeza que deseja excluir o clube? Os atletas atrelados a ele ficarão sem clube e sem bandeira.`)) return;
          try {
            const clubeDoc = doc(db, "clubes", id);
            await deleteDoc(clubeDoc);
            window.__toast?.('Clube excluído.', 'success');
            await refresh();
          } catch (err) { alert(`Erro: ${err.message}`); }
        }
      });
  }

  await refresh();
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}