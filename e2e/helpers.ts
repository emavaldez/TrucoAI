// Utilidades E2E (historia 4-1): arrancar partidas por URL, bot que juega haciendo clic en la UI
// real (solo lo que el humano ve: botones con `data-act`), y chequeos de invariantes visibles.

import { expect, type Page } from '@playwright/test';

export interface StartOptions {
  players: 2 | 4 | 6;
  seed: number;
  fast?: boolean;
  flor?: boolean;
  picaPica?: boolean;
  difficulty?: 'easy' | 'normal' | 'hard';
  aiDelay?: number;
}

export function gameUrl(opts: StartOptions): string {
  const params = new URLSearchParams({
    autostart: '1',
    test: '1',
    players: String(opts.players),
    seed: String(opts.seed),
    difficulty: opts.difficulty ?? 'normal',
  });
  if (opts.fast !== false) params.set('fast', '1');
  if (opts.flor !== undefined) params.set('flor', opts.flor ? '1' : '0');
  if (opts.picaPica !== undefined) params.set('picaPica', opts.picaPica ? '1' : '0');
  if (opts.aiDelay !== undefined) params.set('aiDelay', String(opts.aiDelay));
  return `/?${params.toString()}`;
}

/** Junta errores de consola y de página para afirmar al final que no hubo ninguno. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/** PRNG determinista (mulberry32). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MatchSummary {
  scores: [number, number];
  hands: number;
  steps: number;
  historyHash: string;
}

interface ScreenRead {
  phase: string;
  version: number;
  actor: string;
  acts: string[];
  nextHand: boolean;
  gameOver: boolean;
}

async function read(page: Page): Promise<ScreenRead> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('#truco-canvas');
    const acts = [...document.querySelectorAll<HTMLElement>('#truco-canvas [data-act]')]
      .filter((el) => !(el as HTMLButtonElement).disabled)
      .map((el) => el.dataset.act as string);
    return {
      phase: canvas?.dataset.phase ?? '',
      version: Number(canvas?.dataset.version ?? '-1'),
      actor: canvas?.dataset.actor ?? '',
      acts,
      nextHand: document.querySelector('[data-testid="next-hand"]') !== null,
      gameOver: document.querySelector('[data-testid="game-over"]') !== null,
    };
  });
}

/**
 * Elige qué tocar: jugar carta la mayoría de las veces, cantar a veces, responder
 * quiero / no quiero / subir con pesos. Nunca la falta envido (definiría la partida en una mano).
 */
function choose(acts: string[], rnd: () => number): string {
  const answers = acts.filter((a) => a.endsWith('quiero') || a.startsWith('flor:'));
  if (answers.length > 0) {
    const raises = acts.filter((a) => a === 'truco' || a === 'envido:E' || a === 'envido:R' || a === 'flor:CONTRAFLOR');
    const r = rnd();
    const quiero = acts.find((a) => a === 'truco-quiero' || a === 'envido-quiero' || a === 'flor:QUIERO' || a === 'flor:CONTRAFLOR');
    const noQuiero = acts.find((a) => a === 'truco-noquiero' || a === 'envido-noquiero' || a === 'flor:NO_QUIERO' || a === 'flor:ACHICO');
    if (r < 0.6 && quiero) return quiero;
    if (r < 0.88 && noQuiero) return noQuiero;
    if (raises.length > 0) return raises[Math.floor(rnd() * raises.length)];
    return quiero ?? noQuiero ?? acts[0];
  }
  if (acts.includes('flor')) return 'flor';
  const plays = acts.filter((a) => a.startsWith('play:'));
  const calls = acts.filter((a) => a === 'truco' || a === 'envido:E' || a === 'envido:R' || (a === 'mazo' && rnd() < 0.2));
  if (plays.length > 0 && (calls.length === 0 || rnd() < 0.85)) return plays[Math.floor(rnd() * plays.length)];
  if (calls.length > 0) return calls[Math.floor(rnd() * calls.length)];
  return acts[0];
}

/** FNV-1a de 32 bits (para comparar historiales entre corridas). */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Chequeos de lo que se ve en cada paso (invariantes de UI). */
export async function checkScreen(page: Page, label: string): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const canvas = document.querySelector<HTMLElement>('#truco-canvas');
    const phase = canvas?.dataset.phase ?? '';
    const actor = canvas?.dataset.actor ?? '';
    const active = document.querySelectorAll('.seat--active').length;
    const portrait = canvas?.dataset.layout === 'portrait';
    const humanIsActor = actor === 'p0';
    const expectedActive = actor && phase !== 'HAND_OVER' && phase !== 'MATCH_OVER' ? (portrait && humanIsActor ? 0 : 1) : 0;
    if (active !== expectedActive) out.push(`asientos activos: ${active} (esperado ${expectedActive}, actor ${actor}, fase ${phase})`);
    for (const el of document.querySelectorAll<HTMLElement>('.played .card')) {
      if (Number(getComputedStyle(el).opacity) < 1) out.push('carta jugada semitransparente');
    }
    // El marcador que se ve es el del motor.
    const state = (window as unknown as { __truco?: { state: () => { scores: [number, number] } | null } }).__truco?.state();
    const nos = document.querySelector('[data-testid="score-nos"] .score-num')?.textContent;
    const ellos = document.querySelector('[data-testid="score-ellos"] .score-num')?.textContent;
    if (state && (Number(nos) !== state.scores[0] || Number(ellos) !== state.scores[1])) {
      out.push(`marcador visible ${nos}-${ellos} ≠ motor ${state.scores.join('-')}`);
    }
    // Ningún botón de acción del humano fuera de su turno.
    if (!humanIsActor && document.querySelectorAll('[data-act]').length > 0) out.push('botones de acción fuera de turno');
    return out;
  });
  expect(problems, `${label}: ${problems.join('; ')}`).toEqual([]);
}

/**
 * Juega una partida completa con el bot hasta el panel de fin. Falla si la pantalla queda
 * trabada (sin cambios de versión ni acciones disponibles) por más de `stallMs`.
 */
export async function playMatch(
  page: Page,
  seed: number,
  opts: { maxSteps?: number; stallMs?: number; check?: boolean } = {},
): Promise<MatchSummary> {
  const rnd = mulberry32(seed * 7919 + 17);
  const maxSteps = opts.maxSteps ?? 1500;
  const stallMs = opts.stallMs ?? 8000;
  let steps = 0;
  let lastVersion = -1;
  let lastProgress = Date.now();

  while (steps < maxSteps) {
    const screen = await read(page);
    if (screen.gameOver) break;
    if (screen.version !== lastVersion) {
      lastVersion = screen.version;
      lastProgress = Date.now();
    }
    if (opts.check !== false && screen.phase) await checkScreen(page, `paso ${steps}`);

    if (screen.nextHand) {
      await page.click('[data-testid="next-hand"]');
      steps += 1;
      lastProgress = Date.now();
      await page.waitForFunction((v) => document.querySelector('[data-testid="next-hand"]') === null || Number((document.querySelector('#truco-canvas') as HTMLElement).dataset.version) !== v, screen.version);
      // La UI ignora clics durante 350 ms después de una acción (protección de doble clic).
      await page.waitForTimeout(360);
      continue;
    }
    if (screen.actor === 'p0' && screen.acts.length > 0) {
      const act = choose(screen.acts, rnd);
      await page.click(`#truco-canvas [data-act="${act}"]`);
      steps += 1;
      lastProgress = Date.now();
      // El bot espera a que su acción se aplique (o que la UI cambie).
      await page.waitForFunction(
        (v) => Number((document.querySelector('#truco-canvas') as HTMLElement).dataset.version) !== v,
        screen.version,
        { timeout: 5000 },
      );
      // Bloqueo de doble clic de la UI: 350 ms entre acciones del humano.
      await page.waitForTimeout(360);
      continue;
    }
    if (Date.now() - lastProgress > stallMs) {
      throw new Error(`Partida trabada (seed ${seed}): fase ${screen.phase}, actor ${screen.actor || '—'}, versión ${screen.version}`);
    }
    await page.waitForTimeout(40);
  }

  await expect(page.getByTestId('game-over')).toBeVisible();
  return page.evaluate(() => {
    const api = (window as unknown as { __truco: { state: () => { scores: [number, number]; history: unknown[] } } }).__truco;
    const state = api.state();
    const text = JSON.stringify(state.history);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return {
      scores: state.scores,
      hands: state.history.length,
      steps: 0,
      historyHash: hash.toString(16).padStart(8, '0'),
    };
  });
}
