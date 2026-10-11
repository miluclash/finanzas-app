# Auditoría de FINANCIAL_MASTER (versión del 11/10/2026)

Revisión completa del Excel antes de construir la app: 10 hojas, fórmulas, validaciones y los 182 movimientos. Este documento no contiene movimientos ni datos personales detallados; solo conclusiones.

## Estado de los datos

- 182 movimientos (junio–octubre 2026), 7 cuentas, 8 recurrentes, 5 objetivos, 30 categorías.
- Las 12 transferencias cuadran a 0. De los 8 reembolsos, 7 están enlazados al gasto original con su misma categoría.
- Todas las cuentas cuadran con el saldo verificado del banco. El duplicado de Coursera está anulado correctamente (CANCELLED, no borrado).

## Problemas detectados (de más a menos grave)

1. **Trade Republic no existe en el Excel.** El patrimonio queda infravalorado en más de una quinta parte y "Inversiones" marca 0.
2. **La previsión está inflada.** Usa inversión mensual y aportaciones a objetivos = 0, así que ignora el plan de 200 €/mes y HYROX. Además empieza el mes siguiente y no cuenta lo que queda del mes actual.
3. **"Disponible" = liquidez.** No descuenta los cargos fijos que quedan en el mes ni las aportaciones previstas.
4. **Presupuestos.** Un único presupuesto se aplica a todos los meses (el % histórico sale mal si cambia) y la lista de categorías del control está escrita a mano.
5. **Histórico de patrimonio.** Se recalcula con la configuración actual de cada cuenta (desactivar una cuenta reescribe el pasado) y rellena los meses futuros con el saldo de hoy.
6. **Recurrentes que no avanzan.** La "próxima fecha" no se actualiza sola; una regla de cobro único sigue activa tras cobrarse. Los movimientos marcan Recurring = YES pero no se enlazan a su regla.
7. **Duplicados solo por coincidencia exacta** de fecha, cuenta, importe y descripción. Un cambio de fecha o de mayúscula los esconde.
8. **Límites físicos.** 30/30 filas de categorías ocupadas; 1.000 movimientos como máximo.
9. **Reservas con apaños.** Reservar dinero sin hucha exige una fila ADJUSTMENT de 0 €. "Comprar un ETF" mezcla el traspaso al bróker con la compra; no hay unidades, precios ni posiciones.
10. **Menores.** 39 subcategorías en texto libre con variantes duplicadas; fecha de verificación desfasada respecto al saldo verificado; un reembolso sin gasto original; transferencias con dos categorías distintas para lo mismo.

## Qué se conserva y cómo pasa a la app

| Excel | App |
|---|---|
| Saldo de cuenta (01) | Saldo inicial + movimientos válidos desde la apertura; historial de conciliaciones |
| Columna Checks (02) | Validaciones al guardar, bandeja de revisión, duplicados aproximados (misma cuenta e importe, ±N días) |
| Huchas y Goal_Amount (04) | Objetivos con cuenta vinculada o asignaciones propias; solo restan del disponible si el dinero está en una cuenta líquida |
| Control mensual (05) | Presupuesto por mes y categoría; reembolsos restan de su categoría |
| Patrimonio (06) | Valor a fin de cada mes pasado; sin meses futuros inventados |
| Previsión (07) | Cobros y cargos en su fecha real, escenarios editables |
| Reglas (09) | Validaciones en código |

## Decisiones tomadas

- **Criterio de caja:** un ingreso cuenta en el mes en que entra en la cuenta.
- **Importes en céntimos enteros**; cantidades y precios de inversión como decimales exactos.
- **Compras grandes pagadas desde una hucha** cuentan como gasto marcado como extraordinario; la tasa de ahorro se muestra con y sin extraordinarios.
- **Transferencias sin categoría.** Su efecto (ahorro, inversión) se deduce del tipo de cuenta destino.
- **Efectivo:** "Efectivo" (gastable) y una cuenta aparte para el efectivo reservado (patrimonio, no disponible).
- **Todo es editable desde la app:** cuentas, categorías, grupos, presupuestos, recurrentes, objetivos, escenarios, configuración e inversiones.
