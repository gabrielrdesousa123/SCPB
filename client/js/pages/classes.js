// client/js/pages/classes.js

import { db } from '../firebase-config.js';
import { collection, getDocs, setDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// 🔥 IMPORTAÇÃO DO CÉREBRO
import { canEditGlobal } from '../permissions.js';

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) {
    alert(msg);
    return;
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

async function apiListClasses() {
  try {
    const snapshot = await getDocs(collection(db, "classes"));
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    items.sort((a, b) => {
        const codA = String(a.codigo || a.code || '').toUpperCase();
        const codB = String(b.codigo || b.code || '').toUpperCase();
        return codA.localeCompare(codB);
    });

    return { items }; 
  } catch (error) {
    throw new Error(error.message);
  }
}

async function apiSaveClass(id, payload) {
  try {
    const docId = id ? id : payload.codigo;
    const docRef = doc(db, "classes", docId);
    await setDoc(docRef, payload, { merge: true });
    return { success: true, id: docId };
  } catch (error) {
    throw new Error(error.message);
  }
}

async function apiDeleteClass(id) {
  try {
    await deleteDoc(doc(db, "classes", id));
    return { success: true };
  } catch (error) {
    throw new Error(error.message);
  }
}

function formatGender(g) {
  if (!g) return '';
  if (g === 'M') return '♂ Masculino';
  if (g === 'F') return '♀ Feminino';
  if (g === 'MF') return '⚥ Misto';
  return g;
}

export async function renderClasses(root) {
  // 🔥 VERIFICA SE PODE EDITAR
  const canEdit = canEditGlobal('classes');

  root.innerHTML = `
    <section>
      <h2>Classes</h2>

      <div class="toolbar" style="margin-bottom: 12px;">
        ${canEdit ? '<button class="btn" id="btnNovaClasse" style="background:#16a34a; color:white; border:none; font-weight:bold;">Nova classe</button>' : ''}
        <button class="btn ghostbtn" id="btnRecarregar" style="${canEdit ? 'margin-left: 8px;' : ''}">🔄 Recarregar</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Grupo</th>
            <th>Base BIB</th>
            <th>Gênero</th>
            <th>Cor fundo</th>
            <th>Cor texto</th>
            <th>Tempo partida</th>
            <th>Tempo parcial</th>
            <th>Parciais</th>
            ${canEdit ? '<th>Ações</th>' : ''}
          </tr>
        </thead>
        <tbody id="classesTbody">
          <tr><td colspan="${canEdit ? '11' : '10'}">Carregando...</td></tr>
        </tbody>
      </table>

      ${canEdit ? `
      <dialog id="dlgClasse" style="border:none; border-radius:12px; padding:0; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); max-width:600px; width:100%;">
        <form id="formClasse" style="padding:25px;">
          <h3 style="margin-top:0; color:#0f172a; border-bottom:2px solid #e2e8f0; padding-bottom:10px;">Configuração da Classe</h3>
          
          <div class="toolbar" style="flex-direction:column; align-items:stretch; gap:12px;">
            <div style="display:flex; gap:10px;">
                <label style="flex:1;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Código</span><br>
                  <input type="text" id="fldCodigo" required style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
                </label>
                <label style="flex:2;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Nome</span><br>
                  <input type="text" id="fldNome" required style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
                </label>
            </div>
            
            <div style="display:flex; gap:10px;">
                <label style="flex:2;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Grupo de Classe (Sub-Classes)</span><br>
                  <input type="text" id="fldClassGroup" placeholder="Ex: BC1, BC2, BC3, BC4" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
                </label>
                <label style="flex:1;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Base Padrão BIB</span><br>
                  <input type="text" id="fldBibBase" placeholder="Ex: 100, A-1100" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
                </label>
            </div>

            <label>
              <span style="font-weight:bold; font-size:12px; color:#475569;">Gênero</span><br>
              <select id="fldGenders" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                <option value="">-- Selecione --</option>
                <option value="M">♂ Masculino</option>
                <option value="F">♀ Feminino</option>
                <option value="MF">⚥ Misto</option>
              </select>
            </label>
            
            <div style="display:flex; gap:15px; background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
                <label style="flex:1;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Cor de Fundo</span><br>
                  <div style="display:flex; gap:5px; align-items:center; margin-top:5px;">
                      <input type="color" id="fldBgColor" value="#000000" style="width:40px; height:36px; padding:0; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;" />
                      <input type="text" id="fldBg" placeholder="#000000" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; text-transform:uppercase;" />
                  </div>
                </label>
                <label style="flex:1;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Cor do Texto</span><br>
                  <div style="display:flex; gap:5px; align-items:center; margin-top:5px;">
                      <input type="color" id="fldFgColor" value="#ffffff" style="width:40px; height:36px; padding:0; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;" />
                      <input type="text" id="fldFg" placeholder="#FFFFFF" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; text-transform:uppercase;" />
                  </div>
                </label>
            </div>

            <div style="display:flex; gap:10px;">
                <label style="flex:1;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Partida (MM:SS)</span><br>
                  <input type="text" id="fldMatchTime" placeholder="50:00" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
                </label>
                <label style="flex:1;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Parcial (MM:SS)</span><br>
                  <input type="text" id="fldTurnTime" placeholder="04:30" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
                </label>
                <label style="flex:1;">
                  <span style="font-weight:bold; font-size:12px; color:#475569;">Qtd. Parciais</span><br>
                  <input type="number" id="fldEnds" min="0" step="1" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
                </label>
            </div>
          </div>
          <menu style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end; border-top:1px solid #e2e8f0; padding-top:15px; padding-right:0;">
            <button type="button" class="btn ghostbtn" id="btnCancelar">Cancelar</button>
            <button type="submit" class="btn" id="btnSalvar" style="background:#3b82f6; color:white; border:none; font-weight:bold;">💾 Salvar Classe</button>
          </menu>
        </form>
      </dialog>` : ''}
    </section>
  `;

  const tbody = root.querySelector('#classesTbody');
  const btnRecarregar = root.querySelector('#btnRecarregar');
  
  let dlg, form, fldCodigo, fldNome, fldClassGroup, fldBibBase, fldGenders, fldBg, fldBgColor, fldFg, fldFgColor, fldMatchTime, fldTurnTime, fldEnds, btnCancelar, btnNova;
  
  let editingId = null;

  if (canEdit) {
      dlg = root.querySelector('#dlgClasse');
      form = root.querySelector('#formClasse');
      btnNova = root.querySelector('#btnNovaClasse');
      btnCancelar = root.querySelector('#btnCancelar');

      fldCodigo = root.querySelector('#fldCodigo');
      fldNome = root.querySelector('#fldNome');
      fldClassGroup = root.querySelector('#fldClassGroup');
      fldBibBase = root.querySelector('#fldBibBase');
      fldGenders = root.querySelector('#fldGenders');
      fldBg = root.querySelector('#fldBg');
      fldBgColor = root.querySelector('#fldBgColor');
      fldFg = root.querySelector('#fldFg');
      fldFgColor = root.querySelector('#fldFgColor');
      fldMatchTime = root.querySelector('#fldMatchTime');
      fldTurnTime = root.querySelector('#fldTurnTime');
      fldEnds = root.querySelector('#fldEnds');

      fldBgColor.addEventListener('input', (e) => fldBg.value = e.target.value.toUpperCase());
      fldBg.addEventListener('input', (e) => {
          let val = e.target.value;
          if (!val.startsWith('#')) val = '#' + val;
          if (/^#[0-9A-F]{6}$/i.test(val)) fldBgColor.value = val;
      });

      fldFgColor.addEventListener('input', (e) => fldFg.value = e.target.value.toUpperCase());
      fldFg.addEventListener('input', (e) => {
          let val = e.target.value;
          if (!val.startsWith('#')) val = '#' + val;
          if (/^#[0-9A-F]{6}$/i.test(val)) fldFgColor.value = val;
      });
      
      btnNova.addEventListener('click', () => {
          editingId = null;
          fldCodigo.value = ''; fldCodigo.disabled = false;
          fldNome.value = ''; fldClassGroup.value = ''; fldBibBase.value = '';
          fldGenders.value = ''; 
          
          fldBg.value = '#000000'; fldBgColor.value = '#000000'; 
          fldFg.value = '#FFFFFF'; fldFgColor.value = '#ffffff';
          
          fldMatchTime.value = ''; fldTurnTime.value = ''; fldEnds.value = '';
          dlg.showModal();
      });

      btnCancelar.addEventListener('click', () => dlg.close());

      form.addEventListener('submit', async (ev) => {
          ev.preventDefault();

          const codigo = fldCodigo.value.trim();
          const nome = fldNome.value.trim();

          if (!codigo || !nome) {
            showToast('Preencha código e nome.'); return;
          }

          let finalBg = fldBg.value.trim();
          if (finalBg && !finalBg.startsWith('#')) finalBg = '#' + finalBg;
          
          let finalFg = fldFg.value.trim();
          if (finalFg && !finalFg.startsWith('#')) finalFg = '#' + finalFg;

          const payload = {
            codigo: codigo,
            code: codigo,
            nome: nome,
            name: nome,
            class_group: fldClassGroup.value.trim() || null,
            bib_base: fldBibBase.value.trim() || null,
            genders: fldGenders.value || null,
            ui_bg: finalBg || null,
            ui_fg: finalFg || null,
            match_time: fldMatchTime.value.trim() || null,
            turn_time: fldTurnTime.value.trim() || null,
            ends: fldEnds.value ? Number(fldEnds.value) : null,
          };

          const btnSalvar = root.querySelector('#btnSalvar');
          btnSalvar.disabled = true; btnSalvar.textContent = "Salvando...";

          try {
            await apiSaveClass(editingId, payload);
            showToast('Classe salva com sucesso.');
            dlg.close();
            await carregar(); 
          } catch (err) {
            showToast('Erro ao salvar classe: ' + err.message);
          } finally {
            btnSalvar.disabled = false; btnSalvar.textContent = "💾 Salvar Classe";
          }
      });
  }

  async function carregar() {
    root.setAttribute('aria-busy', 'true');
    try {
      const data = await apiListClasses();
      const items = data.items || [];
      
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="${canEdit ? '11' : '10'}" style="text-align:center; padding: 20px;">Nenhuma classe cadastrada.</td></tr>`;
        return;
      }

      tbody.innerHTML = items
        .map((c) => {
          const bgPreview = c.ui_bg ? `<span style="display:inline-block;width:16px;height:16px;border-radius:4px;border:1px solid #ccc;background:${c.ui_bg};margin-right:6px;vertical-align:-3px;"></span><span style="font-size:12px;color:#64748b;">${c.ui_bg}</span>` : '';
          const fgPreview = c.ui_fg ? `<span style="display:inline-block;width:16px;height:16px;border-radius:4px;border:1px solid #ccc;background:${c.ui_fg};margin-right:6px;vertical-align:-3px;"></span><span style="font-size:12px;color:#64748b;">${c.ui_fg}</span>` : '';

          return `
            <tr data-id="${c.id}" data-codigo="${c.codigo || c.code || ''}">
              <td style="color:#0f172a;"><strong>${c.codigo || c.code || ''}</strong></td>
              <td style="color:#334155;">${c.nome || c.name || ''}</td>
              <td style="color:#64748b; font-size:13px;">${c.class_group || '-'}</td>
              <td style="font-weight:bold; color:#3b82f6;">${c.bib_base || '-'}</td>
              <td style="font-size:13px;">${formatGender(c.genders)}</td>
              <td>${bgPreview}</td>
              <td>${fgPreview}</td>
              <td style="font-size:13px; color:#475569;">${c.match_time || '-'}</td>
              <td style="font-size:13px; color:#475569;">${c.turn_time || '-'}</td>
              <td style="font-size:13px; font-weight:bold;">${c.ends ?? '-'}</td>
              ${canEdit ? `
              <td style="white-space: nowrap;">
                <button class="btn btn-sm" data-acao="editar" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">Editar</button>
                <button class="btn btn-sm danger" data-acao="excluir" style="margin-left:4px;">Excluir</button>
              </td>` : ''}
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="${canEdit ? '11' : '10'}" style="text-align:center; padding: 20px; color: red;">Erro: ${err.message}</td></tr>`;
    } finally {
      root.removeAttribute('aria-busy');
    }
  }

  btnRecarregar.addEventListener('click', () => carregar());

  if (canEdit) {
      tbody.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const acao = btn.dataset.acao;
        const tr = btn.closest('tr');
        
        const id = tr?.dataset.id;
        const codigo = tr?.dataset.codigo;
        if (!id) return;

        if (acao === 'editar') {
          const tds = tr.querySelectorAll('td');
          
          editingId = id; 
          fldCodigo.value = codigo; fldCodigo.disabled = true; 
          fldNome.value = tds[1].textContent.trim();
          fldClassGroup.value = tds[2].textContent.trim() !== '-' ? tds[2].textContent.trim() : '';
          fldBibBase.value = tds[3].textContent.trim() !== '-' ? tds[3].textContent.trim() : '';
          
          const genderText = tds[4].textContent.trim();
          if (genderText.includes('Masculino')) fldGenders.value = 'M';
          else if (genderText.includes('Feminino')) fldGenders.value = 'F';
          else if (genderText.includes('Misto')) fldGenders.value = 'MF';
          else fldGenders.value = '';

          const bgVal = tds[5].textContent.trim().match(/#[0-9a-fA-F]{6}/i)?.[0] || '#000000';
          fldBg.value = bgVal.toUpperCase(); fldBgColor.value = bgVal;

          const fgVal = tds[6].textContent.trim().match(/#[0-9a-fA-F]{6}/i)?.[0] || '#ffffff';
          fldFg.value = fgVal.toUpperCase(); fldFgColor.value = fgVal;

          fldMatchTime.value = tds[7].textContent.trim() !== '-' ? tds[7].textContent.trim() : '';
          fldTurnTime.value = tds[8].textContent.trim() !== '-' ? tds[8].textContent.trim() : '';
          fldEnds.value = tds[9].textContent.trim() !== '-' ? tds[9].textContent.trim() : '';

          dlg.showModal();
        }

        if (acao === 'excluir') {
          if (!confirm(`Tem certeza que deseja excluir permanentemente a classe "${codigo}"?`)) return;
          try {
            await apiDeleteClass(id); 
            showToast('Classe excluída com sucesso.');
            await carregar();
          } catch (err) {
            showToast('Erro ao excluir classe: ' + err.message);
          }
        }
      });
  }

  await carregar();
}