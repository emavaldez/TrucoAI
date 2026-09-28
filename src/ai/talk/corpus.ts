// Frases etiquetadas de truco rioplatense (para los tests, para los ejemplos del modelo y para medir
// en la tesis). `reglas`: las tiene que entender el intérprete por reglas. `libres`: formas más sueltas,
// para medir qué tanto las entiende cada método (training/lang/eval-intents.ts).

import type { IntentLabel } from './intents.js';

export interface CorpusEntry {
  text: string;
  label: IntentLabel;
}

type Corpus = Record<IntentLabel, { reglas: string[]; libres: string[] }>;

export const CORPUS: Corpus = {
  CANTA_TRUCO: {
    reglas: ['truco', '¡Truco!', 'quiero retruco', 'retruco', 'vale cuatro', 'quiero vale cuatro', 're truco', 'te canto truco', 'vale 4', 'truco, papá'],
    libres: ['te subo la apuesta', 'vamos por más', 'que valga el doble', 'subamos esto', 'a ver si te animás a más'],
  },
  QUIERO: {
    reglas: ['quiero', '¡Quiero!', 'sí, quiero', 'de una', 'acepto', 'me la banco', 'dale', 'venga', 'obvio', 'sí', 'me la juego', 'quiero el envido'],
    libres: ['va la parada', 'la acepto', 'juguemos', 'le entro', 'por supuesto que sí', 'hecho'],
  },
  NO_QUIERO: {
    reglas: ['no quiero', 'no, no quiero', 'ni ahí', 'no lo quiero', 'no acepto', 'me achico', 'ni loco', 'no va'],
    libres: ['paso, no me da', 'esta vez no', 'no me conviene', 'llevatelo', 'no da'],
  },
  ENVIDO: {
    reglas: ['envido', '¡Envido!', 'envido envido', 'te canto envido', 'canto envido', 'envido, che'],
    libres: ['vamos con los tantos', 'a ver esos tantos', 'juguemos los puntos'],
  },
  REAL_ENVIDO: {
    reglas: ['real envido', '¡Real envido!', 'real', 'te canto real envido'],
    libres: ['subo el tanto a tres'],
  },
  FALTA_ENVIDO: {
    reglas: ['falta envido', 'la falta', '¡Falta envido!', 'te canto la falta', 'falta'],
    libres: ['todo o nada con los tantos', 'va la partida en los tantos'],
  },
  MAZO: {
    reglas: ['me voy al mazo', 'al mazo', 'me voy', 'me retiro', 'me rindo', 'mazo'],
    libres: ['esta la dejo', 'no juego más esta mano', 'suelto las cartas'],
  },
  JUGAR_CARTA: {
    reglas: [
      'tiro el ancho de espada',
      'juego el siete de oro',
      'va el tres de copa',
      'el cuatro de basto',
      'tiro la más baja',
      'juego la más alta',
      'pongo el rey de oro',
      'ahí va el macho',
      'juego el 7 de espada',
      'tiro la del medio',
      'el ancho',
      'va la sota de copa',
    ],
    libres: ['largo mi peor carta', 'bajo la de menos valor', 'pongo mi mejor carta'],
  },
  IND_MATA: {
    reglas: ['matá', 'mata', 'matala', '¡Matala!', 'ganala', 'pisala', 'tirá la más alta', 'jugá la más fuerte'],
    libres: ['ganá esta baza', 'esta la tenés que ganar vos', 'hacé la primera'],
  },
  IND_PASA: {
    reglas: ['pasá', 'pasala', 'tirá la más baja', 'jugá bajo', 'dejá pasar', 'andá bajo', 'echá la más chica'],
    libres: ['guardate las buenas', 'yo la gano, vos tirá cualquiera', 'no gastes cartas'],
  },
  IND_PARDA: {
    reglas: ['pardá', 'pardala', 'empardá', 'empardala', 'empatá'],
    libres: ['igualala', 'hacé que quede empatada'],
  },
  IND_TRANQUILO: {
    reglas: ['tranquilo', 'jugá tranquilo', 'como quieras', 'lo que quieras', 'jugá libre', 'hacé la tuya'],
    libres: ['vos sabés', 'a tu criterio', 'confío en vos'],
  },
  IND_CANTA_TRUCO: {
    reglas: ['cantá truco', 'cantale truco', 'mandale truco', 'dale al truco', 'tirale truco', 'metele truco', 'mandá el truco'],
    libres: ['apretalos con el truco', 'que canten ellos no, cantá vos'],
  },
  IND_ESPERA: {
    reglas: ['esperá', 'no cantes', 'aguantá', 'todavía no', 'quieto', 'pará', 'no te apures', 'esperate'],
    libres: ['frená un poco', 'dejá, no digas nada', 'callado por ahora'],
  },
  PREG_ENVIDO: {
    reglas: ['¿tenés envido?', '¿cuántos tenés?', 'tenés tantos?', '¿tenés para el envido?', '¿cuánto tenés de envido?', 'y vos cuántos tenés?'],
    libres: ['¿cómo venís de puntos?', '¿estás bien de tantos?', 'decime tus tantos'],
  },
  PREG_TRUCO: {
    reglas: ['¿tenés para el truco?', '¿tenés algo?', '¿qué tenés?', '¿traés cartas?', '¿tenés con qué?', '¿tenés el ancho?'],
    libres: ['¿cómo venís de cartas?', '¿estás armado?', '¿vale la pena pelear esta?'],
  },
  PREG_QUE_HAGO: {
    reglas: ['¿qué hago?', '¿qué juego?', '¿qué tiro?', '¿cómo juego?', '¿qué hacemos?', '¿qué me decís?'],
    libres: ['decime qué hacer', 'guiame', 'no sé qué jugar'],
  },
  TENGO: {
    reglas: ['tengo 30', 'tengo el ancho', 'tengo buen envido', 'tengo para el truco', 'tengo algo', 'tengo 27 de envido', 'traigo el siete de oro', 'tengo un tres'],
    libres: ['vengo cargado', 'estoy armado', 'vengo bien'],
  },
  NO_TENGO: {
    reglas: ['no tengo nada', 'nada', 'estoy seco', 'ni un poroto', 'no tengo envido', 'no traigo nada', 'no tengo cartas'],
    libres: ['vengo pelado', 'son todas malas', 'basura tengo'],
  },
  CHARLA: {
    reglas: ['jajaja', 'mentiroso', 'vamos todavía', 'son malos', 'te gané', 'qué suerte', 'bien jugado', 'hola', 'suerte'],
    libres: ['qué lindo día para jugar', 'ustedes no saben nada', 'esta noche los barremos'],
  },
};

export function corpusEntries(split: 'reglas' | 'libres' | 'todo' = 'todo'): CorpusEntry[] {
  const out: CorpusEntry[] = [];
  for (const [label, sets] of Object.entries(CORPUS) as [IntentLabel, Corpus[IntentLabel]][]) {
    if (split !== 'libres') out.push(...sets.reglas.map((text) => ({ text, label })));
    if (split !== 'reglas') out.push(...sets.libres.map((text) => ({ text, label })));
  }
  return out;
}
