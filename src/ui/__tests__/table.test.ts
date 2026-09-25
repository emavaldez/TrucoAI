// La mesa se deriva del motor (historias 3-2, 3-4): cada acción legal del humano tiene su botón
// o carta, y no hay botón que el motor vaya a rechazar. Se recorre con estados reales de partidas.

import { describe, expect, it } from 'vitest';
import { createPolicy } from '../../ai/policy.js';
import { applyAction, createMatch, createRng, getActor, getLegalActions, getObservation, startNextHand } from '../../engine/index.js';
import type { MatchState } from '../../engine/index.js';
import { EventLog } from '../eventLog.js';
import { CANVAS, canvasScale, chooseLayout, tableGeometry, type LayoutMode } from '../layout.js';
import { decodeAction, encodeAction, renderScore } from '../pieces.js';
import { renderGameOver, renderHandSummary, renderMenu } from '../screens.js';
import { renderGame } from '../table.js';

function states(playerCount: 2 | 4 | 6, flor: boolean, count: number, seed: number): MatchState[] {
  const policy = createPolicy('normal');
  const out: MatchState[] = [];
  let game = 0;
  while (out.length < count) {
    let state = createMatch({ rules: { playerCount, flor }, seed: seed + game });
    const rng = createRng(seed + game);
    game += 1;
    while (state.phase !== 'MATCH_OVER' && out.length < count) {
      out.push(state);
      if (state.phase === 'HAND_OVER') {
        state = startNextHand(state).state;
        continue;
      }
      const actor = getActor(state) as string;
      const result = applyAction(state, actor, policy.decide(getObservation(state, actor), rng));
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    out.push(state);
  }
  return out;
}

function actsIn(html: string): string[] {
  return [...html.matchAll(/data-act="([^"]+)"/g)].map((match) => match[1]);
}

const SETTINGS = { playerCount: 4 as const, difficulty: 'normal' as const, flor: false, picaPica: true };

describe('renderGame', () => {
  for (const [players, flor] of [
    [2, false],
    [4, false],
    [6, false],
    [4, true],
  ] as const) {
    for (const mode of ['desktop', 'portrait'] as LayoutMode[]) {
      it(`${players}p${flor ? ' con flor' : ''} ${mode}: botones = acciones legales del humano`, () => {
        for (const state of states(players, flor, 400, 300 + players)) {
          const actor = getActor(state);
          const legal = getLegalActions(state, 'p0');
          const html = renderGame({
            state,
            settings: { ...SETTINGS, playerCount: players, flor },
            mode,
            legal,
            actor,
            log: new EventLog(),
            now: 0,
          });
          const acts = actsIn(html);
          // Nada que el motor vaya a rechazar.
          for (const code of acts) expect(decodeAction(code, legal), `${code} en fase ${state.phase}`).toBeDefined();
          // Y todo lo legal tiene su botón (la flor obligatoria la canta la interfaz sola).
          const expected = legal.filter((action) => action.type !== 'DECLARE_FLOR').map(encodeAction);
          expect(new Set(acts)).toEqual(new Set(expected));
          // Nunca se muestran las cartas de otro jugador.
          for (const seat of state.seats) {
            if (seat.isHuman) continue;
            for (const card of state.hand.hands[seat.id]) {
              expect(html.includes(`hand-card-${card.id}`)).toBe(false);
            }
          }
        }
      });
    }
  }

  it('resumen y fin de partida se dibujan con el historial', () => {
    const all = states(4, false, 2000, 77);
    const handOver = all.find((state) => state.phase === 'HAND_OVER');
    const matchOver = all.find((state) => state.phase === 'MATCH_OVER');
    expect(handOver).toBeDefined();
    expect(matchOver).toBeDefined();
    if (!handOver || !matchOver) return;
    const log = new EventLog();
    expect(renderHandSummary(handOver, log, false, 'desktop')).toContain('data-testid="next-hand"');
    const over = renderGameOver(matchOver, SETTINGS, log, 'portrait');
    expect(over).toContain('data-testid="play-again"');
    expect((over.match(/hist-row"/g) ?? []).length).toBe(matchOver.history.length);
  });

  it('menú: jugadores, dificultad, flor y pica-pica (solo con 6)', () => {
    const html = renderMenu({ playerCount: 4, difficulty: 'hard', flor: true, picaPica: true }, 'desktop');
    expect(html).toContain('data-ui="players:6"');
    expect(html).toMatch(/data-testid="menu-picapica"[^>]* disabled/);
    expect(renderMenu({ playerCount: 6, difficulty: 'easy', flor: false, picaPica: true }, 'portrait')).not.toMatch(/data-testid="menu-picapica"[^>]* disabled/);
  });

  it('marcador con fósforos: 6 grupos por equipo, compacto sin fósforos', () => {
    const full = renderScore([17, 3], false);
    expect((full.match(/class="matches"/g) ?? []).length).toBe(12);
    expect(renderScore([17, 3], true)).not.toContain('class="matches"');
  });
});

describe('layout', () => {
  it('elige celular para ventanas altas y escritorio para anchas', () => {
    expect(chooseLayout(390, 844)).toBe('portrait');
    expect(chooseLayout(1280, 800)).toBe('desktop');
    expect(chooseLayout(768, 1024)).toBe('portrait');
  });

  it('el lienzo escalado entra entero en la ventana', () => {
    for (const [w, h] of [
      [1440, 900],
      [1280, 800],
      [1024, 640],
      [390, 844],
      [360, 740],
      [768, 1024],
    ]) {
      const mode = chooseLayout(w, h);
      const scale = canvasScale(mode, w, h);
      expect(CANVAS[mode].w * scale).toBeLessThanOrEqual(w + 0.01);
      expect(CANVAS[mode].h * scale).toBeLessThanOrEqual(h + 0.01);
    }
  });

  it('todos los asientos y cartas jugadas quedan dentro del lienzo, sin encimarse', () => {
    for (const mode of ['desktop', 'portrait'] as LayoutMode[]) {
      for (const players of [2, 4, 6] as const) {
        const geo = tableGeometry(mode, players);
        expect(geo.slots).toHaveLength(players);
        const canvas = CANVAS[mode];
        const card = mode === 'desktop' ? { w: 84, h: 126 } : { w: 64, h: 96 };
        const boxes = geo.slots.map((slot) => ({ x: slot.card.x, y: slot.card.y, w: card.w, h: card.h }));
        for (const [index, slot] of geo.slots.entries()) {
          if (!(mode === 'portrait' && index === 0)) {
            expect(slot.seat.x).toBeGreaterThanOrEqual(0);
            expect(slot.seat.x + geo.seatSize.w).toBeLessThanOrEqual(canvas.w);
            expect(slot.seat.y + geo.seatSize.h).toBeLessThanOrEqual(canvas.h);
          }
          // Cada carta jugada, dentro del paño.
          expect(slot.card.x).toBeGreaterThanOrEqual(geo.felt.x);
          expect(slot.card.x + card.w).toBeLessThanOrEqual(geo.felt.x + geo.felt.w);
          expect(slot.card.y).toBeGreaterThanOrEqual(geo.felt.y);
          expect(slot.card.y + card.h).toBeLessThanOrEqual(geo.felt.y + geo.felt.h);
        }
        for (let a = 0; a < boxes.length; a++) {
          for (let b = a + 1; b < boxes.length; b++) {
            const A = boxes[a];
            const B = boxes[b];
            const overlap = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
            expect(overlap, `${mode} ${players}p cartas ${a} y ${b} se enciman`).toBe(false);
          }
        }
      }
    }
  });
});

describe('señas en la mesa', () => {
  const state = createMatch({ rules: { playerCount: 4 }, seed: 4 });
  const base = {
    state,
    settings: SETTINGS,
    legal: [],
    actor: null,
    log: new EventLog(),
    now: 0,
  };
  const partnerCard = state.hand.dealt.p2[0];

  for (const mode of ['desktop', 'portrait'] as const) {
    it(`${mode}: se ven las señas del compañero y el botón para hacer las tuyas`, () => {
      const html = renderGame({
        ...base,
        mode,
        signals: [
          { from: 'p2', kind: 'ANCHO_ESPADA', cardId: '1-espada' },
          { from: 'p2', kind: 'ENVIDO', cardId: null },
          { from: 'p0', kind: 'NADA', cardId: null },
        ],
        signOptions: ['TRES'],
        signsOpen: true,
      });
      expect(html).toContain('data-testid="signs-p2"');
      expect(html).toContain('data-sign="ANCHO_ESPADA"');
      expect(html).toContain('data-sign="ENVIDO"');
      expect(html).toContain('data-testid="signs-button"');
      expect(html).toContain('data-testid="sign-picker"');
      expect(html).toContain('data-ui="sign:TRES"');
      // Tus propias señas nunca aparecen como "señas de" alguien.
      expect(html).not.toContain('data-testid="signs-p0"');
    });
  }

  it('una seña de carta se deja de ver cuando esa carta se juega', () => {
    const signal = { from: 'p2', kind: 'TRES' as const, cardId: partnerCard.id };
    const played: MatchState = {
      ...state,
      hand: { ...state.hand, currentTrick: { ...state.hand.currentTrick, plays: [{ playerId: 'p2', card: partnerCard }] } },
    };
    const before = renderGame({ ...base, mode: 'desktop', signals: [signal] });
    const after = renderGame({ ...base, state: played, mode: 'desktop', signals: [signal] });
    expect(before).toContain('data-testid="signs-p2"');
    expect(after).not.toContain('data-testid="signs-p2"');
  });

  it('el pie de la mano se marca como "Pie"', () => {
    const html = renderGame({ ...base, mode: 'desktop' });
    expect(html).toContain('>Pie<');
    expect(html).not.toContain('>Da<');
  });
});
