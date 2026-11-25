# Brief de diseño

Referencia del agente `interfaz` desde la fase F2 (Diseño) y en todas las siguientes. Si una pantalla nueva no encaja con algo de aquí, se pregunta a Michael antes de inventar.

## Referencias

Apple (claridad, jerarquía, materiales, espaciado generoso, animaciones sutiles) y Notion (calma, tipografía cuidada, contenido por encima del adorno).

Lo que **no** queremos: una interfaz monótona y simplona como la de la v0.5, con iconos, tipografía y distribución planos.

## Tema

- Oscuro por defecto.
- Interruptor en Ajustes con **Oscuro / Claro / Sistema**, que se recuerda entre sesiones.
- Los dos temas tienen que estar igual de cuidados.

## Tipografía

- **Inter** (variable, con números tabulares para cifras).
- Escala con contraste claro: cifras clave grandes y con peso, etiquetas pequeñas y discretas. Nada de todo el texto al mismo tamaño.

## Iconos

**Phosphor**. Regular para navegación; duotono o relleno para estados activos y tarjetas destacadas.

## Identidad por módulo

Con tokens: cada módulo tiene su acento y su densidad; el núcleo es neutro.

- **Finanzas**: sobrio, casi negro, callado y profesional. Escala de grises con un único acento apagado. Verde y rojo solo para positivo/negativo, y desaturados. Densidad **baja**: cada pantalla enseña lo esencial de un vistazo (por ejemplo, el panel con disponible, patrimonio, mes en curso y avisos) y el detalle se abre bajo demanda (expandir, ir a la página, tooltip). No mostrar todas las métricas a la vez.
- **Entreno**: más color y energía, con sensación de gimnasio (un acento vivo, tipo lima/volt o naranja, más contraste, cifras grandes tipo marcador). Densidad **alta**: más estadísticas visibles a la vez (volumen, récords, adherencia, progreso hacia objetivos), pero ordenadas en una cuadrícula clara.
- **Principio común**: el objetivo siempre es entender los datos de forma simple. Cada número lleva contexto (respecto a qué, si va bien o mal) y cada gráfico responde a una pregunta.

## Distribución

- **Shell**: barra lateral con los módulos (Inicio, Finanzas, Entreno) y sus secciones, plegable. Panel de IA lateral plegable (en F2 solo el hueco, sin funcionalidad). Buscador de comandos con Ctrl+K.
- **Inicio "panel de vida"**: tarjetas de los dos módulos con su propia identidad, en una cuadrícula tipo bento, no una lista.
- **Tarjetas** con jerarquía (cifra principal, contexto, mini gráfico), no tablas por defecto. Las tablas solo donde haga falta comparar filas (movimientos).
- **Estados** vacíos, de carga y de error diseñados, no texto suelto.

## Gráficos

Siguiendo la skill `dataviz`. Paleta derivada del acento de cada módulo, legible en claro y oscuro.

## Movimiento

Transiciones cortas y suaves (cambio de página, abrir tarjeta, hover). Respetar "reducir movimiento" del sistema.

## Accesibilidad

Contraste AA en ambos temas, foco visible, todo usable con teclado.

## Pantallas de la etapa de diseño (F2)

Inicio (panel de vida), Panel de Finanzas, Movimientos, una pantalla de Entreno con datos inventados y Ajustes con el interruptor de tema. Cada una en oscuro y en claro, siempre con datos inventados.

## Reglas que siguen vigentes

El nombre sigue siendo Finanzas, las cifras no cambian, todas las escrituras van por la cola, la IA es solo local y en el repo no entra ningún dato real de Michael.

## Revisión de diseño 1 (19/11/2026)

Pliego de Michael tras ver las primeras maquetas. Es solo de diseño: no cambia ningún cálculo, fórmula ni dato. Donde contradiga algo de arriba, manda esta revisión.

### Principios
- Claridad antes que espectáculo: cada pantalla responde a una pregunta principal.
- Jerarquía editorial: un protagonista, varios secundarios, el detalle bajo demanda.
- Densidad deliberada: compactar sin perder legibilidad; Finanzas baja, Entreno alta (se mantiene del brief).
- El color de identidad no es un color de estado.
- Contraste verificable: nunca texto casi invisible para parecer sofisticado.
- Sistema, no excepciones: mismos tokens, componentes y estados en todas las pantallas. Nada de colores ni espaciados sueltos en una página.

### Color
- Fondo general sin negro puro: la profundidad sale de la luminosidad de las superficies (lienzo < tarjeta < elevado < interactivo). Referencia en oscuro: lienzo #0B0C0F, tarjeta #14161A, elevado #1B1E23, interactivo #252932, borde sutil #30343B. Ajusta si hace falta, pero todo en tokens.
- Texto en cuatro niveles: principal, secundario, terciario (metadatos que se tienen que poder leer) y deshabilitado (solo para eso). Sube el contraste del texto secundario en tablas, gráficos y ajustes.
- Identidad por módulo: Finanzas, casi negro con el azul apagado; Entreno, lima. El lima y el azul son identidad, no estados.
- Estados con sus propios tokens, distintos de la identidad: éxito (un verde distinto del lima), aviso (ámbar), error (rojo suave), información (gris azulado). Un estado nunca va solo con color: lleva icono, texto o etiqueta.
- Como mucho una tarjeta con fondo lima intenso por pantalla y solo si es la métrica central. Ninguna en Inicio. Por defecto, tarjetas oscuras con acento lima.
- Un gasto no es un error: los importes se distinguen por signo, alineación y tipografía. Los ingresos se distinguen sin depender solo del verde.
- Bordes finos y diferencia de tono. Nada de bordes gruesos en todas las tarjetas.
- Botones principales: en Entreno pueden ser lima; en Finanzas, blanco/negro o azul según jerarquía. Documenta la regla.
- Tema claro: mismos tokens con valores propios. Los dos temas igual de cuidados.

### Tipografía
- Inter, sin mezclar familias. Todo con tokens de tamaño, sin tamaños sueltos.
- Escala: KPI protagonista 40–44 px; KPI de tarjeta 30–36 px; título de página 26–28 px; título de sección 18–20 px; título de tarjeta 14–16 px; texto habitual 14 px; etiqueta secundaria 12–13 px; microtexto 11–12 px solo de forma excepcional. Rebaja los KPI de 52 px: la diferencia con las explicaciones es demasiado grande.
- Nada de 11–12 px en información que se consulta a menudo.
- Mayúsculas solo en etiquetas cortas, nunca en títulos largos ni en texto de lectura.
- Números tabulares en tablas, importes y comparativas. Cifras a la derecha, conceptos a la izquierda.
- Formato español: puntos de miles, coma decimal, espacio antes de €. La unidad se separa de la cifra por peso y tamaño sin romper el valor. No cortar importes importantes; si hay que truncar, con tooltip.

### Espaciado y forma
- Escala de 4 px: 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48. 4 entre icono y texto, 8 entre etiqueta y valor, 12 dentro de un grupo, 16 en controles y filas compactas, 24 de padding de tarjeta, 32 entre secciones, 40–48 en bloques principales.
- Tres densidades para tablas, listas y tarjetas: compacta, normal y cómoda, con reglas iguales en toda la app.
- Quita el espacio muerto de las tarjetas altas sin rellenarlas con gráficos que no aportan.
- Alturas de botones y campos normalizadas, con áreas de clic cómodas.
- Radios: tarjetas 12 px, modales 16 px, botones y campos 8 px, etiquetas 6 px, pastillas redondas del todo.
- Sombras discretas solo en lo elevado (modales, menús). Lo demás se separa por tono.

### Componentes
Normaliza estos componentes en la hoja del sistema de diseño, con variantes, tamaños y estados (normal, hover, foco visible, activo, deshabilitado, cargando, error) y cómo se usan con teclado: AppShell, Sidebar, Topbar, PageHeader, Card, KpiCard, StatusBadge, Button, IconButton, TextField, Select, SegmentedControl, DatePicker, Modal, Tooltip, Popover, DataTable, FilterBar, Accordion, EmptyState, LoadingState, ErrorState, Toast, ChartFrame, Legend, ProgressBar, WeekSessionCell, AssistantPanel.
- Etiquetas (recurrente, reembolso, pendiente, posible duplicado…) con un único estilo homogéneo.
- En la hoja del sistema de diseño, añade cuándo se usa cada variante, con un ejemplo correcto y uno incorrecto, y los contrastes comprobados.
- No añadas una biblioteca de componentes nueva.

### Shell y navegación
- Barra lateral expandida y plegada. Plegada: tooltip en cada icono y acceso claro a Nuevo movimiento, Inicio, Finanzas, Entreno y Ajustes.
- Elemento activo marcado por fondo y forma o indicador, no solo por color.
- Cabecera con migas de pan, búsqueda y asistente. Las migas no compiten con el título de la página.
- Ancho de contenido flexible con límite razonable y cuadrícula que se reorganiza (reflow real: columnas que bajan, no KPIs aplastados).
- Ctrl+K: resultados agrupados en Acciones y Pantallas, elemento activo muy visible, atajos visibles.
- Panel del asistente: redimensionable con ancho mínimo y máximo; en ventanas estrechas se abre por encima del contenido en vez de aplastarlo. Estado vacío con el texto "Próximamente", sin respuestas simuladas.

### Pantallas

**Inicio**
- Arriba, lo de hoy: saludo y fecha, disponible para gastar, pendientes por revisar (muy visibles y con acceso directo) y próxima sesión.
- Debajo, un resumen de Finanzas y otro de Entreno, más compactos que en sus páginas y cada uno con un enlace para ver más.
- Al final, lo complementario (récords, tendencias).
- Una sola zona protagonista como mucho. La pantalla no se tiñe de ningún módulo.
- A 1440×900 se entiende sin hacer scroll.

**Finanzas · Panel**
- Primera fila: Disponible (protagonista) y Patrimonio (secundario). Segunda fila: Ingresos, gastos y ahorro, y Avisos.
- Disponible: el desglose del reparto se ve como cálculo legible (liquidez, menos recibos, menos reservado, igual a disponible), con la barra de reparto como apoyo. El estado del mínimo de liquidez va con icono y texto.
- Ingresos, gastos y ahorro sin hueco vertical vacío. "Por delante del ritmo" no tiene aspecto de alerta crítica.
- Avisos con acción directa en cada uno.
- Desplegables de "Más detalle" con estado abierto o cerrado claro, zona de clic amplia y "Plegar todo".

**Movimientos**
- Barra principal: búsqueda, periodo, estado y un botón de "Filtros" con contador. El resto de filtros (cuenta, categoría, tipo, anulados) va en un panel de filtros avanzados.
- Filtros activos como pastillas, con "Limpiar".
- Fila abierta integrada en la fila por tono, sin tarjeta dentro de tarjeta ni bordes anidados. Acciones claras: Editar, Marcar pendiente, Anular. Anular pide confirmación.
- Filas con hover y foco visibles y la densidad elegida.

**Entreno · Resumen**
- Orden: semana (cumplimiento y próxima sesión) → volumen y tendencia → HYROX y objetivos → récords, últimas sesiones y constancia.
- Sesiones de la semana con estados visualmente distintos y leyenda: hecha (fondo lima), hoy (borde lima y fondo oscuro), planificada (neutra), descanso (distinto, que no parezca fallo).
- Volumen: título y gráfico dicen lo mismo ("Volumen semanal", barras por semana), la semana de descarga anotada y una aclaración de que los kg son volumen de entrenamiento.
- HYROX: denominadores claros. El % se rotula como tiempo transcurrido del bloque, no como preparación.
- Series por grupo: estados bajo / dentro / por encima con icono o texto, y la línea de referencia rotulada.
- Objetivos: observado, e1RM y proyección se distinguen a la vista. Línea real continua, proyección discontinua y rotulada como "Proyección". Textos en tono de estimación ("Proyección: 104,1 kg el 31 ene"), nunca "Llegas" ni "No llegas".
- Constancia: mapa de calor con fechas, leyenda que diga qué mide y tooltip.

**Ajustes**
- Navegación interna con sección activa.
- Tarjetas de tema más compactas, con vista previa y selección accesible.
- Campos con unidades, ayuda, validación y aviso de guardado.
- Copias: estado de la última copia (fecha, tamaño), y separación visual clara entre importar, exportar, copiar y restaurar. Restaurar con confirmación.

**Nuevo movimiento**
- Gasto / Ingreso / Transferencia en control segmentado.
- Foco inicial en el importe, que es el campo más grande. Orden: importe, concepto, categoría y cuenta, fecha, acciones.
- Transferencia con origen y destino, sin parecer un gasto.
- Guardar y Cancelar inequívocos; Enter y Escape bien definidos. Estados de error, guardando y hecho; el foco vuelve al cerrar.

### Gráficos (skill dataviz)
- Cada gráfico tiene título, periodo, unidad y una referencia para interpretarlo.
- Los sparklines pueden ir sin ejes, pero con periodo, valor inicial y final o cambio, y tooltip.
- En comparativas, se distingue a la vista lo real, lo histórico, el presupuesto, el objetivo y la proyección (línea, patrón, leyenda). El presupuesto va como línea discontinua rotulada.
- Barras desde cero. Escalas que no engañen.
- Los porcentajes dicen sobre qué y en qué periodo.
- El color nunca es la única señal: leyenda, patrón, símbolo o texto.
- Estados sin datos, cargando y error claramente distintos.

### Accesibilidad y tamaños
- Contraste AA en los dos temas: texto normal ≥ 4,5:1, texto grande ≥ 3:1, controles y elementos de gráfico importantes ≥ 3:1.
- Foco visible de alto contraste y orden de foco lógico. Abrir o cerrar un modal, desplegable o panel no pierde el foco.
- Comprueba 1440×900, 1024×768 y escalado de Windows al 125 % y 150 %: nada cortado ni aplastado.
- Respeta "reducir movimiento" del sistema.

### Otros
- Revisa tildes y ortografía en todos los textos (por ejemplo, "Triceps" → "Tríceps").
- El pie de la barra lateral muestra la versión real de package.json, sin cambiarla.
- Se mantienen las mayúsculas en los títulos de tarjeta de Entreno y la minúscula en Finanzas.
- Las capturas de `design/capturas/` son solo a 1440×900, en oscuro y claro (más la página completa si es más alta). Los 1024×768 y el escalado al 125 % y 150 % se comprueban, pero no se guardan capturas.
