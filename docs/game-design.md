# TrucoAI — Diseño del Juego

## 1. Reglas generales

- Baraja española de 40 cartas (sin 8 ni 9).
- Se juega a **30 puntos** (o a 15 "las malas", configurable).
- Modalidades: **2 jugadores** (mano a mano), **4 jugadores** (2v2), **6 jugadores** (3v3).
- En equipos, los jugadores se alternan en el orden de juego: cada equipo tiene jugadores que juegan en posiciones intercaladas.

## 2. Valores de las cartas para el Truco (de mayor a menor)

| Ranking | Carta | Apodo |
|---------|-------|-------|
| 1 | 1 de Espadas | Macho |
| 2 | 1 de Bastos | Hembra |
| 3 | 7 de Espadas | Siete Bravo |
| 4 | 7 de Oro | — |
| 5 | Cualquier 3 | — |
| 6 | Cualquier 2 | — |
| 7 | 1 de Oro | Ancho falso |
| 8 | 1 de Copas | Ancho falso |
| 9 | Cualquier 12 (Rey) | — |
| 10 | Cualquier 11 (Caballo) | — |
| 11 | Cualquier 10 (Sota) | — |
| 12 | 7 de Bastos | Siete falso |
| 13 | 7 de Copas | Siete falso |
| 14 | Cualquier 6 | — |
| 15 | Cualquier 5 | — |
| 16 | Cualquier 4 | — |

## 3. Valores de las cartas para el Envido

- Número de la carta propiamente dicho: 3 = 3 pts, 4 = 4 pts, ..., 7 = 7 pts.
- Figuras (10, 11, 12): 0 pts.
- Si dos cartas son del **mismo palo**: se suman **20 pts** + valor de la carta de menor valor entre las dos del mismo palo.
- Máximo Envido: 33 (ej: 7+7 del mismo palo → 20+7+6 = 33, o 7+7 del mismo palo → 20+7+5 = 32, etc.)
- Mínimo Envido: 0.

## 4. Flujo completo del juego

### 4.1. Inicio de una mano

1. **Decidir quién reparte**: Cada jugador saca una carta del mazo. El que saca la carta de **mayor valor** (según ranking del Truco) empieza repartiendo.
2. El que reparte **baraja** las cartas.
3. El jugador a su **izquierda** (equipo contrario) **corta** el mazo.
4. El repartidor **reparte 3 cartas a cada jugador**, una por vez, empezando por el jugador a su **derecha** y siguiendo en el mismo sentido (derecha → derecha → ...).
5. Después del reparto, el **mazo restante** se coloca **boca abajo a la derecha del repartidor**.
6. El jugador a la **derecha del repartidor** es **"mano"** → es el primero en jugar.

### 4.2. Orden de juego (sentido contrario a las agujas del reloj)

Los jugadores juegan en **sentido contrario a las agujas del reloj**:
- Si los jugadores están sentados en orden 0, 1, 2, 3 alrededor de la mesa:
  - Mano 1: jugador a la derecha del repartidor (siguiente en sentido contrario a las agujas del reloj)
  - Mano 2: siguiente en sentido contrario a las agujas del reloj
  - etc.

### 4.3. Estructura de una mano

Cada "mano" (set de 3 rondas) se juega así:

#### Ronda 1
- Empieza jugando el **mano** (derecha del repartidor).
- Cada jugador juega **una carta** en orden de juego (sentido contrario a las agujas del reloj).
- Se juega la carta de **mayor valor** (según ranking del Truco).
- Se registra **quién jugó la carta más alta** y **qué equipo ganó** la ronda.
- **Empate (parda)**: si las cartas de mayor valor son del mismo valor y de equipos contrarios:
  - La ronda se considera empardada.
  - El **siguiente** en jugar la segunda ronda es el mismo que jugó primero en la primera ronda (mano).

#### Ronda 2
- Empieza jugando el jugador que jugó la carta más alta en la ronda 1.
- Si ronda 1 fue empardada, empieza el mismo que empezó ronda 1.
- Se juega como ronda 1.
- **Si ronda 2 también es empardada**: el ganador del Truco se decide por la ronda 3.

#### Ronda 3
- Empieza jugando el jugador que jugó la carta más alta en ronda 2.
- Si ronda 2 fue empardada, empieza el mismo que empezó ronda 2.
- Se juega como ronda 1.

#### Ganar la mano
- El equipo que gane **2 de las 3 rondas** gana la mano.
- **Si la ronda 1 es empardada**: gana el equipo que gane la ronda 2. No se juega ronda 3.
- **Si ronda 2 también es empardada**: gana el equipo que jugó la carta más alta en la ronda 3.
- Si la ronda 3 también es empardada → gana el equipo del **mano**.

### 4.4. Cantos de Envido (solo en ronda 1)

- El Envido se puede cantar **antes de que cualquier jugador juegue su primera carta**.
- Solo el **"pie"** de cada equipo puede cantar Envido. El "pie" es el **último jugador de cada equipo en jugar** en la ronda (es decir, el que juega último dentro de su equipo según el orden de juego).
- El **pie del equipo que es mano** (derecha del repartidor) es el primero en cantar Envido.
- Opciones del pie que canta: pasar, cantar Envido (2 pts), cantar Real Envido (3 pts), cantar Falta Envido (puntos que le faltan al otro equipo para llegar a 30).
- El equipo contrario puede: querer, no querer, o subir la apuesta.
- **Si un equipo no quiere**, el otro equipo **suma los puntos que ya se habían aceptado** (ej: si se cantó Envido y quieren, suman 2 pts; si se cantó Real Envido y quieren, suman 3 pts; si se cantó Envido y no quieren, suman 1 pt).
- **Si se sube la apuesta**, ahora es el equipo rival quien debe responder (querer, no querer, o volver a subir).
- Una vez que el repartidor juega su primera carta O se canta Truco → el Envido ya no se puede jugar.
- Si nadie canta Envido → no hay puntos por Envido.

#### Canto de los tantos de Envido (después de que se acepta el Envido)

Una vez que se acordó cuántos puntos se juegan (Envido, Real Envido, Falta Envido), se procede a **cantar los tantos** (declarar cuántos puntos tiene cada jugador para el Envido).

- Se empieza a cantar desde el **primer jugador de la ronda** (el mano, derecha del repartidor).
- Se sigue **en el sentido de la ronda** (contrario a las agujas del reloj).
- Cada jugador del equipo que va primero declara cuántos puntos tiene de Envido.
- Si el **primer jugador del equipo B tiene 25 o menos** (cuando el equipo A tiene 25), **no hace falta que el segundo jugador del equipo A declare** — simplemente puede decir "Son Buenas" y el equipo A gana el Envido automáticamente.
- Solo si un jugador del equipo B dice que tiene **más de 25**, entonces el segundo jugador del equipo A **debe** declarar cuánto tiene para ver quién gana.
- El jugador con **más puntaje** gana el Envido.
- Si un jugador tiene **tres cartas del mismo palo**, para el Envido suma las **dos cartas con más valor**.

#### Ejemplo de canto de tantos de Envido

Supongamos un juego de 4 jugadores (2v2):
- Equipo A: Jugador 0 (mano, empieza), Jugador 2 (pie, cantó Envido)
- Equipo B: Jugador 1, Jugador 3 (pie)

Se cantó Envido y el equipo A lo quiso → se juegan 2 puntos.

Se empieza a cantar los tantos desde el mano (Jugador 0 de Equipo A):
1. **Jugador 0 (Eq A)**: "Tengo 25"
2. **Jugador 1 (Eq B)**: "Tengo 23" → como tiene 25 o menos, no hace falta que el Jugador 2 de Eq A declare
3. **Jugador 0 (Eq A)**: "Son Buenas" → **Equipo A gana el Envido** con 25 vs 23

Ejemplo 2 — si el equipo B supera los 25:
1. **Jugador 0 (Eq A)**: "Tengo 25"
2. **Jugador 1 (Eq B)**: "Tengo 27" → ¡superó los 25!
3. **Jugador 2 (Eq A)**: ahora SÍ debe declarar → "Tengo 24"
4. **Jugador 3 (Eq B)**: "Tengo 22"
5. **Resultado**: Equipo B gana el Envido (27 vs 24+25=50, pero se comparan los mejores de cada equipo: 27 vs 25, gana Eq B)

Nota: se comparan los puntajes individuales, no la suma. Gana el jugador con más puntos de Envido.

### 4.5. Cantos de Truco

- Se puede cantar **en cualquier momento** por cualquier jugador.
- Orden de subida: Truco → Retruco → Vale Cuatro.
- Solo el equipo que "quiso" la última apuesta puede subirla ("tener el quiero").
- **Si un equipo no quiere**, el otro equipo **suma los puntos que ya se habían aceptado** (ej: si se cantó Truco y quieren, suman 3 pts; si se cantó Retruco y quieren, suman 4 pts; si se cantó Truco y no quieren, suman 1 pt).
- Si no se canta Truco → el ganador de 2 rondas anota **1 punto**.
- Si se canta Truco → el ganador anota los puntos acordados (1, 2, 3, o falta).
- Si el equipo contrario "no quiere" → va al mazo, pierde los puntos.

### 4.6. Fin de una mano → Rotación del repartidor

- Una vez terminadas las 3 rondas, el repartidor **recoge las cartas**, las baraja y las pasa al siguiente.
- El **nuevo repartidor** es el jugador que está a la **derecha** del repartidor anterior (siguiente en sentido **contrario a las agujas del reloj**).
- El repartidor rota en el **mismo sentido que el orden de juego** (sentido contrario a las agujas del reloj).
- El nuevo repartidor baraja y reparte para la nueva mano.

### 4.7. Fin del juego

- El juego termina cuando un equipo llega a **30 puntos** (o 15, según configuración).
- Los puntos se anotan al terminar cada mano.

### 4.8. Pica-Pica (juego de 6 jugadores)

Cuando se juega de **6 jugadores (3v3)** y el puntaje está entre **5 y 25 puntos** (inclusive), se juega en modo **Pica-Pica**:

- Las manos se **alternan**: una mano se juega **normal** (las 3 rondas con todas las cartas), y la siguiente mano se juega en **3 submanos**.
- En la mano de **Pica-Pica**, cada jugador juega **solo contra el jugador del equipo contrario que está enfrente** de él.
- El orden de las submanos sigue el **sentido de la ronda** (contrario a las agujas del reloj).
- **No se termina una submano hasta que empieza la siguiente**.

#### Orden de las submanos en Pica-Pica

Los 3 jugadores de cada equipo juegan en orden (1er jugador, 2do jugador, 3er jugador según el sentido de la ronda):

- **Submano 1**: 1er jugador del Equipo A vs **último** jugador del Equipo B (posición 3)
- **Submano 2**: 2do jugador del Equipo A vs **2do** jugador del Equipo B (posición 2)
- **Submano 3**: **último** jugador del Equipo A (posición 3) vs **1er** jugador del Equipo B (posición 1)

Cada submano se juega como una mano normal (3 rondas, 3 cartas por jugador). Se gana la submano quien gane 2 de las 3 rondas. Se gana la mano de Pica-Pica quien gane 2 de las 3 submanos.

#### Limitación de Falta Envido en Pica-Pica

Si se llega a cantar **Falta Envido** en alguna de las manos de Pica-Pica, se suman **máximo 7 puntos** como resultado, sin importar cuántos puntos le falten al otro equipo para llegar a 30.

## 5. Reglas de empate (parda)

- Si la ronda 1 es empardada → ronda 2 la empieza el mismo que empezó ronda 1.
- Si la ronda 2 también es empardada → el ganador del Truco se decide por quién jugó la carta más alta en la ronda 3.
- Si la ronda 3 también es empardada → gana el equipo del **mano**.

## 6. IA — Comportamiento

### 6.1. Reglas de la IA

- La IA **no puede ver** las cartas de su compañero.
- La IA **solo conoce** las cartas que jugó en la mesa (cartas visibles).
- La IA **no debe jugar carta alta** si su compañero ya ganó el truco (ya ganó la ronda).
- La IA debe tomar decisiones estratégicas basadas en:
  - Cartas en mano
  - Cartas jugadas en la mesa
  - Puntaje actual
  - Quién es mano (quién empieza)
  - Qué rondas se ganaron

### 6.2. Lógica de decisión

1. Si su equipo ya ganó la ronda → jugar la carta más baja posible.
2. Si el equipo rival ya ganó la ronda → intentar ganar con la carta más baja que pueda.
3. Si está empatado → jugar según estrategia (intentar ganar o conservar cartas altas).
4. Considerar cantos de Envido y Truco.

## 7. UI — Disposición de la mesa

### 7.1. Posición de jugadores

- Jugadores sentados alrededor de una mesa ovalada.
- El repartidor está en la parte inferior (posición 6 o 12 en reloj).
- El mano está a la derecha del repartidor (sentido horario).
- En 4 jugadores: posiciones a las 3, 6, 9, 12 en el reloj.
- En 6 jugadores: posiciones a las 1, 3, 5, 7, 9, 11 en el reloj.

### 7.2. Cartas del jugador

- Las cartas del jugador se muestran **en la parte inferior** de la pantalla (cartas propias).
- Las cartas de otros jugadores se muestran como **cartas boca abajo** en sus posiciones.

### 7.3. Cartas jugadas

- Las cartas jugadas se muestran **enfrente de cada jugador**, en la zona de la mesa correspondiente a su posición.
- Las cartas se apilan boca arriba en el centro de la zona de cada jugador.

### 7.4. Mazo

- El mazo restante se muestra **boca abajo a la derecha del repartidor**.
- Se muestra la cantidad de cartas restantes.

### 7.5. Indicadores

- Se indica claramente **quién es el repartidor** actual.
- Se indica **quién es mano** (primero en jugar).
- Se muestra el **turno actual** (qué jugador debe jugar).
- Se muestra el **puntaje** de cada equipo.
- Se muestra el **estado del canto** (Envido, Truco, Retruco, Vale Cuatro).

## 8. Estados del juego

```
MENU → DEALING → ENVIDO_PHASE → TRICK_PLAYING → ROUND_RESOLVE → 
  → (if mano 1) SHOW_ROUND_SUMMARY → NEXT_HAND → mano 2 → ... → 
  → ROUND_OVER → (if game not over) DEALING → nueva mano → ... → 
  → GAME_OVER

En Pica-Pica (6 jugadores, 5-25 pts):
  → PICAPICA_SUBMANO_1 → PICAPICA_SUBMANO_2 → PICAPICA_SUBMANO_3 → PICAPICA_RESOLVE
```

### Estados detallados:

1. **MENU**: Selección de jugadores, dificultad, modalidad.
2. **DEALING**: Repartiendo cartas. Animación de reparto.
3. **ENVIDO_PHASE**: Fase de cantos de Envido. Antes de que se juegue la primera carta.
4. **TRICK_PLAYING**: Jugando las cartas de la ronda. Turno por turno.
5. **ROUND_RESOLVE**: Se resuelve quién ganó la ronda. Se muestra el resultado.
6. **SHOW_ROUND_SUMMARY**: Se muestra el resumen de la mano (quién ganó cada ronda). Botón "SIGUIENTE MANO" si es mano 1.
7. **ROUND_OVER**: La mano terminó. Se actualizan los puntos.
8. **PICAPICA_SUBMANO_N**: Jugando una submano de Pica-Pica (solo 1 jugador de cada equipo).
9. **PICAPICA_RESOLVE**: Se resuelve quién ganó la mano de Pica-Pica (2 de 3 submanos).
10. **GAME_OVER**: El juego terminó. Se muestra el ganador.

## 9. Datos a persistir entre rondas

- `dealerId`: quién reparte en la mano actual.
- `starterId`: quién empieza a jugar en la ronda actual.
- `currentTrick`: qué ronda se está jugando (1, 2, 3).
- `roundResults`: resultados de cada ronda (quién ganó, qué carta jugó).
- `scores`: puntaje de cada equipo.
- `isSecondHand`: si es la segunda mano (mano 2).
- `firstHandCompleted`: flag para saber si ya se completó la mano 1.
- `deckRemaining`: cuántas cartas quedan en el mazo.
- `trickWinnerId`: quién jugó la carta más alta en la ronda anterior (para determinar quién empieza la siguiente).
- `trickWinnerTeam`: qué equipo ganó la ronda anterior.
- `isPicaPica`: si se está jugando en modo Pica-Pica (6 jugadores, 5-25 pts).
- `picaPicaSubmano`: qué submano se está jugando (1, 2, 3) en Pica-Pica.
- `picaPicaHandAlternation`: flag para alternar entre mano normal y mano Pica-Pica.

## 10. Rotación del repartidor

El repartidor rota en **sentido contrario a las agujas del reloj** (mismo sentido que el orden de juego):

- Si hay 4 jugadores (0, 1, 2, 3) y el repartidor actual es 0:
  - Siguiente repartidor: 1 (derecha de 0 en sentido contrario a las agujas del reloj)
  - Luego: 2, luego: 3, luego: 0...

- Si hay 6 jugadores (0, 1, 2, 3, 4, 5) y el repartidor actual es 0:
  - Siguiente repartidor: 1
  - Luego: 2, 3, 4, 5, 0...

**Nota**: En la mesa, "derecha del repartidor" significa el siguiente jugador en sentido **contrario a las agujas del reloj**.
