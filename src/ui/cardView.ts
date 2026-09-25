/**
 * Carta española "mesa v2" — pieza pura que devuelve strings HTML.
 *
 * Fuente de valores exactos: `docs/design/mesa-v2/Card.dc.html` (tamaños, radios,
 * sombras, tintas, SVG de los cuatro palos). Estados: normal · playable · disabled ·
 * winner · back. Las no jugables se apagan con `filter` — **nunca con `opacity < 1`** (AC 2).
 */

import type { Suit } from '../types.js';
import { escapeHtml } from './escape.js';

export type CardSize = 'xl' | 'lg' | 'md' | 'sm' | 'xs';
export type CardState = 'normal' | 'playable' | 'disabled' | 'winner' | 'back';

/** Lo mínimo que necesita el render (compatible con CardDef y Card del core). */
export interface CardViewData {
  number: number;
  suit: Suit;
}

export interface CardRenderOptions {
  size?: CardSize;
  state?: CardState;
  /** Texto de la cinta del estado `winner` (default "Va ganando"; en resúmenes "Ganó"). */
  tag?: string;
  /** `aria-label` para el botón jugable (ej: "Jugar el 7 de espada"). */
  label?: string;
}

/** Medidas por tamaño (ancho/alto de carta, número, pip, figura, padding, radio) — Card.dc.html. */
export const CARD_SIZES: Record<CardSize, { w: number; h: number; num: number; pip: number; fig: number; pad: number; r: number }> = {
  xl: { w: 124, h: 186, num: 34, pip: 84, fig: 10, pad: 10, r: 12 },
  lg: { w: 104, h: 156, num: 29, pip: 70, fig: 9, pad: 9, r: 11 },
  md: { w: 84, h: 126, num: 24, pip: 56, fig: 8, pad: 7, r: 10 },
  sm: { w: 64, h: 96, num: 19, pip: 42, fig: 7, pad: 6, r: 8 },
  xs: { w: 30, h: 44, num: 11, pip: 18, fig: 0, pad: 3, r: 5 },
};

const FIGURE_LABELS: Record<number, string> = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' };

export const SUIT_NAMES_ES: Record<Suit, string> = {
  espada: 'espada',
  basto: 'basto',
  oro: 'oro',
  copa: 'copa',
};

/** Nombre display de la carta para aria-labels y globos ("el 1 de espada", "el 12 de oro"). */
export function cardNameEs(card: CardViewData): string {
  return `el ${card.number} de ${SUIT_NAMES_ES[card.suit]}`;
}

/** aria-label de diseño: "Jugar el 7 de espada" (ux-design.md §4). */
export function cardAriaLabel(card: CardViewData): string {
  return `Jugar ${cardNameEs(card)}`;
}

/**
 * SVG del palo (viewBox 0 0 48 48) copiados literalmente de Card.dc.html.
 * Los colores del diseño son literales ahí; en CSS viven como tokens `--pip-*`
 * y se aplican con CSS para no duplicar valores (ver `.pip-*` en styles.css).
 */
function suitSvg(suit: Suit): string {
  switch (suit) {
    case 'oro':
      return '<circle class="pip-oro-a" cx="24" cy="24" r="19" stroke-width="2"></circle>'
        + '<circle class="pip-oro-b" cx="24" cy="24" r="12.5" fill="none" stroke-width="1.6"></circle>'
        + '<circle class="pip-oro-c" cx="24" cy="24" r="5" stroke-width="1.4"></circle>'
        + '<path class="pip-oro-d" d="M24 5.5v5M24 37.5v5M5.5 24h5M37.5 24h5M10.9 10.9l3.5 3.5M33.6 33.6l3.5 3.5M37.1 10.9l-3.5 3.5M14.4 33.6l-3.5 3.5" stroke-width="1.6" stroke-linecap="round"></path>';
    case 'copa':
      return '<path class="pip-copa-a" d="M11 6h26c0 11-5.5 18.5-13 19.5C16.5 24.5 11 17 11 6z" stroke-width="2" stroke-linejoin="round"></path>'
        + '<path class="pip-copa-b" d="M13.5 10h21" stroke-width="2" stroke-linecap="round"></path>'
        + '<rect class="pip-copa-c" x="21.5" y="25" width="5" height="10" rx="1.5" stroke-width="1.6"></rect>'
        + '<ellipse class="pip-copa-c" cx="24" cy="38.5" rx="10" ry="3.8" stroke-width="1.6"></ellipse>';
    case 'espada':
      return '<path class="pip-esp-a" d="M24 3l4.2 27H19.8L24 3z" stroke-width="1.8" stroke-linejoin="round"></path>'
        + '<path class="pip-esp-b" d="M24 7v22" stroke-width="1.3"></path>'
        + '<rect class="pip-esp-c" x="13" y="29.5" width="22" height="4.5" rx="2.2" stroke-width="1.4"></rect>'
        + '<rect class="pip-esp-d" x="21.5" y="34" width="5" height="8" rx="1.5" stroke-width="1.3"></rect>'
        + '<circle class="pip-esp-c" cx="24" cy="44" r="2.8" stroke-width="1.2"></circle>';
    case 'basto':
      return '<path class="pip-bas-a" d="M20.5 45l-2.5-27c-.8-8 3.4-13.5 8.2-13.2 5.3.3 7.3 6.2 5.3 13.4L27.5 45z" stroke-width="1.8" stroke-linejoin="round"></path>'
        + '<ellipse class="pip-bas-b" cx="25.5" cy="15" rx="2.4" ry="1.5"></ellipse>'
        + '<ellipse class="pip-bas-b" cx="23" cy="26" rx="2" ry="1.3"></ellipse>'
        + '<ellipse class="pip-bas-b" cx="25.8" cy="35" rx="1.8" ry="1.2"></ellipse>'
        + '<path class="pip-bas-c" d="M29.5 9c4-3 8-2.5 9.5-1-2 3.6-5.5 4.6-9.5 3.4" stroke-width="1.3" stroke-linejoin="round"></path>';
  }
}

/**
 * Render de una carta como string HTML.
 * `options.label` convierte la pieza en `<button>` jugable (AC 2); sin label es un `<div>`.
 */
export function renderCard(card: CardViewData, options: CardRenderOptions = {}): string {
  const size = options.size ?? 'xl';
  const state = options.state ?? 'normal';
  const s = CARD_SIZES[size];
  const padT = s.pad - 2;
  const r2 = Math.max(s.r - 4, 3);
  const frame = Math.round(s.pad / 2) + 1;
  const number = String(card.number);
  const figLabel = FIGURE_LABELS[card.number] ?? '';
  const hasFig = figLabel !== '' && s.fig > 0;

  const boxStyle = `--cw:${s.w}px;--ch:${s.h}px;--cr:${s.r}px;`;

  if (state === 'back') {
    return `<div class="card card--back" style="${boxStyle}"></div>`;
  }

  const face =
    `<div class="card-face suit-${card.suit}" style="${boxStyle}--cr2:${r2};--cframe:${frame};--cpad:${s.pad};--cpadt:${padT};--cnum:${s.num};--cpip:${s.pip};--cfig:${s.fig};">`
    + `<div class="card-frame"></div>`
    + `<div class="card-corner card-corner--tl"><span class="card-number">${number}</span>`
    + (hasFig ? `<span class="card-figure">${figLabel}</span>` : '')
    + `</div>`
    + `<span class="card-corner card-corner--br">${number}</span>`
    + `<div class="card-pip"><svg viewBox="0 0 48 48" aria-hidden="true">${suitSvg(card.suit)}</svg></div>`
    + `</div>`;

  const winnerTag = state === 'winner'
    ? `<span class="card-winner-tag">${escapeHtml(options.tag ?? 'Va ganando')}</span>`
    : '';
  const winnerRing = state === 'winner' ? `<span class="card-winner-ring" style="--crw:${s.r + 5};"></span>` : '';

  const inner = face + winnerRing + winnerTag;

  if (options.label) {
    return `<button type="button" class="card card--${state}" data-size="${size}" style="${boxStyle}" aria-label="${escapeHtml(options.label)}">${inner}</button>`;
  }
  return `<div class="card card--${state}" data-size="${size}" style="${boxStyle}">${inner}</div>`;
}

/** Dorso xs apilado del asiento (Seat.dc.html: cartas que le quedan a cada jugador). */
export function renderSeatBack(compact: boolean, index: number, rotation: number): string {
  const ml = index === 0 ? 0 : compact ? -4 : -6;
  return `<span class="seat-back" style="transform:rotate(${rotation}deg);margin-left:${ml}px"></span>`;
}
