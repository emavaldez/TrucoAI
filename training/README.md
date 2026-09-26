# training/ — entrenamiento de la IA con RL

Todo lo de entrenar la IA vive acá. **No se publica:** Vercel sólo sube lo que no está en
`.vercelignore` (esta carpeta está excluida) y el juego publicado sólo incluye `dist/`.

El plan está en [`PLAN.md`](PLAN.md). Estado: **fases 0–2 listas para correr** (2 jugadores).

## Cómo se lanza (en la Mac)

```bash
cd ~/GameDev/TrucoAI
bash training/setup.sh        # una vez: entorno de Python, chequeos y una corrida mínima de prueba
bash training/train.sh r1     # entrena; si se corta, el mismo comando retoma
```

Para ver cómo va, en otra terminal:

```bash
source training/.venv/bin/activate
python training/learner/run.py status --run r1
tail -f training/runs/r1/stdout.log
```

La mejor red queda en `training/runs/r1/policies/best.{json,bin}`. PPO corta solo a las 1500 iteraciones
(`ppo.iterations` en `config/default.json`); para seguir, se sube ese número y se relanza.

Cada iteración muestra además la **entropía por tipo de decisión** (cartas, turno con posibilidad de cantar,
respuesta al truco, respuesta al envido) y el **estilo**: cuánto canta truco pudiendo, qué parte de esos
cantos son farol (sin un 3 o algo mejor), cuánto canta envido, el farol de envido (cantos con 23 o menos
de tantos), cuánto abre el envido según sus tantos y cuánto quiere/sube.

Una tercera línea muestra **el envido**: cuánto acepta (quiere o sube) cuando le cantan, según sus
tantos (`acepta_envido_<24` … `_31+`: ¿caza faroles o solo quiere con mucho?), y cómo le va cuando
canta: de las manos en que cantó envido con 23 o menos (`farol_envido_*`) o con 24 o más
(`tantos_envido_*`), en cuántas el rival no quiso (`_exito`), los puntos de envido netos por mano
(`_pts`) y el cambio medio en la probabilidad de ganar la partida en esa mano (`_dW`). Si `farol_envido_dW`
queda en cero o positivo, mentir en el envido le conviene; si es negativo, es un vicio.

**Prueba de explotabilidad** (se puede correr en paralelo, con menos actores):

```bash
python training/learner/run.py exploit --run r1 --target best --iters 150 --workers 6
```

Entrena una red nueva cuyo único rival es la red objetivo (congelada). Si le gana cerca de 50–55%, la
objetivo es sólida; arriba de ~65%, tiene un agujero que se puede explotar.

## Reglas de la carpeta

- **El motor del juego es uno solo** (`src/engine`, TypeScript). Acá no se reescriben reglas:
  Node juega las partidas con el motor real y Python sólo entrena la red.
- **La codificación de la observación también es una sola** (en TypeScript) y tiene tests
  "golden": la misma mesa da exactamente el mismo vector en el entrenamiento y en el navegador.
- **Siempre sin flor.** La configuración base (`config/default.json`) la deja apagada.
- **Lo que produce el entrenamiento no va a git:** `runs/`, `data/` y `exports/` están en
  `training/.gitignore`. Sí van a git el código, la configuración y los resúmenes de resultados
  que valga la pena guardar (`results/*.md`).

## Estructura (se va llenando por fases)

```
training/
  PLAN.md              plan y decisiones
  config/              configuraciones de cada corrida (JSON)
  env/                 TS: codificación, acciones, red (inferencia), tabla W
  actors/rollout.ts    TS: juega partidas con el motor (imitación, PPO, evaluación, tabla W)
  learner/             Python/PyTorch: run.py (todo el entrenamiento), common.py, parity_check.py
  setup.sh, train.sh   preparar la Mac y lanzar/retomar
  results/             resúmenes que sí se versionan
  runs/<id>/           (no va a git) checkpoints, logs y evaluaciones de cada corrida
```

## Que un corte no haga perder nada

El entrenamiento corre en la Mac de Emmanuel, así que se tiene que poder cortar en cualquier
momento (se apaga, se duerme, se cuelga, se cierra la terminal) y seguir donde estaba:

1. **Checkpoint al terminar cada iteración de PPO** (cada ~20–30 segundos): pesos de la red,
   estado del optimizador, estados de los generadores aleatorios, contador de pasos, la liga de
   rivales, la tabla de probabilidad de ganar por marcador y el historial de evaluaciones.
2. **Escritura atómica:** se escribe a un archivo temporal, se hace `fsync` y recién ahí se renombra.
   Un corte en medio de un guardado deja el checkpoint anterior intacto.
3. **Se guardan los últimos 5 y los 3 mejores** (por evaluación), no uno solo.
4. **Manifiesto por corrida** (`runs/<id>/manifest.json`): commit de git, configuración, hash de la
   codificación, fecha, máquina. Sin eso un checkpoint viejo no se puede interpretar.
5. **Logs en JSONL** (una línea por iteración: pérdidas, velocidad, evaluación): se leen aunque la
   corrida se haya cortado a mitad.
6. **Reanudar es el comportamiento por defecto:** `train.sh` con el mismo nombre sigue desde el último
   checkpoint válido, y si el proceso se cae lo relanza solo a los 30 segundos. Cada fase terminada
   (tabla W, datos de imitación, imitación) deja una marca y no se repite.
7. **Copia de respaldo opcional** (`checkpoint.backupDir`, por ejemplo una carpeta de iCloud o un
   disco externo): se copian los "mejores" ahí.
8. **Que la Mac no se duerma:** las corridas largas se lanzan con `caffeinate -dimsu` (viene con macOS).
</content>
