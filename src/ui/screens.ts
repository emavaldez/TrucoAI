// Pantallas y paneles que bloquean (GDD §12): menú, resumen de mano, fin de partida y pausa.
// Diseño: docs/design/mesa-v2 (Menu, FinMano, FinPartida).

import type { HandRecord, MatchState, TeamId, TrickResult } from '../engine/index.js';
import type { MatchSettings } from '../app/GameController.js';
import type { Difficulty } from '../ai/policy.js';
import { renderCard } from './cardView.js';
import { escapeHtml } from './escape.js';
import type { EventLog, PointsEntry } from './eventLog.js';
import type { LayoutMode } from './layout.js';
import { cardName, ordinal, playerName, teamName } from './text.js';

const DIFFICULTY_TEXT: Record<Difficulty, { name: string; desc: string }> = {
  easy: { name: 'Fácil', desc: 'Juega las cartas obvias, pero muchas veces decide al azar. Nunca farolea.' },
  normal: { name: 'Normal', desc: 'Reglas firmes: abre bajo, gana con la mínima, canta según sus cartas.' },
  hard: { name: 'Difícil', desc: 'Además mira el marcador, lee lo que se mostró y farolea de vez en cuando.' },
};

const PLAYER_TEXT: Record<2 | 4 | 6, string> = { 2: 'Mano a mano', 4: 'Dos contra dos', 6: 'Tres contra tres' };

// ---------- menú ----------

export function renderMenu(settings: MatchSettings, mode: LayoutMode): string {
  const players = ([2, 4, 6] as const)
    .map(
      (n) =>
        `<button type="button" class="opt opt--players${settings.playerCount === n ? ' opt--on' : ''}" data-ui="players:${n}" aria-pressed="${settings.playerCount === n}" data-testid="menu-players-${n}">` +
        `<span class="opt-num">${n}</span><span class="opt-desc">${PLAYER_TEXT[n]}</span></button>`,
    )
    .join('');
  const levels = (['easy', 'normal', 'hard'] as const)
    .map(
      (level) =>
        `<button type="button" class="opt opt--level${settings.difficulty === level ? ' opt--on' : ''}" data-ui="difficulty:${level}" aria-pressed="${settings.difficulty === level}" data-testid="menu-difficulty-${level}">${DIFFICULTY_TEXT[level].name}</button>`,
    )
    .join('');
  const picaDisabled = settings.playerCount !== 6;
  const form =
    `<div class="menu-form">` +
    `<div class="menu-brand"><div class="menu-logo"><span class="menu-truco">Truco</span><span class="menu-ai">AI</span></div>` +
    `<p class="menu-tagline">Truco argentino contra la computadora. A 30 puntos, en malas y buenas.</p></div>` +
    `<fieldset class="menu-group"><legend>Jugadores</legend><div class="opt-grid">${players}</div></fieldset>` +
    `<fieldset class="menu-group"><legend>Dificultad</legend><div class="opt-grid">${levels}</div>` +
    `<p class="menu-hint">${escapeHtml(DIFFICULTY_TEXT[settings.difficulty].desc)}${settings.playerCount > 2 ? ' Tus compañeros juegan siempre en normal.' : ''}</p></fieldset>` +
    `<fieldset class="menu-group"><legend>Reglas</legend>` +
    `<label class="toggle"><span>Jugar con flor</span><input type="checkbox" data-ui="flor" data-testid="menu-flor"${settings.flor ? ' checked' : ''}></label>` +
    `<label class="toggle${picaDisabled ? ' toggle--off' : ''}"><span>Pica-pica <em>· solo con 6</em></span><input type="checkbox" data-ui="picapica" data-testid="menu-picapica"${settings.picaPica ? ' checked' : ''}${picaDisabled ? ' disabled' : ''}></label>` +
    `</fieldset>` +
    `<button type="button" class="go-btn" data-ui="start" data-testid="menu-start">Repartir</button>` +
    `</div>`;
  if (mode === 'portrait') return `<main class="menu menu--portrait" data-testid="menu">${form}</main>`;
  const art =
    `<div class="menu-art" aria-hidden="true"><div class="menu-rail"></div><div class="menu-felt"></div>` +
    `<div class="menu-card menu-card--1">${renderCard({ number: 1, suit: 'espada' }, { size: 'xl' })}</div>` +
    `<div class="menu-card menu-card--2">${renderCard({ number: 1, suit: 'basto' }, { size: 'xl' })}</div>` +
    `<div class="menu-card menu-card--3">${renderCard({ number: 7, suit: 'espada' }, { size: 'xl' })}</div>` +
    `<div class="menu-quote">El ancho de espada, el de basto y el siete bravo.</div></div>`;
  return `<main class="menu" data-testid="menu">${form}${art}</main>`;
}

// ---------- resumen de mano ----------

function pointsLabel(entry: PointsEntry): string {
  return entry.submano === null ? entry.label : `Submano ${entry.submano + 1}: ${entry.label}`;
}

function teamClass(team: TeamId): string {
  return team === 0 ? 'nos' : 'ellos';
}

function trickCard(state: MatchState, trick: TrickResult, index: number, size: 'sm' | 'xs'): string {
  const result =
    trick.winnerTeam === 'PARDA'
      ? '<span class="trick-result">Parda</span>'
      : `<span class="trick-result trick-result--${teamClass(trick.winnerTeam)}">${teamName(trick.winnerTeam)}</span>`;
  const cards = trick.plays
    .map((play) => renderCard(play.card, { size, state: play.playerId === trick.winnerPlayerId ? 'winner' : 'normal', tag: 'Ganó' }))
    .join('');
  const winnerPlay = trick.plays.find((play) => play.playerId === trick.winnerPlayerId);
  const note = winnerPlay ? `${playerName(state, winnerPlay.playerId)} con ${cardName(winnerPlay.card)}` : 'Empate de cartas';
  return (
    `<div class="trick-box"><div class="trick-head"><span>${ordinal(index)} baza</span>${result}</div>` +
    `<div class="trick-cards trick-cards--${size}">${cards}</div><div class="trick-note">${escapeHtml(note)}</div></div>`
  );
}

function recordTitle(state: MatchState, record: HandRecord): string {
  if (record.reason === 'PICA_PICA') return `Pica-pica: ${record.winnerTeam === 0 ? 'sumamos más' : 'sumaron más ellos'}`;
  return `La mano es de ${teamName(record.winnerTeam)}`;
}

export function renderHandSummary(state: MatchState, log: EventLog, autoAck: boolean, mode: LayoutMode): string {
  const record = state.history[state.history.length - 1];
  if (!record) return '';
  const totals: [number, number] = [0, 0];
  for (const entry of log.lastHandPoints) totals[entry.team] += entry.points;
  const badges = ([0, 1] as const)
    .filter((team) => totals[team] > 0)
    .map((team) => `<span class="gain gain--${teamClass(team)}">${teamName(team)} +${totals[team]}</span>`)
    .join('');
  const size = state.rules.playerCount === 2 && mode === 'desktop' ? 'sm' : 'xs';
  let tricksHtml: string;
  if (record.picaPica && state.hand.picaPica) {
    tricksHtml =
      `<div class="submano-list">` +
      state.hand.picaPica.results
        .map((result, i) => {
          const gained: [number, number] = [0, 0];
          for (const entry of log.lastHandPoints) if (entry.submano === i) gained[entry.team] += entry.points;
          const chips = ([0, 1] as const)
            .filter((team) => gained[team] > 0)
            .map((team) => `<span class="gain gain--${teamClass(team)}">${teamName(team)} +${gained[team]}</span>`)
            .join('');
          return (
            `<div class="submano-row"><span>Submano ${i + 1}: ${escapeHtml(playerName(state, result.pair[0]))} contra ${escapeHtml(playerName(state, result.pair[1]))}` +
            ` · ${result.winnerTeam === 0 ? 'la ganamos' : 'la ganaron ellos'}</span><span class="submano-gains">${chips}</span></div>`
          );
        })
        .join('') +
      `</div>`;
  } else {
    tricksHtml = `<div class="trick-grid">${record.tricks.map((trick, i) => trickCard(state, trick, i, size)).join('')}</div>`;
  }
  const lines = log.lastHandPoints
    .map(
      (entry) =>
        `<div class="sum-line"><span>${escapeHtml(pointsLabel(entry))}</span><span class="pts pts--${teamClass(entry.team)}">+${entry.points} ${teamName(entry.team)}</span></div>`,
    )
    .join('');
  const reasonLine =
    record.reason === 'MAZO'
      ? `<div class="sum-note">${escapeHtml(mazoText(state, record))}</div>`
      : record.reason === 'NO_QUIERO'
        ? `<div class="sum-note">No se quiso el truco: la mano terminó ahí.</div>`
        : '';
  return (
    `<div class="scrim" data-testid="hand-summary"><div class="paper-panel paper-panel--summary" data-anim="summary-${record.number}" role="dialog" aria-modal="true" aria-labelledby="sum-title">` +
    `<div class="sum-head"><div><div class="eyebrow">Mano ${record.number} · dio ${escapeHtml(playerName(state, record.dealerId))}</div>` +
    `<div id="sum-title" class="sum-title">${escapeHtml(recordTitle(state, record))}</div></div><div class="gains">${badges}</div></div>` +
    tricksHtml +
    `<div class="sum-lines">${lines}${reasonLine}<div class="sum-sep"></div>` +
    `<div class="sum-line sum-line--total"><span>Marcador</span><span><span class="pts pts--nos">Nosotros ${state.scores[0]}</span> · <span class="pts pts--ellos">Ellos ${state.scores[1]}</span></span></div></div>` +
    `<div class="sum-foot"><label class="check"><input type="checkbox" data-ui="autoack" data-testid="summary-autoack"${autoAck ? ' checked' : ''}>Pasar solo a la próxima mano</label>` +
    `<button type="button" class="paper-btn paper-btn--go" data-ui="next" data-testid="next-hand" data-autofocus>Siguiente mano <span class="kbd">Enter</span></button></div>` +
    `</div></div>`
  );
}

function mazoText(state: MatchState, record: HandRecord): string {
  const mazo = record.cantos.find((canto) => canto.kind === 'MAZO');
  if (!mazo) return 'Se fueron al mazo.';
  return mazo.by === 'p0' ? 'Te fuiste al mazo.' : `${playerName(state, mazo.by)} se fue al mazo.`;
}

// ---------- fin de partida ----------

const ENVIDO_NAMES: Record<string, string> = { ENVIDO: 'envido', REAL_ENVIDO: 'real envido', FALTA_ENVIDO: 'falta envido' };
const TRUCO_NAMES: Record<string, string> = { TRUCO: 'truco', RETRUCO: 'retruco', VALE4: 'vale cuatro' };

function historyWhat(state: MatchState, record: HandRecord): string {
  const parts: string[] = [];
  const envido = record.picaPica ? [] : record.cantos.filter((c) => c.kind in ENVIDO_NAMES);
  if (envido.length > 0) {
    const last = envido[envido.length - 1];
    const chain = envido.map((c) => ENVIDO_NAMES[c.kind]).join(' + ');
    parts.push(last.answer === 'NO_QUIERO' ? `${chain} no querido` : last.answer === 'QUIERO' ? `${chain} querido` : chain);
  }
  if (!record.picaPica && record.cantos.some((c) => c.kind === 'FLOR')) parts.push('flor');
  // En pica-pica cada submano tiene sus cantos: el detalle está en el resumen de cada mano.
  const trucos = record.picaPica ? [] : record.cantos.filter((c) => c.kind in TRUCO_NAMES);
  const lastTruco = trucos[trucos.length - 1];
  let how: string;
  switch (record.reason) {
    case 'MAZO':
      how = mazoText(state, record).replace(/\.$/, '');
      break;
    case 'NO_QUIERO': {
      const name = lastTruco ? TRUCO_NAMES[lastTruco.kind] : 'truco';
      how = record.winnerTeam === 0 ? `Ganamos: no quisieron el ${name}` : `Ganaron ellos: no quisimos el ${name}`;
      break;
    }
    case 'PICA_PICA':
      how = `Pica-pica: ${record.winnerTeam === 0 ? 'sumamos más' : 'sumaron más ellos'}`;
      break;
    case 'MATCH_ENDED':
      how = 'La partida terminó en esta mano';
      break;
    default:
      how = record.winnerTeam === 0 ? 'Ganamos' : 'Ganaron ellos';
  }
  if (lastTruco && record.reason !== 'NO_QUIERO' && record.reason !== 'PICA_PICA') {
    const name = TRUCO_NAMES[lastTruco.kind];
    parts.push(lastTruco.answer === 'QUIERO' ? `${name} querido` : lastTruco.answer === 'NO_QUIERO' ? `${name} no querido` : name);
  }
  return [how, ...parts].join(' · ');
}

export function renderGameOver(state: MatchState, settings: MatchSettings, log: EventLog, mode: LayoutMode): string {
  const won = state.winnerTeam === 0;
  const history = state.history;
  const played = history.filter((record) => record.reason !== 'MATCH_ENDED' || record.points > 0);
  const handsWon = history.filter((record) => record.winnerTeam === 0 && record.reason !== 'MATCH_ENDED').length;
  let previous: [number, number] = [0, 0];
  const rows = history
    .map((record) => {
      const gained: [number, number] = [record.scoresAfter[0] - previous[0], record.scoresAfter[1] - previous[1]];
      previous = record.scoresAfter;
      const pts = ([0, 1] as const)
        .filter((team) => gained[team] > 0)
        .map((team) => `<span class="pts pts--${teamClass(team)}">+${gained[team]} ${team === 0 ? 'Nos' : 'Ellos'}</span>`)
        .join(' ');
      return (
        `<div class="hist-row"><span class="hist-n">${record.number}</span><span>${escapeHtml(historyWhat(state, record))}</span>` +
        `<span>${pts || '—'}</span><span class="hist-score">${record.scoresAfter[0]}–${record.scoresAfter[1]}</span></div>`
      );
    })
    .join('');
  const last = history[history.length - 1];
  const difficulty = DIFFICULTY_TEXT[settings.difficulty].name;
  return (
    `<div class="scrim scrim--strong" data-testid="game-over"><div class="paper-panel paper-panel--gameover${mode === 'portrait' ? ' paper-panel--portrait' : ''}" data-anim="gameover" role="dialog" aria-modal="true" aria-labelledby="go-title">` +
    `<div class="go-head"><div class="eyebrow">Partida a 30 · ${settings.playerCount} jugadores · ${difficulty}</div>` +
    `<div id="go-title" class="go-title">${won ? '¡Ganamos!' : 'Perdimos'}</div>` +
    `<div class="go-score"><span class="pts--nos">${state.scores[0]}</span><span class="go-a">a</span><span class="pts--ellos">${state.scores[1]}</span></div>` +
    `<div class="go-sub">${won ? 'Nosotros llegamos' : 'Ellos llegaron'} a 30 en la mano ${last?.number ?? state.hand.number}.</div></div>` +
    `<div class="metrics"><div class="metric"><div class="metric-label">Manos ganadas</div><div class="metric-value">${handsWon} de ${played.length}</div></div>` +
    `<div class="metric"><div class="metric-label">Envidos ganados</div><div class="metric-value">${log.stats.envidosWon} de ${log.stats.envidosPlayed}</div></div>` +
    `<div class="metric"><div class="metric-label">Trucos queridos</div><div class="metric-value">${log.stats.trucosQueridos}</div></div></div>` +
    `<div class="history" data-testid="history"><div class="hist-row hist-row--head"><span><span class="hist-long">Mano</span><span class="hist-short">#</span></span><span>Qué pasó</span><span>Puntos</span><span><span class="hist-long">Marcador</span><span class="hist-short">Total</span></span></div>` +
    `<div class="hist-body">${rows}</div></div>` +
    `<div class="go-actions"><button type="button" class="paper-btn paper-btn--go" data-ui="again" data-testid="play-again" data-autofocus>Jugar otra</button>` +
    `<button type="button" class="paper-btn paper-btn--outline" data-ui="menu" data-testid="change-rules">Cambiar reglas</button></div>` +
    `</div></div>`
  );
}

// ---------- pausa ----------

export function renderPause(autoAck: boolean): string {
  return (
    `<div class="scrim" data-testid="pause"><div class="paper-panel paper-panel--pause" data-anim="pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">` +
    `<div id="pause-title" class="sum-title">Partida en pausa</div>` +
    `<label class="check"><input type="checkbox" data-ui="autoack"${autoAck ? ' checked' : ''}>Pasar solo a la próxima mano</label>` +
    `<div class="pause-actions"><button type="button" class="paper-btn paper-btn--go" data-ui="resume" data-testid="resume" data-autofocus>Seguir jugando</button>` +
    `<button type="button" class="paper-btn paper-btn--outline" data-ui="restart" data-testid="restart">Nueva partida</button>` +
    `<button type="button" class="paper-btn paper-btn--outline" data-ui="menu" data-testid="to-menu">Volver al menú</button></div>` +
    `</div></div>`
  );
}

export function renderRotateHint(): string {
  return `<div class="rotate-hint" role="alert"><svg class="rotate-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg><div>Girá el teléfono para jugar: la mesa necesita la pantalla vertical.</div></div>`;
}
