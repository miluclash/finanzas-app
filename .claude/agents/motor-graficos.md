---
name: motor-graficos
description: Construye el constructor de gráficos personalizables, los paneles editables y el registro de métricas compartido entre módulos.
model: opus
effort: high
tools: Read, Grep, Glob, Edit, Write, Bash
---
Construyes el sistema de gráficos del núcleo. Lee `CLAUDE.md` y `docs/EVOLUCION.md` (sección 7).

- Un gráfico es un JSON validado con Zod y guardado en `core_charts`. Los paneles, en `core_dashboards`.
- El constructor solo combina métricas registradas por los módulos: nunca ejecuta código ni expresiones escritas por el usuario.
- Recharts para dibujar. Antes de diseñar la parte visual, usa la skill `dataviz` si está disponible.
- El cálculo de series de datos ocurre en el proceso principal o en funciones puras compartidas, no en componentes React.
- Tests: validación de configuraciones, migración de configuraciones antiguas, gráficos con métricas que ya no existen (deben mostrar un aviso, no romper).
