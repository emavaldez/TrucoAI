// Entender frases libres con EmbeddingGemma (Google, abierto, ~200 MB cuantizado, 100+ idiomas), en el
// navegador con Transformers.js. Cada frase se convierte en un vector y un clasificador de lista cerrada da
// una probabilidad por intención (al estilo de Jev):
// - Si está `public/models/intent-head.json` (regresión logística entrenada sobre esos vectores por
//   training/lang/eval-intents.ts), se usa esa: es liviana y separa mejor los actos de habla.
// - Si no, el vecino más parecido del corpus de entrenamiento (reglas + ejemplos), con softmax.
// Es opcional (opción del menú), se baja recién cuando se activa y solo se usa cuando las reglas no entienden.

import { corpusEntries } from './corpus.js';
import { INTENT_LABELS, type IntentLabel, type Understanding } from './intents.js';
import { normalize, parseCard } from './parse.js';

export const SEMANTIC_MODEL = 'onnx-community/embeddinggemma-300m-ONNX';
/** Formato de EmbeddingGemma para clasificar. */
export const SEMANTIC_PREFIX = 'task: classification | query: ';
/** Temperatura del softmax del vecino más parecido (medida con training/lang/eval-intents.ts: la mejor calibrada). */
export const KNN_TEMPERATURE = 0.05;

export type Embed = (texts: string[]) => Promise<Float32Array[]>;

/** Regresión logística sobre los vectores (la entrena training/lang/eval-intents.ts). */
export interface IntentHead {
  format: 'trucoai-intent-head-v1';
  model: string;
  labels: IntentLabel[];
  dim: number;
  /** pesos por intención (labels.length × dim) */
  W: number[][];
  b: number[];
  temperature: number;
}

interface Classifier {
  embed: Embed;
  head: IntentHead | null;
  examples: { label: IntentLabel; vec: Float32Array }[];
}

let classifier: Classifier | null = null;
let loading: Promise<boolean> | null = null;

export function semanticReady(): boolean {
  return classifier !== null;
}

export function unit(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

/** Vecino más parecido: arma el banco de ejemplos con una función texto → vector (el modelo, o una falsa en tests). */
export async function buildBank(embed: Embed, examples = corpusEntries('entrenamiento')): Promise<Classifier> {
  const vecs = await embed(examples.map((entry) => entry.text));
  return { embed, head: null, examples: examples.map((entry, i) => ({ label: entry.label, vec: unit(vecs[i]) })) };
}

export function setSemanticBank(next: Classifier | null): void {
  classifier = next;
}

export function setSemanticHead(embed: Embed, head: IntentHead): void {
  classifier = { embed, head, examples: [] };
}

/** Baja EmbeddingGemma y devuelve la función texto → vector (también la usa training/lang/eval-intents.ts). */
export async function createEmbedder(onProgress?: (fraction: number) => void): Promise<Embed> {
  const { AutoModel, AutoTokenizer } = await import('@huggingface/transformers');
  const files = new Map<string, number>();
  const tokenizer = await AutoTokenizer.from_pretrained(SEMANTIC_MODEL);
  const model = await AutoModel.from_pretrained(SEMANTIC_MODEL, {
    dtype: 'q4',
    progress_callback: (info: { status?: string; file?: string; progress?: number }) => {
      if (info.status === 'progress' && info.file && typeof info.progress === 'number') {
        files.set(info.file, info.progress);
        const values = [...files.values()];
        onProgress?.(values.reduce((a, b) => a + b, 0) / values.length / 100);
      }
    },
  });
  return async (texts) => {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 32) {
      const inputs = await tokenizer(
        texts.slice(i, i + 32).map((text) => SEMANTIC_PREFIX + text),
        { padding: true, truncation: true },
      );
      const { sentence_embedding: emb } = (await model(inputs)) as { sentence_embedding: { dims: number[]; data: Float32Array } };
      const [rows, dim] = emb.dims;
      for (let r = 0; r < rows; r++) out.push(Float32Array.from(emb.data.subarray(r * dim, (r + 1) * dim)));
    }
    return out;
  };
}

async function fetchHead(): Promise<IntentHead | null> {
  try {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const res = await fetch(`${base}models/intent-head.json`);
    if (!res.ok) return null;
    const head = (await res.json()) as IntentHead;
    return head.format === 'trucoai-intent-head-v1' && head.model === SEMANTIC_MODEL ? head : null;
  } catch {
    return null;
  }
}

/** Baja EmbeddingGemma (y el clasificador entrenado, si está). Devuelve false si no se pudo. */
export function loadSemantic(onProgress?: (fraction: number) => void): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      const [embed, head] = await Promise.all([createEmbedder(onProgress), fetchHead()]);
      classifier = head ? { embed, head, examples: [] } : await buildBank(embed);
      return true;
    })().catch((error: unknown) => {
      console.warn('[truco] no se pudo cargar EmbeddingGemma', error);
      loading = null;
      return false;
    });
  }
  return loading;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / total);
}

/** Probabilidades del clasificador entrenado para un vector (ya normalizado). */
export function headProbs(head: IntentHead, q: Float32Array): number[] {
  const logits = head.W.map((row, k) => {
    let z = head.b[k];
    for (let i = 0; i < head.dim; i++) z += row[i] * q[i];
    return z / head.temperature;
  });
  return softmax(logits);
}

/** Probabilidad de cada intención para la frase. */
export async function semanticScores(text: string): Promise<{ label: IntentLabel; prob: number }[]> {
  if (!classifier) return [];
  const [raw] = await classifier.embed([text]);
  const q = unit(raw);
  if (classifier.head) {
    const head = classifier.head;
    return headProbs(head, q)
      .map((prob, k) => ({ label: head.labels[k], prob }))
      .sort((a, b) => b.prob - a.prob);
  }
  const best = new Map<IntentLabel, number>();
  for (const example of classifier.examples) {
    let sim = 0;
    for (let i = 0; i < q.length; i++) sim += q[i] * example.vec[i];
    if (sim > (best.get(example.label) ?? -Infinity)) best.set(example.label, sim);
  }
  const labels = INTENT_LABELS.filter((label) => best.has(label));
  const probs = softmax(labels.map((label) => (best.get(label) as number) / KNN_TEMPERATURE));
  return labels.map((label, i) => ({ label, prob: probs[i] })).sort((a, b) => b.prob - a.prob);
}

/** La intención más probable según el modelo (con su probabilidad), o `null` si el modelo no está. */
export async function semanticUnderstand(text: string): Promise<Understanding | null> {
  const scores = await semanticScores(text);
  if (scores.length === 0) return null;
  const top = scores[0];
  const t = normalize(text);
  const card = top.label === 'JUGAR_CARTA' || top.label === 'TENGO' ? parseCard(t) : undefined;
  return { label: top.label, prob: top.prob, source: 'modelo', text: t, card };
}
