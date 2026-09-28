# r4-piloto — la red que habla y escucha (2026-09-28)

Desde r3 (iteración 560) con 48 entradas nuevas (lo dicho por cada asiento) y 8 salidas nuevas (qué decir), en
cero. Solo 4 jugadores y solo el tanto. Configuración: `config/r4-piloto.json`. Corrió de 16:24 a 17:34 sin
cortes (16 actores + GPU; ~9,6 s por iteración).

## Fases

| Fase | Resultado |
|---|---|
| Imitación de lo que se dice | 6 épocas (solo la última capa, filas de charla): pérdida 0,91 → 0,59; acierto 78% |
| Red de imitación contra la difícil | 72% (igual que r3: el resto de la red no cambió) |
| PPO | 300 iteraciones de 1024 partidas de 4 |

## Duelos (300 pares = 600 partidas, IC90 ±3 puntos)

| Iteración | Difícil | r3 | Sí misma callada | Sí misma sorda |
|---|---|---|---|---|
| 20 | 70,7% | 48,8% | 45,2% | 50,0% |
| 100 | 70,8% | 50,0% | 49,0% | 51,2% |
| 200 | 72,5% | 55,5% | 50,8% | 49,3% |
| **240 (mejor)** | **75,5%** | **55,5%** | 51,3% | 49,5% |
| 300 | 73,3% | 55,2% | 48,0% | 51,3% |

- Le gana a r3 por ~5 puntos en 4 jugadores (probablemente por entrenar solo en 4; r3 repartía 2, 4 y 6).
- Contra sí misma callada o sorda, 50%: **ni hablar ni escuchar le da ventaja.**

## Qué dice (tanto)

| | Con 28+ dice mucho / algo / nada / calla | Con ≤23 dice mucho / algo / nada / calla | Miente "nada" con 28+ |
|---|---|---|---|
| Iteración 1 (imitación) | 35–43% / 31–34% / 25–31% / 0% | 2–3% / 19% / 77–78% / 1% | 29% |
| Iteración 50 | | | 74% |
| Iteración 300 | 19–22% / 22–33% / 40–41% / 8–15% | 18–23% / 18–27% / 44% / 10–14% | 41% |

Al final dice casi lo mismo tenga lo que tenga: **equilibrio de "balbuceo"** (la charla no informa). Al
escuchar, tampoco le cree a nadie: con el pie en la 1ra baza canta envido 68% si el otro equipo dijo "nada" y
72% si dijo que tenía. El engaño casi no funciona: después de un "nada", el rival canta 10–17% de las veces.

## Lectura

El compañero ya le pasa el tanto al pie por seña (privada y verdadera): hablar en público no le agrega nada al
equipo, solo puede engañar al rival, el rival aprende a no creer y la charla pierde el valor (charla sin costo
con un canal privado que ya cubre la información). Además, en este diseño la charla no tenía memoria entre manos
ni el premio de una mentira cargaba con lo que costaba después: a 30 puntos, en el truco real, el creer y el
mentir se arrastran. Eso es lo que prueba r4-reputación.
