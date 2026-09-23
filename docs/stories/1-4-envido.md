# Historia 1-4: Envido (motor v2)

Status: ready-for-dev
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
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
