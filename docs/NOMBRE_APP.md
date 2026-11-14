# Dónde se usa el nombre de la app

Inventario de todos los sitios donde aparece "Finanzas" / "finanzas" como **nombre de la app** (no como nombre del módulo de finanzas). Sirve para el parche de cambio de nombre y para cualquier cambio futuro.

Lo mantiene el agente `registro-nombre`. Regla: si una tarea añade un sitio nuevo con el nombre de la app, se apunta aquí en el mismo PR.

Última revisión: v0.5.0 (14/11/2026), commit `dbac1b6`.

## Cómo regenerar el inventario

```bash
git grep -n -i "finanzas" -- . ':!package-lock.json' ':!docs/NOMBRE_APP.md'
```

Después hay que separar a mano lo que es nombre de la app de lo que es el módulo de Finanzas (que se queda como está).

## Inventario

### Críticos: cambiarlos rompe datos o actualizaciones

| Archivo | Qué | Riesgo al cambiarlo |
|---|---|---|
| `electron-builder.yml` | `appId: com.miluclash.finanzas` | Windows lo trata como otra app: instalación nueva, no actualización |
| `src/main/index.ts` | `app.setAppUserModelId('com.miluclash.finanzas')` | Debe coincidir con el appId (notificaciones, barra de tareas) |
| `src/main/index.ts` | Carpeta de datos `path.join(app.getPath('appData'), 'Finanzas')` | La app arrancaría sin datos. Hace falta migrar `%APPDATA%\Finanzas` |
| `src/main/index.ts` | Archivo `finanzas.sqlite` | Igual que el anterior |
| `src/mcp/server.ts` | Ruta `%APPDATA%\Finanzas\finanzas.sqlite` | Se elimina en la fase de IA local |
| `electron-builder.yml` | `publish.repo: finanzas-app` | Si se renombra el repo de GitHub, el autoupdater busca releases en el sitio viejo |
| `src/main/updater.ts` | Comentario sobre `%APPDATA%\Finanzas` | Solo documentación |

### Variables de entorno

| Variable | Dónde |
|---|---|
| `FINANZAS_DATA_DIR` | `src/main/index.ts`, `src/main/updater.ts`, `src/mcp/server.ts`, `scripts/e2e.mjs`, `scripts/screenshots.mjs`, `README.md` |
| `FINANZAS_TEST_OPEN_FILE` | `src/main/index.ts` |
| `FINANZAS_DB` | `src/mcp/server.ts` |

### Visibles para el usuario

| Archivo | Qué |
|---|---|
| `package.json` | `name: finanzas-app`, `productName: Finanzas`, `description` |
| `electron-builder.yml` | `productName`, `artifactName: Finanzas-Setup-${version}`, `shortcutName` |
| `src/main/index.ts` | Título de ventana `'Finanzas'`, título de diálogos de error |
| `src/renderer/index.html` | `<title>` |
| `src/renderer/src/components/Layout.tsx` | Nombre en la barra lateral |
| `src/renderer/src/components/UpdateFooter.tsx` | Textos de actualización |
| `src/renderer/src/pages/Welcome.tsx` | Pantalla de bienvenida |
| `src/renderer/src/pages/Settings.tsx` | Texto de ajustes |
| `.github/workflows/build.yml` | Nombre del artefacto, título y texto de la release |
| `README.md` | Título, instrucciones, rutas |
| `docs/ESPECIFICACION.md` | Ruta de datos |

### Internos

| Archivo | Qué |
|---|---|
| `src/main/services/backup.ts` | Nombres de archivos de copia/exportación |
| `src/main/services/api.ts` | Nombres de archivo por defecto al exportar |
| `src/renderer/src/env.d.ts`, `src/renderer/src/lib/api.ts`, `src/preload/index.ts` | Tipos/comentarios |
| `tests/persistence.test.ts` | Rutas y nombres en tests |

## Checklist del parche de cambio de nombre

1. Copia de seguridad manual de `%APPDATA%\Finanzas`.
2. Decidir si se cambia el `appId` (recomendado **no** cambiarlo: el usuario no lo ve y evita reinstalar).
3. Al arrancar, si existe `%APPDATA%\Finanzas` y no existe la carpeta nueva, migrarla (copiar, verificar, y dejar la vieja hasta confirmar).
4. Mantener `FINANZAS_DATA_DIR` como alias durante una versión.
5. Si se renombra el repo de GitHub, actualizar `publish.repo` y comprobar que GitHub redirige las releases.
6. Cambiar textos visibles, workflow y README.
7. Regenerar este inventario y dejarlo en cero pendientes.
