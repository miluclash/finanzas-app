# CLAUDE.md — Finanzas (evolución a panel de vida)

App de escritorio para Windows, un solo usuario (Michael), datos 100 % locales. Hoy tiene la sección **Finanzas** y está evolucionando a un panel de vida con una segunda sección, **Entreno**. El plan completo está en `docs/EVOLUCION.md`: léelo antes de cualquier tarea.

## Stack

Electron 44 · React 19 · TypeScript · Tailwind 4 · Recharts · SQLite con sql.js (WASM) · Zod · ExcelJS · Vitest · electron-builder (NSIS) · GitHub Actions.

## Comandos

```bash
npm install
npm run dev        # app en desarrollo
npm test           # Vitest
npm run typecheck  # obligatorio antes de cada commit
npm run build
```

Datos de prueba separados de los reales: `FINANZAS_DATA_DIR=<carpeta>` antes de `npm run dev`. Nunca pruebes contra `%APPDATA%\Finanzas` sin una copia de seguridad hecha ese mismo día.

### Test dorado de finanzas

- `npm test` ejecuta siempre el dorado sintético (`tests/golden-finanzas.test.ts`, datos inventados) y, si existe la línea base, el dorado real (`tests/golden-finanzas.local.test.ts`).
- La línea base real (copia congelada de la base, `golden.json` y `meta.json`) vive fuera del repo: `%APPDATA%\Finanzas-golden`, o la carpeta de `FINANZAS_GOLDEN_DIR`. Se crea con `npm run golden:capture`, que solo lee la base original.
- **Se captura en `main` al empezar una fase y no se vuelve a capturar durante ella.** Si el dorado falla, el resultado cambió: no se recaptura ni se edita la instantánea, se avisa al orquestador.
- Nadie imprime ni copia al repo el contenido de esa carpeta. Si el dorado real falla, la salida solo nombra las claves que difieren; el detalle queda en `ultimo-diff.json` dentro de la carpeta.
- Si cambia a propósito la estructura de lo que cubre el dorado (por ejemplo, un handler nuevo), se regenera el sintético con `npm run golden:update` y se explica en el PR.

## Reglas que no se rompen

1. **El nombre sigue siendo "Finanzas"** durante toda la evolución. No renombres nada (app, repo, appId, carpeta de datos, variables `FINANZAS_*`). El cambio de nombre es un parche aparte. Si añades un sitio nuevo donde aparece el nombre, apúntalo en `docs/NOMBRE_APP.md` (el agente `registro-nombre` lo mantiene).
2. **La lógica financiera no cambia.** Mover código de sitio sí; cambiar resultados no. El test dorado de finanzas (`tests/golden-finanzas.local.test.ts`) debe dar exactamente las mismas cifras antes y después de cada fase.
3. **Todas las escrituras en la base de datos pasan por la cola de escritura** (`src/main/core/writeQueue.ts`). Ningún servicio, importador ni herramienta de IA llama a `db.save()` ni escribe fuera de la cola. Lecturas: libres, desde el estado en memoria.
4. **Dinero en céntimos enteros**; cantidades y precios de inversión con decimal.js. Pesos en kg con decimales, duraciones en segundos enteros, distancias en km.
5. **Migraciones solo hacia delante**, una por cambio, nunca editar una migración ya publicada. Antes de aplicar migraciones, la app hace copia de seguridad automática.
6. **Tablas nuevas con prefijo**: `trn_` (entreno), `core_` (núcleo compartido). Las tablas de finanzas no se renombran.
7. **Privacidad**: el repo es público. Nada de datos reales, capturas con datos reales, `.env` ni archivos de Hevy en el repo. Las claves van en un `.env` fuera del repo (en la carpeta de datos), y `.env` está en `.gitignore`.
8. **IA solo local** (Ollama en `localhost`). Ninguna llamada a APIs externas de IA. El servidor MCP actual (`src/mcp/`) está congelado: no se le añaden herramientas y se elimina en la fase de IA local.
9. **Todo lo configurable es editable desde la app**: catálogos, objetivos, planes, gráficos, parámetros de métricas.
10. Interfaz y textos en **español de España**, tono cercano y claro.

## Arquitectura objetivo

```
src/shared/            Tipos, dinero, fechas, validación común
src/main/core/         Núcleo: db, cola de escritura, registro de módulos, backups, import/export, IA local, gráficos
src/main/modules/finanzas/   Servicios de finanzas (movidos, sin cambiar lógica)
src/main/modules/entreno/    Servicios de entreno
src/shared/modules/<módulo>/ Lógica pura de cada módulo (funciones puras y testeadas)
src/renderer/src/core/       Shell, navegación, sistema de diseño, constructor de gráficos, panel de IA
src/renderer/src/modules/<módulo>/  Páginas de cada módulo
```

La interfaz nunca toca la base de datos: pide datos al proceso principal por IPC.

## Cómo se trabaja

- Una fase = una rama `evolucion/fN-<tema>` = un PR. Michael revisa, prueba en Windows y hace merge.
- Orquestador en la sesión principal (Fable 5.2). Delega en los agentes de `.claude/agents/`. **Al lanzar un agente, pásale explícitamente el `effort` de la tabla de `docs/EVOLUCION.md`** (no te fíes solo del frontmatter).
- Búsquedas y tareas mecánicas → effort bajo. Código nuevo y revisión → effort alto.
- Cada PR termina con: tests en verde, typecheck limpio, revisión del agente `revisor` y una nota en `docs/CHANGELOG.md`.
- No publiques versiones (tags) sin que Michael lo pida: la app instalada se actualiza sola.
- Si una decisión no está en `docs/EVOLUCION.md` y no se puede deshacer fácilmente, pregunta a Michael antes.
