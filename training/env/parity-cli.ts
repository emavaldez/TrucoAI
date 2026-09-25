// Para training/learner/parity_check.py: logits de la red TS para observaciones dadas.
import { readFile } from 'node:fs/promises';
import { loadMlp } from './mlp.js';

const [base, obsFile, dimText] = process.argv.slice(2);
const mlp = await loadMlp(base);
const raw = await readFile(obsFile);
const dim = Number(dimText);
const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
const out: number[][] = [];
for (let r = 0; r * dim < bytes.length; r++) {
  const x = Float32Array.from(bytes.subarray(r * dim, (r + 1) * dim), (v) => v / 255);
  out.push(Array.from(mlp.forward(x)));
}
console.log(JSON.stringify(out));
