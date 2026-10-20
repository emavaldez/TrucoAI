// Lo que se habla en el equipo en voz alta (todo es público, decisión de Emmanuel 2026-09-28) y lo que
// se juega alrededor de eso:
// - Los compañeros de la IA contestan las consultas ("¿canto tanto?", "¿qué hacemos?"). Pueden mentir
//   para que el rival se anime a cantar: la verdad ya se la dijeron al pie con señas.
// - Lo que alguien afirma en voz alta queda como un dicho público que los rivales de la IA pueden creer.
// - La táctica de esperar y subir: el pie que sabe que su equipo tiene mucho tanto y todavía le falta
//   jugar al pie rival no canta; espera que el rival cante y le sube.
// - Lo que dicen los compañeros (de la IA o el humano) influye en el pie, pero la decisión final es del pie
//   (Emmanuel 2026-10-20): con la mano clara manda él; en el borde, sigue el consejo.

import { cardRank, envidoScore, getLegalActions, pieOf } from '../../engine/index.js';
import type { Action, Card, EnvidoCall, MatchState, PlayerId, Rng, TeamId } from '../../engine/index.js';
import type { Signal } from '../signs.js';

/** Lo que alguien dijo en voz alta sobre su mano (puede ser mentira). */
export interface PublicClaim {
  from: PlayerId;
  about: 'tanto' | 'cartas';
  /** 'calla': le tocaba hablar (le preguntaron) y no dijo nada (r4: la red también puede callarse) */
  level: 'mucho' | 'algo' | 'nada' | 'calla';
  /** cuánto le cree el que escucha (0–1); sin esto, TRUST_PUBLIC_CLAIMS (r4-reputación: según lo que lo pescaron) */
  trust?: number;
}

/** Consejo del equipo para el que decide (el pie o el que contesta). */
export interface TeamAdvice {
  tanto?: 'canta' | 'callado';
  /** cantar o no el truco (lo que opinan los compañeros antes de que juegue el pie) */
  truco?: 'canta' | 'espera';
  /** contestar un canto: querer, no querer, subir, o (a un truco en la 1ra baza) «el envido está primero» */
  resp?: 'quiero' | 'no' | 'subile' | 'envido';
  /** qué envido cantar al subir o con «el envido está primero» (si se nombró) */
  call?: EnvidoCall;
}

/** Si alguien le cree a un dicho: condición sobre sus 3 cartas repartidas. */
export function claimTest(claim: PublicClaim): (dealt: readonly Card[]) => boolean {
  if (claim.level === 'calla') return () => true;
  if (claim.about === 'tanto') {
    if (claim.level === 'mucho') return (dealt) => envidoScore(dealt) >= 28;
    if (claim.level === 'algo') return (dealt) => envidoScore(dealt) >= 24;
    return (dealt) => envidoScore(dealt) <= 25;
  }
  const big = (dealt: readonly Card[]) => dealt.filter((card) => cardRank(card) >= 10).length;
  if (claim.level === 'mucho') return (dealt) => big(dealt) >= 1 && dealt.filter((card) => cardRank(card) >= 9).length >= 2;
  if (claim.level === 'algo') return (dealt) => dealt.some((card) => cardRank(card) >= 8);
  return (dealt) => dealt.every((card) => cardRank(card) < 9);
}

function teamOf(state: MatchState, playerId: PlayerId): TeamId {
  return (state.seats.find((seat) => seat.id === playerId)?.team ?? 0) as TeamId;
}

/** ¿Al pie rival todavía le falta jugar en la 1ra baza? (entonces todavía puede cantar envido) */
export function rivalPieStillToAct(state: MatchState, playerId: PlayerId): boolean {
  if (state.hand.tricks.length > 0 || state.hand.envido.status !== 'none') return false;
  const rivalPie = pieOf(state, (1 - teamOf(state, playerId)) as TeamId);
  return !state.hand.currentTrick.plays.some((play) => play.playerId === rivalPie);
}

/** ¿El equipo de `playerId` tiene mucho tanto, según lo que él sabe (su mano y las señas verdaderas)? */
export function teamHasStrongTanto(state: MatchState, playerId: PlayerId, signals: readonly Signal[]): boolean {
  if (envidoScore(state.hand.dealt[playerId] ?? []) >= 30) return true;
  const team = teamOf(state, playerId);
  return signals.some((signal) => signal.kind === 'ENVIDO' && signal.from !== playerId && teamOf(state, signal.from) === team);
}

/**
 * Lo que contesta un compañero de la IA cuando le preguntan por el tanto (o si se canta). Dice la verdad,
 * salvo cuando tiene mucho (ya se lo señó al pie) y todavía puede cantar el rival: ahí, a veces, dice que
 * no tiene nada para que el rival se anime y su pie le suba.
 */
export function aiTantoAnswer(state: MatchState, playerId: PlayerId, rng: Rng): { text: string; claim: PublicClaim; advice?: TeamAdvice['tanto'] } {
  const score = envidoScore(state.hand.dealt[playerId] ?? []);
  const claim = (level: PublicClaim['level']): PublicClaim => ({ from: playerId, about: 'tanto', level });
  // El engaño: lo dice para el rival; a su pie no le aconseja nada (ya sabe la verdad por la seña). Y mientras
  // el pie rival pueda cantar, un «cantá» sincero tampoco es consejo: el pie decide si espera y sube.
  const early = rivalPieStillToAct(state, playerId);
  if (score >= 27 && early && rng.next() < 0.7) return { text: 'No, nada. Jugá callado.', claim: claim('nada') };
  if (score >= 30) return { text: '¡Cantá, que tengo muchos!', claim: claim('mucho'), ...(early ? {} : { advice: 'canta' as const }) };
  if (score >= 27) return { text: 'Tengo algo. Cantá.', claim: claim('algo'), ...(early ? {} : { advice: 'canta' as const }) };
  if (score >= 24) return { text: 'Poco. Como quieras.', claim: claim('algo') };
  return { text: 'No, nada. Jugá callado.', claim: claim('nada'), advice: 'callado' };
}

/**
 * Opinión de un compañero de la IA sobre cantar el truco, antes de que juegue el pie (Emmanuel 2026-10-20).
 * Con dos cartas grandes, "cantá"; sin nada, "jugá callado"; en el medio no opina. Lo que dice queda como
 * dicho público sobre sus cartas.
 */
export function aiTrucoOpinion(state: MatchState, playerId: PlayerId): { text: string; claim: PublicClaim; advice?: TeamAdvice['truco'] } | null {
  const hand = state.hand.hands[playerId] ?? [];
  if (hand.length === 0) return null;
  const ranks = hand.map(cardRank);
  const big = ranks.filter((rank) => rank >= 10).length;
  const good = ranks.filter((rank) => rank >= 8).length;
  const claim = (level: PublicClaim['level']): PublicClaim => ({ from: playerId, about: 'cartas', level });
  if (big >= 2 || (big === 1 && good >= 2)) return { text: 'Cantá, que vengo bien.', claim: claim('mucho'), advice: 'canta' };
  if (good === 0) return { text: 'Jugá callado, estoy seco.', claim: claim('nada'), advice: 'espera' };
  return null;
}

/** Junta la opinión de varios compañeros: la más decidida gana (subile > quiero > no; canta > espera). */
export function mergeAdvice(current: TeamAdvice, next: TeamAdvice): TeamAdvice {
  const out = { ...current };
  const rank = (value: string | undefined, order: readonly string[]): number => (value === undefined ? -1 : order.indexOf(value));
  if (rank(next.tanto, ['callado', 'canta']) > rank(out.tanto, ['callado', 'canta'])) out.tanto = next.tanto;
  if (rank(next.truco, ['espera', 'canta']) > rank(out.truco, ['espera', 'canta'])) out.truco = next.truco;
  if (rank(next.resp, ['no', 'quiero', 'envido', 'subile']) > rank(out.resp, ['no', 'quiero', 'envido', 'subile'])) {
    out.resp = next.resp;
    out.call = next.call;
  } else if (next.call !== undefined && out.resp === next.resp) out.call = next.call;
  return out;
}

/** Lo que contesta un compañero de la IA cuando le preguntan por sus cartas (siempre en términos de seña). */
export function aiCardsAnswer(state: MatchState, playerId: PlayerId): { text: string; claim: PublicClaim } {
  const hand = state.hand.hands[playerId] ?? [];
  const ranks = hand.map(cardRank);
  const big = ranks.filter((rank) => rank >= 10).length;
  const good = ranks.filter((rank) => rank >= 8).length;
  const claim = (level: PublicClaim['level']): PublicClaim => ({ from: playerId, about: 'cartas', level });
  if (hand.length === 0) return { text: 'Ya no me quedan cartas.', claim: claim('nada') };
  if (big >= 2 || (big === 1 && good >= 2)) return { text: 'Vengo bien.', claim: claim('mucho') };
  if (big === 1 || good >= 1) return { text: 'Algo tengo.', claim: claim('algo') };
  return { text: 'Nada, estoy seco.', claim: claim('nada') };
}

/** Opinión de un compañero de la IA cuando el rival cantó ("¿qué hacemos?"). */
export function aiResponseOpinion(state: MatchState, playerId: PlayerId): { text: string; advice: NonNullable<TeamAdvice['resp']> } {
  const hand = state.hand;
  if (hand.envido.pending) {
    const score = envidoScore(hand.dealt[playerId] ?? []);
    if (score >= 31) return { text: 'Subile, que tengo muchos.', advice: 'subile' };
    if (score >= 28) return { text: 'Querele.', advice: 'quiero' };
    return { text: 'Yo no tengo. No le quieras.', advice: 'no' };
  }
  const ranks = (hand.hands[playerId] ?? []).map(cardRank);
  const big = ranks.filter((rank) => rank >= 10).length;
  if (big >= 2) return { text: 'Subile, vengo bien.', advice: 'subile' };
  if (big === 1 || ranks.some((rank) => rank >= 9)) return { text: 'Querele, algo tengo.', advice: 'quiero' };
  return { text: 'Yo estoy seco. No le quieras.', advice: 'no' };
}

/**
 * Decisión táctica del pie o del que contesta, encima de su política (heurística o red):
 * - `action`: jugar esto (seguir el consejo del equipo o subir después de haber esperado);
 * - `exclude`: que la política elija sin estas acciones (no cantar envido ahora);
 * - `slowPlay`: el pie decidió esperar y subir.
 * `null` = que decida la política sola.
 */
export function tacticalDecision(args: {
  state: MatchState;
  actor: PlayerId;
  signals: readonly Signal[];
  advice: TeamAdvice;
  slowPlaying: boolean;
}): { action?: Action; exclude?: (action: Action) => boolean; slowPlay?: boolean } | null {
  const { state, actor, signals, slowPlaying } = args;
  const legal = getLegalActions(state, actor);
  const find = (predicate: (action: Action) => boolean): Action | undefined => legal.find(predicate);
  const isEnvidoCall = (action: Action): boolean => action.type === 'CALL_ENVIDO';
  const hand = state.hand;
  // La decisión final es del que decide: con la mano clara no sigue un "no" ni un "esperá" (Emmanuel 2026-10-20).
  const myScore = envidoScore(hand.dealt[actor] ?? []);
  const myBest = Math.max(-1, ...(hand.hands[actor] ?? []).map(cardRank));
  const advice: TeamAdvice = { ...args.advice };
  if (state.phase === 'AWAITING_ENVIDO' && advice.resp === 'no' && myScore >= 28) advice.resp = undefined;
  if (state.phase === 'AWAITING_TRUCO' && advice.resp === 'no' && myBest >= 12) advice.resp = undefined;

  // Contestar un envido del rival.
  if (state.phase === 'AWAITING_ENVIDO' && hand.envido.pending?.responderId === actor) {
    if (slowPlaying && state.rules.playerCount >= 4 && teamHasStrongTanto(state, actor, signals)) {
      const raise = find((a) => a.type === 'CALL_ENVIDO' && a.call === 'R') ?? find((a) => a.type === 'CALL_ENVIDO' && a.call === 'E');
      const accept = find((a) => a.type === 'ANSWER_ENVIDO' && a.answer === 'QUIERO');
      if (raise || accept) return { action: raise ?? accept };
    }
    if (advice.resp === 'quiero') return pick(find((a) => a.type === 'ANSWER_ENVIDO' && a.answer === 'QUIERO'));
    if (advice.resp === 'no') return pick(find((a) => a.type === 'ANSWER_ENVIDO' && a.answer === 'NO_QUIERO'));
    if (advice.resp === 'subile' || advice.resp === 'envido') {
      return pick(
        find((a) => a.type === 'CALL_ENVIDO' && a.call === advice.call) ??
          find((a) => a.type === 'CALL_ENVIDO' && a.call === 'R') ??
          find((a) => a.type === 'CALL_ENVIDO'),
      );
    }
    return null;
  }
  // Contestar un truco del rival.
  if (state.phase === 'AWAITING_TRUCO' && hand.truco.pending?.responderId === actor) {
    if (advice.resp === 'quiero') return pick(find((a) => a.type === 'ANSWER_TRUCO' && a.answer === 'QUIERO'));
    if (advice.resp === 'no') return pick(find((a) => a.type === 'ANSWER_TRUCO' && a.answer === 'NO_QUIERO'));
    if (advice.resp === 'subile') return pick(find((a) => a.type === 'CALL_TRUCO') ?? find((a) => a.type === 'ANSWER_TRUCO' && a.answer === 'QUIERO'));
    // «El envido está primero»: antes de contestar el truco, se canta el envido.
    if (advice.resp === 'envido') {
      return pick(find((a) => a.type === 'CALL_ENVIDO' && a.call === (advice.call ?? 'E')) ?? find((a) => a.type === 'CALL_ENVIDO'));
    }
    return null;
  }
  if (state.phase !== 'PLAYING' || state.rules.playerCount < 4) return null;
  // Cantar o no el tanto (el pie, en su turno de la 1ra baza): «cantá el tanto» se obedece; si no, esperar y subir.
  if (legal.some(isEnvidoCall)) {
    if (advice.tanto === 'canta') return pick(find((a) => a.type === 'CALL_ENVIDO' && a.call === 'E'));
    if (teamHasStrongTanto(state, actor, signals) && rivalPieStillToAct(state, actor)) return { exclude: isEnvidoCall, slowPlay: true };
    if (advice.tanto === 'callado') return { exclude: isEnvidoCall };
  }
  // El truco, según los compañeros: "cantá" lo sigue si tiene con qué acompañar; "esperá", salvo que tenga una grande.
  const isTrucoCall = (action: Action): boolean => action.type === 'CALL_TRUCO';
  if (legal.some(isTrucoCall) && hand.truco.level === 0) {
    // "Cantá" recién cuando el tanto ya está resuelto (si no, se pisaría el envido).
    if (advice.truco === 'canta' && myBest >= 8 && !legal.some(isEnvidoCall)) return pick(find(isTrucoCall));
    if (advice.truco === 'espera' && myBest < 12) return { exclude: isTrucoCall };
  }
  return null;
}

function pick(action: Action | undefined): { action: Action } | null {
  return action ? { action } : null;
}
