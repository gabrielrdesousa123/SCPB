// FILE NAME: client/js/utils/html-utils.js

/**
 * Escapa caracteres HTML especiais em uma string para prevenir ataques XSS.
 * @param {string} str A string a ser escapada.
 * @returns {string} A string com os caracteres HTML escapados.
 */
export function escapeHTML(str) {
  if (str == null) return ''; // Garante que null ou undefined retornem string vazia
  return String(str)
    .replace(/&/g, '&') // Primeiro, escape o '&' para evitar dupla escapada
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapa caracteres HTML especiais em uma string para uso em atributos HTML.
 * É similar a escapeHTML, mas foca em contextos de atributo.
 * @param {string} str A string a ser escapada para um atributo.
 * @returns {string} A string com os caracteres HTML escapados para atributo.
 */
export function escapeAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
