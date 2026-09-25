// Layout y accesibilidad (historias 3-4, 0-4 AC 12): 2/4/6 jugadores en escritorio y celular.
// Arranca la partida, espera el turno del humano y verifica que todo lo importante se vea entero.
// Guarda capturas en docs/design/capturas/ (se commitean para revisar el diseño).

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, gameUrl } from './helpers';

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
];

async function waitHumanTurn(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLElement>('#truco-canvas');
    return canvas?.dataset.actor === 'p0' && document.querySelectorAll('#truco-canvas [data-act]').length > 0;
  }, undefined, { timeout: 20_000 });
}

async function allInside(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) {
        out.push(`${el.dataset.testid ?? el.className} fuera: ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`);
      }
    }
    return out;
  }, selector);
}

for (const players of [2, 4, 6] as const) {
  for (const vp of VIEWPORTS) {
    test(`layout ${players}p ${vp.w}×${vp.h}`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(gameUrl({ players, seed: 1 }));
      await waitHumanTurn(page);
      await page.waitForTimeout(300);

      expect(await allInside(page, '[data-testid^="seat-"], [data-testid^="hand-card-"], .act, .played, [data-testid="scoreboard"]')).toEqual([]);
      // Las cartas propias tienen tamaño de sobra para leerse, y el número de las jugadas también.
      const sizes = await page.evaluate(() => {
        const hand = [...document.querySelectorAll<HTMLElement>('[data-testid^="hand-card-"]')].map((el) => el.getBoundingClientRect().height);
        const numbers = [...document.querySelectorAll<HTMLElement>('.played .card-number')].map((el) => el.getBoundingClientRect().height);
        return { hand, numbers };
      });
      for (const h of sizes.hand) expect(h).toBeGreaterThanOrEqual(120);
      for (const h of sizes.numbers) expect(h).toBeGreaterThanOrEqual(14);
      // Botones táctiles de al menos 44 px (en pantalla).
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.act, .icon-btn')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height < 44 * Math.min(1, window.innerWidth / 390) - 0.5).length,
      );
      if (vp.w <= 400) expect(small).toBe(0);
      // Un solo asiento activo (en celular el humano no tiene asiento: su turno lo dice la píldora).
      await expect(page.locator('#truco-canvas [data-testid="status"]')).toContainText(/Te toca|Respondé/);
      // Si hay panel de respuesta, entra entero y no tapa ningún asiento.
      expect(await allInside(page, '[data-testid="response-panel"]')).toEqual([]);
      const covered = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="response-panel"]')?.getBoundingClientRect();
        if (!panel) return [];
        return [...document.querySelectorAll<HTMLElement>('[data-testid^="seat-"]')]
          .filter((seat) => {
            const r = seat.getBoundingClientRect();
            return r.left < panel.right && panel.left < r.right && r.top < panel.bottom && panel.top < r.bottom;
          })
          .map((seat) => seat.dataset.testid);
      });
      expect(covered).toEqual([]);
      await page.screenshot({ path: `docs/design/capturas/${players}p-${vp.w}x${vp.h}.png` });
      expect(errors).toEqual([]);
    });
  }
}

for (const vp of [
  { w: 1440, h: 900, name: 'escritorio' },
  { w: 390, h: 844, name: 'celular' },
]) {
  test(`accesibilidad: mesa de 4 en ${vp.name} y menú sin violaciones serias`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/?test=1');
    const menu = await new AxeBuilder({ page }).analyze();
    expect(menu.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
    await page.goto(gameUrl({ players: 4, seed: 3 }));
    await waitHumanTurn(page);
    await page.waitForTimeout(400); // que terminen las animaciones de entrada
    const table = await new AxeBuilder({ page }).analyze();
    expect(table.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });
}
