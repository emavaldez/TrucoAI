/**
 * Test de layout "mesa v2" (historia 0-4, AC 12 + AC 14 axe).
 *
 * Para 2/4/6 jugadores × viewports 1440×900, 1280×800 y 390×844: arranca una
 * partida (seed 1), avanza con reloj congelado hasta el turno del humano con
 * cartas jugadas sobre el paño y verifica que ningún asiento ni carta propia
 * sobresalga del viewport, que las cartas jugadas tengan opacity 1 y un tamaño
 * de número legible, y que haya exactamente un asiento activo. Guarda una
 * captura por caso en docs/design/capturas/<players>p-<w>x<h>.png.
 *
 * Además (AC 14): axe-core sobre la mesa de 4 jugadores en desktop y celular,
 * sin violaciones `serious`/`critical`.
 */

import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LegacyDriver } from './driver/legacy';

const FROZEN_TIME = new Date('2026-01-01T00:00:00.000Z');
const NO_MOTION_CSS = '*, *::before, *::after { transition: none !important; animation: none !important; }';
const CAPTURAS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'design', 'capturas');
const SEED = 1;
const STEP_MS = 400;
const MAX_STEPS = 300;

/** Misma fijación de Math.random que `partidas.spec.ts` (semilla → misma partida). */
function installSeededRandom(seed: number): void {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t = Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function openGame(page: Page, seed: number): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: FROZEN_TIME });
  await page.clock.pauseAt(new Date(FROZEN_TIME.getTime() + 60_000));
  await page.addInitScript(installSeededRandom, seed);
  await page.goto('/');
  await page.addStyleTag({ content: NO_MOTION_CSS });
}

/**
 * Avanza el reloj congelado hasta que el humano tenga el turno y existan cartas
 * jugadas en la mesa (o se agote el budget). Devuelve el nº de pasos.
 */
async function advanceToHumanWithTrick(page: Page, driver: LegacyDriver): Promise<void> {
  for (let step = 0; step < MAX_STEPS; step++) {
    await page.clock.runFor(STEP_MS);
    const raw = await driver.observe();
    const state = await page.evaluate(() => ({
      humanTurn: !!document.querySelector('.seat-slot.human-area .seat--active'),
      played: document.querySelectorAll('.played-card').length,
      ack: !!document.querySelector('.btn-notif-ok'),
      nextHand: !!document.querySelector('.btn-new-round'),
    }));
    if (state.ack) { await driver.perform({ kind: 'ack' }); continue; }
    if (state.nextHand) { await driver.perform({ kind: 'next-hand' }); continue; }
    const answer = raw.actions.find((a) => a.kind === 'answer');
    if (answer) { await driver.perform(answer); continue; }
    const call = raw.actions.find((a) => a.kind === 'call' && a.call === 'mazo');
    if (call) { await driver.perform(call); continue; }
    if (state.humanTurn && state.played >= 1) return;
  }
  throw new Error(`no se llegó al turno del humano con cartas jugadas en ${MAX_STEPS} pasos`);
}

interface BoxInfo { opacity: number; fontSize: number; }
interface Bounds { top: number; left: number; right: number; bottom: number; }

async function measure(page: Page): Promise<{
  outOfViewport: string[];
  activeCount: number;
  played: Array<Bounds & BoxInfo>;
  handMinFont: number;
  viewport: { w: number; h: number };
}> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const TOL = 1.5; // subpixel
    const out: string[] = [];
    const check = (label: string, el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.left < -TOL || r.top < -TOL || r.right > vw + TOL || r.bottom > vh + TOL) {
        out.push(`${label} [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
    };
    document.querySelectorAll('.seat-slot').forEach((s, i) =>
      check(`seat-slot#${i} ${s.getAttribute('data-player-id') ?? ''}`, s));
    document.querySelectorAll('.seat-slot.human-area .hand-row .card').forEach((c, i) =>
      check(`hand-card#${i}`, c));
    const played = Array.from(document.querySelectorAll('.seat-played .card')).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const num = el.querySelector('.card-corner .card-number');
      return {
        top: r.top, left: r.left, right: r.right, bottom: r.bottom,
        opacity: Number(cs.opacity),
        fontSize: num ? parseFloat(getComputedStyle(num).fontSize) : 0,
      };
    });
    const handFonts = Array.from(document.querySelectorAll('.seat-slot.human-area .hand-row .card-number'))
      .map((n) => parseFloat(getComputedStyle(n).fontSize));
    return {
      outOfViewport: out,
      activeCount: document.querySelectorAll('.seats-layer .seat--active').length,
      played,
      handMinFont: handFonts.length ? Math.min(...handFonts) : 0,
      viewport: { w: vw, h: vh },
    };
  });
}

/** Pasa la baza a 1 carta jugada (el humano arrastra; si no tiene baza, juega primero). */
async function ensureTrickCards(page: Page, driver: LegacyDriver): Promise<void> {
  let played = await page.evaluate(() => document.querySelectorAll('.played-card').length);
  if (played > 0) return;
  // El humano abre la baza: jugar una carta al azar y esperar la respuesta de la IA.
  const play = (await driver.actions()).find((a) => a.kind === 'play');
  expect(play, 'el humano debe poder jugar una carta en su turno').toBeTruthy();
  await driver.perform(play!);
  for (let step = 0; step < 60 && played === 0; step++) {
    await page.clock.runFor(STEP_MS);
    played = await page.evaluate(() => document.querySelectorAll('.played-card').length);
  }
  expect(played, 'debería haber cartas jugadas sobre el paño').toBeGreaterThan(0);
}

const CASES: Array<[2 | 4 | 6, number, number]> = [
  [2, 1440, 900], [2, 1280, 800], [2, 390, 844],
  [4, 1440, 900], [4, 1280, 800], [4, 390, 844],
  [6, 1440, 900], [6, 1280, 800], [6, 390, 844],
];

for (const [players, w, h] of CASES) {
  test(`layout ${players}p ${w}×${h}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    page.setViewportSize({ width: w, height: h });
    const mobile = w <= 700;
    await openGame(page, SEED);
    const driver = new LegacyDriver(page);
    await driver.start(players);
    await advanceToHumanWithTrick(page, driver);
    await ensureTrickCards(page, driver);

    const m = await measure(page);
    const name = `${players}p-${w}x${h}`;

    // Captura por caso → docs/design/capturas/<name>.png (se comitea).
    const file = path.join(CAPTURAS_DIR, `${name}.png`);
    await page.screenshot({ path: file });
    await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });

    expect(m.outOfViewport, `elementos fuera del viewport (${name})`).toEqual([]);
    expect(m.activeCount, `exactamente un asiento activo (${name})`).toBe(1);
    expect(m.played.length, `cartas jugadas visibles (${name})`).toBeGreaterThan(0);
    for (const pc of m.played) {
      expect(pc.opacity, `opacity de carta jugada (${name})`).toBe(1);
      const minFont = mobile ? 15 : 18;
      expect(pc.fontSize, `tamaño del número de carta jugada (${name})`).toBeGreaterThanOrEqual(minFont);
    }
    expect(m.handMinFont, `número legible en la mano propia (${name})`).toBeGreaterThanOrEqual(mobile ? 15 : 18);
  });
}

for (const [w, h, label] of [[1280, 800, 'desktop'], [390, 844, 'movil']] as const) {
  test(`axe 4p ${label} ${w}×${h}`, async ({ page }) => {
    test.setTimeout(120_000);
    page.setViewportSize({ width: w, height: h });
    await openGame(page, SEED);
    const driver = new LegacyDriver(page);
    await driver.start(4);
    await advanceToHumanWithTrick(page, driver);
    await ensureTrickCards(page, driver);
    // El reloj congelado traba los timers internos de axe: devolver el tiempo real.
    await page.clock.resume();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad, `violaciones axe serious/critical: ${JSON.stringify(bad.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 1)}`).toEqual([]);
  });
}
