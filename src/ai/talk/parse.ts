// Intérprete por reglas: frases de truco rioplatense → una intención de la lista cerrada (intents.ts).
// Es rápido, no necesita nada de la red y se puede testear; lo que no entiende queda para el modelo
// (EmbeddingGemma, opcional) o se contesta "no te entendí".
// El orden de las reglas importa: preguntas antes que afirmaciones, "no quiero" antes que "quiero",
// "quiero retruco" antes que "quiero", "tengo para el truco" antes que "truco".

import type { CardNumber, Suit } from '../../engine/index.js';
import type { CardRef, IntentLabel, Understanding } from './intents.js';

/** minúsculas, sin tildes ni signos, espacios simples */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¡!¿?.,;:"'()«»…-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBER_WORDS: [RegExp, CardNumber][] = [
  [/\b(ancho|as|uno|1)\b/, 1],
  [/\b(dos|2)\b/, 2],
  [/\b(tres|3)\b/, 3],
  [/\b(cuatro|4)\b/, 4],
  [/\b(cinco|5)\b/, 5],
  [/\b(seis|6)\b/, 6],
  [/\b(siete|7)\b/, 7],
  [/\b(diez|sota|10)\b/, 10],
  [/\b(once|caballo|11)\b/, 11],
  [/\b(doce|rey|12)\b/, 12],
];

const SUITS: [RegExp, Suit][] = [
  [/\bespadas?\b/, 'espada'],
  [/\bbastos?\b/, 'basto'],
  [/\boros?\b/, 'oro'],
  [/\bcopas?\b/, 'copa'],
];

/** La carta que se nombra en la frase (normalizada), si hay una. */
export function parseCard(t: string): CardRef | undefined {
  if (/\b(espadon|el macho|espadita)\b/.test(t)) return { number: 1, suit: 'espada' };
  if (/\b(la hembra|bastito)\b/.test(t)) return { number: 1, suit: 'basto' };
  if (/\bsiete bravo\b|\b7 bravo\b/.test(t)) return { number: 7, suit: 'espada' };
  if (/\b(sietito|siete bello)\b/.test(t)) return { number: 7, suit: 'oro' };
  if (/\bla (mas )?(alta|grande|fuerte|mejor)\b|\bla mejor\b/.test(t)) return { pick: 'alta' };
  if (/\bla (mas )?(baja|chica|debil|peor)\b|\bla peor\b/.test(t)) return { pick: 'baja' };
  if (/\bla del medio\b|\bla mediana\b/.test(t)) return { pick: 'media' };
  let suit: Suit | undefined;
  for (const [re, s] of SUITS) {
    if (re.test(t)) {
      suit = s;
      break;
    }
  }
  // Un número suelto es una carta solo con artículo o verbo delante ("el tres", "tiro un 7"), con palo,
  // o en frases muy cortas: "subo el tanto a tres" no nombra ninguna carta.
  const words = t.split(' ');
  let number: CardNumber | undefined;
  for (const [re, n] of NUMBER_WORDS) {
    const match = re.exec(t);
    if (!match) continue;
    const before = t.slice(0, match.index).trim().split(' ').pop() ?? '';
    const named = /^(ancho|as|sota|caballo|rey)$/.test(match[0]);
    if (named || suit || words.length <= 2 || /^(el|la|un|una|tiro|juego|pongo|va|largo|mando|con)$/.test(before)) {
      number = n;
      break;
    }
  }
  if (number === undefined) return undefined;
  return suit ? { number, suit } : { number };
}

const has = (t: string, re: RegExp): boolean => re.test(t);

function result(label: IntentLabel, text: string, extra: Partial<Understanding> = {}): Understanding {
  return { label, prob: 1, source: 'reglas', text, ...extra };
}

/** Intención de la frase según las reglas, o `null` si no la reconoce. */
export function parseRules(raw: string): Understanding | null {
  const t = normalize(raw);
  if (!t) return null;
  const words = t.split(' ');
  // Pregunta: con signo, o empezando como pregunta ("tenés envido", "cuántos tenés").
  const question = raw.includes('?') || /^(tenes|tienes|traes|cuanto|cuantos|y vos tenes)\b/.test(t);
  // Una orden al compañero al principio de la frase manda sobre el resto ("matala que no tengo").
  const leadingOrder = /^(mata|matala|matalo|pasa|pasala|parda|pardala|emparda|empardala|empata|empatala)\b/.test(t);

  // Irse al mazo.
  if (has(t, /\b(me voy al mazo|al mazo|me voy|me retiro|me rindo|mazo)\b/)) return result('MAZO', t);

  // Preguntas al compañero.
  if (has(t, /\b(que hago|que juego|que tiro|como juego|que hacemos|que me decis|que me indicas|que hago con)\b/)) return result('PREG_QUE_HAGO', t);
  // "¿mato o paso?", "¿juego alta o baja?", "¿canto o no?": preguntar qué hacer.
  if (question && has(t, /\b(mato|paso|canto|juego|tiro|voy)\b.* o \b/)) return result('PREG_QUE_HAGO', t);
  if (question && !leadingOrder) {
    if (has(t, /\b(envido|tantos|tanto|puntos|flor)\b|\bcuanto(s)? (tenes|tienes)\b|\b(veinte|treinta|2\d|3[0-3])\b/)) return result('PREG_ENVIDO', t);
    if (has(t, /\b(truco|cartas|juego|algo|para pelear|con que)\b/) || has(t, /\b(tenes|tienes|traes)\b/)) return result('PREG_TRUCO', t);
  }

  // Lo que uno dice que tiene (o no).
  if (!leadingOrder && (has(t, /\b(no tengo|no traigo|estoy seco|ni un poroto|no tengo nada)\b|\btengo (nada|cualquier cosa|basura|poco|malas)\b/) || t === 'nada')) {
    return result('NO_TENGO', t, { about: has(t, /\b(envido|tantos|puntos)\b/) ? 'envido' : has(t, /\b(truco|cartas)\b/) ? 'truco' : undefined });
  }
  const score = /\btengo (\d{1,2})\b/.exec(t);
  if (score) return result('TENGO', t, { about: 'envido', score: Number(score[1]) });
  if (!leadingOrder && has(t, /\b(tengo|traigo)\b/)) {
    const card = parseCard(t);
    const about = has(t, /\b(envido|tantos|puntos)\b/) ? 'envido' : 'truco';
    return result('TENGO', t, { about, card });
  }

  // No quiero.
  if (has(t, /\b(no quiero|no lo quiero|no la quiero|ni ahi|no acepto|no va|me achico|ni loco|no me la banco|no me animo|ni en pedo|ni a palos|nones|negativo|mejor no)\b/)) return result('NO_QUIERO', t);
  // Querer un canto nombrándolo ("acepto el truco", "quiero ese envido"): es responder, no cantar.
  if (has(t, /\b(acepto|quiero)( el| ese| tu| su)? (truco|envido|tanto)\b/)) return result('QUIERO', t);

  // Indicaciones de truco al compañero.
  if (has(t, /\b(canta(le|les|lo)?|manda(le|les)?|pedi(le|les)?|tira(le|les)?|mete(le|les)?)( vos)? (el |un )?truco\b|\bdale (al |con el )?truco\b|\bcantalo vos\b/)) return result('IND_CANTA_TRUCO', t);
  if (has(t, /\b(no cantes|espera|esperate|aguanta|todavia no|quieto|no te apures)\b/) || t === 'para' || t === 'pará') return result('IND_ESPERA', t);

  // Cantos de truco (el que toque: truco, retruco, vale cuatro).
  if (has(t, /\b(re ?truco|retruco|va(le|lga) (cuatro|4)|truco)\b/)) return result('CANTA_TRUCO', t);

  // Envido.
  if (has(t, /\b(falta envido|la falta|falta)\b/)) return result('FALTA_ENVIDO', t);
  if (has(t, /\breal (envido)?\b|\breal$/)) return result('REAL_ENVIDO', t);
  if (/^(si )?quiero( el)? envido$/.test(t)) return result('QUIERO', t);
  if (has(t, /\b(envido|envite)\b/)) return result('ENVIDO', t);

  // Indicaciones de cartas al compañero (imperativos: "matá", "pasá", "tirá la más baja").
  if (has(t, /\b(mata|matala|matalo|ganala|gana esa|pisala|matá)\b/) || has(t, /\b(tira|juga|echa|mete) la (mas )?(alta|grande|fuerte|mejor)\b/)) return result('IND_MATA', t);
  if (has(t, /\b(pasa|pasala|deja pasar|anda bajo|juga bajo)\b/) || has(t, /\b(tira|juga|echa) la (mas )?(baja|chica|peor)\b/)) return result('IND_PASA', t);
  if (has(t, /\b(parda|pardala|emparda|empardala|empata|empatala)\b/)) return result('IND_PARDA', t);
  if (has(t, /\b(tranquilo|como quieras|lo que quieras|juga libre|hace la tuya|juga como quieras)\b/)) return result('IND_TRANQUILO', t);

  // Jugar una carta ("tiro el ancho", "va el siete de oro", "juego la más baja", "el tres de copa").
  const card = parseCard(t);
  if (card && (has(t, /\b(tiro|juego|pongo|mando|va|ahi va|largo|juego con|tiro el|tiro la)\b/) || words.length <= 5)) return result('JUGAR_CARTA', t, { card });

  // Quiero (y sinónimos, para responder un canto).
  if (has(t, /\b(quiero|de una|acepto|me la banco|me la juego|venga|obvio|dale)\b/) || /^(si|sisi|si si|va)$/.test(t)) return result('QUIERO', t);

  // Charla y chicanas.
  // (solo marcas claras de charla: una frase larga sin otra cosa reconocible queda para el modelo)
  if (has(t, /\b(ja(ja)+|mentiroso|mentira|son malos|son malisimos|te gane|que suerte|bien jugado|hola|suerte|chau|que mano|buenas noches)\b/) || (/^(vamos|buena|che)\b/.test(t) && words.length <= 3)) return result('CHARLA', t);
  return null;
}
