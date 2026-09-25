// Señas entre compañeros en la mesa (pedido de Emmanuel 2026-09-25):
// - Las señas que te hacen tus compañeros se ven al lado de su asiento: la carta señada (o lo que
//   dice la seña: "27+", "Flor", "Nada") y el gesto. Una seña de carta se ve hasta que esa carta
//   se juega; las otras, durante la primera baza.
// - Vos podés hacer señas con el botón "Señas" hasta que jugás tu primera carta.
// Nunca en pica-pica ni con 2 jugadores (el controlador no las ofrece).

import type { Card, MatchState } from '../engine/index.js';
import { CARD_SIGNS, signInfo, type Signal, type SignKind } from '../ai/signs.js';
import { renderCard } from './cardView.js';
import { escapeHtml } from './escape.js';
import type { LayoutMode, TableGeometry } from './layout.js';

const HUMAN = 'p0';

/** Carta que muestra la seña cuando dice exactamente cuál es. */
const EXACT: Partial<Record<SignKind, Card>> = {
  ANCHO_ESPADA: { id: '1-espada', number: 1, suit: 'espada' },
  ANCHO_BASTO: { id: '1-basto', number: 1, suit: 'basto' },
  SIETE_ESPADA: { id: '7-espada', number: 7, suit: 'espada' },
  SIETE_ORO: { id: '7-oro', number: 7, suit: 'oro' },
};

/** Lo que se dibuja en la "carta" de una seña que no dice el palo. */
const GENERIC: Partial<Record<SignKind, { big: string; small: string }>> = {
  TRES: { big: '3', small: '' },
  DOS: { big: '2', small: '' },
  ANCHO_FALSO: { big: '1', small: 'falso' },
  ENVIDO: { big: '27+', small: 'envido' },
  FLOR: { big: 'Flor', small: '' },
  NADA: { big: 'Nada', small: '' },
};

/** Ficha corta para el celular. */
const SHORT: Record<SignKind, string> = {
  ANCHO_ESPADA: '1 esp',
  ANCHO_BASTO: '1 bas',
  SIETE_ESPADA: '7 esp',
  SIETE_ORO: '7 oro',
  TRES: '3',
  DOS: '2',
  ANCHO_FALSO: '1 falso',
  ENVIDO: '27+',
  FLOR: 'Flor',
  NADA: 'Nada',
};

function playedIds(state: MatchState): Set<string> {
  const ids = new Set<string>();
  for (const trick of state.hand.tricks) for (const play of trick.plays) ids.add(`${play.playerId}:${play.card.id}`);
  for (const play of state.hand.currentTrick.plays) ids.add(`${play.playerId}:${play.card.id}`);
  return ids;
}

/** Señas de los compañeros que siguen a la vista. */
export function visibleSignals(state: MatchState, signals: readonly Signal[]): Signal[] {
  if (state.phase === 'HAND_OVER' || state.phase === 'MATCH_OVER' || state.hand.picaPica !== null) return [];
  const played = playedIds(state);
  return signals.filter((signal) => {
    if (signal.from === HUMAN) return false;
    if (CARD_SIGNS.includes(signal.kind)) return !played.has(`${signal.from}:${signal.cardId}`);
    return state.hand.tricks.length === 0;
  });
}

/** Las señas que hiciste vos y siguen valiendo (primera baza). */
export function mySignals(state: MatchState, signals: readonly Signal[]): Signal[] {
  if (state.phase === 'HAND_OVER' || state.phase === 'MATCH_OVER' || state.hand.tricks.length > 0) return [];
  return signals.filter((signal) => signal.from === HUMAN);
}

function signCard(kind: SignKind): string {
  const exact = EXACT[kind];
  if (exact) return renderCard(exact, { size: 'xs' });
  const generic = GENERIC[kind] ?? { big: '?', small: '' };
  const long = generic.big.length > 2 ? ' sign-card--word' : '';
  return (
    `<div class="sign-card${long}" aria-hidden="true"><span class="sign-card-big">${escapeHtml(generic.big)}</span>` +
    (generic.small ? `<span class="sign-card-small">${escapeHtml(generic.small)}</span>` : '') +
    `</div>`
  );
}

function signLabel(signal: Signal, name: string): string {
  const info = signInfo(signal.kind);
  return `${name}: ${info.seen.toLowerCase()} (${info.meaning.toLowerCase()})`;
}

/** Señas de cada compañero junto a su asiento. */
export function renderPartnerSigns(state: MatchState, signals: readonly Signal[], mode: LayoutMode, geo: TableGeometry): string {
  const visible = visibleSignals(state, signals);
  if (visible.length === 0) return '';
  const out: string[] = [];
  for (const seat of state.seats) {
    const mine = visible.filter((signal) => signal.from === seat.id);
    if (mine.length === 0) continue;
    const slot = geo.slots[seat.seat];
    const key = mine.map((signal) => signal.kind).join('-');
    if (mode === 'portrait') {
      // Fichas chicas abajo a la derecha, dentro del asiento (tapan los dorsos).
      const x = slot.seat.x + geo.seatSize.w - 5;
      const y = slot.seat.y + geo.seatSize.h - 20;
      out.push(
        `<div class="sign-tokens" style="left:${x}px;top:${y}px" data-testid="signs-${seat.id}" data-anim="signs-${seat.id}-${state.hand.number}" role="note" aria-label="${escapeHtml(`Señas de ${seat.name}`)}">` +
          mine
            .map((signal) => `<span class="sign-token" title="${escapeHtml(signLabel(signal, seat.name))}" data-sign="${signal.kind}">${escapeHtml(SHORT[signal.kind])}</span>`)
            .join('') +
          `</div>`,
      );
      continue;
    }
    // Escritorio: el de arriba (4 jugadores) a la izquierda de su asiento; los demás debajo.
    const top = slot.seat.y < 120;
    const style = top
      ? `left:${slot.seat.x - 12}px;top:${slot.seat.y}px;transform:translateX(-100%)`
      : `left:${slot.seat.x}px;top:${slot.seat.y + geo.seatSize.h + 8}px`;
    const items = mine
      .map((signal) => {
        const info = signInfo(signal.kind);
        return (
          `<div class="sign-item" data-sign="${signal.kind}" title="${escapeHtml(signLabel(signal, seat.name))}">${signCard(signal.kind)}` +
          `<div class="sign-meaning">${escapeHtml(info.meaning)}</div><div class="sign-gesture">${escapeHtml(info.seen)}</div></div>`
        );
      })
      .join('');
    out.push(
      `<div class="signs-panel" style="${style}" data-testid="signs-${seat.id}" data-anim="signs-${seat.id}-${state.hand.number}-${key}" role="note" aria-label="${escapeHtml(`Señas de ${seat.name}`)}">` +
        `<div class="signs-title">Señas de ${escapeHtml(seat.name)}</div><div class="signs-row">${items}</div></div>`,
    );
  }
  return out.join('');
}

/** Botón "Señas" (y lo que ya hiciste) en escritorio, debajo de tu asiento. */
export function renderSignControl(
  state: MatchState,
  signals: readonly Signal[],
  options: readonly SignKind[],
  open: boolean,
  mode: LayoutMode,
): string {
  const sent = mySignals(state, signals);
  if (options.length === 0 && sent.length === 0) return '';
  const button =
    options.length > 0
      ? `<button type="button" class="signs-btn${open ? ' signs-btn--open' : ''}" data-ui="signs" data-testid="signs-button" aria-expanded="${open}">Señas</button>`
      : '';
  if (mode === 'portrait') return button;
  const chips = sent
    .map((signal) => `<span class="sign-chip" data-sign="${signal.kind}" title="${escapeHtml(signInfo(signal.kind).gesture)}">${escapeHtml(signInfo(signal.kind).meaning)}</span>`)
    .join('');
  return (
    `<div class="signs-control" data-testid="signs-control">${button}` +
    (sent.length > 0 ? `<span class="signs-sent-label">Les hiciste:</span>${chips}` : '') +
    `</div>`
  );
}

/** Lista de señas para elegir (solo las que podés hacer con tus cartas). */
export function renderSignPicker(options: readonly SignKind[], mode: LayoutMode): string {
  if (options.length === 0) return '';
  const rows = options
    .map((kind) => {
      const info = signInfo(kind);
      return (
        `<button type="button" class="sign-option" data-ui="sign:${kind}" data-testid="sign-${kind}">${signCard(kind)}` +
        `<span class="sign-option-text"><span class="sign-option-gesture">${escapeHtml(info.gesture)}</span>` +
        `<span class="sign-option-meaning">${escapeHtml(info.meaning)}</span></span></button>`
      );
    })
    .join('');
  return (
    `<div class="sign-picker sign-picker--${mode}" role="dialog" aria-modal="false" aria-labelledby="sign-picker-title" data-testid="sign-picker" data-anim="sign-picker">` +
    `<div class="sign-picker-head"><div id="sign-picker-title" class="sign-picker-title">Hacerles una seña</div>` +
    `<button type="button" class="sign-picker-close" data-ui="signs" aria-label="Cerrar">×</button></div>` +
    `<div class="sign-picker-note">Solo la ven tus compañeros. Podés hacer señas hasta jugar tu primera carta.</div>` +
    `<div class="sign-picker-list">${rows}</div></div>`
  );
}
