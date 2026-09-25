// Parámetros de la URL para pruebas y demos (arquitectura §3):
// ?seed=N  semilla de la partida · ?fast=1  sin esperas · ?aiDelay=ms  ritmo fijo de la IA
// ?autoAck=1  pasar solo a la mano siguiente · ?test=1  expone window.__truco
// ?players=2|4|6 &difficulty=easy|normal|hard &flor=1 &picaPica=0 &autostart=1  arrancar directo

import type { Difficulty } from '../ai/policy.js';

export interface UrlConfig {
  seed: number | null;
  fast: boolean;
  aiDelay: number | null;
  autoAck: boolean;
  test: boolean;
  autostart: boolean;
  players: 2 | 4 | 6 | null;
  difficulty: Difficulty | null;
  flor: boolean | null;
  picaPica: boolean | null;
}

export function parseUrlConfig(search: string): UrlConfig {
  const params = new URLSearchParams(search);
  const num = (key: string): number | null => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const bool = (key: string): boolean | null => {
    const raw = params.get(key);
    if (raw === null) return null;
    return raw === '1' || raw === 'true';
  };
  const players = num('players');
  const difficulty = params.get('difficulty');
  return {
    seed: num('seed'),
    fast: bool('fast') ?? false,
    aiDelay: num('aiDelay'),
    autoAck: bool('autoAck') ?? false,
    test: bool('test') ?? false,
    autostart: bool('autostart') ?? false,
    players: players === 2 || players === 4 || players === 6 ? players : null,
    difficulty: difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard' ? difficulty : null,
    flor: bool('flor'),
    picaPica: bool('picaPica'),
  };
}
