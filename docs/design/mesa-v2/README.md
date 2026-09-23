# Diseño "mesa v2" — fuente de referencia

Exportado del lienzo **"TrucoAI — rediseño de mesa"** (Claude Design) el 2026-09-23. Cada `*.dc.html` es una pantalla o pieza del lienzo,
con **todos los valores exactos inline** (posiciones, tamaños, colores, tipografías) y los **SVG de los cuatro palos** en `Card.dc.html`.

No son páginas para servir: usan el runtime del lienzo (`support.js`, `<x-dc>`, `<sc-if>`, `<sc-for>`, `<dc-import>`, `{{holes}}`).
Leelas como especificación: copiá valores y SVG, no la estructura de plantillas.

| Archivo | Pantalla |
|---|---|
| `Menu.dc.html` | Menú de inicio (1440×900) |
| `Main.dc.html` | Mesa de 4, tu turno, 2ª baza (1440×900) |
| `Respuesta.dc.html` | Te cantaron truco + "el envido está primero" (1440×900) |
| `Envido.dc.html` | Envido resuelto con globos (1440×900) |
| `Mesa6.dc.html` | Mesa de 6 en pica-pica (1440×900) |
| `FinMano.dc.html` | Resumen de la mano (modal) |
| `FinPartida.dc.html` | Fin de la partida con historial (modal) |
| `Movil4.dc.html` / `Movil6.dc.html` | Celular 390×844, 4 y 6 jugadores |
| `Card.dc.html` | Carta española: tamaños xl/lg/md/sm/xs, estados normal/playable/disabled/winner/back, SVG de oro/copa/espada/basto |
| `Seat.dc.html` | Asiento (normal 200×72 y compacto 118×54) |
| `Score.dc.html` | Marcador Nosotros/Ellos con malas/buenas y fósforos |

Especificación en prosa: `docs/planning/ux-design.md`.
