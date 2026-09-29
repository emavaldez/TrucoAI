# r4-reputación — lo dicho se comprueba y se arrastra en la partida (2026-09-28)

Desde la mejor de r4-piloto (iteración 240) con 12 entradas nuevas (reputación en la partida: verdades y mentiras
pescadas de cada jugador). Se habla del tanto y de las cartas; lo dicho se comprueba al terminar la mano; la
trayectoria es la partida entera; la heurística le cree según la reputación. Solo 4 jugadores.
Configuración: `config/r4-reputacion.json`. Corrió de 19:15 a 20:34 sin cortes (~13 s por iteración).

## Fases

| Fase | Resultado |
|---|---|
| Imitación de lo que se dice (tanto y cartas) | 6 épocas: pérdida 0,76 → 0,44; acierto 83% |
| Red de imitación contra la difícil | 71% |
| PPO | 300 iteraciones de 1024 partidas de 4 (las 10 primeras solo el crítico) |

## Duelos (300 pares = 600 partidas, IC90 ±3 puntos)

| Iteración | Difícil | r3 | r4-piloto | Sí misma callada | Sí misma sorda |
|---|---|---|---|---|---|
| 20 | 71,7% | 53,2% | 52,0% | 49,8% | 52,8% |
| **40 (mejor)** | 75,3% | 55,0% | 50,3% | 50,0% | 51,8% |
| 140 | 77,7% | 50,7% | 49,8% | 51,3% | 48,7% |
| 200 | 76,7% | 51,0% | 49,3% | 50,7% | 47,3% |
| 300 | 73,8% | 51,5% | 50,2% | 52,8% | 46,3% |

- Juega igual que r4-piloto (≈50%); contra r3, de 55% bajó a ≈50%. Contra la difícil, 72–78%.
- Contra sí misma callada o sorda sigue en ≈50% (la última evaluación, 46,3% contra la sorda, es un punto aislado).

## Qué dice

| | Tanto: con 28+ dice mucho / nada | Tanto: con ≤23 dice mucho / nada | Cartas: con buenas dice mucho / nada | Cartas: seco dice mucho / nada |
|---|---|---|---|---|
| Iteración 1 (imitación) | 25–44% / 27–40% | 1% / 78–84% | 61% / 2% | 2% / 74% |
| Iteración 300 | 20–24% / 41–44% | 9–14% / 55–59% | 41% / 9% | 10% / 51% |

- **El tanto vuelve a perder significado** (como en el piloto), aunque queda algo de información: con poco tanto dice
  "nada" 55–59% y con mucho, 41–44%.
- **Lo que dice de las cartas conserva el significado:** con buenas cartas dice "mucho" 4 veces más que estando seco,
  y "nada" 5 veces menos. Es la charla que le sirve al compañero (las señas son del principio y no dicen lo que
  queda después de la 1ra baza).
- Lo pescan mintiendo cada vez más: de lo que se pudo comprobar, 10% era mentira al principio y 22% al final.
- **La reputación no se nota en cómo escucha:** con el pie en la 1ra baza canta envido 55% si el "nada" vino de alguien
  confiable y 60% si vino de alguien ya pescado mintiendo (esperable al revés; la diferencia es chica y puede venir
  de que las mentiras pescadas se acumulan al final de la partida, con otro marcador).
- El engaño sigue sin funcionar: después de un "nada", el rival canta envido ~10% de las veces.

## Lectura

La charla que conserva el significado es la que le sirve al equipo (las cartas: información que el compañero no
tiene); la que solo sirve para engañar al rival (el tanto, que el compañero ya sabe por seña) se degrada hasta casi
no informar, con o sin reputación. Con 300 iteraciones, la reputación en la partida no alcanzó para que mentir
tuviera un costo visible. Candidatos para el juego: r4-piloto (iteración 240, la más fuerte contra r3) o esta
(iteración 40, que además habla de las cartas con sentido).
