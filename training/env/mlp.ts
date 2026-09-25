// Red de la política (MLP con ReLU) en TypeScript puro: la misma inferencia sirve para los
// actores del entrenamiento y para el juego. Pesos: un JSON con la forma y un binario float32
// (por capa: W [out×in] por filas, después b [out]), exportados por training/learner/model.py.

import type { Rng } from '../../src/engine/index.js';

export interface MlpMeta {
  format: 'trucoai-mlp-v1';
  obsDim: number;
  nActions: number;
  layers: { in: number; out: number }[];
  /** huella del layout de la observación con que se entrenó */
  layoutHash: string;
  /** de dónde sale (corrida e iteración) */
  tag?: string;
}

export class Mlp {
  private readonly weights: Float32Array[] = [];
  private readonly biases: Float32Array[] = [];
  private readonly buffers: Float32Array[] = [];

  constructor(
    readonly meta: MlpMeta,
    data: Float32Array,
  ) {
    let offset = 0;
    for (const layer of meta.layers) {
      this.weights.push(data.subarray(offset, offset + layer.in * layer.out));
      offset += layer.in * layer.out;
      this.biases.push(data.subarray(offset, offset + layer.out));
      offset += layer.out;
      this.buffers.push(new Float32Array(layer.out));
    }
    if (offset !== data.length) throw new Error(`pesos: esperaba ${offset} floats, hay ${data.length}`);
    if (meta.layers[0].in !== meta.obsDim) throw new Error('pesos: la primera capa no coincide con obsDim');
    if (meta.layers[meta.layers.length - 1].out !== meta.nActions) throw new Error('pesos: la última capa no coincide con nActions');
  }

  /** Logits sin máscara. */
  forward(input: Float32Array): Float32Array {
    let x = input;
    const last = this.meta.layers.length - 1;
    this.meta.layers.forEach((layer, l) => {
      const w = this.weights[l];
      const b = this.biases[l];
      const y = this.buffers[l];
      for (let o = 0; o < layer.out; o++) {
        let sum = b[o];
        const row = o * layer.in;
        for (let i = 0; i < layer.in; i++) {
          const v = x[i];
          if (v !== 0) sum += w[row + i] * v;
        }
        y[o] = l < last && sum < 0 ? 0 : sum;
      }
      x = y;
    });
    return x;
  }

  /** Probabilidades con máscara de legales (softmax sobre las legales). */
  probs(input: Float32Array, mask: Uint8Array, temperature = 1): Float64Array {
    const logits = this.forward(input);
    const out = new Float64Array(logits.length);
    let max = -Infinity;
    for (let a = 0; a < logits.length; a++) if (mask[a] && logits[a] > max) max = logits[a];
    let total = 0;
    for (let a = 0; a < logits.length; a++) {
      if (!mask[a]) continue;
      out[a] = Math.exp((logits[a] - max) / temperature);
      total += out[a];
    }
    for (let a = 0; a < out.length; a++) out[a] /= total;
    return out;
  }

  /** Elige una acción legal: muestreo (por defecto) o la más probable. */
  act(input: Float32Array, mask: Uint8Array, rng: Rng, greedy = false): { action: number; logp: number } {
    const p = this.probs(input, mask);
    let action = -1;
    if (greedy) {
      let best = -1;
      for (let a = 0; a < p.length; a++) {
        if (mask[a] && p[a] > best) {
          best = p[a];
          action = a;
        }
      }
    } else {
      let r = rng.next();
      for (let a = 0; a < p.length; a++) {
        if (!mask[a]) continue;
        action = a;
        r -= p[a];
        if (r <= 0) break;
      }
    }
    return { action, logp: Math.log(Math.max(p[action], 1e-12)) };
  }
}

/** Carga pesos desde disco (Node). */
export async function loadMlp(basePath: string): Promise<Mlp> {
  const { readFile } = await import('node:fs/promises');
  const meta = JSON.parse(await readFile(`${basePath}.json`, 'utf8')) as MlpMeta;
  const raw = await readFile(`${basePath}.bin`);
  const data = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  return new Mlp(meta, data);
}
