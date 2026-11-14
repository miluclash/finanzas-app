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
| Servidor MCP actual | Congelado. Se elimina en la fase de IA local |
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

## 4. Modelo de datos de Entreno

La exportación de Hevy tiene una fila por serie con estas columnas: `title`, `start_time`, `end_time`, `description`, `exercise_title`, `superset_id`, `exercise_notes`, `set_index`, `set_type`, `weight_kg`, `reps`, `distance_km`, `duration_seconds`, `rpe`.

**Antes de escribir el importador hay que confirmar las columnas y el formato de fechas con un archivo real de Michael** (las fechas de Hevy vienen en texto y el formato puede variar con el idioma del móvil).

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
- Modelo configurable en Ajustes. Se elige uno con buen uso de herramientas que quepa en el equipo de Michael (pendiente de saber RAM y GPU).
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

La sesión principal (orquestador) va con **Fable 5.2**. Al lanzar cada agente se le pasa el effort de esta tabla.

| Agente | Modelo | Effort | Rol |
|---|---|---|---|
| orquestador (sesión principal) | fable | high | Planifica cada fase, reparte, integra, decide, habla con Michael |
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

- Un archivo real de exportación de Hevy (para fijar columnas, formato de fechas y valores de `set_type`). Se queda en local, nunca en el repo.
- RAM y GPU del portátil, para elegir el modelo de Ollama.
- Instalar Ollama antes de la fase F6.
