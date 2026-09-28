// Regresión logística multiclase (softmax) sobre vectores de EmbeddingGemma, con L2 y Adam. Sin
// dependencias: son ~500 frases × 768 dimensiones × 20 intenciones, entrena en segundos.

export interface SoftmaxModel {
  W: Float64Array[]; // K × d
  b: Float64Array; // K
}

export function trainSoftmax(X: Float32Array[], y: number[], K: number, opts: { l2: number; epochs: number; lr?: number }): SoftmaxModel {
  const d = X[0].length;
  const n = X.length;
  const W = Array.from({ length: K }, () => new Float64Array(d));
  const b = new Float64Array(K);
  const mW = Array.from({ length: K }, () => new Float64Array(d));
  const vW = Array.from({ length: K }, () => new Float64Array(d));
  const mb = new Float64Array(K);
  const vb = new Float64Array(K);
  const lr = opts.lr ?? 0.05;
  const [b1, b2, eps] = [0.9, 0.999, 1e-8];
  const logits = new Float64Array(K);
  for (let epoch = 1; epoch <= opts.epochs; epoch++) {
    const gW = Array.from({ length: K }, () => new Float64Array(d));
    const gb = new Float64Array(K);
    for (let s = 0; s < n; s++) {
      const x = X[s];
      let max = -Infinity;
      for (let k = 0; k < K; k++) {
        let z = b[k];
        const w = W[k];
        for (let i = 0; i < d; i++) z += w[i] * x[i];
        logits[k] = z;
        if (z > max) max = z;
      }
      let total = 0;
      for (let k = 0; k < K; k++) {
        logits[k] = Math.exp(logits[k] - max);
        total += logits[k];
      }
      for (let k = 0; k < K; k++) {
        const g = logits[k] / total - (k === y[s] ? 1 : 0);
        gb[k] += g;
        const gw = gW[k];
        for (let i = 0; i < d; i++) gw[i] += g * x[i];
      }
    }
    for (let k = 0; k < K; k++) {
      for (let i = 0; i < d; i++) {
        const g = gW[k][i] / n + opts.l2 * W[k][i];
        mW[k][i] = b1 * mW[k][i] + (1 - b1) * g;
        vW[k][i] = b2 * vW[k][i] + (1 - b2) * g * g;
        W[k][i] -= (lr * (mW[k][i] / (1 - b1 ** epoch))) / (Math.sqrt(vW[k][i] / (1 - b2 ** epoch)) + eps);
      }
      const g = gb[k] / n;
      mb[k] = b1 * mb[k] + (1 - b1) * g;
      vb[k] = b2 * vb[k] + (1 - b2) * g * g;
      b[k] -= (lr * (mb[k] / (1 - b1 ** epoch))) / (Math.sqrt(vb[k] / (1 - b2 ** epoch)) + eps);
    }
  }
  return { W, b };
}

export function softmaxLogits(model: SoftmaxModel, x: Float32Array): number[] {
  return model.W.map((w, k) => {
    let z = model.b[k];
    for (let i = 0; i < x.length; i++) z += w[i] * x[i];
    return z;
  });
}

export function probsFromLogits(logits: number[], temperature = 1): number[] {
  const z = logits.map((v) => v / temperature);
  const max = Math.max(...z);
  const e = z.map((v) => Math.exp(v - max));
  const total = e.reduce((a, c) => a + c, 0);
  return e.map((v) => v / total);
}
