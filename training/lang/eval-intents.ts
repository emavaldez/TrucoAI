// Medición para la tesis: ¿cuánto entiende cada método las frases del corpus (src/ai/talk/corpus.ts)?
// - Reglas: acierto en las frases de referencia y en las libres (las que no se escribieron pensando en las reglas).
// - EmbeddingGemma (k-NN con softmax): dejando cada frase afuera de los ejemplos (leave-one-out), acierto,
//   log-loss y calibración (ECE) para varias temperaturas.
// - Combinado (reglas y, si no entienden, el modelo con probabilidad ≥ 0,5): acierto y cuántas deja sin actuar.
// Necesita internet la primera vez (baja el modelo de Hugging Face). Desde la raíz del repo:
//   node --import tsx training/lang/eval-intents.ts
// Resultado: por pantalla y en training/results/intents-eval.json (va a git).

import { writeFile } from 'node:fs/promises';
import { corpusEntries, type CorpusEntry } from '../../src/ai/talk/corpus.js';
import { INTENT_LABELS, type IntentLabel } from '../../src/ai/talk/intents.js';
import { parseRules } from '../../src/ai/talk/parse.js';
import { createEmbedder, SEMANTIC_MODEL } from '../../src/ai/talk/semantic.js';
import { MODEL_MIN_PROB } from '../../src/ai/talk/understand.js';

function unit(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

function rulesAccuracy(entries: CorpusEntry[]) {
  let ok = 0;
  let none = 0;
  let wrong = 0;
  for (const entry of entries) {
    const got = parseRules(entry.text)?.label ?? null;
    if (got === entry.label) ok += 1;
    else if (got === null) none += 1;
    else wrong += 1;
  }
  return { n: entries.length, acierto: ok / entries.length, sinEntender: none / entries.length, equivocadas: wrong / entries.length };
}

/** Probabilidades por intención para la frase i usando todas las demás como ejemplos. */
function looProbs(i: number, vecs: Float32Array[], labels: IntentLabel[], temperature: number): Map<IntentLabel, number> {
  const best = new Map<IntentLabel, number>();
  for (let j = 0; j < vecs.length; j++) {
    if (j === i) continue;
    let sim = 0;
    for (let k = 0; k < vecs[i].length; k++) sim += vecs[i][k] * vecs[j][k];
    if (sim > (best.get(labels[j]) ?? -Infinity)) best.set(labels[j], sim);
  }
  const present = INTENT_LABELS.filter((label) => best.has(label));
  const logits = present.map((label) => (best.get(label) as number) / temperature);
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return new Map(present.map((label, k) => [label, exps[k] / total]));
}

function modelMetrics(entries: CorpusEntry[], vecs: Float32Array[], temperature: number, subset: (e: CorpusEntry) => boolean) {
  const labels = entries.map((e) => e.label);
  let ok = 0;
  let nll = 0;
  let n = 0;
  const bins = Array.from({ length: 10 }, () => ({ conf: 0, acc: 0, n: 0 }));
  entries.forEach((entry, i) => {
    if (!subset(entry)) return;
    const probs = looProbs(i, vecs, labels, temperature);
    const [top, p] = [...probs].sort((a, b) => b[1] - a[1])[0];
    const hit = top === entry.label ? 1 : 0;
    ok += hit;
    nll += -Math.log(Math.max(probs.get(entry.label) ?? 0, 1e-9));
    const bin = bins[Math.min(9, Math.floor(p * 10))];
    bin.conf += p;
    bin.acc += hit;
    bin.n += 1;
    n += 1;
  });
  const ece = bins.reduce((sum, b) => sum + (b.n ? (b.n / n) * Math.abs(b.acc / b.n - b.conf / b.n) : 0), 0);
  return { n, acierto: ok / n, logLoss: nll / n, ece };
}

function combined(entries: CorpusEntry[], vecs: Float32Array[], temperature: number, subset: (e: CorpusEntry) => boolean) {
  const labels = entries.map((e) => e.label);
  let ok = 0;
  let wrong = 0;
  let asked = 0;
  let n = 0;
  entries.forEach((entry, i) => {
    if (!subset(entry)) return;
    n += 1;
    const rules = parseRules(entry.text)?.label ?? null;
    let got: IntentLabel | null = rules;
    if (!got) {
      const [top, p] = [...looProbs(i, vecs, labels, temperature)].sort((a, b) => b[1] - a[1])[0];
      got = p >= MODEL_MIN_PROB ? top : null;
    }
    if (got === null) asked += 1;
    else if (got === entry.label) ok += 1;
    else wrong += 1;
  });
  return { n, acierto: ok / n, equivocadas: wrong / n, preguntaDeNuevo: asked / n };
}

const entries = corpusEntries('todo');
const libre = (e: CorpusEntry) => corpusEntries('libres').some((x) => x.text === e.text && x.label === e.label);
console.log(`corpus: ${entries.length} frases (${corpusEntries('reglas').length} de referencia, ${corpusEntries('libres').length} libres), ${INTENT_LABELS.length} intenciones`);
const report: Record<string, unknown> = {
  fecha: new Date().toISOString(),
  corpus: { total: entries.length, reglas: corpusEntries('reglas').length, libres: corpusEntries('libres').length },
  reglas: { referencia: rulesAccuracy(corpusEntries('reglas')), libres: rulesAccuracy(corpusEntries('libres')) },
};
console.log('reglas', JSON.stringify(report.reglas));

console.log(`bajando ${SEMANTIC_MODEL}…`);
const started = Date.now();
const embed = await createEmbedder();
const t0 = Date.now();
const vecs = (await embed(entries.map((e) => e.text))).map(unit);
const msPerPhrase = (Date.now() - t0) / entries.length;
const temps = [0.01, 0.02, 0.03, 0.05, 0.08, 0.12];
const model: Record<string, unknown> = {};
for (const t of temps) {
  model[`T=${t}`] = { todas: modelMetrics(entries, vecs, t, () => true), libres: modelMetrics(entries, vecs, t, libre) };
  console.log(`modelo T=${t}`, JSON.stringify(model[`T=${t}`]));
}
report.modelo = { nombre: SEMANTIC_MODEL, dtype: 'q4', msPorFrase: msPerPhrase, cargaSegundos: (t0 - started) / 1000, porTemperatura: model };
report.combinado = Object.fromEntries(temps.map((t) => [`T=${t}`, combined(entries, vecs, t, libre)]));
console.log('combinado (libres)', JSON.stringify(report.combinado));
await writeFile('training/results/intents-eval.json', JSON.stringify(report, null, 1));
console.log('→ training/results/intents-eval.json');
