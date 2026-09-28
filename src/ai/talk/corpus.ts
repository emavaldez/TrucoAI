// Frases etiquetadas de truco rioplatense (para los tests, para los ejemplos del modelo y para medir
// en la tesis).
// - `reglas`: las tiene que entender el intérprete por reglas (test).
// - `ejemplos`: más variantes (lunfardo, sin tildes, como las escribe el reconocimiento de voz), para
//   entrenar/armar el clasificador del modelo junto con `reglas`.
// - `libres`: formas más sueltas que no se usan para entrenar: para medir (training/lang/eval-intents.ts).
//   Ojo: las escribió el mismo autor que las reglas; la prueba final tiene que ser con frases reales.

import type { IntentLabel } from './intents.js';

export interface CorpusEntry {
  text: string;
  label: IntentLabel;
}

type Corpus = Record<IntentLabel, { reglas: string[]; libres: string[]; ejemplos: string[] }>;

export const CORPUS: Corpus = {
  CANTA_TRUCO: {
    reglas: ['truco', '¡Truco!', 'quiero retruco', 'retruco', 'vale cuatro', 'quiero vale cuatro', 're truco', 'te canto truco', 'vale 4', 'truco, papá'],
    libres: ['te subo la apuesta', 'vamos por más', 'que valga el doble', 'subamos esto', 'a ver si te animás a más'],
    ejemplos: ["truco che", "te canto el truco", "truco y a ver qué hacés", "vale cuatro papá", "quiero vale 4", "retruco carajo", "te retruco", "subo a retruco", "que valga cuatro", "le subo al truco", "ahí va el truco", "truco señores", "canto truco", "quiero retruco, dale", "retrucoo", "truuuco", "te digo truco", "truco, a ver", "va el truco", "le meto truco", "mando truco", "truco mi amigo", "vale 4 y a cobrar", "subo la apuesta a retruco", "quiero el vale cuatro"],
  },
  QUIERO: {
    reglas: ['quiero', '¡Quiero!', 'sí, quiero', 'de una', 'acepto', 'me la banco', 'dale', 'venga', 'obvio', 'sí', 'me la juego', 'quiero el envido'],
    libres: ['va la parada', 'la acepto', 'juguemos', 'le entro', 'por supuesto que sí', 'hecho'],
    ejemplos: ["quiero, dale", "sí sí, quiero", "de una, quiero", "acepto el truco", "acepto el envido", "bueno, quiero", "quiero nomás", "está bien, quiero", "quiero che", "dale que va", "sí, va", "me la banco, quiero", "quiero y a ver", "ok quiero", "bueno dale", "sí, acepto", "quiero papá", "vamos, quiero", "venga, quiero", "claro que quiero", "si quiero", "quieroo", "quiero ese envido"],
  },
  NO_QUIERO: {
    reglas: ['no quiero', 'no, no quiero', 'ni ahí', 'no lo quiero', 'no acepto', 'me achico', 'ni loco', 'no va'],
    libres: ['paso, no me da', 'esta vez no', 'no me conviene', 'llevatelo', 'no da'],
    ejemplos: ["no, no quiero", "no quiero nada", "no lo quiero che", "nop, no quiero", "ni en pedo", "no me la banco", "no acepto el truco", "no acepto el envido", "nones", "ni a palos", "no quiero, gracias", "no, dejá", "que no, no quiero", "no quiero ese truco", "no quiero envido", "negativo", "nah, no quiero", "ni loco quiero", "mejor no", "no va, no quiero", "no quiero, cobrá", "me achico, no quiero", "no me animo"],
  },
  ENVIDO: {
    reglas: ['envido', '¡Envido!', 'envido envido', 'te canto envido', 'canto envido', 'envido, che'],
    libres: ['vamos con los tantos', 'a ver esos tantos', 'juguemos los puntos'],
    ejemplos: ["envido che", "te canto el envido", "envido y a ver", "canto el envido", "envido envido", "doble envido", "envido papá", "el envido primero", "envido, el envido está primero", "primero el envido", "envidooo", "tiro un envido", "te digo envido", "envido señores", "canto envido primero", "envido mi amigo", "un envido", "mando envido", "envido nomás", "el envido está primero"],
  },
  REAL_ENVIDO: {
    reglas: ['real envido', '¡Real envido!', 'real', 'te canto real envido'],
    libres: ['subo el tanto a tres'],
    ejemplos: ["real envido che", "te canto real", "real envido papá", "canto real envido", "real envido nomás", "le subo a real envido", "real envido y a ver", "mando real envido", "real envido primero", "te digo real envido", "quiero real envido", "un real envido", "real envido, dale", "subo con real", "real envido señores"],
  },
  FALTA_ENVIDO: {
    reglas: ['falta envido', 'la falta', '¡Falta envido!', 'te canto la falta', 'falta'],
    libres: ['todo o nada con los tantos', 'va la partida en los tantos'],
    ejemplos: ["falta envido che", "te canto la falta", "la falta envido", "falta envido y se termina", "canto la falta", "va la falta", "falta envido papá", "le tiro la falta", "la falta, a ver", "mando la falta", "falta envido nomás", "te digo falta envido", "quiero la falta", "subo a la falta", "la falta y chau"],
  },
  MAZO: {
    reglas: ['me voy al mazo', 'al mazo', 'me voy', 'me retiro', 'me rindo', 'mazo'],
    libres: ['esta la dejo', 'no juego más esta mano', 'suelto las cartas'],
    ejemplos: ["me voy al mazo che", "al mazo nomás", "me voy, llevala", "mazo, no juego", "me retiro de esta", "me tiro al mazo", "al mazo, andá", "me voy al mazo, cobrá", "chau, al mazo", "abandono", "me rindo, al mazo", "me voy, no da", "mazo y listo", "me mando al mazo", "esta no la juego, me voy"],
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
    ejemplos: ["tiro el tres de espada", "juego el dos de copa", "va el siete de espada", "pongo el ancho de basto", "tiro el cuatro", "juego la sota", "ahí va el caballo de oro", "va el rey de copa", "juego el as de espada", "tiro el 6 de oro", "pongo la más baja", "tiro la peor", "juego la mejor", "va la más alta", "tiro el 5 de basto", "juego con el ancho", "largo el siete de oro", "pongo el tres", "tiro el 12", "juego el 11 de espada", "va el dos", "tiro la del medio", "juego el macho", "tiro el sietito", "pongo el siete bravo"],
  },
  IND_MATA: {
    reglas: ['matá', 'mata', 'matala', '¡Matala!', 'ganala', 'pisala', 'tirá la más alta', 'jugá la más fuerte'],
    libres: ['ganá esta baza', 'esta la tenés que ganar vos', 'hacé la primera'],
    ejemplos: ["matala che", "mata esa", "matá esa carta", "pisala vos", "matala que no tengo", "dale matá", "matá compañero", "matala con lo que tengas", "ganala vos", "matá la baza", "tirá tu mejor carta", "jugá la más alta", "matala papá", "matá, matá", "gana vos esta", "pisala con todo", "ganá la primera", "matala si podés", "tirá la grande"],
  },
  IND_PASA: {
    reglas: ['pasá', 'pasala', 'tirá la más baja', 'jugá bajo', 'dejá pasar', 'andá bajo', 'echá la más chica'],
    libres: ['guardate las buenas', 'yo la gano, vos tirá cualquiera', 'no gastes cartas'],
    ejemplos: ["pasá compañero", "pasala che", "tirá una baja", "jugá la más chica", "dejá pasar esta", "pasá que la mato yo", "pasá, yo la gano", "tirá la peor", "jugá cualquiera baja", "pasá nomás", "andá abajo", "tirá bajito", "pasala que yo tengo", "echá la más baja", "no la mates, pasá", "dejala pasar", "pasá tranquilo que yo mato", "tirá basura", "pasá con lo peor", "jugá bajo nomás"],
  },
  IND_PARDA: {
    reglas: ['pardá', 'pardala', 'empardá', 'empardala', 'empatá'],
    libres: ['igualala', 'hacé que quede empatada'],
    ejemplos: ["pardala che", "empardá si podés", "pardá compañero", "empardala vos", "hacé parda", "empatala", "pardá esa", "buscá la parda", "empardá la primera", "parda, parda", "pardala si tenés", "hacé que sea parda", "empatá la baza", "andá a la parda"],
  },
  IND_TRANQUILO: {
    reglas: ['tranquilo', 'jugá tranquilo', 'como quieras', 'lo que quieras', 'jugá libre', 'hacé la tuya'],
    libres: ['vos sabés', 'a tu criterio', 'confío en vos'],
    ejemplos: ["jugá tranquilo che", "tranqui", "jugá como quieras", "hacé lo que quieras", "jugá a tu gusto", "tranquilo compañero", "jugá libre nomás", "lo que vos quieras", "tranqui, jugá", "hacé la tuya compañero", "como vos veas", "jugá a tu manera", "tranquilo que vamos bien", "dale tranquilo", "hacé lo que te parezca"],
  },
  IND_CANTA_TRUCO: {
    reglas: ['cantá truco', 'cantale truco', 'mandale truco', 'dale al truco', 'tirale truco', 'metele truco', 'mandá el truco'],
    libres: ['apretalos con el truco', 'que canten ellos no, cantá vos'],
    ejemplos: ["cantá truco che", "cantale el truco", "mandale el truco vos", "dale, cantá truco", "cantá vos el truco", "tirale el truco", "metele truco compañero", "cantá el truco ya", "mandales truco", "pedí truco", "cantales truco", "dale con el truco", "cantá truco que tenemos", "mandá truco nomás", "cantalo vos"],
  },
  IND_ESPERA: {
    reglas: ['esperá', 'no cantes', 'aguantá', 'todavía no', 'quieto', 'pará', 'no te apures', 'esperate'],
    libres: ['frená un poco', 'dejá, no digas nada', 'callado por ahora'],
    ejemplos: ["esperá che", "no cantes todavía", "aguantá un poco", "todavía no cantes", "quedate quieto", "no digas nada todavía", "esperá que ya va", "pará un poco", "no cantes nada", "aguantá compañero", "esperá, no cantes truco", "no te apures che", "calma, esperá", "no cantes vos", "esperá la segunda"],
  },
  PREG_ENVIDO: {
    reglas: ['¿tenés envido?', '¿cuántos tenés?', 'tenés tantos?', '¿tenés para el envido?', '¿cuánto tenés de envido?', 'y vos cuántos tenés?'],
    libres: ['¿cómo venís de puntos?', '¿estás bien de tantos?', 'decime tus tantos'],
    ejemplos: ["¿tenés envido compañero?", "che, ¿tenés tantos?", "¿cuántos tenés?", "¿tenés para el envido?", "¿cuánto tenés?", "¿tenés envido o no?", "¿estás bien de envido?", "¿cuántos puntos tenés?", "¿tenés algo de envido?", "¿vos tenés envido?", "¿tenés tantos para cantar?", "¿cuánto de envido?", "¿tenés treinta?", "¿cómo estás de tantos?", "¿tenés flor?"],
  },
  PREG_TRUCO: {
    reglas: ['¿tenés para el truco?', '¿tenés algo?', '¿qué tenés?', '¿traés cartas?', '¿tenés con qué?', '¿tenés el ancho?'],
    libres: ['¿cómo venís de cartas?', '¿estás armado?', '¿vale la pena pelear esta?'],
    ejemplos: ["¿tenés algo compañero?", "¿tenés cartas?", "¿qué tenés vos?", "¿tenés para el truco?", "¿tenés alguna buena?", "¿tenés el ancho de espada?", "¿tenés un tres?", "¿estás para el truco?", "¿venís bien?", "¿tenés con qué pelear?", "¿traés algo?", "¿tenés algo grande?", "¿qué cartas tenés?", "¿tenés el siete?", "¿tenés para matar?"],
  },
  PREG_QUE_HAGO: {
    reglas: ['¿qué hago?', '¿qué juego?', '¿qué tiro?', '¿cómo juego?', '¿qué hacemos?', '¿qué me decís?'],
    libres: ['decime qué hacer', 'guiame', 'no sé qué jugar'],
    ejemplos: ["¿qué hago compañero?", "¿qué juego?", "¿qué tiro ahora?", "¿cómo juego esta?", "¿qué hacemos che?", "¿qué me decís vos?", "¿qué carta tiro?", "¿qué querés que haga?", "¿mato o paso?", "¿qué hago con esta?", "¿canto o no?", "¿juego alta o baja?", "¿qué me indicás?", "¿cómo seguimos?", "¿qué conviene?"],
  },
  TENGO: {
    reglas: ['tengo 30', 'tengo el ancho', 'tengo buen envido', 'tengo para el truco', 'tengo algo', 'tengo 27 de envido', 'traigo el siete de oro', 'tengo un tres'],
    libres: ['vengo cargado', 'estoy armado', 'vengo bien'],
    ejemplos: ["tengo 33", "tengo treinta", "tengo 28 de envido", "tengo el ancho de espada", "tengo el siete de oro", "tengo un tres", "tengo dos tres", "tengo buenas cartas", "tengo para el truco", "tengo envido", "tengo buen tanto", "tengo algo bueno", "tengo el macho", "tengo la hembra", "traigo el ancho", "tengo cartas", "tengo flor", "tengo 31", "tengo algo", "tengo con qué"],
  },
  NO_TENGO: {
    reglas: ['no tengo nada', 'nada', 'estoy seco', 'ni un poroto', 'no tengo envido', 'no traigo nada', 'no tengo cartas'],
    libres: ['vengo pelado', 'son todas malas', 'basura tengo'],
    ejemplos: ["no tengo nada che", "no tengo ni un tanto", "nada de nada", "no tengo cartas buenas", "estoy seco compañero", "no traigo nada", "no tengo envido", "no tengo para el truco", "ni un poroto tengo", "tengo cualquier cosa", "no tengo ninguna buena", "nada, todo malo", "tengo nada", "sin cartas"],
  },
  CHARLA: {
    reglas: ['jajaja', 'mentiroso', 'vamos todavía', 'son malos', 'te gané', 'qué suerte', 'bien jugado', 'hola', 'suerte'],
    libres: ['qué lindo día para jugar', 'ustedes no saben nada', 'esta noche los barremos'],
    ejemplos: ["jaja", "jajaja muy bien", "mentiroso vos", "hola a todos", "qué suerte tenés", "bien jugado", "te gané che", "son malísimos", "qué mano", "suerte muchachos", "chau", "buenas noches", "qué partido", "tranquilos que remontamos", "no me mientas", "qué manera de mentir", "dale que es tarde", "qué calor hace"],
  },
};

/**
 * `entrenamiento` = reglas + ejemplos (lo que ve el clasificador del modelo); `libres` = prueba;
 * `todo` = todo junto.
 */
export function corpusEntries(split: 'reglas' | 'ejemplos' | 'libres' | 'entrenamiento' | 'todo' = 'todo'): CorpusEntry[] {
  const out: CorpusEntry[] = [];
  for (const [label, sets] of Object.entries(CORPUS) as [IntentLabel, Corpus[IntentLabel]][]) {
    if (split === 'reglas' || split === 'entrenamiento' || split === 'todo') out.push(...sets.reglas.map((text) => ({ text, label })));
    if (split === 'ejemplos' || split === 'entrenamiento' || split === 'todo') out.push(...sets.ejemplos.map((text) => ({ text, label })));
    if (split === 'libres' || split === 'todo') out.push(...sets.libres.map((text) => ({ text, label })));
  }
  return out;
}
