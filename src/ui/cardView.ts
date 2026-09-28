/**
 * Carta española — pieza pura que devuelve strings HTML.
 *
 * Tamaños, radios, sombras, tintas y el SVG de cada palo vienen de `docs/design/mesa-v2/Card.dc.html`;
 * la cara (marco con pintas, palos según el número, figuras) imita la baraja española (pedido de
 * Emmanuel 2026-09-28). Estados: normal · playable · disabled ·
 * winner · back. Las no jugables se apagan con `filter` — **nunca con `opacity < 1`** (AC 2).
 */

import type { Suit } from '../engine/index.js';
import { escapeHtml } from './escape.js';

export type CardSize = 'xl' | 'lg' | 'md' | 'sm' | 'mini' | 'xs';
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
  /** atributos extra (ya escapados) para el elemento raíz, ej. `data-act="play:1-espada"` */
  attrs?: string;
  /** clase extra para el elemento raíz */
  className?: string;
}

/** Medidas por tamaño (ancho/alto de carta, número, pip, figura, padding, radio) — Card.dc.html. */
export const CARD_SIZES: Record<CardSize, { w: number; h: number; num: number; pip: number; fig: number; pad: number; r: number }> = {
  xl: { w: 124, h: 186, num: 34, pip: 84, fig: 10, pad: 10, r: 12 },
  lg: { w: 104, h: 156, num: 29, pip: 70, fig: 9, pad: 9, r: 11 },
  md: { w: 84, h: 126, num: 24, pip: 56, fig: 8, pad: 7, r: 10 },
  sm: { w: 64, h: 96, num: 19, pip: 42, fig: 7, pad: 6, r: 8 },
  mini: { w: 46, h: 69, num: 16, pip: 28, fig: 0, pad: 4, r: 7 },
  xs: { w: 30, h: 44, num: 11, pip: 18, fig: 0, pad: 3, r: 5 },
};

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

// ---------- cara estilo baraja española ----------
// Como la baraja española de siempre: marco con "pintas" (cortes en la línea de arriba y de abajo: oros
// ninguno, copas uno, espadas dos, bastos tres), los palos repartidos según el número (espadas y bastos
// cruzados) y figuras para la sota, el caballo y el rey. Dibujo propio, simplificado.

/** Cortes del marco por palo (la "pinta"). */
export const PINTAS: Record<Suit, number> = { oro: 0, copa: 1, espada: 2, basto: 3 };

type Pip = [x: number, y: number, rot?: number];

/** Dónde va cada palo (coordenadas 0..1 del área central) según el número. */
function pipLayout(number: number, suit: Suit): Pip[] {
  const long = suit === 'espada' || suit === 'basto';
  if (long) {
    // Espadas y bastos: se cruzan de a pares.
    switch (number) {
      case 1: return [[0.5, 0.5]];
      case 2: return [[0.5, 0.5, -24], [0.5, 0.5, 24]];
      case 3: return [[0.5, 0.5, -26], [0.5, 0.5, 26], [0.5, 0.5, 0]];
      case 4: return [[0.3, 0.27, -14], [0.7, 0.27, 14], [0.3, 0.73, 14], [0.7, 0.73, -14]];
      case 5: return [[0.26, 0.26, -14], [0.74, 0.26, 14], [0.5, 0.5, 0], [0.26, 0.74, 14], [0.74, 0.74, -14]];
      case 6: return [[0.28, 0.17, -10], [0.72, 0.17, 10], [0.28, 0.5, 10], [0.72, 0.5, -10], [0.28, 0.83, -10], [0.72, 0.83, 10]];
      default: return [[0.24, 0.17, -10], [0.76, 0.17, 10], [0.24, 0.5, 10], [0.76, 0.5, -10], [0.24, 0.83, -10], [0.76, 0.83, 10], [0.5, 0.5, 0]];
    }
  }
  switch (number) {
    case 1: return [[0.5, 0.5]];
    case 2: return [[0.5, 0.2], [0.5, 0.8]];
    case 3: return [[0.5, 0.15], [0.5, 0.5], [0.5, 0.85]];
    case 4: return [[0.27, 0.2], [0.73, 0.2], [0.27, 0.8], [0.73, 0.8]];
    case 5: return [[0.27, 0.16], [0.73, 0.16], [0.5, 0.5], [0.27, 0.84], [0.73, 0.84]];
    case 6: return [[0.27, 0.14], [0.73, 0.14], [0.27, 0.5], [0.73, 0.5], [0.27, 0.86], [0.73, 0.86]];
    default: return [[0.27, 0.12], [0.73, 0.12], [0.5, 0.32], [0.27, 0.54], [0.73, 0.54], [0.27, 0.88], [0.73, 0.88]];
  }
}

const f = (v: number): string => String(Math.round(v * 10) / 10);

/** Un palo dibujado en (cx, cy) con alto `size`, girado `rot` grados. */
function pipAt(suit: Suit, cx: number, cy: number, size: number, rot = 0): string {
  const k = size / 48;
  return `<g transform="translate(${f(cx)} ${f(cy)})${rot ? ` rotate(${rot})` : ''} scale(${Math.round(k * 1000) / 1000}) translate(-24 -24)">${suitSvg(suit)}</g>`;
}

/** Marco con sus pintas: la línea de arriba y la de abajo se cortan 0, 1, 2 o 3 veces según el palo. */
function frameSvg(suit: Suit, w: number, h: number, inset: number, r: number): string {
  const x0 = inset;
  const x1 = w - inset;
  const y0 = inset;
  const y1 = h - inset;
  const cuts = PINTAS[suit];
  const gap = Math.max(3, w * 0.07);
  const line = (y: number): string => {
    const a = x0 + r;
    const b = x1 - r;
    if (cuts === 0) return `M${f(a)} ${f(y)}H${f(b)}`;
    const parts: string[] = [];
    let from = a;
    for (let i = 1; i <= cuts; i++) {
      const center = a + ((b - a) * i) / (cuts + 1);
      parts.push(`M${f(from)} ${f(y)}H${f(center - gap / 2)}`);
      from = center + gap / 2;
    }
    parts.push(`M${f(from)} ${f(y)}H${f(b)}`);
    return parts.join('');
  };
  const sides =
    `M${f(x0 + r)} ${f(y0)}A${r} ${r} 0 0 0 ${f(x0)} ${f(y0 + r)}V${f(y1 - r)}A${r} ${r} 0 0 0 ${f(x0 + r)} ${f(y1)}` +
    `M${f(x1 - r)} ${f(y0)}A${r} ${r} 0 0 1 ${f(x1)} ${f(y0 + r)}V${f(y1 - r)}A${r} ${r} 0 0 1 ${f(x1 - r)} ${f(y1)}`;
  return `<path class="card-frame-line" d="${sides}${line(y0)}${line(y1)}" fill="none"></path>`;
}

/**
 * Figura (sota, caballo, rey) en una caja de 100×150, con el palo en la mano. Dibujo simple y propio:
 * la sota de pie con gorra, el caballo con su jinete, el rey con corona, barba y manto.
 */
function figureSvg(number: number, suit: Suit): string {
  const cloth = `fig-cloth fig-cloth--${suit}`;
  const head = (cx: number, cy: number, r: number) =>
    `<circle class="fig-skin" cx="${cx}" cy="${cy}" r="${r}"></circle>` +
    `<circle class="fig-eye" cx="${cx - r * 0.35}" cy="${cy - r * 0.1}" r="${Math.max(0.9, r * 0.1)}"></circle>` +
    `<circle class="fig-eye" cx="${cx + r * 0.35}" cy="${cy - r * 0.1}" r="${Math.max(0.9, r * 0.1)}"></circle>`;
  if (number === 11) {
    // Caballo con jinete.
    return (
      `<path class="fig-horse" d="M18 88c0-12 10-20 26-20h22c8 0 12-6 14-14l4-12c2-5 9-6 12-1l3 7-6 3-3 10c-2 9-6 17-12 21v8c0 6-4 10-10 10H34c-9 0-16-5-16-12z"></path>` +
      `<path class="fig-horse" d="M26 96l-3 34h7l4-30M44 100l-1 30h7l2-30M66 98l3 32h7l-2-32M78 92l6 36h7l-5-38"></path>` +
      `<path class="fig-mane" d="M84 40c-6 3-8 10-9 17l6-2c1-5 3-10 6-13z"></path>` +
      `<path class="fig-hoof" d="M22 128h9v4h-9zM42 128h9v4h-9zM68 128h9v4h-9zM83 126h9v4h-9z"></path>` +
      `<path class="${cloth}" d="M40 68l4-26h18l4 26z"></path>` +
      `<path class="${cloth}" d="M44 68l-6 22h8l6-18z"></path>` +
      head(53, 34, 8) +
      `<path class="fig-hair" d="M45 31c0-8 16-9 16 0-4-3-12-3-16 0z"></path>` +
      pipAt(suit, 28, 36, 30, suit === 'espada' || suit === 'basto' ? -20 : 0)
    );
  }
  if (number === 12) {
    // Rey: corona, barba y manto largo.
    return (
      `<path class="${cloth}" d="M30 58c4-6 12-9 20-9s16 3 20 9l8 72H22z"></path>` +
      `<path class="fig-trim" d="M22 128h56v6H22zM48 50h4v80h-4z"></path>` +
      `<path class="fig-cape" d="M30 58l-10 72h8l8-62zM70 58l10 72h-8l-8-62z"></path>` +
      head(50, 36, 10) +
      `<path class="fig-beard" d="M41 38c1 10 5 15 9 15s8-5 9-15c-3 3-6 4-9 4s-6-1-9-4z"></path>` +
      `<path class="fig-crown" d="M39 27l2-12 5 7 4-9 4 9 5-7 2 12z"></path>` +
      `<path class="fig-trim" d="M39 25h22v3H39z"></path>` +
      pipAt(suit, 76, 66, 30, suit === 'espada' || suit === 'basto' ? 18 : 0)
    );
  }
  // Sota: de pie, con gorra, piernas a la vista.
  return (
    `<path class="${cloth}" d="M34 56c3-5 9-7 16-7s13 2 16 7l4 40H30z"></path>` +
    `<path class="fig-trim" d="M30 92h40v5H30zM48 50h4v42h-4z"></path>` +
    `<path class="fig-legs" d="M38 97h9v31h-9zM53 97h9v31h-9z"></path>` +
    `<path class="fig-hoof" d="M35 127h13v5H35zM52 127h13v5H52z"></path>` +
    head(50, 38, 10) +
    `<path class="fig-hair" d="M40 36c0-9 20-9 20 0-4-3-16-3-20 0z"></path>` +
    `<path class="fig-cap ${cloth}" d="M38 30c2-9 22-11 26-2l6 1-4 3H38z"></path>` +
    pipAt(suit, 74, 64, 30, suit === 'espada' || suit === 'basto' ? 16 : 0)
  );
}

/** El dibujo de la cara (marco con pintas, palos o figura) en px de la carta. */
function faceArt(card: CardViewData, size: CardSize): string {
  const s = CARD_SIZES[size];
  const { w, h } = s;
  const frame = Math.round(s.pad / 2) + 1;
  const detailed = s.fig > 0;
  const out: string[] = [];
  if (size !== 'xs') out.push(frameSvg(card.suit, w, h, frame, Math.max(s.r - 4, 3)));
  if (!detailed) {
    // Chica: un solo palo grande (se lee mejor).
    out.push(pipAt(card.suit, w / 2, h * 0.54, s.pip));
    return out.join('');
  }
  // Área central: deja lugar a los números de las esquinas.
  const ax = w * 0.22;
  const ay = h * 0.14;
  const aw = w * 0.56;
  const ah = h * 0.72;
  if (card.number >= 10) {
    const k = Math.min((w * 0.74) / 100, (h * 0.78) / 150);
    const ox = w / 2 - 50 * k;
    const oy = h / 2 - 75 * k + h * 0.02;
    out.push(`<g class="card-figure-art" transform="translate(${f(ox)} ${f(oy)}) scale(${Math.round(k * 1000) / 1000})">${figureSvg(card.number, card.suit)}</g>`);
    return out.join('');
  }
  const long = card.suit === 'espada' || card.suit === 'basto';
  const n = card.number;
  let size1: number;
  if (n === 1) size1 = long ? ah * 0.95 : aw * 1.05;
  else if (long) size1 = n <= 3 ? ah * 0.9 : n <= 5 ? ah * 0.52 : ah * 0.42;
  else size1 = n <= 3 ? Math.min(aw * 0.62, ah * 0.3) : Math.min(aw * 0.44, ah * 0.25);
  for (const [px, py, rot] of pipLayout(n, card.suit)) out.push(pipAt(card.suit, ax + px * aw, ay + py * ah, size1, rot));
  return out.join('');
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
  const number = String(card.number);

  const boxStyle = `--cw:${s.w}px;--ch:${s.h}px;--cr:${s.r}px;`;

  if (state === 'back') {
    return `<div class="card card--back" style="${boxStyle}" aria-hidden="true"></div>`;
  }

  const face =
    `<div class="card-face suit-${card.suit}" data-pintas="${PINTAS[card.suit]}" style="${boxStyle}--cpad:${s.pad};--cpadt:${padT};--cnum:${s.num};">`
    + `<svg class="card-art" viewBox="0 0 ${s.w} ${s.h}" aria-hidden="true">${faceArt(card, size)}</svg>`
    + `<div class="card-corner card-corner--tl"><span class="card-number">${number}</span></div>`
    + `<span class="card-corner card-corner--br">${number}</span>`
    + `</div>`;

  const winnerTag = state === 'winner'
    ? `<span class="card-winner-tag">${escapeHtml(options.tag ?? 'Va ganando')}</span>`
    : '';
  const winnerRing = state === 'winner' ? `<span class="card-winner-ring" style="--crw:${s.r + 5};"></span>` : '';

  const inner = face + winnerRing + winnerTag;

  const extra = options.attrs ? ` ${options.attrs}` : '';
  const cls = `card card--${state}${options.className ? ` ${options.className}` : ''}`;
  if (options.label) {
    return `<button type="button" class="${cls}" data-size="${size}" style="${boxStyle}" aria-label="${escapeHtml(options.label)}"${extra}>${inner}</button>`;
  }
  return `<div class="${cls}" data-size="${size}" style="${boxStyle}"${extra} role="img" aria-label="${escapeHtml(cardNameEs(card))}">${inner}</div>`;
}

/** Dorso xs apilado del asiento (Seat.dc.html: cartas que le quedan a cada jugador). */
export function renderSeatBack(compact: boolean, index: number, rotation: number): string {
  const ml = index === 0 ? 0 : compact ? -4 : -8;
  return `<span class="seat-back" style="transform:rotate(${rotation}deg);margin-left:${ml}px"></span>`;
}
