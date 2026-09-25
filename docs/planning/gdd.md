# TrucoAI — Game Design Document (v2)

**Autor:** Emmanuel Valdez · **Planificación BMAD:** Claude (PM/Arquitecto/SM) · **Implementación:** Hermes (perfil `trucoai`)
**Tipo:** juego de cartas (Truco argentino) · **Plataforma:** web (Vite + TypeScript, deploy en Vercel)
**Versión del documento:** 2.0 — 2026-09-23 (reemplaza la v1 de julio 2026)

> Este documento es la **fuente de verdad de las reglas**. Si el código, un test o cualquier otro doc
> (incluidos `docs/legacy/*`) contradice lo que dice acá, el que está mal es el otro.
> Las decisiones marcadas **[DECISIÓN 2026-09]** fueron tomadas explícitamente por Emmanuel.

---

## 1. Resumen

TrucoAI es un Truco argentino para 2, 4 o 6 jugadores donde el humano juega (solo o con compañeros IA)
contra rivales controlados por IA. Replica el reglamento clásico a 30 puntos, con **flor configurable**
y **pica-pica** en 6 jugadores. La IA juega con heurísticas creíbles en tres dificultades claramente
distintas y **nunca hace trampa** (solo ve información pública y sus propias cartas).

### Pilares

1. **Autenticidad** — reglas del truco real; las variantes están explícitas y son configurables.
2. **Desafío justo** — la IA decide solo con lo que vería un jugador humano en su lugar.
3. **Claridad** — el jugador siempre sabe de quién es el turno, qué se cantó, qué puede hacer y por qué sumó cada punto.
4. **Robustez** — ninguna partida se cuelga, ningún punto se cuenta dos veces; todo verificado con tests.

### Fuera de alcance de esta versión

Multijugador online, animaciones complejas, estadísticas entre partidas, modo torneo,
IA entrenada (CFR/RL — queda planificada como épica futura, ver §11.4).

---

## 2. Mesa, equipos y orden

- **Asientos** `0..n-1` (n = 2, 4 o 6). El humano es siempre el asiento 0.
- **Orden de juego:** antihorario, que en el modelo es asiento `i → i+1 (mod n)`.
- **Equipos:** intercalados. Equipo 0 = asientos pares (el humano: "Nosotros"); equipo 1 = asientos impares ("Ellos").
- **Repartidor (dealer):** al azar (con la semilla de la partida) en la primera mano; después rota un asiento por mano.
- **Mano:** el asiento siguiente al repartidor. Recibe primero y juega primero la primera baza.
- **Pie:** el último en jugar de cada equipo en la primera baza (en 2 jugadores, el repartidor).
- **Reparto:** 3 cartas a cada uno, empezando por el mano. Las 3 cartas repartidas quedan registradas
  (el envido y la flor se calculan siempre sobre esas 3, aunque ya se hayan jugado).

## 3. Cartas

Baraja española de 40 (sin 8 ni 9). Palos: espada, basto, oro, copa.

**Jerarquía para el truco (de mayor a menor):**

| Rango | Cartas |
|---|---|
| 13 | 1 de espada (ancho de espada) |
| 12 | 1 de basto (ancho de basto) |
| 11 | 7 de espada |
| 10 | 7 de oro |
| 9 | todos los 3 |
| 8 | todos los 2 |
| 7 | 1 de oro, 1 de copa (falsos) |
| 6 | todos los 12 |
| 5 | todos los 11 |
| 4 | todos los 10 |
| 3 | 7 de basto, 7 de copa (falsos) |
| 2 | todos los 6 |
| 1 | todos los 5 |
| 0 | todos los 4 |

**Valor para envido/flor:** 1–7 valen su número; 10, 11 y 12 valen 0.

## 4. Bazas y resolución de la mano

### 4.1 Una baza

- Cada jugador juega una carta en orden a partir de quien **abre** la baza.
- Gana la baza el **equipo** que jugó la carta de mayor rango.
- Si la carta de mayor rango la tienen jugadores de **los dos equipos** (mismo rango) → **parda**.
- Si la carta de mayor rango está repetida solo dentro de un mismo equipo → gana ese equipo.
- **Quién abre:** la primera baza, el mano. Las siguientes, el jugador que jugó la carta ganadora
  (si hay dos del mismo equipo con el mismo rango máximo, el primero de ellos que jugó).
  Después de una **parda**, abre **el mismo jugador que abrió la baza parda**.

### 4.2 Quién gana la mano [DECISIÓN 2026-09: reglamento clásico]

| Resultado de bazas | Gana |
|---|---|
| Un equipo gana 2 bazas | ese equipo |
| 1ª parda | el que gane la 2ª; si la 2ª es parda, el que gane la 3ª; si las tres son pardas, **el equipo del mano** |
| 1ª ganada por X, 2ª parda | X |
| 1ª X, 2ª Y, 3ª parda | X (el que ganó la primera) |

- La mano termina **en cuanto está decidida** (no se juega una baza innecesaria).
- Si no hubo truco querido, la mano vale **1 punto**.

## 5. Truco

- **Cantar:** un jugador puede cantar en **su turno, antes de jugar su carta**, en cualquier baza.
- **Escalera:** Truco → Retruco → Vale cuatro. Solo se puede subir un escalón por vez.
- **Quién puede subir:** solo el equipo que **tiene el quiero** (el que aceptó el último canto),
  en su turno o al responder ("quiero retruco"). Nunca el equipo que hizo el último canto.
- **Quién responde:** si el desafiado es el equipo del humano, **responde el humano**. Si es un equipo de IA,
  responde el jugador de ese equipo más cercano en orden de juego al que cantó.
- **Respuestas:** Quiero · No quiero · Subir (siguiente escalón) · Irse al mazo (equivale a no quiero).
- **Mientras hay un canto sin responder no se puede jugar ninguna carta** ni hacer otra acción que no sea responder
  (salvo "el envido está primero", §6.4).
- **Valores:**

| Canto | Querido | No querido (para el que cantó) |
|---|---|---|
| Truco | 2 | 1 |
| Retruco | 3 | 2 |
| Vale cuatro | 4 | 3 |

- **No quiero termina la mano de inmediato**: el que cantó suma el valor "no querido" y no se juegan más cartas.
- Después de un "quiero", sigue jugando quien tenía el turno.

## 6. Envido

### 6.1 Puntaje de envido de un jugador

- Dos o tres cartas del mismo palo: **20 + la suma de las dos más altas** (valores de envido).
- Sin dos del mismo palo: **el valor de la carta más alta** (las figuras valen 0).
- Rango posible: 0–33. Se calcula siempre con las **3 cartas repartidas**.
- El envido de un equipo es el del mejor de sus jugadores.

### 6.2 Cuándo se puede cantar

- Solo durante la **primera baza**, por un jugador en su turno **antes de jugar su primera carta**.
- Solo una vez por mano (una cadena de cantos).
- **No** se puede cantar después de que se aceptó un truco. Sí como respuesta a un truco en primera baza (§6.4).
- Con flor habilitada, si algún jugador cantó flor, el envido queda anulado (§7).

### 6.3 Cadena y puntos

Cantos posibles: **Envido (E)**, **Real envido (R)**, **Falta envido (F)**. La cadena empieza con E, R o F.
Sucesiones válidas: después de E → E (una sola vez), R o F; después de E-E → R o F; después de R → F;
después de F → nada. Cada canto de la cadena lo responde el otro equipo con Quiero / No quiero / subir.

- **Querido:** suma de los cantos (E = 2, R = 3). Si la cadena incluye F, vale el valor de la falta (reemplaza todo).
- **No querido:** lo que valía la cadena **sin el último canto** (querida); si la cadena tenía un solo canto, 1.

| Cadena | Querido | No querido |
|---|---|---|
| E | 2 | 1 |
| R | 3 | 1 |
| F | falta | 1 |
| E-E | 4 | 2 |
| E-R | 5 | 2 |
| E-F | falta | 2 |
| R-F | falta | 3 |
| E-E-R | 7 | 4 |
| E-E-F | falta | 4 |
| E-R-F | falta | 5 |
| E-E-R-F | falta | 7 |

### 6.4 El envido está primero

Si en la primera baza se canta truco y todavía no se cantó envido, el equipo desafiado (que todavía
tiene derecho a envido) puede, **en lugar de responder el truco**, cantar envido (E, R o F).
Se resuelve la cadena de envido completa y después **vuelve a quedar pendiente la respuesta al truco**.

### 6.5 Falta envido [DECISIÓN 2026-09]

- Vale **lo que le falta al equipo que va ganando para llegar a 30**.
- Si el que va ganando todavía está en **las malas** (menos de 15), la falta es **por el partido**:
  quien gane el envido suma lo que necesite para llegar a 30.
- En **pica-pica** la falta envido vale **7** fijo [DECISIÓN 2026-09].

### 6.6 Resolución: cantar los tantos [DECISIÓN 2026-09-25]

- Al quererse, se cantan los tantos **en orden desde el mano**. El mano siempre dice su número.
- **El equipo que va ganando no habla.** Le toca al siguiente (en ronda) del otro equipo:
  - si **supera** al que va ganando, dice su número y la delantera pasa a su equipo;
  - si no, dice **"Me dio"** si todavía le queda un compañero por hablar, o **"Son buenas"** si era el último de su
    equipo (el equipo se rinde y se termina el envido).
- Cuando la delantera cambia, hablan los del otro equipo que todavía no hablaron (también los que se habían salteado
  porque su equipo iba ganando). Cada jugador habla una sola vez.
- **Empate:** gana el que está antes en el orden desde el mano (el que le toca jugar primero en la ronda).
- **Qué se hace público:** solo los números dichos. "Me dio" y "Son buenas" no revelan el número (solo que no llegaba).
  Esa información pública es la única que puede usar la IA.
- **El que gana el envido muestra sus 3 cartas al terminar la mano**, también las que no jugó.
- Los puntos del envido se suman **en el momento** (no al final de la mano). Si con eso un equipo llega a 30,
  la partida termina ahí.

## 7. Flor (configurable, apagada por defecto) [DECISIÓN 2026-09: configurable]

Con la opción **"Jugar con flor"** activada en el menú:

- **Flor** = las 3 cartas repartidas del mismo palo. Valor para comparar: 20 + la suma de las tres (valores de envido).
- La flor se canta **obligatoriamente**: en el primer turno del jugador en la primera baza su única acción posible es "¡Flor!"
  (la interfaz puede cantarla sola), o antes, si al equipo le cantan envido o truco en primera baza y ese jugador todavía no jugó carta.
- Cantar flor **anula el envido** (la cadena de envido en curso se cancela sin puntos; no se puede cantar más envido en la mano).
- **Solo un equipo tiene flor:** suma **3 puntos por cada flor** declarada. El rival no puede responder.
- **Ambos equipos tienen flor:** cuando el primer jugador del segundo equipo con flor la declara, ese equipo elige:

| Opción del segundo equipo | Qué pasa |
|---|---|
| Con flor me achico | El primer equipo suma 4 |
| Contraflor | El primer equipo responde: **Quiero** → se comparan flores, el ganador suma 6 · **No quiero** → el segundo equipo suma 4 · **Contraflor al resto** (sube) |
| Contraflor al resto | El primer equipo responde: **Quiero** → el ganador de la comparación suma el valor de la falta (§6.5) · **No quiero** → el segundo equipo suma 6 |

- Empates de flor: gana el más cercano al mano (igual que envido).
- En una contraflor querida se muestran y comparan todas las flores de la mesa (declaradas o no) — a validar por Emmanuel.
- Los valores 3 / 4 / 6 son **valores por defecto a validar por Emmanuel**; en el código viven en una única tabla.

## 8. Irse al mazo

- Un jugador puede irse al mazo **en su turno** o **como respuesta a un truco**. Se va todo su equipo; la mano termina.
- **Mientras hay un envido o una flor sin responder, no se puede ir al mazo** (primero hay que responder).
- El rival suma el valor del truco: el nivel **querido** actual, o 1 si no hubo truco. Si había un truco
  cantado **contra** el equipo que se va, equivale a "no quiero" (valor no querido).
- **No** hay punto extra por irse en primera sin cantar envido [DECISIÓN 2026-09].
- Los puntos de envido/flor ya resueltos en la mano se mantienen.

## 9. Puntaje y fin de partida

- La partida es a **30 puntos**: las malas (0–14) y las buenas (15–29).
- Los puntos se suman en el momento en que se ganan (envido, flor, fin de mano).
- La partida termina **inmediatamente** cuando un equipo llega a 30 (aunque sea en medio de una mano).
  El marcador se muestra con tope 30.
- **Nueva partida** arranca de cero, con estado totalmente nuevo.
- Se guarda un **historial** por mano: repartidor, mano, bazas, cantos (quién, qué, querido o no, puntos, a quién), puntos y marcador.

## 10. Pica-pica (6 jugadores, activable) [DECISIÓN 2026-09]

- Opción del menú **"Pica-pica"** (encendida por defecto en 6 jugadores).
- **Se activa** al comenzar una mano si **ambos equipos tienen entre 5 y 25 puntos** (inclusive).
- Mientras esté activa, las manos **alternan**: pica-pica, redonda (3 contra 3), pica-pica, … La primera mano
  en que se cumple la condición es de pica-pica. Si la condición deja de cumplirse, se vuelve a manos redondas.
- **Una mano de pica-pica:** se reparten 3 cartas a los 6 como siempre. Después se juegan **3 submanos 1 contra 1**,
  en orden: asientos (mano, enfrentado), luego los siguientes pares en orden de juego. Enfrentado de `i` = `i+3 (mod 6)`.
- **Cada submano es una mano completa de 1 contra 1** con sus propias 3 bazas, envido, flor, truco y mazo:
  sus puntos van al equipo del ganador en el momento. En la submano el mano es el del par más cercano al mano de la mano general.
- **Única diferencia con un 1v1:** la falta envido vale **7**.
- La partida puede terminar en medio de una pica-pica (si un equipo llega a 30).
- Después de las 3 submanos, la mano termina y el repartidor rota normalmente.

## 11. Inteligencia artificial

### 11.1 Justicia (no negociable)

La IA decide **únicamente** con una `Observation` construida por el motor: sus cartas, cartas jugadas en la mesa,
cantos y respuestas, envidos/flores **dichos públicamente**, puntajes, turno y sus acciones legales.
Nunca recibe manos ajenas (ni del compañero), ni el orden del mazo, ni envidos no revelados.

### 11.2 Dificultades

Los rivales usan la dificultad elegida; los **compañeros del humano juegan siempre en "normal"**.

| Dificultad | Comportamiento |
|---|---|
| **Fácil** | Juega bien las cartas obvias pero ~45% de las decisiones son una acción legal al azar. Umbrales de canto gruesos, nunca farolea, ignora al compañero. |
| **Normal** | Reglas firmes: abre bajo, gana con la mínima que alcanza, no le gana a su compañero, juega la más alta cuando tiene que ganar sí o sí, empardar cuando conviene. Canta y acepta truco/envido según fuerza de mano, bazas ganadas y posición (mano/pie). Poco ruido (~5%). |
| **Difícil** | Todo lo de normal más: presión de marcador (falta envido cuando el rival está cerca de 30, más conservador en las buenas), farol a una tasa controlada, lectura de lo público (envido revelado → cartas probables), y opcionalmente muestreo Monte Carlo de manos rivales **solo desde las cartas no vistas**. |

**Criterio de aceptación medible:** en 1.000 partidas con semilla por enfrentamiento, en 2 y 4 jugadores:
difícil le gana a normal ≥ 60% y normal le gana a fácil ≥ 60%.

### 11.3 Ritmo

Las IA "piensan" entre 800 y 2.000 ms (configurable; 0 en tests). Nunca actúan dos veces por la misma decisión.

### 11.4 Futuro (fuera de este ciclo)

Épica planificada: motor de simulación headless (ya queda hecho en este ciclo) + agente CFR/MCCFR entrenado,
en la línea de los papers de `Papers/` y del plan para AI and Games Conference.

## 12. Interfaz

- **Menú:** cantidad de jugadores (2/4/6), dificultad, "Jugar con flor", "Pica-pica" (solo 6), Jugar.
- **Mesa:** marcador (Nosotros/Ellos, malas/buenas), asientos con nombre, equipo, repartidor, mano y turno;
  cartas jugadas por baza; mis cartas (solo clickeables cuando jugar es legal).
- **Acciones:** solo se muestran las acciones legales en ese momento (derivadas de `getLegalActions`):
  Envido / Real envido / Falta envido, Truco / Retruco / Vale cuatro, Irse al mazo.
- **Panel de respuesta** (centrado, deja ver las cartas): Quiero / No quiero / subir (todas las subidas legales),
  y "Envido está primero" cuando corresponda.
- **Avisos:** los eventos (cantos, respuestas, envido dicho, baza ganada) se muestran como avisos no bloqueantes
  que se van solos. Solo bloquean: el resumen de fin de mano ("Siguiente mano") y el fin de partida.
- **Fin de partida:** ganador, marcador, historial desplegable con scroll, "Nueva partida".
- **Sonido [DECISIÓN 2026-09-25]:** una voz dice cada canto y respuesta ("¡Truco!", "¡Quiero!", los tantos, "Me dio",
  "Son buenas"…) con un "tin" corto; golpecito al jugar carta. Se apaga desde el menú o la pausa.
- **Responsive:** jugable en 390×844 (móvil) y 1280×800, en 2, 4 y 6 jugadores, sin jugadores cortados;
  botones táctiles ≥ 44 px. Jugable con teclado.

## 13. Métricas de éxito

- 0 cuelgues y 0 violaciones de invariantes en 1.000 partidas simuladas por modo (2/4/6, con y sin flor).
- Cobertura ≥ 90% de líneas en `src/engine/`, ≥ 80% en `src/ai/`.
- Suite E2E en CI verde; build y deploy automáticos desde `main`.
- Orden de dificultades verificado por la arena (§11.2).
