/**
 * Driver del juego legacy (historia 0-2, AC 2).
 *
 * Único archivo del repo que conoce los selectores del DOM actual
 * (`src/ui/UIManager.ts`). Cualquier cambio de UI se absorbe acá; los specs no
 * cambian (en 3-2 se suma `v2.ts` con los `data-testid` del contrato nuevo).
 *
 * `observe()` lee TODO lo que el spec necesita de la pantalla en un solo
 * `page.evaluate` (acciones, marcador, fin de partida, texto visible, asiento
 * con el turno y manos jugadas): menos roundtrips por paso —y por lo tanto menos
 * tiempo real— sin cambiar la semántica del contrato `GameDriver`.
 */

import type { ElementHandle, Locator, Page } from '@playwright/test';
import type { DriverAction, GameDriver, Observation } from './types';

export const SELECTORS = {
  countButton: (players: number) => `.count-btn[data-count="${players}"]`,
  startGame: '.btn-start',
  menu: '.menu-container',
  board: '.game-board',
  notificationOk: '.btn-notif-ok',
  nextHand: '.btn-new-round',
  newGame: '.btn-new-game',
  gameOverText: '.game-over-text',
  scoreboard: '.team-points',
  activeTurn: '.player-area.active-turn',
  humanTurn: '.human-area .player-area.active-turn',
  humanCard: '.human-area .clickable',
  handEntry: '.hand-entry',
  controls: '.controls button',
  answer: {
    quiero: '.response-panel .btn-accept',
    'no-quiero': '.response-panel .btn-reject',
    subir: '.response-panel .btn-falta',
    'son-buenas': '.response-panel .btn-son-buenas',
  },
} as const;

const CLICK_TIMEOUT = 800;
const WAIT_TIMEOUT = 15_000;

/** Foto de la pantalla para un paso del spec (una sola lectura del DOM). */
export type { Observation };

interface RawDom {
  ack: boolean;
  nextHand: boolean;
  answers: string[];
  controls: string[];
  plays: number;
  scores: [number, number];
  gameOver: boolean;
  snapshot: string;
  turnSeat: string;
  handsPlayed: number;
}

/** Texto del botón → tipo de canto de `.controls`. */
function callKindOf(rawText: string): 'envido' | 'real-envido' | 'falta-envido' | 'truco' | 'mazo' | null {
  const text = rawText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (text.includes('mazo')) return 'mazo';
  if (text.includes('falta envido')) return 'falta-envido';
  if (text.includes('real envido')) return 'real-envido';
  if (text.includes('subir')) return 'truco';
  if (text.includes('truco')) return 'truco';
  if (text.includes('envido')) return 'envido';
  return null;
}

export class LegacyDriver implements GameDriver {
  constructor(private readonly page: Page) {}

  async start(players: 2 | 4 | 6): Promise<void> {
    await this.page.locator(SELECTORS.countButton(players)).click();
    await this.page.locator(SELECTORS.startGame).click();
    await this.page.locator(SELECTORS.board).waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  }

  /** Todo lo observable de la pantalla en un solo `page.evaluate` (un paso del spec = un roundtrip). */
  async observe(): Promise<Observation> {
    const raw = await this.readDom();
    return {
      actions: this.toActions(raw),
      scores: raw.scores,
      gameOver: raw.gameOver,
      snapshot: raw.snapshot,
      turnSeat: raw.turnSeat,
      handsPlayed: raw.handsPlayed,
    };
  }

  /**
   * Orden de prioridad: ack → next-hand → answer → call → play.
   *
   * `play` solo se ofrece cuando el asiento del humano está marcado como
   * `active-turn`: el motor rechaza `playCard` de quien no tiene el turno
   * (`validateAction`), así que un click fuera de turno no es una acción
   * "habilitada" (AC 2).
   */
  async actions(): Promise<DriverAction[]> {
    return this.toActions(await this.readDom());
  }

  async perform(action: DriverAction): Promise<boolean> {
    switch (action.kind) {
      case 'ack':
        // El legacy apila avisos (UI-15): el que recibe el click es el de arriba
        // (el último en el DOM).
        return this.clickLast(SELECTORS.notificationOk);
      case 'next-hand':
        return this.clickFirst(SELECTORS.nextHand);
      case 'answer':
        return this.clickFirst(SELECTORS.answer[action.answer]);
      case 'play':
        return this.clickHumanCard(action.index);
      case 'call':
        return this.clickCall(action.call);
    }
  }

  async isGameOver(): Promise<boolean> {
    return this.isVisible(SELECTORS.gameOverText);
  }

  async scores(): Promise<[number, number]> {
    return (await this.readDom()).scores;
  }

  async snapshot(): Promise<string> {
    return (await this.readDom()).snapshot;
  }

  async newGame(): Promise<void> {
    // Al terminar la partida el legacy puede dejar avisos sobre el panel final
    // (UI-08/UI-15): el usuario tiene que darles OK antes de tocar "Nuevo juego".
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!(await this.isVisible(SELECTORS.notificationOk))) break;
      if (!(await this.clickLast(SELECTORS.notificationOk))) break;
    }
    if (!(await this.clickFirst(SELECTORS.newGame))) {
      throw new Error('No se pudo tocar "Nuevo juego" (.btn-new-game)');
    }
    await this.page.locator(SELECTORS.menu).waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  }

  /** Asiento con el marcador de turno, como `player-3 (Contrario 1)`. */
  async turnSeat(): Promise<string> {
    return (await this.readDom()).turnSeat;
  }

  /** Manos terminadas según el historial del panel de fin de partida. */
  async handsPlayed(): Promise<number> {
    return (await this.readDom()).handsPlayed;
  }

  private toActions(raw: RawDom): DriverAction[] {
    const actions: DriverAction[] = [];
    if (raw.ack) actions.push({ kind: 'ack' });
    if (raw.nextHand) actions.push({ kind: 'next-hand' });
    for (const answer of raw.answers) {
      actions.push({ kind: 'answer', answer: answer as 'quiero' | 'no-quiero' | 'subir' | 'son-buenas' });
    }
    for (const text of raw.controls) {
      const call = callKindOf(text);
      if (call) actions.push({ kind: 'call', call });
    }
    for (let index = 0; index < raw.plays; index++) actions.push({ kind: 'play', index });
    return actions;
  }

  private async readDom(): Promise<RawDom> {
    return this.page.evaluate(
      (selectors) => {
        const visible = (el: Element | null): el is Element => {
          if (!el) return false;
          return el.getClientRects().length > 0;
        };
        const answerSelectors: Array<[string, string]> = Object.entries(selectors.answer);
        const answers = answerSelectors
          .filter(([, selector]) => visible(document.querySelector(selector)))
          .map(([answer]) => answer);

        const controls = Array.from(document.querySelectorAll(selectors.controls))
          .filter(visible)
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());

        const humanTurn = visible(document.querySelector(selectors.humanTurn));
        const plays = humanTurn
          ? Array.from(document.querySelectorAll(selectors.humanCard)).filter(visible).length
          : 0;

        const scoreNodes = Array.from(document.querySelectorAll(selectors.scoreboard));
        let scores: [number, number] = [-1, -1];
        if (scoreNodes.length >= 2) {
          const parse = (el: Element) => {
            const value = parseInt((el.textContent || '').trim(), 10);
            return Number.isFinite(value) ? value : -1;
          };
          scores = [parse(scoreNodes[0]), parse(scoreNodes[1])];
        }

        const seat = document.querySelector(selectors.activeTurn);
        const seatId = seat?.getAttribute('data-player-id') || '?';
        const seatName = (seat?.querySelector('.player-name')?.textContent || '').trim();
        const turnSeat = seat ? (seatName ? `${seatId} (${seatName})` : seatId) : 'desconocido';

        return {
          ack: visible(document.querySelector(selectors.notificationOk)),
          nextHand: visible(document.querySelector(selectors.nextHand)),
          answers,
          controls,
          plays,
          scores,
          gameOver: visible(document.querySelector(selectors.gameOverText)),
          snapshot: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
          turnSeat,
          handsPlayed: document.querySelectorAll(selectors.handEntry).length,
        };
      },
      {
        answer: SELECTORS.answer,
        controls: SELECTORS.controls,
        humanTurn: SELECTORS.humanTurn,
        humanCard: SELECTORS.humanCard,
        notificationOk: SELECTORS.notificationOk,
        nextHand: SELECTORS.nextHand,
        scoreboard: SELECTORS.scoreboard,
        activeTurn: SELECTORS.activeTurn,
        gameOverText: SELECTORS.gameOverText,
        handEntry: SELECTORS.handEntry,
      },
    );
  }

  /** True si el elemento existe y tiene layout (no está oculto por CSS). */
  private async isVisible(selector: string): Promise<boolean> {
    return this.page.evaluate(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && el.getClientRects().length > 0;
      },
      selector,
    );
  }

  private async clickFirst(selector: string): Promise<boolean> {
    return this.clickLocator(this.page.locator(selector).first());
  }

  private async clickLast(selector: string): Promise<boolean> {
    return this.clickLocator(this.page.locator(selector).last());
  }

  private async clickLocator(locator: Locator): Promise<boolean> {
    if ((await locator.count()) === 0) return false;
    try {
      await locator.click({ timeout: CLICK_TIMEOUT });
      return true;
    } catch {
      // El DOM cambió entre `observe()` y el click (la IA jugó, el panel se
      // cerró, otro aviso tapa el botón): no es una traba, se reintenta en el
      // paso siguiente.
      return false;
    }
  }

  private async clickCall(call: string): Promise<boolean> {
    const handle = await this.page.evaluateHandle(
      (args) => {
        const text = (el: Element) =>
          (el.textContent || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z ]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const found = Array.from(document.querySelectorAll(args.selector)).find((el) => {
          if (el.getClientRects().length === 0) return false;
          const t = text(el);
          if (args.call === 'mazo') return t.includes('mazo');
          if (args.call === 'falta-envido') return t.includes('falta envido');
          if (args.call === 'real-envido') return t.includes('real envido');
          if (args.call === 'truco') return t.includes('subir') || t.includes('truco');
          return t.includes('envido') && !t.includes('subir');
        });
        return found ?? null;
      },
      { selector: SELECTORS.controls, call },
    );
    return this.clickHandle(handle.asElement());
  }

  private async clickHumanCard(index: number): Promise<boolean> {
    const handle = await this.page.evaluateHandle(
      (args) => {
        if (!document.querySelector(args.humanTurn)) return null;
        const cards = Array.from(document.querySelectorAll(args.humanCard)).filter(
          (el) => el.getClientRects().length > 0,
        );
        return cards[args.index] ?? null;
      },
      { humanTurn: SELECTORS.humanTurn, humanCard: SELECTORS.humanCard, index },
    );
    return this.clickHandle(handle.asElement());
  }

  private async clickHandle(element: ElementHandle<Element> | null): Promise<boolean> {
    if (!element) return false;
    try {
      await element.click({ timeout: CLICK_TIMEOUT });
      return true;
    } catch {
      return false;
    }
  }
}
