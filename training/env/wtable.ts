// Probabilidad de ganar la partida desde cada marcador: W[a][b][m] = P(gana el equipo con `a`
// puntos contra `b`, siendo m = 1 si ese equipo es mano en la mano que empieza).
// Se calcula hacia atrás desde 30 con la distribución de puntos por mano (cada mano da al menos
// un punto, así que el marcador nunca vuelve atrás). La recompensa de una mano es W(después) − W(antes).

export const TARGET = 30;

/** Distribución de puntos de una mano: [puntos del equipo mano, puntos del otro, probabilidad]. */
export type HandDistribution = [number, number, number][];

export interface WTable {
  format: 'trucoai-wtable-v1';
  target: number;
  /** índice (a * TARGET + b) * 2 + m */
  values: number[];
  /** de dónde salió la distribución */
  source: string;
}

function idx(a: number, b: number, m: number): number {
  return (a * TARGET + b) * 2 + m;
}

export function computeWTable(dist: HandDistribution, source: string): WTable {
  const total = dist.reduce((sum, [, , p]) => sum + p, 0);
  const outcomes = dist.filter(([x, y]) => x + y > 0).map(([x, y, p]) => [x, y, p / total] as const);
  const values = new Array<number>(TARGET * TARGET * 2).fill(0);
  const get = (a: number, b: number, m: number): number => {
    if (a >= TARGET && b >= TARGET) return 0.5;
    if (a >= TARGET) return 1;
    if (b >= TARGET) return 0;
    return values[idx(a, b, m)];
  };
  for (let sum = 2 * (TARGET - 1); sum >= 0; sum--) {
    for (let a = Math.min(sum, TARGET - 1); a >= 0 && sum - a < TARGET; a--) {
      const b = sum - a;
      for (let m = 0; m < 2; m++) {
        let w = 0;
        for (const [x, y, p] of outcomes) {
          // x = puntos del equipo mano. Si soy mano sumo x; si no, sumo y.
          const mine = m === 1 ? x : y;
          const theirs = m === 1 ? y : x;
          w += p * get(a + mine, b + theirs, 1 - m);
        }
        values[idx(a, b, m)] = w;
      }
    }
  }
  return { format: 'trucoai-wtable-v1', target: TARGET, values, source };
}

/** W con los casos terminales resueltos. */
export function wValue(table: WTable, a: number, b: number, m: number): number {
  if (a >= TARGET && b >= TARGET) return 0.5;
  if (a >= TARGET) return 1;
  if (b >= TARGET) return 0;
  return table.values[idx(a, b, m)];
}
