// Layout de la mesa (ux-design.md §5): un lienzo lógico fijo por modo que se escala para
// entrar entero en la ventana. Así nada queda cortado en ningún tamaño (UI-13, UI-14) y las
// posiciones son las del diseño (docs/design/mesa-v2): 1440×900 en escritorio, 390×844 en celular.
// Orden de juego antihorario (GDD §2): mirando la mesa, el siguiente al humano está a su derecha.

export type LayoutMode = 'desktop' | 'portrait';

export interface Size {
  w: number;
  h: number;
}

export const CANVAS: Record<LayoutMode, Size> = {
  desktop: { w: 1440, h: 900 },
  portrait: { w: 390, h: 844 },
};

/** Celular vertical (o ventana más alta que ancha) → lienzo de celular. */
export function chooseLayout(viewportW: number, viewportH: number): LayoutMode {
  return viewportW / Math.max(1, viewportH) < 0.9 ? 'portrait' : 'desktop';
}

/** Escala para que el lienzo entre entero (con letterbox). */
export function canvasScale(mode: LayoutMode, viewportW: number, viewportH: number): number {
  const canvas = CANVAS[mode];
  return Math.min(viewportW / canvas.w, viewportH / canvas.h);
}

/** ¿La ventana es un celular acostado demasiado bajo para jugar? (se pide girarlo) */
export function tooShortLandscape(viewportW: number, viewportH: number): boolean {
  return viewportH < 460 && viewportW > viewportH;
}

export interface Point {
  x: number;
  y: number;
}

export interface SeatSlot {
  /** caja del asiento (esquina superior izquierda) */
  seat: Point;
  /** carta jugada por ese asiento en el paño (esquina superior izquierda) */
  card: Point;
  /** ancla del globo de canto */
  bubble: Point & { side: 'left' | 'right' | 'below' | 'above' | 'over' };
}

export interface TableGeometry {
  mode: LayoutMode;
  seatSize: Size;
  cardSize: 'md' | 'sm';
  handSize: 'xl' | 'lg';
  /** baranda (elipse en escritorio, rectángulo redondeado en celular) */
  rail: { x: number; y: number; w: number; h: number; radius: string };
  felt: { x: number; y: number; w: number; h: number; radius: string };
  /** índice = asiento (0 = humano) */
  slots: SeatSlot[];
  /** píldora central (bazas / submano) */
  center: Point & { w: number };
  /** píldora de estado sobre la mano */
  status: Point & { w: number };
  /** fila de la mano */
  hand: Point & { w: number };
  /** barra de acciones / panel de respuesta */
  actions: Point & { w: number };
}

const DESKTOP_SEAT: Size = { w: 220, h: 72 };
const PORTRAIT_SEAT: Size = { w: 118, h: 54 };

/**
 * Asiento en escritorio (las coordenadas del diseño son para asientos de 200 px de ancho;
 * el asiento mide 220, así que se corre 10 px para mantener el centro). El globo sale hacia el centro.
 */
function desktopSlot(designX: number, seatY: number, cardX: number, cardY: number): SeatSlot {
  const rightSide = designX > 720;
  const seatX = Math.min(Math.max(designX - 10, 8), 1440 - DESKTOP_SEAT.w - 8);
  return {
    seat: { x: seatX, y: seatY },
    card: { x: cardX, y: cardY },
    bubble: rightSide
      ? { x: seatX - 12, y: seatY + 6, side: 'left' }
      : { x: seatX + DESKTOP_SEAT.w + 12, y: seatY + 6, side: 'right' },
  };
}

/** En el celular el globo se dibuja encima del propio asiento (así nunca tapa a otro ni se sale). */
function portraitSlot(seatX: number, seatY: number, cardX: number, cardY: number): SeatSlot {
  return {
    seat: { x: seatX, y: seatY },
    card: { x: cardX, y: cardY },
    bubble: { x: seatX + PORTRAIT_SEAT.w / 2, y: seatY + PORTRAIT_SEAT.h / 2, side: 'over' },
  };
}

/** Geometría de la mesa para el modo y la cantidad de jugadores. */
export function tableGeometry(mode: LayoutMode, playerCount: 2 | 4 | 6): TableGeometry {
  if (mode === 'desktop') {
    const human: SeatSlot = {
      seat: { x: 40, y: 704 },
      card: { x: 678, y: playerCount === 6 ? 462 : 452 },
      bubble: { x: 40, y: 690, side: 'above' },
    };
    const others: Record<2 | 4 | 6, SeatSlot[]> = {
      2: [desktopSlot(620, 80, 678, 190)],
      4: [desktopSlot(1216, 346, 1010, 319), desktopSlot(620, 80, 678, 190), desktopSlot(24, 346, 346, 319)],
      6: [
        desktopSlot(1120, 466, 904, 430),
        desktopSlot(1090, 150, 904, 206),
        desktopSlot(620, 80, 678, 168),
        desktopSlot(150, 150, 452, 206),
        desktopSlot(120, 466, 452, 430),
      ],
    };
    return {
      mode,
      seatSize: DESKTOP_SEAT,
      cardSize: 'md',
      handSize: 'xl',
      rail: { x: 120, y: 112, w: 1200, h: 540, radius: '50%' },
      felt: { x: 138, y: 130, w: 1164, h: 504, radius: '50%' },
      slots: [human, ...others[playerCount]],
      center: { x: 540, y: 346, w: 360 },
      status: { x: 540, y: 598, w: 360 },
      hand: { x: 440, y: 684, w: 560 },
      actions: { x: 1010, y: 690, w: 400 },
    };
  }

  const railTop = playerCount === 6 ? 240 : 180;
  const railH = playerCount === 6 ? 290 : 330;
  const human: SeatSlot = {
    seat: { x: 0, y: 0 },
    card: { x: 163, y: playerCount === 6 ? 418 : 396 },
    bubble: { x: 195, y: railTop + railH - 6, side: 'above' },
  };
  const others: Record<2 | 4 | 6, SeatSlot[]> = {
    2: [portraitSlot(136, 114, 163, 200)],
    4: [portraitSlot(264, 114, 290, 300), portraitSlot(136, 114, 163, 200), portraitSlot(8, 114, 36, 300)],
    6: [
      portraitSlot(264, 174, 288, 398),
      portraitSlot(264, 114, 288, 282),
      portraitSlot(136, 114, 163, 256),
      portraitSlot(8, 114, 38, 282),
      portraitSlot(8, 174, 38, 398),
    ],
  };
  const statusY = railTop + railH + 8;
  return {
    mode,
    seatSize: PORTRAIT_SEAT,
    cardSize: 'sm',
    handSize: 'lg',
    rail: { x: 12, y: railTop, w: 366, h: railH, radius: '44px' },
    felt: { x: 20, y: railTop + 8, w: 350, h: railH - 16, radius: '36px' },
    slots: [human, ...others[playerCount]],
    center: { x: 110, y: playerCount === 6 ? 362 : 314, w: 170 },
    status: { x: 55, y: statusY, w: 280 },
    hand: { x: 0, y: statusY + 42, w: 390 },
    actions: { x: 16, y: 740, w: 358 },
  };
}
