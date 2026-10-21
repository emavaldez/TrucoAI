# r8 "dos audiencias": la charla informa cuando el aliado la necesita y el rival no la oye toda (2026-10-20/21)

Programa y predicciones en `programa-habla.md`. Cuatro corridas desde la misma red (r5-charla iteración 25), misma
semilla, mismos rivales (ella misma 70%, la difícil 15%, R congelada 15%), 200 iteraciones, mitad 4 y mitad 6, sin
reputación, sin KL hacia la imitación. Sin señas, al abrir la mano cada compañero del pie dice algo de sus cartas y de
su tanto (mucho / algo / nada / se calla). Registros en `results/runs/r8-*`, duelos en `duelos.jsonl`.

## 0. Cuánto valen las señas (R contra R que no ve las señas de sus compañeros, 1000 pares)

| 4 jugadores | 6 jugadores |
|---|---|
| **69,5%** | **80,3%** |

Con la red A al final: 70,7% / 79,7%. Las señas son, lejos, la información más valiosa de la mesa.

## 1. Cuánta información lleva lo dicho (información mutua en bits, cada 25 iteraciones)

Tanto (máximo posible ≈ 1,4 bits; "mucho" ≥ 28, "algo" 24–27, "nada" ≤ 23):

| Iteración | A señas + pública | B sin señas, pública | C sin señas, solo equipo | D sin señas, oyen la mitad |
|---|---|---|---|---|
| 26 | 0,17 | 0,25 | 0,24 | 0,23 |
| 75 | 0,06 | 0,15 | 0,32 | 0,26 |
| 125 | 0,02 | 0,16 | 0,37 | 0,33 |
| 175 | 0,02 | 0,13 | 0,37 | 0,32 |
| 225 | **0,01** | **0,13** | **0,36** | **0,35** |

Cartas: en las cuatro cae (de 0,32–0,35 a 0,04–0,07 bits), también con charla privada. Lo dicho de las cartas no le
sirve al pie para decidir (las cartas se ven al jugarlas y el pie ya indica), y sin presión para mantenerlo, se pierde.

Qué dice con el tanto al final (cuando el pie rival todavía puede cantar):

| | con **mucho** dice "mucho" | con **nada** dice "mucho" | con **nada** dice "nada" / se calla |
|---|---|---|---|
| A | 24% | 24% | 45% / 11% |
| B | 72% | 20% | 43% / 13% |
| C | 76% | **1%** | 42% / 21% |
| D | 85% | 4% | 55% / 15% |

En C y D, "mucho" significa mucho (casi nunca se dice sin tenerlo) y el resto queda mezclado: el lenguaje se
comprime a la distinción que sirve para decidir el envido ("mucho / no mucho"). En B, uno de cada cinco "mucho" es
mentira; en A, "mucho" no dice nada.

¿El pie escucha a su compañero? Cuánto canta envido según lo que dijo el compañero, al final:

| | compañero dijo "mucho" | dijo "nada" |
|---|---|---|
| A | 49% | 42% |
| B | 74% | 51% |
| C | **83%** | 48% |
| D | 79% | 45% |

## 2. Cuánto vale cada canal (la red contra sí misma con un canal cortado)

Durante el entrenamiento (iteración 220, 300 pares, ±3,4), 4j / 6j:

| | callada | sorda a su equipo | sorda a los rivales | sin ver las señas |
|---|---|---|---|---|
| A | 48 / 49 | 52 / 53 | 48 / 50 | 72 / 86 |
| B | 52 / 54 | 51 / 54 | 50 / 53 | — |
| C | 59 / 68 | 56 / 60 | — | — |
| D | 57 / 65 | 55 / 60 | 53 / 53 | — |

Duelos de 1000 pares (IC90 ±1,8) con la "mejor" de cada corrida, 4j / 6j:

| | callada | sorda a su equipo | sorda a los rivales | contra la difícil |
|---|---|---|---|---|
| A (iteración 60) | 49,9 / 49,7 | 51,0 / 51,3 | 49,6 / 50,8 | 75,0 / 80,6 |
| B (iteración 40) | 47,4 / 46,8 | 50,4 / 51,4 | 50,3 / 51,5 | 71,8 / 68,7 |
| C (iteración 220) | **60,5 / 65,3** | **56,1 / 63,7** | — | 73,3 / 77,9 |
| D (iteración 220) | **57,0 / 64,7** | **55,0 / 59,1** | 52,5 / 52,1 | 72,3 / 75,0 |

Ojo: la "mejor" se elige por lo que le gana a la difícil, y en A y B salió temprano (iteraciones 60 y 40, antes de
que la charla de B cambiara). Por eso se repitieron los duelos con la **última red (iteración 225)** de cada una:

| última red, 4j / 6j | callada | sorda a su equipo | sorda a los rivales | contra la difícil |
|---|---|---|---|---|
| A | 50,8 / 50,4 | 49,1 / 49,4 | 51,6 / 50,5 | 70,0 / 75,5 |
| B | 51,6 / 57,1 | 53,4 / 54,8 | 52,7 / 49,5 | 70,0 / 69,0 |
| C | **59,8 / 65,2** | **59,0 / 61,0** | — | 73,8 / 78,7 |
| D | 56,8 / 63,1 | 54,9 / 57,9 | 51,9 / 52,2 | 72,8 / 76,8 |

**Cuánto vale escuchar al compañero** (sorda a su equipo, promedio de 4 y 6): A ≈ 0 · B +4 · D +6 · C +10. Crece de
forma ordenada con la privacidad del canal. Lo que le saca el rival escuchando: D +2, B +1.

## 3. Lectura

1. **Con señas, la charla se apaga sola** (A): de 0,17 a 0,01 bits, el pie deja de escucharla y cortar cualquier canal
   de charla da 50%. Sin señas cortadas, 70% / 80%. Es el balbuceo de r4/r5, ahora con su causa a la vista: el aliado
   no necesita lo que se dice.
2. **Si el aliado lo necesita y el rival no lo oye** (C), aparece un lenguaje: la información del tanto se duplica
   (0,24 → 0,36 bits), "mucho" pasa a ser casi siempre verdad (1% de mentira), el pie canta 83% contra 48% según lo
   que oye, y hablar vale 9–15 puntos (callada: 60,5% / 65,3%). La charla recupera buena parte de lo que se perdió al
   sacar las señas (contra la difícil: C 73/78 contra A 75/81), pero no todo: con tres palabras no se dice lo que dice
   una seña ("tengo el ancho de espada").
3. **Que el rival oiga la mitad casi no cambia la información** (D ≈ C: 0,35 bits; el rival le saca 2 puntos
   escuchando), aunque sí lo que vale (escuchar al compañero: +6 en D contra +10 en C). **Que oiga todo lo cambia
   mucho** (B: 0,13 bits, escuchar al compañero +4, escuchar al rival +1). La curva información contra probabilidad
   de que escuche el rival no es lineal: aguanta hasta ½ y se cae en 1.
4. Es lo que predice Farrell y Gibbons: con dos audiencias, la charla pública queda parcialmente creíble. En B, "mucho"
   se dice con mucho 72% y sin nada 20%: informa algo al compañero sin regalarle todo al rival.
5. **Callarse también es un mensaje** (efecto pasajero). Con la red de B de la iteración 40, el equipo que siempre se
   calla le ganó al que habla (la red le ganó a su versión callada solo 47%): los rivales leían el silencio como
   debilidad. Al final del entrenamiento ya no pasa (51,6% / 57,1%). En A, nadie escucha y no pasa nunca.
6. **Lo que no sirve para decidir se olvida**, aun en privado: la charla de cartas pierde información en las cuatro
   condiciones; la del tanto (que decide el envido) se afila donde sirve.

Para la tesis: la misma red, con los mismos rivales, habla con sentido o balbucea según una sola cosa, la estructura
de la información (quién necesita saber y quién escucha). El balbuceo de r4–r7 no era un defecto del aprendizaje.
