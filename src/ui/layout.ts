/**
 * Layout de la mesa "v2" — fórmula de posiciones de asiento (historia 0-4, AC 3).
 *
 * Los asientos van sobre el borde de una elipse derivada proporcionalmente del
 * viewport (las posiciones absolutas de `docs/design/mesa-v2/*.dc.html` son para
 * 1440×900; acá se escala). Reglas duras: ningún asiento puede quedar fuera del
 * viewport — se clampa el radio y la posición final (UI-13/UI-14).
 *
 * Ángulos (sistema: 0° = derecha, 90° = abajo, sentido horario en pantalla):
 * - 2 jugadores: humano abajo (90°), rival arriba (270°).
 * - 4: humano abajo (90°), compañero arriba (270°, posición 2), rivales a los
 *   lados (180° y 0°, posiciones 1 y 3) — equipos alternados, AC 3.
 * - 6: humano abajo + asientos a 8, 10, 12, 2 y 4 horas; equipos alternados alrededor.
 */

export interface Viewport {
  width: number;
  height: number;
}

export interface SeatPoint {
  x: number;
  y: number;
  /** Ángulo efectivo sobre la elipse, en grados (0 = derecha, 90 = abajo). */
  angle: number;
}

export interface SeatOptions {
  seatWidth?: number;
  seatHeight?: number;
}

/** Ángulo por slot de asiento según la cantidad de jugadores (slot = posición del jugador). */
export const SLOT_ANGLES: Record<number, number[]> = {
  2: [90, 270],
  // App.ts asigna team = posición % 2: en 4p el compañero es la posición 2 y va
  // arriba (270°); los rivales (pos 1 y 3) quedan a los lados — AC 3.
  4: [90, 180, 270, 0],
  6: [90, 150, 210, 270, 330, 30],
};

/** Elipse de la mesa derivada del viewport (ratio del diseño 1440×900: rx 600 → 0.4167w, ry 270 → 0.3h). */
export function tableEllipse(viewport: Viewport, options: SeatOptions = {}) {
  const seatW = options.seatWidth ?? 200;
  const seatH = options.seatHeight ?? 72;
  const cx = viewport.width / 2;
  const cy = viewport.height * 0.42;
  // Radios máximos que mantienen el asiento (con su caja) dentro del viewport con 8 px de margen.
  const maxRx = Math.max(0, (viewport.width - seatW) / 2 - 8);
  const maxRyTop = Math.max(0, cy - seatH / 2 - 8);
  const maxRyBottom = Math.max(0, viewport.height - cy - seatH / 2 - 8);
  return {
    cx,
    cy,
    rx: Math.min(viewport.width * (600 / 1440), maxRx),
    ry: Math.min(viewport.height * (270 / 900), maxRyTop, maxRyBottom),
  };
}

/**
 * Posición (borde superior izquierdo) del asiento `index` para `playerCount` jugadores
 * en el viewport dado. `index` es la posición del jugador (0 = humano abajo).
 */
export function seatPosition(
  index: number,
  playerCount: number,
  viewport: Viewport,
  options: SeatOptions = {},
): SeatPoint {
  const seatW = options.seatWidth ?? 200;
  const seatH = options.seatHeight ?? 72;
  const angles = SLOT_ANGLES[playerCount];
  if (!angles) throw new Error(`seatPosition: cantidad de jugadores no soportada: ${playerCount}`);
  if (index < 0 || index >= playerCount) throw new Error(`seatPosition: índice fuera de rango: ${index}`);

  const angle = angles[index];
  const ellipse = tableEllipse(viewport, { seatWidth: seatW, seatHeight: seatH });
  const rad = (angle * Math.PI) / 180;
  const x = ellipse.cx + ellipse.rx * Math.cos(rad) - seatW / 2;
  const y = ellipse.cy + ellipse.ry * Math.sin(rad) - seatH / 2;

  // Redoble de seguridad: clamp explícito dentro del viewport.
  const clampedX = Math.min(Math.max(x, 8), viewport.width - seatW - 8);
  const clampedY = Math.min(Math.max(y, 8), viewport.height - seatH - 8);
  return { x: Math.round(clampedX), y: Math.round(clampedY), angle };
}

/** Slot geométrico (12/2/4/8/10 hs etc.) del asiento `index`, como etiqueta legible. */
export function slotClockLabel(index: number, playerCount: number): string {
  const angles = SLOT_ANGLES[playerCount];
  if (!angles) return '?';
  const a = angles[index];
  const clock = Math.round(((a + 90) % 360) / 30) % 12 || 12;
  return `${clock}h`;
}
