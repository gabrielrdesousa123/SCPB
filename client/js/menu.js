// client/js/menu.js - Lógica para o menu hambúrguer

// IIFE para não poluir o escopo global
(function () {
  // Atraso para garantir que o DOM foi carregado, especialmente o header
  document.addEventListener('DOMContentLoaded', () => {
    const btnHamburger = document.getElementById('btnHamburger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const app = document.getElementById('app');

    if (!btnHamburger || !sidebar || !overlay) {
      console.warn('Elementos do menu não encontrados. O menu hambúrguer não irá funcionar.');
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

    // Abrir/Fechar com o botão
    btnHamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sidebar.classList.contains('open');
      isOpen ? closeMenu() : openMenu();
    });

    // Fechar ao clicar no overlay
    overlay.addEventListener('click', closeMenu);

    // Fechar ao clicar em um link do menu
    sidebar.addEventListener('click', (e) => {
      if (e.target.matches('a')) {
        closeMenu();
      }
    });
    
    // Fechar ao usar a tecla 'Escape'
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeMenu();
        }
    });

    // Garante que o menu feche se a rota mudar (ex: botões de voltar/avançar do navegador)
    window.addEventListener('hashchange', closeMenu);
  });
})();