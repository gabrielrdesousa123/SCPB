// client/js/lib/undo.js
// Histórico de ações com limite de 30, botões e atalhos (Ctrl/Cmd + Z / Y).
// NÃO altera o layout: só usa botões existentes (#btnUndo / #btnRedo) se houver.
// Páginas podem registrar ações: window.historyActions.push({ undo, redo, label })

const MAX = 30;
class HistoryManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.btnUndo = document.getElementById('btnUndo') || null;
    this.btnRedo = document.getElementById('btnRedo') || null;
    this._wireButtons();
    this._wireShortcuts();
    this._updateButtons();
  }

  push(action) {
    if (!action || typeof action.undo !== 'function' || typeof action.redo !== 'function') return;
    this.undoStack.push(action);
    if (this.undoStack.length > MAX) this.undoStack.shift();
    this.redoStack.length = 0;
    this._updateButtons();
  }

  undo() {
    const a = this.undoStack.pop();
    if (!a) return;
    try { a.undo(); } catch(e){ console.warn('undo falhou', e); }
    this.redoStack.push(a);
    this._updateButtons();
  }

  redo() {
    const a = this.redoStack.pop();
    if (!a) return;
    try { a.redo(); } catch(e){ console.warn('redo falhou', e); }
    this.undoStack.push(a);
    this._updateButtons();
  }

  _wireButtons() {
    this.btnUndo?.addEventListener('click', () => this.undo());
    this.btnRedo?.addEventListener('click', () => this.redo());
  }

  _wireShortcuts() {
    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z') { e.preventDefault(); this.undo(); }
      else if (key === 'y') { e.preventDefault(); this.redo(); }
    }, { passive:false });
  }

  _updateButtons() {
    const u = this.undoStack.length>0, r = this.redoStack.length>0;
    if (this.btnUndo) { this.btnUndo.disabled = !u; this.btnUndo.style.opacity = u?1:.5; }
    if (this.btnRedo) { this.btnRedo.disabled = !r; this.btnRedo.style.opacity = r?1:.5; }
  }
}

// instancia global única
if (!window.historyActions) {
  window.historyActions = new HistoryManager();
}

// Captura automática de alterações de inputs dentro de #app (sem UI nova)
(function autoCapture() {
  const root = () => document.getElementById('app');
  const getKey = (el) => el.id
    ? `#${el.id}`
    : (el.name ? `name:${el.name};idx:${Array.from(root().querySelectorAll(`[name="${CSS.escape(el.name)}"]`)).indexOf(el)}` : null);

  const handler = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
    const key = getKey(el);
    if (!key) return;

    const isCheck = (el instanceof HTMLInputElement) && (el.type === 'checkbox' || el.type === 'radio');
    // Pega estado anterior com base no DOM antes do evento (fallback: salva no dataset)
    const before = isCheck ? (el.dataset._before ? (el.dataset._before === 'true') : !el.checked)
                           : (el.dataset._before ?? el.defaultValue ?? '');
    const after  = isCheck ? el.checked : el.value;

    const find = () => {
      if (key.startsWith('#')) return root().querySelector(key);
      if (key.startsWith('name:')) {
        const [, name, idx] = key.match(/^name:(.*);idx:(\d+)$/) || [];
        if (!name) return null;
        return root().querySelectorAll(`[name="${name}"]`)[Number(idx)];
      }
      return null;
    };

    window.historyActions.push({
      label: `Editar ${key}`,
      undo(){ const t=find(); if(!t) return; if(isCheck){ t.checked = before === true; t.dispatchEvent(new Event('change')); } else { t.value = before; t.dispatchEvent(new Event('input')); } },
      redo(){ const t=find(); if(!t) return; if(isCheck){ t.checked = after === true; t.dispatchEvent(new Event('change')); } else { t.value = after; t.dispatchEvent(new Event('input')); } },
    });

    // guarda "before" para próxima mudança
    if (isCheck) el.dataset._before = String(after);
    else el.dataset._before = String(after);
  };

  document.addEventListener('change', handler, true);
  document.addEventListener('input', handler, true);
})();
