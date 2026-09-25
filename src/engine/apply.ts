// Punto de entrada del motor para actuar: valida contra `getLegalActions` y despacha.
// Nunca muta el estado recibido (clona con `structuredClone`) y sube `version` en cada acción aplicada.

import { applyAnswerEnvido, applyCallEnvido } from './envido.js';
import { applyAnswerFlor, applyDeclareFlor } from './flor.js';
import { getActor, getLegalActions, sameAction } from './legal.js';
import { applyMazo } from './mazo.js';
import { completeTrick } from './tricks.js';
import { applyAnswerTruco, applyCallTruco } from './truco.js';
import type { Action, Card, GameEvent, HandState, MatchState, PlayerId } from './types.js';

/** Siguiente jugador de la ronda, en orden circular desde el que acaba de jugar. */
function nextParticipantId(hand: HandState, current: PlayerId): PlayerId {
  const index = hand.participants.indexOf(current);
  return hand.participants[(index + 1) % hand.participants.length];
}

/** Aplica `PLAY_CARD` sobre un estado ya clonado (puede mutarlo). */
function applyPlayCard(state: MatchState, playerId: PlayerId, cardId: string, events: GameEvent[]): void {
  const hand = state.hand;
  const card: Card = hand.hands[playerId].filter((c) => c.id === cardId)[0];
  hand.hands[playerId] = hand.hands[playerId].filter((c) => c.id !== cardId);
  hand.currentTrick.plays.push({ playerId, card });
  events.push({ type: 'CARD_PLAYED', playerId, card });

  if (hand.currentTrick.plays.length === hand.participants.length) {
    // La baza está completa: la resuelve `tricks.ts` (ganador o parda, y si la mano se decide, la cierra).
    completeTrick(state, events);
  } else {
    hand.turnId = nextParticipantId(hand, playerId);
  }
}

/**
 * Aplica una acción de `playerId` sobre `state`.
 * - `MATCH_OVER` → `{ ok:false, error:'MATCH_OVER' }`
 * - fuera de turno → `{ ok:false, error:'NOT_YOUR_TURN' }` [ENG-10]
 * - acción no legal → `{ ok:false, error:'ILLEGAL_ACTION' }` [ENG-10]
 * - éxito → estado nuevo (mismo contenido, instancia distinta) con `version + 1` y sus eventos.
 */
export function applyAction(
  state: MatchState,
  playerId: PlayerId,
  action: Action,
): { ok: true; state: MatchState; events: GameEvent[] } | { ok: false; error: string } {
  if (state.phase === 'MATCH_OVER') return { ok: false, error: 'MATCH_OVER' };
  if (playerId !== getActor(state)) return { ok: false, error: 'NOT_YOUR_TURN' };

  const legal = getLegalActions(state, playerId);
  const chosen = legal.find((a) => sameAction(a, action));
  if (chosen === undefined) return { ok: false, error: 'ILLEGAL_ACTION' };

  const working = structuredClone(state);
  const events: GameEvent[] = [];

  switch (chosen.type) {
    case 'PLAY_CARD':
      applyPlayCard(working, playerId, chosen.cardId, events);
      break;
    case 'CALL_TRUCO':
      applyCallTruco(working, events, playerId);
      break;
    case 'ANSWER_TRUCO':
      applyAnswerTruco(working, events, playerId, chosen.answer);
      break;
    case 'CALL_ENVIDO':
      applyCallEnvido(working, events, playerId, chosen.call);
      break;
    case 'ANSWER_ENVIDO':
      applyAnswerEnvido(working, events, playerId, chosen.answer);
      break;
    case 'MAZO':
      applyMazo(working, events, playerId);
      break;
    case 'DECLARE_FLOR':
      applyDeclareFlor(working, events, playerId);
      break;
    case 'ANSWER_FLOR':
      applyAnswerFlor(working, events, playerId, chosen.answer);
      break;
  }

  working.version += 1;
  return { ok: true, state: working, events };
}
