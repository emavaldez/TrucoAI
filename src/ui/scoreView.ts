/**
 * Marcador "mesa v2" — pieza pura (Score.dc.html).
 * Nosotros/Ellos con número, "malas/buenas" y fósforos (6 grupos de 5 rayos,
 * con separación entre los 15 primeros y los últimos). Compacto sin fósforos en celular (UI-16).
 */

import { escapeHtml } from './escape.js';

export interface ScoreRenderOptions {
  /** Puntaje del equipo del humano. */
  nos: number;
  /** Puntaje del equipo contrario. */
  ellos: number;
  compact?: boolean;
}

interface StickGroup {
  on: number;
  /** margen extra para separar malas (grupos 0-2) de buenas (3-5). */
  gapBefore: boolean;
}

/** Grupos de fósforos de un puntaje: cada grupo representa 5 puntos (0..5 rayos prendidos). */
export function matchGroupsFor(score: number): StickGroup[] {
  return [0, 1, 2, 3, 4, 5].map((i) => ({
    on: Math.max(0, Math.min(5, score - 5 * i)),
    gapBefore: i === 3,
  }));
}

/**
 * Un fósforo = 4 lados + diagonal. Con k puntos hechos, las líneas 1..k están "on".
 * Dibuja el SVG de 20×20 igual al diseño (líneas con stroke redondeado).
 */
function matchSvg(on: number, extraGap: boolean): string {
  const cls = ['match'];
  if (extraGap) cls.push('match--gap');
  const lines: string[] = [];
  const strokes = [
    { k: 1, d: 'M3 3v14', s: 'var(--match-line)' },
    { k: 2, d: 'M3 3h14', s: 'var(--match-line)' },
    { k: 3, d: 'M17 3v14', s: 'var(--match-line)' },
    { k: 4, d: 'M3 17h14', s: 'var(--match-line)' },
    { k: 5, d: 'M3.5 16.5L16.5 3.5', s: 'var(--match-diag)' },
  ];
  for (const line of strokes) {
    lines.push(
      `<path d="${line.d}" class="${on >= line.k ? 'lit' : 'unlit'}" stroke-width="2" stroke-linecap="round" fill="none"></path>`,
    );
  }
  return `<svg viewBox="0 0 20 20" aria-hidden="true" class="${cls.join(' ')}">${lines.join('')}</svg>`;
}

function teamBlock(name: string, score: number, cls: string, showSticks: boolean, dir: 'row' | 'row-reverse', teamIndex: number): string {
  const half = score >= 15 ? 'buenas' : 'malas';
  const groups = dir === 'row-reverse' ? matchGroupsFor(score).slice().reverse() : matchGroupsFor(score);
  const sticks = groups.map((g) => matchSvg(g.on, g.gapBefore)).join('');
  return `<div class="score-team ${cls}" data-dir="${dir}">`
    + `<div class="score-names"><span class="score-team-label">${escapeHtml(name)}</span><span class="score-team-half">${half}</span></div>`
    // `.team-points` lo lee el driver e2e legacy; `score-team-{i}` es el contrato de test-strategy §5.
    + `<div class="score-number team-points" data-testid="score-team-${teamIndex}">${score}</div>`
    + (showSticks ? `<div class="score-sticks">${sticks}</div>` : '')
    + `</div>`;
}

export function renderScore(options: ScoreRenderOptions): string {
  const compact = Boolean(options.compact);
  return `<div class="scoreboard-v2${compact ? ' scoreboard-v2--compact' : ''}" data-testid="scoreboard">`
    + teamBlock('Nosotros', options.nos, 'score-team--nos', !compact, 'row', 0)
    + teamBlock('Ellos', options.ellos, 'score-team--ellos', !compact, 'row-reverse', 1)
    + `</div>`;
}
