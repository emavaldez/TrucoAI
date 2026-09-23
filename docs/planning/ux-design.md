# TrucoAI — Especificación UX/UI (v2)

**Estado:** aprobada por Emmanuel (implementar ya sobre la UI actual: historia 0-4) · **Fecha:** 2026-09-23 · **Autor:** Claude (UX)
**Diseño visual:** lienzo "TrucoAI — rediseño de mesa" (Claude Design): Menú, Mesa de 4, Te cantaron truco, Envido resuelto,
Mesa de 6 (pica-pica), Resumen de la mano, Fin de la partida, Celular 4 y 6, y las piezas Carta, Asiento y Marcador.
Fuente con valores exactos: **`docs/design/mesa-v2/*.dc.html`** (ver su README).
**Manda sobre:** la sección "UI" de `architecture.md` §8 en todo lo visual. Las reglas siguen en `gdd.md`.

## 1. Problemas que resuelve (captura de Emmanuel, 6p, 2026-09-23)

| Problema en la UI actual | Decisión |
|---|---|
| Las cartas jugadas salen grises/semitransparentes y pegadas a cada jugador | Las cartas de la baza se dibujan **en el paño, frente a cada asiento**, a opacidad 1, tamaño `md` (84×126) |
| En 6 jugadores los rivales quedan cortados abajo | Asientos posicionados sobre el borde de una **elipse** calculada para 2/4/6; nunca fuera del viewport |
| No se entiende de quién es el turno | Asiento activo con borde dorado + etiqueta "Juega"/"Tu turno"; píldora de estado sobre la mano propia |
| No se ve quién va ganando la baza | La carta que va ganando lleva aro dorado y cinta "Va ganando" |
| Marcador "Equipo 1/2" | Marcador **Nosotros / Ellos** con número, "malas/buenas" y **fósforos** (grupos de 5: cuadrado + diagonal) |
| Paño vacío en el centro | Centro = estado de la mano: bazas (1ª/2ª/3ª con color del ganador), cantos pendientes, resultado del envido, pica-pica |
| Palos con emoji | Carta española dibujada en SVG propio (oro, copa, espada, basto), número arriba-izquierda y abajo-derecha, figuras con "Sota/Caballo/Rey" |

## 2. Principios

1. **Se ve la jugada.** Nada importante semitransparente; lo que no se puede tocar se apaga (saturación baja), pero se lee.
2. **Una sola decisión a la vez.** Si hay canto pendiente, el panel de respuesta es lo único accionable y las cartas muestran candado.
3. **Solo lo legal.** Botones y cartas se derivan de `getLegalActions` (arquitectura §8); cada botón dice cuánto vale ("Truco · vale 2", "Irse al mazo · Ellos suman 1").
4. **Los cantos salen de la boca de quien canta.** Globos de diálogo junto al asiento ("¡Truco!", "Son buenas", "Tengo 33"), no alertas modales.
5. **Solo bloquean** el resumen de mano y el fin de partida (GDD §12).

## 3. Sistema visual (tokens)

| Token | Valor | Uso |
|---|---|---|
| `bg` | `#0C1310` | fondo de la página |
| `bar` | `#09100D` | barra superior |
| `surface` | `#111A16` / borde `#1E2B25` | tarjetas oscuras, feed |
| `rail` | `#5A3920` | baranda de madera de la mesa |
| `felt` | radial `#246B4F → #1A523C → #133D2D` | paño (variantes azul `#22557C…` y bordó `#6E2733…`) |
| `paper` | `#F7F1E3` / borde `#D9CCAE` | cartas, globos, paneles de decisión |
| `ink` | `#1A140A` | texto sobre papel |
| `text` | `#EDE6D6` · secundario `#B9C9C0` · terciario `#93A69C` | texto sobre oscuro |
| `gold` | `#E9C46A` | turno, carta ganadora, acción principal |
| `nos` | `#8CCBF2` (celeste) | Nosotros |
| `ellos` | `#F0A35E` (naranja) | Ellos |
| `go` | `#1F5A43` | botones primarios sobre papel |
| `danger` | `#9B3B2E` | "No quiero" |
| Palos | oro `#8A5D10`, copa `#A3302A`, espada `#244A70`, basto `#3F6B2F` | tinta de número y marco |

Tipografía: **Fraunces** (display: marca, números, puntajes, globos) + **Figtree** (UI). Nosotros/Ellos se distinguen por tono **y** luminosidad.
Radios: cartas 10–12 px, botones 12–14 px, paneles 18–24 px, píldoras 999 px.

## 4. Componentes

- **Carta** (`size`: xl 124×186 mano en desktop · lg 104×156 mano en celular · md 84×126 baza en desktop · sm 64×96 baza en celular / resúmenes · xs dorso en asientos;
  `state`: normal · playable (aro dorado, se levanta al hover/foco) · disabled (apagada + candado en la leyenda) · winner (aro + cinta) · back).
  Es un `<button>` con `aria-label` "Jugar el 7 de espada" cuando es jugable.
- **Asiento**: avatar con iniciales en color de equipo, nombre, equipo, insignias "Mano"/"Da", dorsos con la cantidad de cartas que le quedan;
  activo = borde dorado + etiqueta; fuera de la submano de pica-pica = atenuado (42%). Compacto en celular (118×54).
- **Marcador**: Nosotros | Ellos, número, "malas/buenas", 6 grupos de fósforos por equipo con separación entre malas y buenas. Compacto (sin fósforos) en celular.
- **Globo de canto**: papel, Fraunces 17–24 px, anclado al asiento; se va solo a los 2,5 s (el feed lo conserva).
- **Feed "En esta mano"**: últimas 2–3 líneas de cantos y resultados, con colores de equipo.
- **Barra de acciones**: título "Cantar", principal dorada (truco/retruco/vale cuatro), envido como grupo de 3 (Envido · Real · Falta con su valor), "Irse al mazo" secundario con consecuencia.
- **Panel de respuesta** (papel, `role="dialog"`): Quiero · Quiero <subida> · No quiero; bloque "El envido está primero" cuando aplica; atajos Q/N/R.
- **Resumen de mano** (modal): 3 bazas con las cartas decisivas, desglose de puntos, marcador, "Siguiente mano" (Enter) y "Pasar solo" (autoAck).
- **Fin de partida** (modal): resultado, 3 métricas, historial con scroll interno, "Jugar otra" / "Cambiar reglas".
- **Menú**: jugadores (2/4/6 con descripción), dificultad con una línea que la explica, reglas (flor; pica-pica solo habilitado con 6), "Repartir".

## 5. Layout

- **Desktop (≥ 1280×800, diseñado a 1440×900):** barra 72 px (marca · marcador · mano/canto vigente/menú); mesa elíptica 1200×540 centrada;
  asientos sobre el borde de la elipse (4p: compañero arriba, rivales a los lados; 6p: 5 asientos a 12, 2, 4, 8 y 10 hs); baza frente a cada asiento hacia el centro;
  centro para estado de mano; abajo: asiento propio + feed (izq.), mano (centro), acciones o panel de respuesta (der.).
- **Celular (390×844):** marcador compacto; fila de estado (mano, canto vigente, menú 44 px); rivales/compañeros en 1–2 filas de asientos compactos;
  paño rectangular redondeado 366×~300; mano `lg` abajo; acciones en grilla ≥ 44 px pegadas al borde inferior. Nada fuera del viewport en 2/4/6.
- Posiciones de asientos por **fórmula** (ángulo por asiento sobre la elipse), no por clases CSS por cantidad de jugadores.

## 6. Movimiento

Carta jugada: vuela de la mano (o del asiento) a su lugar en 220 ms ease-out. Baza ganada: aro dorado 300 ms y las cartas se juntan hacia el ganador.
Globos: aparecen con escala 0.9→1 en 150 ms. Respeta `prefers-reduced-motion` (sin vuelos, solo fundidos). Velocidad de la IA configurable (`aiDelay`).

## 7. Accesibilidad

Cartas y acciones son `<button>`; foco visible dorado; orden de tabulación: mano → acciones → menú. Anuncios `aria-live="polite"` para cantos y resultados.
Contraste ≥ 4.5:1 en texto; equipos distinguibles sin color (etiquetas "Nosotros/Ellos"). Táctil ≥ 44 px.

## 8. Mapa a historias

| Historia | Qué toma de esta spec |
|---|---|
| 3-2 Mesa y acciones | §3 tokens, §4 Carta/Asiento/Marcador/Globo/Feed/Acciones/Panel de respuesta, §5 layout desktop |
| 3-3 Menú y fin | §4 Menú, Resumen de mano, Fin de partida |
| 3-4 Responsive y a11y | §5 celular, §6 movimiento, §7 |
| 0-4 UI mesa v2 sobre el legacy | todo el documento, aplicado a `src/ui/UIManager.ts` + `src/styles.css` |
| 4-1 E2E | capturas 1280×800 y 390×844 comparadas contra el lienzo; `data-testid` de `test-strategy.md` §5 |
