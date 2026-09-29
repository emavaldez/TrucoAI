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

**Seguir desde otra corrida** (`init` en la configuración): `training/config/r2.json` retoma r1 en la
iteración 1500 y suma a la liga las redes que la explotaron (`ppo.exploiters`). `train.sh <corrida>` usa
`training/config/<corrida>.json` si existe:

```bash
bash training/train.sh r2
```

**Equipos (4 y 6 jugadores):** `bash training/train.sh r3` (usa `config/r3.json`). Necesita
`runs/r2/ckpt/iter_002000.pt`. Hace la tabla W de 4 y de 6, imita a la difícil en 4 y 6 (unos 30 min) y
sigue con PPO. En la terminal, además de lo de siempre: `por jugadores` (contra sí misma y la difícil en
2, 4 y 6) y `pie` (qué indica el pie de la red, cuánto le obedecen sus compañeros y el premio vigente).

Con `eval.gauntlet`, cada 10 iteraciones además de la difícil juega duelos contra redes fijas (versiones
anteriores y atacantes), y la "mejor red" se elige por el promedio de esos duelos.

**La red que habla y escucha (r4, piloto):** `bash training/train.sh r4-piloto` (usa `config/r4-piloto.json`).
Necesita `runs/r3/ckpt/iter_000560.pt` y `runs/r3/policies/best`. Solo 4 jugadores y solo el tanto:
- Arranca de r3 con 48 entradas nuevas (lo último que dijo cada asiento del tanto y de las cartas: mucho, algo,
  nada o se calló) y 8 salidas nuevas (qué decir), todas en cero: al principio juega exactamente como r3.
- Se habla en los mismos momentos que en el juego (`src/ai/talk/claims.ts`): cuando el pie va a decidir en la
  1ra baza y todavía puede cantar envido, sus compañeros dicen algo del tanto (o se callan). Todo es público.
- La imitación es solo de lo que se dice (la heurística dice la verdad, salvo el engaño del envido); el resto
  de la red no se toca. Después, PPO contra sí misma, la liga y las heurísticas, que escuchan (le creen 75%) y
  hacen la jugada de esperar y subir.
- En la terminal, la línea `charla`: qué dice según lo que tiene (`dice_tanto_<verdad>_engano` cuando el pie
  rival todavía podía cantar, `_resto` el resto), cuánto miente (`miente_nada_con_mucho`,
  `miente_mucho_con_nada`), cuánto canta envido según lo que oyó del otro equipo (`canta_si_nada`,
  `canta_si_tiene`, `canta_si_nada_dicho`) y cómo le va al engaño (`engano_rival_canta`, `engano_pts`).
- Cada 20 iteraciones, además de la difícil y r3, juega contra sí misma **callada** y **sorda**: si le gana,
  hablar (o escuchar) le sirve.

Un duelo con charla: `python training/learner/run.py duel --a runs/r4-piloto/policies/best --b hard --players 4 --talk tanto`.

**Reputación (r4-reputación):** `bash training/train.sh r4-reputacion` (usa `config/r4-reputacion.json`; necesita
`runs/r4-piloto/ckpt/iter_000240.pt`, `runs/r4-piloto/policies/best` y `runs/r3/policies/best`). Se habla del tanto
y de las cartas; lo dicho se comprueba al terminar la mano (el tanto si lo cantó o jugó sus tres cartas; las cartas
si las jugó todas) y cada jugador arrastra en la partida cuántas veces dijo la verdad y cuántas lo pescaron
mintiendo (`src/ai/talk/reputation.ts`). La red lo ve; la heurística le cree 75% de entrada y 30 puntos menos por
cada mentira pescada. La trayectoria de cada jugador es la partida entera (`talk.matchCredit`): una mentira carga
con lo que cueste en las manos siguientes; las primeras 10 iteraciones solo aprende el crítico
(`ppo.criticWarmup`). En la línea `charla`, además: `dice_cartas`, `pescada_mintiendo` y
`canta_si_nada_confiable` / `canta_si_nada_mentiroso` (¿le cree menos al que ya pescó?).

**Tanda de la noche:** `caffeinate -dimsu bash training/noche.sh` corre una atrás de otra `r4-sinrep` (control sin
reputación), `r5-charla` (la red que habla en 4 y 6, 700 iteraciones) y duelos de 1000 pares; guarda los registros
con `archive`. En la línea `charla`, `comprobado_tanto` / `comprobado_cartas`: de lo que dijo, cuánto se pudo
comprobar al terminar la mano.

## Registro (para la tesis)

Todo lo que se corre queda registrado en git, en `results/`:

```bash
python training/learner/run.py archive --run r2                     # registro de la corrida → results/runs/r2/
python training/learner/run.py archive --run r2 --backup ~/ruta     # además, copia de las redes fuera del repo
python training/learner/run.py duel --a runs/r2/policies/best --b runs/r1/policies/iter_001500 \
    --pairs 1000 --note "¿r2 mejora a r1?"                         # → results/duelos.jsonl
```

Y cada paso con su porqué va en `results/BITACORA.md`.

## Lenguaje: hablarle a la mesa (para la tesis)

El juego entiende frases con reglas y, opcionalmente, con EmbeddingGemma (`src/ai/talk/`). Para medir cuánto
entiende cada método sobre el corpus etiquetado (`src/ai/talk/corpus.ts`), en la Mac (baja el modelo la
primera vez):

```bash
node --import tsx training/lang/eval-intents.ts     # → training/results/intents-eval.json
```

Entrena con `reglas` + `ejemplos` y prueba con las `libres` (que nunca se usan para entrenar): el acierto de
las reglas, el del vecino más parecido y el de una regresión logística sobre los vectores de EmbeddingGemma
(regularización y temperatura por validación cruzada), con log-loss y calibración (ECE), y el de la combinación
que usa el juego. Guarda el clasificador en `public/models/intent-head.json` (lo usa el juego; commitearlo) y el
reporte en `training/results/intents-eval.json`. Con `EVAL_FAKE=1` corre con vectores falsos (para probar el script).

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
  env/                 TS solo del entrenamiento: tabla W, premio por obedecer, carga de redes desde disco
                       (la codificación, las acciones y la red están en src/ai/rl/: las comparte el juego)
  actors/rollout.ts    TS: juega partidas con el motor (imitación, PPO, evaluación, tabla W)
  learner/             Python/PyTorch: run.py (todo el entrenamiento), common.py, parity_check.py
  setup.sh, train.sh   preparar la Mac y lanzar/retomar
  results/             lo que sí va a git: BITACORA.md (registro cronológico), <corrida>.md,
                       runs/<corrida>/ (config, log comprimido, resumen) y duelos.jsonl
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
