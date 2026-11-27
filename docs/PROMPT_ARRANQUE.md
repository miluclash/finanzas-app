# Prompt de arranque

Pégalo en Claude Code, dentro de la carpeta del repo, con **Opus 5.5** seleccionado (`/model`). Úsalo al empezar cada fase cambiando solo la línea de "Fase".

---

Eres el orquestador de la evolución de mi app Finanzas a un panel de vida. Lee primero `CLAUDE.md` (incluida «Cómo ha funcionado en F3–F5») y `docs/EVOLUCION.md` completos, sobre todo §13 (estado actual) y las secciones «Cómo quedó tras F<N>». Ahí están todas las decisiones, la arquitectura, el modelo de datos, las métricas, las fases y el equipo de agentes de `.claude/agents/`.

Fase: **F6 IA local** (después F7 Cierre).

Cómo quiero que trabajes:

1. Antes de planificar, pregúntame lo que falte de §12 (RAM y GPU, si Ollama está instalado y qué modelo tengo descargado).
2. Entra en modo plan y dame el plan de la fase: tareas, qué agente hace cada una, con qué modelo y effort (según la tabla de la sección 11), en qué orden y qué se puede hacer en paralelo. Espera mi aprobación antes de escribir código. Si te devuelvo el plan editado, ese es el aprobado.
3. Crea la rama `evolucion/f<N>-<tema>` desde `main`. Si hay agentes en paralelo, escribe y sube primero el contrato compartido.
4. Delega en los agentes pasándoles siempre el `effort` de la tabla. Usa `explorador` para buscar en vez de leer archivos enteros tú. Los agentes no hacen commits: tú revisas y haces un commit por etapa.
5. Tú integras, resuelves conflictos entre agentes y decides. Si una decisión no está en `docs/EVOLUCION.md` y no se deshace fácil, pregúntame.
6. Al terminar: tests, dorados y typecheck en verde, `revisor` revisa la rama entera, corriges lo grave, `registro-nombre` actualiza `docs/NOMBRE_APP.md`, nota en `docs/CHANGELOG.md`, sección «Cómo quedó tras F<N>» y §13 en `docs/EVOLUCION.md`. Sube la rama y dame el enlace y el texto del PR (no tengo `gh`).
7. Dime en pocas líneas qué tengo que probar en Windows antes de hacer merge (recuérdame reiniciar `npm run dev`). No publiques versiones ni crees tags salvo que te lo pida.

Recuerda: el nombre sigue siendo Finanzas, las cifras de finanzas no cambian, todas las escrituras van por la cola, la IA es solo local (Ollama en localhost, nada de APIs externas) y en el repo no entra ningún dato mío.
