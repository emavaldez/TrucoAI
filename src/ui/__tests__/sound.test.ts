// Elegir la voz de la mesa: rioplatense y natural primero, nunca las de juguete.

import { describe, expect, it } from 'vitest';
import { voiceScore } from '../sound.js';

describe('voces', () => {
  it('ordena: rioplatense natural > latinoamericana de Google > España; las de juguete y otros idiomas, afuera', () => {
    const voices = [
      { name: 'Mónica', lang: 'es-ES' },
      { name: 'Google español de Estados Unidos', lang: 'es-US' },
      { name: 'Diego (Mejorada)', lang: 'es-AR' },
      { name: 'Grandpa (español (España))', lang: 'es-ES' },
      { name: 'Samantha', lang: 'en-US' },
    ];
    const sorted = [...voices].sort((a, b) => voiceScore(b) - voiceScore(a)).map((v) => v.name);
    expect(sorted.slice(0, 3)).toEqual(['Diego (Mejorada)', 'Google español de Estados Unidos', 'Mónica']);
    expect(voiceScore({ name: 'Grandpa (español (España))', lang: 'es-ES' })).toBeLessThan(0);
    expect(voiceScore({ name: 'Samantha', lang: 'en-US' })).toBeLessThan(0);
  });
});
