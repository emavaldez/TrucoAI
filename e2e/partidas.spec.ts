/**
 * Test de partidas completas 2/4/6 jugadores (historia 0-2, gate `partidas` de `wf`).
 *
 * Cada test juega una partida entera con el bot de `e2e/bot.ts` sobre la UI real
 * (`vite preview`). El juego se maneja con **reloj congelado** (`page.clock.install()` +
 * `page.clock.pauseAt()`): el tiempo del juego avanza SOLO con `page.clock.runFor(400)`,
 * así que los `setTimeout` de la IA se disparan siempre en el mismo orden y la partida
 * es reproducible entre corridas y entre máquinas (auditoría ciclo 1).
 *
 * Detecta: trabas (75 pasos sin acción y con la pantalla idéntica), marcador que baja,
 * partidas demasiado cortas (< 5 manos), fin de partida sin ganador, "Nuevo juego" que
 * no reinicia y errores de página/consola. Cada test imprime y adjunta la **firma** de
 * la partida (hash de la secuencia acción + marcador) y el test `determinismo 4p seed 7`
 * exige que la misma partida jugada dos veces dé la misma firma.
 *
 * Los tests que fallan por bugs ya auditados llevan `@conocido-<ID>` en el título:
 * `npm run test:partidas` los saltea (`--grep-invert @conocido`).
 */

import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { Bot } from './bot';
import { LegacyDriver } from './driver/legacy';
import type { DriverAction } from './driver/types';
import { MatchSignature } from './signature';

const PLAYER_COUNTS = [2, 4, 6] as const;
type PlayerCount = (typeof PLAYER_COUNTS)[number];

/** La misma URL de `playwright.config.ts` (la segunda pestaña del test de determinismo no usa `baseURL`). */
const BASE_URL = 'http://127.0.0.1:4173';

/** Hora fija del reloj falso: nada de la partida puede depender de la hora real. */
const FROZEN_TIME = new Date('2026-01-01T00:00:00.000Z');
/** Sin transiciones ni animaciones: la visibilidad de los botones no depende del tiempo real. */
const NO_MOTION_CSS = '*, *::before, *::after { transition: none !important; animation: none !important; }';

const STEP_MS = 400;
const MAX_STEPS = 4_000;
const HAND_STEPS = 300;
const STALL_STEPS = 75;
const TARGET_SCORE = 30;
/** Una partida que vale como partida (auditoría ciclo 1): menos manos = partida degenerada. */
const MIN_HANDS = 5;
/** Semilla fija del test de determinismo (auditoría ciclo 1). */
const DETERMINISM_SEED = 7;

const SEEDS = (process.env.PARTIDAS_SEEDS ?? '1,2,3')
  .split(',')
  .map((raw) => Number.parseInt(raw.trim(), 10))
  .filter((seed) => Number.isFinite(seed));

/**
 * Fallas ya auditadas (AC 7): se etiquetan en el título y `test:partidas` las saltea
 * con `--grep-invert @conocido`. Medidas sobre el código de `main` (salida de
 * `npm run test:partidas:todo` pegada en el Dev Agent Record).
 *
 * - `6p`: el turno queda en una IA que nunca juega en cuanto arranca el pica-pica
 *   ([UI-02] / [AI-04]) → **todas** las partidas de 6p, sea cual sea la semilla.
 * - `nueva partida`: "Nuevo juego" no resetea y la pantalla sigue en el fin de partida
 *   ([UI-01]) en las tres cantidades.
 * 2p, 4p y `determinismo 4p seed 7` **no** llevan etiqueta.
 */
const KNOWN_FAILURE_PREFIXES: Array<[string, string]> = []; // 0-3: sin fallas conocidas

function knownTag(key: string): string {
  const match = KNOWN_FAILURE_PREFIXES.find(([prefix]) => key.startsWith(prefix));
  return match ? ` @conocido-${match[1]}` : '';
}

function describeAction(action: DriverAction): string {
  switch (action.kind) {
    case 'play':
      return `play#${action.index}`;
    case 'call':
      return `call:${action.call}`;
    case 'answer':
      return `answer:${action.answer}`;
    default:
      return action.kind;
  }
}

/** Fija `Math.random` en la página: mismo seed → misma partida (el legacy es random). */
function installSeededRandom(seed: number): void {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PageIssues {
  errors: string[];
  consoleErrors: string[];
}

function watchPageIssues(page: Page): PageIssues {
  const issues: PageIssues = { errors: [], consoleErrors: [] };
  page.on('pageerror', (error) => issues.errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.consoleErrors.push(message.text());
  });
  return issues;
}

async function attachEvidence(testInfo: TestInfo, page: Page, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

async function failWithEvidence(testInfo: TestInfo, page: Page, name: string, message: string): Promise<never> {
  await attachEvidence(testInfo, page, name);
  throw new Error(message);
}

interface MatchResult {
  steps: number;
  scores: [number, number];
  gameOver: boolean;
  hands: number;
  /** Hash corto de la secuencia (acción del bot + marcador) de toda la partida. */
  signature: string;
  /** Secuencia completa, como evidencia adjunta. */
  sequence: string;
}

/**
 * Deja la página lista para jugar: reloj congelado, `Math.random` sembrado, sin
 * animaciones. El orden importa: `clock.install()` y los `initScript` van ANTES de `goto`.
 */
async function openGame(page: Page, seed: number): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: FROZEN_TIME });
  await page.clock.pauseAt(new Date(FROZEN_TIME.getTime() + 60_000));
  await page.addInitScript(installSeededRandom, seed);
  await page.goto('/');
  await page.addStyleTag({ content: NO_MOTION_CSS });
}

/** Juega hasta el fin de partida o hasta detectar una traba. */
async function playUntilGameOver(
  page: Page,
  testInfo: TestInfo,
  driver: LegacyDriver,
  seed: number,
  players: PlayerCount,
): Promise<MatchResult> {
  const bot = new Bot(seed);
  const signature = new MatchSignature(`${players}p seed ${seed}`);
  const recentActions: string[] = [];

  let observation = await driver.observe();
  let scores = observation.scores;
  let snapshot = observation.snapshot;
  let idleSteps = 0;
  let frozenSteps = 0;
  let steps = 0;

  for (steps = 1; steps <= MAX_STEPS; steps++) {
    await page.clock.runFor(STEP_MS);
    observation = await driver.observe();

    if (observation.gameOver) {
      signature.record(steps, 'game-over', observation.scores);
      return {
        steps,
        scores: observation.scores,
        gameOver: true,
        hands: observation.handsPlayed,
        signature: signature.digest(),
        sequence: signature.text(),
      };
    }

    const previous = scores;
    scores = observation.scores;
    if (previous[0] >= 0 && scores[0] >= 0 && (scores[0] < previous[0] || scores[1] < previous[1])) {
      await failWithEvidence(
        testInfo,
        page,
        `marcador-${players}p-seed-${seed}`,
        `El marcador bajó en ${players}p seed ${seed} (paso ${steps}): ` +
          `${previous[0]}-${previous[1]} → ${scores[0]}-${scores[1]}`,
      );
    }

    const decision = bot.next(observation.actions);
    const acted = decision ? await driver.perform(decision) : false;
    signature.record(steps, decision && acted ? describeAction(decision) : null, scores);
    if (decision && acted) recentActions.push(describeAction(decision));

    frozenSteps = observation.snapshot === snapshot ? frozenSteps + 1 : 0;
    snapshot = observation.snapshot;
    idleSteps = acted ? 0 : idleSteps + 1;

    if (idleSteps >= STALL_STEPS && frozenSteps >= STALL_STEPS) {
      await failWithEvidence(
        testInfo,
        page,
        `traba-${players}p-seed-${seed}`,
        [
          `TRABA: partida de ${players}p trabada (seed ${seed}) en el paso ${steps}`,
          `  marcador: ${scores[0]}-${scores[1]}`,
          `  turno: ${observation.turnSeat}`,
          `  pasos sin acción del bot: ${idleSteps} (${(idleSteps * STEP_MS) / 1000}s de reloj de juego)`,
          `  firma: ${signature.digest()}`,
          `  últimas ${Math.min(recentActions.length, 12)} acciones: ${recentActions.slice(-12).join(' → ') || '(ninguna)'}`,
        ].join('\n'),
      );
    }
  }

  return {
    steps: MAX_STEPS,
    scores,
    gameOver: false,
    hands: 0,
    signature: signature.digest(),
    sequence: signature.text(),
  };
}

function expectNoPageIssues(issues: PageIssues, label: string): void {
  expect(issues.errors, `${label}: errores de página (pageerror):\n${issues.errors.join('\n')}`).toEqual([]);
  expect(
    issues.consoleErrors,
    `${label}: errores de consola (console.error):\n${issues.consoleErrors.join('\n')}`,
  ).toEqual([]);
}

/** Log + adjunto de la firma de la partida (auditoría ciclo 1: firma por test). */
async function reportSignature(
  testInfo: TestInfo,
  name: string,
  result: MatchResult,
  players: PlayerCount,
  seed: number,
  prefix: string,
): Promise<void> {
  console.log(
    `${prefix} ${players}p seed ${seed}: ${result.scores[0]}-${result.scores[1]} en ${result.steps} pasos ` +
      `(${((result.steps * STEP_MS) / 1000).toFixed(0)}s de reloj de juego) · ${result.hands} manos · firma ${result.signature}`,
  );
  await testInfo.attach(name, { body: result.sequence, contentType: 'text/plain' });
}

// `timeout`: una partida completa lleva decenas de segundos, pero un test que detecta
// una traba corre además los pasos del detector (75) antes de fallar; el default de 30 s
// no alcanza para el peor caso.
test.describe.configure({ mode: 'parallel', timeout: 240_000 });

for (const players of PLAYER_COUNTS) {
  for (const seed of SEEDS) {
    const tag = knownTag(`partida:${players}:${seed}`);
    test(`partida completa ${players}p seed ${seed}${tag}`, async ({ page }, testInfo) => {
      const issues = watchPageIssues(page);
      await openGame(page, seed);

      const driver = new LegacyDriver(page);
      await driver.start(players);

      const result = await playUntilGameOver(page, testInfo, driver, seed, players);
      const [team0, team1] = result.scores;
      await reportSignature(testInfo, `firma-${players}p-seed-${seed}`, result, players, seed, '[partida]');

      expect(
        result.gameOver,
        `La partida de ${players}p seed ${seed} no terminó en ${MAX_STEPS} pasos ` +
          `(marcador ${team0}-${team1}, turno ${await driver.turnSeat()}, firma ${result.signature})`,
      ).toBe(true);

      expect(
        result.hands,
        `partida demasiado corta: ${players}p seed ${seed} terminó con ${result.hands} manos ` +
          `(< ${MIN_HANDS}; marcador ${team0}-${team1}, ${result.steps} pasos, firma ${result.signature})`,
      ).toBeGreaterThanOrEqual(MIN_HANDS);

      expect(
        Math.max(team0, team1),
        `La partida de ${players}p seed ${seed} terminó sin llegar a ${TARGET_SCORE} (${team0}-${team1})`,
      ).toBeGreaterThanOrEqual(TARGET_SCORE);

      expectNoPageIssues(issues, `partida completa ${players}p seed ${seed}`);
    });
  }
}

for (const players of PLAYER_COUNTS) {
  const tag = knownTag(`nueva:${players}`);
  test(`nueva partida tras terminar ${players}p${tag}`, async ({ page }, testInfo) => {
    const seed = SEEDS[0];
    const label = `nueva partida tras terminar ${players}p`;
    const issues = watchPageIssues(page);
    await openGame(page, seed);

    const driver = new LegacyDriver(page);
    const bot = new Bot(seed);
    await driver.start(players);

    const first = await playUntilGameOver(page, testInfo, driver, seed, players);
    expect(first.gameOver, `${label}: la primera partida no terminó en ${MAX_STEPS} pasos`).toBe(true);
    await reportSignature(testInfo, `firma-nueva-${players}p`, first, players, seed, '[nueva]');
    expect(
      first.hands,
      `${label}: la primera partida terminó con ${first.hands} manos (< ${MIN_HANDS})`,
    ).toBeGreaterThanOrEqual(MIN_HANDS);

    await driver.newGame();
    await driver.start(players);

    const scores = await driver.scores();
    expect(scores, `${label}: el marcador no arranca en 0-0 tras "Nuevo juego"`).toEqual([0, 0]);

    // El bot debe poder jugar al menos una mano entera: hasta el próximo
    // "Siguiente mano" o hasta que el marcador se mueva.
    let playedHand = false;
    for (let step = 1; step <= HAND_STEPS && !playedHand; step++) {
      await page.clock.runFor(STEP_MS);
      const observation = await driver.observe();
      if (observation.gameOver) break;

      if (observation.actions.some((action) => action.kind === 'next-hand')) {
        playedHand = true;
        break;
      }
      if (observation.scores[0] > 0 || observation.scores[1] > 0) {
        playedHand = true;
        break;
      }
      const decision = bot.next(observation.actions.filter((action) => action.kind !== 'next-hand'));
      if (decision) await driver.perform(decision);
    }

    await expect(
      playedHand,
      `${label}: tras "Nuevo juego" no se puede jugar una mano ` +
        `(fin de partida en pantalla: ${await driver.isGameOver()}, turno ${await driver.turnSeat()})`,
    ).toBe(true);

    expectNoPageIssues(issues, label);
  });
}

/**
 * Determinismo (auditoría ciclo 1): la misma partida jugada dos veces, en el mismo
 * worker pero en páginas distintas, tiene que dar la misma firma. Si no, el gate
 * `partidas` depende del tiempo real (máquina, carga, animaciones) y no es confiable.
 */
test(`determinismo 4p seed ${DETERMINISM_SEED}`, async ({ page, browser }, testInfo) => {
  const players: PlayerCount = 4;
  const label = `determinismo 4p seed ${DETERMINISM_SEED}`;

  const runOnce = async (target: Page): Promise<MatchResult> => {
    await openGame(target, DETERMINISM_SEED);
    const driver = new LegacyDriver(target);
    await driver.start(players);
    return playUntilGameOver(target, testInfo, driver, DETERMINISM_SEED, players);
  };

  const issues = watchPageIssues(page);
  const first = await runOnce(page);

  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
  });
  const secondPage = await context.newPage();
  const secondIssues = watchPageIssues(secondPage);
  let second: MatchResult;
  try {
    second = await runOnce(secondPage);
  } catch (error) {
    await context.close();
    throw error;
  }
  await context.close();

  console.log(
    `[determinismo] 4p seed ${DETERMINISM_SEED}: firma 1 = ${first.signature} (${first.steps} pasos, ${first.hands} manos)`,
  );
  console.log(
    `[determinismo] 4p seed ${DETERMINISM_SEED}: firma 2 = ${second.signature} (${second.steps} pasos, ${second.hands} manos)`,
  );
  await testInfo.attach('firmas-determinismo', {
    body: `${first.sequence}\n\n--- segunda corrida ---\n\n${second.sequence}`,
    contentType: 'text/plain',
  });

  expect(
    second.signature,
    `${label}: la misma partida jugada dos veces dio firmas distintas ` +
      `(${first.signature} en ${first.steps} pasos vs ${second.signature} en ${second.steps} pasos): ` +
      'la partida depende de algo que no es la semilla (reloj real, animaciones, timeouts)',
  ).toBe(first.signature);

  expect(
    first.hands,
    `${label}: la partida terminó con ${first.hands} manos (< ${MIN_HANDS})`,
  ).toBeGreaterThanOrEqual(MIN_HANDS);

  expectNoPageIssues(issues, label);
  expectNoPageIssues(secondIssues, label);
});
