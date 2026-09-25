// Memoria de la UI sobre lo que pasó: globos de canto (se van solos), el feed "En esta mano",
// avisos del centro del paño, puntos por mano y estadísticas de la partida.
// Se alimenta con los eventos del motor (que nunca revelan información oculta).

import type { GameEvent, MatchState, PlayerId, TeamId } from '../engine/index.js';
import { ENVIDO_LABELS, TRUCO_LABELS, ordinal, playerName, teamName, teamOfPlayer, verb } from './text.js';

export interface Bubble {
  playerId: PlayerId;
  text: string;
  until: number;
}

export interface FeedLine {
  /** HTML ya escapado (usa spans de color por equipo) */
  html: string;
}

export interface Notice {
  text: string;
  until: number;
}

export interface PointsEntry {
  team: TeamId;
  points: number;
  reason: 'ENVIDO' | 'FLOR' | 'TRUCO' | 'MANO' | 'NO_QUIERO' | 'MAZO';
  submano: number | null;
}

export interface MatchStats {
  envidosPlayed: number;
  envidosWon: number;
  trucosQueridos: number;
}

export const BUBBLE_MS = 2500;
export const NOTICE_MS = 3200;

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
    this.announcement = '';
  }

  /** Quita globos y aviso vencidos. Devuelve true si cambió algo. */
  prune(now: number): boolean {
    const before = this.bubbles.length + (this.notice ? 1 : 0);
    this.bubbles = this.bubbles.filter((bubble) => bubble.until > now);
    if (this.notice && this.notice.until <= now) this.notice = null;
    return before !== this.bubbles.length + (this.notice ? 1 : 0);
  }

  /** Próximo vencimiento (para programar un re-render), o null. */
  nextExpiry(): number | null {
    const times = this.bubbles.map((bubble) => bubble.until);
    if (this.notice) times.push(this.notice.until);
    return times.length === 0 ? null : Math.min(...times);
  }

  private bubble(playerId: PlayerId, text: string, now: number): void {
    this.bubbles = this.bubbles.filter((bubble) => bubble.playerId !== playerId);
    this.bubbles.push({ playerId, text, until: now + BUBBLE_MS });
  }

  private line(html: string): void {
    this.feed.push({ html });
    if (this.feed.length > 3) this.feed = this.feed.slice(-3);
  }

  private say(text: string, now: number, notice = false): void {
    this.announcement = text;
    if (notice) this.notice = { text, until: now + NOTICE_MS };
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
          this.currentSubmano = null;
          this.announcement = `Mano ${event.hand}: da ${playerName(state, event.dealerId)}.`;
          break;
        case 'SUBMANO_STARTED': {
          const [a, b] = event.pair;
          this.currentSubmano = event.submano;
          const text = `Submano ${event.submano + 1} de 3: ${playerName(state, a)} contra ${playerName(state, b)}`;
          this.line(`Pica-pica · submano ${event.submano + 1}: ${who(state, a)} contra ${who(state, b)}`);
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
          for (const entry of event.revealed) this.bubble(entry.playerId, `${entry.score}`, now);
          const winner = event.revealed[event.revealed.length - 1];
          // Los que venían después del ganador y son del otro equipo dicen "son buenas".
          const order = state.hand.participants;
          const winnerIndex = order.indexOf(winner.playerId);
          for (const playerId of order.slice(winnerIndex + 1)) {
            if (teamOfPlayer(state, playerId) !== event.winnerTeam) this.bubble(playerId, 'Son buenas', now);
          }
          const text = `Envido: ${playerName(state, winner.playerId)} ${verb(winner.playerId, 'tenías', 'tenía')} ${winner.score} · ${teamName(event.winnerTeam)} +${event.points}`;
          this.line(`Envido: ${who(state, winner.playerId)} con ${winner.score} · ${teamSpan(event.winnerTeam)} +${event.points}`);
          this.say(text, now, true);
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
          });
          break;
        case 'HAND_OVER':
        case 'MATCH_OVER':
          this.lastHandPoints = this.handPoints.slice();
          break;
        default:
          break;
      }
    }
  }
}
