// Pantalla de juego: barra superior, mesa (asientos, baza en el paño, centro), mano propia,
// acciones o panel de respuesta, globos y feed. Todo se deriva del estado del motor y de las
// acciones legales del humano (arquitectura §8): no hay botón que el motor vaya a rechazar.

import { cardRank, envidoScore } from '../engine/index.js';
import type { Action, Card, MatchState, PlayerId, TeamId, TrickPlay } from '../engine/index.js';
import type { MatchSettings } from '../app/GameController.js';
import { renderCard } from './cardView.js';
import { escapeHtml } from './escape.js';
import type { EventLog } from './eventLog.js';
import { tableGeometry, type LayoutMode, type TableGeometry } from './layout.js';
import { encodeAction, lockIcon, menuIcon, renderScore, renderSeat } from './pieces.js';
import { ENVIDO_LABELS, TRUCO_LABELS, cardName, ordinal, playerName, teamName } from './text.js';

export const HUMAN: PlayerId = 'p0';

export interface GameViewContext {
  state: MatchState;
  settings: MatchSettings;
  mode: LayoutMode;
  /** acciones legales del humano ahora */
  legal: Action[];
  actor: PlayerId | null;
  log: EventLog;
  now: number;
}

// ---------- utilidades de estado (solo información pública) ----------

function teamOf(state: MatchState, playerId: PlayerId): TeamId {
  return state.seats.find((seat) => seat.id === playerId)?.team ?? 0;
}

/** La baza que se muestra en el paño: la actual; si está vacía, la última terminada (para verla). */
export function displayedTrick(state: MatchState): { plays: TrickPlay[]; done: boolean; winnerId: PlayerId | null } {
  const hand = state.hand;
  const n = hand.participants.length;
  const current = hand.currentTrick.plays;
  const over = state.phase === 'HAND_OVER' || state.phase === 'MATCH_OVER';
  // Con la mano terminada en medio de una baza (no quiero, mazo) nadie "va ganando".
  if (current.length > 0 && current.length < n) return { plays: current, done: over, winnerId: over ? null : runningWinner(state, current) };
  const last = hand.tricks[hand.tricks.length - 1];
  if (last) return { plays: last.plays, done: true, winnerId: last.winnerPlayerId };
  // Pica-pica: entre submanos se sigue viendo la última baza de la submano anterior.
  const results = hand.picaPica?.results ?? [];
  const previous = results[results.length - 1];
  const previousTrick = previous?.tricks[previous.tricks.length - 1];
  if (previousTrick && hand.currentTrick.plays.length === 0) {
    return { plays: previousTrick.plays, done: true, winnerId: previousTrick.winnerPlayerId };
  }
  return { plays: [], done: false, winnerId: null };
}

/** Quién va ganando la baza en curso (null si es parda por ahora). */
function runningWinner(state: MatchState, plays: readonly TrickPlay[]): PlayerId | null {
  const top = Math.max(...plays.map((play) => cardRank(play.card)));
  const best = plays.filter((play) => cardRank(play.card) === top);
  const teams = new Set(best.map((play) => teamOf(state, play.playerId)));
  return teams.size > 1 ? null : best[0].playerId;
}

/** Texto del canto vigente para la barra superior. */
export function cantoChip(state: MatchState): string | null {
  const truco = state.hand.truco;
  if (truco.pending) return `${TRUCO_LABELS[truco.pending.level]} cantado`;
  const envido = state.hand.envido;
  if (envido.status === 'calling' && envido.chain.length > 0) {
    return `${ENVIDO_LABELS[envido.chain[envido.chain.length - 1].call]} cantado`;
  }
  if (truco.level > 0) return `${TRUCO_LABELS[truco.level as 1 | 2 | 3]} · vale ${truco.level + 1}`;
  return null;
}

/** Falta envido con lo público (GDD §6.5): para el que la gane. */
export function faltaValue(state: MatchState, winnerTeam: TeamId): number {
  if (state.hand.picaPica !== null) return 7;
  const leader = Math.max(state.scores[0], state.scores[1]);
  if (leader < 15) return state.rules.targetScore - state.scores[winnerTeam];
  return state.rules.targetScore - leader;
}

/** Cómo se muestra la falta envido: el partido (en las malas), N puntos, o 7 en pica-pica. */
export function faltaText(state: MatchState): string {
  if (state.hand.picaPica !== null) return '7';
  const leader = Math.max(state.scores[0], state.scores[1]);
  return leader < 15 ? 'el partido' : String(state.rules.targetScore - leader);
}

function chainPoints(calls: readonly string[], falta: number): number {
  if (calls.includes('F')) return falta;
  return calls.reduce((total, call) => total + (call === 'R' ? 3 : 2), 0);
}

function humanInPlay(state: MatchState): boolean {
  return state.hand.participants.includes(HUMAN);
}

/** El humano solo puede cantar su flor (la interfaz la canta sola). */
function onlyFlor(legal: readonly Action[]): boolean {
  return legal.length === 1 && legal[0].type === 'DECLARE_FLOR';
}

function isAwaiting(state: MatchState): boolean {
  return state.phase === 'AWAITING_TRUCO' || state.phase === 'AWAITING_ENVIDO' || state.phase === 'AWAITING_FLOR';
}

// ---------- barra superior ----------

function renderTopBar(ctx: GameViewContext): string {
  const { state } = ctx;
  const chip = cantoChip(state);
  const pica = state.hand.picaPica && ctx.mode === 'portrait' ? `Pica ${state.hand.picaPica.submano + 1}/3` : null;
  const chips =
    `<span class="chip" data-testid="hand-number">Mano ${state.hand.number}</span>` +
    (pica ? `<span class="chip chip--gold">${pica}</span>` : '') +
    (chip ? `<span class="chip chip--gold" data-testid="canto-chip">${escapeHtml(chip)}</span>` : '');
  const menu = `<button type="button" class="icon-btn" data-ui="pause" data-testid="menu-button" aria-label="Menú de la partida">${menuIcon()}</button>`;
  if (ctx.mode === 'portrait') {
    return (
      `<div class="p-score">${renderScore(state.scores, true)}</div>` +
      `<div class="p-status-row"><div class="chips">${chips}</div>${menu}</div>`
    );
  }
  return (
    `<header class="topbar"><div class="brand"><span class="brand-truco">Truco</span><span class="brand-ai">AI</span></div>` +
    `${renderScore(state.scores, false)}<div class="topbar-right">${chips}${menu}</div></header>`
  );
}

// ---------- mesa ----------

function seatLabel(state: MatchState, playerId: PlayerId): string {
  if (playerId === HUMAN) return 'Tu turno';
  return isAwaiting(state) ? 'Responde' : 'Juega';
}

function renderSeats(ctx: GameViewContext, geo: TableGeometry): string {
  const { state } = ctx;
  const out: string[] = [];
  for (const seat of state.seats) {
    const index = seat.seat;
    if (ctx.mode === 'portrait' && index === 0) continue; // en celular la mano propia ya es "vos"
    const slot = geo.slots[index];
    const dim = state.hand.picaPica !== null && !state.hand.participants.includes(seat.id);
    const active = ctx.actor === seat.id && state.phase !== 'HAND_OVER' && state.phase !== 'MATCH_OVER';
    out.push(
      renderSeat(
        {
          id: seat.id,
          name: seat.name,
          team: seat.team,
          isHuman: seat.isHuman,
          cards: seat.isHuman ? 0 : state.hand.hands[seat.id].length,
          // En pica-pica, "Mano" es el mano de la submano en juego (decide los empates de envido).
          mano: (state.hand.picaPica ? state.hand.participants[0] : state.hand.manoId) === seat.id,
          dealer: state.hand.dealerId === seat.id,
          active,
          activeLabel: seatLabel(state, seat.id),
          dim,
          compact: ctx.mode === 'portrait',
        },
        slot.seat.x,
        slot.seat.y,
      ),
    );
  }
  return out.join('');
}

function renderPlayedCards(ctx: GameViewContext, geo: TableGeometry): string {
  const { state } = ctx;
  const trick = displayedTrick(state);
  const out: string[] = [];
  for (const play of trick.plays) {
    const seatIndex = state.seats.find((seat) => seat.id === play.playerId)?.seat ?? 0;
    const pos = geo.slots[seatIndex].card;
    const winner = trick.winnerId === play.playerId;
    out.push(
      `<div class="played" style="left:${pos.x}px;top:${pos.y}px" data-testid="played-${play.playerId}" data-anim="card-${play.card.id}">` +
        renderCard(play.card, { size: geo.cardSize, state: winner ? 'winner' : 'normal', tag: trick.done ? 'Ganó' : 'Va ganando' }) +
        `</div>`,
    );
  }
  // Lugar de "Tu carta" mientras la baza está en juego y todavía no jugaste.
  const humanPlayed = trick.plays.some((play) => play.playerId === HUMAN);
  const inProgress = !trick.done && state.phase !== 'HAND_OVER' && state.phase !== 'MATCH_OVER';
  if (humanInPlay(state) && !humanPlayed && (inProgress || trick.plays.length === 0)) {
    const pos = geo.slots[0].card;
    out.push(`<div class="card-slot card-slot--${geo.cardSize}" style="left:${pos.x}px;top:${pos.y}px" aria-hidden="true">Tu<br>carta</div>`);
  }
  return out.join('');
}

function renderCenter(ctx: GameViewContext, geo: TableGeometry): string {
  const { state, log } = ctx;
  const pica = state.hand.picaPica;
  const submanoPill =
    pica && ctx.mode === 'desktop'
      ? `<div class="submano-pill" style="left:${geo.center.x}px;top:${geo.center.y + 52}px;width:${geo.center.w}px" data-testid="submano">` +
        `Pica-pica · submano ${pica.submano + 1} de 3: ${escapeHtml(playerName(state, state.hand.participants[0]))} contra ${escapeHtml(playerName(state, state.hand.participants[1]))}</div>`
      : '';
  if (log.notice && log.notice.until > ctx.now && ctx.mode === 'desktop') {
    return (
      `<div class="center-notice" data-anim="notice-${escapeHtml(log.notice.text)}" style="left:${geo.center.x - 70}px;top:${geo.center.y - 6}px;width:${geo.center.w + 140}px" data-testid="center-notice">` +
      `${escapeHtml(log.notice.text)}</div>` +
      submanoPill
    );
  }
  const results = state.hand.tricks.map((trick) => trick.winnerTeam);
  const current = results.length;
  const dots = [0, 1, 2]
    .map((i) => {
      const result = results[i];
      const cls =
        result === undefined ? (i === current && state.phase !== 'HAND_OVER' ? 'dot dot--current' : 'dot') : result === 'PARDA' ? 'dot dot--parda' : `dot dot--${result === 0 ? 'nos' : 'ellos'}`;
      const label = result === undefined ? ordinal(i) : result === 'PARDA' ? `${ordinal(i)} parda` : `${ordinal(i)} ${teamName(result)}`;
      return `<span class="trick-dot"><span class="${cls}"></span>${ctx.mode === 'portrait' ? '' : escapeHtml(label)}</span>`;
    })
    .join('<span class="sep"></span>');
  const text = ctx.mode === 'portrait' ? `<span class="trick-label">${Math.min(current + 1, 3)}ª baza</span>` : '';
  return `<div class="center-pill" style="left:${geo.center.x}px;top:${geo.center.y}px;width:${geo.center.w}px" data-testid="tricks">${dots}${text}</div>${submanoPill}`;
}

function statusText(ctx: GameViewContext): { text: string; mine: boolean } {
  const { state, actor } = ctx;
  if (state.phase === 'MATCH_OVER') return { text: 'Partida terminada', mine: false };
  if (state.phase === 'HAND_OVER') return { text: 'Mano terminada', mine: false };
  if (actor === HUMAN) {
    if (onlyFlor(ctx.legal)) return { text: 'Tenés flor: se canta sola', mine: true };
    if (isAwaiting(state)) return { text: 'Respondé para seguir jugando', mine: true };
    const canSing = ctx.legal.some((action) => action.type !== 'PLAY_CARD');
    return { text: canSing ? 'Te toca · cantá o jugá una carta' : 'Te toca · jugá una carta', mine: true };
  }
  if (actor === null) return { text: 'Esperando', mine: false };
  const verb = isAwaiting(state) ? 'va a responder' : 'está pensando';
  const watching = state.hand.picaPica !== null && !humanInPlay(state) ? 'Mirás: ' : '';
  return { text: `${watching}${playerName(state, actor)} ${verb}…`, mine: false };
}

function renderStatus(ctx: GameViewContext, geo: TableGeometry): string {
  // En el celular los avisos (envido, submano) van en el lugar de la píldora de estado: no tapan el paño.
  const notice = ctx.mode === 'portrait' && ctx.log.notice && ctx.log.notice.until > ctx.now ? ctx.log.notice.text : null;
  if (notice) {
    return (
      `<div class="center-notice center-notice--compact" data-anim="notice-${escapeHtml(notice)}" style="left:${geo.status.x - 30}px;top:${geo.status.y - 4}px;width:${geo.status.w + 60}px" data-testid="center-notice">` +
      `${escapeHtml(notice)}</div>`
    );
  }
  const status = statusText(ctx);
  return (
    `<div class="status-pill${status.mine ? ' status-pill--mine' : ''}" style="left:${geo.status.x}px;top:${geo.status.y}px;width:${geo.status.w}px" data-testid="status">` +
    `<span class="status-dot"></span><span class="status-text">${escapeHtml(status.text)}</span></div>`
  );
}

function renderBubbles(ctx: GameViewContext, geo: TableGeometry): string {
  const { state, log } = ctx;
  return log.bubbles
    .filter((bubble) => bubble.until > ctx.now)
    .map((bubble) => {
      const seat = state.seats.find((s) => s.id === bubble.playerId);
      if (!seat) return '';
      const anchor = geo.slots[seat.seat].bubble;
      return `<div class="bubble bubble--${anchor.side}${ctx.mode === 'portrait' ? ' bubble--compact' : ''}" style="left:${anchor.x}px;top:${anchor.y}px" data-testid="bubble-${seat.id}" data-anim="bubble-${seat.id}-${bubble.until}">${escapeHtml(bubble.text)}</div>`;
    })
    .join('');
}

function renderFeed(ctx: GameViewContext): string {
  if (ctx.mode === 'portrait' || ctx.log.feed.length === 0) return '';
  return (
    `<div class="feed" data-testid="feed"><div class="feed-title">En esta mano</div>` +
    ctx.log.feed.map((line) => `<div class="feed-line">${line.html}</div>`).join('') +
    `</div>`
  );
}

// ---------- mano propia ----------

function envidoHint(state: MatchState): string {
  const dealt = state.hand.dealt[HUMAN];
  if (state.rules.flor && dealt.every((card) => card.suit === dealt[0].suit)) return 'tenés flor';
  return `tenés ${envidoScore(dealt)} de envido`;
}

function renderHand(ctx: GameViewContext, geo: TableGeometry, panelOpen: boolean): string {
  const { state } = ctx;
  const cards: Card[] = state.hand.hands[HUMAN];
  const playable = new Map(
    ctx.legal.filter((a): a is Extract<Action, { type: 'PLAY_CARD' }> => a.type === 'PLAY_CARD').map((a) => [a.cardId, a]),
  );
  const locked = panelOpen || (ctx.actor === HUMAN && isAwaiting(state));
  const size = panelOpen && ctx.mode === 'desktop' ? 'lg' : geo.handSize;
  const buttons = cards
    .map((card) => {
      const action = playable.get(card.id);
      if (action) {
        return renderCard(card, {
          size,
          state: 'playable',
          label: `Jugar ${cardName(card)}`,
          attrs: `data-act="${encodeAction(action)}" data-testid="hand-card-${card.id}"`,
        });
      }
      return renderCard(card, { size, state: locked ? 'disabled' : 'normal', attrs: `data-testid="hand-card-${card.id}"` });
    })
    .join('');
  const firstTrick = state.hand.tricks.length === 0 && state.phase !== 'HAND_OVER';
  const note = locked
    ? `<div class="hand-note">${lockIcon()}Tus cartas se liberan cuando respondas${firstTrick ? ` · ${envidoHint(state)}` : ''}</div>`
    : firstTrick && cards.length > 0 && humanInPlay(state)
      ? `<div class="hand-note">${escapeHtml(envidoHint(state).replace(/^t/, 'T'))}</div>`
      : '';
  const x = panelOpen && ctx.mode === 'desktop' ? 360 : geo.hand.x;
  const w = panelOpen && ctx.mode === 'desktop' ? 480 : geo.hand.w;
  return `<div class="hand hand--${size}" style="left:${x}px;top:${geo.hand.y}px;width:${w}px" data-testid="hand" aria-label="Tus cartas">${buttons}${note}</div>`;
}

// ---------- acciones (mi turno) ----------

function actionButton(action: Action, label: string, sub: string, kind: string): string {
  const code = encodeAction(action);
  return (
    `<button type="button" class="act act--${kind}" data-act="${code}" data-testid="action-${code.replace(':', '-')}">` +
    `<span class="act-label">${escapeHtml(label)}</span>${sub ? `<span class="act-sub">${escapeHtml(sub)}</span>` : ''}</button>`
  );
}

function renderActions(ctx: GameViewContext, geo: TableGeometry): string {
  const { state, legal } = ctx;
  const style = `left:${geo.actions.x}px;top:${geo.actions.y}px;width:${geo.actions.w}px`;
  if (ctx.actor !== HUMAN || state.phase !== 'PLAYING' || onlyFlor(legal)) {
    if (ctx.mode === 'portrait') return '';
    const hint = !humanInPlay(state)
      ? 'En esta submano no jugás: mirá cómo sale.'
      : ctx.actor === HUMAN && onlyFlor(legal)
        ? 'Tenés flor: se canta sola.'
        : 'Cuando sea tu turno, acá vas a poder cantar.';
    return `<div class="actions actions--idle" style="${style}"><div class="actions-title">Cantar</div><div class="actions-hint">${hint}</div></div>`;
  }

  const truco = legal.find((a) => a.type === 'CALL_TRUCO');
  const envidos = (['E', 'R', 'F'] as const)
    .map((call) => legal.find((a) => a.type === 'CALL_ENVIDO' && a.call === call))
    .filter((a): a is Action => a !== undefined);
  const mazo = legal.find((a) => a.type === 'MAZO');
  const rival: TeamId = 1;
  const trucoLevel = state.hand.truco.level;
  const nextLevel = (trucoLevel + 1) as 1 | 2 | 3;

  const envidoLabels: Record<string, [string, string]> = {
    'envido:E': ['Envido', '2 pts'],
    'envido:R': ['Real envido', '3 pts'],
    'envido:F': ['Falta envido', `vale ${faltaText(state)}`],
  };
  const envidoButtons = envidos
    .map((action) => {
      const [label, sub] = envidoLabels[encodeAction(action)];
      return actionButton(action, ctx.mode === 'portrait' ? label.replace(' envido', '') : label, ctx.mode === 'portrait' ? '' : sub, 'envido');
    })
    .join('');
  const trucoButton = truco ? actionButton(truco, TRUCO_LABELS[nextLevel], `vale ${nextLevel + 1}`, 'primary') : '';
  const mazoPoints = [1, 2, 3, 4][trucoLevel];
  const mazoButton = mazo
    ? actionButton(mazo, ctx.mode === 'portrait' ? 'Mazo' : 'Irse al mazo', ctx.mode === 'portrait' ? '' : `${teamName(rival)} suman ${mazoPoints}`, 'secondary')
    : '';

  if (ctx.mode === 'portrait') {
    return (
      `<div class="actions actions--portrait" style="${style}" data-testid="actions">` +
      (envidoButtons ? `<div class="act-grid act-grid--3">${envidoButtons}</div>` : '') +
      `<div class="act-grid act-grid--2-1">${trucoButton || '<span></span>'}${mazoButton}</div></div>`
    );
  }

  const envidoClosed =
    envidos.length === 0 && state.hand.tricks.length > 0 ? '<div class="actions-hint">Envido cerrado: ya pasó la primera baza.</div>' : '';
  return (
    `<div class="actions" style="${style}" data-testid="actions"><div class="actions-title">Cantar</div>` +
    (trucoButton ? `<div class="act-row">${trucoButton}</div>` : '') +
    (envidoButtons ? `<div class="act-row act-row--3">${envidoButtons}</div>` : '') +
    mazoButton +
    envidoClosed +
    `</div>`
  );
}

// ---------- panel de respuesta ----------

function responseContent(
  ctx: GameViewContext,
): { title: string; subtitle: string; main: string; extra: string; keys: string } | null {
  const { state, legal } = ctx;
  const find = (predicate: (a: Action) => boolean): Action | undefined => legal.find(predicate);
  const btn = (action: Action | undefined, label: string, kind: string): string =>
    action
      ? `<button type="button" class="resp resp--${kind}" data-act="${encodeAction(action)}" data-testid="resp-${encodeAction(action).replace(':', '-')}"${kind === 'go' ? ' data-autofocus' : ''}>${escapeHtml(label)}</button>`
      : '';

  if (state.phase === 'AWAITING_TRUCO' && state.hand.truco.pending) {
    const pending = state.hand.truco.pending;
    const label = TRUCO_LABELS[pending.level];
    const quiero = find((a) => a.type === 'ANSWER_TRUCO' && a.answer === 'QUIERO');
    const noQuiero = find((a) => a.type === 'ANSWER_TRUCO' && a.answer === 'NO_QUIERO');
    const raise = find((a) => a.type === 'CALL_TRUCO');
    const envidos = (['E', 'R', 'F'] as const).map((call) => find((a) => a.type === 'CALL_ENVIDO' && a.call === call));
    const mazo = find((a) => a.type === 'MAZO');
    const main =
      btn(quiero, 'Quiero', 'go') +
      (raise ? btn(raise, `Quiero ${TRUCO_LABELS[(pending.level + 1) as 2 | 3].toLowerCase()}`, 'raise') : '') +
      btn(noQuiero, 'No quiero', 'no');
    const envidoBlock = envidos.some(Boolean)
      ? `<div class="resp-section"><div class="resp-section-title">El envido está primero</div><div class="resp-grid">` +
        btn(envidos[0], 'Envido', 'outline') +
        btn(envidos[1], 'Real envido', 'outline') +
        btn(envidos[2], 'Falta envido', 'outline') +
        `</div></div>`
      : '';
    const mazoBlock = mazo ? `<div class="resp-foot">${btn(mazo, 'Irse al mazo (es como no querer)', 'link')}</div>` : '';
    return {
      title: `¿Querés el ${label.toLowerCase()}?`,
      subtitle: `${playerName(state, pending.callerId)} cantó ${label}. Si querés, la mano vale ${pending.level + 1}. Si no, ${teamName(pending.callerTeam)} suman ${pending.level}.`,
      main,
      extra: envidoBlock + mazoBlock,
      keys: raise ? 'Q · N · R' : 'Q · N',
    };
  }

  if (state.phase === 'AWAITING_ENVIDO') {
    const chain = state.hand.envido.chain;
    const last = chain[chain.length - 1];
    const calls = chain.map((c) => c.call);
    const falta = faltaValue(state, last.team === 0 ? 1 : 0);
    const querido = chainPoints(calls, falta);
    const noQuerido = calls.length <= 1 ? 1 : chainPoints(calls.slice(0, -1), falta);
    const quiero = find((a) => a.type === 'ANSWER_ENVIDO' && a.answer === 'QUIERO');
    const noQuiero = find((a) => a.type === 'ANSWER_ENVIDO' && a.answer === 'NO_QUIERO');
    const raises = (['E', 'R', 'F'] as const).map((call) => find((a) => a.type === 'CALL_ENVIDO' && a.call === call));
    const raiseBlock = raises.some(Boolean)
      ? `<div class="resp-section"><div class="resp-section-title">Subir</div><div class="resp-grid">` +
        btn(raises[0], 'Envido', 'outline') +
        btn(raises[1], 'Real envido', 'outline') +
        btn(raises[2], `Falta envido`, 'outline') +
        `</div></div>`
      : '';
    const who = playerName(state, last.by);
    const sang = last.by === HUMAN ? 'cantaste' : 'cantó';
    const history =
      chain.length > 1
        ? ` (${chain.map((c) => `${ENVIDO_LABELS[c.call]} de ${c.by === HUMAN ? 'vos' : playerName(state, c.by)}`).join(', ')})`
        : '';
    const faltaShown = faltaText(state);
    return {
      title: `¿Querés ${last.call === 'F' ? 'la' : 'el'} ${ENVIDO_LABELS[last.call].toLowerCase()}?`,
      subtitle: `${who} ${sang} ${ENVIDO_LABELS[last.call]}${history}. Querido vale ${calls.includes('F') ? (faltaShown === 'el partido' ? 'el partido' : faltaShown) : querido}; si no querés, ${teamName(last.team)} suman ${noQuerido}. Vos ${envidoHint(state)}.`,
      main: btn(quiero, 'Quiero', 'go') + btn(noQuiero, 'No quiero', 'no'),
      extra: raiseBlock,
      keys: 'Q · N',
    };
  }

  if (state.phase === 'AWAITING_FLOR' && state.hand.flor.pending) {
    const pending = state.hand.flor.pending;
    const pick = (answer: string): Action | undefined => find((a) => a.type === 'ANSWER_FLOR' && a.answer === answer);
    if (pending.kind === 'RESPUESTA_FLOR') {
      return {
        title: 'Flor contra flor',
        subtitle: `${teamName(pending.callerTeam)} cantaron flor y vos también tenés. Achicarte les da 4; con contraflor se comparan (6 al mejor).`,
        main: btn(pick('ACHICO'), 'Con flor me achico', 'no') + btn(pick('CONTRAFLOR'), 'Contraflor', 'go') + btn(pick('CONTRAFLOR_AL_RESTO'), 'Contraflor al resto', 'raise'),
        extra: '',
        keys: '',
      };
    }
    const alResto = pending.kind === 'CONTRAFLOR_AL_RESTO';
    return {
      title: alResto ? '¿Querés la contraflor al resto?' : '¿Querés la contraflor?',
      subtitle: alResto
        ? `Querida, el que tenga la mejor flor suma la falta. Si no querés, ${teamName(pending.callerTeam)} suman 6.`
        : `Querida, la mejor flor suma 6. Si no querés, ${teamName(pending.callerTeam)} suman 4.`,
      main: btn(pick('QUIERO'), 'Quiero', 'go') + btn(pick('CONTRAFLOR_AL_RESTO'), 'Contraflor al resto', 'raise') + btn(pick('NO_QUIERO'), 'No quiero', 'no'),
      extra: '',
      keys: 'Q · N',
    };
  }
  return null;
}

/** ¿Hay que mostrar el panel de respuesta? (el humano responde un canto) */
export function responsePanelOpen(ctx: Pick<GameViewContext, 'state' | 'actor' | 'legal'>): boolean {
  return ctx.actor === HUMAN && isAwaiting(ctx.state) && !onlyFlor(ctx.legal);
}

/** En el celular la hoja de respuesta tapa la mano: se muestran las cartas en chico adentro. */
function miniHand(ctx: GameViewContext): string {
  const cards = ctx.state.hand.hands[HUMAN];
  if (ctx.mode !== 'portrait' || cards.length === 0) return '';
  return `<div class="resp-hand" aria-label="Tus cartas">${cards.map((card) => renderCard(card, { size: 'mini' })).join('')}</div>`;
}

function renderResponsePanel(ctx: GameViewContext): string {
  const content = responseContent(ctx);
  if (!content) return '';
  const cls = ctx.mode === 'portrait' ? 'response response--sheet' : 'response response--dock';
  const keys = ctx.mode === 'desktop' && content.keys ? `<div class="resp-keys">${content.keys}</div>` : '';
  return (
    `<div class="${cls}" role="dialog" aria-modal="false" aria-labelledby="resp-title" data-testid="response-panel" data-anim="resp-${ctx.state.phase}-${ctx.state.hand.number}-${ctx.state.hand.cantos.length}">` +
    `<div class="resp-head"><div id="resp-title" class="resp-title">${escapeHtml(content.title)}</div>${keys}${miniHand(ctx)}</div>` +
    `<div class="resp-sub">${escapeHtml(content.subtitle)}</div>` +
    `<div class="resp-main">${content.main}</div>${content.extra}</div>`
  );
}

// ---------- pantalla completa ----------

export function renderGame(ctx: GameViewContext): string {
  const geo = tableGeometry(ctx.mode, ctx.state.rules.playerCount);
  const panel = responsePanelOpen(ctx);
  return (
    renderTopBar(ctx) +
    `<div class="rail" style="left:${geo.rail.x}px;top:${geo.rail.y}px;width:${geo.rail.w}px;height:${geo.rail.h}px;border-radius:${geo.rail.radius}"></div>` +
    `<div class="felt" style="left:${geo.felt.x}px;top:${geo.felt.y}px;width:${geo.felt.w}px;height:${geo.felt.h}px;border-radius:${geo.felt.radius}" data-testid="felt"></div>` +
    renderSeats(ctx, geo) +
    renderPlayedCards(ctx, geo) +
    renderCenter(ctx, geo) +
    (panel && ctx.mode === 'portrait' ? '' : renderStatus(ctx, geo)) +
    (panel && ctx.mode === 'portrait' ? '' : renderHand(ctx, geo, panel)) +
    (panel ? renderResponsePanel(ctx) : renderActions(ctx, geo)) +
    renderFeed(ctx) +
    renderBubbles(ctx, geo)
  );
}
