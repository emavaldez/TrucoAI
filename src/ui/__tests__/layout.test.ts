/**
 * Tests unitarios de la fórmula de asientos (historia 0-4, AC 3):
 * ningún asiento queda fuera de 1280×800 (desktop) ni de 390×844 (celular),
 * humano abajo, y slot correcto por cantidad de jugadores.
 */

import { describe, it, expect } from 'vitest';
import { seatPosition, tableEllipse, SLOT_ANGLES } from '../layout.js';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const SEAT = { seatWidth: 200, seatHeight: 72 };
const COMPACT = { seatWidth: 118, seatHeight: 54 };

function inViewport(pt: { x: number; y: number }, vp: typeof DESKTOP, seat: typeof SEAT) {
  return (
    pt.x >= 0 &&
    pt.y >= 0 &&
    pt.x + seat.seatWidth <= vp.width &&
    pt.y + seat.seatHeight <= vp.height
  );
}

describe('layout — seatPosition (AC 3)', () => {
  for (const players of [2, 4, 6]) {
    it(`[UI-13] ${players}p desktop 1280×800: todos los asientos adentro`, () => {
      for (let i = 0; i < players; i++) {
        const pt = seatPosition(i, players, DESKTOP, SEAT);
        expect(inViewport(pt, DESKTOP, SEAT), `asiento ${i} afuera: ${pt.x},${pt.y}`).toBe(true);
      }
    });

    it(`[UI-14] ${players}p celular 390×844: asientos compactos adentro`, () => {
      for (let i = 0; i < players; i++) {
        const pt = seatPosition(i, players, PHONE, COMPACT);
        expect(inViewport(pt, PHONE, COMPACT), `asiento ${i} afuera: ${pt.x},${pt.y}`).toBe(true);
      }
    });
  }

  it('el humano (posición 0) siempre está abajo: su y es la mayor', () => {
    for (const players of [2, 4, 6]) {
      const seats = Array.from({ length: players }, (_, i) => seatPosition(i, players, DESKTOP, SEAT));
      const maxY = Math.max(...seats.map((s) => s.y));
      expect(seats[0].y).toBe(maxY);
    }
  });

  it('4p: compañero arriba, rivales a los lados', () => {
    const seats = [0, 1, 2, 3].map((i) => seatPosition(i, 4, DESKTOP, SEAT));
    expect(seats[1].y).toBeLessThan(seats[2].y); // compañero más arriba que rivales
    const angles = [0, 1, 2, 3].map((i) => seatPosition(i, 4, DESKTOP, SEAT).angle);
    expect(angles).toEqual(SLOT_ANGLES[4]);
    expect(angles[2]).toBe(180); // rival izquierdo
    expect(angles[3]).toBe(0);   // rival derecho
  });

  it('6p: los 5 rivales/compañeros ocupan 8, 10, 12, 2 y 4 horas', () => {
    const angles = [0, 1, 2, 3, 4, 5].map((i) => seatPosition(i, 6, DESKTOP, SEAT).angle);
    expect(angles.slice(1).sort((a, b) => a - b)).toEqual([30, 150, 210, 270, 330]);
  });

  it('equipos alternados alrededor de la mesa (i % 2)', () => {
    for (const players of [4, 6]) {
      const angles = Array.from({ length: players }, (_, i) => seatPosition(i, players, DESKTOP, SEAT).angle);
      for (let i = 0; i < players; i++) {
        const next = (i + 1) % players;
        expect(angles[i]).not.toBe(angles[next]);
        expect(i % 2).not.toBe(next % 2);
      }
    }
  });

  it('la elipse se deriva proporcionalmente del viewport', () => {
    const big = tableEllipse({ width: 1440, height: 900 });
    expect(big.cx).toBe(720);
    expect(big.rx).toBeCloseTo(600, 0);
    // A 1920×1200 todo es proporcional (sin clamp): rx = 0.4167w, ry = 0.3h.
    const wide = tableEllipse({ width: 2880, height: 1800 }, SEAT);
    expect(wide.rx).toBeCloseTo(big.rx * 2, 0);
    expect(wide.ry).toBeCloseTo(big.ry * 2, 0);
    // En viewport chico el radio se clampa para que el asiento entre (nunca afuera).
    const small = tableEllipse({ width: 720, height: 450 }, SEAT);
    expect(small.rx).toBeLessThan(300);
    const corner = seatPosition(3, 4, { width: 720, height: 450 }, SEAT);
    expect(inViewport(corner, { width: 720, height: 450 }, SEAT)).toBe(true);
  });

  it('rechaza cantidades de jugadores no soportadas', () => {
    expect(() => seatPosition(0, 3, DESKTOP)).toThrow();
    expect(() => seatPosition(9, 4, DESKTOP)).toThrow();
  });
});
