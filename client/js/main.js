// client/js/main.js

import { canViewPage } from './permissions.js';

const routes = {
  '#/':             () => import('./pages/home.js').then(m => m.renderHome), 
  '#/login':        () => import('./pages/login.js').then(m => m.renderLogin),
  '#/home':         () => import('./pages/home.js').then(m => m.renderHome),
  '#/dashboard':    () => import('./pages/dashboard.js').then(m => m.renderDashboard),
  '#/admin/users':  () => import('./pages/admin-users.js').then(m => m.renderAdminUsers),
  
  '#/clubes':       () => import('./pages/clubes.js').then(m => m.renderClubes),
  '#/classes':      () => import('./pages/classes.js').then(m => m.renderClasses),
  '#/atletas':      () => import('./pages/atletas.js').then(m => m.renderAtletas),
  '#/oficiais':     () => import('./pages/oficiais.js').then(m => m.renderOficiais),
  '#/teams':        () => import('./pages/teams.js').then(m => m.renderTeams),

  // Ferramentas globais
  '#/simulador':  () => import('./pages/simulador.js').then(m => m.renderSimulador),
  '#/csv':        () => import('./pages/csv.js').then(m => m.renderCsvHub),
  '#/resultados': () => import('./pages/resultados.js').then(m => m.renderResultados),
  '#/status':     () => import('./pages/status.js').then(m => m.renderStatus),

  // 🔥 MÓDULO DE DISPENSAS
  '#/solicitar-dispensa': () => import('./pages/solicitar-dispensa.js').then(m => m.renderSolicitarDispensa),
  '#/admin/dispensas':    () => import('./pages/admin-dispensas.js').then(m => m.renderAdminDispensas),

  // --- MÓDULO DE COMPETIÇÕES ---
  '#/competitions/new':           () => import('./pages/competition-new.js').then(m => m.renderCompetitionNew),
  '#/competitions/load':          () => import('./pages/competitions.js').then(m => m.renderLoadCompetition),
  '#/competitions/view':          () => import('./pages/competition-dashboard.js').then(m => m.renderCompetitionDashboard),
  '#/competitions/class':         () => import('./pages/competition-class-select.js').then(m => m.renderCompetitionClassSelect),
  '#/competitions/draw':          () => import('./pages/draw-page.js').then(m => m.renderDrawPage),
  '#/competitions/final-results': () => import('./pages/competition-final-results.js').then(m => m.renderCompetitionFinalResults),
  '#/competitions/report':        () => import('./pages/competition-report.js').then(m => m.renderCompetitionReport),
  
  // Súmula e Placar
  '#/live/scoresheet':              () => import('./pages/live-scoresheet.js').then(m => m.renderLiveScoresheet),
  '#/live/scoreboard':              () => import('./pages/live-scoreboard.js').then(m => m.renderLiveScoreboard),
  
  // OS MENUS DO DASHBOARD PRÉ-CONFIGURADOS
  '#/competitions/athletes':        () => import('./pages/competition-athletes.js').then(m => m.renderCompetitionAthletes),
  '#/competitions/officials':       () => import('./pages/competition-officials.js').then(m => m.renderCompetitionOfficials),
  '#/competitions/schedule':        () => import('./pages/competition-schedule.js').then(m => m.renderCompetitionSchedule),
  '#/competitions/auto-schedule':   () => import('./pages/competition-auto-schedule.js').then(m => m.renderCompetitionAutoSchedule), // 🔥 Simulador de Agenda (IA Isolada)
  '#/competitions/match-sheets':    () => import('./pages/competition-match-sheets.js').then(m => m.renderCompetitionMatchSheets),
  '#/competitions/violations':      () => import('./pages/competition-violations.js').then(m => m.renderCompetitionViolations),
  '#/competitions/partial-results': () => import('./pages/competition-partial-results.js').then(m => m.renderCompetitionPartialResults),
  '#/competitions/scoreboard':   () => import('./pages/competition-scoreboard.js').then(m => m.renderCompetitionScoreboard),
  
  '#/call-room':                    () => import('./pages/call-room.js').then(m => m.renderCallRoom),
  '#/call-room-tv':                 () => import('./pages/call-room-tv.js').then(m => m.renderCallRoomTV),

  '#/oper-login':                   () => import('./pages/oper-login.js').then(m => m.renderOperLogin),
  '#/competitions/access':          () => import('./pages/competition-access.js').then(m => m.renderCompetitionAccess),
  // 🔥 MÓDULO DE DISPENSAS
  '#/solicitar-dispensa': () => import('./pages/solicitar-dispensa.js').then(m => m.renderSolicitarDispensa),
  '#/admin/dispensas':    () => import('./pages/admin-dispensas.js').then(m => m.renderAdminDispensas),
  '#/dispensa-publica':   () => import('./pages/dispensa-publica.js').then(m => m.renderDispensaPublica), 
};

// 🔥 DICIONÁRIO DE ROTAS SEGURAS (ATUALIZADO)
const routePermissions = {
  '#/clubes': 'clubes',
  '#/classes': 'classes',
  '#/atletas': 'atletas',
  '#/teams': 'atletas',
  '#/oficiais': 'oficiais',
  '#/simulador': 'simulador',
  '#/csv': 'csv',
  '#/resultados': 'resultados',
  '#/status': 'status',
  '#/admin/users': 'gestao',
  '#/competitions/load': 'competicoes',
  '#/competitions/view': 'competicoes',
  '#/competitions/new': 'competicoes',
  '#/competitions/auto-schedule': 'competicoes', // Permissão do Simulador Isolado
  '#/solicitar-dispensa': 'solicitar_dispensa', 
  '#/admin/dispensas': 'admin_dispensas'        
};

/* ========= TOAST ========= */
function toast(msg, kind='info', timeout=2500) {
  const t = document.getElementById('toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.className = 'toast';
  if (kind) t.classList.add(kind);
  t.classList.add('show');
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  setTimeout(() => t.classList.remove('show'), timeout);
}
window.__toast = toast;
window.toast = toast;

/* ========= PERSISTÊNCIA ========= */
const SS = sessionStorage;
const ROUTE_KEY = 'spa:lastHash';
function saveRoute(hash){ try { SS.setItem(ROUTE_KEY, hash); } catch{} }
function readRoute(){ try { return SS.getItem(ROUTE_KEY) || ''; } catch { return ''; } }

const STATE_PREFIX = 'spa:state:';
function saveFormState(root) {
  if (!root) return;
  const data = {};
  const inputs = root.querySelectorAll('input, textarea, select');
  for (const el of inputs) {
    const key = el.id ? `#${el.id}` : (el.name
      ? `name:${el.name};idx:${Array.from(root.querySelectorAll(`[name="${CSS.escape(el.name)}"]`)).indexOf(el)}`
      : null);
    if (!key) continue;
    let val;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) val = el.checked;
    else val = el.value;
    data[key] = val;
  }
  try { SS.setItem(STATE_PREFIX + (location.hash || '#/home'), JSON.stringify(data)); } catch {}
}

function restoreFormState(root) {
  if (!root) return;
  let raw = null;
  try { raw = SS.getItem(STATE_PREFIX + (location.hash || '#/home')); } catch {}
  if (!raw) return;
  let data = {};
  try { data = JSON.parse(raw) || {}; } catch {}
  const get = (key) => {
    if (key.startsWith('#')) return root.querySelector(key);
    const m = key.match(/^name:(.*);idx:(\d+)$/);
    if (m) return root.querySelectorAll(`[name="${m[1]}"]`)[Number(m[2])];
    return null;
  };
  for (const [key, val] of Object.entries(data)) {
    const el = get(key);
    if (!el) continue;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      el.checked = !!val;
      el.dispatchEvent(new Event('change'));
    } else {
      el.value = val;
      el.dispatchEvent(new Event('input'));
    }
  }
}

/* ========= NAVEGAÇÃO ========= */
export async function navigate(hash) {
  saveRoute(hash);
  const root = document.getElementById('app');
  if (!root) return;

  const [path, query] = hash.split('?');

  const requiredPermission = routePermissions[path];
  if (requiredPermission && !canViewPage(requiredPermission)) {
      window.__toast?.('Acesso Negado. O seu nível de utilizador não permite visualizar esta página.', 'error', 3000);
      location.hash = '#/home';
      return; 
  }

  root.setAttribute('aria-busy', 'true');
  try {
    const drawViewMatch = hash.match(/#\/competitions\/([a-zA-Z0-9_-]+)\/class\/([^/]+)\/draw-view/) || hash.match(/#\/competitions\/(\d+)\/class\/([^/]+)\/draw-view/);
    const competitionViewMatch = hash.match(/#\/competitions\/([a-zA-Z0-9_-]+)\/class\/([^/]+)\/competition-view/) || hash.match(/#\/competitions\/(\d+)\/class\/([^/]+)\/competition-view/);
    const resultsMatch = hash.match(/#\/competitions\/([a-zA-Z0-9_-]+)\/class\/([^/]+)\/results/) || hash.match(/#\/competitions\/(\d+)\/class\/([^/]+)\/results/);

    if (drawViewMatch) {
      const { renderCompetitionClassDrawView } = await import('./pages/competition-class-draw-view.js');
      await renderCompetitionClassDrawView(root, hash);
      restoreFormState(root);
      return;
    } else if (competitionViewMatch) {
      const { renderCompetitionClassCompetition } = await import('./pages/competition-class-competition.js');
      await renderCompetitionClassCompetition(root, hash);
      restoreFormState(root);
      return;
    } else if (resultsMatch) {
      const { renderCompetitionClassResults } = await import('./pages/competition-class-results.js');
      await renderCompetitionClassResults(root, hash);
      restoreFormState(root);
      return;
    }

    const routeLoader = routes[path];

    if (routeLoader) {
      const renderFn = await routeLoader();
      const params = new URLSearchParams(query || '');

      const compRoutes = [
         '#/competitions/class', '#/competitions/athletes', '#/competitions/officials', 
         '#/competitions/schedule', '#/competitions/auto-schedule', '#/competitions/match-sheets', '#/competitions/violations', 
         '#/competitions/partial-results', '#/competitions/scoreboard', '#/call-room', '#/call-room-tv',
         '#/competitions/access'
      ];

      if (compRoutes.includes(path)) {
        const competitionId = params.get('id');
        const classCode = params.get('class'); 
        if (competitionId) {
          await renderFn(root, { competitionId, classCode, originalHash: hash });
        } else {
          window.__toast?.('Erro: ID da competição ausente.', 'error');
          root.innerHTML = '<h1>Erro de Parâmetros</h1>';
        }
      }
      else if (path === '#/competitions/view') {
        await renderFn(root, hash);
      }
      else {
        await renderFn(root);
      }
    } else {
      root.innerHTML = '<h1>Página não encontrada!</h1>';
    }
  } catch (e) {
    console.error('Erro ao carregar a página:', e);
    root.innerHTML = `<h1>Erro</h1><p>${e?.message || 'Falha ao carregar a página. O ficheiro .js correspondente existe?'}</p>`;
  } finally {
    root.setAttribute('aria-busy', 'false');
  }
}

window.addEventListener('hashchange', () => navigate(location.hash));
window.addEventListener('beforeunload', () => {
  const root = document.getElementById('app');
  try { saveFormState(root); } catch {}
});

function boot() {
  if (!location.hash) {
    const last = readRoute();
    location.hash = last || '#/home';
  }
  navigate(location.hash);
}

if (window.isAuthReady) {
    boot();
} else {
    window.addEventListener('authReady', boot);
}

/* ========= MENU HAMBÚRGUER ========= */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const btnHamburger = document.getElementById('btnHamburger');
    const sidebar = document.getElementById('sidebar') || document.getElementById('mainMenuPanel');
    const overlay = document.getElementById('overlay');

    if (!btnHamburger || !sidebar || !overlay) {
      return;
    }

    function openMenu() {
      sidebar.classList.add('open');
      overlay.classList.add('show');
      btnHamburger.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
      btnHamburger.setAttribute('aria-expanded', 'false');
    }

    btnHamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sidebar.classList.contains('open');
      isOpen ? closeMenu() : openMenu();
    });

    overlay.addEventListener('click', closeMenu);

    sidebar.addEventListener('click', (e) => {
      if (e.target.matches('a')) {
        closeMenu();
      }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeMenu();
        }
    });

    window.addEventListener('hashchange', closeMenu);
  });
})();