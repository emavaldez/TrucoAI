# Historia 1-4: Envido (motor v2)

Status: review
wf-id: `1-4-envido` · kind: `default`
Depende de: 1-3

## Historia

Como jugador,
quiero cantar envido, real envido y falta envido con la cadena y los puntos del reglamento,
para que los tantos se cobren bien y en el momento.

## Criterios de aceptación

1. **Puntaje** (`envidoScore.ts`): `envidoScore(cards: Card[]): number` según GDD §6.1, calculado siempre sobre `hand.dealt[playerId]` **[ENG-05]**.
   Tests: 7+6 de copa = 33; 1+12 de espada = 21; 10+11 de oro = 20; sin pares 7-5-4 de distintos palos = 7; tres figuras distintos palos = 0;
   tres del mismo palo 7-6-5 = 33 (dos más altas); caso ENG-05: el jugador ya jugó su 7 antes del envido y su puntaje sigue contando el 7.
2. **Ventana** (`CALL_ENVIDO` en `PLAYING`) legal para el actor si: `hand.tricks.length === 0`, `envido.status === 'none'`,
   `truco.level === 0`, `truco.pending === null`, y (cuando exista flor, 1-8) no hay flor declarada. Opciones: `E`, `R`, `F` **[ENG-13]**.
3. **Envido está primero [UI-05]:** en `AWAITING_TRUCO` con `pending.level === 1`, `hand.tricks.length === 0` y `envido.status === 'none'`,
   el respondedor del truco también tiene `CALL_ENVIDO` `E`/`R`/`F`. Al hacerlo: `envido.resumeTrucoAfter = true`, se resuelve la cadena de envido
   completa (fase `AWAITING_ENVIDO`) y al terminar vuelve a `phase = 'AWAITING_TRUCO'` con el mismo `truco.pending` (el mismo respondedor debe contestar el truco).
4. **Cadena** (`envido.ts`): al cantar, se agrega `{ call, by, team }` a `chain`, `status = 'calling'`,
   `pending = { responderId: responderFor(state, by) }`, `phase = 'AWAITING_ENVIDO'`, evento `ENVIDO_CALLED`, `CantoRecord`.
   Subidas legales para el respondedor (`nextEnvidoCalls(chain)`):
   - `[E]` → `E`, `R`, `F` · `[E,E]` → `R`, `F` · cadena cuyo último es `R` → `F` · último `F` → ninguna.
   - Nunca se baja (de F a E, de R a E) **[ENG-04]**.
   Acciones legales del respondedor en `AWAITING_ENVIDO`: `ANSWER_ENVIDO QUIERO`, `ANSWER_ENVIDO NO_QUIERO`, y `CALL_ENVIDO` con cada subida válida.
   **`PLAY_CARD` y `CALL_TRUCO` no son legales en `AWAITING_ENVIDO` [ENG-02].**
5. **Puntos** (`envidoPoints(chain, faltaValue)`): tabla GDD §6.3 completa como test parametrizado **[ENG-04]**:

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

6. **Falta [ENG-11]** (`faltaValue(state, winnerTeam)`): si `hand.picaPica !== null` → 7. Si no: `leader = max(scores)`;
   si `leader < 15` → `targetScore - scores[winnerTeam]` (el ganador llega a 30); si no → `targetScore - leader`.
   Tests: 20-10 → 10; 10-20 → 10; 14-3 → lo que le falte al ganador (27 si gana el de 3; 16 si gana el de 14); 29-29 → 1; 0-0 → 30.
7. **No quiero:** puntos "no querido" al equipo del **último** que cantó; `result = { winnerTeam, points, accepted: false, revealed: [] }`, `status = 'resolved'`,
   evento `ENVIDO_ANSWERED` + `ENVIDO_RESOLVED` + `POINTS` (vía `addPoints`, razón `ENVIDO`).
8. **Quiero:** se calculan los puntajes de los `participants` desde `hand.dealt`; orden de "decir" = `participants` desde el mano;
   gana el mayor, **empate para el primero en ese orden** **[ENG-12]**. `revealed` = los participantes en ese orden **hasta el ganador inclusive**
   (los posteriores dicen "son buenas" y no se revelan). Puntos: `envidoPoints(chain, faltaValue(state, ganador)).querido` vía `addPoints`.
   Eventos `ENVIDO_ANSWERED`, `ENVIDO_RESOLVED` (con `revealed`), `POINTS`.
9. **Después de resolver:** si `addPoints` terminó la partida → `MATCH_OVER` (nada más es legal). Si no: si `resumeTrucoAfter` → `AWAITING_TRUCO`, si no → `PLAYING`
   con el mismo `turnId`. Los puntos de envido se suman **en el momento**, nunca al final de la mano.
10. **Cierre de ventana:** al completarse la primera baza sin envido, ya no hay `CALL_ENVIDO` legal (test).
11. **Escenarios** (`scenarios/envido.test.ts`, mazo fijo, 2 y 4 jugadores):
    - cada fila de la tabla AC5 jugada de punta a punta con acciones reales, verificando marcador;
    - empate 4 jugadores: mano p0; p1 (equipo 1) y p2 (equipo 0) con 25 → gana equipo 1 porque p1 dice antes [ENG-12];
    - envido está primero: p0 canta truco, p1 canta envido, p0 quiere, se resuelve, y p1 sigue teniendo que responder el truco [UI-05];
    - después de truco querido no hay envido [ENG-13];
    - envido que lleva a 30 termina la partida en el acto (el resto de la mano no se juega).
12. Cobertura `src/engine/**` ≥ 90/85; typecheck, lint, test, build en verde.

## Tareas

- [ ] `envidoScore.ts` + tests (AC 1)
- [ ] Legalidad (ventana, envido está primero, subidas) (AC 2, 3, 4, 10)
- [ ] Tabla de puntos + falta (AC 5, 6)
- [ ] Resolución querido / no querido y retorno de fase (AC 7, 8, 9)
- [ ] Escenarios (AC 11)
- [ ] Completar Dev Agent Record

## Dev Notes

- Orden de "decir" y desempate: desde el **mano efectivo** `hand.participants[0]` (ver 1-2), en el orden de `participants`.

- Hay un `src/core/EnvidoScorer.ts` legacy: **no lo importes**; escribí `src/engine/envidoScore.ts` limpio (podés tomar la idea).
- `revealed` alimenta `Observation.publicScores` (1-6): nunca pongas ahí puntajes de quienes no "dijeron".
- `MAZO` con envido pendiente no es legal (lo formaliza 1-5; en esta historia simplemente no se agrega).

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "docs/stories/1-4-envido.md"]
```

### Referencias
- GDD §6 · Arquitectura §4 (`EnvidoState`) · Auditoría ENG-02, ENG-04, ENG-05, ENG-11, ENG-12, ENG-13, ENG-17, UI-05

## Dev Agent Record

### Agent Model Used
Hermes (perfil `trucoai`), modelo `deepseek-v4-flash` — worker de la historia 1-4 sobre el worktree
`/Users/emmanuelvaldez/GameDev/.worktrees/1-4-envido`, rama `task/1-4-envido`.

### Debug Log References
- `npx tsc --noEmit` → sin errores.
- `npm test` (vitest) → 22 archivos, 347 tests, todos en verde.
- `npm run test:coverage` → líneas 99.08 %, branches 94.25 %, funciones 100 % (umbral `src/engine/**` 90/85).
- `npm run lint` → 0 errores (82 warnings preexistentes del código legacy `src/core` + `src/ui`).
- `npm run build` → `tsc && vite build` OK.
- `wf verify -i 1-4-envido` → gate `alcance`, `tipos`, `lint`, `tests`, `build` y `arranque` en verde.

### Completion Notes List
- **AC 1** — `src/engine/envidoScore.ts`: puntaje puro de un jugador (GDD §6.1). Se calcula siempre sobre
  `hand.dealt[playerId]`, nunca sobre las cartas que quedan en la mano [ENG-05]: hay un test con el 7 ya jugado.
- **AC 2 / AC 10** — `canCallEnvido` exige `phase === 'PLAYING'`, ser el actor, primera baza, `envido.status === 'none'`,
  `truco.level === 0`, `truco.pending === null` y sin flor declarada [ENG-13].
- **AC 3** — `envidoFirstCalls` habilita `E`/`R`/`F` al respondedor de un truco de nivel 1 en la primera baza [UI-05];
  `resumeTrucoAfter` hace que al resolver la cadena se vuelva a `AWAITING_TRUCO` con el **mismo** `truco.pending`.
- **AC 4** — `nextEnvidoCalls` implementa las subidas (nunca se baja) [ENG-04]; en `AWAITING_ENVIDO` solo hay
  `ANSWER_ENVIDO` y subidas: nunca `PLAY_CARD` ni `CALL_TRUCO` [ENG-02].
- **AC 5 / AC 6** — `envidoPoints` (tabla del GDD §6.3, incluida la falta) y `faltaValue` (7 en pica-pica; si el líder
  está en las malas, lo que le falta al ganador) [ENG-11].
- **AC 7 / AC 8** — `applyAnswerEnvido`: no querido paga al equipo del último que cantó; querido evalúa a los
  `participants` desde el mano, gana el mayor con empate para el primero en ese orden [ENG-12] y `revealed` corta en el
  ganador [ENG-17].
- **AC 9** — los puntos se suman en el momento con `addPoints` (razón `ENVIDO`); si la partida termina, la fase queda en
  `MATCH_OVER` sin tocar bazas ni cartas.
- **AC 11** — `src/engine/__tests__/scenarios/envido.test.ts`: las 11 filas de la tabla jugadas de punta a punta (querido y
  no querido), el empate de 4 jugadores [ENG-12], "el envido está primero" completo, el cierre de ventana [ENG-13] y el
  envido que termina la partida.
- **AC 12** — cobertura ≥ 90/85, typecheck, lint, test y build en verde.
- **Ajustes en los tests de la 1-3** (consecuencia del envido, no cambios de comportamiento del truco):
  `apply.test.ts`, `truco.test.ts` y `scenarios/truco.test.ts` ahora esperan también los `CALL_ENVIDO` en las acciones
  legales del respondedor. La invariante `AWAITING_TRUCO ⇔ truco.pending !== null` [ENG-18] pasa a tener dos excepciones
  documentadas: `AWAITING_ENVIDO` mientras corre "el envido está primero" (AC 3) y `MATCH_OVER` si el envido cerró la
  partida con el truco sin responder (AC 9).
- Sin desvíos de la historia: no hubo reglas ambiguas ni archivos fuera del alcance.

### File List
- `src/engine/envidoScore.ts` (nuevo) — puntaje de envido de un jugador (AC 1).
- `src/engine/envido.ts` (nuevo) — ventana, "el envido está primero", cadena y subidas, tabla de puntos, falta,
  legalidad del respondedor y resolución (AC 2 a 10).
- `src/engine/legal.ts` — `getActor` en `AWAITING_ENVIDO`; `getLegalActions` con los cantos de envido.
- `src/engine/apply.ts` — despacho de `CALL_ENVIDO` / `ANSWER_ENVIDO`.
- `src/engine/index.ts` — export de `envidoScore`.
- `src/engine/__tests__/envidoScore.test.ts` (nuevo), `src/engine/__tests__/envido.test.ts` (nuevo),
  `src/engine/__tests__/scenarios/envido.test.ts` (nuevo).
- `src/engine/__tests__/helpers.ts` — helpers `callEnvido` / `answerEnvido`.
- `src/engine/__tests__/apply.test.ts`, `src/engine/__tests__/truco.test.ts`,
  `src/engine/__tests__/scenarios/truco.test.ts` — ajustes por los cantos de envido.
- `workflow/runs/1-4-envido/implementation.md` — evidencia de la implementación.

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
- 2026-09-23 · Hermes (worker) · Implementación completa (envido: puntaje, ventana, cadena, falta y resolución) + tests
  unitarios y de escenarios. Status → `review`.
