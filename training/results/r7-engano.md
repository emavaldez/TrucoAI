# r7 "engaño": con quien escucha, la red aprende a mentir a propósito (2026-10-20)

Pregunta (Emmanuel): "si yo le hago señas al pie pero después digo otra cosa cuando me pregunta, quizás eso influye en
el otro equipo". r6 mostró que una red puede aprender a escuchar a un emisor sincero (+9 puntos). r7 pone a esa red
que escucha (`r6-escucha-verdad`, "ESC") en la liga y entrena a otra, que arranca de la misma ESC (iteración 150),
200 iteraciones contra: ella misma 35%, ESC congelada 35%, la difícil (cree 75%) 20%, r3 (no oye) 10%. Mitad 4 y
mitad 6 jugadores, con reputación. Configuración `config/r7-engano.json`, registro en `results/runs/r7-engano/`.

## 1. Qué dice la red cuando el pie rival todavía puede cantar el tanto (línea `charla`)

| Iteración | Con **mucho** (28+) dice "mucho" / "nada" | Con **nada** dice "mucho" / "nada" | miente_nada_con_mucho | pescada mintiendo |
|---|---|---|---|---|
| 151 (arranque = ESC) | 24% / 41% | 20% / 42% | 0,36 | 0,23 |
| 175 | 15% / 62% | 21% / 49% | 0,56 | 0,30 |
| 200 | 12% / 60% | 24% / 43% | 0,57 | 0,32 |
| 250 | 8% / 67% | 27% / 42% | 0,67 | 0,35 |
| 300 | 15% / 61% | 28% / 39% | 0,60 | 0,34 |
| 350 | 12% / 59% | 27% / 37% | 0,60 | 0,36 |

En 25 iteraciones aprende a **decir "nada" cuando tiene mucho** (de 41% a 60–67%) y casi nunca "mucho" con mucho
(8–15%). Es la mentira que invita al rival a cantar para subirle ("esperar y subir"), no el farol de aparentar
tanto (con nada dice "mucho" 27%, apenas más que al arrancar). La pescan mintiendo más (0,23 → 0,36) y no le
importa. `engano_pts` (puntos de envido netos cuando el rival cae): +2 a +3 por mano; `engano_rival_canta` ≈ 0,07–0,10.

## 2. Evaluación durante el entrenamiento (300 pares por punto)

| Iteración | contra ESC 4j / 6j | ESC sorda 4j / 6j | contra sí misma callada / sorda | difícil 4j / 6j | r3 4j / 6j | R 4j / 6j |
|---|---|---|---|---|---|---|
| 160 | 62 / 59 | 61 / 62 | 53 / 51 | 53 / 59 | 50 / 44 | 52 / 45 |
| 200 | 74 / 72 | 75 / 70 | 52 / 46 | 64 / 72 | 45 / 42 | 49 / 44 |
| 250 | 78 / 69 | 78 / 70 | 51 / 50 | 66 / 71 | 46 / 46 | 46 / 44 |
| 300 | 80 / 68 | 78 / 69 | 54 / 50 | 68 / 70 | 45 / 43 | 44 / 40 |
| 350 | 79 / 71 | 78 / 73 | 53 / 50 | 69 / 71 | 47 / 44 | 45 / 43 |

## 3. Duelos finales, 1000 pares (IC90 ±1,8), la "mejor" de r7 (iteración 190; corregido el 2026-10-22, decía 340 por error)

| r7… contra ESC (que escucha) | 4 jugadores | 6 jugadores |
|---|---|---|
| **hablando libre** | **76,2%** | **68,0%** |
| obligada a decir la verdad | 66,3% | 59,0% |
| obligada a mentir (el opuesto) | 75,2% | 69,0% |
| callada | 72,2% | 59,9% |
| libre, contra ESC **sorda** | 74,2% | 63,3% |

| r7 contra… | 4j | 6j |
|---|---|---|
| la difícil | 63,6% | 71,1% |
| r3 | 46,9% | 45,6% |
| R (r5-charla) | 49,0% | 45,4% |

Y por si va al juego: **ESC (r6-escucha-verdad) contra r3: 47,5% / 44,0%; contra la difícil: 46,2% / 55,1%**. No.

## Lectura

1. **Sí: con un rival que escucha, la red aprende a mentir a propósito, y rápido** (25 iteraciones). La mentira que
   elige es la de la mesa real: con mucho tanto dice "nada" para que el rival cante y subirle. Es exactamente lo que
   hace la heurística del juego (70% con 27+), pero aprendida.
2. **Cuánto rinde lo dicho contra quien escucha**: decir la verdad le cuesta **10 puntos** (76 → 66 en 4; 68 → 59 en 6).
   Mentir sistemáticamente vale casi lo mismo que hablar libre. Callarse es peor que mentir, sobre todo en 6
   (60 contra 69): a la que escucha se la castiga activamente, no solo negándole información.
3. **Pero la mayor parte de la ventaja contra ESC no viene de la charla**: contra ESC sorda gana 74% (4) y 63% (6). O
   sea, r7 explotó sobre todo cómo juega ESC las cartas (mejor respuesta a un rival fijo, como r5-charla-br). La
   charla aporta ~2 puntos en 4 y ~5 en 6 por encima de eso.
4. **El precio**: r7 se volvió especialista. Contra r3 y contra R pierde (45–49%), y contra la difícil baja de 75/81 a
   64/71. Liga fija sin PFSP = sobreajuste. Y ESC tampoco sirve para el juego (pierde con r3 y con la difícil en 4):
   escuchar a un sincero la hizo peor contra los que no hablan.
5. **Para la tesis**: queda demostrada la cadena completa. (a) En self-play la charla converge a balbuceo y nadie
   escucha (r4/r5). (b) Si el emisor es sincero, escuchar paga +9 (r6). (c) Si hay quien escucha, mentir paga +10
   sobre la verdad y la red lo aprende sola (r7). (d) Luego, el único emisor estable contra una población que
   aprende es el que no informa: el balbuceo de r4/r5 no es un defecto del entrenamiento, es el equilibrio.
6. **Para el juego**: lo que vale es r3 (juega) + la charla con reglas (dice y engaña con sentido, como quedó el
   28/9 y se amplió el 20/10 con los compañeros que opinan y el pie que decide). Una red "que habla" para la mesa
   tendría que entrenarse con la liga completa (PFSP, difícil, r3, R) y un peso chico de ESC, para que mienta sin
   dejar de jugar bien. Si se quiere, es r8.
