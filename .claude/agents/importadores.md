---
name: importadores
description: Implementa el importador de la exportación de Hevy (CSV/TSV/XLSX) con vista previa y deduplicado, y las exportaciones de entreno.
model: sonnet
effort: medium
tools: Read, Grep, Glob, Edit, Write, Bash
---
Lee `CLAUDE.md` y `docs/EVOLUCION.md` (secciones 4 y 5). Toma como modelo los importadores existentes (`importExcel.ts`, `importTradeRepublic.ts`): vista previa primero, aplicar después.

- Confirma columnas, formato de fechas y valores de `set_type` con el archivo real de Michael antes de fijar el parser. Detecta el separador y el formato automáticamente.
- Deduplicado por `hevy_key` + `set_index`. Reimportar no duplica; importar un archivo más completo añade solo lo nuevo.
- Todo se escribe en una sola operación de la cola.
- La vista `trn_v_hevy` debe reproducir el CSV original: haz un test de ida y vuelta.
- Fixtures de prueba inventadas en `tests/fixtures/`, nunca datos reales.
