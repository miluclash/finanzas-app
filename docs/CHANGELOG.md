# Registro de cambios

Una nota por PR, lo más nuevo arriba. Las versiones publicadas llevan su fecha; lo que está en `main` sin publicar va en "Sin publicar".

## Sin publicar

### F4 Lógica y pantallas de entreno (evolución a panel de vida)

- **Métricas de entreno** (§6), como funciones puras con tests: volumen de carga y con peso corporal, series efectivas por grupo con su rango, e1RM (Epley o Brzycki), récords, adherencia semana a semana (sin compensar entre semanas y sin pasar del 100 %), frecuencia, duración y densidad, RPE y carga interna, natación, HYROX, progreso de objetivos con proyección y cuenta atrás.
- **Plan**: tipos de entreno ("Fuerza A", "Natación"…), semana base (boceto) y semana concreta, en la que puedes mover sesiones de día o cambiarlas de orden. Cada semana se guarda sola copiando el boceto vigente, así que cambiar el boceto no toca las semanas pasadas ni las que hayas editado. Bloques con fases de un evento y semanas de descarga.
- **Objetivos** de e1RM, peso × repeticiones, volumen semanal, frecuencia y evento, con gráfico de lo observado y proyección rotulada ("Proyección: 104,1 kg el 31 ene"). Al cumplirse, la app propone marcarlo como conseguido. Gestión de eventos.
- **Resumen de Entreno** como la maqueta aprobada: semana con el estado de cada día, próxima sesión, volumen semanal (comparado con los mismos días de la semana anterior), series por grupo, HYROX, objetivos, récords, últimas sesiones con su marca de récord y constancia de 12 semanas, por semana, mes o bloque.
- **Inicio**: las tarjetas de Entreno (semana, próxima sesión y récords recientes) muestran datos reales.
- **Más cosas**: estación HYROX en Ejercicios (propuesta automáticamente por el nombre), tipo de entreno en el detalle y en el alta manual de sesiones, "Asignar a sesiones ya importadas" y parámetros de métricas editables en Ajustes › Entreno.
- Migración 2006: solo columnas y tablas nuevas. Las migraciones aceptan un paso de datos, y los módulos, un paso de arranque que corre después de la copia diaria y no impide abrir la app si falla.
- Finanzas no cambia: los dos dorados dan las mismas cifras sin regenerar nada.

### F3 Datos de entreno (evolución a panel de vida)

- **Entreno ya tiene datos.** Tablas nuevas `trn_` (migraciones 2001–2005, solo tablas nuevas): sesiones y series con las mismas columnas que la exportación de Hevy, catálogo de ejercicios con grupos musculares y alias, reglas de tipo de sesión, ajustes, historial de importaciones y, sin pantallas todavía, bloques, rutinas, objetivos y eventos (llegan en F4). Antes de migrar se hace la copia `antes-de-migrar`, como siempre.
- **Importar de Hevy** (CSV, TSV o el mismo contenido en `.xlsx`): vista previa con sesiones nuevas, cambiadas, duplicadas, filas con error (línea, columna y motivo), ejercicios nuevos y avisos. Al confirmar se escribe todo en una sola operación, con copia `antes-de-importar`. Reimportar no duplica. Una sesión que cambiaste en Hevy sustituye sus series y conserva tus notas, el esfuerzo y el tipo si lo cambiaste a mano. Comprobado con una exportación real (fuera del repo): dos importaciones sin duplicar y el CSV exportado reproduce el original celda a celda.
- **Pantallas de Entreno**: Resumen con las últimas sesiones; Sesiones (lista, detalle, valoración, borrado); alta y edición manual (pensada para natación); Ejercicios (categoría, medida, peso corporal, grupos musculares, alias y unir dos); Ajustes › Entreno (grupos musculares, reglas de tipo, historial de importaciones, exportar y restaurar). Accesos en Ctrl+K.
- **Exportar Entreno** a CSV con la forma exacta de Hevy, a Excel (una hoja por tabla) y a JSON restaurable. Restaurar ese JSON solo toca Entreno, con copia previa.
- **Copias**: la copia completa ya incluye Entreno. Las copias de antes de esta versión se siguen pudiendo restaurar (Entreno queda vacío, con los grupos musculares y las reglas iniciales).
- `ISODate` y `MonthKey` pasan a `src/shared/types.ts`. Finanzas no cambia: los dos dorados dan las mismas cifras sin regenerar nada.
- Las capturas de las maquetas quedan solo a 1440×900. `.gitattributes` guarda las muestras inventadas de Hevy byte a byte.

### F2 Diseño (evolución a panel de vida)

- **Sistema de diseño nuevo.** Inter (cifras tabulares), iconos Phosphor, tokens de color, tipografía, espaciado, radios y densidades en `src/renderer/src/core/design/`, y componentes en `src/renderer/src/core/ui/`. Tema oscuro y claro con el mismo cuidado y contraste AA comprobado (`scripts/contrastes.mjs`); `scripts/auditar-tokens.mjs` avisa si una pantalla usa colores o medidas sueltas. Cada módulo tiene su identidad: Finanzas sobrio con un acento azul apagado, Entreno con lima.
- **Shell nuevo.** Barra lateral plegable con Inicio, Finanzas y Entreno, buscador de comandos con Ctrl+K, hueco para el asistente de IA (llega en la fase de IA local) y transiciones que respetan "reducir movimiento".
- **Inicio "panel de vida".** Disponible, por revisar, resumen de Finanzas y tendencia, con datos que ya calculaba la app. La parte de Entreno sale vacía hasta F3.
- **Finanzas reestilizada** con el mismo contenido y las mismas cifras. Lo secundario del Panel queda en "Más detalle". Movimientos tiene filtros avanzados, pastillas de filtros activos y tres densidades. Ajustes tiene navegación interna, barra de guardado y el estado de la última copia.
- **Rutas.** Finanzas pasa a `/finanzas/...`; las rutas antiguas redirigen a las nuevas.
- **Tema.** Oscuro / Claro / Sistema arriba en Ajustes, guardado como antes. Las instalaciones nuevas empiezan en oscuro (una base que ya tenía tema guardado lo conserva). Por eso el dorado sintético se ha regenerado: solo cambia `theme` de `system` a `dark`.
- **Maquetas** con datos inventados en `design/maquetas/` (`npm run maquetas`, accesible desde la red local) y sus capturas en `design/capturas/`. El brief y la revisión de diseño están en `docs/DISENO.md`.
- Se quitan `lucide-react` y la fuente IBM Plex. El orquestador de la evolución pasa a ser Opus 5.5.
- Sin cambios en el proceso principal salvo el tema por defecto y el color inicial de la ventana. Los dorados (sintético y con datos reales) dan las mismas cifras y los totales que suma la interfaz se han comparado contra `main`.

### F1 Núcleo (evolución a panel de vida)

- **Núcleo y módulos.** El proceso principal se reorganiza en `src/main/core/` (base de datos, cola de escritura, migraciones, registro de módulos, copias) y `src/main/modules/finanzas/`. La lógica de finanzas solo cambia de sitio: el test dorado (sintético y con datos reales) da exactamente las mismas cifras.
- **Cola de escritura.** Todas las escrituras en la base pasan por una cola única, una detrás de otra, cada una en su transacción y con un guardado en disco por operación (temporal + renombrado, como antes). Escribir fuera de la cola da error.
  - Abrir la app sin cambios ya no reescribe `finanzas.sqlite`.
  - Si hay migraciones pendientes sobre una base con datos, antes se hace una copia `antes-de-migrar`.
  - Restaurar una copia la pone al día en memoria antes de tocar el archivo: si no sirve para esta versión, no cambia nada y lo dice; la copia `antes-de-restaurar` solo se hace cuando la copia elegida es válida.
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
