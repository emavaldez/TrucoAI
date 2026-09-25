// Piezas de la mesa (docs/design/mesa-v2): asiento, marcador con fósforos, codificación de acciones.
// Funciones puras que devuelven HTML; todo texto dinámico pasa por `escapeHtml`.

import type { Action } from '../engine/index.js';
import { renderSeatBack } from './cardView.js';
import { escapeHtml } from './escape.js';
import { initials } from './text.js';

// ---------- acciones ↔ atributo data-act ----------

/** Codifica una acción del motor como texto corto para `data-act`. */
export function encodeAction(action: Action): string {
  switch (action.type) {
    case 'PLAY_CARD':
      return `play:${action.cardId}`;
    case 'CALL_TRUCO':
      return 'truco';
    case 'ANSWER_TRUCO':
      return action.answer === 'QUIERO' ? 'truco-quiero' : 'truco-noquiero';
    case 'CALL_ENVIDO':
      return `envido:${action.call}`;
    case 'ANSWER_ENVIDO':
      return action.answer === 'QUIERO' ? 'envido-quiero' : 'envido-noquiero';
    case 'DECLARE_FLOR':
      return 'flor';
    case 'ANSWER_FLOR':
      return `flor:${action.answer}`;
    case 'MAZO':
      return 'mazo';
  }
}

/** La acción legal que corresponde a un `data-act`, o `undefined` si ya no es legal. */
export function decodeAction(code: string, legal: readonly Action[]): Action | undefined {
  return legal.find((action) => encodeAction(action) === code);
}

// ---------- asiento ----------

export interface SeatProps {
  id: string;
  name: string;
  team: 0 | 1;
  isHuman: boolean;
  cards: number;
  mano: boolean;
  dealer: boolean;
  active: boolean;
  activeLabel: string;
  dim: boolean;
  compact: boolean;
}

/** Nombre corto para los asientos compactos del celular ("Compañero 1" → "Compa 1"). */
export function shortName(name: string): string {
  return name.replace(/^Compañero/, 'Compa');
}

export function renderSeat(props: SeatProps, x: number, y: number): string {
  const team = props.team === 0 ? 'nos' : 'ellos';
  const rots = props.cards === 3 ? [-10, 0, 10] : props.cards === 2 ? [-6, 6] : [0];
  const backs = props.cards <= 0 ? '' : rots.slice(0, props.cards).map((rot, i) => renderSeatBack(props.compact, i, rot)).join('');
  const classes = ['seat', `seat--${team}`];
  if (props.compact) classes.push('seat--compact');
  if (props.active) classes.push('seat--active');
  if (props.dim) classes.push('seat--dim');
  const badges =
    (props.mano ? '<span class="seat-badge">Mano</span>' : '') + (props.dealer ? '<span class="seat-badge">Pie</span>' : '');
  const teamLabel = props.team === 0 ? 'Nosotros' : 'Ellos';
  const status = props.active ? `, ${props.activeLabel.toLowerCase()}` : '';
  return (
    `<div class="${classes.join(' ')}" style="left:${x}px;top:${y}px" data-testid="seat-${props.id}" data-seat="${props.id}"` +
    ` aria-label="${escapeHtml(`${props.name}, ${teamLabel}${props.mano ? ', mano' : ''}${props.dealer ? ', pie' : ''}${status}`)}" role="group">` +
    `<div class="seat-avatar" aria-hidden="true">${escapeHtml(initials(props.name, props.isHuman))}</div>` +
    `<div class="seat-info"><div class="seat-name">${escapeHtml(props.compact ? shortName(props.name) : props.name)}</div>` +
    `<div class="seat-tags"><span class="seat-team">${teamLabel}</span>${badges}</div></div>` +
    `<div class="seat-backs" aria-hidden="true">${backs}</div>` +
    (props.active ? `<div class="seat-active-tag">${escapeHtml(props.activeLabel)}</div>` : '') +
    `</div>`
  );
}

// ---------- marcador ----------

/** Un grupo de 5 fósforos: cuadrado + diagonal; se encienden según `k` (0..5). */
function matchGroup(k: number, gapBefore: boolean, gapAfter: boolean): string {
  const on = (n: number): string => (k >= n ? 'on' : 'off');
  const style = `${gapBefore ? 'margin-left:7px;' : ''}${gapAfter ? 'margin-right:7px;' : ''}`;
  return (
    `<svg class="matches" width="18" height="18" viewBox="0 0 20 20" style="${style}" aria-hidden="true">` +
    `<line class="${on(1)}" x1="3" y1="3" x2="3" y2="17"/><line class="${on(2)}" x1="3" y1="3" x2="17" y2="3"/>` +
    `<line class="${on(3)}" x1="17" y1="3" x2="17" y2="17"/><line class="${on(4)}" x1="3" y1="17" x2="17" y2="17"/>` +
    `<line class="${on(5)}" x1="3.5" y1="16.5" x2="16.5" y2="3.5"/></svg>`
  );
}

function scoreTeam(name: string, score: number, team: 'nos' | 'ellos', compact: boolean): string {
  const half = score >= 15 ? 'buenas' : 'malas';
  // Separación entre malas (3 grupos) y buenas (3 grupos), del lado de afuera en cada equipo.
  const groups = [0, 1, 2, 3, 4, 5].map((i) => {
    const k = Math.max(0, Math.min(5, score - 5 * i));
    return team === 'nos' ? matchGroup(k, i === 3, false) : matchGroup(k, false, i === 3);
  });
  const sticks = compact ? '' : `<div class="score-sticks score-sticks--${team}">${groups.join('')}</div>`;
  return (
    `<div class="score-team score-team--${team}" data-testid="score-${team}">` +
    `<div class="score-label"><span class="score-name">${name}</span><span class="score-half">${half}</span></div>` +
    `<div class="score-num">${score}</div>${sticks}</div>`
  );
}

export function renderScore(scores: readonly [number, number], compact: boolean): string {
  return (
    `<div class="score${compact ? ' score--compact' : ''}" data-testid="scoreboard" role="status" aria-label="Nosotros ${scores[0]}, Ellos ${scores[1]}">` +
    scoreTeam('Nosotros', scores[0], 'nos', compact) +
    scoreTeam('Ellos', scores[1], 'ellos', compact) +
    `</div>`
  );
}

export function menuIcon(): string {
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
}

export function lockIcon(): string {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
}
