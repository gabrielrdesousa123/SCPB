// client/js/shim.js
// Pequeno módulo para garantir que exista um container seguro (#app)
// e para evitar que seu main.js "apague" o topo acidentalmente.

(function ensureAppMount() {
  let mount = document.querySelector('#app');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'app';
    mount.hidden = true;
    document.body.appendChild(mount);
  }
  // expõe para outros scripts (se quiserem usar)
  window.__APP_MOUNT__ = { el: mount };
})();

// Dica (opcional): se seu main.js montar na body por engano, você pode
// ajustar seu render para usar window.__APP_MOUNT__.el ao invés de body.
// Não alteramos seu main.js aqui — mantemos compatibilidade.