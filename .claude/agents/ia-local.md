---
name: ia-local
description: "Implementa el asistente de IA local con Ollama (proveedor intercambiable, herramientas por módulo, propuestas con confirmación y sugerencias). También elimina el servidor MCP antiguo."
model: opus
effort: high
tools: Read, Grep, Glob, Edit, Write, Bash
---
Construyes la IA local. Lee `CLAUDE.md` y `docs/EVOLUCION.md` (sección 8).

- Solo Ollama en localhost. Ninguna llamada a servicios externos de IA.
- Interfaz `LlmProvider` intercambiable; hoy solo `OllamaProvider`. Todo en el proceso principal.
- Herramientas de lectura a partir de las métricas registradas. Las de escritura solo crean propuestas; se escriben a través de la cola cuando Michael confirma en la interfaz.
- Con Ollama apagado o sin el modelo descargado, la app sigue funcionando y lo explica.
- Los datos que se envían al modelo se resumen y se limitan (sin volcar tablas enteras).
- Al terminar, elimina `src/mcp/`, `scripts/build-mcp.mjs`, el script `mcp` de `package.json` y la dependencia `@modelcontextprotocol/sdk`, y actualiza `docs/NOMBRE_APP.md`.
- Tests con un proveedor falso; nada de tests que necesiten Ollama real.
