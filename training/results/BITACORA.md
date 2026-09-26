# Bitácora del entrenamiento de TrucoAI

Registro cronológico de lo que se hizo, por qué y qué salió. Horas en Argentina (UTC−3).
Los datos crudos de cada corrida están en `results/runs/<corrida>/` (configuración, manifiesto,
`log.jsonl.gz` con una línea por iteración, `stdout.log.gz` y `summary.json`); los duelos entre redes, en
`results/duelos.jsonl`. El código de cada momento se recupera con el commit que figura en cada entrada
(y, desde el 2026-09-26, en cada evento `start` del log).

## Cómo se registra

- **En git (para siempre):** código, configuraciones (`config/`), esta bitácora, resúmenes por corrida
  (`results/<corrida>.md`), registro de cada corrida (`results/runs/`) y duelos (`results/duelos.jsonl`).
- **Solo en la Mac:** `runs/<corrida>/` con las redes (`policies/`, 1,4 MB cada una), checkpoints y datos de
  imitación (6 GB). Para respaldarlo fuera del repo: `run.py archive --run <corrida> --backup <carpeta>`.
- Después de cada corrida: `python training/learner/run.py archive --run <corrida>` y una entrada acá.
- Cada comparación entre redes: `python training/learner/run.py duel --a ... --b ... --note "para qué"`.

---

## 2026-09-25 — Plan

- **Plan v2** (`PLAN.md`, commit `df0ff80`) después de leer los papers de `Papers Truco` y `Papers Futbol`.
  Decisiones: recompensa = cambio en la probabilidad de ganar la partida (no diferencia de puntos, como la
  tesis uruguaya); PPO con liga (no Deep Monte Carlo solo); imitación de la heurística difícil primero y KL
  hacia ella; evaluación con partidas duplicadas e IC 90%; una sola codificación en TypeScript para
  entrenamiento y juego.
- **Decisiones de Emmanuel:** siempre sin flor; entrenar en su MacBook Pro M5 Max (18 núcleos, GPU de 40,
  128 GB); resultados a prueba de cortes; el pie coordina al equipo y es el único que canta envido.

## 2026-09-25 — Implementación y prueba chica (commit `31214e8`)

- Observación de 1006 valores (huella `78d8b04c`), 12 acciones con máscara, red 1006→256→256→128→12
  (358.028 parámetros), crítico asimétrico que ve las cartas de todos (solo en entrenamiento).
- Paridad PyTorch ↔ TypeScript: diferencia máxima 1,3e-8.
- Prueba chica en la nube (2 núcleos): imitación 31% contra la difícil; PPO 66,5% (IC90 62,5–70,3) en 400
  partidas después de 16 iteraciones chicas.

## 2026-09-25 16:55 — r1 (2 jugadores, sin flor)

Configuración: `results/runs/r1/config.json`. 16 actores Node + red en la GPU (MPS), ~17–20 mil decisiones/s.

| Fase | Resultado |
|---|---|
| Tabla W | 8.000 partidas difícil vs difícil, 164.628 manos |
| Datos de imitación | 100.000 partidas, 6,41 M decisiones (8,5 min) |
| Imitación | 8 épocas, 92,4% de acierto en validación; **49,8%** contra la difícil (IC90 48,5–51,1, 4.000 partidas) |
| PPO | 1.500 iteraciones de 4.096 partidas, 17:05 → 02:38 del 26 |

- 17:58 (commit `08637f5`): se suman entropía por tipo de decisión, métricas de estilo y la prueba de
  explotabilidad; r1 se reinicia a las 18:04 desde su último checkpoint (sin perder nada). Desde la
  iteración 177 hay entropía por decisión en el log.
- 18:28 (commit `84ea7d3`): se suma el farol de envido; r1 se reinicia a las 18:48. Desde la iteración 276
  hay métricas de envido.
- Contra la difícil: 86,4% en la iteración 40 y después 81–86% hasta el final (1500: 83,4%). La medida se
  saturó. Como la "mejor red" se elegía por esa medida, quedó elegida la 40.

## 2026-09-25 18:05 — Explotabilidad de la 40 (`r1-br-r1-iter40`)

Red nueva entrenada solo contra la 40 congelada. En 40 iteraciones le ganaba **71,7%** (IC90 69,3–74,0) y
seguía subiendo; se cortó en la 45 para usar la máquina en la siguiente prueba. Conclusión: la 40 era
muy explotable.

## 2026-09-25 18:48 — Explotabilidad de la 270 (`r1-br-r1-iter270`)

150 iteraciones: **65,9%** al final, todavía subiendo despacio. Lo que explotó: el envido. La atacante
terminó cantando envido el 93% de las veces que podía (la mitad con 23 o menos) y la 270 decía "no quiero"
de más.

## 2026-09-26 11:40 — Duelos entre versiones de r1 (`results/duelos.jsonl`)

| Duelo | Gana la primera | IC90 |
|---|---|---|
| 1500 vs 750 | 54,1% | 51,2–57,0 |
| 1500 vs 270 | 63,0% | 60,2–65,8 |
| 1500 vs 40 | 74,8% | 72,1–77,2 |
| 270 vs 40 | 67,1% | 64,3–69,8 |
| atacante de la 270 vs 1500 | 41,5% | 38,7–44,4 |
| atacante de la 40 vs 1500 | 30,5% | 27,9–33,2 |
| atacante de la 40 vs 270 | 41,1% | 38,3–44,0 |

Conclusiones: r1 siguió mejorando toda la corrida aunque contra la difícil no se viera; la liga cerró los
agujeros que habían encontrado las atacantes viejas. Lección: elegir la mejor red por duelos contra redes
fijas, no contra la heurística.

## 2026-09-26 11:59 — Métricas del resultado del envido (commit `1a5d47e`) y explotabilidad de la 1500

- Nuevas métricas: cuánto acepta el envido según los tantos; de los envidos cantados con ≤23 (farol) y con
  24+, en cuántos el rival no quiso, puntos de envido netos y ΔW por mano.
- Primer vistazo (150 partidas de la 1500): farol 59% de éxito, −0,19 puntos, ΔW ≈ 0; con tantos +0,96
  puntos, ΔW +0,038. Acepta envido con <24 el 19%.
- `r1-br-r1-iter1500`, 150 iteraciones: **69,9%** (IC90 67,5–72,2), estable desde la iteración 110.
  Lo que explotó: el truco. La atacante pasó de 32% a 74% de farol de truco y de 39% a 67% de "quiero" al
  truco: la 1500 se deja correr con el truco y a la vez miente de más. En el envido aguanta: a la atacante
  mentir en el envido le cuesta (ΔW −0,007) y no le caza los faroles (acepta con <24 el 7%).

## 2026-09-26 — r2 (commit `5a78ee5`)

Sigue r1 desde la 1500 hasta la 2000 con las tres atacantes como rivales fijos de la liga (15% de las
partidas) y la mejor red elegida por duelos contra la 1500 de r1 y las atacantes de la 1500 y la 270
(`config/r2.json`). Objetivo: que la atacante de la 1500 baje de 70% hacia 50%, y que una prueba de
explotabilidad nueva quede claramente por debajo de 70%.
