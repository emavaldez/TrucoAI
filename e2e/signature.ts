/**
 * Firma de partida (ciclo 1 de la auditoría de la historia 0-2).
 *
 * La firma es un hash corto y determinista de la secuencia de la partida: por
 * cada paso, la acción que hizo el bot (o `-` si no había nada que hacer) y el
 * marcador leído. Dos corridas de la misma semilla con el mismo código tienen
 * que dar la misma firma; una firma distinta significa que la partida divergió
 * (reloj real, animaciones, orden de timers, timeouts de click) y que el gate
 * `partidas` no sería reproducible entre máquinas.
 */

/** FNV-1a de 32 bits → 8 hex. Chico, sin dependencias y estable entre plataformas. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export class MatchSignature {
  private readonly lines: string[] = [];

  constructor(private readonly label: string) {}

  /** Un paso de la partida: acción del bot (`null` = no hizo nada) y marcador. */
  record(step: number, action: string | null, scores: [number, number]): void {
    this.lines.push(`${step}|${action ?? '-'}|${scores[0]}-${scores[1]}`);
  }

  get steps(): number {
    return this.lines.length;
  }

  /** Firma = hash corto de toda la secuencia (con la etiqueta del test). */
  digest(): string {
    return fnv1a(`${this.label}\n${this.lines.join('\n')}`);
  }

  /** Secuencia completa, para adjuntar como evidencia cuando algo diverge. */
  text(): string {
    return `${this.label} · ${this.lines.length} pasos · firma ${this.digest()}\n${this.lines.join('\n')}`;
  }
}
