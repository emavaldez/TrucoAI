// Envido — reglas de los cantos (historia 1-4).
// Acá vive TODO el envido: la tabla de puntos (GDD §6.3), la falta envido (§6.5), la
// legalidad de cantar y responder (incluido "el envido está primero", §6.4) y la
// resolución de la cadena. `legal.ts` y `apply.ts` solo delegan.
// Nadie fuera de `scoring.ts` suma puntos ni cierra manos; los tantos del envido se
// suman en el momento (`addPoints` con razón `ENVIDO`), nunca al final de la mano.

import { envidoScore } from './envidoScore.js';
import { addPoints } from './scoring.js';
import { responderFor, teamOf } from './turns.js';
import type { Action, CantoRecord, EnvidoCall, GameEvent, MatchState, PlayerId, TeamId } from './types.js';

/** Puntos de cada canto de la cadena cuando se quiere (GDD §6.3): E = 2, R = 3. */
const CALL_POINTS: Record<'E' | 'R', number> = { E: 2, R: 3 };

/** Canto de la cadena → registro del historial de la mano. */
const CANTO_KIND: Record<EnvidoCall, 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO'> = {
  E: 'ENVIDO',
  R: 'REAL_ENVIDO',
  F: 'FALTA_ENVIDO',
};

/** Los cantos de la cadena en curso, sin quién los cantó. */
function callsOf(state: MatchState): EnvidoCall[] {
  return state.hand.envido.chain.map((canto) => canto.call);
}

/**
 * Valor de la falta envido (GDD §6.5) [ENG-11]:
 * - en pica-pica vale 7 fijo;
 * - si el que va ganando todavía está en las malas (menos de 15), vale lo que necesita
 *   el equipo que gane el envido para llegar al objetivo;
 * - si no, vale lo que le falta al que va ganando.
 */
export function faltaValue(state: MatchState, winnerTeam: TeamId): number {
  if (state.hand.picaPica !== null) return 7;
  const leader = Math.max(state.scores[0], state.scores[1]);
  if (leader < 15) return state.rules.targetScore - state.scores[winnerTeam];
  return state.rules.targetScore - leader;
}

/**
 * Subidas que puede cantar el respondedor después de esa cadena (AC 4) [ENG-04]:
 * `[]` → E, R, F · `[E]` → E (una sola vez), R, F · `[E,E]` → R, F · último `R` → F ·
 * último `F` → ninguna. Nunca se baja (de F a R, de R a E).
 */
export function nextEnvidoCalls(chain: readonly EnvidoCall[]): EnvidoCall[] {
  const last = chain[chain.length - 1];
  if (last === undefined) return ['E', 'R', 'F'];
  if (last === 'R') return ['F'];
  if (last === 'F') return [];
  // Último canto E: el segundo "envido" solo se puede cantar la primera vez.
  const envidos = chain.filter((call) => call === 'E').length;
  return envidos === 1 ? ['E', 'R', 'F'] : ['R', 'F'];
}

/** Puntos de una cadena querida: la suma de sus cantos y, si incluye F, el valor de la falta. */
function chainPoints(chain: readonly EnvidoCall[], falta: number): number {
  if (chain.includes('F')) return falta;
  return chain.reduce((total, call) => total + (call === 'R' ? CALL_POINTS.R : CALL_POINTS.E), 0);
}

/**
 * Tabla de puntos de la cadena (GDD §6.3) como test parametrizado (AC 5) [ENG-04].
 * - `querido`: la suma de los cantos; si la cadena incluye F, vale la falta (reemplaza todo).
 * - `noQuerido`: lo que valía la cadena sin el último canto; con un solo canto, 1.
 */
export function envidoPoints(
  chain: readonly EnvidoCall[],
  falta: number,
): { querido: number; noQuerido: number } {
  return {
    querido: chainPoints(chain, falta),
    noQuerido: chain.length <= 1 ? 1 : chainPoints(chain.slice(0, -1), falta),
  };
}

/**
 * Ventana de envido abierta (AC 2, AC 10): primera baza, sin cadena cantada, sin truco
 * pagado y sin flor declarada (con flor habilitada, la flor anula el envido: GDD §7).
 */
function envidoWindowOpen(state: MatchState): boolean {
  const hand = state.hand;
  return (
    hand.tricks.length === 0 &&
    hand.envido.status === 'none' &&
    hand.truco.level === 0 &&
    hand.flor.declared.length === 0
  );
}

/** Cantos que abren la cadena de envido: E, R o F (AC 2). */
export function openingEnvidoCalls(): Action[] {
  return nextEnvidoCalls([]).map((call) => ({ type: 'CALL_ENVIDO', call }));
}

/**
 * ¿`playerId` puede abrir el envido en su turno de `PLAYING`? (AC 2)
 * Solo en la primera baza, antes de jugar su carta, con la cadena sin cantar y sin truco
 * querido ni pendiente: **después de un truco querido no hay envido** [ENG-13].
 */
export function canCallEnvido(state: MatchState, playerId: PlayerId): boolean {
  if (state.phase !== 'PLAYING' || state.hand.turnId !== playerId) return false;
  if (state.hand.truco.pending !== null) return false;
  return envidoWindowOpen(state);
}

/**
 * "El envido está primero" (AC 3, GDD §6.4) [UI-05]: el respondedor de un truco cantado
 * en la primera baza puede cantar envido en lugar de responderlo; la cadena de envido se
 * resuelve completa y después la respuesta al truco vuelve a quedar pendiente.
 */
export function envidoFirstCalls(state: MatchState, playerId: PlayerId): Action[] {
  if (state.phase !== 'AWAITING_TRUCO') return [];
  const pending = state.hand.truco.pending;
  if (pending === null || pending.level !== 1 || pending.responderId !== playerId) return [];
  if (!envidoWindowOpen(state)) return [];
  return openingEnvidoCalls();
}

/**
 * Acciones legales del respondedor en `AWAITING_ENVIDO` (AC 4): quiero, no quiero y cada
 * subida válida. **Nunca `PLAY_CARD` ni `CALL_TRUCO`** [ENG-02]: con un canto pendiente no
 * se juega carta ni se canta truco.
 */
export function envidoResponseActions(state: MatchState, playerId: PlayerId): Action[] {
  const pending = state.hand.envido.pending;
  if (pending === null || pending.responderId !== playerId) return [];

  const actions: Action[] = [
    { type: 'ANSWER_ENVIDO', answer: 'QUIERO' },
    { type: 'ANSWER_ENVIDO', answer: 'NO_QUIERO' },
  ];
  for (const call of nextEnvidoCalls(callsOf(state))) actions.push({ type: 'CALL_ENVIDO', call });
  return actions;
}

/** Completa el último canto de envido de la mano con su respuesta (AC 4, AC 7 y AC 8). */
function answerLastEnvidoCanto(cantos: readonly CantoRecord[], answer: 'QUIERO' | 'NO_QUIERO'): void {
  for (let index = cantos.length - 1; index >= 0; index--) {
    const canto = cantos[index];
    if (canto.kind === 'ENVIDO' || canto.kind === 'REAL_ENVIDO' || canto.kind === 'FALTA_ENVIDO') {
      canto.answer = answer;
      return;
    }
  }
}

/**
 * Canta el envido o sube la cadena (AC 4): agrega el canto, deja el pendiente a cargo de
 * `responderFor` y pasa a `AWAITING_ENVIDO`. Subir implica aceptar el canto anterior
 * (por eso "querido" suma toda la cadena). Cantado delante de un truco es "el envido está
 * primero" (AC 3): se anota `resumeTrucoAfter` para volver al truco al resolver.
 */
export function applyCallEnvido(state: MatchState, events: GameEvent[], playerId: PlayerId, call: EnvidoCall): void {
  const envido = state.hand.envido;
  const team = teamOf(state, playerId);

  if (envido.pending !== null) answerLastEnvidoCanto(state.hand.cantos, 'QUIERO');
  else if (state.phase === 'AWAITING_TRUCO') envido.resumeTrucoAfter = true;

  envido.chain.push({ call, by: playerId, team });
  envido.status = 'calling';
  envido.pending = { responderId: responderFor(state, playerId) };
  state.phase = 'AWAITING_ENVIDO';
  events.push({ type: 'ENVIDO_CALLED', playerId, call });
  state.hand.cantos.push({ kind: CANTO_KIND[call], by: playerId, team });
}

/** Puntajes de los participantes en el orden en que "dicen" (desde el mano efectivo) [ENG-05] [ENG-17]. */
function envidoSayings(state: MatchState): { playerId: PlayerId; score: number }[] {
  return state.hand.participants.map((playerId) => ({
    playerId,
    score: envidoScore(state.hand.dealt[playerId]),
  }));
}

/** Gana el mayor puntaje; en empate, el primero en el orden de "decir" [ENG-12]. */
function envidoWinner(sayings: readonly { playerId: PlayerId; score: number }[]): {
  playerId: PlayerId;
  score: number;
} {
  return sayings.reduce((best, current) => (current.score > best.score ? current : best));
}

/**
 * Respuesta al canto pendiente (AC 7, AC 8):
 * - `NO_QUIERO`: el equipo del **último** que cantó suma el valor no querido de la cadena.
 * - `QUIERO`: se dicen los envidos de los `participants` desde el mano, gana el mayor
 *   (empate al que dice antes [ENG-12]) y `revealed` llega hasta el ganador inclusive:
 *   los que venían después dicen "son buenas" y no se revelan.
 * Los puntos se suman en el momento (AC 9). Después: si nadie llegó al objetivo, vuelve a
 * `PLAYING` con el mismo `turnId` o a `AWAITING_TRUCO` con el mismo canto pendiente si esto
 * era "el envido está primero" [UI-05].
 */
export function applyAnswerEnvido(
  state: MatchState,
  events: GameEvent[],
  playerId: PlayerId,
  answer: 'QUIERO' | 'NO_QUIERO',
): void {
  const envido = state.hand.envido;
  if (envido.pending === null) throw new Error('NO_PENDING_ENVIDO');

  answerLastEnvidoCanto(state.hand.cantos, answer);
  events.push({ type: 'ENVIDO_ANSWERED', playerId, answer });

  const chain = callsOf(state);
  const lastCallerTeam = envido.chain[envido.chain.length - 1].team;
  envido.pending = null;
  envido.status = 'resolved';

  const sayings = answer === 'QUIERO' ? envidoSayings(state) : [];
  const winner = sayings.length === 0 ? null : envidoWinner(sayings);
  const winnerTeam = winner === null ? lastCallerTeam : teamOf(state, winner.playerId);
  const revealed = winner === null ? [] : sayings.slice(0, sayings.findIndex((saying) => saying.playerId === winner.playerId) + 1);
  const points = envidoPoints(chain, faltaValue(state, winnerTeam));
  const awarded = answer === 'QUIERO' ? points.querido : points.noQuerido;

  envido.result = { winnerTeam, points: awarded, accepted: answer === 'QUIERO', revealed };
  events.push({ type: 'ENVIDO_RESOLVED', winnerTeam, points: awarded, revealed });
  addPoints(state, events, winnerTeam, awarded, 'ENVIDO');

  // AC 9: si el envido terminó la partida, no hay fase a la que volver.
  if (state.phase === 'MATCH_OVER') return;
  state.phase = envido.resumeTrucoAfter ? 'AWAITING_TRUCO' : 'PLAYING';
}
