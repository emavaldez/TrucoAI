/**
 * Contrato del driver E2E ↔ juego (historia 0-2, AC 2).
 *
 * El driver es el ÚNICO lugar que conoce selectores del DOM: los specs y el bot
 * hablan en términos de `DriverAction`. En la historia 3-2 se agrega
 * `e2e/driver/v2.ts` (data-testid de `test-strategy.md` §5) y los specs no cambian.
 */

export type DriverAction =
  | { kind: 'ack' }
  | { kind: 'next-hand' }
  | { kind: 'answer'; answer: 'quiero' | 'no-quiero' | 'subir' | 'son-buenas' }
  | { kind: 'play'; index: number }
  | { kind: 'call'; call: 'envido' | 'real-envido' | 'falta-envido' | 'truco' | 'mazo' };

/**
 * Foto de la pantalla para un paso del spec: todo lo que el spec necesita leer,
 * leído de una sola vez (auditoría ciclo 1: menos roundtrips por paso ⇒ el tiempo
 * real por paso deja de influir en el resultado de la partida).
 */
export interface Observation {
  /** Acciones visibles y habilitadas para el humano ahora, en orden de prioridad. */
  actions: DriverAction[];
  /** Marcador [equipo 0, equipo 1]. `[-1, -1]` si todavía no hay marcador. */
  scores: [number, number];
  /** La partida terminó (panel de fin visible). */
  gameOver: boolean;
  /** Texto visible normalizado (para detectar trabas). */
  snapshot: string;
  /** Asiento con el marcador de turno, como `player-3 (Contrario 1)`. */
  turnSeat: string;
  /** Manos terminadas: entradas del historial del panel de fin (0 mientras se juega). */
  handsPlayed: number;
}

export interface GameDriver {
  /** Menú → cantidad de jugadores → ¡Jugar! y espera a que se dibuje la mesa. */
  start(players: 2 | 4 | 6): Promise<void>;
  /** Todo lo observable de la pantalla, en una sola lectura. */
  observe(): Promise<Observation>;
  /** Acciones visibles y habilitadas para el humano ahora, en orden de prioridad. */
  actions(): Promise<DriverAction[]>;
  /** Ejecuta una acción. Resuelve `true` si el click efectivamente ocurrió. */
  perform(a: DriverAction): Promise<boolean>;
  /** La partida terminó (panel de fin visible). */
  isGameOver(): Promise<boolean>;
  /** Marcador [equipo 0, equipo 1]. `[-1, -1]` si todavía no hay marcador. */
  scores(): Promise<[number, number]>;
  /** Texto visible normalizado del documento (para detectar trabas). */
  snapshot(): Promise<string>;
  /** Vuelve al menú desde el panel de fin de partida. */
  newGame(): Promise<void>;
}
