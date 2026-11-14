# Registro de cambios

Una nota por PR, lo más nuevo arriba. Las versiones publicadas llevan su fecha; lo que está en `main` sin publicar va en "Sin publicar".

## Sin publicar

### F0 Cimientos (evolución a panel de vida)

- **Test dorado de finanzas.** Congela todas las cifras que la app enseña (saldos, patrimonio, resúmenes mensuales, presupuestos, objetivos, recurrentes, previsiones, inversiones y plan de inversión) y avisa si alguna cambia.
  - `tests/golden-finanzas.test.ts`: con datos inventados, se ejecuta siempre (también en CI).
  - `tests/golden-finanzas.local.test.ts`: con una copia congelada de la base real, solo en la máquina de Michael. La copia y sus cifras viven fuera del repo, en `%APPDATA%\Finanzas-golden` (o `FINANZAS_GOLDEN_DIR`).
  - `npm run golden:capture` crea esa línea base.
- `.gitignore` ignora ahora `.env`, la carpeta de la línea base y las exportaciones de Hevy.
- Documentación de la evolución: `CLAUDE.md`, `docs/EVOLUCION.md`, `docs/NOMBRE_APP.md`, agentes en `.claude/agents/` y este registro.
- La app no cambia: ni código, ni base de datos, ni versión.

## 0.5.0 (08/11/2026)

- Servidor MCP de solo lectura para Claude Desktop.

## 0.4.0 (08/11/2026)

- Pestaña Plan: seguimiento del plan de inversión y sus reglas.

## 0.3.0 (11/10/2026)

- Actualizaciones automáticas desde GitHub Releases.

## 0.2.0 (11/10/2026)

- Importador del CSV de Trade Republic.

## 0.1.0 (11/10/2026)

- Primera versión: base de datos, cálculos, importación del Excel, interfaz e instalador de Windows.
