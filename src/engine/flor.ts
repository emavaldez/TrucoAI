// Flor (configurable) — historia 1-8, GDD §7.
// Acá vive TODA la flor: detección, puntaje, tabla de puntos (única), declaración
// obligatoria, flor contra flor (achico / contraflor / contraflor al resto) y la
// resolución de la flor de un solo equipo. `legal.ts`, `apply.ts` y `tricks.ts` solo delegan.
// Nadie fuera de `scoring.ts` suma puntos: acá se llama a `addPoints` con razón `FLOR`.
// Decisión de implementación (anotada para Emmanuel): en una comparación de flores
// (contraflor querida) se muestran TODAS las flores del par/mesa, declaradas o no.

import { envidoValue } from './cards.js';
import { faltaValue } from './envido.js';
import { addPoints } from './scoring.js';
import { responderFor, teamOf } from './turns.js';
import type { Action, Card, CantoRecord, GameEvent, MatchState, PlayerId, TeamId } from './types.js';

/** Tabla ÚNICA de puntos de la flor (GDD §7; valores por defecto a validar por Emmanuel). */
export const FLOR_POINTS = {
  /** por cada flor declarada, cuando solo un equipo tiene flor */
  flor: 3,
  /** "con flor me achico": para el primer equipo */
  achico: 4,
  /** contraflor querida: para el ganador de la comparación */
  contraflor: 6,
  /** contraflor no querida: para el que la cantó */
  contraflorNoQuiero: 4,
  /** contraflor al resto no querida: para el que la cantó */
  alRestoNoQuiero: 6,
} as const;

type FlorAnswer = 'ACHICO' | 'CONTRAFLOR' | 'CONTRAFLOR_AL_RESTO' | 'QUIERO' | 'NO_QUIERO';

/** ¿Las 3 cartas son del mismo palo? */
export function hasFlor(cards: readonly Card[]): boolean {
  return cards.length === 3 && cards.every((card) => card.suit === cards[0].suit);
}

/** Valor de la flor: 20 + la suma de los valores de envido de las tres cartas. */
export function florScore(cards: readonly Card[]): number {
  return 20 + cards.reduce((total, card) => total + envidoValue(card), 0);
}

/** ¿Ya jugó carta en la primera baza de la mano (o submano)? */
function playedInFirstTrick(state: MatchState, playerId: PlayerId): boolean {
  const hand = state.hand;
  if (hand.tricks.length > 0) return true;
  return hand.currentTrick.plays.some((play) => play.playerId === playerId);
}

/**
 * ¿`playerId` debe cantar la flor? Flor habilitada, sin resolver, participante con flor
 * no declarada y que todavía no jugó carta en la primera baza.
 */
export function owesFlor(state: MatchState, playerId: PlayerId): boolean {
  if (!state.rules.flor) return false;
  const hand = state.hand;
  if (hand.flor.status === 'resolved') return false;
  if (!hand.participants.includes(playerId)) return false;
  if (hand.flor.declared.some((entry) => entry.playerId === playerId)) return false;
  if (playedInFirstTrick(state, playerId)) return false;
  return hasFlor(hand.dealt[playerId]);
}

/**
 * Si al equipo de alguien con flor le cantan envido o truco en primera baza, responde
 * primero ese jugador cantando la flor (el primero en orden si hay varios). `null` si no aplica.
 */
export function florInterrupter(state: MatchState): PlayerId | null {
  if (!state.rules.flor) return null;
  const hand = state.hand;
  let responderId: PlayerId | null = null;
  if (state.phase === 'AWAITING_TRUCO' && hand.tricks.length === 0) responderId = hand.truco.pending?.responderId ?? null;
  if (state.phase === 'AWAITING_ENVIDO') responderId = hand.envido.pending?.responderId ?? null;
  if (responderId === null) return null;
  const team = teamOf(state, responderId);
  return hand.participants.find((playerId) => teamOf(state, playerId) === team && owesFlor(state, playerId)) ?? null;
}

/** Acciones legales en `AWAITING_FLOR` para el respondedor del canto de flor pendiente. */
export function florResponseActions(state: MatchState, playerId: PlayerId): Action[] {
  const pending = state.hand.flor.pending;
  if (pending === null || pending.responderId !== playerId) return [];
  const answers: FlorAnswer[] =
    pending.kind === 'RESPUESTA_FLOR'
      ? ['ACHICO', 'CONTRAFLOR', 'CONTRAFLOR_AL_RESTO']
      : pending.kind === 'CONTRAFLOR'
        ? ['QUIERO', 'NO_QUIERO', 'CONTRAFLOR_AL_RESTO']
        : ['QUIERO', 'NO_QUIERO'];
  return answers.map((answer) => ({ type: 'ANSWER_FLOR', answer }));
}

function otherTeam(team: TeamId): TeamId {
  return team === 0 ? 1 : 0;
}

/** Completa la respuesta del último canto de flor del registro de la mano. */
function answerLastFlorCanto(cantos: readonly CantoRecord[], answer: 'QUIERO' | 'NO_QUIERO' | 'ACHICO'): void {
  for (let index = cantos.length - 1; index >= 0; index--) {
    const kind = cantos[index].kind;
    if (kind === 'FLOR' || kind === 'CONTRAFLOR' || kind === 'CONTRAFLOR_AL_RESTO') {
      cantos[index].answer = answer;
      return;
    }
  }
}

/**
 * Canta la flor (AC 3): anula el envido (una cadena pendiente se descarta sin puntos) y vuelve
 * a la fase de la que venía. Si es la primera flor del segundo equipo, abre "flor contra flor" (AC 4).
 */
export function applyDeclareFlor(state: MatchState, events: GameEvent[], playerId: PlayerId): void {
  const hand = state.hand;
  const flor = hand.flor;
  const team = teamOf(state, playerId);
  const fromPhase = state.phase;
  const teamsBefore = new Set(flor.declared.map((entry) => entry.team));

  flor.declared.push({ playerId, team });
  if (flor.status === 'none') flor.status = 'declared';
  events.push({ type: 'FLOR_DECLARED', playerId });
  hand.cantos.push({ kind: 'FLOR', by: playerId, team });

  let resume: 'PLAYING' | 'AWAITING_TRUCO' = fromPhase === 'AWAITING_TRUCO' ? 'AWAITING_TRUCO' : 'PLAYING';
  const envido = hand.envido;
  if (envido.status === 'calling') {
    resume = envido.resumeTrucoAfter ? 'AWAITING_TRUCO' : 'PLAYING';
    envido.pending = null;
    envido.status = 'cancelled';
  } else if (envido.status === 'none') {
    envido.status = 'cancelled';
  }

  const secondTeamFirstFlor = teamsBefore.size === 1 && !teamsBefore.has(team) && flor.status === 'declared';
  if (secondTeamFirstFlor) {
    flor.pending = { kind: 'RESPUESTA_FLOR', responderId: playerId, callerTeam: otherTeam(team) };
    flor.resumePhase = resume;
    state.phase = 'AWAITING_FLOR';
    return;
  }
  state.phase = resume;
}

/** Flores de los participantes en el orden en que se dicen (desde el mano efectivo). */
function florSayings(state: MatchState): { playerId: PlayerId; score: number }[] {
  return state.hand.participants
    .filter((playerId) => hasFlor(state.hand.dealt[playerId]))
    .map((playerId) => ({ playerId, score: florScore(state.hand.dealt[playerId]) }));
}

/** Comparación de flores: gana la mayor; empate, la más cercana al mano. */
function compareFlores(state: MatchState): { winnerTeam: TeamId; revealed: { playerId: PlayerId; score: number }[] } {
  const sayings = florSayings(state);
  const winner = sayings.reduce((best, current) => (current.score > best.score ? current : best));
  return { winnerTeam: teamOf(state, winner.playerId), revealed: sayings };
}

/** Cierra la flor: resultado público, puntos en el momento y vuelta a la fase anterior. */
function finishFlor(
  state: MatchState,
  events: GameEvent[],
  winnerTeam: TeamId,
  points: number,
  revealed: { playerId: PlayerId; score: number }[],
): void {
  const flor = state.hand.flor;
  const resume = flor.resumePhase;
  flor.status = 'resolved';
  flor.pending = null;
  flor.resumePhase = null;
  flor.result = { winnerTeam, points, revealed };
  events.push({ type: 'FLOR_RESOLVED', winnerTeam, points, revealed });
  addPoints(state, events, winnerTeam, points, 'FLOR');
  if (state.phase === 'MATCH_OVER') return;
  if (resume !== null) state.phase = resume;
}

/** Respuesta a la flor pendiente (AC 4). */
export function applyAnswerFlor(state: MatchState, events: GameEvent[], playerId: PlayerId, answer: FlorAnswer): void {
  const flor = state.hand.flor;
  const pending = flor.pending;
  if (pending === null) throw new Error('NO_PENDING_FLOR');
  const team = teamOf(state, playerId);
  events.push({ type: 'FLOR_ANSWERED', playerId, answer });

  if (answer === 'ACHICO') {
    answerLastFlorCanto(state.hand.cantos, 'ACHICO');
    const declaredByFirst = flor.declared.filter((entry) => entry.team === pending.callerTeam);
    finishFlor(state, events, pending.callerTeam, FLOR_POINTS.achico, publicDeclared(state, declaredByFirst));
    return;
  }

  if (answer === 'CONTRAFLOR' || answer === 'CONTRAFLOR_AL_RESTO') {
    if (pending.kind !== 'RESPUESTA_FLOR') answerLastFlorCanto(state.hand.cantos, 'QUIERO');
    state.hand.cantos.push({ kind: answer, by: playerId, team });
    flor.pending = { kind: answer, responderId: responderFor(state, playerId), callerTeam: team };
    return;
  }

  answerLastFlorCanto(state.hand.cantos, answer);
  if (answer === 'NO_QUIERO') {
    const points = pending.kind === 'CONTRAFLOR' ? FLOR_POINTS.contraflorNoQuiero : FLOR_POINTS.alRestoNoQuiero;
    finishFlor(state, events, pending.callerTeam, points, []);
    return;
  }

  const comparison = compareFlores(state);
  const points = pending.kind === 'CONTRAFLOR' ? FLOR_POINTS.contraflor : faltaValue(state, comparison.winnerTeam);
  finishFlor(state, events, comparison.winnerTeam, points, comparison.revealed);
}

/** Puntajes de flor de los jugadores dados (lo que se muestra al cobrar una flor sin comparación). */
function publicDeclared(
  state: MatchState,
  entries: readonly { playerId: PlayerId }[],
): { playerId: PlayerId; score: number }[] {
  return entries.map((entry) => ({ playerId: entry.playerId, score: florScore(state.hand.dealt[entry.playerId]) }));
}

/**
 * Flor de un solo equipo (AC 5): si hay flores declaradas sin resolver (y ninguna pendiente),
 * ese equipo suma 3 por cada una. Se llama al completarse la primera baza y al cerrar la mano.
 */
export function resolveSingleTeamFlor(state: MatchState, events: GameEvent[]): void {
  const flor = state.hand.flor;
  if (flor.status !== 'declared' || flor.pending !== null || flor.declared.length === 0) return;
  const team = flor.declared[0].team;
  if (flor.declared.some((entry) => entry.team !== team)) return;
  finishFlor(state, events, team, FLOR_POINTS.flor * flor.declared.length, publicDeclared(state, flor.declared));
}

/** ¿Es un canto de flor? */
function isFlorCanto(kind: CantoRecord['kind']): boolean {
  return kind === 'FLOR' || kind === 'CONTRAFLOR' || kind === 'CONTRAFLOR_AL_RESTO';
}

/** Puntos de un canto de flor ya resuelto y a quién van, para el historial. */
export function florCantoPoints(state: MatchState, canto: CantoRecord): { points: number; pointsTo: TeamId } | null {
  const result = state.hand.flor.result;
  if (result === null || !isFlorCanto(canto.kind)) return null;
  return { points: result.points, pointsTo: result.winnerTeam };
}
