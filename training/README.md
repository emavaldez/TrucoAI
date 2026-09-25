# training/ — entrenamiento de la IA con RL

Todo lo de entrenar la IA vive acá. **No se publica:** Vercel sólo sube lo que no está en
`.vercelignore` (esta carpeta está excluida) y el juego publicado sólo incluye `dist/`.

El plan está en [`PLAN.md`](PLAN.md). Estado: **fase 0 sin empezar** (esperando el OK del plan).

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
  env/                 (fase 0) entorno sobre el motor: reset/step, observación, máscara de acciones
  actors/              (fase 0) Node: juega partidas en paralelo con el modelo actual
  learner/             (fase 1) Python/PyTorch: imitación, PPO, exportación de la red
  eval/                (fase 0) arena duplicada, tabla de rivales, métricas de estilo
  results/             resúmenes que sí se versionan
  runs/<id>/           (no va a git) checkpoints, logs y evaluaciones de cada corrida
```

## Que un corte no haga perder nada

El entrenamiento corre en la Mac de Emmanuel, así que se tiene que poder cortar en cualquier
momento (se apaga, se duerme, se cuelga, se cierra la terminal) y seguir donde estaba:

1. **Checkpoint cada 15 minutos** (configurable) y al terminar cada iteración larga: pesos de la red,
   estado del optimizador, estados de los generadores aleatorios, contador de pasos, la liga de
   rivales, la tabla de probabilidad de ganar por marcador y el historial de evaluaciones.
2. **Escritura atómica:** se escribe a un archivo temporal, se hace `fsync` y recién ahí se renombra.
   Un corte en medio de un guardado deja el checkpoint anterior intacto.
3. **Se guardan los últimos 5 y los 3 mejores** (por evaluación), no uno solo.
4. **Manifiesto por corrida** (`runs/<id>/manifest.json`): commit de git, configuración, hash de la
   codificación, fecha, máquina. Sin eso un checkpoint viejo no se puede interpretar.
5. **Logs en JSONL** (una línea por iteración: pérdidas, velocidad, evaluación): se leen aunque la
   corrida se haya cortado a mitad.
6. **Reanudar es el comportamiento por defecto:** correr el mismo comando con el mismo `--run`
   sigue desde el último checkpoint válido.
7. **Copia de respaldo opcional** (`checkpoint.backupDir`, por ejemplo una carpeta de iCloud o un
   disco externo): se copian los "mejores" ahí.
8. **Que la Mac no se duerma:** las corridas largas se lanzan con `caffeinate -dimsu` (viene con macOS).
</content>
