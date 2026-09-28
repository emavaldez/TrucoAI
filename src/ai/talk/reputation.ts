// Reputación en la partida (r4-reputación, pedido de Emmanuel 2026-09-28: "a 30 puntos se arrastra el creer y
// mentir"). Lo dicho en voz alta se puede comprobar al terminar la mano, con lo que se vio en la mesa:
// - el tanto, si lo cantó en el envido o si jugó sus tres cartas;
// - las cartas, si jugó todas las que tenía cuando habló.
// Con eso cada jugador junta, durante la partida, cuántas veces lo que dijo resultó verdad y cuántas mentira.
// La red la ve (tramo `reputation` de la observación) y la heurística le cree más o menos según ella.

import { envidoScore } from '../../engine/index.js';
import type { Card, MatchState, PlayerId } from '../../engine/index.js';
import { trueLevel } from './claims.js';
import type { PublicClaim } from './team.js';

/** Un dicho con lo que hace falta para comprobarlo después (las cartas que tenía al hablar). */
export interface SpokenClaim extends PublicClaim {
  cards: readonly string[];
}

export interface Rep {
  verdad: number;
  mentira: number;
}

export type Reputation = Record<PlayerId, Rep>;

const ORDER = ['mucho', 'algo', 'nada'] as const;

/** Lo que tenía, si se llegó a ver en la mesa (o `null` si no se puede saber). */
function revealedLevel(state: MatchState, claim: SpokenClaim, played: ReadonlyMap<string, Card>): 'mucho' | 'algo' | 'nada' | null {
  const hand = state.hand;
  if (claim.about === 'tanto') {
    const said = hand.envido.result?.revealed.find((entry) => entry.playerId === claim.from);
    const dealt = hand.dealt[claim.from] ?? [];
    const allPlayed = dealt.length > 0 && dealt.every((card) => played.has(card.id));
    const score = said ? said.score : allPlayed ? envidoScore(dealt) : null;
    if (score === null) return null;
    return score >= 28 ? 'mucho' : score >= 24 ? 'algo' : 'nada';
  }
  if (claim.cards.length === 0 || !claim.cards.every((id) => played.has(id))) return null;
  return trueLevel(
    'cartas',
    [],
    claim.cards.map((id) => played.get(id) as Card),
  );
}

/**
 * Al terminar la mano: qué dichos se pudieron comprobar. Verdad si coincide, mentira si dijo lo contrario
 * ("nada" teniendo mucho o "mucho" sin nada); "algo" contra un extremo no cuenta (ni una ni otra).
 */
export function checkClaims(
  state: MatchState,
  spoken: readonly SpokenClaim[],
): { from: PlayerId; about: PublicClaim['about']; verdict: 'verdad' | 'mentira' }[] {
  const played = new Map<string, Card>();
  for (const trick of [...state.hand.tricks, state.hand.currentTrick]) for (const play of trick.plays) played.set(play.card.id, play.card);
  const out: { from: PlayerId; about: PublicClaim['about']; verdict: 'verdad' | 'mentira' }[] = [];
  for (const claim of spoken) {
    if (claim.level === 'calla') continue;
    const truth = revealedLevel(state, claim, played);
    if (truth === null) continue;
    const gap = Math.abs(ORDER.indexOf(truth) - ORDER.indexOf(claim.level));
    if (gap === 0) out.push({ from: claim.from, about: claim.about, verdict: 'verdad' });
    else if (gap === 2) out.push({ from: claim.from, about: claim.about, verdict: 'mentira' });
  }
  return out;
}

export function addVerdicts(reputation: Reputation, verdicts: ReturnType<typeof checkClaims>): void {
  for (const { from, verdict } of verdicts) {
    const rep = (reputation[from] ??= { verdad: 0, mentira: 0 });
    rep[verdict] += 1;
  }
}

/** Cuánto le cree la heurística a alguien según su reputación: 75% de entrada, mucho menos si lo pescó mintiendo. */
export function trustFor(rep: Rep | undefined, base = 0.75): number {
  if (!rep) return base;
  return Math.min(0.95, Math.max(0.05, base + 0.05 * rep.verdad - 0.3 * rep.mentira));
}
