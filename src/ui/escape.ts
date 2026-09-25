/**
 * Escapeo de texto dinámico para HTML construido con strings (Dev Notes de la 0-4).
 * Todo texto que venga del estado del juego (nombres, mensajes) pasa por acá.
 */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
