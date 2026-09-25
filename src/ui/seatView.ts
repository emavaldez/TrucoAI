/**
 * Asiento de jugador "mesa v2" — pieza pura (Seat.dc.html).
 * Avatar con iniciales en color de equipo, nombre, equipo, insignias "Mano"/"Da",
 * dorsos con las cartas que le quedan, activo con borde dorado + etiqueta
 * "Juega"/"Tu turno", atenuado (42%) fuera de la submano de pica-pica.
 */

import { escapeHtml } from './escape.js';

export interface SeatRenderOptions {
  label: string;
  /** 0 = equipo del humano (Nosotros), 1 = Ellos. */
  team: number;
  cards: number;
  mano?: boolean;
  dealer?: boolean;
  active?: boolean;
  /** Atenuado: no juega la submano de pica-pica. */
  dim?: boolean;
  compact?: boolean;
  you?: boolean;
  /** Para `data-player-id` (driver e2e) y `data-testid` (contrato test-strategy §5). */
  playerId: string;
}

/** Iniciales como Seat.dc.html: "Rival 1" → R1, "Compañero 2" → C2, otras → dos primeras letras. */
export function seatInitials(label: string): string {
  const words = label.split(/\s+/);
  if (words.length > 1 && /\d/.test(words[1])) {
    return (words[0][0] + words[1]).toUpperCase();
  }
  return words.map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const BACK_ROTATIONS: Record<number, number[]> = { 1: [0], 2: [-6, 6], 3: [-10, 0, 10] };

export function renderSeat(options: SeatRenderOptions): string {
  const {
    label, team, cards, mano = false, dealer = false,
    active = false, dim = false, compact = false, you = false, playerId,
  } = options;

  const nos = team === 0;
  const initials = you ? 'VOS' : seatInitials(label);
  const teamName = nos ? 'Nosotros' : 'Ellos';
  const n = Math.max(0, Math.min(3, cards));
  const rots = n === 0 ? [] : BACK_ROTATIONS[n];
  const backs = rots
    .map((rot, i) => {
      const ml = i === 0 ? 0 : compact ? -4 : -6;
      return `<span class="seat-back" style="transform:rotate(${rot}deg);margin-left:${ml}px"></span>`;
    })
    .join('');

  const activeLabel = you ? 'Tu turno' : 'Juega';
  const badges =
    (mano ? '<span class="seat-pill">Mano</span>' : '')
    + (dealer ? '<span class="seat-pill">Da</span>' : '');

  return `<div class="seat${compact ? ' seat--compact' : ''}${active ? ' seat--active' : ''}${dim ? ' seat--dim' : ''}"`
    + ` data-player-id="${escapeHtml(playerId)}" data-team="${nos ? 'nos' : 'ellos'}"`
    + `${active ? ' data-active="true"' : ''}${dealer ? ' data-dealer="true"' : ''}${mano ? ' data-mano="true"' : ''}`
    + ` data-testid="seat-${escapeHtml(playerId)}">`
    + `<div class="seat-avatar">${escapeHtml(initials)}</div>`
    + `<div class="seat-body">`
    + `<div class="seat-label">${escapeHtml(label)}</div>`
    + `<div class="seat-meta"><span class="seat-team">${teamName}</span>${badges}</div>`
    + `</div>`
    + `<div class="seat-backs">${backs}</div>`
    + (active ? `<span class="seat-active-tag">${activeLabel}</span>` : '')
    + `</div>`;
}
