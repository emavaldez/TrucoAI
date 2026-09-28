// Carga una red desde disco (Node): <base>.json + <base>.bin, exportados por training/learner.
import { readFile } from 'node:fs/promises';
import { Mlp, type MlpMeta } from '../../src/ai/rl/mlp.js';

export async function loadMlp(basePath: string): Promise<Mlp> {
  const meta = JSON.parse(await readFile(`${basePath}.json`, 'utf8')) as MlpMeta;
  const raw = await readFile(`${basePath}.bin`);
  const data = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  return new Mlp(meta, data);
}
