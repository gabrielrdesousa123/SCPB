// client/js/enhancers/ui-head.js
// Torna o botão [data-menu-toggle] um menu dropdown:
// - Clica abre/fecha
// - Esc fecha
// - Clique fora fecha
// - Fechar ao clicar num link do próprio menu

(function enhanceSingleMenu(){
  const toggleBtn = document.querySelector('[data-menu-toggle]');
  if (!toggleBtn) return;

  const panelId = toggleBtn.getAttribute('aria-controls');
  const panel = panelId ? document.getElementById(panelId) : null;
  if (!panel) return;

  const open = () => {
    panel.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
    // foco no primeiro item
    const first = panel.querySelector('a, button, [tabindex]:not([tabindex="-1"])');
    first?.focus?.();
  };
  const close = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  };
  const isOpen = () => !panel.hidden;

  // Abre/fecha ao clicar no botão
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });

  // Fecha com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Fecha ao clicar fora
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== toggleBtn) close();
  });

  // Fecha ao clicar em algum link do menu
  panel.addEventListener('click', (e) => {
    const link = e.target.closest('a, button');
    if (link) close();
  });

  // Inicial: fechado
  close();
})();
