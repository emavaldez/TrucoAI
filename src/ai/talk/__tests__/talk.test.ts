// Hablarle a la mesa: el intérprete por reglas, las respuestas de la IA y lo que hace cada frase en el juego.

import { describe, expect, it } from 'vitest';
import type { Card, CardNumber, Suit } from '../../../engine/index.js';
import { getActor } from '../../../engine/index.js';
import { FAST_TIMING, GameController, HUMAN_ID, type MatchSettings } from '../../../app/GameController.js';
import { createManualScheduler } from '../../../app/scheduler.js';
import { corpusEntries } from '../corpus.js';
import { normalize, parseCard, parseRules } from '../parse.js';
import { partnerEnvidoAnswer, partnerTrucoAnswer, resolveCard } from '../respond.js';
import { buildBank, semanticScores, setSemanticBank, setSemanticHead } from '../semantic.js';
import { interpret } from '../understand.js';

function card(id: string): Card {
  const [number, suit] = id.split('-');
  return { id, number: Number(number) as CardNumber, suit: suit as Suit };
}

describe('intérprete por reglas', () => {
  it('entiende todas las frases de referencia del corpus', () => {
    const wrong = corpusEntries('reglas')
      .map((entry) => ({ ...entry, got: parseRules(entry.text)?.label ?? null }))
      .filter((entry) => entry.got !== entry.label);
    expect(wrong).toEqual([]);
  });

  it('normaliza tildes, signos y mayúsculas', () => {
    expect(normalize('¡Quiero Retrucó!')).toBe('quiero retruco');
  });

  it('las cartas: por nombre, por apodo o por posición', () => {
    expect(parseCard('tiro el ancho de espada')).toEqual({ number: 1, suit: 'espada' });
    expect(parseCard('va el siete bravo')).toEqual({ number: 7, suit: 'espada' });
    expect(parseCard('juego el 7 de oros')).toEqual({ number: 7, suit: 'oro' });
    expect(parseCard('tiro la mas baja')).toEqual({ pick: 'baja' });
    expect(parseCard('va la sota')).toEqual({ number: 10 });
  });

  it('decir la palabra es cantar: se pregunta por el «tanto» y se indica con «cantá» / «jugá callado»', () => {
    expect(parseRules('truco')?.label).toBe('CANTA_TRUCO');
    expect(parseRules('cantá truco')?.label).toBe('CANTA_TRUCO');
    expect(parseRules('¿tenés para el truco?')?.label).toBe('CANTA_TRUCO');
    expect(parseRules('¿tenés envido?')?.label).toBe('ENVIDO');
    expect(parseRules('¿tenés tanto?')?.label).toBe('PREG_TANTO');
    expect(parseRules('¿canto tanto?')?.label).toBe('PREG_CANTO_TANTO');
    expect(parseRules('cantá')?.label).toBe('IND_CANTA_TRUCO');
    expect(parseRules('jugá callado')?.label).toBe('IND_ESPERA');
    expect(parseRules('cantá el tanto')?.label).toBe('IND_CANTA_TANTO');
    expect(parseRules('tirá la más baja')?.label).toBe('IND_PASA');
    expect(parseRules('tiro la más baja')?.label).toBe('JUGAR_CARTA');
    expect(parseRules('tengo 30')).toMatchObject({ label: 'TENGO', about: 'tanto', score: 30 });
  });

  it('preguntas al pie y al equipo: «¿qué juego?», «¿qué tiro?», «¿tienen algo?», «¿qué te queda?»', () => {
    for (const text of ['¿qué hago?', '¿qué juego?', '¿qué tiro?']) expect(parseRules(text)?.label).toBe('PREG_QUE_HAGO');
    for (const text of ['¿tienen algo?', '¿qué tenés?', '¿qué te queda?', '¿qué les queda?']) expect(parseRules(text)?.label).toBe('PREG_CARTAS');
    expect(parseRules('me queda el ancho')?.label).toBe('TENGO');
    expect(parseRules('no me queda nada')?.label).toBe('NO_TENGO');
    expect(parseRules('el envido está primero')?.label).toBe('ENVIDO');
  });

  it('lo que no reconoce queda sin entender (para el modelo o para preguntar)', () => {
    expect(parseRules('qué lindo día para jugar')).toBeNull();
    expect(parseRules('')).toBeNull();
  });
});

describe('respuestas de los compañeros (verdad, en términos de seña)', () => {
  it('envido y truco según su mano', () => {
    expect(partnerEnvidoAnswer([card('7-oro'), card('6-oro'), card('1-copa')])).toBe('¡Tengo muchos!');
    expect(partnerEnvidoAnswer([card('4-oro'), card('5-copa'), card('12-basto')])).toBe('No, poco y nada.');
    expect(partnerTrucoAnswer([card('1-espada'), card('7-oro'), card('4-copa')])).toBe('Tengo para el truco.');
    expect(partnerTrucoAnswer([card('4-oro'), card('5-copa'), card('12-basto')])).toBe('Nada, estoy seco.');
  });

  it('resuelve la carta nombrada contra la mano', () => {
    const hand = [card('1-espada'), card('7-oro'), card('4-copa')];
    expect(resolveCard(hand, { number: 1 })?.id).toBe('1-espada');
    expect(resolveCard(hand, { pick: 'baja' })?.id).toBe('4-copa');
    expect(resolveCard(hand, { number: 3 })).toBeNull();
  });
});

function controller(settings: Partial<MatchSettings>, seed = 3) {
  const scheduler = createManualScheduler();
  const c = new GameController({
    settings: { playerCount: 2, difficulty: 'normal', flor: false, picaPica: false, ...settings },
    seed,
    scheduler,
    timing: FAST_TIMING,
  });
  c.start();
  return { c, scheduler };
}

function untilHumanTurn(c: GameController, scheduler: ReturnType<typeof createManualScheduler>): void {
  let guard = 0;
  while (getActor(c.getState()) !== HUMAN_ID && guard++ < 100) scheduler.runNext();
}

describe('lo que hace cada frase en el juego', () => {
  it('«truco» en tu turno lo canta; lo dicho queda en la charla', () => {
    const { c, scheduler } = controller({});
    untilHumanTurn(c, scheduler);
    const result = c.humanSays('¡Truco!');
    expect(result.ok).toBe(true);
    expect(c.getState().hand.truco.pending?.callerId).toBe(HUMAN_ID);
    expect(c.snapshot().speech.at(-1)).toMatchObject({ playerId: HUMAN_ID, text: '¡Truco!' });
  });

  it('«quiero» sin nada cantado no hace nada y avisa por qué', () => {
    const { c, scheduler } = controller({});
    untilHumanTurn(c, scheduler);
    const result = c.humanSays('quiero');
    expect(result.ok).toBe(false);
    expect(result.note).toMatch(/cantó nada/);
  });

  it('«tiro la más baja» juega tu carta más baja', () => {
    const { c, scheduler } = controller({}, 5);
    untilHumanTurn(c, scheduler);
    const before = c.getState().hand.hands[HUMAN_ID];
    const lowest = resolveCard(before, { pick: 'baja' }) as Card;
    expect(c.humanSays('tiro la más baja').ok).toBe(true);
    expect(c.getState().hand.hands[HUMAN_ID].some((x) => x.id === lowest.id)).toBe(false);
  });

  it('con 4, preguntarle al compañero: contesta en voz alta (público)', () => {
    const { c } = controller({ playerCount: 4 });
    const result = c.humanSays('¿tenés tanto?');
    expect(result.ok).toBe(true);
    const last = c.snapshot().speech.at(-1);
    expect(last?.playerId).toBe('p2');
    expect(last?.text).toMatch(/tengo|poco|nada/i);
  });

  it('indicar solo si sos el pie; si no, avisa', () => {
    for (let seed = 1; seed < 60; seed++) {
      const { c } = controller({ playerCount: 4 }, seed);
      const result = c.humanSays('matá');
      if (c.humanIsPie()) {
        expect(result.ok).toBe(true);
        expect(c.snapshot().instructions).toContainEqual({ from: HUMAN_ID, kind: 'MATA' });
      } else {
        expect(result.ok).toBe(false);
        expect(result.note).toMatch(/pie/);
      }
    }
  });

  it('una chicana la contesta un rival; algo que no se entiende, avisa', () => {
    const { c } = controller({});
    expect(c.humanSays('mentiroso').ok).toBe(true);
    expect(c.snapshot().speech.at(-1)?.playerId).toBe('p1');
    expect(c.humanSays('blablá').note).toMatch(/No te entendí/);
  });
});

describe('modelo semántico (con vectores falsos: el de verdad se mide en la Mac)', () => {
  it('elige la intención de los ejemplos más parecidos, con probabilidades que suman 1', async () => {
    // Vector falso: bolsa de letras. Alcanza para probar el mecanismo, no la calidad.
    const embed = async (texts: string[]) =>
      texts.map((text) => {
        const v = new Float32Array(26);
        for (const ch of normalize(text)) if (ch >= 'a' && ch <= 'z') v[ch.charCodeAt(0) - 97] += 1;
        return v;
      });
    setSemanticBank(await buildBank(embed, [
      { text: 'quiero', label: 'QUIERO' },
      { text: 'me voy al mazo', label: 'MAZO' },
    ]));
    const scores = await semanticScores('quiero quiero');
    expect(scores[0].label).toBe('QUIERO');
    expect(scores.reduce((a, b) => a + b.prob, 0)).toBeCloseTo(1, 6);
    // Las reglas siguen primero; el modelo solo con lo que no entienden.
    expect((await interpret('truco', true)).understood?.source).toBe('reglas');
    const free = await interpret('zzz quierooo', true);
    expect(free.understood?.source ?? free.guess?.source).toBe('modelo');
    setSemanticBank(null);
  });

  it('con el clasificador entrenado (regresión logística) usa sus pesos y su temperatura', async () => {
    const embed = async (texts: string[]) => texts.map((text) => Float32Array.from([text.includes('mazo') ? 1 : 0, text.includes('mazo') ? 0 : 1]));
    setSemanticHead(embed, {
      format: 'trucoai-intent-head-v1',
      model: 'onnx-community/embeddinggemma-300m-ONNX',
      labels: ['MAZO', 'QUIERO'],
      dim: 2,
      W: [
        [4, 0],
        [0, 4],
      ],
      b: [0, 0],
      temperature: 1,
    });
    const scores = await semanticScores('me tomo el mazo');
    expect(scores[0].label).toBe('MAZO');
    expect(scores[0].prob).toBeGreaterThan(0.95);
    setSemanticBank(null);
  });
});
