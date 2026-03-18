// client/js/pages/dashboard.js

import { db } from '../firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// 🔥 Adicionado: collection, query, where, onSnapshot para a notificação em tempo real!
import { doc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { canViewPage } from '../permissions.js';

const icons = {
  nova: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  carregar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg>`,
  atletas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  clubes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-6 9 6v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M9 22V12h6v10"/></svg>`,
  classes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  oficiais: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 22a7.5 7.5 0 0 1 13 0"/></svg>`,
  simulador: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v6H4z"/><path d="M4 14h16v6H4z"/><path d="M9 7h6M9 17h6"/></svg>`,
  csv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>`,
  resultados: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  status: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M8 11l3 3 5-5"/></svg>`,
  
  // 🔥 Ícones Novos para o Módulo de Dispensa
  dispensaUser: `<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
  dispensaAdmin: `<svg viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`
};

// 🔥 Função Card atualizada para suportar uma Badge (bolinha de notificação)
function card(href, icon, title, sub, disabled=false, badgeId=null) {
  const attr = disabled ? 'aria-disabled="true" tabindex="-1"' : `data-nav="${href}" tabindex="0" role="link"`;
  const badgeHtml = badgeId ? `<div id="${badgeId}" style="position:absolute; top:-12px; right:-12px; z-index:10;"></div>` : '';
  return `
    <div class="card" ${attr} style="position:relative;">
      ${badgeHtml}
      <span class="icon" aria-hidden="true">${icon}</span>
      <div class="card-title">${title}</div>
      <div class="card-sub">${sub || ''}</div>
    </div>
  `;
}

export async function renderDashboard(root) {
  const auth = getAuth();

  root.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:50vh; flex-direction:column;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #0d6efd; border-radius:50%; animation:spin 1s linear infinite;"></div>
      <p style="margin-top:15px; color:#64748b; font-family:sans-serif;">Verificando acessos do Painel...</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.hash = '#/login';
      return;
    }

    try {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();
        
        if (userData.status !== 'approved' && userData.status !== 'active' && userData.global_role !== 'ADMIN_GERAL') {
             if (userData.status === 'pending' || userData.status === 'rejected') {
                 window.__toast?.("Seu acesso ainda não foi liberado.", "warning");
                 window.location.hash = '#/login';
                 return;
             }
        }

        buildDashboardUI(userData.nome_abreviado || userData.nome_completo);
      } else {
        window.location.hash = '#/login';
      }
    } catch (e) {
      console.error("Erro ao checar dados no dashboard", e);
    }
  });

  function buildDashboardUI(userName) {
    
    let html = `
      <section class="home-grid">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
          <h1 tabindex="-1" style="margin:0;">Painel de Controle</h1>
          <div style="display:flex; gap:15px; align-items:center;">
             <span style="font-weight:bold; color:#0f172a;">Olá, ${userName}</span>
             </div>
        </div>
    `;

    // 1. COMPETIÇÕES
    if (canViewPage('competicoes')) {
      html += `
        <div class="row">
          <h2>Competição</h2>
          <div class="cards">
            ${card('#/competitions/load', icons.nova, 'Competições', 'Criar, editar e configurar')}
          </div>
        </div>
      `;
    }

    // 2. CADASTRO
    if (canViewPage('atletas') || canViewPage('clubes') || canViewPage('classes') || canViewPage('oficiais')) {
      html += `
        <div class="row">
          <h2>Cadastro</h2>
          <div class="cards">
            ${canViewPage('atletas') ? card('#/atletas', icons.atletas, 'Atletas', 'Gerenciar atletas') : ''}
            ${canViewPage('clubes')  ? card('#/clubes',  icons.clubes,  'Clubes',  'Cadastro e relatórios') : ''}
            ${canViewPage('classes') ? card('#/classes', icons.classes, 'Classes', 'Códigos, cores e tempos') : ''}
            ${canViewPage('oficiais')? card('#/oficiais', icons.oficiais, 'Oficiais', 'Escalas e níveis') : ''}
          </div>
        </div>
      `;
    }

    // 3. FERRAMENTAS GLOBAIS (+ Minhas Dispensas)
    if (canViewPage('simulador') || canViewPage('csv') || canViewPage('resultados') || canViewPage('status') || canViewPage('solicitar_dispensa')) {
      html += `
        <div class="row">
          <h2>Ferramentas Globais</h2>
          <div class="cards">
            ${canViewPage('simulador') ? card('#/simulador', icons.simulador, 'Simulador de Competição', 'Seeds e potes') : ''}
            ${canViewPage('csv')       ? card('#/csv', icons.csv, 'CSV para BCMS', 'Exportações') : ''}
            ${canViewPage('resultados')? card('#/resultados', icons.resultados, 'Resultados de competição', 'Importar/conciliar') : ''}
            ${canViewPage('status')    ? card('#/status', icons.status, 'Status do sistema', 'Saúde do DB') : ''}
            
            ${canViewPage('solicitar_dispensa') ? card('#/solicitar-dispensa', icons.dispensaUser, 'Minhas Dispensas', 'Solicitar ofício PDF') : ''}
          </div>
        </div>
      `;
    }

    // 4. ADMINISTRAÇÃO (+ Gerenciar Dispensas)
    if (canViewPage('gestao') || canViewPage('admin_dispensas')) {
      html += `
        <div class="row">
          <h2>Administração do Sistema</h2>
          <div class="cards">
            ${canViewPage('gestao') ? card('#/admin/users', icons.admin, 'Gestão de Acessos', 'Aprovar Oficiais e definir funções') : ''}
            
            ${canViewPage('admin_dispensas') ? card('#/admin/dispensas', icons.dispensaAdmin, 'Gerenciar Dispensas', 'Aprovar e emitir PDFs', false, 'dash-badge-dispensas') : ''}
          </div>
        </div>
      `;
    }

    html += `</section>`;
    root.innerHTML = html;

    // EVENTOS DE NAVEGAÇÃO DOS CARTÕES
    root.querySelectorAll('.card[data-nav]').forEach(el => {
      const go = () => { location.hash = el.getAttribute('data-nav'); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });

    root.querySelector('h1')?.focus?.();

    // 🔥 LISTENER EM TEMPO REAL PARA A NOTIFICAÇÃO NO CARD DO DASHBOARD
    if (canViewPage('admin_dispensas')) {
        const dispensasRef = collection(db, "exemption_requests");
        const q = query(dispensasRef, where("status", "==", "PENDING"));
        
        onSnapshot(q, (snapshot) => {
            const badgeEl = document.getElementById('dash-badge-dispensas');
            if (badgeEl) {
                if (!snapshot.empty) {
                    badgeEl.innerHTML = `<span style="display:flex; justify-content:center; align-items:center; background:#ef4444; color:white; border-radius:50%; width:28px; height:28px; font-size:14px; font-weight:900; box-shadow:0 4px 6px rgba(0,0,0,0.3); border:2px solid #fff;">${snapshot.size}</span>`;
                } else {
                    badgeEl.innerHTML = '';
                }
            }
        });
    }
  }
}