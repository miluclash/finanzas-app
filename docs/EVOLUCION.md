# Evolución: de Finanzas a panel de vida (v0.5 → v1.0)

Documento de referencia para todos los agentes. Si algo no está aquí y no es fácil de deshacer, se pregunta a Michael.

## 1. Objetivo

Convertir la app Finanzas en un panel de vida modular con dos secciones:

- **Finanzas**: lo que ya existe, igual que hoy pero con la interfaz nueva.
- **Entreno**: seguimiento de entrenos importados desde Hevy, con objetivos del momento, planes a futuro, métricas, gráficos personalizables y un asistente de IA local que sugiere.

El nombre sigue siendo "Finanzas" hasta el parche de cambio de nombre (ver `docs/NOMBRE_APP.md`).

## 2. Decisiones cerradas (14/11/2026)

| Tema | Decisión |
|---|---|
| Registro de entrenos | Siempre en Hevy. A la app llegan con la exportación de Hevy (Perfil → Ajustes → Export & Import Data → Export Workouts) |
| Estructura de datos de entreno | Igual que la exportación de Hevy, con columnas extra para lo que Hevy no guarda |
| Natación | Sin tiempos. Se guarda qué ejercicios se hicieron (y distancia si la hay) |
| Peso corporal y nutrición | Fuera de la v1. Puerta abierta a un módulo "Nutrición" en el futuro |
| IA | Solo local con Ollama desde el principio. Sin API de Anthropic ni OpenAI. Conectar el modelo local con Claude Desktop (MCP) se estudiará en un parche futuro |
| Servidor MCP actual | Congelado hasta F6, donde se eliminó (lo sustituye el asistente local) |
| Escrituras en la base de datos | Las ordena la app con una cola de escritura única. Se mantiene sql.js (no se migra a better-sqlite3) |
| Nombre | "Finanzas" durante toda la evolución. Cambio de nombre en un parche aparte |
| Claves y secretos | `.env` en la carpeta de datos, fuera del repo |
| Métricas | Las define este documento (sección 6). Michael pedirá cambios si los quiere |
| Finanzas | La lógica no cambia. Test dorado antes/después de cada fase |

## 3. Arquitectura

### 3.1 Núcleo y módulos

Cada sección es un módulo que se registra en el núcleo con:

```ts
interface AppModule {
  id: 'finanzas' | 'entreno'          // futuros: 'nutricion', 'estudios'
  name: string
  migrations: Migration[]              // tablas con su prefijo
  ipc: Record<string, Handler>         // canales "<modulo>:<accion>"
  metrics: MetricDef[]                 // métricas que expone al constructor de gráficos y a la IA
  aiTools: AiToolDef[]                 // herramientas que la IA local puede usar
  importers?: ImporterDef[]
  exporters?: ExporterDef[]
}
```

Añadir un módulo nuevo = crear su carpeta y registrarlo. El núcleo no conoce detalles de ningún módulo.

### 3.2 Cola de escritura

`src/main/core/writeQueue.ts`. Una cola FIFO en el proceso principal:

- `enqueue(label, fn)` ejecuta `fn` dentro de una transacción, guarda el archivo de forma atómica (temporal + renombrado, como hoy) y apunta en `audit_log`.
- Las operaciones se ejecutan una detrás de otra, nunca a la vez. Si una falla, se hace rollback y la cola sigue.
- La usan: los handlers IPC que modifican datos, los importadores, las restauraciones de copia y las herramientas de IA que escriben.
- Las lecturas no pasan por la cola: leen del estado en memoria ya calculado.
- La app ya bloquea una segunda instancia (`requestSingleInstanceLock`), así que solo hay un proceso escritor.
- Test obligatorio: 100 escrituras lanzadas en paralelo terminan todas, en orden y sin perder ninguna.

### 3.3 Base de datos

- Mismo archivo `finanzas.sqlite`. Las tablas de finanzas no cambian de nombre.
- Prefijos nuevos: `trn_` (entreno) y `core_` (compartido: gráficos, paneles, IA, ajustes por módulo).
- Copia automática antes de aplicar cualquier migración.

### 3.4 Cómo quedó tras F1 (decisiones de implementación)

- **Dónde está cada cosa**: núcleo en `src/main/core/` (`db`, `writeQueue`, `migrations`, `registry`, `context`, `backup`, `handlers`, `updater`, `audit`, `errors`); finanzas en `src/main/modules/finanzas/` (con `index.ts`, que define el módulo); la raíz de composición `src/main/app.ts` es el único sitio que junta núcleo y módulos. El núcleo no importa módulos y un módulo no importa otro ni la raíz (lo comprueba `tests/core/reglas.test.ts`).
- **Cola**: `enqueue(etiqueta, fn, { before, audit })` con `fn` **síncrona** dentro de una transacción; `enqueueTask` para turnos exclusivos asíncronos (copias y restaurar); `runNow` solo para el arranque y los tests. Etiquetas `<módulo>:<acción>`. Las copias de seguridad van en `before` (fuera de la transacción).
- **Los servicios de finanzas no saben de la cola**: la cola se pone en la frontera (handlers de escritura, restauración, arranque, cierre). Las lecturas son síncronas y no pasan por la cola.
- **Fuera de una operación de la cola no se puede escribir** (`Db` lanza "Escritura fuera de la cola"). Un guardado en disco por operación y ninguno si no cambia nada: abrir una base al día no toca el archivo.
- **Auditoría**: los servicios de finanzas ya apuntan cada cambio en `audit_log`, así que sus handlers no usan la entrada `audit` de la cola (evita filas duplicadas). Los módulos nuevos pueden usarla.
- **Migraciones**: una sola tabla `schema_migrations` con rangos de versión por módulo (finanzas 1–999, núcleo 1000–1999, entreno 2000–2999; `MIGRATION_RANGES`). Cada migración pendiente es una operación de la cola. Copia `antes-de-migrar` solo si hay migraciones pendientes sobre una base con datos.
- **Métodos IPC**: un único canal `api` con métodos `<módulo>:<acción>` (`finanzas:tx.save`, `core:backup.create`). Los canales `theme` y `update.*` siguen aparte.
- **Cierre y actualización**: esperan a la cola; si el último guardado falla, copia `sin-guardar` y aviso; si tampoco se puede, se pregunta antes de cerrar y no se instala la actualización.
- **Pendiente para F3**: las migraciones corren dentro de la transacción de la operación, así que una migración no puede hacer `PRAGMA foreign_keys = OFF` (necesario para reconstruir una tabla en SQLite). Si F3 lo necesita, hay que añadir a la cola un modo de migración fuera de transacción. Mover `ISODate`/`MonthKey` de `shared/modules/finanzas/types` a `src/shared/` antes de que entreno los use.

### 3.5 Cómo quedó tras F3 (decisiones de implementación)

- **Dónde está cada cosa**: módulo en `src/main/modules/entreno/` (`migrations`, `seed`, `repo`, servicios `workouts`/`exercises`/`catalog`, `hevyApply`, `hevyImport`, `exports`, `hevyXlsx`, `handlers`, `index`); tipos, contrato IPC y Zod en `src/shared/modules/entreno/`; lectura pura de Hevy en `src/shared/modules/entreno/hevy/`; lector y escritor CSV genérico en `src/shared/csv.ts`; `ISODate`/`MonthKey` en `src/shared/types.ts` (finanzas los reexporta).
- **Migraciones 2001–2005**: catálogo → planificación → sesiones y `trn_v_hevy` → ajustes → datos iniciales (12 grupos musculares y reglas de tipo). Van en ese orden porque SQLite no deja escribir en una tabla hija si la madre aún no existe. Los datos iniciales están en una migración (no en `seed`) para que también lleguen al restaurar una copia de antes de F3. `seed` solo añade los ajustes que falten.
- **Tablas que no estaban en §4**: `trn_muscle_groups` y `trn_exercise_muscles` (grupos musculares como catálogo editable, un principal como mucho) y `trn_kind_rules` (reglas de tipo de sesión editables; gana la de mayor prioridad, sin distinguir mayúsculas ni tildes). `trn_workouts.kind_manual = 1` cuando Michael corrige el tipo: las reglas ya no lo pisan.
- **Clave de serie**: `hevy_key` (título + inicio) + `exercise_order` + `set_index`. En Hevy `set_index` empieza en 0 y es por ejercicio. `exercise_order` sube cada vez que cambia el ejercicio (si el mismo ejercicio vuelve a salir más tarde, es otro bloque).
- **Reimportar**: misma `hevy_key` y misma firma de series → duplicada. Firma distinta → cambiada: se sustituyen sus series y se conservan el tipo puesto a mano, el esfuerzo, las notas, el bloque y la rutina. Misma hora con otro título → aviso. Borrar una sesión de Hevy y reimportar la vuelve a crear. Las series de Hevy son de solo lectura en la app; las sesiones manuales se editan enteras.
- **Aplicar una importación**: una sola operación de la cola. En `before` se vuelve a leer el archivo, se comprueba que su hash es el de la vista previa y se hace la copia `antes-de-importar`. Solo hay una vista previa pendiente a la vez (caduca a los 30 minutos).
- **Renombrar un ejercicio con series** guarda el nombre anterior como alias, para que Hevy no lo vuelva a crear.
- **Exportar**: CSV desde `trn_v_hevy` con el estilo exacto de Hevy (comillas solo en columnas de texto, números sin comillas, CRLF, sin salto final; incluye las sesiones manuales). Excel con una hoja por tabla `trn_` más "Hevy". JSON restaurable (`app: 'finanzas-entreno'`); restaurarlo solo toca tablas `trn_`, con copia previa.
- **Auditoría**: los servicios de entreno escriben su propia fila en `audit_log` dentro de la operación (como finanzas), porque la entrada `audit` de la cola se fija al encolar y no tiene el id nuevo. Nunca con contenido de celdas.
- **Pendiente para F4** (hecho en F4): los parámetros de métricas ya se editan en Ajustes › Entreno › Métricas.

### 3.6 Cómo quedó tras F4 (decisiones de implementación)

- **Dónde está cada cosa**: métricas puras en `src/shared/modules/entreno/metrics/` (`prepareMetrics(hechos, ajustes)` y funciones por métrica; `views.ts` construye lo que ve la interfaz); diccionario de estaciones en `src/shared/modules/entreno/hyrox.ts`; semanas del plan en `src/shared/modules/entreno/plan.ts`. En el proceso principal: `facts.ts` lee la base en bloque, `metrics.ts` expone `entreno:metrics.*` (solo lectura, con caché que se vacía tras cada escritura confirmada o restauración; "hoy" entra en cada llamada), y `planning.ts`, `routines.ts`, `blocks.ts` y `goals.ts` gestionan la planificación.
- **Núcleo**: una migración puede llevar un paso de datos `data(db)` que corre en la misma operación. Los módulos pueden tener un paso `startup`, que corre después de la copia diaria y no impide abrir la app si falla.
- **Migración 2006**: boceto semanal (`trn_base_week`, `trn_base_week_meta`), planes por semana (`trn_week_plan_weeks` con origen BASE/EDITED y `trn_week_plan`), alias de tipos de entreno, `event_id` e `is_deload` en bloques, rango de series por semana en grupos (10–20), `hyrox_station` en ejercicios (propuesta una sola vez con el diccionario) y `kind` en objetivos.
- **Semanas**: siempre de lunes a domingo (`weekStartsOn` solo acepta 1). Una semana que empieza sin plan se guarda copiando el boceto vigente (origen BASE): al arrancar y al leerla. El límite hacia atrás es la semana del primer boceto; las anteriores quedan sin plan. Editar el boceto guarda antes con el boceto anterior las semanas terminadas que falten y rehace la semana actual solo si su origen es BASE. Las semanas EDITED y las pasadas no cambian nunca.
- **Hecha ↔ planificada**: un único emparejamiento por semana alimenta la semana resuelta, la adherencia, el Inicio y "Últimas 4 semanas". Primero por tipo de entreno (en el día o en un hueco libre de la semana); si la sesión no tiene tipo de entreno, por tipo de sesión del mismo día. Lo que no cumple ningún hueco va a `extra`. Sin plan, se usa lo previsto del bloque por tipo de sesión. Cada semana va aparte y no pasa del 100 %.
- **Tipos de entreno**: un tipo en uso (semanas guardadas o sesiones) no se borra, se desactiva. La importación y "Asignar a sesiones ya importadas" solo usan tipos activos y nunca cambian una sesión que ya tenga tipo.
- **Récords**: se calculan, no se guardan. La primera sesión de un ejercicio no se marca como récord (sus marcas sí cuentan) e igualar una marca tampoco es récord. Los ejercicios de peso corporal no suman kg ni tienen e1RM.
- **Objetivos**: proyección por regresión lineal sobre las últimas N semanas con datos (x en días reales / 7), mínimo 3; en volumen y frecuencia no entra la semana en curso. Texto de estimación, nunca "llegas".
- **Volumen semanal**: en una semana en curso, el % compara con los mismos días de la semana anterior.
- **HYROX**: el Resumen muestra el evento futuro más cercano con bloques. La mejor duración de una estación se compara solo entre series de la misma distancia (la más repetida).
- **Pendiente para F5**: el Inicio importaba formateadores de `modules/entreno` desde `core/inicio` (resuelto en F5: las tarjetas vienen del módulo). La caché de métricas se vacía también con escrituras de finanzas (aceptable hoy).

### 3.7 Cómo quedó tras F5 (decisiones de implementación)

- **Contrato** en `src/shared/core/metrics-types.ts`:
  - `MetricDef` lleva `id` (`<módulo>.<id>`), `module`, `name`, `unit` canónica, `aggregation` (`sum` flujos, `last` saldos, `ratio` tasas con `num`/`den`, `max` mejores marcas), `groupings`, `splits`, `filters`, `presentation?: 'reference'` (series de referencia como el presupuesto, que se dibujan discontinuas) y `compute`.
  - En `ratio`, un punto con `den = 0` no tiene valor propio (sale vacío) pero cuenta en los totales.
  - El núcleo junta las métricas de todos los módulos (`core:metrics.list/compute/options`).
- **Motor puro** en `src/shared/core/charts/`: validación de la especificación v1 (1–6 series; misma agrupación admitida; misma unidad; división solo con una serie; apilar solo con `sum`; dispersión con dos series), rangos relativos con `now` y semanas ISO, periodo anterior de igual duración (con fin de mes alineado), agregación, apilado con «Otros» a partir de 12 valores, dispersión, tabla y `mergeDashboard`.
- **Métricas mensuales con mes en curso**: Finanzas calcula por meses completos, así que el periodo anterior se alinea a meses completos y el gráfico lo dice.
- **Finanzas**:
  - 14 métricas en `modules/finanzas/metrics.ts` que envuelven las funciones de siempre (tests de igualdad). Los gastos salen en positivo para compararlos con el presupuesto. La tasa de ahorro del año es flujo neto / ingresos de todo el año.
  - `AppState` vive en `appState.ts` (sin ciclo de importaciones); `state.ts` es la entrada.
- **Tablas del núcleo**: `core_charts` (1001) y `core_dashboards` (1002). Escrituras por la cola con auditoría; borrar un gráfico lo quita de todos los paneles en la misma operación.
- **Interfaz**:
  - `core/graficos/` (`PanelEditable`, `GraficoVista`, `ConstructorGrafico`, `TarjetasProvider`). Las tarjetas fijas las registra cada módulo en `modules/<módulo>/tarjetas.tsx` y `App.tsx` las junta: el núcleo no importa módulos y el Inicio ya no importa piezas de Entreno.
  - Cuadrícula de 12 columnas (pequeña ⅓, mediana ½, ancha ⅔, completa), en dos columnas o a todo el ancho por debajo de unos 56rem.
  - Editar panel con borrador y Hecho/Cancelar; «Restaurar diseño» también se deshace con Cancelar.
  - Arrastre con @dnd-kit, ratón y teclado; marca el hueco y reordena al soltar.
  - Los gráficos solo se editan o borran en modo editar.
- **Decisiones de Michael en F5**: los paneles por defecto van a mitades y tercios (los antiguos 7/5 y 5/4/3 ya no existen), el arrastre no recoloca en vivo, no hay lápiz fuera del modo editar y el presupuesto siempre se dibuja discontinuo.
- **Pendiente**: al salir de la página en modo edición se descartan los cambios con un aviso, sin confirmar antes (el `HashRouter` actual no permite `useBlocker`). Exportar o importar paneles queda fuera.

### 3.8 Cómo quedó tras F6 (decisiones de implementación)

- **Contrato** en `src/shared/core/ai-types.ts`: `LlmProvider`, herramientas `read`/`action` (`AiToolDef`), propuestas con antes/después y estado, sugerencias, conversaciones, métodos `core:ai.*` (`AiHandlers`) y eventos `ai:event` (`AiEvent`). La validación de los ajustes y de la URL local está en `src/shared/core/ai-settings.ts`.
- **Proveedor**: `src/main/core/ai/ollama.ts` es el único `fetch` del proceso principal (lo comprueba `reglas.test.ts`). Valida que la URL sea de este equipo antes de cada petición, no sigue redirecciones, va en streaming NDJSON, tiene tiempos de espera y se puede cancelar. Los errores llevan código (`unreachable`, `model_missing`, `timeout`, `aborted`, `bad_url`, `bad_response`) y mensaje en español. Modelo por defecto `qwen3:8b` (equipo de Michael: 32 GB de RAM, RTX 5060 Laptop de 8 GB), con `num_ctx` 12 288 porque las descripciones de las herramientas ocupan unos 6 000 tokens.
- **Orquestador** (`src/main/core/ai/assistant.ts`):
  - `send` vuelve en seguida y la respuesta llega por `ai:event`.
  - Responde una vez a la vez por conversación y como mucho 6 pasos de herramientas.
  - Recortes: resultados a 8 000 caracteres (los de turnos anteriores a 1 500), historial de 20 mensajes y búsquedas de movimientos de 50 como máximo.
  - El prompt de sistema va en español, con la fecha de hoy, y no nombra la app.
- **Herramientas** (40):
  - Las registra cada módulo en `aiTools`, y el núcleo las suyas `core_*`. El registro valida nombres `<dueño>_<nombre>` únicos.
  - Las de lectura reutilizan los servicios de siempre.
  - Las de acción solo hacen `plan`. Al confirmar, `apply` llama a la misma función con la misma etiqueta de cola que el handler de la página, así que la validación y la auditoría son las de siempre y la lógica financiera no cambia.
  - Aceptan nombres además de ids, y los importes en euros pasan a céntimos.
- **Alcance de los cambios (decisión de Michael)**:
  - Finanzas: movimientos (crear, editar, categoría, estado y borrar), presupuestos y objetivos.
  - Entreno: sesiones manuales y sus datos, objetivos, eventos, plan de la semana y rutinas.
  - Núcleo: crear gráficos.
  - Nada de cuentas, categorías, inversiones, reglas, ajustes, fusiones, importaciones ni restaurar. Un test falla si aparece una acción nueva sin su caso.
- **Propuestas**:
  - Con criterio común y 3 o más cambios, se agrupan en una ventana con «Confirmar todo». Si no, van una a una. Hoy solo «recategorizar» da criterio.
  - Huella (sha1 del registro) para caducar: si el registro cambió, la propuesta pasa a `stale` y no escribe nada. Se comprueba antes de escribir y otra vez dentro de la misma operación de la cola que escribe (`guard` en `toolkit.ts`), así que ninguna escritura se cuela entre las dos.
  - «Recategorizar» busca el texto solo en la descripción y el comercio, y el criterio dice cuántos movimientos se omiten y por qué.
  - Un grupo se aplica en orden: si se para a mitad queda `partial`, y si falla el primero, `failed`.
  - Se guardan en el mensaje del asistente (`proposals_json`).
- **Sugerencias**:
  - Las calcula la app y funcionan con Ollama apagado. Entreno usa la revisión semanal pura (`src/shared/modules/entreno/metrics/review.ts`) y Finanzas usa `computeAlerts`.
  - La revisión mira la última semana completa: adherencia, estancamientos (fuerza o sin categoría; igualar cuenta como estancado), grupos por debajo de su mínimo (solo los que tienen series en las últimas N semanas), ritmo de objetivos, HYROX y récords. Como mucho 3 por tipo.
  - Los cinco umbrales están en Ajustes › Entreno › Revisión semanal (`trn_settings`, sin migración).
- **Tablas del núcleo**: `core_ai_threads` y `core_ai_messages` (1003), y `core_settings` (1004, claves `ai.*`). Los mensajes no se auditan; los ajustes sí.
- **Interfaz**:
  - `core/asistente/`: panel con estado de Ollama, conversaciones, respuesta en directo, propuestas sueltas y en grupo, y sugerencias con «Coméntalo».
  - La tarjeta «Sugerencias» (`core.sugerencias`) se añade desde «Editar panel». No va al Inicio por defecto para no aparecer en los paneles ya guardados.
  - Ajustes › Asistente sustituye a la sección MCP.
  - El texto del asistente se pinta sin `dangerouslySetInnerHTML`.
- **MCP eliminado**: `src/mcp/`, `scripts/build-mcp.mjs`, el script `mcp`, `@modelcontextprotocol/sdk`, `esbuild` (solo lo usaba el MCP), `out/mcp` del empaquetado y `finanzas:mcp.config`.
- **Pendiente**: comprobar con el modelo real que `qwen3:8b` elige bien entre 40 herramientas. Si no, la opción es ofrecerle solo las del módulo de la pregunta.

## 4. Modelo de datos de Entreno

La exportación de Hevy tiene una fila por serie con estas columnas: `title`, `start_time`, `end_time`, `description`, `exercise_title`, `superset_id`, `exercise_notes`, `set_index`, `set_type`, `weight_kg`, `reps`, `distance_km`, `duration_seconds`, `rpe`.

**Confirmado con el archivo real de Michael (23/11/2026)**: esas 14 columnas, todas con cabecera entre comillas; separador coma y CRLF; fechas `d MMM yyyy, HH:mm` con meses en inglés (`5 Nov 2026, 07:05`), en hora local; `set_type` visto: `normal`, `failure`, `dropset` (también se acepta `warmup`); `set_index` empieza en 0 y es por ejercicio; filas de la sesión más nueva a la más antigua; números con punto decimal y vacíos cuando no hay dato. El importador acepta también meses en español y `dd/MM/yyyy` por si cambia el idioma del móvil.

Las columnas de Hevy se guardan con **el mismo nombre** en dos tablas: lo que es de la sesión en `trn_workouts` y lo que es de la serie en `trn_sets`. La vista `trn_v_hevy` las vuelve a juntar con la forma exacta del CSV, para exportar y para comprobar que la importación no pierde nada.

### trn_workouts (una fila por sesión)

| Columna | Origen | Notas |
|---|---|---|
| id | app | |
| title | Hevy | |
| start_time | Hevy | Guardada como ISO local `YYYY-MM-DDTHH:mm` |
| end_time | Hevy | |
| description | Hevy | |
| kind | extra | `GYM`, `SWIM`, `HYROX`, `RUN`, `OTHER`. Se deduce por reglas editables (título, ejercicios) y se puede corregir |
| block_id | extra | Bloque de entrenamiento al que pertenece (por fecha) |
| routine_id | extra | Rutina planificada que corresponde (si la hay) |
| perceived_effort | extra | Esfuerzo de la sesión 1–10 (opcional, a mano) |
| notes | extra | Notas propias |
| source | extra | `HEVY` o `MANUAL` |
| import_id | extra | Importación de la que vino |
| hevy_key | extra | `title + start_time`. UNIQUE: evita duplicados al reimportar |

### trn_sets (una fila por serie)

| Columna | Origen | Notas |
|---|---|---|
| id, workout_id | app | |
| exercise_title | Hevy | |
| superset_id | Hevy | |
| exercise_notes | Hevy | |
| set_index | Hevy | |
| set_type | Hevy | `normal`, `warmup`, `dropset`, `failure` (confirmar valores con el archivo real) |
| weight_kg | Hevy | |
| reps | Hevy | |
| distance_km | Hevy | |
| duration_seconds | Hevy | |
| rpe | Hevy | |
| exercise_id | extra | Enlace al catálogo |
| exercise_order | extra | Orden del ejercicio dentro de la sesión (por orden de aparición en el CSV) |
| notes | extra | |

### Tablas de apoyo

| Tabla | Para qué |
|---|---|
| `trn_imports` | Historial de importaciones: archivo, hash, fecha, filas nuevas/duplicadas/con error |
| `trn_exercises` | Catálogo. `title` coincide con `exercise_title` de Hevy. Campos extra: categoría (fuerza, natación, HYROX, cardio, movilidad), grupo muscular principal, secundarios, tipo de medida, si es con peso corporal, activo. Se crea solo al importar un ejercicio nuevo; Michael completa los grupos musculares |
| `trn_exercise_aliases` | Une nombres distintos del mismo ejercicio (por ejemplo, si Hevy cambia el nombre) |
| `trn_blocks` | Bloques de entrenamiento: nombre, fechas, objetivo principal, sesiones previstas por semana y tipo (por defecto 4 gimnasio + 2 natación) |
| `trn_routines`, `trn_routine_items` | Rutinas planificadas (Upper, Lower, natación velocidad, natación resistencia…): ejercicios, series objetivo, rango de repeticiones, RPE objetivo |
| `trn_goals` | Objetivos del momento: tipo (e1RM, peso × repeticiones, volumen semanal, frecuencia, evento con fecha), valor objetivo, fecha límite, ejercicio o grupo muscular, estado |
| `trn_events` | Eventos con fecha, por ejemplo HYROX Open Madrid el 20/03/2027 |
| `trn_settings` | Parámetros de métricas editables (fórmula de e1RM, qué tipos de serie cuentan, inicio de semana) |

Natación: una sesión `SWIM` con sus ejercicios como series (repeticiones = número de largos o series, distancia opcional). Si viene de Hevy, se importa igual; si no, se apunta a mano en la app.

## 5. Importación y exportación

- **Importar Hevy**: elegir archivo → vista previa (sesiones nuevas, duplicadas, filas con error, ejercicios nuevos) → confirmar → escritura en una sola operación de la cola. Reimportar el mismo archivo o uno más completo no duplica nada (`hevy_key` + `set_index`).
- Acepta CSV (y TSV si Hevy lo manda así) y también el mismo contenido guardado como `.xlsx`.
- **Exportar**: entreno a CSV con forma Hevy (`trn_v_hevy`), a Excel (una hoja por tabla) y a JSON completo restaurable. Finanzas mantiene sus exportaciones actuales.
- Copia de seguridad completa: la actual, que ya incluye todas las tablas del archivo.

## 6. Lógica de métricas (v1)

Reglas comunes: la semana va de lunes a domingo, hora de Madrid. Las series `warmup` no cuentan en ninguna métrica de rendimiento. Todos los parámetros marcados como (editable) están en `trn_settings`.

| Métrica | Cálculo |
|---|---|
| Volumen de carga | Σ `weight_kg × reps` de las series que cuentan. Por sesión, ejercicio, grupo muscular, semana y mes |
| Volumen con peso corporal | Σ `reps` en ejercicios marcados como peso corporal (se muestra aparte, no se mezcla con kg) |
| Series efectivas por grupo muscular | Por semana. Grupo principal cuenta 1, secundarios 0,5 (editable) |
| e1RM | Epley `peso × (1 + reps/30)` solo con 1–12 repeticiones (fórmula y límite editables; alternativa Brzycki). Se toma la mejor serie de la sesión |
| Récords personales | Por ejercicio: peso máximo, mejor e1RM, más repeticiones con un peso dado, mayor volumen en una sesión. Se detectan al importar y se marcan en la sesión |
| Adherencia | Sesiones hechas / sesiones previstas del bloque, por semana y por tipo (gimnasio, natación) |
| Frecuencia por grupo muscular | Días por semana que se entrena cada grupo |
| Duración y densidad | Minutos por sesión (`end_time − start_time`) y volumen por minuto |
| Intensidad percibida | RPE medio por ejercicio y semana; carga interna semanal = Σ (series × RPE) cuando hay RPE |
| Natación | Sesiones por semana, ejercicios hechos, metros si hay distancia |
| HYROX | Seguimiento de las estaciones (SkiErg, Sled Push, Sled Pull, Burpee Broad Jump, Remo, Farmers Carry, Sandbag Lunges, Wall Balls) y la carrera: frecuencia y mejores marcas registradas (peso, distancia o duración según lo que haya) |
| Progreso hacia un objetivo | % alcanzado + proyección: tendencia lineal de las últimas 6 semanas (editable) hasta la fecha límite → "llegas / no llegas al ritmo actual" |
| Días hasta un evento | Cuenta atrás y semanas de entrenamiento restantes |

Las métricas son funciones puras en `src/shared/modules/entreno/` con tests, y cada una se registra en `metrics` del módulo para que el constructor de gráficos y la IA las usen.

## 7. Gráficos personalizables

- Constructor en el núcleo, válido para todos los módulos.
- Un gráfico se guarda como JSON en `core_charts`: métrica, agrupación (día, semana, mes), rango de fechas, filtros (ejercicio, grupo muscular, tipo de sesión, cuenta, categoría…), tipo (línea, barras, área, barras apiladas, dispersión, tabla), comparación con el periodo anterior, línea de objetivo.
- Paneles editables en `core_dashboards`: cada módulo tiene el suyo y el inicio tiene un panel de vida que mezcla tarjetas de los dos módulos.
- Sin `eval` ni código escrito por el usuario. Si más adelante se quieren fórmulas propias, se hará con un evaluador de expresiones seguro.

## 8. IA local

- Proveedor: Ollama en `http://localhost:11434`, llamado solo desde el proceso principal.
- Interfaz `LlmProvider` intercambiable (chat, herramientas, streaming). Hoy solo existe `OllamaProvider`. Un futuro proveedor que haga de puente con Claude sería otro `LlmProvider`, sin tocar el resto.
- Modelo configurable en Ajustes. Por defecto `qwen3:8b`, que usa bien las herramientas y cabe entero en la GPU del equipo de Michael (32 GB de RAM, RTX 5060 Laptop de 8 GB).
- Herramientas de lectura: las métricas registradas por cada módulo y resúmenes (mes de finanzas, semana de entreno, progreso de objetivos).
- Herramientas que proponen cambios (crear objetivo, ajustar una rutina, crear un gráfico): la IA **propone**, la interfaz lo muestra, Michael confirma y entonces se escribe a través de la cola.
- Sugerencias: revisión semanal de entreno (estancamientos, grupos musculares por debajo de lo previsto, adherencia, ritmo hacia HYROX) y avisos de finanzas que ya calcula la app.
- Si Ollama no está arrancado, la app funciona igual y el panel de IA lo dice.
- Conversaciones guardadas en `core_ai_threads` y `core_ai_messages`, borrables.

## 9. Interfaz nueva

- Primero diseño: sistema de diseño (colores, tipografía, espaciado, componentes, gráficos en claro y oscuro) y pantallas clave en un diseño visual que Michael aprueba. Después, código.
- Shell nuevo: barra lateral con los módulos, inicio "panel de vida", panel de IA lateral plegable, buscador de comandos (Ctrl+K).
- Las páginas de finanzas se adaptan al sistema nuevo sin cambiar qué muestran.

## 10. Fases

Cada fase es una rama y un PR. Versiones internas 0.6 → 0.9; la 1.0.0 cierra la evolución. Nada se publica sin que Michael lo pida.

| Fase | Contenido | Agentes principales | Termina cuando |
|---|---|---|---|
| F0 Cimientos | `CLAUDE.md`, agentes, este documento, inventario del nombre, test dorado de finanzas, `docs/CHANGELOG.md` | orquestador, tests, registro-nombre | Test dorado pasa con los datos reales de Michael en local |
| F1 Núcleo | Reorganizar en `core/` + `modules/finanzas/` sin cambiar lógica, registro de módulos, cola de escritura | arquitecto-datos, guardian-finanzas, tests | Test dorado idéntico + test de la cola |
| F2 Diseño | Sistema de diseño, pantallas aprobadas, shell nuevo, finanzas reestilizada | interfaz | Michael aprueba en Windows |
| F3 Datos de entreno | Migraciones `trn_`, importador de Hevy con vista previa, catálogo de ejercicios, alta manual, exportaciones | arquitecto-datos, importadores | Importa el archivo real de Michael dos veces sin duplicar y `trn_v_hevy` reproduce el CSV |
| F4 Lógica y pantallas de entreno | Métricas, récords, bloques, rutinas, objetivos, eventos, páginas | dominio-entreno, interfaz | Tests de métricas + revisión de Michael |
| F5 Gráficos y panel de vida | Constructor de gráficos, paneles editables, inicio | motor-graficos, interfaz | Michael crea y guarda sus propios gráficos |
| F6 IA local | `LlmProvider`, Ollama, herramientas, propuestas con confirmación, sugerencias. Eliminar `src/mcp/` y su script | ia-local | Funciona con Ollama encendido y la app no falla con Ollama apagado |
| F7 Cierre | Prueba de extremo a extremo, revisión completa, README, 1.0.0 | tests, revisor | Michael da el visto bueno y pide publicar |
| Parche 1.0.x | Cambio de nombre siguiendo `docs/NOMBRE_APP.md` | registro-nombre | Datos migrados y app actualizada sin perder nada |

## 11. Equipo de agentes

La sesión principal (orquestador) va con **Opus 5.5** (desde F2; en F0 y F1 fue Fable 5.2). Al lanzar cada agente se le pasa el effort de esta tabla.

| Agente | Modelo | Effort | Rol |
|---|---|---|---|
| orquestador (sesión principal) | opus | high | Planifica cada fase, reparte, integra, decide, habla con Michael |
| arquitecto-datos | opus | high | Esquema, migraciones, núcleo, módulos, cola de escritura |
| dominio-entreno | opus | high | Métricas y lógica de entreno (funciones puras + tests) |
| motor-graficos | opus | high | Constructor de gráficos, paneles, registro de métricas |
| ia-local | opus | high | Proveedor Ollama, herramientas, propuestas, sugerencias |
| interfaz | sonnet | high | Sistema de diseño, componentes y páginas |
| guardian-finanzas | sonnet | medium | Mover código de finanzas sin cambiar resultados; vigila el test dorado |
| importadores | sonnet | medium | Importador de Hevy, exportaciones, deduplicado |
| tests | sonnet | medium | Escribir y ejecutar tests, arreglar los que fallan por cambios de estructura |
| revisor | opus | high | Revisa cada PR sin haberlo escrito. Solo lectura |
| registro-nombre | haiku | low | Mantiene `docs/NOMBRE_APP.md` al día |
| explorador | haiku | low | Búsquedas en el código y resúmenes para otros agentes |

## 12. Pendiente de Michael

- Instalar Ollama y descargar el modelo (`ollama pull qwen3:8b`) para probar F6 en Windows.

## 13. Estado (28/11/2026)

- **Hechas**:
  - F0 a F5 en `main`. **Publicada la 0.6.0**, que Michael ya usa con sus datos reales.
  - F6 IA local en la rama `evolucion/f6-ia-local`, pendiente de que Michael la pruebe en Windows con Ollama y haga el merge (§3.8).
- **Siguiente: F7 cierre** (fila F7 de §10), con `tests` y `revisor`:
  - prueba de extremo a extremo;
  - revisión completa;
  - README;
  - versión 1.0.0 cuando Michael la pida.
- **Qué hay para F7**:
  - No hay tests de componentes en la interfaz. La prueba de extremo a extremo de F6 se hizo con un Ollama falso (un script de Node fuera del repo que imita `/api/tags` y `/api/chat` en NDJSON) y datos sintéticos con `FINANZAS_DATA_DIR`. Es un buen punto de partida para la de F7.
  - Si el modelo real no elige bien entre las 40 herramientas, ver el pendiente de §3.8.
  - Pendientes de fases anteriores: §3.6 y §3.7.
- **Después**: el parche de cambio de nombre (`docs/NOMBRE_APP.md`).
