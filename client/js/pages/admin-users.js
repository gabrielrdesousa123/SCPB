// client/js/pages/admin-users.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, updateDoc, addDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { canViewPage } from '../permissions.js';

export async function renderAdminUsers(root) {
  if (!canViewPage('gestao')) {
      root.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444; font-weight: bold;">
        Acesso Negado. Você não tem permissão para gerir utilizadores.
      </div>`;
      return;
  }

  root.innerHTML = `<div style="padding: 40px; text-align: center;">A carregar utilizadores...</div>`;

  let refereesList = [];
  let usersList = [];

  async function loadData() {
    try {
      const snapUsers = await getDocs(collection(db, "users"));
      usersList = snapUsers.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const snapRefs = await getDocs(collection(db, "referees"));
      refereesList = snapRefs.docs.map(d => ({ id: d.id, ...d.data() }));

      usersList.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;
          return (a.nome_completo || '').localeCompare(b.nome_completo || '');
      });

      refereesList.sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || ''));

      render();
    } catch (e) {
      root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px; background:#fee2e2; color:#b91c1c;">Erro ao buscar dados. Você tem permissão de Admin?</div>`;
    }
  }

  function render() {
    const accessOptions = [
        { val: 'USER_1', label: 'Usuário (Apenas Leitura)' },
        { val: 'ADMIN_2', label: 'Admin II (Competição/Cadastro)' },
        { val: 'ADMIN_1', label: 'Admin I (Quase Tudo)' },
        { val: 'ADMIN_GERAL', label: 'Admin Total' }
    ];

    const rows = usersList.map(u => {
      const isPending = u.status === 'pending';
      const statusBadge = isPending 
        ? `<span style="background:#fef08a; color:#854d0e; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Aguardando</span>`
        : u.status === 'approved' 
          ? `<span style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Aprovado</span>`
          : `<span style="background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Negado</span>`;

      const currentAccess = u.global_role || 'USER_1';
      const linkedRefId = u.referee_id || ''; 

      let refOptionsHTML = `<option value="NONE" ${!linkedRefId ? 'selected' : ''}>Nenhum (Não é árbitro)</option>`;
      refOptionsHTML += `<option value="CREATE_NEW" style="font-weight:bold; color:#16a34a;">➕ Criar Novo Oficial</option>`;
      
      refereesList.forEach(ref => {
          const isSelected = linkedRefId === ref.id ? 'selected' : '';
          const isTaken = ref.uid && ref.uid !== u.id ? true : false;
          const takenText = isTaken ? ' (⚠️ Vinculado a outro)' : '';
          refOptionsHTML += `<option value="${ref.id}" ${isSelected}>${ref.nome_completo}${takenText}</option>`;
      });

      return `
        <tr style="border-bottom: 1px solid #eee; background: ${isPending ? '#fffbeb' : '#fff'};">
          <td style="padding: 12px;">
            <div style="display:flex; flex-direction:column; gap:4px;">
                <strong style="font-size:15px;">${u.nome_completo || 'Sem Nome'}</strong>
                <div style="display:flex; gap:8px; margin-top:4px;">
                    <button class="btn-edit-user" data-uid="${u.id}" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; color:#0f172a; display:flex; align-items:center; gap:4px;">
                        ✏️ Editar Perfil
                    </button>
                    <button class="btn-pwd-user" data-email="${u.email}" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; color:#0f172a; display:flex; align-items:center; gap:4px;">
                        🔑 Enviar Senha
                    </button>
                </div>
            </div>
            <div style="margin-top:8px; font-size:12px; color:#64748b;">
                📧 ${u.email || 'Sem Email'} <br>
                👤 CPF: ${u.cpf || '-'} | RG: ${u.rg || '-'}<br>
                📍 Local: ${u.uf || u.estado || '-'}
            </div>
          </td>
          <td style="padding: 12px; text-align: center;">${statusBadge}</td>
          
          <td style="padding: 12px;">
             <select class="global-role-sel form-select form-select-sm" data-uid="${u.id}" style="width: 100%; padding:6px; border-radius:6px; border:1px solid #cbd5e1; font-size:13px; font-weight:bold; color:#0f172a;">
                ${accessOptions.map(r => `<option value="${r.val}" ${currentAccess === r.val ? 'selected' : ''}>${r.label}</option>`).join('')}
             </select>
          </td>

          <td style="padding: 12px;">
             <select class="ref-link-sel form-select form-select-sm" data-uid="${u.id}" style="width: 100%; padding:6px; border-radius:6px; border:1px solid #cbd5e1; font-size:13px;">
                ${refOptionsHTML}
             </select>
             ${linkedRefId ? `<div style="font-size:10px; color:#16a34a; margin-top:2px;">✓ Vinculado</div>` : ''}
          </td>

          <td style="padding: 12px; text-align: right; white-space: nowrap;">
            ${isPending ? `
              <button class="btn btn-sm btn-approve" data-uid="${u.id}" style="background:#16a34a; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Aprovar</button>
              <button class="btn btn-sm btn-deny" data-uid="${u.id}" style="background:#ef4444; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-left:4px;">Negar</button>
            ` : `
              <button class="btn btn-sm btn-save-role" data-uid="${u.id}" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:4px;">💾 Salvar Config</button>
              ${u.status === 'approved' 
                ? `<button class="btn btn-sm btn-deny" data-uid="${u.id}" style="background:transparent; border:1px solid #ef4444; color:#ef4444; padding:5px 10px; border-radius:4px; cursor:pointer;">Suspender</button>` 
                : `<button class="btn btn-sm btn-approve" data-uid="${u.id}" style="background:transparent; border:1px solid #16a34a; color:#16a34a; padding:5px 10px; border-radius:4px; cursor:pointer;">Reativar</button>`
              }
            `}
          </td>
        </tr>
      `;
    }).join('');

    const styles = `
      <style>
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: none; justify-content: center; align-items: center; z-index: 9999; }
        .modal-overlay.active { display: flex; }
        .modal-content { background: white; width: 100%; max-width: 550px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; }
        .modal-header { padding: 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 20px; }
        .form-group { margin-bottom: 15px; text-align: left; }
        .form-group label { display:block; font-weight:bold; margin-bottom:5px; font-size:13px; color:#475569; }
        .form-input { width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing: border-box; font-size: 14px; }
        select.form-input { height: 40px; }
        .btn-primary { background: #0d6efd; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px; font-size: 15px;}
        .btn-primary:hover { background: #0b5ed7; }
      </style>
    `;

    root.innerHTML = `
      ${styles}
      <div style="max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
          <h2>Gestão de Acessos e Oficiais</h2>
          <button class="btn btn-outline-secondary" onclick="window.history.back()">← Voltar</button>
        </div>
        
        <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: visible;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
              <tr>
                <th style="padding: 12px; text-align: left;">Usuário (Perfil)</th>
                <th style="padding: 12px; text-align: center;">Status</th>
                <th style="padding: 12px; text-align: left; width: 200px;">Nível de Acesso</th>
                <th style="padding: 12px; text-align: left; width: 260px;">Oficial Vinculado</th>
                <th style="padding: 12px; text-align: right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum utilizador cadastrado.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-overlay" id="edit-user-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 style="margin:0; font-size:18px; color:#0f172a;">Editar Dados do Utilizador</h3>
            <button id="btn-close-edit-modal" style="background:none; border:none; font-size:28px; cursor:pointer; color:#64748b; line-height: 1;">&times;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="edit-uid">
            
            <div class="form-group">
                <label>Nome Completo</label>
                <input type="text" id="edit-nome" class="form-input">
            </div>
            
            <div style="display:flex; gap:15px;">
                <div class="form-group" style="flex:2;">
                    <label>Nome Abreviado (Para Grelhas)</label>
                    <input type="text" id="edit-nome-abrev" class="form-input" placeholder="Ex: João S.">
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Gênero</label>
                    <select id="edit-genero" class="form-input">
                        <option value="">N/A</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label>Email de Contato</label>
                <input type="email" id="edit-email" class="form-input">
            </div>
            
            <div style="display:flex; gap:15px;">
                <div class="form-group" style="flex:1;"><label>CPF</label><input type="text" id="edit-cpf" class="form-input"></div>
                <div class="form-group" style="flex:1;"><label>RG</label><input type="text" id="edit-rg" class="form-input"></div>
            </div>

            <div class="form-group">
                <label>Local de Origem (UF / Estado / Clube)</label>
                <input type="text" id="edit-uf" class="form-input" placeholder="Ex: SP / Clube Ande">
            </div>

            <button class="btn-primary" id="btn-save-edit-user">Salvar Alterações</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  async function processUserAction(uid, actionType) {
      const userDoc = usersList.find(u => u.id === uid);
      if (!userDoc) return;

      const accVal = root.querySelector(`select.global-role-sel[data-uid="${uid}"]`).value;
      const refLinkVal = root.querySelector(`select.ref-link-sel[data-uid="${uid}"]`).value;
      
      let finalRefereeId = userDoc.referee_id || null;

      try {
          if (refLinkVal === 'CREATE_NEW') {
              const newRef = {
                  nome_completo: userDoc.nome_completo,
                  nome_abreviado: userDoc.nome_abreviado || '',
                  uf: userDoc.uf || userDoc.estado || '',
                  nivel: 'Aspirante Regional',
                  uid: uid,
                  email: userDoc.email || ''
              };
              const docRef = await addDoc(collection(db, "referees"), newRef);
              finalRefereeId = docRef.id;
          } 
          else if (refLinkVal !== 'NONE' && refLinkVal !== '') {
              finalRefereeId = refLinkVal;
              const refObj = refereesList.find(r => r.id === finalRefereeId);
              
              // Tenta remover o vínculo do usuário antigo, mas ignora se ele já foi deletado
              if (refObj && refObj.uid && refObj.uid !== uid) {
                  try {
                      const oldUserRef = doc(db, "users", refObj.uid);
                      await updateDoc(oldUserRef, { referee_id: null });
                  } catch (e) {
                      console.warn("Usuário antigo não encontrado. Vínculo fantasma ignorado.");
                  }
              }

              // Tenta remover o vínculo do Oficial antigo que este usuário tinha
              if (userDoc.referee_id && userDoc.referee_id !== finalRefereeId) {
                  try {
                      const oldRefDoc = doc(db, "referees", userDoc.referee_id);
                      await updateDoc(oldRefDoc, { uid: null });
                  } catch (e) {
                      console.warn("Oficial antigo não encontrado. Ignorado.");
                  }
              }

              await updateDoc(doc(db, "referees", finalRefereeId), { uid: uid, email: userDoc.email });
          } 
          else if (refLinkVal === 'NONE') {
              if (finalRefereeId) {
                  try {
                      await updateDoc(doc(db, "referees", finalRefereeId), { uid: null });
                  } catch (e) {}
              }
              finalRefereeId = null;
          }

          const updates = { 
              global_role: accVal,
              referee_id: finalRefereeId
          };

          if (actionType === 'APPROVE') updates.status = 'approved';
          if (actionType === 'REJECT') updates.status = 'rejected';

          await updateDoc(doc(db, "users", uid), updates);

          if (actionType === 'APPROVE') window.__toast?.("Utilizador aprovado e configurado!", "success");
          else if (actionType === 'SAVE') window.__toast?.("Permissões e Vínculo atualizados!", "success");
          else window.__toast?.("Acesso bloqueado.", "error");

          loadData(); 
      } catch (err) {
          console.error(err);
          window.__toast?.("Erro ao salvar: " + err.message, "error");
      }
  }

  function bindEvents() {
    root.querySelectorAll('.btn-approve').forEach(btn => {
      btn.onclick = () => processUserAction(btn.dataset.uid, 'APPROVE');
    });

    root.querySelectorAll('.btn-deny').forEach(btn => {
      btn.onclick = async () => {
        if(confirm('Tem certeza que deseja bloquear/suspender este utilizador do sistema?')) {
            processUserAction(btn.dataset.uid, 'REJECT');
        }
      };
    });

    root.querySelectorAll('.btn-save-role').forEach(btn => {
      btn.onclick = () => processUserAction(btn.dataset.uid, 'SAVE');
    });

    const auth = getAuth();
    root.querySelectorAll('.btn-pwd-user').forEach(btn => {
        btn.onclick = () => {
            const email = btn.dataset.email;
            if(!email || email === 'Sem Email') return alert("Utilizador sem e-mail cadastrado.");
            if(confirm(`Enviar e-mail de recuperação de senha para ${email}?`)) {
                sendPasswordResetEmail(auth, email).then(() => {
                    window.__toast?.("E-mail de recuperação enviado com sucesso!", "success");
                }).catch(err => {
                    alert("Erro ao enviar e-mail: " + err.message);
                });
            }
        };
    });

    const modal = root.querySelector('#edit-user-modal');
    
    root.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.onclick = () => {
            const uid = btn.dataset.uid;
            const u = usersList.find(x => x.id === uid);
            if(!u) return;

            root.querySelector('#edit-uid').value = u.id;
            root.querySelector('#edit-nome').value = u.nome_completo || u.nome || '';
            root.querySelector('#edit-nome-abrev').value = u.nome_abreviado || '';
            root.querySelector('#edit-genero').value = u.genero || '';
            root.querySelector('#edit-email').value = u.email || '';
            root.querySelector('#edit-cpf').value = u.cpf || '';
            root.querySelector('#edit-rg').value = u.rg || '';
            root.querySelector('#edit-uf').value = u.uf || u.estado || '';
            
            modal.classList.add('active');
        };
    });

    root.querySelector('#btn-close-edit-modal').onclick = () => modal.classList.remove('active');

    root.querySelector('#btn-save-edit-user').onclick = async () => {
        const btnSave = root.querySelector('#btn-save-edit-user');
        const uid = root.querySelector('#edit-uid').value;
        
        const nome = root.querySelector('#edit-nome').value.trim();
        const nomeAbrev = root.querySelector('#edit-nome-abrev').value.trim();
        const genero = root.querySelector('#edit-genero').value;
        const email = root.querySelector('#edit-email').value.trim();
        const cpf = root.querySelector('#edit-cpf').value.trim();
        const rg = root.querySelector('#edit-rg').value.trim();
        const uf = root.querySelector('#edit-uf').value.trim();

        if(!nome) return alert("O Nome Completo é obrigatório.");

        btnSave.disabled = true; btnSave.textContent = "A salvar...";

        try {
            await updateDoc(doc(db, "users", uid), {
                nome_completo: nome,
                nome: nome,
                nome_abreviado: nomeAbrev,
                genero: genero,
                email: email, 
                cpf: cpf,
                rg: rg,
                uf: uf,
                estado: uf
            });

            const u = usersList.find(x => x.id === uid);
            if (u && u.referee_id) {
                try {
                    await updateDoc(doc(db, "referees", u.referee_id), {
                        nome_completo: nome,
                        nome: nome,
                        nome_abreviado: nomeAbrev,
                        email: email,
                        uf: uf,
                        estado: uf
                    });
                } catch(e) {
                    console.warn("Não conseguiu atualizar o oficial linkado (talvez apagado).");
                }
            }

            window.__toast?.("Dados do utilizador atualizados!", "success");
            modal.classList.remove('active');
            loadData();
        } catch(e) {
            alert("Erro ao salvar: " + e.message);
            btnSave.disabled = false; btnSave.textContent = "Salvar Alterações";
        }
    };
  }

  loadData();
}