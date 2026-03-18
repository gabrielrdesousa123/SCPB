// client/js/pages/draw-page.js

import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDocs, query } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { formatosA1 } from '../data/formatosA1.js';

const qs = (sel) => document.querySelector(sel);
const qsAll = (sel) => document.querySelectorAll(sel);
const escapeHTML = (s = '') => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const showToast = (msg, type = 'info') => {
  const t = qs('#toast') || document.createElement('div');
  t.id = 'toast'; t.className = `toast ${type} show`; t.textContent = msg;
  if (!t.parentNode) document.body.appendChild(t);
  setTimeout(() => t.classList.remove('show'), 3000);
};

function getRoundName(totalRounds, currentRoundIdx) {
  const roundsLeft = totalRounds - currentRoundIdx - 1;
  if (roundsLeft === 0) return "Final";
  if (roundsLeft === 1) return "Semi-Final";
  if (roundsLeft === 2) return "Quartas de Final";
  if (roundsLeft === 3) return "Oitavas de Final";
  if (roundsLeft === 4) return "16 avos de Final";
  return `Rodada ${currentRoundIdx + 1}`;
}

export async function renderDrawPage(root, params = {}) {
  let competitionId = params.competitionId;
  let classCode = params.classCode;

  if (!competitionId || !classCode) {
      const hash = window.location.hash;
      const qString = hash.includes('?') ? hash.split('?')[1] : '';
      const urlParams = new URLSearchParams(qString);
      
      if (!competitionId) competitionId = urlParams.get('id') || urlParams.get('comp_id');
      if (!classCode) classCode = urlParams.get('class');

      if (!competitionId || !classCode) {
          for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && key.startsWith('draw_athletes_')) {
                  const parts = key.replace('draw_athletes_', '').split('_');
                  if (parts.length >= 2) {
                      competitionId = parts[0];
                      classCode = parts.slice(1).join('_');
                      break;
                  }
              }
          }
      }
  }

  if (!competitionId || !classCode) {
    root.innerHTML = `<div class="alert alert-danger m-3">Dados inválidos.</div>`;
    return;
  }

  const exactKey = `draw_athletes_${competitionId}_${classCode}`;
  const rawState = sessionStorage.getItem(exactKey);
  if (!rawState) {
    root.innerHTML = `<div class="alert alert-danger m-3">Nenhum atleta selecionado. <button class="btn btn-primary" onclick="history.back()">Voltar</button></div>`;
    return;
  }

  const { athletesForDraw } = JSON.parse(rawState);
  if (!athletesForDraw || athletesForDraw.length === 0) {
    root.innerHTML = `<div class="alert alert-warning m-3">Lista vazia.</div>`;
    return;
  }

  const classCodeUp = classCode.toUpperCase();
  const isTeamEvent = classCodeUp.includes('PAR') || classCodeUp.includes('PAIR') || classCodeUp.includes('EQUIP') || classCodeUp.includes('TEAM');

  const state = {
    compId: competitionId, classCode: classCode, athletes: athletesForDraw,
    classConfig: null, bibBase: null, pools: [], koDraw: [], formatMode: 'GROUP'
  };

  let clubsMap = {};

  try {
    const [classSnap, clubSnap] = await Promise.all([
      getDocs(query(collection(db, "classes"))),
      getDocs(collection(db, "clubes"))
    ]);

    classSnap.forEach(doc => {
      const c = doc.data();
      if (c.codigo === classCode || c.code === classCode) {
         state.classConfig = c; state.bibBase = c.bib_base || null;
      }
    });

    clubSnap.forEach(doc => {
      const data = doc.data();
      clubsMap[doc.id] = { logo: data.logo_url || null, nome: data.nome || data.sigla, sigla: data.sigla || '' };
    });
  } catch(e) {}

  function generateBib(item, position) {
    if (state.bibBase) {
        const match = String(state.bibBase).match(/^(.*?)(\d+)$/);
        if (match) {
            return `${match[1]}${String(parseInt(match[2], 10) + position).padStart(match[2].length, '0')}`;
        }
        return `${state.bibBase}${String(position).padStart(2, '0')}`;
    }

    const pad2 = n => String(n).padStart(2, '0');
    if (isTeamEvent) {
        if (classCodeUp.includes('BC3')) return `3${pad2(position)}`;
        if (classCodeUp.includes('BC4')) return `4${pad2(position)}`;
        return `1${pad2(position)}`;
    }

    const g = String(item.genero || item.sexo || '').toUpperCase();
    const genderDigit = (g === 'F' || g.startsWith('FEM')) ? '1' : ((g === 'M' || g.startsWith('MAS')) ? '2' : '9');
    const m = String(item.classe_code || classCode || '').toUpperCase().match(/BC(\d)/);
    return `${genderDigit}${m ? m[1] : '9'}${pad2(position)}`;
  }

  state.athletes.sort((a, b) => {
    if ((a.c1 ?? 999) !== (b.c1 ?? 999)) return (a.c1 ?? 999) - (b.c1 ?? 999);
    if ((a.c2 ?? 999) !== (b.c2 ?? 999)) return (a.c2 ?? 999) - (b.c2 ?? 999);
    if ((a.c3 ?? 999) !== (b.c3 ?? 999)) return (a.c3 ?? 999) - (b.c3 ?? 999);
    return a.nome.localeCompare(b.nome);
  });

  state.athletes = state.athletes.map((a, idx) => {
      let clubeIdReal = a.clube_id || (a.clubes_ids && a.clubes_ids[0]) || a.rep_value;
      let clube = clubsMap[clubeIdReal] || {};
      return {
          ...a, bib: generateBib(a, idx + 1), originalSeed: idx + 1,
          logo_url: clube.logo || null, clube_nome_completo: clube.nome || a.clube_nome || a.clube_sigla, sigla_final: clube.sigla || a.sigla || a.clube_sigla
      };
  });

  const colorBg = state.classConfig?.ui_bg || '#f59e0b';
  const colorFg = state.classConfig?.ui_fg || '#000000';

  function getSeedingPositions(size) {
      let bracket = [1, 2];
      for (let c = 2; c < size; c *= 2) {
          let next = [];
          for (let i = 0; i < bracket.length; i++) next.push(bracket[i], 2 * c + 1 - bracket[i]);
          bracket = next;
      }
      return bracket;
  }

  root.innerHTML = `
    <div style="padding: 20px; font-family: sans-serif; background: #f4f6f8; min-height: 100vh;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1e293b;">Sorteio Oficial: <span style="background: #fbbf24; padding: 4px 10px; border-radius: 6px; color: #000;">${escapeHTML(classCode)}</span></h2>
        <p style="color: #475569; margin-top: 5px;" id="lbl-modo-comp">Modo de Competição: Aguardando Geração</p>
      </div>

      <div style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 10px; flex-wrap: wrap;">
           <div style="display: flex; flex-direction: column; gap: 5px;">
               <label style="font-weight: bold; color: #334155; font-size: 13px; text-transform: uppercase;">Formato da Chave (Anexo A):</label>
               <select id="draw-pools-select" class="form-select form-select-sm" style="padding: 10px; border-radius: 6px; font-size: 14px; min-width: 400px;"></select>
           </div>
           
           <div style="display: flex; flex-direction: column; gap: 5px;" id="method-container">
               <label style="font-weight: bold; color: #334155; font-size: 13px; text-transform: uppercase;">Método de Distribuição:</label>
               <select id="draw-method-select" class="form-select form-select-sm" style="padding: 10px; border-radius: 6px; font-size: 14px; min-width: 280px;">
                   <option value="POTS">Sorteio por Potes (Padrão World Boccia)</option>
                   <option value="SNAKE">Serpentina Direta (Vai e Volta: A-C, C-A)</option>
                   <option value="SEQ">Serpentina Indireta (Sequencial: A-C, A-C)</option>
               </select>
           </div>
        </div>
        <div style="text-align: center; font-size: 12px; color: #64748b; margin-top: 5px; margin-bottom: 25px;">(*) Formato preferencial recomendado pela World Boccia</div>

        <div style="display: flex; justify-content: center; margin-bottom: 35px;">
          <button id="btn-generate" type="button" style="background: #3b82f6; color: white; border: none; padding: 12px 25px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 6px rgba(59,130,246,0.3); font-size: 15px;">
            🎲 GERAR DISTRIBUIÇÃO
          </button>
        </div>

        <div id="draw-results" style="display: flex; flex-wrap: wrap; gap: 25px; justify-content: center;"></div>

        <div style="margin-top: 40px; border-top: 2px solid #e2e8f0; padding-top: 25px; display: flex; justify-content: flex-start;">
          <button id="btn-save-draw" style="background: #16a34a; color: white; border: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 4px 6px rgba(22,163,74,0.3); transition: 0.2s; display: none;">
            💾 SALVAR SORTEIO E GERAR JOGOS
          </button>
        </div>
      </div>
    </div>

    <dialog id="modal-swap" style="border: none; border-radius: 12px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); width: 450px;">
      <h3 style="margin-top: 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">Trocar Posição</h3>
      <p style="font-size: 15px; color: #475569; margin-bottom: 20px;">Você está movendo: <br><strong id="swap-player-name" style="color: #3b82f6; font-size: 18px;"></strong></p>
      
      <label style="font-weight: bold; font-size: 14px; color: #475569; display: block; margin-bottom: 8px;">Selecione com quem trocar:</label>
      <select id="swap-target" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 25px; font-size: 14px;"></select>

      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <button id="btn-swap-cancel" style="background: transparent; border: 1px solid #94a3b8; padding: 12px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; color: #475569; font-size: 14px;">Cancelar</button>
        <button id="btn-swap-confirm" style="background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">🔄 Confirmar Troca</button>
      </div>
    </dialog>
  `;

  const numAtletas = state.athletes.length;
  const availableFormats = formatosA1.filter(f => f.entry === numAtletas);
  
  const sel = qs('#draw-pools-select');
  const methodContainer = qs('#method-container');
  const btnGenerate = qs('#btn-generate');
  
  if (availableFormats.length > 0) {
      let optionsHtml = availableFormats.map(f => {
          const ehPreferencial = f.preferred || f.preferencial || f.isPreferred || f.asterisco === true;
          const isPref = ehPreferencial ? '*' : ''; 
          const text = `${f.pools} Grupos | F. Grupos: ${f.poolMatches} jg | Elim.: ${f.koMatches} jg | Total: ${f.totalMatches} jogos`;
          return `<option value="${f.pools}" ${ehPreferencial ? 'selected' : ''}>${isPref}${text}</option>`;
      }).join('');
      optionsHtml += `<option value="0">Eliminatória Direta (Mata-Mata) - Sem Grupos</option>`;
      sel.innerHTML = optionsHtml;
  } else {
      sel.innerHTML = `<option value="1">1 Grupo (Fallback)</option><option value="0">Eliminatória Direta (Mata-Mata) - Sem Grupos</option>`;
  }

  sel.addEventListener('change', (e) => {
      if (e.target.value === '0') {
          methodContainer.style.display = 'none';
          btnGenerate.innerHTML = '🎲 GERAR CHAVE ELIMINATÓRIA';
      } else {
          methodContainer.style.display = 'flex';
          btnGenerate.innerHTML = '🎲 GERAR DISTRIBUIÇÃO';
      }
  });

  let swapData = null;

  function distributeGroupsPots() {
      try {
          const pCount = parseInt(sel.value, 10);
          const method = qs('#draw-method-select').value;
          
          if (pCount === 0) {
              state.formatMode = 'PURE_KNOCKOUT';
              let numAths = state.athletes.length;
              let bracketSize = 2;
              while (bracketSize < numAths) bracketSize *= 2;
              
              state.koDraw = [...state.athletes];
              for (let i = numAths; i < bracketSize; i++) {
                  state.koDraw.push({ id: 'BYE', nome: 'BYE (Avança Direto)', bib: '', logo_url: null, clube_sigla: '', clube_nome_completo: '' });
              }
              state.pools = [];
              qs('#lbl-modo-comp').textContent = "Modo de Competição: Eliminatória Direta (Mata-Mata)";
              renderGroups();
              return;
          }

          state.formatMode = 'GROUP';
          const pools = Array.from({length: pCount}, (_, i) => ({ name: String.fromCharCode(65 + i), players: [] }));
          let athletesToDraw = [...state.athletes];
          let potIndex = 0;

          while (athletesToDraw.length > 0) {
              let currentPot = athletesToDraw.splice(0, pCount);
              if (method === 'POTS') {
                  if (potIndex === 0) {
                      for (let i = 0; i < currentPot.length; i++) pools[i].players.push(currentPot[i]);
                  } else {
                      for (let i = currentPot.length - 1; i > 0; i--) {
                          const j = Math.floor(Math.random() * (i + 1));
                          [currentPot[i], currentPot[j]] = [currentPot[j], currentPot[i]];
                      }
                      for (let i = 0; i < currentPot.length; i++) pools[i].players.push(currentPot[i]);
                  }
              } else if (method === 'SNAKE') {
                  if (potIndex % 2 !== 0) currentPot.reverse();
                  for (let i = 0; i < currentPot.length; i++) pools[i].players.push(currentPot[i]);
              } else if (method === 'SEQ') {
                  for (let i = 0; i < currentPot.length; i++) pools[i].players.push(currentPot[i]);
              }
              potIndex++;
          }

          pools.forEach(pool => pool.players.sort((a, b) => parseInt(a.bib) - parseInt(b.bib)));
          const methodNames = { 'POTS': 'Sorteio por Potes', 'SNAKE': 'Serpentina Direta', 'SEQ': 'Serpentina Indireta' };
          qs('#lbl-modo-comp').textContent = `Modo de Competição: Fase de Grupos - ${methodNames[method]}`;
          state.pools = pools;
          renderGroups();
      } catch (err) {
          showToast("Erro ao processar distribuição: " + err.message, "error");
      }
  }

  btnGenerate.addEventListener('click', distributeGroupsPots);

  function renderGroups() {
      const container = qs('#draw-results');
      const btnSave = qs('#btn-save-draw');
      
      if (state.formatMode === 'PURE_KNOCKOUT') {
          btnSave.style.display = 'block';

          const bracketSize = state.koDraw.length;
          const seedingOrder = getSeedingPositions(bracketSize);
          
          let matchupsHtml = `<div style="display: flex; flex-direction: column; gap: 15px; width: 100%; align-items: center;">`;
          let matchCount = 1;

          for (let i = 0; i < bracketSize; i += 2) {
              const seed1 = seedingOrder[i];
              const seed2 = seedingOrder[i + 1];
              const pA = state.koDraw[seed1 - 1];
              const pB = state.koDraw[seed2 - 1];

              const renderPlayer = (p, seed) => {
                  const isBye = p.id === 'BYE';
                  return `
                      <div style="padding: 10px 15px; display: flex; align-items: center; justify-content: space-between; background: ${isBye ? '#f8fafc' : '#ffffff'}; border-bottom: 1px dashed #e2e8f0;">
                          <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
                              <span style="font-weight: bold; color: #3b82f6; width: 20px; font-size: 14px;">${seed}º</span>
                              ${!isBye ? `<span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: bold; color: #334155;">${p.bib}</span>` : ''}
                              <span style="font-weight: ${isBye ? 'normal' : '500'}; font-size: 14px; color: ${isBye ? '#94a3b8' : '#0f172a'};">${escapeHTML(p.nome)}</span>
                          </div>
                          <button class="btn-swap-ko" data-seed="${seed}" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: bold; cursor: pointer; color: #475569; transition: 0.2s;" title="Trocar Posição">Trocar</button>
                      </div>
                  `;
              };

              matchupsHtml += `
                  <div style="border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); width: 100%; max-width: 600px;">
                      <div style="background: #e2e8f0; font-size: 11px; font-weight: bold; color: #475569; padding: 6px 15px; text-transform: uppercase;">Jogo ${matchCount++}</div>
                      ${renderPlayer(pA, seed1)}
                      ${renderPlayer(pB, seed2)}
                  </div>
              `;
          }
          matchupsHtml += `</div>`;

          container.innerHTML = `
             <div style="width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
                <div style="background: ${colorBg}; color: ${colorFg}; padding: 15px; font-weight: bold; text-align: center; font-size: 18px;">
                  1ª Rodada Eliminatória (Confrontos Iniciais)
                </div>
                <div style="padding: 20px; background: #f8fafc;">
                    ${matchupsHtml}
                </div>
             </div>
          `;

          qsAll('.btn-swap-ko').forEach(btn => {
              btn.addEventListener('click', (e) => {
                  const seed = parseInt(btn.dataset.seed, 10);
                  openSwapModal(seed - 1, null);
              });
              btn.addEventListener('mouseover', () => btn.style.background = '#e2e8f0');
              btn.addEventListener('mouseout', () => btn.style.background = '#f1f5f9');
          });

          return;
      }

      if (state.pools.length === 0) {
          container.innerHTML = '';
          btnSave.style.display = 'none';
          return;
      }

      btnSave.style.display = 'block';
      container.innerHTML = state.pools.map((pool, poolIdx) => `
        <div style="width: 360px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
          <div style="background: ${colorBg}; color: ${colorFg}; padding: 15px 20px; font-weight: bold; text-align: center; font-size: 18px; letter-spacing: 1px;">Grupo ${pool.name}</div>
          <div style="display: flex; flex-direction: column;">
            ${pool.players.map((p, pIdx) => `
              <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 15px 20px; border-bottom: 1px solid #f1f5f9;">
                <div style="display: flex; flex-direction: column; flex: 1; padding-right: 10px;">
                   <div style="display: flex; align-items: flex-start; gap: 10px;">
                      <span style="font-weight: 900; font-size: 15px; color: #1e293b; margin-top: 2px;">${p.bib}</span>
                      <span style="font-size: 14px; font-weight: bold; color: #0f172a; line-height: 1.2;">${escapeHTML(p.nome)}</span>
                   </div>
                   <div style="display: flex; align-items: center; gap: 6px; margin-top: 6px; margin-left: 25px;">
                      ${p.logo_url ? `<img src="${p.logo_url}" style="height: 16px; max-width: 24px; object-fit: contain; border-radius: 2px; border: 1px solid #e2e8f0; background: white;">` : ''}
                      <span style="font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase;">${escapeHTML(p.clube_nome_completo || p.clube_sigla || '-')}</span>
                   </div>
                </div>
                <button class="btn-swap" data-pool="${poolIdx}" data-player="${pIdx}" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: bold; cursor: pointer; color: #475569; transition: 0.2s; margin-top: 2px;">Trocar</button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      qsAll('.btn-swap').forEach(btn => {
          btn.addEventListener('click', (e) => {
              openSwapModal(parseInt(btn.dataset.pool), parseInt(btn.dataset.player));
          });
          btn.addEventListener('mouseover', () => btn.style.background = '#e2e8f0');
          btn.addEventListener('mouseout', () => btn.style.background = '#f8fafc');
      });
  }

  const modalSwap = qs('#modal-swap');
  const swapTarget = qs('#swap-target');

  function openSwapModal(pIdx, plIdx) {
      swapTarget.innerHTML = '';
      if (state.formatMode === 'PURE_KNOCKOUT') {
          swapData = { mode: 'KO', index: pIdx };
          const player = state.koDraw[pIdx];
          qs('#swap-player-name').textContent = `Seed ${pIdx + 1} - ${player.id === 'BYE' ? 'BYE' : (player.bib ? player.bib + ' - ' : '') + player.nome}`;
          state.koDraw.forEach((p, i) => {
              if (i === pIdx) return;
              swapTarget.innerHTML += `<option value="${i}">Trocar com: Seed ${i + 1} ➔ ${p.id === 'BYE' ? 'BYE (Espaço Vazio)' : (p.bib ? p.bib + ' - ' : '') + p.nome}</option>`;
          });
      } else {
          swapData = { mode: 'GROUP', pool: pIdx, player: plIdx };
          const player = state.pools[pIdx].players[plIdx];
          qs('#swap-player-name').textContent = `${player.bib} - ${player.nome}`;
          state.pools.forEach((pool, i) => {
              pool.players.forEach((p, j) => {
                  if (i === pIdx && j === plIdx) return;
                  swapTarget.innerHTML += `<option value="${i}-${j}">Grupo ${pool.name} ➔ ${p.bib} - ${p.nome}</option>`;
              });
          });
      }
      modalSwap.showModal();
  }

  qs('#btn-swap-cancel').onclick = () => modalSwap.close();
  qs('#btn-swap-confirm').onclick = () => {
      if (!swapData || !swapTarget.value) return;
      if (swapData.mode === 'KO') {
          const targetIdx = parseInt(swapTarget.value, 10);
          const temp = state.koDraw[swapData.index];
          state.koDraw[swapData.index] = state.koDraw[targetIdx];
          state.koDraw[targetIdx] = temp;
      } else {
          const [tPool, tPlayer] = swapTarget.value.split('-').map(Number);
          const temp = state.pools[swapData.pool].players[swapData.player];
          state.pools[swapData.pool].players[swapData.player] = state.pools[tPool].players[tPlayer];
          state.pools[tPool].players[tPlayer] = temp;
          
          // Mantemos a ordem pelo BIB mesmo depois de trocar
          state.pools[swapData.pool].players.sort((a, b) => parseInt(a.bib) - parseInt(b.bib));
          state.pools[tPool].players.sort((a, b) => parseInt(a.bib) - parseInt(b.bib));
      }
      modalSwap.close();
      renderGroups();
  };

  qs('#btn-save-draw').onclick = async () => {
      const btn = qs('#btn-save-draw');
      btn.disabled = true;
      btn.textContent = 'Salvando e Gerando Jogos...';

      try {
          const drawId = `DRAW_${state.compId}_${state.classCode}`;
          await setDoc(doc(db, "draws", drawId), {
              competition_id: String(state.compId), class_code: state.classCode,
              format: { type: state.formatMode, groups_count: state.formatMode === 'GROUP' ? state.pools.length : 0 },
              groups: state.formatMode === 'GROUP' ? state.pools : [],
              seeds: state.formatMode === 'PURE_KNOCKOUT' ? state.koDraw : [],
              created_at: new Date().toISOString()
          });

          if (state.formatMode === 'GROUP' && state.pools.length > 0) {
             const matchesGroup = [];
             let matchCounter = 1;
             
             // 🔥 AQUI ESTAVA O BUG DO CRUZAMENTO DE GRUPOS!
             // Agora iteramos grupo por grupo e rodamos a matemática SÓ DENTRO do grupo
             state.pools.forEach(pool => {
                 const pList = pool.players;
                 const rounds = {};
                 
                 // Se o grupo tiver número ímpar, adicionamos o "BYE" fantasma
                 const dummy = pList.length % 2 !== 0 ? { id: 'BYE', nome: 'BYE' } : null;
                 const entrants = [...pList];
                 if (dummy) entrants.push(dummy);
                 
                 const numE = entrants.length;
                 const totalRounds = (state.athletes.length === 2 && state.pools.length === 1) ? 2 : (numE - 1);
                 
                 let rot = [...entrants];
                 
                 for (let r = 0; r < totalRounds; r++) {
                     rounds[`Round ${r + 1}`] = [];
                     
                     for (let i = 0; i < numE / 2; i++) {
                         let pA = rot[i]; let pB = rot[numE - 1 - i];
                         if (totalRounds === 2 && r === 1) { const temp = pA; pA = pB; pB = temp; }
                         
                         // Só grava no banco de dados se não for contra o BYE (Folga)
                         if (pA.id !== 'BYE' && pB.id !== 'BYE') {
                             rounds[`Round ${r + 1}`].push({
                                 id: `m_${state.classCode}_G${pool.name}_R${r+1}_${matchCounter}`, 
                                 match_number: matchCounter++, 
                                 match_type: 'GROUP',
                                 pool_name: pool.name, 
                                 round_name: `Round ${r + 1}`, 
                                 class_code: state.classCode, 
                                 status: 'SCHEDULED', // Jogo normal
                                 entrant1_id: pA.id, entrant_a_id: pA.id, entrant1_name: pA.nome || 'A Definir', p1_bib: pA.bib || '-', p1_club_sigla: pA.sigla_final || '-', p1_logo: pA.logo_url || null,
                                 entrant2_id: pB.id, entrant_b_id: pB.id, entrant2_name: pB.nome || 'A Definir', p2_bib: pB.bib || '-', p2_club_sigla: pB.sigla_final || '-', p2_logo: pB.logo_url || null,
                                 score1: 0, score2: 0, court: '', match_date: '', start_time: ''
                             });
                         }
                     }
                     rot.splice(1, 0, rot.pop()); // Roda o carrossel (Round Robin)
                 }
                 matchesGroup.push({ pool_name: pool.name, rounds: rounds });
             });
             
             await setDoc(doc(db, "matches_group", `MG_${state.compId}_${state.classCode}`), { competition_id: String(state.compId), class_code: state.classCode, matches: matchesGroup });
             
             // 🔥 LÓGICA DE CRUZAMENTO DE MATA-MATA (Eliminatórias)
             const numPools = state.pools.length;
             const mapping = { 
                 1: { size: 2, map: { 1:'A1', 2:'A2' } }, 
                 2: { size: 4, map: { 1:'A1', 2:'B1', 3:'A2', 4:'B2' } }, 
                 3: { size: 8, map: { 1:'A1', 2:'B1', 3:'C1', 4:'C2', 5:'B2', 6:'A2' } }, 
                 4: { size: 8, map: { 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'B2', 6:'A2', 7:'D2', 8:'C2' } }, 
                 5: { size: 16, map:{ 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'E1', 6:'A2', 7:'D2', 8:'C2', 9:'B2', 10:'E2' } }, 
                 6: { size: 16, map:{ 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'E1', 6:'F1', 7:'A2', 8:'B2', 9:'C2', 10:'D2', 11:'E2', 12:'F2' } }, 
                 7: { size: 16, map:{ 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'E1', 6:'F1', 7:'G1', 8:'C2', 9:'B2', 10:'A2', 11:'D2', 12:'G2', 13:'F2', 14:'E2' } }, 
                 8: { size: 16, map:{ 1:'A1', 2:'B1', 3:'C1', 4:'D1', 5:'E1', 6:'F1', 7:'G1', 8:'H1', 9:'B2', 10:'A2', 11:'C2', 12:'D2', 13:'F2', 14:'E2', 15:'G2', 16:'H2' } } 
             };

             if (mapping[numPools] && numPools > 1) {
                 const bSize = mapping[numPools].size;
                 let mCount = 1;
                 const getPlayer = (seed) => {
                     const sCode = mapping[numPools].map[seed];
                     return sCode ? { id: `POOL_${sCode}`, nome: `${sCode.charAt(1)}º do Grp ${sCode.charAt(0)}` } : { id: 'BYE', nome: 'BYE' };
                 };
                 // Puxa a função de construir o Mata-Mata para salvar no banco
                 const koMatches = buildDBKoTree(mCount, bSize, getPlayer, state.classCode);
                 await setDoc(doc(db, "matches_ko", `MK_${state.compId}_${state.classCode}`), { competition_id: String(state.compId), class_code: state.classCode, data: koMatches });
             }
          }

          if (state.formatMode === 'PURE_KNOCKOUT') {
              const bSize = state.koDraw.length;
              const koMatches = buildDBKoTree(1, bSize, (seed) => state.koDraw[seed - 1], state.classCode);
              await setDoc(doc(db, "matches_ko", `MK_${state.compId}_${state.classCode}`), { competition_id: String(state.compId), class_code: state.classCode, data: koMatches });
          }

          showToast("Sorteio e Chaves salvos com sucesso!", "success");
          setTimeout(() => location.hash = `#/competitions/view?id=${state.compId}`, 1500);
      } catch (err) {
          showToast(`Erro ao salvar sorteio: ${err.message}`, "error");
          btn.disabled = false; btn.textContent = '💾 SALVAR E GERAR JOGOS';
      }
  };
}

// === LÓGICA REUTILIZÁVEL PARA CONSTRUIR A ÁRVORE NO BANCO ===
function buildDBKoTree(startMatchCounter, bracketSize, getPlayerForSeedFunc, classCode) {
    const koMatchesOut = [];
    let mCounter = startMatchCounter;
    const totalRounds = Math.log2(bracketSize);
    
    let bracket = [1, 2];
    for (let c = 2; c < bracketSize; c *= 2) {
        let next = [];
        for (let i = 0; i < bracket.length; i++) next.push(bracket[i], 2 * c + 1 - bracket[i]);
        bracket = next;
    }
    const seedingOrder = bracket;

    let prevRoundMatches = [];

    // Rodada 1
    for (let i = 0; i < bracketSize; i += 2) {
        const seed1 = seedingOrder[i];
        const seed2 = seedingOrder[i + 1];
        const pA = getPlayerForSeedFunc(seed1);
        const pB = getPlayerForSeedFunc(seed2);

        const isByeMatch = pA.id === 'BYE' || pB.id === 'BYE';
        const winnerId = isByeMatch ? (pA.id !== 'BYE' ? pA.id : (pB.id !== 'BYE' ? pB.id : null)) : null;

        let matchObj = {
            id: `m_${classCode}_KO_R1_${mCounter}`, match_number: mCounter, match_type: 'KO', round_name: getRoundName(totalRounds, 0),
            class_code: classCode, 
            status: isByeMatch ? 'BYE' : 'SCHEDULED', // 🔥 SALVA COMO "BYE" PARA NÃO SER JOGO DE VERDADE
            is_bye: isByeMatch,
            entrant1_id: pA.id, entrant1_name: pA.nome || 'A Definir', p1_bib: pA.bib || '-', p1_club_sigla: pA.clube_sigla || '-', p1_logo: pA.logo_url || null,
            entrant2_id: pB.id, entrant2_name: pB.nome || 'A Definir', p2_bib: pB.bib || '-', p2_club_sigla: pB.clube_sigla || '-', p2_logo: pB.logo_url || null,
            score1: null, score2: null, winner_id: winnerId, court: '', match_date: '', start_time: ''
        };
        koMatchesOut.push(matchObj);
        prevRoundMatches.push(matchObj);
        mCounter++;
    }

    // Rodadas seguintes
    let currentRoundIdx = 1;
    while (prevRoundMatches.length > 1) {
        let currentRoundMatches = [];
        let rName = getRoundName(totalRounds, currentRoundIdx);

        for (let i = 0; i < prevRoundMatches.length; i += 2) {
            let m1 = prevRoundMatches[i];
            let m2 = prevRoundMatches[i + 1];
            let isFinal = prevRoundMatches.length === 2 && i === 0;

            let newMatch = {
                id: `m_${classCode}_KO_R${currentRoundIdx+1}_${mCounter}`, match_number: mCounter, match_type: 'KO', round_name: rName,
                class_code: classCode, status: 'SCHEDULED', is_bye: false,
                entrant1_id: `TBD_W_${m1.match_number}`, entrant1_name: `Vencedor Jogo ${m1.match_number}`, p1_bib: '-', p1_club_sigla: '-', p1_logo: null,
                entrant2_id: `TBD_W_${m2.match_number}`, entrant2_name: `Vencedor Jogo ${m2.match_number}`, p2_bib: '-', p2_club_sigla: '-', p2_logo: null,
                score1: null, score2: null, winner_id: null, court: '', match_date: '', start_time: ''
            };
            koMatchesOut.push(newMatch);
            currentRoundMatches.push(newMatch);
            mCounter++;

            if (isFinal) {
                let thirdPlace = {
                    id: `m_${classCode}_KO_3RD_${mCounter}`, match_number: mCounter, match_type: 'KO', round_name: '3º Lugar',
                    class_code: classCode, status: 'SCHEDULED', is_bye: false,
                    entrant1_id: `TBD_L_${m1.match_number}`, entrant1_name: `Perdedor Jogo ${m1.match_number}`, p1_bib: '-', p1_club_sigla: '-', p1_logo: null,
                    entrant2_id: `TBD_L_${m2.match_number}`, entrant2_name: `Perdedor Jogo ${m2.match_number}`, p2_bib: '-', p2_club_sigla: '-', p2_logo: null,
                    score1: null, score2: null, winner_id: null, court: '', match_date: '', start_time: ''
                };
                koMatchesOut.push(thirdPlace);
                mCounter++;
            }
        }
        prevRoundMatches = currentRoundMatches;
        currentRoundIdx++;
    }
    return koMatchesOut;
}

// O ARQUIVO DE VIEW FOI APAGADO DAQUI POIS ESTÁ NO COMPETITION-CLASS-VIEW.JS AGORA
export async function renderCompetitionClassDrawView(root, hash) {
  root.innerHTML = `<div style="padding:40px; text-align:center;">
    <h3 style="color: #1e293b;">O sorteio foi realizado com sucesso e salvo no banco de dados!</h3>
    <p>Para visualizar a Árvore de Cruzamentos Oficial com a Disputa de 3º Lugar e os confrontos corretos dos Grupos, 
    clique no botão Voltar e acesse a tela principal da Classe.</p>
    <br>
    <button class="btn btn-primary" onclick="history.back()">← Voltar para Dashboard</button>
  </div>`;
}

export default renderDrawPage;