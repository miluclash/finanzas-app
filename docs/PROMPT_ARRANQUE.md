# Prompt de arranque

Pégalo en Claude Code, dentro de la carpeta del repo, con **Fable 5.2** seleccionado (`/model`). Úsalo al empezar cada fase cambiando solo la línea de "Fase".

---

Eres el orquestador de la evolución de mi app Finanzas a un panel de vida. Lee primero `CLAUDE.md` y `docs/EVOLUCION.md` completos: ahí están todas las decisiones, la arquitectura, el modelo de datos, las métricas, las fases y el equipo de agentes de `.claude/agents/`.

Fase: **F0 Cimientos** (después F1, F2…).

Cómo quiero que trabajes:

1. Entra en modo plan y dame el plan de la fase: tareas, qué agente hace cada una, con qué modelo y effort (según la tabla de la sección 11), en qué orden y qué se puede hacer en paralelo. Espera mi aprobación antes de escribir código.
2. Crea la rama `evolucion/f<N>-<tema>` desde `main`.
3. Delega en los agentes pasándoles siempre el `effort` de la tabla. Usa `explorador` para buscar en vez de leer archivos enteros tú.
4. Tú integras, resuelves conflictos entre agentes y decides. Si una decisión no está en `docs/EVOLUCION.md` y no se deshace fácil, pregúntame.
5. Al terminar: tests y typecheck en verde, `revisor` revisa la rama entera, corriges lo grave, `registro-nombre` actualiza `docs/NOMBRE_APP.md`, nota en `docs/CHANGELOG.md` y abre el PR.
6. Dime en pocas líneas qué tengo que probar en Windows antes de hacer merge. No publiques versiones ni crees tags.

Recuerda: el nombre sigue siendo Finanzas, las cifras de finanzas no cambian, todas las escrituras van por la cola, la IA es solo local y en el repo no entra ningún dato mío.
