# Especificación y arquitectura

## Objetivo

App de escritorio para Windows, de un solo usuario, que sustituye a FINANCIAL_MASTER.xlsx. Los movimientos se introducen a mano; todas las métricas se calculan a partir de ellos. Nada se conecta al banco.

## Arquitectura

| Pieza | Elección | Por qué |
|---|---|---|
| Contenedor | Electron | App de escritorio con tecnologías web, todo en TypeScript |
| Interfaz | React 19 + Tailwind CSS 4 + Recharts | Componentes reutilizables y gráficos |
| Datos | SQLite (sql.js, WebAssembly) | Base relacional real en un único archivo local; sin módulos nativos que compilar |
| Validación | Zod | Las mismas reglas en la interfaz y en el proceso principal |
| Excel | ExcelJS | Importación del FINANCIAL_MASTER y exportación |
| Tests | Vitest | Cálculos financieros e integración con la base de datos |
| Instalador | electron-builder (NSIS) + GitHub Actions en Windows | `.exe` generado en la nube en cada versión |

### Capas

```
src/shared/      Tipos, dinero, fechas y TODA la lógica financiera (funciones puras, testeadas)
src/main/        Proceso principal: base de datos, migraciones, servicios, importación/exportación, IPC
src/preload/     Puente seguro (contextIsolation) que expone window.api
src/renderer/    Interfaz React
tests/           Tests unitarios y de integración
```

La interfaz nunca toca la base de datos: pide datos al proceso principal por IPC. Tras cada cambio se recalcula todo a partir de los datos guardados.

### Datos y privacidad

- Base de datos: `%APPDATA%\Finanzas\finanzas.sqlite`. No sale de tu PC.
- Cada escritura se guarda de forma atómica (archivo temporal + renombrado).
- Copia automática al abrir la app (una por día, se conservan 30) y copias manuales restaurables.
- Exportación completa a JSON, CSV y Excel conservando IDs y relaciones.
- El repositorio de GitHub solo contiene código. `.gitignore` excluye `*.sqlite` y cualquier `FINANCIAL_MASTER*.xlsx`.

## Reglas financieras

1. Movimientos y cuentas son la fuente de verdad.
2. Un movimiento cuenta si no está anulado y su fecha es ≥ la apertura de la cuenta.
3. Las transferencias entre cuentas propias son dos apuntes con el mismo `transfer_id` que suman 0. No son ingreso ni gasto.
4. Los reembolsos (importe positivo) restan del gasto de su categoría; no son ingresos.
5. Comprar o vender inversiones no es gasto; las comisiones sí.
6. Los ajustes de valoración no son flujo de caja.
7. Patrimonio, liquidez y disponible son métricas distintas:
   - **Patrimonio**: suma de las cuentas incluidas en patrimonio (inversiones a valor de mercado).
   - **Liquidez**: cuentas marcadas como líquidas (lo que puedes gastar hoy).
   - **Disponible**: liquidez − reservas para objetivos en cuentas líquidas − cargos recurrentes pendientes del mes.
8. Los datos dudosos se marcan como pendientes de revisar; no se inventan.

## Modelo de datos (resumen)

`settings`, `category_groups`, `categories`, `subcategories`, `accounts`, `reconciliations`, `transactions`, `recurring_rules`, `goals`, `goal_allocations`, `budgets`, `scenarios`, `allocation_blocks`, `instruments`, `investment_ops`, `prices`, `duplicate_dismissals`, `audit_log`, `sequences`, `schema_migrations`.

El esquema completo con restricciones está en `src/main/db/migrations.ts`.

## Inversiones

- Cuenta de bróker (tipo Inversión) con su efectivo, más posiciones calculadas a partir de operaciones: compra, venta, dividendo, interés, comisión y split.
- Las operaciones generan sus apuntes de efectivo enlazados en la cuenta del bróker (compra, venta, comisión como gasto, dividendo como ingreso) si su fecha es posterior a la apertura de la cuenta.
- Precios introducidos a mano con fecha. Valor de mercado = unidades × último precio.
- Coste por precio medio ponderado o FIFO (configurable). Las comisiones se registran aparte del coste.
- Aportado de tu bolsillo (aportaciones previas + transferencias netas) siempre separado del valor actual.
- Bloques de reparto objetivo editables (por ejemplo, 80/10/10) con desviaciones y alertas de concentración.

## Fases

1. Base de datos, importación del Excel, cuentas, movimientos, cálculos y panel.
2. Objetivos, presupuestos, recurrentes, patrimonio y previsión.
3. Inversiones.
4. Exportación, copias y pulido.
