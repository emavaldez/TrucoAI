# Implementación: UI mesa v2 sobre el juego actual

- ID: `0-4-ui-mesa-v2-legacy` · Rama: `task/0-4-ui-mesa-v2-legacy` · Worker: Hermes perfil `trucoai` (modelo `qwen3.8-flash`)
- Estado: completa, verificada en verde (ver salida abajo)

## Resumen

Apliqué el diseño "mesa v2" (`docs/design/mesa-v2/*.dc.html` + `docs/planning/ux-design.md`) a la UI legacy completa, en commits chicos según el plan de la asignación:

1. `9600ecc` — Tokens de diseño en `:root` de `src/styles.css` (colores/medidas/tipografías del §3 de ux-design como custom properties; ninguna regla nueva usa colores sueltos) + Fraunces/Figtree vía Google Fonts en `index.html` con fallbacks. (AC 1)
2. `9104c25` — `src/ui/escape.ts` + `src/ui/cardView.ts`: `renderCard(card, {size, state})` con SVG de los 4 palos copiados de `Card.dc.html`, tamaños `xl|lg|md|sm|xs`, estados `normal|playable|disabled|winner|back`, figuras 10/11/12 como "Sota/Caballo/Rey", cartas jugables `<button>` con `aria-label` "Jugar el 7 de espada", no-jugables apagadas con `filter` (nunca `opacity < 1`). Tests unitarios jsdom. (AC 2)
3. `f02e998` — `src/ui/layout.ts`: `tableEllipse` + `seatPosition(index, playerCount, viewport, opts)` con clamp garantizado dentro del viewport (2/4/6 × 1280×800 y 390×844 verificados por tests). En 4p el compañero (posición 2, `team = posición % 2` en App.ts) va arriba y los rivales a los lados. (AC 3)
4. `302a9e2` — `src/ui/seatView.ts` + `src/ui/scoreView.ts`: asiento con iniciales, nombre, equipo, "Mano"/"Da", dorsos de cartas restantes, activo dorado con "Juega"/"Tu turno", atenuado fuera de submano pica-pica; marcador Nosotros/Ellos con malas/buenas y fósforos (compacto sin fósforos en celular [UI-16]). `data-testid` del contrato test-strategy §5 conservando `.team-points` del driver legacy. Tests. (AC 3, 5)
5. `5082328` — Integración en `src/ui/UIManager.ts` reescrito a mesa v2: elipse con riel + paño, asientos posicionados por fórmula sobre `.felt-room`, baza frente a cada asiento, centro con bazas 1ª/2ª/3ª + "Submano N de 3 · X contra Y", top bar "Mano N" + canto vigente + mazo, feed "En esta mano" (últimas 3 líneas, desktop), globos de canto 2,5 s, panel de respuesta papel `role="dialog"` acoplado a la derecha (hoja inferior en celular) que nunca tapa la baza, resumen de mano / fin de partida con historial de scroll interno [UI-12], menú rediseñado, breakpoint `(max-width: 700px), (max-height: 560px)` [AC 10], `data-busy` en la raíz. `src/App.ts`: listeners de eventos del engine para alimentar feed/globos y `setBusy` — sin cambios en la lógica de juego. (AC 4, 6–11)
6. `b7ac169` — `e2e/layout.spec.ts` nuevo (AC 12): 2/4/6 × 1440×900/1280×800/390×844 verifica asientos y mano dentro del viewport, `opacity` de carta jugada = 1, número ≥ 18 px (desktop) / ≥ 15 px (celular), exactamente un asiento activo, y guarda captura en `docs/design/capturas/<players>p-<w>x<h>.png` (9 imágenes comiteadas). Axe (AC 14): mesa de 4p desktop y celular sin violaciones `serious`/`critical`. `test:partidas` ahora corre `partidas.spec.ts` + `layout.spec.ts`.

El motor (`src/core/`, `src/engine/`) NO se tocó: `git diff main..HEAD --name-only` muestra solo archivos dentro de `scope.allow`.

## Archivos

- `index.html`, `src/styles.css`
- nuevos: `src/ui/escape.ts`, `src/ui/cardView.ts`, `src/ui/layout.ts`, `src/ui/seatView.ts`, `src/ui/scoreView.ts`, `src/ui/boardView.ts`
- modificados: `src/ui/UIManager.ts`, `src/App.ts`
- tests: `src/ui/__tests__/{cardView,layout,seatScoreView}.test.ts`, `e2e/layout.spec.ts`
- otros: `docs/design/capturas/*.png` (9), `docs/stories/0-4-ui-mesa-v2-legacy.md` (checklist + Dev Agent Record + `Status: review`, como pide la asignación), `package.json`/`package-lock.json` (devDeps nuevas: `jsdom`, `@types/jsdom`, `@axe-core/playwright`)

## Salida de los comandos de verificación (2026-09-24, sobre `b7ac169`)

```text
$ npm ci                       → ok
$ npm run typecheck            → tsc --noEmit limpio
$ npm run lint                 → 0 errores, 82 warnings (idénticos al baseline de main; no introduje ninguno)
$ npm test --silent            → Test Files 30 passed (30) · Tests 412 passed (412)
$ npm run build                → ✓ built (dist/assets ok)
$ npx tsx scripts/trucoai-qa.ts → Results: 309 passed, 0 failed
$ npx playwright install chromium → ok (worktree)
$ npx playwright test e2e/layout.spec.ts → 11 passed (9 layout + 2 axe)
$ PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10 npm run test:partidas
  → corrida 1: 45 passed (1.6m) · corrida 2: 45 passed
  → `diff` de las 36 líneas de firmas entre ambas corridas: idénticas (AC 13)
  → determinismo 4p seed 7: 060f523c == 060f523c (coincide con la firma de 0-3)
```

Firmas completas de las 10 semillas × 3 modalidades pegadas en el Dev Agent Record de la historia.

## Riesgos o desviaciones del alcance

- **Sin desvíos de alcance.** Único extra: devDependencies de tests (`jsdom`, `@types/jsdom`, `@axe-core/playwright`) — `package.json`/lock están en `scope.allow` y son requeridas por AC 12/14.
- El driver legacy (`e2e/driver/legacy.ts`) NO necesitó cambios: todos sus selectores (`SELECTORS`) siguen existiendo en el markup nuevo (AC 11) — verificado por las 45 partidas e2e verdes.
- `handExtra()` (altura de la mano del humano para el clamp del layout) es una estimación (202 px desktop / 168 px celular); si el tamaño de la carta xl cambia, revisar.
- El feed/globos se alimentan de eventos ya emitidos por el engine, desde App.ts; no hay hooks nuevos en `GameEngine`.
- `layout.spec.ts` reutiliza `LegacyDriver` y selectores existentes; no duplica el driver.
- Lint: los 82 warnings son pre-existentes en main (mismo conteo con los cambios stasheados), 0 nuevos.

## Cómo reproducir

```bash
cd /Users/emmanuelvaldez/GameDev/.worktrees/0-4-ui-mesa-v2-legacy
npm ci && npx playwright install chromium
npm run typecheck && npm run lint && npm test && npm run build
PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10 npm run test:partidas   # ×2, mismas firmas
```
