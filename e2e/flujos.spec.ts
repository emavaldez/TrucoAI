// Flujos puntuales de la interfaz: doble clic, menú y nueva partida, pausa, teclado, celular acostado.

import { expect, test, type Page } from '@playwright/test';
import { collectErrors, gameUrl } from './helpers';

async function version(page: Page): Promise<number> {
  return page.evaluate(() => Number((document.querySelector('#truco-canvas') as HTMLElement).dataset.version));
}

async function waitHumanPlays(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll('#truco-canvas [data-act^="play:"]').length > 0,
    undefined,
    { timeout: 20_000 },
  );
}

test('desde el menú: elegir 6 jugadores, dificultad y flor, y repartir', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?test=1&fast=1');
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('menu-picapica')).toBeDisabled();
  await page.getByTestId('menu-players-6').click();
  await expect(page.getByTestId('menu-picapica')).toBeEnabled();
  await page.getByTestId('menu-difficulty-hard').click();
  await page.getByTestId('menu-flor').check();
  await page.getByTestId('menu-start').click();
  await expect(page.locator('[data-testid^="seat-"]')).toHaveCount(6);
  const settings = await page.evaluate(() => (window as unknown as { __truco: { settings: () => unknown } }).__truco.settings());
  expect(settings).toEqual({ playerCount: 6, difficulty: 'hard', flor: true, picaPica: true });
  // La elección queda guardada para la próxima vez.
  await page.goto('/?test=1');
  await expect(page.getByTestId('menu-players-6')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('doble clic en un canto aplica una sola acción (no dispara el botón de abajo)', async ({ page }) => {
  // IA lenta: después del canto nadie más actúa durante la prueba.
  await page.goto(gameUrl({ players: 2, seed: 4, fast: false, aiDelay: 4000 }));
  await waitHumanPlays(page);
  const truco = page.locator('[data-act="truco"]');
  if ((await truco.count()) === 0) test.skip(true, 'sin truco disponible en esta semilla');
  const before = await version(page);
  await truco.dblclick();
  await page.waitForTimeout(500);
  expect(await version(page)).toBe(before + 1);
  const state = await page.evaluate(() => (window as unknown as { __truco: { state: () => { phase: string; scores: number[] } } }).__truco.state());
  expect(state.phase).toBe('AWAITING_TRUCO');
  expect(state.scores).toEqual([0, 0]);
});

test('pausa: la IA no juega mientras el menú de la partida está abierto', async ({ page }) => {
  await page.goto(gameUrl({ players: 4, seed: 5, fast: false, aiDelay: 300 }));
  await expect(page.getByTestId('menu-button')).toBeVisible();
  await page.getByTestId('menu-button').click();
  await expect(page.getByTestId('pause')).toBeVisible();
  const paused = await version(page);
  await page.waitForTimeout(1500);
  expect(await version(page)).toBe(paused);
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('pause')).toHaveCount(0);
  // Y sigue: vuelve a haber movimiento o turno del humano.
  await page.waitForFunction(
    (v) => Number((document.querySelector('#truco-canvas') as HTMLElement).dataset.version) !== v ||
      (document.querySelector('#truco-canvas') as HTMLElement).dataset.actor === 'p0',
    paused,
    { timeout: 10_000 },
  );
  await page.getByTestId('menu-button').click();
  await page.getByTestId('to-menu').click();
  await expect(page.getByTestId('menu')).toBeVisible();
});

test('teclado: 1/2/3 juega cartas y Escape pausa', async ({ page }) => {
  await page.goto(gameUrl({ players: 2, seed: 6 }));
  await waitHumanPlays(page);
  const before = await version(page);
  await page.keyboard.press('1');
  await page.waitForFunction((v) => Number((document.querySelector('#truco-canvas') as HTMLElement).dataset.version) > v, before);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toHaveCount(0);
});

test('celular acostado muy bajo: pide girar el teléfono', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test=1');
  await expect(page.getByRole('alert')).toContainText('Girá el teléfono');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
