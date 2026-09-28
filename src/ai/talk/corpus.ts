// Frases etiquetadas de truco rioplatense (para los tests, para entrenar el clasificador del modelo y para
// medir en la tesis). Vocabulario de mesa (Emmanuel, 2026-09-28): decir «truco» o «envido» es cantarlo,
// aunque sea en una pregunta; se pregunta por el «tanto» y se dice «cantá» / «jugá callado».
// - `reglas`: las tiene que entender el intérprete por reglas (test).
// - `ejemplos`: más variantes (lunfardo, sin tildes, como las escribe el reconocimiento de voz), para
//   entrenar el clasificador del modelo junto con `reglas`.
// - `libres`: formas más sueltas que no se usan para entrenar: conjunto de desarrollo
//   (training/lang/eval-intents.ts). Ojo: las escribió el mismo autor que las reglas; la prueba final tiene
//   que ser con frases reales de jugadores.

import type { IntentLabel } from './intents.js';

export interface CorpusEntry {
  text: string;
  label: IntentLabel;
}

type Corpus = Record<IntentLabel, { reglas: string[]; ejemplos: string[]; libres: string[] }>;

export const CORPUS: Corpus = {
  CANTA_TRUCO: {
    reglas: ["truco", "¡Truco!", "quiero retruco", "retruco", "vale cuatro", "quiero vale cuatro", "re truco", "te canto truco", "vale 4", "truco, papá", "cantá truco", "¿tenés para el truco?", "tengo para el truco"],
    ejemplos: ["truco che", "te canto el truco", "truco y a ver qué hacés", "vale cuatro papá", "quiero vale 4", "retruco carajo", "te retruco", "subo a retruco", "que valga cuatro", "le subo al truco", "ahí va el truco", "truco señores", "canto truco", "quiero retruco, dale", "retrucoo", "truuuco", "te digo truco", "truco, a ver", "va el truco", "le meto truco", "mando truco", "truco mi amigo", "vale 4 y a cobrar", "quiero el vale cuatro", "mandale truco", "dale al truco", "cantale truco vos", "¿canto truco?", "¿cantamos truco?", "pedile truco"],
    libres: ["te subo la apuesta", "que valga el doble", "subamos esto a cuatro", "a ver si te animás al truco", "apretalos con el truco"],
  },
  QUIERO: {
    reglas: ["quiero", "¡Quiero!", "sí, quiero", "de una", "acepto", "me la banco", "dale", "venga", "obvio", "sí", "me la juego", "quiero el envido", "acepto el truco"],
    ejemplos: ["quiero, dale", "sí sí, quiero", "de una, quiero", "acepto el envido", "bueno, quiero", "quiero nomás", "está bien, quiero", "quiero che", "dale que va", "sí, va", "me la banco, quiero", "quiero y a ver", "ok quiero", "bueno dale", "sí, acepto", "quiero papá", "vamos, quiero", "venga, quiero", "claro que quiero", "si quiero", "quieroo", "quiero ese envido", "quereme", "quereles"],
    libres: ["va la parada", "juguemos", "le entro", "por supuesto que sí", "hecho"],
  },
  NO_QUIERO: {
    reglas: ["no quiero", "no, no quiero", "ni ahí", "no lo quiero", "no acepto", "me achico", "ni loco", "no va", "no quiero el truco"],
    ejemplos: ["no quiero nada", "no lo quiero che", "nop, no quiero", "ni en pedo", "no me la banco", "no acepto el envido", "nones", "ni a palos", "no quiero, gracias", "no, dejá", "que no, no quiero", "no quiero ese truco", "no quiero envido", "negativo", "nah, no quiero", "ni loco quiero", "mejor no", "no va, no quiero", "no quiero, cobrá", "me achico, no quiero", "no me animo", "no le quieras", "no les quieras"],
    libres: ["paso, no me da", "esta vez no", "no me conviene", "llevatelo", "no da"],
  },
  ENVIDO: {
    reglas: ["envido", "¡Envido!", "envido envido", "te canto envido", "canto envido", "envido, che", "¿tenés envido?"],
    ejemplos: ["envido che", "te canto el envido", "envido y a ver", "canto el envido", "doble envido", "envido papá", "el envido primero", "envido, el envido está primero", "primero el envido", "envidooo", "tiro un envido", "te digo envido", "envido señores", "canto envido primero", "envido mi amigo", "un envido", "mando envido", "envido nomás", "el envido está primero", "¿tenés para el envido?", "tengo envido"],
    libres: ["vamos con los tantos, envite", "a ver esos tantos, envido"],
  },
  REAL_ENVIDO: {
    reglas: ["real envido", "¡Real envido!", "real", "te canto real envido"],
    ejemplos: ["real envido che", "te canto real", "real envido papá", "canto real envido", "real envido nomás", "le subo a real envido", "real envido y a ver", "mando real envido", "real envido primero", "te digo real envido", "quiero real envido", "un real envido", "real envido, dale", "real envido señores"],
    libres: ["subo el tanto: real envido"],
  },
  FALTA_ENVIDO: {
    reglas: ["falta envido", "la falta", "¡Falta envido!", "te canto la falta", "falta"],
    ejemplos: ["falta envido che", "la falta envido", "falta envido y se termina", "canto la falta", "va la falta", "falta envido papá", "le tiro la falta", "la falta, a ver", "mando la falta", "falta envido nomás", "te digo falta envido", "quiero la falta", "subo a la falta", "la falta y chau"],
    libres: ["todo o nada con los tantos, la falta", "va la partida en la falta"],
  },
  MAZO: {
    reglas: ["me voy al mazo", "al mazo", "me voy", "me retiro", "me rindo", "mazo"],
    ejemplos: ["me voy al mazo che", "al mazo nomás", "me voy, llevala", "mazo, no juego", "me retiro de esta", "me tiro al mazo", "al mazo, andá", "me voy al mazo, cobrá", "chau, al mazo", "me rindo, al mazo", "me voy, no da", "mazo y listo", "me mando al mazo", "esta no la juego, me voy"],
    libres: ["esta la dejo", "no juego más esta mano", "suelto las cartas"],
  },
  JUGAR_CARTA: {
    reglas: ["tiro el ancho de espada", "juego el siete de oro", "va el tres de copa", "el cuatro de basto", "tiro la más baja", "juego la más alta", "pongo el rey de oro", "ahí va el macho", "juego el 7 de espada", "tiro la del medio", "el ancho", "va la sota de copa"],
    ejemplos: ["tiro el tres de espada", "juego el dos de copa", "va el siete de espada", "pongo el ancho de basto", "tiro el cuatro", "juego la sota", "ahí va el caballo de oro", "va el rey de copa", "juego el as de espada", "tiro el 6 de oro", "pongo la más baja", "tiro la peor", "juego la mejor", "va la más alta", "tiro el 5 de basto", "juego con el ancho", "largo el siete de oro", "pongo el tres", "tiro el 12", "juego el 11 de espada", "va el dos", "juego el macho", "tiro el sietito", "pongo el siete bravo"],
    libres: ["largo mi peor carta", "bajo la de menos valor", "pongo mi mejor carta"],
  },
  IND_MATA: {
    reglas: ["matá", "mata", "matala", "¡Matala!", "ganala", "pisala", "tirá la más alta", "jugá la más fuerte"],
    ejemplos: ["matala che", "mata esa", "matá esa carta", "pisala vos", "matala que no tengo", "dale matá", "matá compañero", "matala con lo que tengas", "ganala vos", "matá la baza", "tirá tu mejor carta", "jugá la más alta", "matala papá", "matá, matá", "gana vos esta", "pisala con todo", "ganá la primera", "matala si podés", "tirá la grande"],
    libres: ["ganá esta baza", "esta la tenés que ganar vos", "hacé la primera"],
  },
  IND_PASA: {
    reglas: ["pasá", "pasala", "tirá la más baja", "jugá bajo", "dejá pasar", "andá bajo", "echá la más chica"],
    ejemplos: ["pasá compañero", "pasala che", "tirá una baja", "jugá la más chica", "dejá pasar esta", "pasá que la mato yo", "pasá, yo la gano", "tirá la peor", "jugá cualquiera baja", "pasá nomás", "andá abajo", "tirá bajito", "pasala que yo tengo", "echá la más baja", "no la mates, pasá", "dejala pasar", "pasá tranquilo que yo mato", "tirá basura", "pasá con lo peor", "jugá bajo nomás"],
    libres: ["guardate las buenas", "yo la gano, vos tirá cualquiera", "no gastes cartas"],
  },
  IND_PARDA: {
    reglas: ["pardá", "pardala", "empardá", "empardala", "empatá"],
    ejemplos: ["pardala che", "empardá si podés", "pardá compañero", "empardala vos", "hacé parda", "empatala", "pardá esa", "buscá la parda", "empardá la primera", "parda, parda", "pardala si tenés", "hacé que sea parda", "empatá la baza", "andá a la parda"],
    libres: ["igualala", "hacé que quede empatada"],
  },
  IND_TRANQUILO: {
    reglas: ["tranquilo", "jugá tranquilo", "como quieras", "lo que quieras", "jugá libre", "hacé la tuya"],
    ejemplos: ["jugá tranquilo che", "tranqui", "jugá como quieras", "hacé lo que quieras", "jugá a tu gusto", "tranquilo compañero", "jugá libre nomás", "lo que vos quieras", "tranqui, jugá", "hacé la tuya compañero", "como vos veas", "jugá a tu manera", "tranquilo que vamos bien", "dale tranquilo", "hacé lo que te parezca"],
    libres: ["vos sabés", "a tu criterio", "confío en vos"],
  },
  IND_CANTA_TRUCO: {
    reglas: ["cantá", "cantale", "cantales", "cantá vos", "dale cantá", "cantalo"],
    ejemplos: ["cantá che", "cantá compañero", "cantale vos", "dale, cantá", "cantá nomás", "cantá ya", "cantales che", "mandale", "mandales", "cantalo vos", "dale cantá nomás", "cantá compa", "canta", "mandales vos"],
    libres: ["apretalos vos", "que canten ellos no, cantá vos", "decile algo vos"],
  },
  IND_ESPERA: {
    reglas: ["jugá callado", "callado", "no cantes", "esperá", "aguantá", "todavía no", "quieto", "no te apures", "esperate"],
    ejemplos: ["jugá callado che", "jugamos callados", "callado compañero", "no cantes todavía", "aguantá un poco", "todavía no cantes", "quedate quieto", "no digas nada todavía", "esperá que ya va", "no cantes nada", "aguantá compañero", "callado nomás", "no te apures che", "calma, esperá", "no cantes vos", "esperá la segunda", "callados"],
    libres: ["frená un poco", "dejá, no digas nada", "shh por ahora"],
  },
  IND_CANTA_TANTO: {
    reglas: ["cantá el tanto", "cantá tanto", "cantale el tanto", "cantá los tantos"],
    ejemplos: ["cantá el tanto che", "cantá vos el tanto", "dale, cantá el tanto", "cantá tanto compañero", "cantale los tantos", "cantá el tanto nomás", "cantá tanto que tengo", "cantalo el tanto", "cantá los tantos ya", "dale al tanto"],
    libres: ["andá por los puntos", "jugate los tantos"],
  },
  IND_CALLADO_TANTO: {
    reglas: ["callado el tanto", "no cantes tanto", "no cantes el tanto", "el tanto no"],
    ejemplos: ["callado con el tanto", "no cantes los tantos", "el tanto no, eh", "callado el tanto che", "no cantes tanto todavía", "con el tanto callado", "tanto no", "no canten el tanto", "callate el tanto"],
    libres: ["los puntos dejalos", "de los puntos ni hablar"],
  },
  SUBILE: {
    reglas: ["subile", "subí", "subila", "dale más"],
    ejemplos: ["subile che", "subile compañero", "subí vos", "subamos", "dale más alto", "subile que tenemos", "subí nomás", "subile la apuesta", "subila che"],
    libres: ["redoblá", "aumentale"],
  },
  PREG_TANTO: {
    reglas: ["¿tenés tanto?", "¿cuántos tenés?", "¿tenés tantos?", "¿cuánto tenés de tanto?", "y vos, ¿cuántos tenés?", "¿tenés treinta?"],
    ejemplos: ["¿tenés tanto compañero?", "che, ¿tenés tantos?", "¿cuánto tenés?", "¿tenés tanto o no?", "¿estás bien de tanto?", "¿cuántos puntos tenés?", "¿tenés algo de tanto?", "¿vos tenés tanto?", "¿cuánto de tanto?", "¿cómo estás de tanto?", "¿tenés flor?", "¿tenés 27?", "¿traés tanto?", "¿cuántos traés?"],
    libres: ["¿cómo venís de puntos?", "decime tus tantos", "¿estás bien de puntos?"],
  },
  PREG_CARTAS: {
    reglas: ["¿tenés algo?", "¿cómo venís?", "¿traés cartas?", "¿tenés con qué?", "¿tenés el ancho?", "¿tenés cartas?", "¿tienen algo?", "¿qué tenés?", "¿qué te queda?"],
    ejemplos: ["¿tenés algo compañero?", "¿qué tenés vos?", "¿tenés alguna buena?", "¿tenés el ancho de espada?", "¿tenés un tres?", "¿venís bien?", "¿traés algo?", "¿tenés algo grande?", "¿qué cartas tenés?", "¿tenés el siete?", "¿tenés para matar?", "¿cómo andás?", "¿estás armado?", "¿qué les queda?", "¿cómo vienen?", "¿qué tienen?", "que te queda", "¿te queda algo?", "¿tienen para matar?"],
    libres: ["¿vale la pena pelear esta?", "¿cómo viene la mano?", "contame qué tenés"],
  },
  PREG_CANTO: {
    reglas: ["¿canto?", "¿cantamos?", "¿lo canto?", "¿canto o no?"],
    ejemplos: ["¿canto yo?", "¿cantamos o no?", "¿canto compañero?", "che, ¿canto?", "¿cantamos ya?", "¿lo cantamos?", "¿cantás vos o canto yo?"],
    libres: ["¿le digo algo?", "¿los apuro?"],
  },
  PREG_CANTO_TANTO: {
    reglas: ["¿canto tanto?", "¿canto el tanto?", "¿cantamos el tanto?", "¿canto los tantos?"],
    ejemplos: ["¿canto tanto o no?", "che, ¿canto el tanto?", "¿canto tanto compañero?", "¿lo canto el tanto?", "¿cantamos tanto?", "¿canto yo el tanto?", "¿canto los tantos o no?"],
    libres: ["¿voy por los puntos?", "¿nos jugamos los puntos?"],
  },
  PREG_QUE_HAGO: {
    reglas: ["¿qué hago?", "¿qué juego?", "¿qué tiro?", "¿cómo juego?", "¿qué hacemos?", "¿qué me decís?"],
    ejemplos: ["¿qué hago compañero?", "¿qué tiro ahora?", "¿cómo juego esta?", "¿qué hacemos che?", "¿qué me decís vos?", "¿qué carta tiro?", "¿mato o paso?", "¿qué hago con esta?", "¿juego alta o baja?", "¿qué me indicás?", "¿cómo seguimos?", "¿qué conviene?"],
    libres: ["decime qué hacer", "guiame", "no sé qué jugar"],
  },
  TENGO: {
    reglas: ["tengo 30", "tengo el ancho", "tengo buen tanto", "tengo algo", "tengo 27", "traigo el siete de oro", "tengo un tres", "tengo tanto"],
    ejemplos: ["tengo 33", "tengo treinta", "tengo 28", "tengo el ancho de espada", "tengo el siete de oro", "tengo dos tres", "tengo buenas cartas", "tengo mucho tanto", "tengo algo bueno", "tengo el macho", "tengo la hembra", "traigo el ancho", "tengo cartas", "tengo flor", "tengo 31", "tengo con qué", "tengo tantos", "me queda el ancho", "me queda un tres"],
    libres: ["vengo cargado", "estoy armado", "vengo bien"],
  },
  NO_TENGO: {
    reglas: ["no tengo nada", "nada", "estoy seco", "ni un poroto", "no tengo tanto", "no traigo nada", "no tengo cartas"],
    ejemplos: ["no tengo nada che", "no tengo ni un tanto", "nada de nada", "no tengo cartas buenas", "estoy seco compañero", "no traigo tanto", "ni un poroto tengo", "tengo cualquier cosa", "no tengo ninguna buena", "nada, todo malo", "tengo nada", "no tengo tantos", "no me queda nada"],
    libres: ["vengo pelado", "son todas malas", "basura tengo"],
  },
  CHARLA: {
    reglas: ["jajaja", "mentiroso", "vamos todavía", "son malos", "te gané", "qué suerte", "bien jugado", "hola", "suerte"],
    ejemplos: ["jaja", "jajaja muy bien", "mentiroso vos", "hola a todos", "qué suerte tenés", "te gané che", "son malísimos", "qué mano", "suerte muchachos", "chau", "buenas noches", "no me mientas", "qué manera de mentir"],
    libres: ["qué lindo día para jugar", "ustedes no saben nada", "esta noche los barremos"],
  },
};

/**
 * `entrenamiento` = reglas + ejemplos (lo que ve el clasificador del modelo); `libres` = desarrollo;
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
