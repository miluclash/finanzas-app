# Registro de cambios

Una nota por PR, lo más nuevo arriba. Las versiones publicadas llevan su fecha; lo que está en `main` sin publicar va en "Sin publicar".

## Sin publicar

### F1 Núcleo (evolución a panel de vida)

- **Núcleo y módulos.** El proceso principal se reorganiza en `src/main/core/` (base de datos, cola de escritura, migraciones, registro de módulos, copias) y `src/main/modules/finanzas/`. La lógica de finanzas solo cambia de sitio: el test dorado (sintético y con datos reales) da exactamente las mismas cifras.
- **Cola de escritura.** Todas las escrituras en la base pasan por una cola única, una detrás de otra, cada una en su transacción y con un guardado en disco por operación (temporal + renombrado, como antes). Escribir fuera de la cola da error.
  - Abrir la app sin cambios ya no reescribe `finanzas.sqlite`.
  - Si hay migraciones pendientes sobre una base con datos, antes se hace una copia `antes-de-migrar`.
  - Restaurar una copia abre la base nueva antes de sustituir el archivo; si algo falla, la base actual sigue intacta o se explica qué ha pasado.
  - Al cerrar o actualizar se espera a que la cola termine. Si el último guardado falla, se hace una copia `sin-guardar` y se avisa; si tampoco se puede, se pregunta antes de cerrar y no se instala la actualización.
  - Si un guardado falla durante el uso, el aviso dice que el cambio está hecho y se reintentará, y la pantalla lo muestra.
- **Registro de módulos.** Cada sección se registra con sus migraciones (rango de versiones propio), sus métodos IPC y su semilla. Los métodos se llaman `<módulo>:<acción>` (`finanzas:tx.save`, `core:backup.create`).
- **Tests nuevos**: cola (incluidas 100 escrituras en paralelo), registro y migraciones, arranque, restauración y reglas de arquitectura de `CLAUDE.md` comprobadas sobre el código.
- Sin cambios de esquema, de versión ni de lo que se ve en la interfaz.

### F0 Cimientos (evolución a panel de vida)

- **Test dorado de finanzas.** Congela las cifras que calcula el proceso principal (saldos, patrimonio, resúmenes mensuales, movimientos, presupuestos, objetivos, recurrentes, previsiones, inversiones y plan de inversión) y avisa si alguna cambia.
  - `tests/golden-finanzas.test.ts`: con datos inventados, se ejecuta siempre (también en CI).
  - `tests/golden-finanzas.local.test.ts`: con una copia congelada de la base real, solo en la máquina de Michael. La copia y sus cifras viven fuera del repo, en `%APPDATA%\Finanzas-golden` (o `FINANZAS_GOLDEN_DIR`).
  - `npm run golden:capture` crea esa línea base.
  - No cubre: los totales que suma la propia interfaz (pies de tabla de Cuentas, Presupuestos, Recurrentes y Plan, y algún gráfico), la importación del Excel y las exportaciones a CSV y Excel.
- `.gitignore` ignora ahora `.env`, la carpeta de la línea base y las exportaciones de Hevy, y ancla a la raíz las carpetas de datos (`/data/`, `/private/`, `/backups/`) para no ignorar código con esos nombres.
- CI: los tests se ejecutan también en cada pull request (antes solo al llegar a `main`). Un pull request nunca publica instalador.
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
