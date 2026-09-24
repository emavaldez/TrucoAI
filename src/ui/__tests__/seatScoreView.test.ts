// @vitest-environment jsdom
/**
 * Tests unitarios de asiento y marcador (historia 0-4, AC 3 y AC 5).
 */

import { describe, it, expect } from 'vitest';
import { renderSeat, seatInitials } from '../seatView.js';
import { renderScore, matchGroupsFor } from '../scoreView.js';

describe('seatView — asiento (Seat.dc.html)', () => {
  it('[UI-14] expose data-player-id, data-team y data-testid del contrato', () => {
    const host = document.createElement('div');
    host.innerHTML = renderSeat({ label: 'Rival 1', team: 1, cards: 3, playerId: 'player-2' });
    const seat = host.querySelector<HTMLElement>('[data-testid="seat-player-2"]');
    expect(seat).not.toBeNull();
    expect(seat?.getAttribute('data-player-id')).toBe('player-2');
    expect(seat?.getAttribute('data-team')).toBe('ellos');
  });

  it('iniciales: "Rival 1" → R1, "Compañero 2" → C2; humano → VOS', () => {
    expect(seatInitials('Rival 1')).toBe('R1');
    expect(seatInitials('Compañero 2')).toBe('C2');
    expect(seatInitials('Jugador')).toBe('J'); // como Seat.dc.html: por palabra, máx 2
    expect(seatInitials('Rival Uno')).toBe('RU');
    const host = document.createElement('div');
    host.innerHTML = renderSeat({ label: 'Vos', team: 0, cards: 3, you: true, playerId: 'player-0' });
    expect(host.querySelector('.seat-avatar')?.textContent).toBe('VOS');
  });

  it('activo: borde dorado vía clase y etiqueta "Juega"/"Tu turno"', () => {
    const host = document.createElement('div');
    host.innerHTML =
      renderSeat({ label: 'Rival 1', team: 1, cards: 3, active: true, playerId: 'p1' })
      + renderSeat({ label: 'Vos', team: 0, cards: 3, active: true, you: true, playerId: 'p0' });
    const seats = host.querySelectorAll('.seat--active');
    expect(seats.length).toBe(2);
    const tags = [...host.querySelectorAll('.seat-active-tag')].map((t) => t.textContent);
    expect(tags).toContain('Juega');
    expect(tags).toContain('Tu turno');
    expect(seats[0].getAttribute('data-active')).toBe('true');
  });

  it('dorsos: un .seat-back por carta restante (máx 3), ninguno con 0 cartas', () => {
    const host = document.createElement('div');
    host.innerHTML =
      renderSeat({ label: 'A', team: 1, cards: 3, playerId: 'a' })
      + renderSeat({ label: 'B', team: 1, cards: 0, playerId: 'b' });
    const [with3, with0] = host.querySelectorAll('.seat');
    expect(with3.querySelectorAll('.seat-back').length).toBe(3);
    expect(with0.querySelectorAll('.seat-back').length).toBe(0);
  });

  it('insignias Mano/Da con data-* para el contrato', () => {
    const host = document.createElement('div');
    host.innerHTML = renderSeat({ label: 'Rival 1', team: 1, cards: 3, mano: true, dealer: true, playerId: 'p1' });
    const seat = host.querySelector('.seat')!;
    expect(seat.getAttribute('data-mano')).toBe('true');
    expect(seat.getAttribute('data-dealer')).toBe('true');
    const pills = [...seat.querySelectorAll('.seat-pill')].map((p) => p.textContent);
    expect(pills).toEqual(['Mano', 'Da']);
  });

  it('pica-pica: asiento fuera de submano se atenúa con clase (opacity en CSS, no inline)', () => {
    const html = renderSeat({ label: 'Compañero 1', team: 0, cards: 3, dim: true, playerId: 'p4' });
    expect(html).toContain('seat--dim');
  });

  it('escapea el nombre del jugador (sin HTML inyectado)', () => {
    const host = document.createElement('div');
    host.innerHTML = renderSeat({ label: '<img src=x>', team: 1, cards: 1, playerId: 'x' });
    expect(host.querySelector('img')).toBeNull();
  });
});

describe('scoreView — marcador (Score.dc.html)', () => {
  it('[UI-16] Nosotros/Ellos con número y malas/buenas; testids del contrato', () => {
    const host = document.createElement('div');
    host.innerHTML = renderScore({ nos: 17, ellos: 14 });
    expect(host.querySelector('[data-testid="scoreboard"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="score-team-0"]')?.textContent).toBe('17');
    expect(host.querySelector('[data-testid="score-team-1"]')?.textContent).toBe('14');
    const labels = [...host.querySelectorAll('.score-team-label')].map((l) => l.textContent);
    expect(labels).toEqual(['Nosotros', 'Ellos']);
    const halves = [...host.querySelectorAll('.score-team-half')].map((h) => h.textContent);
    expect(halves).toEqual(['buenas', 'malas']);
  });

  it('`.team-points` presente para el driver legacy (orden team0, team1)', () => {
    const host = document.createElement('div');
    host.innerHTML = renderScore({ nos: 5, ellos: 9 });
    const points = [...host.querySelectorAll('.team-points')].map((el) => el.textContent);
    expect(points).toEqual(['5', '9']);
  });

  it('fósforos: 6 grupos de 5 por equipo, con separación entre malas y buenas', () => {
    const host = document.createElement('div');
    host.innerHTML = renderScore({ nos: 17, ellos: 14 });
    const sticks = host.querySelectorAll('.score-sticks svg');
    expect(sticks.length).toBe(12);
    expect(host.querySelectorAll('.match--gap').length).toBe(2);
  });

  it('matchGroupsFor reparte el puntaje en grupos de 5', () => {
    expect(matchGroupsFor(17).map((g) => g.on)).toEqual([5, 5, 5, 2, 0, 0]);
    expect(matchGroupsFor(0).map((g) => g.on)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(matchGroupsFor(30).map((g) => g.on)).toEqual([5, 5, 5, 5, 5, 5]);
  });

  it('[UI-16] compacto (celular): sin fósforos', () => {
    const host = document.createElement('div');
    host.innerHTML = renderScore({ nos: 17, ellos: 14, compact: true });
    expect(host.querySelector('.scoreboard-v2--compact')).not.toBeNull();
    expect(host.querySelectorAll('.score-sticks').length).toBe(0);
  });
});
