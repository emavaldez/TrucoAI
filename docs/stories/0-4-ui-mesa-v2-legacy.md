# Historia 0-4: UI "mesa v2" sobre el juego actual

Status: ready-for-dev
wf-id: `0-4-ui-mesa-v2-legacy` · kind: `default`
Depende de: 0-3 (mergeada: trae el gate `partidas` sin fallas conocidas y toca `App.ts`)

## Historia

Como jugador,
quiero una mesa donde se vean claramente las cartas jugadas, de quién es el turno, quién va ganando y cuánto vale cada canto, en 2, 4 y 6 jugadores y en el celular,
para poder jugar cómodo ya, sin esperar a la UI nueva de la épica 3.

## Contexto

Captura de Emmanuel (6p, 2026-09-23): cartas jugadas grises y semitransparentes pegadas a cada jugador, rivales cortados abajo, turno ilegible,
marcador "Equipo 1/2", paño vacío. Diseño aprobado: **`docs/planning/ux-design.md`** (qué y por qué) y **`docs/design/mesa-v2/*.dc.html`**
(valores exactos, leer su README). Esta historia aplica ese diseño a la UI legacy. **No toca reglas ni el motor**: la épica 3 va a reconstruir la UI
sobre el motor v2 con el mismo diseño, así que escribí CSS y funciones de render reutilizables (tokens, carta, asiento, marcador).

## Criterios de aceptación

1. **Tokens y tipografía:** `src/styles.css` define como custom properties en `:root` todos los tokens de `ux-design.md` §3 y no usa colores sueltos fuera de ellos.
   Fraunces + Figtree desde Google Fonts (`<link>` en `index.html`, con fallback `Georgia, serif` / `system-ui, sans-serif`). Sin emoji en ningún lugar de la UI.
2. **Carta** (función `renderCard(card, { size, state })` en `src/ui/cardView.ts`, nuevo): SVG de los palos copiados de `docs/design/mesa-v2/Card.dc.html`,
   tamaños `xl|lg|md|sm|xs` y estados `normal|playable|disabled|winner|back` como en el diseño (medidas, colores, aro dorado y cinta "Va ganando"/"Ganó").
   Figuras 10/11/12 con "Sota/Caballo/Rey". **Ninguna carta jugada con `opacity < 1`** (las no jugables se apagan con `filter`, como en el diseño).
   Las cartas jugables son `<button>` con `aria-label` "Jugar el 7 de espada".
3. **Mesa elíptica** (baranda + paño) y **asientos por fórmula**: `seatPosition(index, playerCount, viewport)` en `src/ui/layout.ts` (nuevo) ubica los asientos
   sobre el borde de la elipse (humano abajo; 4p: compañero arriba, rivales a los lados; 6p: 12, 2, 4, 8 y 10 hs), con tests unitarios para 2/4/6 que verifican
   que ningún asiento queda fuera de 1280×800 ni de 390×844. Asiento = componente del diseño (`Seat.dc.html`): iniciales, nombre, equipo, "Mano"/"Da", dorsos
   con las cartas que le quedan, activo con borde dorado y etiqueta "Juega"/"Tu turno", atenuado si no juega la submano de pica-pica.
4. **Baza en el paño:** cada carta jugada de la baza actual va frente a su asiento, hacia el centro, tamaño `md` (desktop) / `sm` (celular). La que va ganando
   lleva estado `winner` (usá la función de ranking que ya existe en el legacy, sin duplicarla). Centro del paño: indicador de bazas 1ª/2ª/3ª con el color
   del equipo que la ganó (parda = gris) y, en pica-pica, "Submano N de 3 · X contra Y".
5. **Marcador** (`Score.dc.html`): "Nosotros"/"Ellos" (Nosotros = equipo del humano), número, "malas/buenas" y fósforos (6 grupos de 5 por equipo con separación
   entre malas y buenas); compacto sin fósforos en celular **[UI-16]**. Barra superior con "Mano N" y el canto vigente ("Truco querido · vale 2").
6. **Acciones:** solo los botones que la UI ya muestra hoy, restyleados según el diseño: principal dorada para truco/retruco/vale cuatro, grupo de envido
   (Envido · Real · Falta), "Irse al mazo" secundario; cada uno con su valor o consecuencia en texto chico. Sin cambios de lógica.
7. **Panel de respuesta** (papel, `role="dialog"`, foco al abrirse): acoplado a la derecha en desktop y como hoja inferior en celular; **nunca tapa el paño ni la baza**;
   mientras está abierto las cartas propias se muestran `disabled` con la leyenda "Tus cartas se liberan cuando respondas".
8. **Globos de canto:** cuando alguien canta o responde (truco, retruco, vale cuatro, envido, real, falta, quiero, no quiero, son buenas, me voy al mazo),
   un globo de papel junto a su asiento durante 2,5 s, además de lo que ya muestre la UI. **Feed "En esta mano"** con las últimas 3 líneas (desktop).
9. **Avisos, resumen y fin:** los avisos que hoy bloquean se mantienen (el flujo no cambia) pero con el estilo de panel de papel del diseño, centrados sobre el paño
   sin tapar la mano propia. Resumen de mano y fin de partida con el diseño de `FinMano`/`FinPartida` (historial con scroll interno **[UI-12]**). Menú con el diseño
   de `Menu` (solo las opciones que existen hoy: jugadores y dificultad).
10. **Celular 390×844** según `Movil4`/`Movil6`: marcador compacto, asientos compactos en 1–2 filas, paño redondeado, mano `lg`, acciones ≥ 44 px pegadas abajo.
    Breakpoint: `max-width: 700px` o `max-height: 560px`.
11. **Selectores de los tests:** siguen funcionando **todos** los selectores de `e2e/driver/legacy.ts` (`SELECTORS`). Si cambiás un selector, actualizá el driver
    en esta misma historia. Además agregá los `data-testid` de `test-strategy.md` §5 a los elementos que existan (menú, marcador, asientos, cartas, acciones,
    panel de respuesta, resumen, fin de partida).
12. **Test de layout** (`e2e/layout.spec.ts`, nuevo, entra en `npm run test:partidas` o en un script `test:layout` que el gate `partidas` también corra):
    para 2/4/6 jugadores × viewports 1440×900, 1280×800 y 390×844, arrancar partida (seed 1), avanzar hasta el turno del humano y verificar:
    - todos los asientos y todas las cartas propias están **completamente dentro del viewport**;
    - las cartas jugadas de la baza tienen `opacity` computada 1 y el número de la carta mide ≥ 18 px (desktop) / ≥ 15 px (celular);
    - hay exactamente un asiento marcado como activo;
    - adjunta una captura por caso y las guarda en `docs/design/capturas/<players>p-<w>x<h>.png` (se commitean).
13. **Partidas:** `PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10 npm run test:partidas` sigue en verde (34 tests + los de layout); firmas pegadas en el Dev Agent Record
    (pueden cambiar respecto de 0-3 si cambia el orden de lectura del DOM; lo que importa es que sean estables entre 2 corridas).
14. Sin cambios en `src/core/` (reglas, motor) ni en `src/engine/`. `typecheck`, `lint`, `test`, `build` en verde. `@axe-core/playwright` (devDependency) sin violaciones `serious`/`critical` en la mesa de 4, desktop y celular (test en `e2e/layout.spec.ts`).

## Tareas

- [ ] Tokens + fuentes (AC 1)
- [ ] `cardView.ts` con SVG de palos y estados (AC 2)
- [ ] `layout.ts` + tests unitarios de posiciones (AC 3)
- [ ] Render de mesa, asientos, baza, centro y marcador (AC 3, 4, 5)
- [ ] Acciones, panel de respuesta, globos y feed (AC 6, 7, 8)
- [ ] Avisos, resumen, fin, menú (AC 9)
- [ ] Celular (AC 10)
- [ ] Selectores + `data-testid` (AC 11)
- [ ] `e2e/layout.spec.ts` + capturas (AC 12)
- [ ] Partidas 10 semillas ×2 (AC 13) y Dev Agent Record

## Dev Notes

- Leé `docs/design/mesa-v2/README.md` y abrí `Main.dc.html`, `Mesa6.dc.html`, `Respuesta.dc.html` y `Movil6.dc.html` primero: tienen todas las medidas.
  Las posiciones absolutas del diseño son para 1440×900; en código, derivalas de `layout.ts` (proporcionales al tamaño de la mesa) para que escale.
- `UIManager.ts` hoy arma HTML con `innerHTML`: podés seguir así, pero centralizá la carta, el asiento y el marcador en funciones puras
  (`cardView.ts`, `seatView.ts`, `scoreView.ts`) que devuelven strings y tienen tests con jsdom si hace falta (devDependency `jsdom` permitida).
  Escapá todo texto dinámico (`escapeHtml` en `src/ui/escape.ts`).
- Los globos y el feed se alimentan de los eventos que `App.ts` ya recibe del motor; no agregues lógica de reglas en la UI.
- Animaciones: solo CSS (`transition` 150–220 ms), respetando `prefers-reduced-motion`.
- Corré `npx playwright install chromium` en el worktree antes de los e2e.

### Alcance (wf `scope.allow`)
```json
["src/ui/*", "src/styles.css", "src/App.ts", "src/main.ts", "index.html", "public/*", "e2e/*", "docs/design/*",
 "package.json", "package-lock.json", "docs/stories/0-4-ui-mesa-v2-legacy.md"]
```

### Verificación extra
```bash
npx playwright install chromium
npm run typecheck && npm run lint && npm test && npm run build
PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10 npm run test:partidas   # 2 veces, mismas firmas
```

### Referencias
- `docs/planning/ux-design.md` · `docs/design/mesa-v2/` · `docs/planning/test-strategy.md` §5 · Auditoría UI-04, UI-07, UI-09, UI-12, UI-13, UI-14, UI-16

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM/UX) · Historia creada a pedido de Emmanuel ("no se ven las cartas; rediseñame toda la UI y la UX"), diseño aprobado para aplicar ya.
