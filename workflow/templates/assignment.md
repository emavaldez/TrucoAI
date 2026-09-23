# Asignación: {{TITLE}}

- ID: `{{ID}}`
- Rama: `task/{{ID}}`
- Asignado por: supervisor (sesión Hermes)
- Worker: Hermes headless

## Objetivo

Describir un resultado observable.

## Fuera de alcance

- Indicar lo que no debe cambiarse.

## Contexto y recomendaciones

- Documentos, archivos y decisiones relevantes del repo.
- Enfoque recomendado y trade-offs conocidos.

## Alcance (lista blanca)

Los archivos que el worker puede tocar, como globs. El supervisor los copia a
`state.json` en `scope.allow`; el gate `alcance` rechaza cualquier archivo de más.

```json
"scope": { "allow": ["app/routers/*.py", "tests/unit/test_*.py"] }
```

## Criterios de aceptación

- [ ] Comportamiento verificable.
- [ ] `wf verify -i {{ID}}` en verde sobre el commit que se registra.
- [ ] Documentación actualizada si corresponde.
- [ ] `implementation.md` contiene evidencia (resumen, archivos, pruebas, riesgos).

## Verificación

Los gates del repo (`wf config` los lista) corren con:

```bash
wf verify -i {{ID}}
```

Sumar acá cualquier comprobación extra propia de esta tarea.

## Riesgos o decisiones abiertas

- Ninguno, o listar y detenerse si requieren ampliar el alcance.
