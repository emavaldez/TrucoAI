# Plan de entrenamiento de la IA (v2, 2026-09-25)

Versión revisada después de leer todo `GameDev/Papers Truco` y `GameDev/Papers Futbol`.
Reemplaza la sección 5 de `Papers/INVESTIGACION.md` en lo que se contradigan.

## Decisiones de Emmanuel

- **Sin flor** en todo el entrenamiento. Si en el juego se activa la flor, juega la IA heurística actual.
- **Se entrena en su Mac**, con checkpoints para no perder nada si se corta (ver `README.md`).
- **El pie coordina al equipo** (confirmado 2026-09-25): recibe las señas de sus compañeros,
  les da indicaciones, responde los cantos del rival y **es el único de su equipo que puede cantar envido**.
  Con 2 jugadores cada uno es su propio pie, así que no cambia nada.
- **Máquina:** MacBook Pro M5 Max, 18 núcleos de CPU, GPU de 40 núcleos, 128 GB. Se usa entera:
  16 procesos Node juegan partidas en paralelo y la red entrena en la GPU (MPS).

## Lo que cambió por los papers

| Fuente | Qué aprendimos | Qué cambia en el plan |
|---|---|---|
| Tesis uruguaya (Filevich 2023) | Entrenaron **por mano** con recompensa "diferencia de puntos", que ignora el marcador. La propia tesis propone ganar/perder la partida como trabajo futuro. | La recompensa pasa a ser el **cambio en la probabilidad de ganar la partida** (ver abajo). |
| Tesis | Decían que CFR+ falla porque el truco es "suma positiva", pero su utilidad (a − b) es suma cero exacta. | No descartamos métodos de suma cero por eso. |
| Tesis | La memoria, no el cómputo, fue el límite: 913 MB para 2 jugadores sin abstracción, más de 64 GB para 4 y 6 jugadores con abstracción fina. | Nada tabular para el juego publicado; red chica. |
| Tesis | Su red (Deep Monte Carlo) colapsó a 0% durante horas; solo llegó a 55% contra la determinista. | PPO con liga de rivales, no Deep Monte Carlo solo. |
| Tesis | Su truco uruguayo tiene muestra, y dicen que el argentino es "varios órdenes de magnitud" más chico. Sin flor, más todavía. | Un CFR de referencia en 2 jugadores es viable en la Mac (fase 3, opcional). |
| Tesis | Búsqueda en el momento de jugar: el modelo chico más búsqueda le ganó al grande. Contra la determinista empeoró (búsqueda "insegura"). | Queda como fase opcional, solo 2 jugadores, siempre medida contra la heurística. |
| Tesis | Evaluación con partidas **duplicadas** sobre repartos fijos, IC 90% (±1,5 puntos con 1.000 partidas dobles) y "jugadas tontas" (D-index). | Lo adoptamos tal cual. |
| Tesis | En 4 y 6 jugadores, el agente veía las cartas de los compañeros, y no modelaron las señas. | Nosotros no: cada uno ve lo suyo más las señas. Esto es nuevo y publicable. |
| Guandan (ToM) / Suspicion-Agent | Los LLM pierden contra el RL (DanZero+), cuestan ~1 USD por partida y tardan minutos. | Ningún LLM en el juego. La "teoría de la mente" entra como cabeza auxiliar que predice cartas ajenas. |
| Thousand (REINFORCE) | Aprender qué es legal con penalizaciones o pre-entrenamiento es lento; una red por fase dividió los datos. | Máscara de acciones legales del motor y una sola red para todo. |
| Google Research Football | Red compartida por todos los jugadores, γ = 1, liga con rivales elegidos donde perdemos (PFSP). Entrenar solo contra el bot aprende sus mañas. | Liga con checkpoints más heurísticas; la heurística es un rival más, no el único. |
| LCDSP (estilos en fútbol) | Una sola red condicionada a un vector de "estilo" da personalidades y dificultades graduables; mover una perilla cambió la tasa de victorias de 22% a 59%. | Niveles de dificultad y personalidades salen de una red (fase 6). Las **indicaciones del pie** se modelan igual: seguidores condicionados a la indicación. |
| InstructGPT | Imitar primero y después RL con penalización KL hacia lo imitado mantiene el estilo. | Imitar la heurística "difícil" y después PPO con KL; β es la perilla "humano ↔ fuerte". |
| Scaling BC / NitroGen / OpenVLA | Las acciones "no hacer nada" dominan y vuelven pasiva a la imitación. La diversidad de datos pesa más que la arquitectura. Train y runtime tienen que procesar la entrada igual al bit. | Reponderar "no canto / no quiero", DAgger, rivales diversos, un solo codificador en TS con tests golden. |
| Sutton & Barto (Watson), Szepesvári, Powell | Manos cortas con premio al final: Monte Carlo o λ alto. Guardar muchas políticas y elegir la mejor midiendo. Watson apostaba "ajustado por riesgo" cerca del final. | GAE con λ ≈ 0,95, liga y selección por evaluación. La tabla de probabilidad de ganar ya incluye el riesgo del marcador. |
| Game Analytics / Game Data Science | Telemetría mínima y accionable; habilidad del jugador medida contra la mejor jugada ("Q-rank"). | Más adelante: registrar partidas humanas para medir dificultad y habilidad (fuera de este plan). |

## Cómo se entrena

**La unidad es la mano; el objetivo, ganar la partida.**
- `W(nos, ellos, quién es mano)` es la probabilidad de ganar la partida desde ese marcador.
- La recompensa de una mano es `W(después) − W(antes)`. Es suma cero exacta entre equipos, está
  acotada, y hace que la red aprenda sola las malas y las buenas, la falta envido y cuándo arriesgar.
- Como cada mano da al menos un punto, el marcador nunca vuelve atrás. `W` se calcula hacia atrás
  desde 30 con las distribuciones de resultados de mano que da el self-play, y se recalcula 2–3
  veces durante el entrenamiento.

**La red: una sola** para todos los asientos y para 2, 4 y 6 jugadores. Es un MLP chico
(del orden de 256-256-128), de menos de 1 MB en int8.

| | Contenido |
|---|---|
| Entradas | Bloques de 40 cartas: mi mano; lo jugado por cada asiento relativo a mí, por baza. Nivel de cada carta y envido. Marcador. Mano/pie. Cantos y respuestas. Tantos dichos. Señas recibidas. Indicación del pie. |
| Salidas | Política con máscara de acciones legales (~15 acciones fijas). |
| | Valor. Durante el entrenamiento el crítico ve todas las manos; la política nunca. |
| | Cabeza auxiliar que predice las cartas ocultas de cada uno. Mejora el aprendizaje y más adelante sirve para explicar jugadas. |

**El circuito:**
1. Node juega miles de partidas en paralelo con el motor real y el modelo actual.
2. Python/PyTorch (en la GPU de la Mac) actualiza la red, la exporta, y se repite.
3. Checkpoints cada 15 minutos (ver `README.md`).

## Fases

| Fase | Qué | Meta para pasar a la siguiente |
|---|---|---|
| **0. Entorno y evaluación** | `TrucoEnv` sobre el motor, codificador con tests golden, repartos fijos para evaluar, arena duplicada con IC 90%, "jugadas tontas", radar de estilo (tasa de truco, de envido, de farol, de irse). Rivales base: aleatorio, greedy, heurísticas fácil/normal/difícil. | La arena reproduce los números actuales (difícil vs normal ≈ 66–69%). |
| **1. Imitación** | Copiar a la "difícil", con acciones pasivas reponderadas y DAgger (la heurística etiqueta lo que visita la red). | La red empata con la difícil (IC que incluye 50%). |
| **2. PPO en 2 jugadores** | Liga: checkpoints propios (elegidos donde perdemos) más las heurísticas. KL hacia la red de imitación. γ = 1, λ ≈ 0,95. | ≥ 55% contra la difícil en 2.000 partidas duplicadas, IC por encima de 50%. |
| **3. ¿Se la puede explotar?** | Entrenar una "mejor respuesta" contra la red congelada, y tabla de pagos entre checkpoints para ver ciclos. Si es explotable: NFSP o un CFR de referencia en 2 jugadores (viable sin muestra ni flor). | La mejor respuesta no le saca una ventaja grande. |
| **4. Equipos (4 y 6)** | El pie coordina. Los seguidores aprenden a jugar condicionados a la indicación (con un premio por cumplirla que se va apagando). El pie aprende qué indicar con el premio del equipo. Las señas le llegan al pie. | ≥ 55% contra un equipo de difíciles. Probado con vos de compañero. |
| **5. Al juego** | Pesos cuantizados (< 1 MB) con inferencia escrita en TS, sin dependencias. `RLPolicy` implementa `Policy`. "Difícil" pasa a ser la red; fácil y normal, checkpoints más débiles o β/temperatura más humanos. | Tests e2e verdes y vos le ganás menos que a la difícil actual. |
| **6. Opcional** | Búsqueda en el momento de jugar (2 jugadores). Personalidades condicionadas (agresivo, mentiroso, conservador). | Medido contra la fase 5. |

## Lo que descarto

- **LLM jugando:** pierden contra el RL, son lentos y no corren en el navegador.
- **CFR tabular para publicar:** no entra en el navegador. Solo como referencia en la fase 3.
- **ReBeL:** un modelo de ~30 MB y segundos de búsqueda por jugada.
- **Deep Monte Carlo solo:** la tesis vio colapsos que no pudo explicar.
- **Recompensa por diferencia de puntos:** ignora el marcador.

## El pie coordina (confirmado)

Hoy todos los compañeros ven las señas de todos. La propuesta:

- **Las señas le llegan solo al pie** de cada equipo: el último de su equipo en jugar la primera
  baza (con 4 y 6 jugadores: el repartidor, y en el otro equipo el que juega justo antes que él).
  Con esto la marca "Pie" pasa a ir en los dos asientos, no solo en el repartidor.
- **El pie ve las señas de sus compañeros y les da indicaciones.** El humano:
  - si es pie, ve las señas de sus compañeros y tiene botones para indicar;
  - si no es pie, le hace señas al pie y ve las indicaciones que recibe ("Tu pie: ¡Matá!").
- **Indicaciones propuestas:**
  - Jugar la baza:
    - "Matá": ganá la baza si podés.
    - "Pasá": jugá la más baja, yo la mato.
    - "Pardá": empardá si podés.
    - "Jugá tranquilo": lo que quieras.
  - Envido:
    - "Cantá envido".
    - "No cantes, yo tengo".
  - Truco:
    - "Cantá truco".
    - "Esperá".
- **Responde los cantos del rival el pie** (antes respondía el humano si estaba en el equipo, o el siguiente rival).
- **Solo el pie canta envido** en su equipo (Emmanuel, 2026-09-25). El truco lo puede cantar cualquiera.

## Lanzamiento (fases 0 a 2, 2 jugadores)

Implementado en esta carpeta y probado de punta a punta:

- `env/` (TypeScript): codificación (1006 valores, huella `78d8b04c`), 12 acciones con máscara,
  red en TS y tabla W. Tests en `env/__tests__` y chequeo de que PyTorch y TS dan los mismos logits.
- `actors/rollout.ts`: juega partidas con el motor real (modos bc, ppo, eval, wtable).
- `learner/run.py`: tabla W → datos de imitación → imitación → PPO con liga. Retoma solo.
- Prueba chica en la nube (2 núcleos, 2.000 partidas de imitación, 16 iteraciones de PPO de 256 partidas):
  la imitación le ganó 31% a la difícil y PPO llegó a **66,5% (IC90 62,5–70,3) en 400 partidas**.
  Es una muestra chica y puede estar aprovechando mañas de la heurística: la corrida grande lo confirma o no.

## Riesgos

- **Varianza:** se necesitan miles de partidas duplicadas para ver diferencias de 2–3 puntos.
- **Farol raro en self-play:** la liga y la mejor respuesta de la fase 3 lo detectan.
- **Equipos de 3:** no hay teoría que garantice nada; se mide contra humanos y heurísticas.
- **La Mac:** si es chica en memoria, se achican los buffers; si se duerme, `caffeinate` y checkpoints.
</content>
