// client/js/pages/teams.js

import { db } from '../firebase-config.js';
import { collection, getDocs, setDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.style.background = type === 'error' ? '#ef4444' : (type === 'success' ? '#22c55e' : '#3b82f6');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function escapeHTML(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

const state = {
  teams: [],
  athletes: [],
  clubs: [],
  editingId: null,
  selectedAthletes: new Set()
};

const API = {
  fetchData: async () => {
    const [teamsSnap, athSnap, clubsSnap] = await Promise.all([
      getDocs(collection(db, "equipes")),
      getDocs(collection(db, "atletas")),
      getDocs(collection(db, "clubes"))
    ]);

    state.teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.athletes = athSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const clubsMap = {};
    clubsSnap.docs.forEach(d => { clubsMap[d.id] = d.data(); });
    state.clubs = clubsMap;
    
    // Anexa nome do clube e normaliza gênero no atleta para facilitar
    state.athletes = state.athletes.map(a => {
        const gen = String(a.genero || a.sexo || '').toUpperCase();
        return {
            ...a,
            clube_nome: clubsMap[a.clube_id]?.nome || 'Sem Clube',
            clube_sigla: clubsMap[a.clube_id]?.sigla || '',
            isMale: gen === 'M' || gen.startsWith('MAS'),
            isFemale: gen === 'F' || gen.startsWith('FEM')
        };
    });
  },
  saveTeam: async (payload) => {
    const docId = state.editingId || `TEAM_${Date.now()}`;
    await setDoc(doc(db, "equipes", docId), payload, { merge: true });
  },
  deleteTeam: async (id) => {
    await deleteDoc(doc(db, "equipes", id));
  }
};

export async function renderTeams(root) {
  root.innerHTML = `
    <section style="max-width: 1000px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0f172a;">Pares e Equipes</h2>
        <button class="btn btn-primary" id="btnNewTeam" style="background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">+ Novo Par / Equipe</button>
      </div>

      <div class="table-responsive" style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
          <thead style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
            <tr>
              <th style="padding: 12px 15px; color: #475569;">Nome</th>
              <th style="padding: 12px 15px; color: #475569;">Categoria</th>
              <th style="padding: 12px 15px; color: #475569;">Clube/Região</th>
              <th style="padding: 12px 15px; color: #475569;">Atletas</th>
              <th style="padding: 12px 15px; color: #475569; text-align: center;">Ações</th>
            </tr>
          </thead>
          <tbody id="teamsTbody">
            <tr><td colspan="5" style="text-align: center; padding: 20px;">Carregando...</td></tr>
          </tbody>
        </table>
      </div>

      <dialog id="modalTeam" style="width: 100%; max-width: 600px; border: none; border-radius: 12px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
        <form id="formTeam">
          <h3 id="modalTitle" style="margin-top: 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Nova Equipe / Par</h3>
          
          <div style="display: flex; gap: 15px; margin-top: 15px;">
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 5px;">Nome do Par/Equipe *</label>
                <input type="text" id="fNome" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px;" placeholder="Ex: Seleção Brasileira, ADDECE..." required>
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 5px;">Categoria *</label>
                <select id="fCategoria" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px;" required>
                    <option value="">Selecione...</option>
                    <option value="TEAM_BC1_BC2">Equipe BC1/BC2</option>
                    <option value="PAIR_BC3">Pares BC3</option>
                    <option value="PAIR_BC4">Pares BC4</option>
                </select>
              </div>
          </div>

          <div style="margin-top: 15px;">
              <label style="display: block; font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 5px;">Representação (Opcional)</label>
              <input type="text" id="fClube" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px;" placeholder="Sigla do Clube ou Estado">
          </div>

          <div style="margin-top: 25px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
              <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 14px; color: #0f172a;">👥 Seleção de Atletas</h4>
              <p id="ruleHint" style="font-size: 11px; color: #dc2626; font-weight: bold; margin-top: 0;">Selecione a categoria primeiro para ver as regras.</p>
              
              <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: white;" id="athletesList">
                  <div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 12px;">Selecione uma categoria para listar os atletas.</div>
              </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button type="button" id="btnCancelModal" style="background: transparent; border: 1px solid #94a3b8; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569;">Cancelar</button>
            <button type="submit" id="btnSaveTeam" style="background: #16a34a; color: white; border: none; padding: 10px 25px; border-radius: 6px; cursor: pointer; font-weight: bold;">💾 Salvar</button>
          </div>
        </form>
      </dialog>
    </section>
  `;

  const tbody = root.querySelector('#teamsTbody');
  const modal = root.querySelector('#modalTeam');
  const form = root.querySelector('#formTeam');
  const catSelect = root.querySelector('#fCategoria');
  const athletesList = root.querySelector('#athletesList');
  const ruleHint = root.querySelector('#ruleHint');

  async function load() {
    try {
      await API.fetchData();
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

    tbody.innerHTML = state.teams.map(t => {
      const athNames = (t.athletes || []).map(id => {
          const a = state.athletes.find(x => x.id === id);
          return a ? `${a.nome} (${a.classe_code})` : 'Desconhecido';
      }).join('<br>');

      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 15px; font-weight: bold; color: #0f172a;">${escapeHTML(t.name)}</td>
          <td style="padding: 12px 15px;"><span style="background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${catMap[t.category] || t.category}</span></td>
          <td style="padding: 12px 15px; color: #475569;">${escapeHTML(t.club_sigla)}</td>
          <td style="padding: 12px 15px; font-size: 12px; color: #475569; line-height: 1.4;">${athNames}</td>
          <td style="padding: 12px 15px; text-align: center; white-space: nowrap;">
            <button class="btn-edit" data-id="${t.id}" style="background: transparent; border: 1px solid #cbd5e1; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px;">✏️</button>
            <button class="btn-delete" data-id="${t.id}" style="background: transparent; border: 1px solid #fca5a5; color: #ef4444; padding: 5px 10px; border-radius: 4px; cursor: pointer;">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderAthleteCheckboxes() {
      const cat = catSelect.value;
      if (!cat) {
          athletesList.innerHTML = `<div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 12px;">Selecione uma categoria para listar os atletas.</div>`;
          ruleHint.textContent = "Selecione a categoria primeiro para ver as regras.";
          return;
      }

      let eligible = [];
      if (cat === 'TEAM_BC1_BC2') {
          ruleHint.textContent = "⚠️ REGRAS MUNDIAIS: Máximo 4 atletas. Obrigatório pelo menos 1 Homem, 1 Mulher e 1 atleta classe BC1.";
          eligible = state.athletes.filter(a => a.classe_code === 'BC1' || a.classe_code === 'BC2');
      } else if (cat === 'PAIR_BC3') {
          ruleHint.textContent = "⚠️ REGRAS MUNDIAIS: Máximo 3 atletas. Obrigatório pelo menos 1 Homem e 1 Mulher. Apenas BC3.";
          eligible = state.athletes.filter(a => a.classe_code === 'BC3');
      } else if (cat === 'PAIR_BC4') {
          ruleHint.textContent = "⚠️ REGRAS MUNDIAIS: Máximo 3 atletas. Obrigatório pelo menos 1 Homem e 1 Mulher. Apenas BC4.";
          eligible = state.athletes.filter(a => a.classe_code === 'BC4');
      }

      eligible.sort((a,b) => a.nome.localeCompare(b.nome));

      athletesList.innerHTML = eligible.map(a => {
          const isChecked = state.selectedAthletes.has(a.id) ? 'checked' : '';
          const genIcon = a.isMale ? '♂' : (a.isFemale ? '♀' : '⚥');
          const genColor = a.isMale ? '#3b82f6' : (a.isFemale ? '#ec4899' : '#64748b');
          
          return `
            <label style="display: flex; align-items: center; gap: 10px; padding: 10px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s;">
                <input type="checkbox" value="${a.id}" class="ath-check" ${isChecked} style="transform: scale(1.2);">
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <span style="font-size: 13px; font-weight: bold; color: #1e293b;">${escapeHTML(a.nome)}</span>
                    <span style="font-size: 11px; color: #64748b;">${escapeHTML(a.clube_sigla)}</span>
                </div>
                <span style="background: #e2e8f0; color: #334155; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${a.classe_code}</span>
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

  // VALIDADOR WORLD BOCCIA
  function validateWorldBocciaRules(cat, selectedIds) {
      if (selectedIds.length === 0) return "Você precisa selecionar atletas.";
      
      const selected = selectedIds.map(id => state.athletes.find(a => a.id === id));
      
      const hasMale = selected.some(a => a.isMale);
      const hasFemale = selected.some(a => a.isFemale);
      
      if (!hasMale || !hasFemale) return "A equipe/par obrigatoriamente deve ser MISTA (ter homens e mulheres).";

      if (cat === 'TEAM_BC1_BC2') {
          if (selected.length > 4) return "Equipes BC1/BC2 podem ter no máximo 4 atletas (3 titulares + 1 reserva).";
          const hasBC1 = selected.some(a => a.classe_code === 'BC1');
          if (!hasBC1) return "Equipes BC1/BC2 exigem obrigatoriamente pelo menos UM atleta da classe BC1.";
      } else {
          // Pares BC3 e BC4
          if (selected.length > 3) return "Pares podem ter no máximo 3 atletas (2 titulares + 1 reserva).";
      }

      return null; // Null significa aprovação
  }

  root.querySelector('#btnNewTeam').onclick = () => {
      state.editingId = null;
      state.selectedAthletes.clear();
      form.reset();
      root.querySelector('#modalTitle').textContent = 'Nova Equipe / Par';
      renderAthleteCheckboxes();
      modal.showModal();
  };

  root.querySelector('#btnCancelModal').onclick = () => modal.close();

  catSelect.addEventListener('change', () => {
      state.selectedAthletes.clear();
      renderAthleteCheckboxes();
  });

  form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = root.querySelector('#fNome').value.trim();
      const cat = catSelect.value;
      const club = root.querySelector('#fClube').value.trim();
      const athArray = Array.from(state.selectedAthletes);

      const errorMsg = validateWorldBocciaRules(cat, athArray);
      if (errorMsg) {
          showToast(errorMsg, 'error');
          return;
      }

      const payload = {
          name: name,
          nome: name,
          category: cat,
          club_sigla: club,
          athletes: athArray
      };

      const btn = root.querySelector('#btnSaveTeam');
      btn.disabled = true;
      btn.textContent = 'Salvando...';

      try {
          await API.saveTeam(payload);
          showToast('Salvo com sucesso!', 'success');
          modal.close();
          await load();
      } catch (err) {
          showToast('Erro ao salvar.', 'error');
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
              root.querySelector('#fNome').value = t.name || t.nome || '';
              catSelect.value = t.category || '';
              root.querySelector('#fClube').value = t.club_sigla || '';
              root.querySelector('#modalTitle').textContent = 'Editar Equipe / Par';
              renderAthleteCheckboxes();
              modal.showModal();
          }
      }

      if (btnDel) {
          if (confirm("Tem certeza que deseja excluir esta Equipe/Par?")) {
              await API.deleteTeam(btnDel.dataset.id);
              showToast("Excluído com sucesso.", "success");
              await load();
          }
      }
  });

  await load();
}

export default renderTeams;