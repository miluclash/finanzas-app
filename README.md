# Finanzas

App de escritorio para Windows que sustituye a `FINANCIAL_MASTER.xlsx`. Un solo usuario, datos en local, sin conexión con ningún banco: los movimientos se introducen a mano y todas las cifras se calculan a partir de ellos.

- **Auditoría del Excel:** [`docs/AUDITORIA.md`](docs/AUDITORIA.md)
- **Especificación y arquitectura:** [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md)

## Instalar (Windows)

1. En GitHub, abre **Releases** y descarga `Finanzas-Setup-x.y.z.exe` (también está en **Actions**, como artefacto de la última ejecución).
2. Ejecútalo. Como el instalador no está firmado, Windows puede mostrar "Windows protegió su PC": pulsa **Más información → Ejecutar de todas formas**.
3. Al abrir la app por primera vez, elige **Importar mi FINANCIAL_MASTER.xlsx** (verás una vista previa antes de importar nada) o **Empezar de cero**.

**Actualizaciones:** desde la 0.3.0 la app instalada busca versión nueva al abrirse (y cada 6 horas), la descarga en segundo plano, guarda una copia de seguridad y la instala al cerrar; en la barra lateral aparece *Reiniciar y actualizar*. Los datos no se tocan.

Para generar un instalador nuevo: sube la versión en `package.json` y haz push a `main` con `[release]` en el mensaje del commit, o lanza el workflow a mano desde la pestaña **Actions** (*Run workflow*). GitHub lo construye en una máquina Windows y lo publica en Releases.

## Dónde están tus datos

| Qué | Dónde |
|---|---|
| Base de datos | `%APPDATA%\Finanzas\finanzas.sqlite` |
| Copias automáticas | `%APPDATA%\Finanzas\backups\` (una al día al abrir la app; se guardan 30) |

- **Copias de seguridad:** en *Ajustes y datos → Importar, exportar y copias* puedes crear una copia, restaurar cualquiera (antes se guarda el estado actual) y abrir la carpeta. Copiar a mano el archivo `finanzas.sqlite` también sirve.
- **Exportación:** a Excel (una hoja por tabla + resumen mensual), CSV (separador `;` y coma decimal) o JSON completo y restaurable. Todas conservan los IDs y las relaciones.
- **Privacidad:** el repositorio solo contiene código; `.gitignore` excluye `*.sqlite` y `FINANCIAL_MASTER*.xlsx`.

## Desarrollo

Requisitos: Node.js 22 o superior y Git.

```bash
npm install
npm run dev        # abre la app en modo desarrollo (recarga en caliente)
npm test           # tests de cálculos e integración (Vitest)
npm run typecheck  # comprobación de tipos
npm run build      # compila a out/
npm run dist:win   # genera el instalador .exe en release/ (ejecútalo en Windows)
```

Para usar una carpeta de datos distinta (pruebas, datos de demostración separados de los reales): `set FINANZAS_DATA_DIR=C:\ruta\a\carpeta` antes de `npm run dev`.

### Estructura

```
src/shared/      Tipos, dinero, fechas y toda la lógica financiera (funciones puras)
src/main/        Proceso principal: SQLite, migraciones, servicios, importación/exportación, IPC
src/preload/     Puente seguro hacia la interfaz (contextIsolation, sin Node en la interfaz)
src/renderer/    Interfaz React
tests/           Tests (los *.local.test.ts solo se ejecutan con tu Excel real en local)
scripts/         Capturas y prueba de extremo a extremo con Electron
```

Esquema y migraciones: `src/main/db/migrations.ts`. Variables de entorno: no hay secretos; la única opcional es `FINANZAS_DATA_DIR`.

## Atajos

| Tecla | Acción |
|---|---|
| `N` | Nuevo movimiento |
| `T` | Nueva transferencia entre cuentas |
| `Esc` | Cerrar el formulario |

## Estado

**Terminado**

- Movimientos: alta rápida con autocompletado del historial, edición, anulación y borrado, transferencias de dos apuntes que siempre cuadran, reembolsos enlazados que restan de su categoría, estados (confirmado / pendiente / anulado), subcategorías creadas al vuelo, detección de duplicados aproximados y bandeja de revisión.
- Cuentas: saldo calculado desde la apertura, conciliación con el saldo del banco y su historial, flags de patrimonio y liquidez, cuentas inactivas.
- Panel: disponible para gastar (liquidez − cargos pendientes − reservas), liquidez, patrimonio, inversiones, cifras del mes con enlace a sus movimientos, gráficos, avisos y próximos cargos.
- Presupuestos por mes y categoría (copiar del mes anterior, ritmo de gasto, comparación con meses anteriores) y control mensual con gastos fijos, variables y extraordinarios.
- Recurrentes con próxima fecha calculada, emparejamiento con los movimientos reales y avisos de cargos sin registrar.
- Objetivos con hucha vinculada o con reservas, ritmo, aportación necesaria y retraso.
- Patrimonio mes a mes y previsión a 12 meses con escenarios editables y supuestos visibles.
- Inversiones: activos, operaciones (compra, venta, dividendo, interés, comisión, split), precios manuales con fecha, coste medio o FIFO, plusvalías realizadas y no realizadas, aportado frente a valor, reparto objetivo por bloques y alertas de concentración.
- Importación del CSV de Trade Republic (*Inversiones → Importar de Trade Republic*): crea activos, compras, dividendos, intereses, recargas y sus comisiones; reimportar un export más nuevo solo añade lo que falta.
- Configuración editable (categorías, grupos, subcategorías con fusión, ajustes, escenarios), registro de auditoría, importación del Excel con vista previa, exportación y copias.

**Pendiente o fuera de alcance**

- Cotizaciones automáticas: los precios se introducen a mano (una fuente de precios sería opcional y nunca obligatoria).
- Versión móvil: es una app de escritorio para Windows.
- Firma de código del instalador (requiere un certificado de pago).
- Un entorno de datos de demostración con su propia pantalla: hoy se consigue con `FINANZAS_DATA_DIR`.
