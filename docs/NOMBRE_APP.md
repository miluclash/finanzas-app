# Dónde se usa el nombre de la app

Inventario de todos los sitios donde aparece "Finanzas" / "finanzas" como **nombre de la app** (no como nombre del módulo de finanzas). Sirve para el parche de cambio de nombre y para cualquier cambio futuro.

Lo mantiene el agente `registro-nombre`. Regla: si una tarea añade un sitio nuevo con el nombre de la app, se apunta aquí en el mismo PR.

Última revisión: v0.5.0 (15/11/2026), commit `19e6e4d`.

## Cómo regenerar el inventario

```bash
git grep -n -i "finanzas" -- . ':!package-lock.json' ':!docs/NOMBRE_APP.md'
```

Después hay que separar a mano lo que es nombre de la app de lo que es el módulo de Finanzas (que se queda como está, ver la última sección).

## Inventario

### Críticos: cambiarlos rompe datos o actualizaciones

| Archivo | Qué | Riesgo al cambiarlo |
|---|---|---|
| `electron-builder.yml` | `appId: com.miluclash.finanzas` (línea 1) | Windows lo trata como otra app: instalación nueva, no actualización |
| `src/main/index.ts` | `app.setAppUserModelId('com.miluclash.finanzas')` (línea 218) | Debe coincidir con el appId (notificaciones, barra de tareas) |
| `src/main/index.ts` | Carpeta de datos `path.join(app.getPath('appData'), 'Finanzas')` (línea 22) | La app arrancaría sin datos. Hace falta migrar `%APPDATA%\Finanzas` |
| `src/main/index.ts` | Archivo `finanzas.sqlite` (línea 86) | Igual que el anterior |
| `src/mcp/server.ts` | Ruta `%APPDATA%\Finanzas\finanzas.sqlite` (líneas 28-35) | Se elimina en la fase de IA local |
| `electron-builder.yml` | `publish.repo: finanzas-app` (línea 39) | Si se renombra el repo de GitHub, el autoupdater busca releases en el sitio viejo |
| `src/main/core/updater.ts` | Comentario sobre `%APPDATA%\Finanzas` (línea 3) | Solo documentación. Antes estaba en `src/main/updater.ts` |
| `scripts/golden-capture.mjs` | Lee `%APPDATA%\Finanzas\finanzas.sqlite` como origen de la captura (líneas 6, 23, 48 y 66; salvo `FINANZAS_DATA_DIR`) | Si cambia la carpeta de datos, hay que cambiar también este script |
| `tests/golden-finanzas.local.test.ts` | Carpeta dorada `%APPDATA%\Finanzas-golden` (con `finanzas.sqlite`, `meta.json` y `golden.json`, líneas 5 y 17), fuera del repo | Si la app cambia de nombre, hay que mover esa carpeta o recapturar la línea base |

### Variables de entorno

| Variable | Dónde |
|---|---|
| `FINANZAS_DATA_DIR` | `src/main/index.ts` (21), `src/main/core/updater.ts` (34), `src/mcp/server.ts` (29), `scripts/e2e.mjs` (2), `scripts/screenshots.mjs` (2 y 15), `scripts/golden-capture.mjs` (6, 23 y 66), `tests/core/reglas.test.ts` (133-134: fija qué archivos la leen), `CLAUDE.md` (19), `README.md` (42 y 87) |
| `FINANZAS_TEST_OPEN_FILE` | `src/main/index.ts` (63) |
| `FINANZAS_DB` | `src/mcp/server.ts` (28), `src/main/modules/finanzas/handlers.ts` (124, lo fija al configurar el MCP) |
| `FINANZAS_GOLDEN_DIR` | `tests/golden-finanzas.local.test.ts` (5 y 17), `scripts/golden-capture.mjs` (6, 24 y 100), `CLAUDE.md` (24), `docs/CHANGELOG.md` (11) |
| `FINANZAS_GOLDEN_UPDATE` | `tests/golden-finanzas.local.test.ts` (22), `scripts/golden-capture.mjs` (100) (variable interna: `1` = modo captura) |

### Visibles para el usuario

| Archivo | Qué |
|---|---|
| `package.json` | `name: finanzas-app` (línea 2), `productName: Finanzas` (línea 3), `description` (línea 5) |
| `electron-builder.yml` | `productName` (línea 2), `artifactName: Finanzas-Setup-${version}` (línea 23), `shortcutName` (línea 30) |
| `src/main/index.ts` | Título de ventana `'Finanzas'` (línea 36); título de los diálogos `showMessageBoxSync` de cierre (líneas 134 y 148) y del error al abrir la base de datos (línea 223) |
| `src/renderer/index.html` | `<title>` (línea 10) |
| `src/renderer/src/components/Layout.tsx` | Nombre en la barra lateral (línea 60) |
| `src/renderer/src/pages/Welcome.tsx` | Pantalla de bienvenida (línea 18) |
| `src/renderer/src/pages/Settings.tsx` | Texto de ajustes: nombre de la entrada «finanzas» del servidor MCP en Claude Desktop (línea 585) |
| `.github/workflows/build.yml` | Nombre del artefacto (46), título de la release (53), texto de la release (61-62) |
| `README.md` | Título (1), instrucciones de descarga (10), rutas de datos y copias (22-23 y 25) |
| `docs/ESPECIFICACION.md` | Ruta de datos (34) |

### Internos

| Archivo | Qué |
|---|---|
| `src/main/core/backup.ts` | Nombre de las copias `finanzas-<fecha>-<tipo>.sqlite` (66), que incluye los tipos nuevos `antes-de-migrar` y `sin-guardar`; filtro de copias automáticas `finanzas-<fecha>` (79) |
| `src/main/modules/finanzas/exports.ts` | Identificador `app: 'finanzas-app'` en las exportaciones JSON (línea 24; se valida al importar, línea 41: cambiarlo impide restaurar exportaciones antiguas); `wb.creator = 'Finanzas'` en Excel (línea 90) |
| `src/main/modules/finanzas/handlers.ts` | Nombres de archivo por defecto de la exportación `finanzas-<fecha>.json` y `.xlsx` (líneas 176 y 183); nombre `finanzas` del servidor MCP que se escribe en la configuración (línea 125) |
| `src/main/core/handlers.ts` | Filtro «Copia de Finanzas» del diálogo de restauración (línea 54, visible) |
| `src/main/index.ts` | Comentario de la carpeta de datos (línea 18) |
| `src/renderer/src/env.d.ts` (3 y 19), `src/renderer/src/lib/api.ts` (18), `src/preload/index.ts` (12), `src/renderer/src/components/Layout.tsx` (45 y 53), `src/renderer/src/components/UpdateFooter.tsx` (10 y 31) | Puente `window.finanzas` (nombre interno del bridge de IPC) y su tipo `FinanzasBridge` |
| `src/mcp/server.ts` | Nombre del servidor MCP `finanzas` (82), prompt «Finanzas» del menú de Claude (líneas 207 y 218, visible), logs `[finanzas-mcp]` (229 y 233). Se elimina en la fase de IA local |
| `.claude/agents/arquitecto-datos.md` | Línea 8: «app Finanzas» (el resto de agentes solo nombra el módulo) |
| `CLAUDE.md`, `docs/EVOLUCION.md`, `docs/PROMPT_ARRANQUE.md`, `docs/CHANGELOG.md` | Documentación: título, carpeta de datos, variables y regla del nombre. Solo documentación |
| `.gitignore` | Patrón `Finanzas-golden/` (línea 22; carpeta de la línea base del test dorado, fuera del repo) |
| `tests/persistence.test.ts`, `tests/core/registro.test.ts`, `tests/core/restaurar.test.ts`, `tests/core/arranque.test.ts`, `tests/core/writeQueue*.test.ts` | Nombres de carpetas temporales `finanzas-*` y del archivo `finanzas.sqlite` en tests |
| `tests/golden/sintetico.golden.json` | `"app": "finanzas-app"` en la instantánea sintética (línea 7138). Si cambia el identificador, regenerar con `npm run golden:update` y explicarlo en el PR |

## Del módulo Finanzas (no se renombra)

Estos sitios usan "finanzas" como id o nombre de la sección Finanzas, no como nombre de la app. El parche de cambio de nombre **no** debe tocarlos.

| Archivo | Qué |
|---|---|
| `src/main/modules/finanzas/index.ts` | `id: 'finanzas'` (línea 10) y `name: 'Finanzas'` (línea 11): nombre de la sección Finanzas, no de la app |
| `src/main/core/migrations.ts` | Rango de versiones del módulo `finanzas: [1, 999]` (línea 20) |
| `src/main/core/writeQueue.ts` | Etiquetas de la cola `finanzas:<acción>` (línea 4) |
| `src/main/modules/finanzas/handlers.ts` | Etiqueta de escritura `finanzas:<handler>` (línea 53) |
| Métodos IPC `finanzas:<acción>` | `src/main/modules/finanzas/handlers.ts`, `src/renderer/src/pages/*.tsx`, `src/renderer/src/components/*.tsx`, `src/renderer/src/lib/catalog.ts`, `tests/golden/collect.ts` |
| Rutas y nombres de módulo | `src/main/modules/finanzas/`, `src/shared/modules/finanzas/`, `src/main/app.ts` (`finanzasModule`), `tests/*finanzas*` (p. ej. `golden-finanzas.test.ts`) |

## Checklist del parche de cambio de nombre

1. Copia de seguridad manual de `%APPDATA%\Finanzas`.
2. Decidir si se cambia el `appId` (recomendado **no** cambiarlo: el usuario no lo ve y evita reinstalar).
3. Al arrancar, si existe `%APPDATA%\Finanzas` y no existe la carpeta nueva, migrarla (copiar, verificar, y dejar la vieja hasta confirmar).
4. Mantener `FINANZAS_DATA_DIR` como alias durante una versión.
5. Si se renombra el repo de GitHub, actualizar `publish.repo` y comprobar que GitHub redirige las releases.
6. Cambiar textos visibles, workflow y README.
7. Regenerar este inventario y dejarlo en cero pendientes, sin tocar la sección de módulo Finanzas.
