# r6 "escucha": ¿la charla no sirve, o el emisor aprendió a balbucear? (2026-10-20)

Pregunta de Emmanuel: le llamaba la atención que lo que se dice en la mesa no cambie nada (r4/r5: hablar o escuchar
dan ≈50% contra la misma red callada o sorda). Para separar "la información no vale" de "el emisor aprendió a no
decir nada útil", se fija al que habla y se entrena a la que escucha. Código y configuraciones en el commit `7715c7b`;
registros en `results/runs/r6-escucha-*/`, duelos en `duelos.jsonl` (notas "escucha A/C" y "mentira").

**R** = la mejor de r5-charla (iteración 25), congelada. Se le impone lo que dice: `truth` (la verdad sobre el tanto y
las cartas), `lie` (el extremo opuesto; con "algo", uno de los otros dos al azar), `coin` (la verdad la mitad de las
veces; si no, un nivel distinto al azar), `mute` (se calla). Siempre con reputación y en 4 y 6 jugadores.

## A. Línea de base: R contra R con lo dicho impuesto (1000 pares, IC90 ±1,8)

| R oye a R que dice… | 4 jugadores | 6 jugadores |
|---|---|---|
| la verdad | 50,7% | 48,9% |
| mentira | 47,3% | 45,8% |
| moneda | 49,5% | 49,5% |
| R sorda contra la que dice la verdad | 47,8% | 49,9% |

Entre variantes (4 jugadores): verdad contra mentira 46,4%; verdad contra moneda 48,3%; mentira contra moneda 52,6%.

Como se esperaba: R no saca nada de lo que oye, diga lo que diga la otra (todo dentro de ±3; la mentira parece
hasta un poco mejor, probablemente porque desarma lo poco que R cree).

## B. Entrenar a la que escucha (150 iteraciones desde R, solo contra R con lo dicho impuesto)

Evaluación cada 10 iteraciones contra el mismo emisor, oyendo y sorda (600 partidas por punto). Promedio de las
últimas cinco (iteraciones 130–170):

| Entrenada contra… | Oyendo 4j / 6j | Sorda 4j / 6j |
|---|---|---|
| **verdad** (`r6-escucha-verdad`) | **58,3% / 52,9%** | 49,2% / 45,5% |
| **mentira** (`r6-escucha-mentira`) | **54,8% / 50,2%** | 50,8% / 47,4% |
| **moneda** (`r6-escucha-moneda`) | 51,3% / 48,4% | 51,4% / 47,5% |

Curvas: contra la verdad sube desde la iteración 70 (53 → 58%); contra la mentira arranca por debajo de 50% y recién
pasa 53% en la iteración 90 (tiene que aprender a invertir la lectura); contra la moneda nunca se despega.

## C. Duelos finales, 1000 pares (la "mejor" de cada corrida)

| | Oyendo 4j / 6j | Sorda 4j / 6j | Contra R tal cual (4j) |
|---|---|---|---|
| escucha-verdad contra R#truth | **58,5% / 54,5%** | 50,5% / 46,2% | 53,7% |
| escucha-mentira contra R#lie | **55,6%** / 49,9% | 49,5% / 48,8% | 47,9% |
| escucha-moneda contra R#coin | 51,9% / 46,8% | 52,2% / 47,2% | 51,8% |

Referencia: la mejor respuesta a R sin tocar lo que dice (explotabilidad del 2026-09-29) quedó en 49–52%.

## D. ¿La mentira influye en el otro equipo? (`training/mentira.sh`)

R con lo dicho impuesto contra la **difícil**, que escucha y cree 75% (y pesca mentiras con la reputación):

| R que dice… | contra la difícil 4j | 6j | contra r3 (no oye) 4j | 6j |
|---|---|---|---|---|
| la verdad | 74,6% | 80,5% | 54,6% | 53,5% |
| mentira | 74,8% | 80,5% | 54,2% | 51,3% |
| moneda | 75,3% | 81,4% | — | — |
| callada | 76,2% | 79,6% | — | — |
| tal cual | 74,8% | 81,0% | — | — |

Nada cambia (todo dentro de ±1,8). A la heurística no se la engaña ni se la ayuda con la charla: lo que oye pesa poco
en sus decisiones (el envido lo decide casi solo con su tanto) y la reputación le quita crédito al que miente.

## Lectura

1. **La información de la charla vale.** Una red entrenada a escuchar a un emisor sincero le saca **+8–9 puntos en 4
   jugadores** (y +4–5 en 6); sorda vuelve a 50%. El canal sirve; lo que no servía en r4/r5 era el emisor.
2. **Un mentiroso consistente también se decodifica** (+5 en 4 jugadores), más despacio: la red tiene que aprender
   a leer al revés. Una mentira sistemática es tan informativa como la verdad.
3. **La moneda no se puede explotar**: si la mitad de lo dicho es verdad y la otra mitad un nivel al azar, lo dicho
   no agrega nada a las señas y las cartas jugadas. Es exactamente el equilibrio de balbuceo al que llegó el
   self-play de r4/r5: con intereses opuestos, el emisor converge a no informar, y entonces nadie escucha.
4. **Mentir no le rinde contra las redes y heurísticas actuales**, porque ninguna escucha de verdad. Para que la
   mentira pague hace falta un rival que crea; y para que un rival crea, hace falta un emisor que en promedio diga
   la verdad. Es la dinámica que vale la pena entrenar ahora (r7): equipos que hablan y escuchan con señas privadas,
   midiendo si la red aprende a mentir "a propósito" (decir lo contrario de la seña cuando conviene) y cuánto le
   rinde contra un rival que sí escucha (por ejemplo, la propia `r6-escucha-verdad`).
5. Para el juego: una red que escucha (`r6-escucha-verdad`) le gana 53,7% a R tal cual en 4 jugadores, además de
   leer a quien dice la verdad. Candidata a reemplazar a r3 como Experta en 4 y 6, después de medirla contra r3 y la
   difícil. En 6 el efecto es menor: más jugadores, más señas, menos decisiones por cabeza.

Nota de método: la fase C se cayó la primera vez (`declare -A` no existe en la bash 3.2 de macOS) y se corrió a la
mañana con `SOLO_C=1`; los registros de las corridas no cambian.
