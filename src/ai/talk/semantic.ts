// Entender frases libres con EmbeddingGemma (Google, abierto, ~200 MB cuantizado, 100+ idiomas), en el
// navegador con Transformers.js. Cada frase se convierte en un vector; la intención es la de los ejemplos
// del corpus más parecidos, con una probabilidad por intención (softmax de las similitudes), al estilo de
// un clasificador de lista cerrada. Es opcional (opción del menú) y se baja recién cuando se activa.
// Se usa solo cuando las reglas no entienden la frase.

import { corpusEntries } from './corpus.js';
import { INTENT_LABELS, type IntentLabel, type Understanding } from './intents.js';
import { normalize, parseCard } from './parse.js';

export const SEMANTIC_MODEL = 'onnx-community/embeddinggemma-300m-ONNX';
/** Formato de EmbeddingGemma para clasificar. */
const PREFIX = 'task: classification | query: ';
/** Temperatura del softmax sobre similitudes coseno (se ajusta con training/lang/eval-intents.ts). */
export const SEMANTIC_TEMPERATURE = 0.05;

export type Embed = (texts: string[]) => Promise<Float32Array[]>;

interface Bank {
  embed: Embed;
  examples: { label: IntentLabel; vec: Float32Array }[];
}

let bank: Bank | null = null;
let loading: Promise<boolean> | null = null;

export function semanticReady(): boolean {
  return bank !== null;
}

function unit(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

/** Arma el clasificador con una función que convierte textos en vectores (el modelo, o uno falso en tests). */
export async function buildBank(embed: Embed, examples = corpusEntries('todo')): Promise<Bank> {
  const vecs = await embed(examples.map((entry) => entry.text));
  return {
    embed,
    examples: examples.map((entry, i) => ({
      label: entry.label,
      vec: unit(vecs[i]),
    })),
  };
}

export function setSemanticBank(next: Bank | null): void {
  bank = next;
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
  const embed: Embed = async (texts) => {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 32) {
      const inputs = await tokenizer(
        texts.slice(i, i + 32).map((text) => PREFIX + text),
        { padding: true, truncation: true },
      );
      const { sentence_embedding: emb } = (await model(inputs)) as {
        sentence_embedding: { dims: number[]; data: Float32Array };
      };
      const [rows, dim] = emb.dims;
      for (let r = 0; r < rows; r++) out.push(Float32Array.from(emb.data.subarray(r * dim, (r + 1) * dim)));
    }
    return out;
  };
  return embed;
}

/** Baja EmbeddingGemma y calcula los vectores de los ejemplos. Devuelve false si no se pudo. */
export function loadSemantic(onProgress?: (fraction: number) => void): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      bank = await buildBank(await createEmbedder(onProgress));
      return true;
    })().catch((error: unknown) => {
      console.warn('[truco] no se pudo cargar EmbeddingGemma', error);
      loading = null;
      return false;
    });
  }
  return loading;
}

/** Probabilidad de cada intención para la frase (softmax de la mejor similitud por intención). */
export async function semanticScores(text: string): Promise<{ label: IntentLabel; prob: number }[]> {
  if (!bank) return [];
  const [raw] = await bank.embed([text]);
  const q = unit(raw);
  const best = new Map<IntentLabel, number>();
  for (const example of bank.examples) {
    let sim = 0;
    for (let i = 0; i < q.length; i++) sim += q[i] * example.vec[i];
    if (sim > (best.get(example.label) ?? -Infinity)) best.set(example.label, sim);
  }
  const labels = INTENT_LABELS.filter((label) => best.has(label));
  const logits = labels.map((label) => (best.get(label) as number) / SEMANTIC_TEMPERATURE);
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return labels.map((label, i) => ({ label, prob: exps[i] / total })).sort((a, b) => b.prob - a.prob);
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
