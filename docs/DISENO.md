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
