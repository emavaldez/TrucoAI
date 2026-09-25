// Globos de los tantos: se dicen de a uno, en orden, y el ganador queda para mostrar sus cartas.

import { describe, expect, it } from 'vitest';
import { createMatch } from '../../engine/index.js';
import { EventLog } from '../eventLog.js';

describe('EventLog — cantar los tantos', () => {
  it('cada dicho aparece después del anterior y el aviso llega al final', () => {
    const state = createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 3 });
    const log = new EventLog();
    log.sayingGap = 900;
    log.ingest(
      [
        {
          type: 'ENVIDO_RESOLVED',
          winnerTeam: 0,
          points: 2,
          revealed: [{ playerId: 'p0', score: 30 }],
          sayings: [
            { playerId: 'p0', kind: 'SCORE', score: 30 },
            { playerId: 'p1', kind: 'ME_DIO', against: 30 },
            { playerId: 'p3', kind: 'SON_BUENAS', against: 30 },
          ],
          winnerId: 'p0',
        },
      ],
      state,
      1000,
    );
    expect(log.bubbles.map((b) => [b.playerId, b.text, b.from])).toEqual([
      ['p0', '30', 1000],
      ['p1', 'Me dio', 1900],
      ['p3', 'Son buenas', 2800],
    ]);
    expect(log.notice?.from).toBe(1000 + 3 * 900);
    expect(EventLog.visible(log.bubbles[1], 1500)).toBe(false);
    expect(EventLog.visible(log.bubbles[1], 2000)).toBe(true);
    expect(log.nextExpiry(1500)).toBe(1900);
    expect(log.envidoShow).toEqual([{ playerId: 'p0', score: 30, submano: null }]);
  });
});
