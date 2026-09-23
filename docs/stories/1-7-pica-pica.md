# Historia 1-7: Pica-pica en 6 jugadores (motor v2)

Status: ready-for-dev
wf-id: `1-7-pica-pica` · kind: `refactor`
Depende de: 1-6

## Historia

Como jugador de 6,
quiero que el pica-pica funcione como tres partidas 1 contra 1 dentro de la mano, cada una con sus cantos y sus puntos,
para jugar la variante como en la mesa y sin que el juego se cuelgue.

## Criterios de aceptación

1. **Activación y alternancia** (`picapica.ts`), evaluadas en `startNextHand` (y en `createMatch`, aunque con 0-0 nunca aplica):
   - solo si `rules.playerCount === 6 && rules.picaPica`;
   - `eligible = scores[0] >= 5 && scores[0] <= 25 && scores[1] >= 5 && scores[1] <= 25`;
   - si `eligible`: la mano es pica-pica si `state.picaPicaNext`; después se invierte `picaPicaNext`;
   - si no `eligible`: mano redonda y `picaPicaNext = true` (así la primera mano elegible es pica-pica). `createMatch` inicializa `picaPicaNext = true`.
2. **Estructura de la mano pica-pica:** se reparte a los 6 como siempre (misma rotación de repartidor [ENG-14]). `hand.picaPica = { submano: 0, pairs, results: [] }` con
   `pairs[k] = [asiento (manoSeat + k) % 6, asiento (manoSeat + k + 3) % 6]` para k = 0, 1, 2. Evento `HAND_STARTED` con `picaPica: true` y `SUBMANO_STARTED`.
3. **Cada submano** es una mano completa de 1v1: `participants = pairs[k]` (el primero es el mano efectivo), `turnId = pairs[k][0]`,
   bazas, truco, envido, flor y mazo **propios** (se resetean `tricks`, `currentTrick`, `truco`, `envido`, `flor` al empezar cada submano; `cantos` se acumula en la mano).
   La ventana de envido es la primera baza **de la submano**. Falta envido = 7 (ya soportado por `faltaValue` en 1-4).
4. **Fin de submano:** los caminos existentes (bazas decididas, truco no querido, mazo) siguen llamando a `endHand`; `endHand` detecta `hand.picaPica`
   y en ese caso: suma los puntos al equipo ganador **de la submano** con `addPoints` (en el momento), agrega un `SubmanoResult`, y
   - si `submano < 2` → arranca la siguiente submano **dentro de la misma acción** (evento `SUBMANO_STARTED`), `phase = 'PLAYING'`, y `getActor` devuelve el primero del par nuevo
     (sin depender de la UI) **[AI-04, UI-02]**;
   - si era la última → cierra la mano: `hand.result = { winnerTeam: equipo con más puntos en submanos (empate → equipo del mano), points: suma, reason: 'PICA_PICA' }`,
     `HandRecord` con `picaPica: true`, `phase = 'HAND_OVER'`, evento `HAND_OVER`.
   Un truco no querido o un mazo terminan **solo esa submano** [ENG-14].
5. **Fin de partida en medio del pica-pica:** si `addPoints` llega a 30 en cualquier submano → `MATCH_OVER` inmediato (con `HandRecord` `MATCH_ENDED` como en 1-5).
6. **Observación:** `unseenCards` descuenta las cartas jugadas en submanos anteriores; `picaPica` presente en la observación.
7. **Escenarios** (`scenarios/picapica.test.ts`, mazo fijo, `withScores(state,[10,10])`):
   - 3 submanos completas; puntos de cada una sumados en el momento y al equipo correcto;
   - truco querido en la submano 0 paga 2 en esa submano (no se pierde) [ENG-14];
   - no quiero en la submano 1 no termina la mano; la submano 2 se juega;
   - falta envido en una submano vale 7;
   - las submanos 1 y 2 (IA vs IA) tienen actor inmediatamente [UI-02];
   - alternancia: pica-pica, redonda, pica-pica mientras siga elegible; al salir de [5,25] vuelve a redonda;
   - repartidor rota en manos pica-pica igual que en redondas.
8. **Simulación:** el test de 1-6 en 6p pasa con `picaPica: true`, 200 partidas, 0 violaciones (el invariante 2 cuenta cartas por submano).
9. Cobertura `src/engine/**` ≥ 90/85; typecheck, lint, test, build en verde.

## Tareas

- [ ] Activación/alternancia (AC 1)
- [ ] Estructura y arranque de submanos (AC 2, 3)
- [ ] `endHand` con pica-pica (AC 4, 5)
- [ ] Observación (AC 6)
- [ ] Escenarios y simulación (AC 7, 8)
- [ ] Completar Dev Agent Record

## Dev Notes

- No dupliques la lógica de truco/envido para submanos: la clave es que todo use `hand.participants` y el mano efectivo `participants[0]`.
  Si alguna historia anterior usó "todos los asientos" en vez de `participants`, corregilo acá (está en tu alcance) y agregá test.
- `responderFor` ya filtra por `participants`: en una submano el humano solo responde si está en el par.

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "src/sim/*", "docs/stories/1-7-pica-pica.md"]
```

### Referencias
- GDD §10 · Auditoría ENG-14, AI-04, UI-02

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
