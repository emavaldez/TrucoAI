# Historia 1-8: Flor configurable (motor v2)

Status: ready-for-dev
wf-id: `1-8-flor` · kind: `refactor`
Depende de: 1-7

## Historia

Como jugador que juega "con flor",
quiero poder activar la flor y que se cante, anule el envido y se resuelva con contraflor y contraflor al resto,
para jugar con las reglas de mi mesa.

## Criterios de aceptación

1. **Apagada no cambia nada:** con `rules.flor === false`, `DECLARE_FLOR`/`ANSWER_FLOR` nunca son legales y todos los tests previos pasan sin cambios.
2. **Detección** (`flor.ts`): `hasFlor(dealt)` = 3 cartas del mismo palo; `florScore(cards)` = 20 + suma de `envidoValue` de las tres.
3. **Declaración obligatoria (`DECLARE_FLOR`)** — con flor activada, un participante con flor **no declarada** que todavía no jugó carta en la primera baza (de la mano o submano):
   - si es el actor en `PLAYING`: su **única** acción legal es `DECLARE_FLOR`;
   - si al equipo de ese jugador le cantan envido (`CALL_ENVIDO`) o truco en primera baza: el respondedor pasa a ser **ese** jugador (el primero en orden si hay varios) y su única acción legal es `DECLARE_FLOR`.
   Al declarar: se agrega a `flor.declared`, `status = 'declared'`, evento `FLOR_DECLARED`, `CantoRecord FLOR`; el envido queda `status = 'cancelled'`
   (si había cadena pendiente se descarta sin puntos, `pending = null`) y ya no hay `CALL_ENVIDO` en la mano.
   Después vuelve a la fase de donde venía (`flor.resumePhase`: `PLAYING` o `AWAITING_TRUCO`; con un envido cancelado que venía de "envido está primero" vuelve a `AWAITING_TRUCO`).
4. **Flor contra flor:** cuando declara flor el **primer jugador del segundo equipo** con flor, pasa a `phase = 'AWAITING_FLOR'` con
   `pending = { kind: 'RESPUESTA_FLOR', responderId: ese jugador, callerTeam: primer equipo }` y sus acciones legales son
   `ANSWER_FLOR` `ACHICO` | `CONTRAFLOR` | `CONTRAFLOR_AL_RESTO`:
   - `ACHICO` → primer equipo +4; flor resuelta.
   - `CONTRAFLOR` → `pending = { kind: 'CONTRAFLOR', responderId: responderFor(primer equipo), callerTeam: segundo }` con `QUIERO` | `NO_QUIERO` | `CONTRAFLOR_AL_RESTO`:
     `QUIERO` → se comparan las flores declaradas (mejor de cada equipo, empate al más cercano al mano) y el ganador suma 6; `NO_QUIERO` → el que cantó contraflor suma 4.
   - `CONTRAFLOR_AL_RESTO` (desde la respuesta o subiendo una contraflor) → `pending = { kind: 'CONTRAFLOR_AL_RESTO', responderId: rival, callerTeam }` con `QUIERO` | `NO_QUIERO`:
     `QUIERO` → el ganador de la comparación suma `faltaValue(state, ganador)`; `NO_QUIERO` → el que cantó al resto suma 6.
   En `AWAITING_FLOR` no son legales `PLAY_CARD`, truco, envido ni mazo.
5. **Solo un equipo con flor:** al completarse la primera baza (antes de resolverla) si hay flores declaradas de un solo equipo y la flor no está resuelta,
   ese equipo suma **3 por cada flor declarada**; evento `FLOR_RESOLVED` (con `revealed` de las flores declaradas).
6. **Tabla única** `FLOR_POINTS = { flor: 3, achico: 4, contraflor: 6, contraflorNoQuiero: 4, alRestoNoQuiero: 6 }` en `flor.ts`.
7. **Puntos en el momento** vía `addPoints` (razón `FLOR`); si llegan a 30 → `MATCH_OVER`.
8. **Observación:** `florDeclared` y `publicScores` con `kind: 'FLOR'` solo para flores mostradas en una comparación (querida) o declaradas únicas al resolverse.
9. **Escenarios** (`scenarios/flor.test.ts`, mazo fijo, 2 y 4 jugadores, y una submano de pica-pica):
   flor única (+3); dos flores del mismo equipo (+6); flor anula envido pendiente; flor declarada respondiendo a un truco en primera baza y el truco sigue pendiente;
   con flor me achico (+4); contraflor querida (+6 al mejor); contraflor no querida (+4); contraflor al resto querida (falta) y no querida (+6); empate de flores → más cercano al mano.
10. **Simulación:** agregar al test de 1-6 los modos 2p/4p/6p con `flor: true` (200 partidas c/u), 0 violaciones; `npm run sim -- --flor` funciona.
11. Cobertura `src/engine/**` ≥ 90/85; typecheck, lint, test, build en verde.

## Tareas

- [ ] `flor.ts`: detección, puntaje, tabla (AC 2, 6)
- [ ] Legalidad y declaración obligatoria, cancelación de envido, retorno de fase (AC 1, 3)
- [ ] Flor contra flor (AC 4)
- [ ] Resolución de flor única al cerrar la 1ª baza (AC 5, 7)
- [ ] Observación (AC 8)
- [ ] Escenarios y simulación (AC 9, 10)
- [ ] Completar Dev Agent Record

## Dev Notes

- Probabilidad real de flor ≈ 5% por jugador: para los escenarios usá siempre `deck` fijo.
- Los valores 3/4/6 son por defecto del GDD §7 y **pueden cambiar**: por eso la tabla única.
- Si algo del GDD §7 resulta ambiguo al implementar, **detenete** y anotalo en `implementation.md` (decisión de reglas = Emmanuel).

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "src/sim/*", "scripts/sim.ts", "docs/stories/1-8-flor.md"]
```

### Referencias
- GDD §7 · Arquitectura §4 (`FlorState`, `DECLARE_FLOR`, `ANSWER_FLOR`)

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
