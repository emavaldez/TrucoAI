/**
 * Piezas puras del tablero "mesa v2" (Main.dc.html): barra superior, indicador de
 * bazas del centro del paño y feed "En esta mano". Strings HTML; todo texto
 * dinámico pasa por escapeHtml.
 */

import { escapeHtml } from './escape.js';

export interface TopBarOptions {
  /** Nº de mano visible (1-indexed). */
  handNumber: number;
  /** Canto vigente resumido ("Truco querido · vale 2"), o null si no hay. */
  cantoText: string | null;
  /** Cartas restantes en el mazo. */
  deckRemaining: number;
}

export function renderTopBar(options: TopBarOptions): string {
  const canto = options.cantoText
    ? `<span class="canto-chip" data-testid="canto-chip">${escapeHtml(options.cantoText)}</span>`
    : '';
  return `<div class="top-bar" data-testid="top-bar">`
    + `<span class="hand-indicator" data-testid="hand-indicator">Mano ${options.handNumber}</span>`
    + canto
    + `<span class="deck-chip" data-testid="deck-chip">Mazo: ${options.deckRemaining}</span>`
    + `</div>`;
}

export interface TrickIndicatorOptions {
  /** Gana por baza ya resuelta: 0, 1 o -1 (parda). Orden: baza 1, 2, 3. */
  wonByTeam: (number | null)[];
  isPicaPica: boolean;
  picaPicaSubmano: number;
  /** Nombres cortos de los equipos para pica-pica ("Vos contra Rival 2"). */
  picaPicaPairLabel?: string;
}

/** Centro del paño: bazas 1ª/2ª/3ª con color del equipo ganador + submano pica-pica. */
export function renderTrickIndicator(options: TrickIndicatorOptions): string {
  const cells = ['1ª', '2ª', '3ª'].map((label, i) => {
    const w = options.wonByTeam[i];
    const cls = w === null ? 'trick-cell--pending' : w === -1 ? 'trick-cell--tie' : `trick-cell--team${w}`;
    return `<div class="trick-cell ${cls}" data-testid="trick-cell-${i + 1}"><span>${label}</span></div>`;
  });
  const submano = options.isPicaPica
    ? `<div class="submano-label" data-testid="submano-label">Submano ${options.picaPicaSubmano} de 3${options.picaPicaPairLabel ? ` · ${escapeHtml(options.picaPicaPairLabel)}` : ''}</div>`
    : '';
  return `<div class="trick-indicator" data-testid="trick-indicator">${cells.join('')}${submano}</div>`;
}

/** Feed "En esta mano": últimas 3 líneas (desktop). Vacío = no se muestra. */
export function renderFeed(lines: string[]): string {
  const last = lines.slice(-3);
  if (last.length === 0) return `<div class="feed-v2" data-testid="feed" hidden></div>`;
  return `<div class="feed-v2" data-testid="feed">${last
    .map((l) => `<div class="feed-line">${escapeHtml(l)}</div>`)
    .join('')}</div>`;
}

/** Globo de canto junto al asiento (AC 8): papel, 2,5 s (duración en CSS/JS). */
export function renderBubble(text: string): string {
  return `<div class="bubble-v2" role="status">${escapeHtml(text)}</div>`;
}
