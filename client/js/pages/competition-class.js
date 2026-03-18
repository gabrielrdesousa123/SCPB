import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function getQuery(hash) {
  const idx = hash.indexOf('?');
  const q = idx >= 0 ? hash.slice(idx + 1) : '';
  const p = new URLSearchParams(q);
  const o = {};
  for (const [k, v] of p.entries()) o[k] = v;
  return o;
}

function escapeHTML(s = '') {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[m]);
}
function escapeAttr(s=''){ return String(s).replace(/"/g,'&quot;'); }

const API = {
  getCompetition: async (id) => {
    try {
        const docRef = doc(db, "competitions", String(id));
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
        throw new Error('Competição não encontrada');
    } catch(e) {
        throw { error: 'Falha ao carregar competição do Firebase' };
    }
  },
  getClassesDropdown: async () => {
    try {
        const snap = await getDocs(collection(db, "classes"));
        return { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    } catch(e) {
        throw { error: 'Falha ao carregar classes do Firebase' };
    }
  },
  getClassConfig: async (compId, clsCode) => {
    try {
        const q = query(collection(db, "competition_classes"), where("competition_id", "==", String(compId)));
        const snap = await getDocs(q);
        let isKO = false;
        snap.forEach(doc => {
            const data = doc.data();
            if (data.class_code === clsCode) {
                // Verifica todas as possíveis chaves de configuração de eliminatória
                if (data.type === 'ELIMINATORIA' || data.draw_format === 'KNOCKOUT' || data.is_knockout === true || data.format_type === 'KNOCKOUT' || data.type === 'KNOCKOUT') {
                    isKO = true;
                }
            }
        });
        return isKO;
    } catch(e) { return false; }
  }
};

export async function renderCompetitionClass(root, hash) {
  const { id, class: classCode, step } = getQuery(hash);
  const compId = id ? String(id) : null; 
  const clsCode = (classCode || '').trim();

  if (!compId || !clsCode) {
    root.innerHTML = `<h1 tabindex="-1">Classe</h1><p>Competição ou classe inválida.</p>`;
    return;
  }

  let comp, dd, isClassKO;
  try {
    root.innerHTML = `<div style="padding: 40px; text-align: center;">A carregar dados do Torneio...</div>`;
    [comp, dd, isClassKO] = await Promise.all([
      API.getCompetition(compId),
      API.getClassesDropdown(),
      API.getClassConfig(compId, clsCode)
    ]);
  } catch (e) {
    root.innerHTML = `<p style="padding: 20px; color: red;">Falha ao carregar dados da competição ou classe.</p>`;
    return;
  }

  // DETETA SE É MATA-MATA PURO OU FASE DE GRUPOS (Verifica na Competição E na configuração da Classe)
  const isKnockout = isClassKO || (comp.metodo === 'ELIMINATORIA' || comp.tipo === 'ELIMINATORIA');
  
  // Log para ajudar a depurar (Pode ver isto na consola do navegador F12)
  console.log("Modo Detetado para a Classe:", isKnockout ? "ELIMINATORIA" : "GRUPOS", { compMetodo: comp.metodo, classKO: isClassKO });

  const tabGroupsLabel = isKnockout ? 'Eliminatória Direta' : 'Grupos & Jogos';

  root.innerHTML = `
    <section class="cc-wrap">
      <header class="cc-head">
        <button type="button" class="cc-back" id="ccBack">&larr; Voltar</button>
        <div class="cc-head-text">
          <h1 id="ccTitle" tabindex="-1"></h1>
          <p id="ccSub" class="cc-sub"></p>
        </div>
      </header>

      <div class="cc-classbar" id="ccClassBar"></div>

      <nav class="cc-tabs" aria-label="Etapas da classe">
        <button type="button" data-step="draw">Selecção de Atletas</button>
        <button type="button" data-step="groups">${tabGroupsLabel}</button>
      </nav>

      <div id="ccContent" class="cc-content"></div>
    </section>
  `;

  root.querySelector('#ccBack').addEventListener('click', () => {
    location.hash = `#/competitions/view?id=${encodeURIComponent(compId)}`;
  });

  const titleEl = root.querySelector('#ccTitle');
  titleEl.textContent = (comp.nome || comp.name || '').toUpperCase();
  const sub = [comp.local || '', comp.data_inicio || comp.data_fim ? comp.data_inicio + ' – ' + comp.data_fim : '']
    .filter(Boolean).join(' · ');
  root.querySelector('#ccSub').textContent = sub;

  const ddItems = dd.items || dd.data || [];
  const info = ddItems.find(c => String(c.code||c.codigo||c.class_code||c.id||'').trim() === clsCode) || {};
  const bg = (info.ui_bg || info.color_bg || '').trim() || '#000000';
  const fg = (info.ui_fg || info.color_fg || '').trim() || '#ffffff';
  const name = info.name || info.nome || clsCode;

  root.querySelector('#ccClassBar').innerHTML = `
    <div class="cc-pill" style="background:${escapeAttr(bg)};color:${escapeAttr(fg)};">
      <span class="cc-dot" style="background:${escapeAttr(bg)};"></span>
      <span><strong>${escapeHTML(clsCode)}</strong> — ${escapeHTML(name)}</span>
    </div>
  `;

  const tabs = root.querySelector('.cc-tabs');
  const content = root.querySelector('#ccContent');
  const currentStep = (step || 'draw');

  function setActiveTab(stepKey){
    Array.from(tabs.querySelectorAll('button')).forEach(btn=>{
      btn.dataset.active = btn.getAttribute('data-step') === stepKey ? 'true' : 'false';
    });
  }

  async function renderStep(stepKey){
    setActiveTab(stepKey);
    if (stepKey === 'draw') {
      content.innerHTML = `<p style="padding: 20px;">A carregar selecção de atletas...</p>`;
      try {
        const mod = await import('./competition-class-select.js');
        content.innerHTML = '';
        await mod.renderCompetitionClassSelect(content, {
          competitionId: compId,
          classCode: clsCode,
        });
      } catch (e) {
        console.error(e);
        content.innerHTML = `<p style="padding: 20px; color: red;">Falha ao carregar a página de seleção.</p>`;
      }
    } else if (stepKey === 'groups') {
      if (isKnockout) {
          content.innerHTML = `
            <h2 style="margin-top:0;">Mata-Mata / Eliminatória Direta</h2>
            <p style="font-size:13px;color:var(--muted);">
              Neste modo, não há Fase de Grupos. O Torneio desenrola-se em formato de chaves eliminatórias com base no Ranking.
            </p>
            <button class="btn btn-primary" onclick="location.hash='#/competitions/${compId}/class/${clsCode}/competition-view'">Abrir Árvore de Jogos e Súmulas</button>
          `;
      } else {
          content.innerHTML = `
            <h2 style="margin-top:0;">Grupos &amp; Jogos</h2>
            <p style="font-size:13px;color:var(--muted);">
              Visualização dos grupos, jogos da fase de pools e chave eliminatória.
            </p>
            <button class="btn btn-primary" onclick="location.hash='#/competitions/${compId}/class/${clsCode}/competition-view'">Abrir Tela de Partidas (Súmulas)</button>
            <button class="btn btn-outline-secondary" onclick="location.hash='#/competitions/${compId}/class/${clsCode}/draw-view'">Ver Potes e Grupos</button>
          `;
      }
    }
  }

  tabs.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-step]');
    if (!btn) return;
    const stepKey = btn.getAttribute('data-step');
    const url = `#/competitions/class?id=${encodeURIComponent(compId)}&class=${encodeURIComponent(clsCode)}&step=${encodeURIComponent(stepKey)}`;
    location.hash = url;
  });

  await renderStep(currentStep === 'groups' ? 'groups' : 'draw');
  titleEl.focus();
}

// Exportação limpa da função (Resolve o erro "renderFn is not a function")
export default renderCompetitionClass;