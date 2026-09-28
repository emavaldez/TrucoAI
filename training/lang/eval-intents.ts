// Medición para la tesis: ¿cuánto entiende cada método las frases del corpus (src/ai/talk/corpus.ts)?
// - Reglas: acierto en `reglas`, `ejemplos` y `libres`.
// - EmbeddingGemma + vecino más parecido (banco = reglas + ejemplos) y EmbeddingGemma + regresión logística
//   (entrenada con reglas + ejemplos; regularización y temperatura elegidas con validación cruzada de 5 partes,
//   sin mirar las libres). Las dos se prueban en las `libres`, que nunca se usan para entrenar: acierto,
//   log-loss y calibración (ECE).
// - Combinado como en el juego (reglas y, si no entienden, el modelo con probabilidad ≥ 0,5): acierto,
//   equivocadas y cuántas deja sin actuar (pregunta de nuevo).
// Guarda el clasificador entrenado en public/models/intent-head.json (lo usa el juego) y el reporte en
// training/results/intents-eval.json. Necesita internet la primera vez (baja el modelo de Hugging Face):
//   node --import tsx training/lang/eval-intents.ts

import { writeFile } from 'node:fs/promises';
import { corpusEntries, type CorpusEntry } from '../../src/ai/talk/corpus.js';
import { INTENT_LABELS, type IntentLabel } from '../../src/ai/talk/intents.js';
import { parseRules } from '../../src/ai/talk/parse.js';
import { createEmbedder, KNN_TEMPERATURE, SEMANTIC_MODEL, unit, type IntentHead } from '../../src/ai/talk/semantic.js';
import { MODEL_MIN_PROB } from '../../src/ai/talk/understand.js';
import { probsFromLogits, softmaxLogits, trainSoftmax } from './softmax.js';

const K = INTENT_LABELS.length;
const idx = (label: IntentLabel): number => INTENT_LABELS.indexOf(label);

interface Metrics {
  n: number;
  acierto: number;
  logLoss: number;
  ece: number;
}

function metrics(probs: number[][], y: number[]): Metrics {
  let ok = 0;
  let nll = 0;
  const bins = Array.from({ length: 10 }, () => ({ conf: 0, acc: 0, n: 0 }));
  probs.forEach((p, s) => {
    let top = 0;
    for (let k = 1; k < p.length; k++) if (p[k] > p[top]) top = k;
    const hit = top === y[s] ? 1 : 0;
    ok += hit;
    nll += -Math.log(Math.max(p[y[s]], 1e-9));
    const bin = bins[Math.min(9, Math.floor(p[top] * 10))];
    bin.conf += p[top];
    bin.acc += hit;
    bin.n += 1;
  });
  const n = probs.length;
  const ece = bins.reduce((sum, b) => sum + (b.n ? (b.n / n) * Math.abs(b.acc / b.n - b.conf / b.n) : 0), 0);
  return { n, acierto: ok / n, logLoss: nll / n, ece };
}

function rulesReport(entries: CorpusEntry[]) {
  let ok = 0;
  let none = 0;
  for (const entry of entries) {
    const got = parseRules(entry.text)?.label ?? null;
    if (got === entry.label) ok += 1;
    else if (got === null) none += 1;
  }
  const n = entries.length;
  return { n, acierto: ok / n, sinEntender: none / n, equivocadas: (n - ok - none) / n };
}

/** Vecino más parecido: probabilidades para cada consulta con el banco dado (saltea `skip` en leave-one-out). */
function knnProbs(queries: Float32Array[], bank: Float32Array[], bankY: number[], temperature: number, skipSelf = false): number[][] {
  return queries.map((q, s) => {
    const best = new Array<number>(K).fill(-Infinity);
    bank.forEach((v, j) => {
      if (skipSelf && j === s) return;
      let sim = 0;
      for (let i = 0; i < q.length; i++) sim += q[i] * v[i];
      if (sim > best[bankY[j]]) best[bankY[j]] = sim;
    });
    return probsFromLogits(best.map((v) => (Number.isFinite(v) ? v / temperature : -1e9)));
  });
}

function combined(entries: CorpusEntry[], probs: number[][]) {
  let ok = 0;
  let wrong = 0;
  let asked = 0;
  entries.forEach((entry, s) => {
    let got: number | null = null;
    const rules = parseRules(entry.text)?.label ?? null;
    if (rules) got = idx(rules);
    else {
      const p = probs[s];
      let top = 0;
      for (let k = 1; k < K; k++) if (p[k] > p[top]) top = k;
      got = p[top] >= MODEL_MIN_PROB ? top : null;
    }
    if (got === null) asked += 1;
    else if (got === idx(entry.label)) ok += 1;
    else wrong += 1;
  });
  const n = entries.length;
  return { n, acierto: ok / n, equivocadas: wrong / n, preguntaDeNuevo: asked / n };
}

const train = corpusEntries('entrenamiento');
const test = corpusEntries('libres');
console.log(`corpus: ${train.length} para entrenar (reglas + ejemplos), ${test.length} libres para probar, ${K} intenciones`);
const report: Record<string, unknown> = {
  fecha: new Date().toISOString(),
  corpus: { entrenamiento: train.length, libres: test.length, intenciones: K },
  reglas: {
    reglas: rulesReport(corpusEntries('reglas')),
    ejemplos: rulesReport(corpusEntries('ejemplos')),
    libres: rulesReport(test),
  },
};
console.log('reglas', JSON.stringify(report.reglas));

console.log(`bajando ${SEMANTIC_MODEL}…`);
const started = Date.now();
// EVAL_FAKE=1: vectores falsos (bolsa de letras) para probar el script sin bajar el modelo.
const fake = async (texts: string[]) =>
  texts.map((text) => {
    const v = new Float32Array(64);
    for (const [i, ch] of [...text.toLowerCase()].entries()) v[(ch.charCodeAt(0) * 31 + (i % 3)) % 64] += 1;
    return v;
  });
const embed = process.env.EVAL_FAKE ? fake : await createEmbedder();
const t0 = Date.now();
const Xtr = (await embed(train.map((e) => e.text))).map(unit);
const Xte = (await embed(test.map((e) => e.text))).map(unit);
const msPerPhrase = (Date.now() - t0) / (train.length + test.length);
const ytr = train.map((e) => idx(e.label));
const yte = test.map((e) => idx(e.label));

// ---- vecino más parecido ----
const knn: Record<string, unknown> = {};
for (const t of [0.02, 0.03, 0.05, 0.08]) {
  knn[`T=${t}`] = {
    libres: metrics(knnProbs(Xte, Xtr, ytr, t), yte),
    entrenamientoLOO: metrics(knnProbs(Xtr, Xtr, ytr, t, true), ytr),
  };
}
const knnTest = knnProbs(Xte, Xtr, ytr, KNN_TEMPERATURE);
report.vecino = { porTemperatura: knn, combinadoLibres: combined(test, knnTest) };
console.log('vecino', JSON.stringify(report.vecino));

// ---- regresión logística: validación cruzada en el entrenamiento ----
const folds = 5;
const order = train.map((_, i) => i).sort((a, b) => ((a * 7919) % 104729) - ((b * 7919) % 104729));
const foldOf = new Array<number>(train.length);
order.forEach((i, r) => (foldOf[i] = r % folds));
let best: { l2: number; epochs: number; logits: number[][]; acc: number } | null = null;
const grid: Record<string, number> = {};
for (const l2 of [1e-4, 1e-3, 1e-2]) {
  for (const epochs of [150, 400]) {
    const oof: number[][] = new Array(train.length);
    for (let f = 0; f < folds; f++) {
      const trI = train.map((_, i) => i).filter((i) => foldOf[i] !== f);
      const model = trainSoftmax(trI.map((i) => Xtr[i]), trI.map((i) => ytr[i]), K, { l2, epochs });
      train.forEach((_, i) => {
        if (foldOf[i] === f) oof[i] = softmaxLogits(model, Xtr[i]);
      });
    }
    const acc = metrics(oof.map((z) => probsFromLogits(z)), ytr).acierto;
    grid[`l2=${l2},épocas=${epochs}`] = acc;
    if (!best || acc > best.acc) best = { l2, epochs, logits: oof, acc };
  }
}
const chosen = best as NonNullable<typeof best>;
// Temperatura que minimiza el log-loss fuera de muestra (calibración).
let temperature = 1;
let bestNll = Infinity;
for (const t of [0.5, 0.7, 0.85, 1, 1.2, 1.5, 2, 2.5, 3]) {
  const nll = metrics(chosen.logits.map((z) => probsFromLogits(z, t)), ytr).logLoss;
  if (nll < bestNll) [bestNll, temperature] = [nll, t];
}
const final = trainSoftmax(Xtr, ytr, K, { l2: chosen.l2, epochs: chosen.epochs });
const headTest = Xte.map((x) => probsFromLogits(softmaxLogits(final, x), temperature));
report.regresion = {
  validacionCruzada: grid,
  elegido: { l2: chosen.l2, epocas: chosen.epochs, temperatura: temperature, aciertoVC: chosen.acc },
  libres: metrics(headTest, yte),
  combinadoLibres: combined(test, headTest),
};
console.log('regresión', JSON.stringify(report.regresion));

report.modelo = { nombre: SEMANTIC_MODEL, dtype: 'q4', msPorFrase: msPerPhrase, cargaSegundos: (t0 - started) / 1000 };
const round = (v: number): number => Math.round(v * 1e5) / 1e5;
const head: IntentHead = {
  format: 'trucoai-intent-head-v1',
  model: SEMANTIC_MODEL,
  labels: [...INTENT_LABELS],
  dim: Xtr[0].length,
  W: final.W.map((row) => Array.from(row, round)),
  b: Array.from(final.b, round),
  temperature,
};
const out = process.env.EVAL_FAKE ? '/tmp/' : '';
await writeFile(`${out || 'public/models/'}intent-head.json`, JSON.stringify(head));
await writeFile(`${out || 'training/results/'}intents-eval.json`, JSON.stringify(report, null, 1));
console.log('→ public/models/intent-head.json (lo usa el juego) y training/results/intents-eval.json');
