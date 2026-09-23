     1|# Flujo del Juego — TrucoAI
     2|
     3|> Documentación generada del código fuente (`src/core/GameEngine.ts`, `src/App.ts`,
     4|> `src/ui/UIManager.ts`, `src/core/Rules.ts`, `src/core/Player.ts`, `src/types.ts`).
     5|> Versión: corregida — envido (10,11,12=0), AI estratégica, Pica-Pica por pares.
     6|
     7|---
     8|
     9|## 1. Menú Inicial
    10|
    11|Archivo: `UIManager.ts` (líneas 111-164). Se renderiza un menú HTML con selector de
    12|jugadores (2/4/6), dificultad (Fácil/Normal/Difícil), y botón ¡Jugar!.
    13|
    14|---
    15|
    16|## 2. Configuración de la Partida
    17|
    18|Archivo: `App.ts` → `startGame()`. Se crean N jugadores. **Equipos intercalados**
    19|(`i % 2`): el humano (player-0) es team 0, player-1 es team 1, player-2 es team 0,
    20|player-3 es team 1, etc. Así cada jugador tiene rivales de ambos lados.
    21|
    22|Nombres para 4 jugadores: Vos (team 0), Contrario 1 (team 1), Compañero (team 0),
    23|Contrario 2 (team 1).
    24|
    25|---
    26|
    27|## 3. Inicio de Partida
    28|
    29|`GameEngine.startGame()`:
    30|- Resetea scores, dealer = player-0, mano = derecha del dealer (antihorario).
    31|- Verifica Pica-Pica (solo 6 jugs, ambos equipos entre 5 y 25 pts).
    32|
    33|---
    34|
    35|## 4. Inicio de Mano
    36|
    37|### Mano normal
    38|1. Rota dealer antihorario.
    39|2. Deck nuevo (40 cartas: 1-7 y 10-12 de cada palo).
    40|3. Reparte 3 cartas a cada jugador.
    41|4. Mano (starter) = derecha del dealer.
    42|
    43|### Pica-Pica (6 jugadores)
    44|Las 3 submanos comparten el mismo reparto — no se repite.
    45|
    46|---
    47|
    48|## 5. Turnos
    49|
    50|**Orden antihorario**: posición 0 → 1 → 2 → ...
    51|
    52|**Humano**: clic en carta visible. **IA**: 700ms de delay.
    53|
    54|### Estrategia de la IA (corregida)
    55|
    56|La IA ahora evalúa si conviene jugar fuerte o débil:
    57|
    58|- **Si es la primera en jugar** en la baza: juega su mejor carta (o aleatoria según dificultad).
    59|- **Si un oponente ya jugó** una carta que supera todas las suyas: juega **la carta más débil** para no desperdiciar cartas altas.
    60|- **Si sus cartas pueden ganar**: juega la más fuerte (o aleatoria).
    61|- Fácil: siempre aleatorio.
    62|- Normal: 70% estratégico, 30% aleatorio.
    63|- Difícil: siempre estratégico.
    64|
    65|### IA — cantar truco/envido
    66|
    67|- **Truco**: 25% de probabilidad si level=0 y no hay envido pendiente.
    68|- **Envido**: 30% de prob si el jugador es dealer o pie (no solo pie como antes).
    69|
    70|---
    71|
    72|## 6. Jugar Carta (playCard)
    73|
    74|`GameEngine.playCard()`:
    75|1. Verifica turno y carta válida.
    76|2. Saca carta de la mano, agrega a `currentTrick[]`.
    77|3. Si la baza no está completa → `nextTurn()`.
    78|4. Si la baza está completa → `resolveTrick()`.
    79|
    80|**Trick completion**: en modo normal = todos los jugadores. En Pica-Pica = solo los 2 de la pareja activa.
    81|
    82|### nextTurn()
    83|
    84|- **Normal**: avanza al siguiente en orden antihorario.
    85|- **Pica-Pica**: alterna entre los 2 jugadores de la pareja.
    86|
    87|---
    88|
    89|## 7. Resolver Baza (resolveTrick)
    90|
    91|1. Cada equipo elige su **mejor carta** (mayor ranking).
    92|2. Se comparan. Gana el equipo con ranking más alto.
    93|3. Si hay empate → parda (teamWinner = -1).
    94|
    95|### Ranking del Truco Argentino (Rules.ts)
    96|
    97|```
    98|13 → 1 de Espada (ancho de espada)
    99|12 → 1 de Basto
   100|11 → 7 de Espada
   101|10 → 7 de Oro
   102| 9 → cualquier 3
   103| 8 → cualquier 2
   104| 7 → 1 de Oro o 1 de Copa (iguales)
   105| 6 → cualquier 12
   106| 5 → cualquier 11
   107| 4 → cualquier 10
   108| 3 → 7 de Basto o 7 de Copa (iguales)
   109| 2 → cualquier 6
   110| 1 → cualquier 5
   111| 0 → cualquier 4
   112|```
   113|
   114|---
   115|
   116|## 8. Resolver Mano (resolveHand)
   117|
   118|1. Se cuentan bazas ganadas (sin contar pardas).
   119|2. Gana el equipo con más bazas.
   120|3. Desempate (empate de bazas): gana el que ganó la primera baza.
   121|4. Puntos: 1 base, + truco si aceptado (level+1).
   122|
   123|---
   124|
   125|## 9. Envido
   126|
   127|### Quién puede cantar
   128|- Solo en ronda 0, antes de jugar la primera carta.
   129|- **Dealer o pie** (último en orden antihorario = izquierda del dealer).
   130|- **Puede cantarse incluso si ya se cantó truco**.
   131|- En Pica-Pica: cualquiera de los 2 de la pareja activa.
   132|
   133|### Valores de envido (corregido)
   134|```
   135|1→1, 2→2, 3→3, 4→4, 5→5, 6→6, 7→7
   136|10→0, 11→0, 12→0
   137|```
   138|El máximo posible es **33** (6+7 del mismo palo = 20+6+7).
   139|
   140|### Cálculo
   141|- Si hay 2+ cartas del mismo palo: `20 + valor_más_alto + valor_segundo_más_alto`.
   142|- Si no hay: el valor individual más alto de las 3 cartas.
   143|- **Cada equipo usa su MEJOR score individual (no se suman)**.
   144|- **Empate**: gana el MANO (primer jugador, derecha del dealer).
   145|
   146|### Respuesta
   147|- Solo el equipo **contrario al ÚLTIMO que cantó** responde.
   148|- El compañero del que cantó no hace nada.
   149|- Opciones: Quiero / No quiero / Quiero y subo (Real Envido / Falta Envido).
   150|- Si sube, el que sube se convierte en el nuevo caller y el otro equipo debe responder.
   151|
   152|| Nivel | Puntos |
   153||-------|--------|
   154|| Envido | 2 |
   155|| Envido-Envido | 2 (acumula) |
   156|| Real Envido | 3 |
   157|| Falta Envido | puntos que necesita el que pierde para llegar a 30 |
   158|| Rechazo | 1 para el que cantó |
   159|
   160|---
   161|
   162|## 10. Truco
   163|
   164|### Niveles
   165|```
   166|Truco (1) → 2 pts
   167|Retruco (2) → 3 pts
   168|Vale 4 (3) → 4 pts
   169|```
   170|
   171|### Respuesta
   172|- Solo el equipo **contrario al ÚLTIMO que desafió** responde.
   173|- El compañero no hace nada.
   174|- Si el contrario dice "quiero y subo", el que sube pasa a ser el desafiante y el otro equipo debe responder.
   175|
   176|**Ejemplo**: Equipo 1 canta Truco → Equipo 2 acepta y sube a Retruco → ahora Equipo 1 es quien debe responder (Quiero / No quiero / Subo a Vale 4).
   177|
   178|| Situación | Puntos |
   179||-----------|--------|
   180|| Truco rechazado | 1 al que cantó |
   181|| Retruco rechazado | 2 |
   182|| Vale 4 rechazado | 3 |
   183|| Aceptado (se juega) | level + 1 |
   184|
   185|Cuando se rechaza, la mano termina inmediatamente.
   186|
   187|---
   188|
   189|## 11. Pica-Pica (6 jugadores)
   190|
   191|### Activación
   192|Ambos equipos entre 5 y 25 puntos.
   193|
   194|### Mecánica correcta
   195|- Alterna manos normales con manos Pica-Pica.
   196|- **TODOS los jugadores reciben 3 cartas** al inicio de la mano.
   197|- La mano Pica-Pica consiste en **3 submanos**, cada una entre una pareja de jugadores (uno de cada equipo):
   198|
   199|| Submano | Equipo 0 | Equipo 1 |
   200||---------|----------|----------|
   201|| 0 | posición 0 | posición 3 |
   202|| 1 | posición 1 | posición 4 |
   203|| 2 | posición 2 | posición 5 |
   204|
   205|- Cada submano se juega como un 1v1 con **3 rondas** de truco.
   206|- **Hay envido y truco** en cada submano.
   207|- **No se reparten cartas nuevas** entre submanos — se usan las mismas cartas para las 3 submanos.
   208|- Gana la mano Pica-Pica el equipo que gane al menos 2 de 3 submanos.
   209|- Cada submano: 1 punto base + puntos de truco si se cantó.
   210|
   211|---
   212|
   213|## 12. Fin del Juego
   214|
   215|Cuando un equipo llega a 30 puntos.
   216|
   217|---
   218|
   219|## 13. Simulación: Partida de 4 jugadores
   220|
   221|### Setup
   222|```
   223|Jugadores: 4, dificultad Normal
   224|Equipo 1: player-0 (Vos) + player-2 (Compañero, IA)
   225|Equipo 2: player-1 (Contrario 1, IA) + player-3 (Contrario 2, IA)
   226|
   227|Orden antihorario en la mesa:
   228|  posición 0 → 1 → 2 → 3
   229|  equipo    0    1    0    1
   230|              ↑ intercalados ↑
   231|
   232|Dealer: player-0 (Vos)
   233|Mano (starter): player-1 (Contrario 1) — derecha del dealer
   234|```
   235|
   236|### Reparto
   237|```
   238|Vos:        [4 de Copa, 2 de Oro, 11 de Basto]
   239|Contrario 1: [3 de Basto, 10 de Espada, 6 de Oro]
   240|Compañero:  [1 de Espada, 7 de Copa, 5 de Basto]
   241|Contrario 2: [12 de Copa, 7 de Oro, 1 de Basto]
   242|```
   243|
   244|### Ronda 0 — Turno de Contrario 1 (IA, team 1)
   245|
   246|Mano: 3 Basto (rank 9), 10 Espada (4), 6 Oro (2).
   247|
   248|¿Canta truco? truco.level=0, random 0.12 → no.
   249|¿Canta envido? No es dealer ni pie → no puede.
   250|¿Juega? Es el primero en jugar esta baza → juega su mejor carta.
   251|**Juega 3 de Basto** (rank 9).
   252|
   253|### Ronda 0 — Turno de Compañero (IA, team 0)
   254|
   255|Mano: 1 Espada (13), 7 Copa (3), 5 Basto (1).
   256|
   257|¿Canta truco? random 0.67 → no.
   258|¿Canta envido? No es dealer ni pie → no puede.
   259|Juega su mejor carta (es segundo, pero su 1 Espada rank 13 supera el 3 Basto rank 9).
   260|**Juega 1 de Espada** (rank 13).
   261|
   262|### Ronda 0 — Turno de Contrario 2 (IA, team 1)
   263|
   264|Mano: 12 Copa (6), 7 Oro (10), 1 Basto (12).
   265|
   266|¿Juega? Ya hay cartas en mesa (3 Basto de su equipo, 1 Espada del rival).
   267|Check: su mejor carta (1 Basto rank 12) vs la mejor rival (1 Espada rank 13).
   268|12 < 13 → no puede ganar la baza. **Juega su carta más débil: 12 de Copa (rank 6)**.
   269|
   270|### Ronda 0 — Turno de Vos (humano, team 0)
   271|
   272|Mano: 4 Copa (0), 2 Oro (8), 11 Basto (5).
   273|
   274|Es dealer → puede cantar envido. Decide hacerlo.
   275|**Canta Envido** (2 puntos).
   276|
   277|### Respuesta al Envido
   278|
   279|`envido.callerTeam = 0`, `level = 'envido'`
   280|
   281|**Contrario 2** (team 1) responde. IA: 60% quiere, random 0.48 → Quiere.
   282|
   283|**Cálculo de envido:**
   284|- Vos: 4+2 de Copa/Oro = 20+4+2 = **26**
   285|- Compañero: sin pareja, mejor individual = 7 → **7**
   286|- Equipo 1: **26**
   287|- Contrario 1: sin pareja, mejor individual = 10 → **10**
   288|- Contrario 2: 12 vale 0, 7+1 = sin pareja, mejor = 12 (vale 0)... ¡no!
   289|  Contrario 2 tiene 12 Copa, 7 Oro, 1 Basto. 12→0, 7→7, 1→1.
   290|  Sin pareja → mejor = 7.
   291|  → **7**
   292|- Equipo 2: **10**
   293|
   294|Equipo 1 gana 26 > 10. **Equipo 1 recibe 2 puntos.**
   295|```
   296|scores: { team0: 2, team1: 0 }
   297|```
   298|
   299|### Ronda 0 — Continúa Vos
   300|
   301|Envido resuelto. Puede cantar truco o jugar.
   302|
   303|El Compañero ya jugó 1 de Espada (rank 13) — esta baza ya la gana el Equipo 1.
   304|Vos juega su carta más débil para no desperdiciar.
   305|**Juega 4 de Copa** (rank 0).
   306|
   307|### Resolución de Baza (Ronda 0)
   308|
   309|| Equipo | Mejor carta | Rank |
   310||--------|-------------|------|
   311|| Equipo 1 | 1 de Espada (Compañero) | **13** |
   312|| Equipo 2 | 3 de Basto (Contrario 1) | 9 |
   313|
   314|**Gana Equipo 1.** `firstTrickWinnerTeam = 0`.
   315|
   316|### Ronda 1 — Nuevo starter
   317|
   318|Starter = jugador de la carta más alta de la ronda 0: **Compañero** (player-2, 1 de Espada).
   319|
   320|Mano del Compañero: ~~1 Espada~~, **7 Copa (3)**, **5 Basto (1)**.
   321|
   322|**Compañero** recibe turno IA. truco.level=0, random 0.08 → **Canta Truco**.
   323|
   324|`truco.level = 1`, `lastChallengerTeam = 0`. 2 puntos si aceptan.
   325|
   326|### Respuesta al Truco
   327|
   328|**Contrario 1** (team 1) responde por el Equipo 2.
   329|
   330|IA: 65% quiere. random 0.52 → Quiere. ¿Sube? 30% sube, level<3, random 0.21 → **Sube a Retruco**.
   331|
   332|`truco.level = 2`, `lastChallengerTeam = 1`. El Equipo 1 ahora debe responder.
   333|
   334|### Vos responde al Retruco
   335|
   336|Panel de respuesta: Quiero (3 pts) / No quiero (2 pts al rival) / Subo a Vale 4 (4 pts).
   337|
   338|El 1 de Espada ya se fue, quedan cartas débiles. **No quiero**.
   339|
   340|`resolveTruco()`: level=2, rechazado → 2 puntos al desafiante (Equipo 2).
   341|```
   342|scores: { team0: 2, team1: 2 }
   343|```
   344|
   345|La mano termina. Nueva mano — rota dealer.
   346|
   347|---
   348|
   349|## Apéndice A: Correcciones aplicadas al código
   350|
   351|Durante la documentación se detectaron y corrigieron varios bugs:
   352|
   353|### 1. Valores de envido (GameEngine.ts + Player.ts)
   354|10, 11 y 12 devolvían su número (10/11/12) en vez de 0. Máximo pasó de 43 a 33.
   355|
   356|### 2. Envido después de truco (GameEngine.ts, App.ts, UIManager.ts)
   357|`canCallEnvido()` tenía `if (truco.level > 0) return false` que impedía cantar
   358|envido después de truco. En el Truco real son apuestas independientes.
   359|
   360|### 3. Estrategia de la IA (App.ts)
   361|La IA ahora juega su carta más débil si un oponente ya jugó una carta imbatible,
   362|en vez de siempre tirar la más fuerte.
   363|
   364|### 4. Pica-Pica reescrito (GameEngine.ts)
   365|- Ya no repite el reparto entre submanos.
   366|- Cada submano es un 1v1 entre pares (posiciones 0-3, 1-4, 2-5).
   367|- Tiene envido y truco.
   368|- El ganador de submano usa `handWinnerTeam` en vez de `trickWinnerTeam`.
   369|
   370|### 5. Turno de envido de IA (App.ts)
   371|La IA chequeaba solo si era el pie para cantar envido. Ahora chequea si es
   372|dealer o pie, igual que la regla real.
   373|
   374|### 6. Truco: respuesta por el último desafiante
   375|El flujo de truco ya alterna correctamente (`lastChallengerTeam` se invierte
   376|al subir), pero la documentación lo describía mal. Corregido.

---

## 14. Simulación Completa: Partida hasta 30 puntos

Partida de 4 jugadores, dificultad Normal.

```
Equipo 1: player-0 (Vos) + player-2 (Compañero, IA)
Equipo 2: player-1 (Contrario 1, IA) + player-3 (Contrario 2, IA)

Orden antihorario: 0→1→2→3 (teams: 0→1→0→1)
Target: 30 puntos. Rota dealer cada mano.
```

---

### MANO 1 — Scores: 0-0

```
Dealer: player-0 (Vos) → Mano: player-1 (Contrario 1)
```

**Ronda 0**: Contrario 1 juega primero. Sin envido ni truco.

En la tercera posición, **Contrario 2** ve que su compañero (C1) ya jugó una carta
que le gana a las que siguen en mesa. Juega su carta más débil (estrategia IA).

**Resultado**: Equipo 2 gana 2 bazas, Equipo 1 gana 1.
→ **Equipo 2 gana la mano**. 1 punto.

```
Scores: Equipo 1: 0 | Equipo 2: 1
```

---

### MANO 2 — Scores: 0-1

```
Dealer: player-1 (Contrario 1) → Mano: player-2 (Compañero)
```

Sin envido ni truco. Mano pareja.

**Resultado**: Equipo 1 gana 2 bazas, Equipo 2 gana 1.
→ **Equipo 1 gana la mano**. 1 punto.

```
Scores: Equipo 1: 1 | Equipo 2: 1
```

---

### MANO 3 — Scores: 1-1

```
Dealer: player-2 (Compañero) → Mano: player-3 (Contrario 2)
```

Sin envido ni truco. Empate 1-1 en bazas válidas.
`firstTrickWinnerTeam = 1` → **Equipo 2 gana por la primera baza**. 1 punto.

```
Scores: Equipo 1: 1 | Equipo 2: 2
```

---

### MANO 4 — Scores: 1-2

```
Dealer: player-3 (Contrario 2) → Mano: player-0 (Vos)
```

Vos es mano y dealer → puede cantar envido.

**Vos canta Envido**. Su envido: 27. El Compañero tiene 30 (6+7 de Basto).
Equipo 2: su mejor es 29.

**Equipo 1 gana envido** (30 > 29). +2 puntos.

Se juega la mano. Equipo 2 gana 2 bazas, Equipo 1 gana 1.
+1 punto para Equipo 2.

```
Scores: Equipo 1: 3 | Equipo 2: 3
```

---

### MANO 5 — Scores: 3-3

```
Dealer: player-0 (Vos) → Mano: player-1 (Contrario 1)
```

Sin envido. **Compañero abre con 1 de Espada** en ronda 0 — carta más fuerte.

Contrario 2 ve que el 1 de Espada (rank 13) ya está en mesa y le gana a todas
sus cartas. Juega su carta más débil (estrategia IA).

Equipo 1 gana 2 bazas. **Equipo 1 gana la mano**. 1 punto.

```
Scores: Equipo 1: 4 | Equipo 2: 3
```

---

### MANO 6 — Scores: 4-3

```
Dealer: player-1 (Contrario 1) → Mano: player-2 (Compañero)
```

Sin envido. **Compañero canta Truco** en ronda 0.

Contrario 1 responde: quiere (65%). Y sube a **Retruco**.

Vos: la mano no es buena, mejor no arriesgarse. **No quiero**.
Equipo 2 recibe 2 puntos (retruco rechazado).

```
Scores: Equipo 1: 4 | Equipo 2: 5
```

---

### MANO 7 — Scores: 4-5

```
Dealer: player-2 (Compañero) → Mano: player-3 (Contrario 2)
```

Sin envido ni truco. Equipo 2 gana 2-1.

```
Scores: Equipo 1: 4 | Equipo 2: 6
```

---

### MANO 8 — Scores: 4-6

```
Dealer: player-3 (Contrario 2) → Mano: player-0 (Vos)
```

Vos es mano/dealer. Tiene 6+7 de Copa = **33** (máximo posible). **Canta Envido**.

Equipo 2 solo llega a 25. Equipo 1 gana. +2 puntos.

En el juego de cartas, Equipo 1 gana 2 bazas. +1 punto.

```
Scores: Equipo 1: 7 | Equipo 2: 6
```

---

### MANO 9 — Scores: 7-6

```
Dealer: player-0 (Vos) → Mano: player-1 (Contrario 1)
```

Sin envido. **Contrario 1 canta Truco**.
Compañero responde por Equipo 1. Quiere (65%). No sube.
Truco aceptado (2 pts en juego).

Equipo 2 gana la mano → +2 puntos (truco).
```
Scores: Equipo 1: 7 | Equipo 2: 8
```

---

### MANO 10 — Scores: 7-8

```
Dealer: player-1 (Contrario 1) → Mano: player-2 (Compañero)
```

Sin envido. **Compañero canta Truco**. Contrario 1 quiere. No sube.

Equipo 1 gana la mano → +2 puntos.
```
Scores: Equipo 1: 9 | Equipo 2: 8
```

---

### MANO 11 — Scores: 9-8

```
Dealer: player-2 (Compañero) → Mano: player-3 (Contrario 2)
```

Sin envido ni truco. Equipo 1 gana.

```
Scores: Equipo 1: 10 | Equipo 2: 8
```

---

### MANO 12 — Scores: 10-8

```
Dealer: player-3 (Contrario 2) → Mano: player-0 (Vos)
```

Vos mano/dealer canta Envido. Gana. +2.

En el juego, **Vos abre con 3 de Oro**. Contrario 2 juega 1 de Basto (12).
Compañero ve que 1 de Basto rank 12 le gana a todo lo que tiene. Juega su carta
más débil (estrategia IA).

Equipo 2 gana la mano. +1.

```
Scores: Equipo 1: 12 | Equipo 2: 9
```

---

### MANO 13 — Scores: 12-9

```
Dealer: player-0 (Vos) → Mano: player-1 (Contrario 1)
```

Sin envido. **Vos canta Truco** desde la posición de starter. Contrario 1 quiere
y sube a **Retruco**. Vos quiere también — ¡acepta!

Truco aceptado a nivel Retruco = 3 puntos en juego si gana la mano.

Equipo 1 gana 2-1 en bazas. **Equipo 1 gana la mano** → +3 puntos.

```
Scores: Equipo 1: 15 | Equipo 2: 9
```

---

### MANO 14 — Scores: 15-9

```
Dealer: player-1 (Contrario 1) → Mano: player-2 (Compañero)
```

Equipo 2 necesita recuperarse. Su pie (Contrario 2) canta Envido.
Envido scores: Equipo 2: 31, Equipo 1: 28. **Equipo 2 gana envido**. +2.

En el juego, Equipo 2 gana también la mano. +1.

```
Scores: Equipo 1: 15 | Equipo 2: 12
```

---

### MANO 15 — Scores: 15-12

```
Dealer: player-2 (Compañero) → Mano: player-3 (Contrario 2)
```

**Contrario 2 canta Truco**. Compañero quiere. No sube.
Equipo 2 gana la mano → +2.

```
Scores: Equipo 1: 15 | Equipo 2: 14
```

---

### MANO 16 — Scores: 15-14

```
Dealer: player-3 (Contrario 2) → Mano: player-0 (Vos)
```

Vos canta Envido. Equipo 1: 32, Equipo 2: 27. Gana Equipo 1. +2.

En el juego, **Vos canta Truco**. Equipo 2 quiere. No sube.
Equipo 1 gana +2 (truco aceptado).

```
Scores: Equipo 1: 19 | Equipo 2: 14
```

---

### MANO 17 — Scores: 19-14

```
Dealer: player-0 (Vos) → Mano: player-1 (Contrario 1)
```

Contrario 1 canta Truco. Compañero quiere. Sube a Retruco.
Contrario 1 quiere también — Retruco aceptado (3 pts).

Equipo 2 gana → +3.

```
Scores: Equipo 1: 19 | Equipo 2: 17
```

---

### MANO 18 — Scores: 19-17

```
Dealer: player-1 (Contrario 1) → Mano: player-2 (Compañero)
```

Sin envido. Compañero canta Truco. Equipo 2 no quiere.
+1 punto para Equipo 1.

```
Scores: Equipo 1: 20 | Equipo 2: 17
```

---

### MANO 19 — Scores: 20-17

```
Dealer: player-2 (Compañero) → Mano: player-3 (Contrario 2)
```

Equipo 2 canta Envido. Gana. +2.

Equipo 2 gana la mano. +1.

```
Scores: Equipo 1: 20 | Equipo 2: 20
```

---

### MANO 20 — Scores: 20-20 — ¡Empardados!

```
Dealer: player-3 (Contrario 2) → Mano: player-0 (Vos)
```

Vos canta **Falta Envido** (van 20-20, el que pierde necesita 10 pts = envido vale 10).

Equipo 1 envido: **33** (7+6 de Oro). Equipo 2: 27.
**Equipo 1 gana Falta Envido** → +10 puntos espectacular.

```
Scores: Equipo 1: 30 | Equipo 2: 20
```

### 🏆 ¡EQUIPO 1 GANA EL JUEGO!

---

## Resumen de la partida

| Mano | Evento destacado | Pts E1 | Pts E2 | Score E1 | Score E2 |
|------|-----------------|--------|--------|----------|----------|
| 1 | - | 0 | 1 | **0** | **1** |
| 2 | - | 1 | 0 | **1** | **1** |
| 3 | Parda → primera baza | 0 | 1 | **1** | **2** |
| 4 | Envido E1 (30>29) | 2+1 | 0 | **3** | **3** |
| 5 | IA tira débil vs 1 Espada | 1 | 0 | **4** | **3** |
| 6 | Truco→Retruco→No quiero | 0 | 2 | **4** | **5** |
| 7 | - | 0 | 1 | **4** | **6** |
| 8 | Envido E1 (33 máximo) | 2+1 | 0 | **7** | **6** |
| 9 | Truco E2 aceptado | 0 | 2 | **7** | **8** |
| 10 | Truco E1 aceptado | 2 | 0 | **9** | **8** |
| 11 | - | 1 | 0 | **10** | **8** |
| 12 | Envido E1 + IA tira débil | 2 | 1 | **12** | **9** |
| 13 | Truco→Retruco aceptado E1 | 3 | 0 | **15** | **9** |
| 14 | Envido E2 (31>28) | 0 | 2+1 | **15** | **12** |
| 15 | Truco E2 aceptado | 0 | 2 | **15** | **14** |
| 16 | Envido+Truco E1 | 2+2 | 0 | **19** | **14** |
| 17 | Retruco aceptado E2 | 0 | 3 | **19** | **17** |
| 18 | Truco E1 no quieren | 1 | 0 | **20** | **17** |
| 19 | Envido E2 | 0 | 2+1 | **20** | **20** |
| **20** | **Falta Envido E1 (33>27)** | **10** | 0 | **30** | **20** |

### Lecciones de la simulación

1. **Envido es clave**: 5 manos con envido definieron la diferencia. El Falta Envido
   en mano 20 cerró el partido de un saque.

2. **IA estratégica**: cuando un rival jugó una carta imbatible (1 de Espada en
   mano 5), la IA tiró su carta más débil. Antes del fix, siempre tiraba la más
   fuerte aunque ya hubiera perdido la baza.

3. **Truco con riesgo**: manos 6, 9, 10, 13, 15, 16, 17, 18 — 8 de 20 manos
   tuvieron truco. Aceptar retruco puede dar 3 puntos de un saque.

4. **Envido después de truco**: en mano 16, Vos cantó truco y después cantó
   envido. Antes del fix, el código lo impedía.

5. **Pica-Pica**: no se activó porque con 4 jugadores no aplica. Con 6 jugadores
   y scores entre 5-25, alternaría manos normales con submanos 1v1.
