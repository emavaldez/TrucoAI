# Bitácora del entrenamiento de TrucoAI

Registro cronológico de lo que se hizo, por qué y qué salió. Horas en Argentina (UTC−3).
Los datos crudos de cada corrida están en `results/runs/<corrida>/` (configuración, manifiesto,
`log.jsonl.gz` con una línea por iteración, `stdout.log.gz` y `summary.json`); los duelos entre redes, en
`results/duelos.jsonl`. El código de cada momento se recupera con el commit que figura en cada entrada
(y, desde el 2026-09-26, en cada evento `start` del log).

## Cómo se registra

- **En git (para siempre):** código, configuraciones (`config/`), esta bitácora, resúmenes por corrida
  (`results/<corrida>.md`), registro de cada corrida (`results/runs/`) y duelos (`results/duelos.jsonl`).
- **Solo en la Mac:** `runs/<corrida>/` con las redes (`policies/`, 1,4 MB cada una), checkpoints y datos de
  imitación (6 GB). Para respaldarlo fuera del repo: `run.py archive --run <corrida> --backup <carpeta>`.
- Después de cada corrida: `python training/learner/run.py archive --run <corrida>` y una entrada acá.
- Cada comparación entre redes: `python training/learner/run.py duel --a ... --b ... --note "para qué"`.

---

## 2026-09-25 — Plan

- **Plan v2** (`PLAN.md`, commit `df0ff80`) después de leer los papers de `Papers Truco` y `Papers Futbol`.
  Decisiones: recompensa = cambio en la probabilidad de ganar la partida (no diferencia de puntos, como la
  tesis uruguaya); PPO con liga (no Deep Monte Carlo solo); imitación de la heurística difícil primero y KL
  hacia ella; evaluación con partidas duplicadas e IC 90%; una sola codificación en TypeScript para
  entrenamiento y juego.
- **Decisiones de Emmanuel:** siempre sin flor; entrenar en su MacBook Pro M5 Max (18 núcleos, GPU de 40,
  128 GB); resultados a prueba de cortes; el pie coordina al equipo y es el único que canta envido.

## 2026-09-25 — Implementación y prueba chica (commit `31214e8`)

- Observación de 1006 valores (huella `78d8b04c`), 12 acciones con máscara, red 1006→256→256→128→12
  (358.028 parámetros), crítico asimétrico que ve las cartas de todos (solo en entrenamiento).
- Paridad PyTorch ↔ TypeScript: diferencia máxima 1,3e-8.
- Prueba chica en la nube (2 núcleos): imitación 31% contra la difícil; PPO 66,5% (IC90 62,5–70,3) en 400
  partidas después de 16 iteraciones chicas.

## 2026-09-25 16:55 — r1 (2 jugadores, sin flor)

Configuración: `results/runs/r1/config.json`. 16 actores Node + red en la GPU (MPS), ~17–20 mil decisiones/s.

| Fase | Resultado |
|---|---|
| Tabla W | 8.000 partidas difícil vs difícil, 164.628 manos |
| Datos de imitación | 100.000 partidas, 6,41 M decisiones (8,5 min) |
| Imitación | 8 épocas, 92,4% de acierto en validación; **49,8%** contra la difícil (IC90 48,5–51,1, 4.000 partidas) |
| PPO | 1.500 iteraciones de 4.096 partidas, 17:05 → 02:38 del 26 |

- 17:58 (commit `08637f5`): se suman entropía por tipo de decisión, métricas de estilo y la prueba de
  explotabilidad; r1 se reinicia a las 18:04 desde su último checkpoint (sin perder nada). Desde la
  iteración 177 hay entropía por decisión en el log.
- 18:28 (commit `84ea7d3`): se suma el farol de envido; r1 se reinicia a las 18:48. Desde la iteración 276
  hay métricas de envido.
- Contra la difícil: 86,4% en la iteración 40 y después 81–86% hasta el final (1500: 83,4%). La medida se
  saturó. Como la "mejor red" se elegía por esa medida, quedó elegida la 40.

## 2026-09-25 18:05 — Explotabilidad de la 40 (`r1-br-r1-iter40`)

Red nueva entrenada solo contra la 40 congelada. En 40 iteraciones le ganaba **71,7%** (IC90 69,3–74,0) y
seguía subiendo; se cortó en la 45 para usar la máquina en la siguiente prueba. Conclusión: la 40 era
muy explotable.

## 2026-09-25 18:48 — Explotabilidad de la 270 (`r1-br-r1-iter270`)

150 iteraciones: **65,9%** al final, todavía subiendo despacio. Lo que explotó: el envido. La atacante
terminó cantando envido el 93% de las veces que podía (la mitad con 23 o menos) y la 270 decía "no quiero"
de más.

## 2026-09-26 11:40 — Duelos entre versiones de r1 (`results/duelos.jsonl`)

| Duelo | Gana la primera | IC90 |
|---|---|---|
| 1500 vs 750 | 54,1% | 51,2–57,0 |
| 1500 vs 270 | 63,0% | 60,2–65,8 |
| 1500 vs 40 | 74,8% | 72,1–77,2 |
| 270 vs 40 | 67,1% | 64,3–69,8 |
| atacante de la 270 vs 1500 | 41,5% | 38,7–44,4 |
| atacante de la 40 vs 1500 | 30,5% | 27,9–33,2 |
| atacante de la 40 vs 270 | 41,1% | 38,3–44,0 |

Conclusiones: r1 siguió mejorando toda la corrida aunque contra la difícil no se viera; la liga cerró los
agujeros que habían encontrado las atacantes viejas. Lección: elegir la mejor red por duelos contra redes
fijas, no contra la heurística.

## 2026-09-26 11:59 — Métricas del resultado del envido (commit `1a5d47e`) y explotabilidad de la 1500

- Nuevas métricas: cuánto acepta el envido según los tantos; de los envidos cantados con ≤23 (farol) y con
  24+, en cuántos el rival no quiso, puntos de envido netos y ΔW por mano.
- Primer vistazo (150 partidas de la 1500): farol 59% de éxito, −0,19 puntos, ΔW ≈ 0; con tantos +0,96
  puntos, ΔW +0,038. Acepta envido con <24 el 19%.
- `r1-br-r1-iter1500`, 150 iteraciones: **69,9%** (IC90 67,5–72,2), estable desde la iteración 110.
  Lo que explotó: el truco. La atacante pasó de 32% a 74% de farol de truco y de 39% a 67% de "quiero" al
  truco: la 1500 se deja correr con el truco y a la vez miente de más. En el envido aguanta: a la atacante
  mentir en el envido le cuesta (ΔW −0,007) y no le caza los faroles (acepta con <24 el 7%).

## 2026-09-26 13:01 — r2 (commit `1acc2df`, código de r2 en `5a78ee5`)

Sigue r1 desde la 1500 hasta la 2000 con las tres atacantes como rivales fijos de la liga (15% de las
partidas) y la mejor red elegida por duelos contra la 1500 de r1 y las atacantes de la 1500 y la 270
(`config/r2.json`). Terminó a las 15:57 (500 iteraciones, ~3 h). Detalle en `results/r2.md`.

| Iteración | vs 1500 de r1 | vs atacante de la 1500 | vs atacante de la 270 |
|---|---|---|---|
| 1510 | 51,6% | 58,1% | 62,0% |
| 1560 | 51,1% | 70,8% | 68,1% |
| 2000 | 52,3% | 66,0% | 72,6% |

- El agujero del truco se tapó en ~60 iteraciones (la 1500 perdía 30–70 con la atacante; r2 le gana 66–34).
- Contra la 1500 de r1, +2 puntos; contra la difícil, igual (82–86%).
- Desde la 1560 los duelos quedan planos (62–64% de promedio): las 500 iteraciones sobraron. La "mejor"
  quedó en la 1530 por ruido.
- Estilo: quiere el truco 47% (antes 41%); el resto casi igual.

## 2026-09-26 18:43 — Error en la prueba de explotabilidad de r2 (arreglado en `1a79a01`)

La prueba heredaba de r2 el `init` (seguir desde r1 iteración 1500): arrancaba en la 1500 con tope 150 y
cortaba sin entrenar. Se arregló para que la atacante arranque siempre de la red de imitación y juegue
solo contra la objetivo, sin atacantes ni duelos de la corrida madre. El intento fallido quedó como un
evento `start` más en el log de `r2-br-r2-iter2000`.

## 2026-09-26 19:16 — Explotabilidad de r2 iteración 2000 (`r2-br-r2-iter2000`)

Mismo presupuesto que las pruebas anteriores (150 iteraciones, 500 pares por evaluación):

| Iteración de la atacante | contra r1 1500 | contra r2 2000 |
|---|---|---|
| 50 | 44,1% | 40,1% |
| 100 | 63,0% | 46,7% |
| 150 | 69,9% | **51,1%** (IC90 48,5–53,7) |

La atacante apenas llega a empatar, y sin una estrategia clara: farol de truco 40% y quiere truco 41%
(la de r1 había llegado a 74% y 68%). **r2 es mucho menos explotable que r1 1500**, al menos con este
presupuesto de ataque: la curva seguía subiendo despacio (+0,5 puntos cada 10 iteraciones), así que es
una cota inferior, no una prueba de que no tenga agujeros.

## 2026-09-26 21:00 — Fase 4: equipos (r3 preparada)

Decisiones de Emmanuel: el pie aprende qué indicar; los compañeros aprenden a obedecer con un premio que
baja a un mínimo; señas fijas y verdaderas; 4 y 6 jugadores sin pica-pica (y 20% de 2). Detalle en
`PLAN.md` (sección "Fase 4").

- La lógica de señas e indicaciones sale de GameController a `src/ai/tableTalk.ts`: el juego y el
  entrenamiento usan la misma.
- 19 acciones (7 de indicaciones del pie); la observación no cambia (huella `78d8b04c`).
- Premio por obedecer: ±1 por indicación cumplida o no, por 0,02 → 0,005 en 500 iteraciones.
- `config/r3.json`: desde r2 (2000), tablas W de 4 y 6, imitación de la difícil en 4 y 6 (30.000 partidas),
  PPO 1000 iteraciones de 2048 partidas (20% de 2, 40% de 4, 40% de 6), evaluación cada 20 contra la
  difícil en 2, 4 y 6.
- Probado de punta a punta en la nube con una corrida mínima.


## 2026-09-27 21:22 → 2026-09-28 04:06 — r3 (equipos, commit `f3b7968`)

Detalle en `results/r3.md`. Sin cortes, 1000 iteraciones.

- La imitación en 4 y 6 (desde r2) arrancó en 41% contra equipos de difíciles; en 20 iteraciones de PPO
  pasó la meta de 55%, y la mejor (560) llegó a **74,7% en 4 y 82,2% en 6**. Desde la ~120 queda plana.
- El pie indica "¡matá!" ~40%, "tranquilo" ~37%, "pasá" ~24% y nunca "pardá"; de truco casi nunca pide
  cantar (1–3%). Los compañeros obedecen ~95% aun con el premio en su mínimo.
- En 2 jugadores bajó de 82–86% (r2) a 73–80%: la imitación en 4 y 6 le hizo olvidar parte de lo de 2.

## 2026-09-28 — Duelo r3 vs r2 en 2 jugadores y fase 5 (la red en el juego)

- Duelo en 2 jugadores, 1000 pares: r3 le gana a r2 el **48,2%** (IC90 46,4–50,0). La caída de r3 contra la
  difícil en 2 jugadores exageraba: pierde apenas contra r2. En el juego, 2 jugadores usa r2.
- Nivel **Experta** en el juego: r2 en 2 jugadores, r3 en 4 y 6 (compañeros incluidos), difícil de respaldo con
  flor o pica-pica. Modo **consejos de la red** (% por opción en tu turno). Detalle en `PLAN.md` (fase 5).
- Próximo (idea de Emmanuel): hablarle o escribirle a la IA (compañero o rival) y que actúe en consecuencia.

## 2026-09-28 — Hablarle a la mesa (texto y voz)

Idea de Emmanuel: hablarle o escribirle a la IA (compañero o rival) y que actúe en consecuencia.

- Se evaluó **Jev** (TypeSafe, "System One Model": texto → la opción más probable de una lista cerrada, con
  probabilidades calibradas). Es una API cerrada, en la nube y en acceso anticipado, sin español declarado: no
  sirve para un juego web sin servidor. Queda como posible punto de comparación.
- Se eligió **EmbeddingGemma** (Google, abierto, 308 M parámetros, < 200 MB cuantizado, 100+ idiomas, corre en el
  navegador con Transformers.js) como clasificador de lista cerrada: vecino más parecido del corpus + softmax.
- Decisiones de Emmanuel: **todo lo que se dice es público**; voz con el reconocimiento de Chrome primero
  (Whisper local, después).
- Diseño: 20 intenciones (`src/ai/talk/intents.ts`); primero **reglas** (instantáneas, testeadas), después el
  modelo si está activo; si el modelo da < 50%, no actúa y pregunta. Las respuestas de los compañeros son
  verdaderas y en términos de seña, así la red (que no ve lenguaje) sigue siendo consistente con lo que aprendió.
- Corpus etiquetado: 146 frases de referencia (las reglas aciertan 146/146) y 62 libres (las reglas entienden
  4/62: es lo que tiene que cubrir el modelo). La medición del modelo corre en la Mac (`training/lang/eval-intents.ts`).

## 2026-09-28 11:50 — Primera medición del lenguaje (`results/intents-eval-v1.json`)

Corrida en la Mac con EmbeddingGemma q4 (vecino más parecido, banco = todo el corpus, leave-one-out):

| | Referencia (146) | Libres (62) |
|---|---|---|
| Reglas | 100% | 6% bien, 10% mal, 84% sin entender |
| EmbeddingGemma (vecino) | 53% (todo el corpus) | 32% |
| Combinado (T = 0,05) | — | 15% bien, 18% mal, 68% pregunta de nuevo |

- T = 0,05 es la mejor calibrada (ECE 0,10); el problema es el acierto: con 8–12 ejemplos por intención el vecino
  más parecido agrupa por *tema* (envido, truco) más que por *acto de habla* (cantar, preguntar, afirmar, ordenar).
- Las reglas se equivocaban con seguridad en 6 libres (esas nunca llegan al modelo).

Cambios (v2):
- `ejemplos`: 356 frases más para entrenar (lunfardo, sin tildes, como las escribe el reconocimiento de voz); las
  libres quedan solo para probar (se sacaron del entrenamiento las casi idénticas a una libre).
- Clasificador entrenado sobre los vectores (regresión logística, validación cruzada de 5 partes), que el juego
  usa en vez del vecino más parecido (`public/models/intent-head.json`).
- Reglas más prudentes (preguntas solo con signo o empezando como pregunta, números sueltos no son cartas,
  órdenes al principio de la frase mandan, charla solo con marcas claras). Ojo: se ajustaron mirando los errores
  en las libres, así que las libres pasan a ser conjunto de *desarrollo*; la prueba final tiene que ser con frases
  reales de jugadores.


## 2026-09-28 — Mesa en equipo: consultas, engaño y esperar y subir (juego, sin reentrenar)

Pedido de Emmanuel después de probar el juego: en 4 y 6 se consulta al pie y se decide en equipo; decir
«envido» o «truco» ya es cantarlo (al compañero se le pregunta «¿tenés tanto?» y se le dice «cantá» / «jugá
callado»); el pie siempre pregunta si canta el tanto; y la jugada de **esperar y subir**: si el pie sabe (por la
seña) que el equipo tiene mucho tanto y al pie rival le falta jugar, no canta, el compañero dice en voz alta que no
tiene nada, el rival se anima a cantar y el pie le sube (2 tantos seguros si no quiere, 4 o más si quiere, contra 1
si el pie cantaba directo).

Decisiones de Emmanuel: desde la 2da baza cualquiera indica y cualquiera contesta; los rivales de la IA escuchan;
los compañeros de la IA también mienten; el pie de la IA hace la jugada; consultas con botones rápidos y voz (si no
contestás, decide solo).

- Vocabulario nuevo (25 intenciones): `PREG_TANTO`, `PREG_CANTO_TANTO`, `IND_CANTA_TANTO`, `IND_CALLADO_TANTO`,
  `SUBILE`; «cantá» (`IND_CANTA_TRUCO`) y «jugá callado» (`IND_ESPERA`) sin nombrar el canto son del truco. El corpus
  se reetiquetó; hay que volver a entrenar el clasificador (`training/lang/eval-intents.ts`).
- Mesa abierta: regla del juego (`RuleSet.openTable`), no del entrenamiento; las redes r2/r3 no cambian.
- Los rivales heurísticos creen lo que se dice (75%); los compañeros de la IA mienten con 27+ de tanto cuando el
  pie rival todavía puede cantar (70%). En una prueba con el pie rival con 26 de tanto, canta envido 297/300 veces
  si oyó «no tenemos nada» y 38/300 si oyó «tenemos muchos» (206/300 sin oír nada).
- Limitación para la tesis: la red Experta **no escucha lenguaje**. En Experta, consultas, engaño y esperar y subir
  son reglas encima de la red (`tacticalDecision`). Propuesta r4: sumar a la observación lo dicho en voz alta
  (dichos públicos de cada jugador sobre tanto y cartas) y dejar que la red aprenda a creer, desconfiar y mentir.

## 2026-09-28 — Más charla de equipo (después de probarlo)

Lo que encontró Emmanuel jugando: le cantaron truco y no pudo decir «el envido está primero» (la consulta del pie no
lo ofrecía y el tiempo era corto); siendo pie, sus compañeros jugaban sin preguntarle. Cambios: la consulta a un
truco en la 1ra baza ofrece «El envido está primero»; la espera sube a 10 s con barra de tiempo y se estira si
estás escribiendo o hablando; los compañeros preguntan antes de jugar («¿qué juego?», «¿qué tiro?», «¿qué hago?»)
al pie en la 1ra baza y a todos desde la 2da, con el pie primero; preguntas nuevas «¿tienen algo?», «¿qué tenés?»,
«¿qué te queda?»; voz elegida por calidad (rioplatense y natural primero) y elegible en el menú.

## 2026-09-28 — r4-piloto: la red habla y escucha (diseño)

Pregunta de Emmanuel: ¿se puede entrenar a la IA reaccionando a lo que dicen los demás, con todos los asientos
aprendiendo a la vez, para ver qué dice y cómo reacciona cada posición? Sí: hasta r3 la red no veía nada de lo que
se decía (el engaño y el escuchar eran reglas encima de la red).

Diseño del piloto (4 jugadores, solo el tanto; `config/r4-piloto.json`):
- **Hablar es una decisión más:** salidas 19–26 (del tanto y de las cartas: mucho, algo, nada, callarse), en los
  mismos momentos que las consultas del juego (`src/ai/talk/claims.ts`). El premio sigue siendo solo ganar: nadie le
  enseña a mentir ni a desconfiar.
- **Escuchar:** 48 entradas nuevas al final de la observación (lo último que dijo cada asiento). Las redes viejas
  no las ven (su observación no cambia: huella 78d8b04c; la de r4 es 956879f1).
- **Desde r3 sin perder lo aprendido:** entradas y salidas nuevas en cero (verificado: mismas salidas que r3). La
  imitación es solo de lo que se dice; el resto de la red no se toca.
- **Una sola red para todos los asientos** (self-play), con la liga y las heurísticas que escuchan y engañan, para
  que no invente un idioma que solo entiende ella. Los dichos tienen un significado verificable (mucho = 28+).
- **Qué se mide:** honestidad por lo que tiene y por si el engaño podía convenir, cuánto cambia su envido según lo
  que oyó, cómo le va al engaño, y duelos contra sí misma callada y sorda (¿sirve hablar? ¿sirve escuchar?).
- Riesgo (resultado interesante en sí): que la charla termine sin significar nada (equilibrio de "balbuceo").
- Prueba local (2 núcleos, `--smoke`): corre de punta a punta; al empezar, igual que r3 contra la difícil (73% en
  600 partidas) y 49% contra r3.

## 2026-09-28 16:24–17:34 — r4-piloto: la charla terminó en "balbuceo" (`results/r4-piloto.md`)

- Juega mejor que r3 en 4 (55% contra r3, 73–75% contra la difícil), pero contra sí misma callada o sorda queda
  en 50%: hablar y escuchar no le dan ventaja.
- Al principio (imitando) lo que decía informaba; a la iteración 50 mentía "nada" con 28+ el 74%; al final dice
  casi lo mismo tenga lo que tenga y no le cree a nadie. El engaño casi no funciona (el rival canta 10–17%).
- Lectura: con la seña privada el compañero ya sabe el tanto; en público solo sirve engañar y el rival aprende
  a no creer. Y no había memoria entre manos ni el premio de una mentira cargaba con lo que costaba después.
- Emmanuel no quiso probar sin señas (r4b). Observación suya: a 30 puntos se arrastra el creer y el mentir.

## 2026-09-28 — r4-reputación (diseño)

- Lo dicho se comprueba al terminar la mano con lo que se vio en la mesa; cada jugador arrastra en la partida sus
  verdades y mentiras pescadas. La red las ve (12 entradas); la heurística le cree según eso.
- La trayectoria es la partida entera: una mentira carga con lo que cueste en las manos siguientes. 10
  iteraciones de calentamiento del crítico (tiene que aprender a estimar la partida, no la mano).
- También se habla de las cartas cuando cantan truco ("¿qué hacemos?"): ahí hablar sí le puede servir al
  compañero (las señas son del principio y no dicen lo que queda).
- Más partidas contra heurísticas que escuchan (20% difícil). Duelos contra la difícil, r3, r4-piloto y contra sí
  misma callada y sorda.
- Prueba local (`--smoke`): corre de punta a punta.
