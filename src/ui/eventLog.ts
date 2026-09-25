// Memoria de la UI sobre lo que pasó: globos de canto (se van solos), el feed "En esta mano",
// avisos del centro del paño, puntos por mano y estadísticas de la partida.
// Se alimenta con los eventos del motor (que nunca revelan información oculta).

import type { GameEvent, MatchState, PlayerId, TeamId } from '../engine/index.js';
import { ENVIDO_LABELS, TRUCO_LABELS, ordinal, playerName, teamName, teamOfPlayer, verb } from './text.js';

export interface Bubble {
  playerId: PlayerId;
  text: string;
  /** desde cuándo se ve (los tantos se dicen de a uno) */
  from: number;
  until: number;
}

export interface FeedLine {
  /** HTML ya escapado (usa spans de color por equipo) */
  html: string;
}

export interface Notice {
  text: string;
  from: number;
  until: number;
}

/** Lo que muestra el que ganó el envido al terminar la mano (GDD §6.6). */
export interface EnvidoShow {
  playerId: PlayerId;
  score: number;
  submano: number | null;
}

export interface PointsEntry {
  team: TeamId;
  points: number;
  reason: 'ENVIDO' | 'FLOR' | 'TRUCO' | 'MANO' | 'NO_QUIERO' | 'MAZO';
  submano: number | null;
  /** qué se cobró, en palabras ("Envido + Real envido querido", "Retruco no querido") */
  label: string;
}

export interface MatchStats {
  envidosPlayed: number;
  envidosWon: number;
  trucosQueridos: number;
}

export const BUBBLE_MS = 2500;
export const NOTICE_MS = 3200;
/** Pausa entre lo que dice cada uno al cantar los tantos. */
export const SAYING_GAP_MS = 900;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function who(state: MatchState, playerId: PlayerId): string {
  const team = teamOfPlayer(state, playerId);
  return `<span class="t-${team === 0 ? 'nos' : 'ellos'}">${escape(playerName(state, playerId))}</span>`;
}

function teamSpan(team: TeamId): string {
  return `<span class="t-${team === 0 ? 'nos' : 'ellos'}">${teamName(team)}</span>`;
}

const FLOR_ANSWER_TEXT: Record<string, string> = {
  ACHICO: 'Con flor me achico',
  CONTRAFLOR: '¡Contraflor!',
  CONTRAFLOR_AL_RESTO: '¡Contraflor al resto!',
  QUIERO: '¡Quiero!',
  NO_QUIERO: 'No quiero',
};

export class EventLog {
  bubbles: Bubble[] = [];
  feed: FeedLine[] = [];
  notice: Notice | null = null;
  /** puntos de la mano en curso */
  handPoints: PointsEntry[] = [];
  /** puntos de la última mano cerrada (para el resumen) */
  lastHandPoints: PointsEntry[] = [];
  stats: MatchStats = { envidosPlayed: 0, envidosWon: 0, trucosQueridos: 0 };
  /** ganadores del envido de la mano en curso / de la última mano cerrada */
  envidoShow: EnvidoShow[] = [];
  lastEnvidoShow: EnvidoShow[] = [];
  /** separación entre los dichos de los tantos (0 en modo rápido) */
  sayingGap = SAYING_GAP_MS;
  /** último texto para `aria-live` */
  announcement = '';
  /** submano en curso (según los eventos), para anotar de qué submano son unos puntos */
  private currentSubmano: number | null = null;

  reset(): void {
    this.bubbles = [];
    this.feed = [];
    this.notice = null;
    this.handPoints = [];
    this.lastHandPoints = [];
    this.stats = { envidosPlayed: 0, envidosWon: 0, trucosQueridos: 0 };
    this.envidoShow = [];
    this.lastEnvidoShow = [];
    this.announcement = '';
  }

  /** ¿Se ve ahora? */
  static visible(item: { from: number; until: number }, now: number): boolean {
    return item.from <= now && now < item.until;
  }

  /** Quita globos y aviso vencidos. Devuelve true si cambió algo. */
  prune(now: number): boolean {
    const before = this.bubbles.length + (this.notice ? 1 : 0);
    this.bubbles = this.bubbles.filter((bubble) => bubble.until > now);
    if (this.notice && this.notice.until <= now) this.notice = null;
    return before !== this.bubbles.length + (this.notice ? 1 : 0);
  }

  /** Próximo momento en que cambia lo que se ve (aparece o se va algo), o null. */
  nextExpiry(now: number = Date.now()): number | null {
    const items: { from: number; until: number }[] = [...this.bubbles];
    if (this.notice) items.push(this.notice);
    const times = items.map((item) => (item.from > now ? item.from : item.until));
    return times.length === 0 ? null : Math.min(...times);
  }

  private bubble(playerId: PlayerId, text: string, now: number, delay = 0): void {
    const from = now + delay;
    // El globo nuevo corta al anterior del mismo jugador (si no, se superpondrían).
    this.bubbles = this.bubbles
      .map((bubble) => (bubble.playerId === playerId && bubble.until > from ? { ...bubble, until: from } : bubble))
      .filter((bubble) => bubble.until > bubble.from);
    this.bubbles.push({ playerId, text, from, until: from + BUBBLE_MS });
  }

  private line(html: string): void {
    this.feed.push({ html });
    if (this.feed.length > 3) this.feed = this.feed.slice(-3);
  }

  private say(text: string, now: number, notice = false, delay = 0): void {
    this.announcement = text;
    if (notice) this.notice = { text, from: now + delay, until: now + delay + NOTICE_MS };
  }

  /** Procesa los eventos de un cambio; `state` es el estado DESPUÉS de esos eventos. */
  ingest(events: readonly GameEvent[], state: MatchState, now: number): void {
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      const previous = index > 0 ? events[index - 1] : null;
      switch (event.type) {
        case 'HAND_STARTED':
          this.bubbles = [];
          this.feed = [];
          this.notice = null;
          this.handPoints = [];
          this.envidoShow = [];
          this.currentSubmano = null;
          this.announcement = `Mano ${event.hand}: da ${playerName(state, event.dealerId)}.`;
          break;
        case 'SUBMANO_STARTED': {
          const [a, b] = event.pair;
          this.currentSubmano = event.submano;
          const text = `Pica Pica ${event.submano + 1} de 3: ${playerName(state, a)} contra ${playerName(state, b)}`;
          this.line(`Pica Pica ${event.submano + 1}: ${who(state, a)} contra ${who(state, b)}`);
          this.say(text, now, true);
          break;
        }
        case 'TRICK_WON': {
          if (event.winnerTeam === 'PARDA') {
            this.line(`La ${ordinal(event.trick)} fue parda`);
            this.say(`La ${ordinal(event.trick)} fue parda.`, now);
          } else {
            this.line(`${teamSpan(event.winnerTeam)} ${event.winnerTeam === 0 ? 'ganamos' : 'ganaron'} la ${ordinal(event.trick)}`);
            this.say(`${teamName(event.winnerTeam)} ${event.winnerTeam === 0 ? 'ganamos' : 'ganaron'} la ${ordinal(event.trick)}.`, now);
          }
          break;
        }
        case 'TRUCO_CALLED': {
          const raise =
            previous?.type === 'TRUCO_ANSWERED' && previous.playerId === event.playerId && previous.answer === 'QUIERO';
          const label = TRUCO_LABELS[event.level];
          this.bubble(event.playerId, raise ? `¡Quiero ${label.toLowerCase()}!` : `¡${label}!`, now);
          this.line(`${who(state, event.playerId)} ${verb(event.playerId, 'cantaste', 'cantó')} <b>${label}</b>`);
          this.say(`${playerName(state, event.playerId)} ${verb(event.playerId, 'cantaste', 'cantó')} ${label}.`, now);
          break;
        }
        case 'TRUCO_ANSWERED': {
          if (event.answer === 'QUIERO') this.stats.trucosQueridos += 1;
          // "Quiero retruco" ya lo dice el globo del canto que sigue.
          const next = events[index + 1];
          const raised = next?.type === 'TRUCO_CALLED' && next.playerId === event.playerId;
          if (!raised) this.bubble(event.playerId, event.answer === 'QUIERO' ? '¡Quiero!' : 'No quiero', now);
          this.line(`${who(state, event.playerId)}: ${event.answer === 'QUIERO' ? 'quiero' : 'no quiero'}`);
          this.say(`${playerName(state, event.playerId)}: ${event.answer === 'QUIERO' ? 'quiero' : 'no quiero'}.`, now);
          break;
        }
        case 'ENVIDO_CALLED': {
          const label = ENVIDO_LABELS[event.call];
          this.bubble(event.playerId, `¡${label}!`, now);
          this.line(`${who(state, event.playerId)} ${verb(event.playerId, 'cantaste', 'cantó')} <b>${label}</b>`);
          this.say(`${playerName(state, event.playerId)} ${verb(event.playerId, 'cantaste', 'cantó')} ${label}.`, now);
          break;
        }
        case 'ENVIDO_ANSWERED':
          this.bubble(event.playerId, event.answer === 'QUIERO' ? '¡Quiero!' : 'No quiero', now);
          break;
        case 'ENVIDO_RESOLVED': {
          this.stats.envidosPlayed += 1;
          if (event.winnerTeam === 0) this.stats.envidosWon += 1;
          if (event.revealed.length === 0) {
            this.line(`Envido no querido: ${teamSpan(event.winnerTeam)} +${event.points}`);
            this.say(`Envido no querido: ${teamName(event.winnerTeam)} suman ${event.points}.`, now, true);
            break;
          }
          // Los tantos se dicen de a uno, en el orden en que se cantan (GDD §6.6).
          event.sayings.forEach((saying, i) => {
            const text = saying.kind === 'SCORE' ? `${saying.score}` : saying.kind === 'ME_DIO' ? 'Me dio' : 'Son buenas';
            this.bubble(saying.playerId, text, now, i * this.sayingGap);
          });
          const winnerId = event.winnerId ?? event.revealed[event.revealed.length - 1].playerId;
          const winnerScore = event.revealed.find((entry) => entry.playerId === winnerId)?.score ?? 0;
          this.envidoShow.push({ playerId: winnerId, score: winnerScore, submano: this.currentSubmano });
          const text = `Envido: ${playerName(state, winnerId)} ${verb(winnerId, 'tenías', 'tenía')} ${winnerScore} · ${teamName(event.winnerTeam)} +${event.points}`;
          this.line(`Envido: ${who(state, winnerId)} con ${winnerScore} · ${teamSpan(event.winnerTeam)} +${event.points}`);
          this.say(text, now, true, event.sayings.length * this.sayingGap);
          break;
        }
        case 'FLOR_DECLARED':
          this.bubble(event.playerId, '¡Flor!', now);
          this.line(`${who(state, event.playerId)} ${verb(event.playerId, 'cantaste', 'cantó')} <b>flor</b>`);
          this.say(`${playerName(state, event.playerId)} ${verb(event.playerId, 'cantaste', 'cantó')} flor.`, now);
          break;
        case 'FLOR_ANSWERED':
          this.bubble(event.playerId, FLOR_ANSWER_TEXT[event.answer] ?? event.answer, now);
          break;
        case 'FLOR_RESOLVED': {
          for (const entry of event.revealed) this.bubble(entry.playerId, `Flor de ${entry.score}`, now);
          this.line(`Flor: ${teamSpan(event.winnerTeam)} +${event.points}`);
          this.say(`Flor: ${teamName(event.winnerTeam)} suman ${event.points}.`, now, true);
          break;
        }
        case 'MAZO':
          this.bubble(event.playerId, 'Me voy al mazo', now);
          this.line(`${who(state, event.playerId)} ${verb(event.playerId, 'te fuiste', 'se fue')} al mazo`);
          this.say(`${playerName(state, event.playerId)} ${verb(event.playerId, 'te fuiste', 'se fue')} al mazo.`, now);
          break;
        case 'POINTS':
          this.handPoints.push({
            team: event.team,
            points: event.points,
            reason: event.reason,
            submano: this.currentSubmano,
            label: pointsLabel(event.reason, event.points, state),
          });
          break;
        case 'HAND_OVER':
        case 'MATCH_OVER':
          this.lastHandPoints = this.handPoints.slice();
          this.lastEnvidoShow = this.envidoShow.slice();
          break;
        default:
          break;
      }
    }
  }
}

const TRUCO_KIND_LABEL: Record<string, string> = { TRUCO: 'Truco', RETRUCO: 'Retruco', VALE4: 'Vale cuatro' };

/** Rótulo de unos puntos a partir de lo que dice el estado de la mano (ya público). */
function pointsLabel(reason: PointsEntry['reason'], points: number, state: MatchState): string {
  const hand = state.hand;
  switch (reason) {
    case 'ENVIDO': {
      const chain = hand.envido.chain.map((c) => ENVIDO_LABELS[c.call]);
      const text = chain.length > 0 ? chain.map((label, i) => (i === 0 ? label : label.toLowerCase())).join(' + ') : 'Envido';
      return hand.envido.result && !hand.envido.result.accepted ? `${text} no querido` : `${text} querido`;
    }
    case 'FLOR': {
      const last = [...hand.cantos].reverse().find((c) => c.kind === 'FLOR' || c.kind === 'CONTRAFLOR' || c.kind === 'CONTRAFLOR_AL_RESTO');
      if (last?.kind === 'CONTRAFLOR') return last.answer === 'NO_QUIERO' ? 'Contraflor no querida' : 'Contraflor';
      if (last?.kind === 'CONTRAFLOR_AL_RESTO') return last.answer === 'NO_QUIERO' ? 'Contraflor al resto no querida' : 'Contraflor al resto';
      if (last?.answer === 'ACHICO') return 'Flor (con flor me achico)';
      return 'Flor';
    }
    case 'MANO':
      return points > 1 ? `${TRUCO_LABELS[(points - 1) as 1 | 2 | 3]} querido` : 'Mano ganada';
    case 'NO_QUIERO': {
      const last = [...hand.cantos].reverse().find((c) => c.kind in TRUCO_KIND_LABEL);
      return `${last ? TRUCO_KIND_LABEL[last.kind] : 'Truco'} no querido`;
    }
    case 'MAZO': {
      const last = [...hand.cantos].reverse().find((c) => c.kind === 'MAZO');
      return last ? `${playerName(state, last.by)} ${verb(last.by, 'te fuiste', 'se fue')} al mazo` : 'Irse al mazo';
    }
    default:
      return 'Truco';
  }
}
