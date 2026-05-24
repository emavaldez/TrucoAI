# Flujo del Juego — TrucoAI

> Documentación generada del código fuente (`src/core/GameEngine.ts`, `src/App.ts`,
> `src/ui/UIManager.ts`, `src/core/Rules.ts`, `src/core/Player.ts`, `src/types.ts`).
> Versión: corregida — envido (10,11,12=0), AI estratégica, Pica-Pica por pares.

---

## 1. Menú Inicial

Archivo: `UIManager.ts` (líneas 111-164). Se renderiza un menú HTML con selector de
jugadores (2/4/6), dificultad (Fácil/Normal/Difícil), y botón ¡Jugar!.

---

## 2. Configuración de la Partida

Archivo: `App.ts` → `startGame()`. Se crean N jugadores. **Equipos intercalados**
(`i % 2`): el humano (player-0) es team 0, player-1 es team 1, player-2 es team 0,
player-3 es team 1, etc. Así cada jugador tiene rivales de ambos lados.

Nombres para 4 jugadores: Vos (team 0), Contrario 1 (team 1), Compañero (team 0),
Contrario 2 (team 1).

---

## 3. Inicio de Partida

`GameEngine.startGame()`:
- Resetea scores, dealer = player-0, mano = derecha del dealer (antihorario).
- Verifica Pica-Pica (solo 6 jugs, ambos equipos entre 5 y 25 pts).

---

## 4. Inicio de Mano

### Mano normal
1. Rota dealer antihorario.
2. Deck nuevo (40 cartas: 1-7 y 10-12 de cada palo).
3. Reparte 3 cartas a cada jugador.
4. Mano (starter) = derecha del dealer.

### Pica-Pica (6 jugadores)
Las 3 submanos comparten el mismo reparto — no se repite.

---

## 5. Turnos

**Orden antihorario**: posición 0 → 1 → 2 → ...

**Humano**: clic en carta visible. **IA**: 700ms de delay.

### Estrategia de la IA (corregida)

La IA ahora evalúa si conviene jugar fuerte o débil:

- **Si es la primera en jugar** en la baza: juega su mejor carta (o aleatoria según dificultad).
- **Si un oponente ya jugó** una carta que supera todas las suyas: juega **la carta más débil** para no desperdiciar cartas altas.
- **Si sus cartas pueden ganar**: juega la más fuerte (o aleatoria).
- Fácil: siempre aleatorio.
- Normal: 70% estratégico, 30% aleatorio.
- Difícil: siempre estratégico.

### IA — cantar truco/envido

- **Truco**: 25% de probabilidad si level=0 y no hay envido pendiente.
- **Envido**: 30% de prob si el jugador es dealer o pie (no solo pie como antes).

---

## 6. Jugar Carta (playCard)

`GameEngine.playCard()`:
1. Verifica turno y carta válida.
2. Saca carta de la mano, agrega a `currentTrick[]`.
3. Si la baza no está completa → `nextTurn()`.
4. Si la baza está completa → `resolveTrick()`.

**Trick completion**: en modo normal = todos los jugadores. En Pica-Pica = solo los 2 de la pareja activa.

### nextTurn()

- **Normal**: avanza al siguiente en orden antihorario.
- **Pica-Pica**: alterna entre los 2 jugadores de la pareja.

---

## 7. Resolver Baza (resolveTrick)

1. Cada equipo elige su **mejor carta** (mayor ranking).
2. Se comparan. Gana el equipo con ranking más alto.
3. Si hay empate → parda (teamWinner = -1).

### Ranking del Truco Argentino (Rules.ts)

```
13 → 1 de Espada (ancho de espada)
12 → 1 de Basto
11 → 7 de Espada
10 → 7 de Oro
 9 → cualquier 3
 8 → cualquier 2
 7 → 1 de Oro o 1 de Copa (iguales)
 6 → cualquier 12
 5 → cualquier 11
 4 → cualquier 10
 3 → 7 de Basto o 7 de Copa (iguales)
 2 → cualquier 6
 1 → cualquier 5
 0 → cualquier 4
```

---

## 8. Resolver Mano (resolveHand)

1. Se cuentan bazas ganadas (sin contar pardas).
2. Gana el equipo con más bazas.
3. Desempate (empate de bazas): gana el que ganó la primera baza.
4. Puntos: 1 base, + truco si aceptado (level+1).

---

## 9. Envido

### Quién puede cantar
- Solo en ronda 0, antes de jugar la primera carta.
- **Dealer o pie** (último en orden antihorario = izquierda del dealer).
- **Puede cantarse incluso si ya se cantó truco**.
- En Pica-Pica: cualquiera de los 2 de la pareja activa.

### Valores de envido (corregido)
```
1→1, 2→2, 3→3, 4→4, 5→5, 6→6, 7→7
10→0, 11→0, 12→0
```
El máximo posible es **33** (6+7 del mismo palo = 20+6+7).

### Cálculo
- Si hay 2+ cartas del mismo palo: `20 + valor_más_alto + valor_segundo_más_alto`.
- Si no hay: el valor individual más alto de las 3 cartas.
- **Cada equipo usa su MEJOR score individual (no se suman)**.
- **Empate**: gana el MANO (primer jugador, derecha del dealer).

### Respuesta
- Solo el equipo **contrario al ÚLTIMO que cantó** responde.
- El compañero del que cantó no hace nada.
- Opciones: Quiero / No quiero / Quiero y subo (Real Envido / Falta Envido).
- Si sube, el que sube se convierte en el nuevo caller y el otro equipo debe responder.

| Nivel | Puntos |
|-------|--------|
| Envido | 2 |
| Envido-Envido | 2 (acumula) |
| Real Envido | 3 |
| Falta Envido | puntos que necesita el que pierde para llegar a 30 |
| Rechazo | 1 para el que cantó |

---

## 10. Truco

### Niveles
```
Truco (1) → 2 pts
Retruco (2) → 3 pts
Vale 4 (3) → 4 pts
```

### Respuesta
- Solo el equipo **contrario al ÚLTIMO que desafió** responde.
- El compañero no hace nada.
- Si el contrario dice "quiero y subo", el que sube pasa a ser el desafiante y el otro equipo debe responder.

**Ejemplo**: Equipo 1 canta Truco → Equipo 2 acepta y sube a Retruco → ahora Equipo 1 es quien debe responder (Quiero / No quiero / Subo a Vale 4).

| Situación | Puntos |
|-----------|--------|
| Truco rechazado | 1 al que cantó |
| Retruco rechazado | 2 |
| Vale 4 rechazado | 3 |
| Aceptado (se juega) | level + 1 |

Cuando se rechaza, la mano termina inmediatamente.

---

## 11. Pica-Pica (6 jugadores)

### Activación
Ambos equipos entre 5 y 25 puntos.

### Mecánica correcta
- Alterna manos normales con manos Pica-Pica.
- **TODOS los jugadores reciben 3 cartas** al inicio de la mano.
- La mano Pica-Pica consiste en **3 submanos**, cada una entre una pareja de jugadores (uno de cada equipo):

| Submano | Equipo 0 | Equipo 1 |
|---------|----------|----------|
| 0 | posición 0 | posición 3 |
| 1 | posición 1 | posición 4 |
| 2 | posición 2 | posición 5 |

- Cada submano se juega como un 1v1 con **3 rondas** de truco.
- **Hay envido y truco** en cada submano.
- **No se reparten cartas nuevas** entre submanos — se usan las mismas cartas para las 3 submanos.
- Gana la mano Pica-Pica el equipo que gane al menos 2 de 3 submanos.
- Cada submano: 1 punto base + puntos de truco si se cantó.

---

## 12. Fin del Juego

Cuando un equipo llega a 30 puntos.

---

## 13. Simulación: Partida de 4 jugadores

### Setup
```
Jugadores: 4, dificultad Normal
Equipo 1: player-0 (Vos) + player-2 (Compañero, IA)
Equipo 2: player-1 (Contrario 1, IA) + player-3 (Contrario 2, IA)

Orden antihorario en la mesa:
  posición 0 → 1 → 2 → 3
  equipo    0    1    0    1
              ↑ intercalados ↑

Dealer: player-0 (Vos)
Mano (starter): player-1 (Contrario 1) — derecha del dealer
```

### Reparto
```
Vos:        [4 de Copa, 2 de Oro, 11 de Basto]
Contrario 1: [3 de Basto, 10 de Espada, 6 de Oro]
Compañero:  [1 de Espada, 7 de Copa, 5 de Basto]
Contrario 2: [12 de Copa, 7 de Oro, 1 de Basto]
```

### Ronda 0 — Turno de Contrario 1 (IA, team 1)

Mano: 3 Basto (rank 9), 10 Espada (4), 6 Oro (2).

¿Canta truco? truco.level=0, random 0.12 → no.
¿Canta envido? No es dealer ni pie → no puede.
¿Juega? Es el primero en jugar esta baza → juega su mejor carta.
**Juega 3 de Basto** (rank 9).

### Ronda 0 — Turno de Compañero (IA, team 0)

Mano: 1 Espada (13), 7 Copa (3), 5 Basto (1).

¿Canta truco? random 0.67 → no.
¿Canta envido? No es dealer ni pie → no puede.
Juega su mejor carta (es segundo, pero su 1 Espada rank 13 supera el 3 Basto rank 9).
**Juega 1 de Espada** (rank 13).

### Ronda 0 — Turno de Contrario 2 (IA, team 1)

Mano: 12 Copa (6), 7 Oro (10), 1 Basto (12).

¿Juega? Ya hay cartas en mesa (3 Basto de su equipo, 1 Espada del rival).
Check: su mejor carta (1 Basto rank 12) vs la mejor rival (1 Espada rank 13).
12 < 13 → no puede ganar la baza. **Juega su carta más débil: 12 de Copa (rank 6)**.

### Ronda 0 — Turno de Vos (humano, team 0)

Mano: 4 Copa (0), 2 Oro (8), 11 Basto (5).

Es dealer → puede cantar envido. Decide hacerlo.
**Canta Envido** (2 puntos).

### Respuesta al Envido

`envido.callerTeam = 0`, `level = 'envido'`

**Contrario 2** (team 1) responde. IA: 60% quiere, random 0.48 → Quiere.

**Cálculo de envido:**
- Vos: 4+2 de Copa/Oro = 20+4+2 = **26**
- Compañero: sin pareja, mejor individual = 7 → **7**
- Equipo 1: **26**
- Contrario 1: sin pareja, mejor individual = 10 → **10**
- Contrario 2: 12 vale 0, 7+1 = sin pareja, mejor = 12 (vale 0)... ¡no!
  Contrario 2 tiene 12 Copa, 7 Oro, 1 Basto. 12→0, 7→7, 1→1.
  Sin pareja → mejor = 7.
  → **7**
- Equipo 2: **10**

Equipo 1 gana 26 > 10. **Equipo 1 recibe 2 puntos.**
```
scores: { team0: 2, team1: 0 }
```

### Ronda 0 — Continúa Vos

Envido resuelto. Puede cantar truco o jugar.

El Compañero ya jugó 1 de Espada (rank 13) — esta baza ya la gana el Equipo 1.
Vos juega su carta más débil para no desperdiciar.
**Juega 4 de Copa** (rank 0).

### Resolución de Baza (Ronda 0)

| Equipo | Mejor carta | Rank |
|--------|-------------|------|
| Equipo 1 | 1 de Espada (Compañero) | **13** |
| Equipo 2 | 3 de Basto (Contrario 1) | 9 |

**Gana Equipo 1.** `firstTrickWinnerTeam = 0`.

### Ronda 1 — Nuevo starter

Starter = jugador de la carta más alta de la ronda 0: **Compañero** (player-2, 1 de Espada).

Mano del Compañero: ~~1 Espada~~, **7 Copa (3)**, **5 Basto (1)**.

**Compañero** recibe turno IA. truco.level=0, random 0.08 → **Canta Truco**.

`truco.level = 1`, `lastChallengerTeam = 0`. 2 puntos si aceptan.

### Respuesta al Truco

**Contrario 1** (team 1) responde por el Equipo 2.

IA: 65% quiere. random 0.52 → Quiere. ¿Sube? 30% sube, level<3, random 0.21 → **Sube a Retruco**.

`truco.level = 2`, `lastChallengerTeam = 1`. El Equipo 1 ahora debe responder.

### Vos responde al Retruco

Panel de respuesta: Quiero (3 pts) / No quiero (2 pts al rival) / Subo a Vale 4 (4 pts).

El 1 de Espada ya se fue, quedan cartas débiles. **No quiero**.

`resolveTruco()`: level=2, rechazado → 2 puntos al desafiante (Equipo 2).
```
scores: { team0: 2, team1: 2 }
```

La mano termina. Nueva mano — rota dealer.

---

## Apéndice A: Correcciones aplicadas al código

Durante la documentación se detectaron y corrigieron varios bugs:

### 1. Valores de envido (GameEngine.ts + Player.ts)
10, 11 y 12 devolvían su número (10/11/12) en vez de 0. Máximo pasó de 43 a 33.

### 2. Envido después de truco (GameEngine.ts, App.ts, UIManager.ts)
`canCallEnvido()` tenía `if (truco.level > 0) return false` que impedía cantar
envido después de truco. En el Truco real son apuestas independientes.

### 3. Estrategia de la IA (App.ts)
La IA ahora juega su carta más débil si un oponente ya jugó una carta imbatible,
en vez de siempre tirar la más fuerte.

### 4. Pica-Pica reescrito (GameEngine.ts)
- Ya no repite el reparto entre submanos.
- Cada submano es un 1v1 entre pares (posiciones 0-3, 1-4, 2-5).
- Tiene envido y truco.
- El ganador de submano usa `handWinnerTeam` en vez de `trickWinnerTeam`.

### 5. Turno de envido de IA (App.ts)
La IA chequeaba solo si era el pie para cantar envido. Ahora chequea si es
dealer o pie, igual que la regla real.

### 6. Truco: respuesta por el último desafiante
El flujo de truco ya alterna correctamente (`lastChallengerTeam` se invierte
al subir), pero la documentación lo describía mal. Corregido.