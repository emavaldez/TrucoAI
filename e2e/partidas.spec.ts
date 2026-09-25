// Partidas completas en el navegador (gate `partidas`): 2, 4 y 6 jugadores (y con flor),
// jugando con clics sobre la UI real hasta el fin de partida, sin trabas ni errores.
// Semillas: PARTIDAS_SEEDS=1,2,3 (default).

import { expect, test } from '@playwright/test';
import { collectErrors, gameUrl, playMatch, type StartOptions } from './helpers';

const SEEDS = (process.env.PARTIDAS_SEEDS ?? '1,2,3')
  .split(',')
  .map((raw) => Number.parseInt(raw.trim(), 10))
  .filter((seed) => Number.isFinite(seed));

const MODES: Array<Omit<StartOptions, 'seed'> & { label: string }> = [
  { label: '2p', players: 2 },
  { label: '4p', players: 4 },
  { label: '6p', players: 6 },
  { label: '4p con flor', players: 4, flor: true },
  { label: '6p con flor y sin pica-pica', players: 6, flor: true, picaPica: false },
];

for (const mode of MODES) {
  for (const seed of SEEDS) {
    test(`partida completa ${mode.label} seed ${seed}`, async ({ page }) => {
      test.setTimeout(240_000);
      const errors = collectErrors(page);
      await page.goto(gameUrl({ ...mode, seed }));
      const result = await playMatch(page, seed);
      expect(Math.max(...result.scores)).toBe(30);
      expect(Math.min(...result.scores)).toBeLessThan(30);
      expect(result.hands).toBeGreaterThanOrEqual(1);
      await expect(page.getByTestId('history')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

test('determinismo: la misma semilla da la misma partida', async ({ browser }) => {
  test.setTimeout(240_000);
  const hashes: string[] = [];
  for (let run = 0; run < 2; run++) {
    const page = await browser.newPage();
    await page.goto(gameUrl({ players: 4, seed: 7 }));
    hashes.push((await playMatch(page, 7, { check: false })).historyHash);
    await page.close();
  }
  expect(hashes[0]).toBe(hashes[1]);
});

for (const players of [2, 4, 6] as const) {
  test(`nueva partida después de terminar (${players}p)`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await page.goto(gameUrl({ players, seed: 11 }));
    await playMatch(page, 11, { check: false });
    await page.getByTestId('play-again').click();
    await expect(page.getByTestId('game-over')).toHaveCount(0);
    // Partida nueva: mano 1 y marcador de cero (en modo rápido la IA ya puede haber sumado algo en la mano 1).
    await expect(page.getByTestId('hand-number')).toHaveText('Mano 1');
    const fresh = await page.evaluate(() => (window as unknown as { __truco: { state: () => { history: unknown[]; scores: number[] } } }).__truco.state());
    expect(fresh.history.length).toBeLessThanOrEqual(1);
    expect(Math.max(...fresh.scores)).toBeLessThan(30);
    // Y la partida nueva también se puede jugar entera.
    await playMatch(page, 12, { check: false });
    await page.getByTestId('change-rules').click();
    await expect(page.getByTestId('menu')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
