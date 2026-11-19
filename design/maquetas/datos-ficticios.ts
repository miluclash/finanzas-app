// Datos 100 % inventados para las maquetas. Nada de esto sale de la base real.
// "Hoy" es fijo para que las capturas sean siempre iguales.
export const HOY = '2026-11-19' // jueves

/* ======================= Finanzas (importes en céntimos) ======================= */

export const disponible = {
  liquidezCents: 638452,
  pendientesCents: 41238, // recibos que aún caen este mes
  reservadoCents: 125000, // reservado para objetivos
  get disponibleCents() {
    return this.liquidezCents - this.pendientesCents - this.reservadoCents
  },
  // Disponible al cierre de cada día de los últimos 30 días (para la mini línea), en euros
  serie30: [3980, 3964, 3940, 3902, 4388, 4366, 4351, 4310, 4288, 4260, 4881, 4849, 4820, 4796, 4777, 4748, 4731, 4702, 4688, 4651, 4637, 4609, 4590, 4571, 4546, 4533, 4731, 4764, 4741, 4722]
}

export const posicion = {
  liquidezCents: 638452,
  ahorroCents: 964000,
  inversionesCents: 3192044,
  get patrimonioCents() {
    return this.liquidezCents + this.ahorroCents + this.inversionesCents
  },
  hace12mesesCents: 3642000
}

export const mes = {
  nombre: 'noviembre de 2026',
  diaActual: 19,
  diasDelMes: 30,
  ingresosCents: 284760,
  gastosCents: 162345,
  presupuestoCents: 220000,
  anterior: { nombre: 'octubre', ingresosCents: 291000, gastosCents: 218870 },
  get ahorroCents() {
    return this.ingresosCents - this.gastosCents
  },
  get tasaAhorro() {
    return this.ahorroCents / this.ingresosCents
  },
  // Gasto acumulado por día (euros): mes en curso hasta hoy y octubre completo
  acumuladoActual: [780, 784, 838, 850, 862, 940, 1013, 1099, 1198, 1215, 1236, 1301, 1387, 1441, 1488, 1522, 1561, 1604, 1623].map((v, i) => ({ dia: i + 1, v })),
  acumuladoAnterior: [780, 802, 831, 880, 912, 944, 951, 979, 1030, 1062, 1087, 1140, 1171, 1205, 1264, 1310, 1352, 1381, 1402, 1433, 1498, 1530, 1561, 1634, 1702, 1788, 1840, 1930, 2071, 2189].map((v, i) => ({ dia: i + 1, v }))
}

export type Aviso = { nivel: 'error' | 'warn' | 'info'; texto: string; enlace: string }
export const avisos: Aviso[] = [
  { nivel: 'warn', texto: '2 movimientos por revisar', enlace: '#/movimientos' },
  { nivel: 'warn', texto: 'La cuenta Ahorro lleva 41 días sin verificar', enlace: '#/finanzas' },
  { nivel: 'info', texto: 'Posible duplicado: Supermercado Norte, 23,48 € (14 y 15 nov.)', enlace: '#/movimientos' }
]

export const proximos30 = [
  { fecha: '2026-11-27', concepto: 'Nómina', cuenta: 'Cuenta corriente', cents: 264000 },
  { fecha: '2026-11-28', concepto: 'Seguro del hogar', cuenta: 'Cuenta corriente', cents: -31240 },
  { fecha: '2026-12-01', concepto: 'Alquiler', cuenta: 'Cuenta corriente', cents: -78000 },
  { fecha: '2026-12-03', concepto: 'Internet y móvil', cuenta: 'Tarjeta', cents: -4990 },
  { fecha: '2026-12-05', concepto: 'Suscripción de música', cuenta: 'Tarjeta', cents: -1099 },
  { fecha: '2026-12-10', concepto: 'Cuota del gimnasio', cuenta: 'Tarjeta', cents: -3490 }
]

export const gastosPorCategoria = [
  { nombre: 'Vivienda', cents: 78000 },
  { nombre: 'Alimentación', cents: 31286 },
  { nombre: 'Ocio y restaurantes', cents: 18725 },
  { nombre: 'Transporte', cents: 11840 },
  { nombre: 'Otros', cents: 9875 },
  { nombre: 'Salud', cents: 6430 },
  { nombre: 'Suscripciones', cents: 6189 }
]

export type SaludObjetivo = 'En camino' | 'En riesgo' | 'Casi listo'
export const objetivos: { nombre: string; actualCents: number; metaCents: number; salud: SaludObjetivo; fecha: string }[] = [
  { nombre: 'Fondo de emergencia', actualCents: 620000, metaCents: 900000, salud: 'En camino', fecha: 'sept. 2027' },
  { nombre: 'Viaje a Japón', actualCents: 185000, metaCents: 350000, salud: 'En riesgo', fecha: 'mar. 2027' },
  { nombre: 'Portátil nuevo', actualCents: 94000, metaCents: 120000, salud: 'Casi listo', fecha: 'dic. 2026' }
]

const meses12 = ['dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov']
const nw = [36420, 37110, 37980, 38240, 39660, 40320, 41890, 42740, 44100, 45380, 46690, 47945]
const liq = [4980, 5210, 5630, 5120, 5890, 6020, 6470, 5980, 6310, 6840, 6120, 6385]
export const evolucionPatrimonio = meses12.map((m, i) => ({ mes: m, patrimonio: nw[i], liquidez: liq[i] }))
const tasas = [31, 24, 38, 19, 41, 35, 28, 44, 33, 29, 25, 43]
export const tasaAhorroSerie = meses12.map((m, i) => ({ mes: m, tasa: tasas[i] }))

/* ======================= Movimientos ======================= */

export type Estado = 'CONFIRMED' | 'PENDING_REVIEW'
export type Movimiento = {
  id: string
  fecha: string
  concepto: string
  comercio?: string
  categoria: string
  subcategoria?: string
  cuenta: string
  cents: number
  estado: Estado
  etiqueta?: string // reembolso, recurrente, transferencia, duplicado
  nota?: string
}

export const movimientos: Movimiento[] = [
  { id: 'm1', fecha: '2026-11-19', concepto: 'Compra semanal', comercio: 'Supermercado Norte', categoria: 'Alimentación', subcategoria: 'Supermercado', cuenta: 'Cuenta corriente', cents: -4127, estado: 'CONFIRMED' },
  { id: 'm2', fecha: '2026-11-18', concepto: 'Café y tostada', comercio: 'Cafetería La Esquina', categoria: 'Ocio y restaurantes', subcategoria: 'Cafés', cuenta: 'Tarjeta', cents: -380, estado: 'PENDING_REVIEW' },
  { id: 'm3', fecha: '2026-11-18', concepto: 'Devolución de un pedido', comercio: 'Tienda online', categoria: 'Compras', cuenta: 'Cuenta corriente', cents: 2499, estado: 'CONFIRMED', etiqueta: 'reembolso', nota: 'Devolución de unas zapatillas que no encajaban.' },
  { id: 'm4', fecha: '2026-11-17', concepto: 'Medicación', comercio: 'Farmacia Central', categoria: 'Salud', cuenta: 'Tarjeta', cents: -1845, estado: 'CONFIRMED' },
  { id: 'm5', fecha: '2026-11-16', concepto: 'Traspaso mensual', categoria: 'Transferencia', cuenta: 'Corriente → Ahorro', cents: -30000, estado: 'CONFIRMED', etiqueta: 'transferencia' },
  { id: 'm6', fecha: '2026-11-15', concepto: 'Suscripción de música', comercio: 'Streaming Sonido', categoria: 'Suscripciones', cuenta: 'Tarjeta', cents: -1099, estado: 'CONFIRMED', etiqueta: 'recurrente' },
  { id: 'm7', fecha: '2026-11-15', concepto: 'Compra de reposición', comercio: 'Supermercado Norte', categoria: 'Alimentación', subcategoria: 'Supermercado', cuenta: 'Cuenta corriente', cents: -2348, estado: 'PENDING_REVIEW', etiqueta: 'posible duplicado' },
  { id: 'm8', fecha: '2026-11-14', concepto: 'Compra de reposición', comercio: 'Supermercado Norte', categoria: 'Alimentación', subcategoria: 'Supermercado', cuenta: 'Cuenta corriente', cents: -2348, estado: 'CONFIRMED' },
  { id: 'm9', fecha: '2026-11-13', concepto: 'Gasolina', comercio: 'Gasolinera Ruta 5', categoria: 'Transporte', subcategoria: 'Combustible', cuenta: 'Tarjeta', cents: -5210, estado: 'CONFIRMED' },
  { id: 'm10', fecha: '2026-11-12', concepto: 'Cena con amigos', comercio: 'Restaurante El Olivo', categoria: 'Ocio y restaurantes', subcategoria: 'Restaurantes', cuenta: 'Tarjeta', cents: -4650, estado: 'CONFIRMED', nota: 'Dividido entre cuatro.' },
  { id: 'm11', fecha: '2026-11-10', concepto: 'Zapatillas de natación', comercio: 'Tienda de deporte', categoria: 'Compras', subcategoria: 'Deporte', cuenta: 'Tarjeta', cents: -6790, estado: 'CONFIRMED' },
  { id: 'm12', fecha: '2026-11-09', concepto: 'Venta de segunda mano', categoria: 'Otros ingresos', cuenta: 'Cuenta corriente', cents: 20760, estado: 'CONFIRMED' },
  { id: 'm13', fecha: '2026-11-08', concepto: 'Corte de pelo', comercio: 'Peluquería Centro', categoria: 'Cuidado personal', cuenta: 'Efectivo', cents: -2200, estado: 'CONFIRMED' },
  { id: 'm14', fecha: '2026-11-03', concepto: 'Internet y móvil', comercio: 'Operador Uno', categoria: 'Suscripciones', cuenta: 'Tarjeta', cents: -4990, estado: 'CONFIRMED', etiqueta: 'recurrente' },
  { id: 'm15', fecha: '2026-11-02', concepto: 'Nómina de noviembre', categoria: 'Nómina', cuenta: 'Cuenta corriente', cents: 264000, estado: 'CONFIRMED' },
  { id: 'm16', fecha: '2026-11-01', concepto: 'Alquiler', categoria: 'Vivienda', cuenta: 'Cuenta corriente', cents: -78000, estado: 'CONFIRMED', etiqueta: 'recurrente' }
]

export const filtroMovimientos = {
  total: 41,
  ingresosCents: 284760,
  gastosCents: -162345,
  netoCents: 122415
}

/* ======================= Entreno ======================= */

export const entreno = {
  volumen: {
    ultimos7Kg: 15240,
    anteriores7Kg: 14390,
    semanas: [
      { s: 'S40', kg: 11850 },
      { s: 'S41', kg: 12420 },
      { s: 'S42', kg: 13060 },
      { s: 'S43', kg: 9740 }, // semana de descarga
      { s: 'S44', kg: 13380 },
      { s: 'S45', kg: 13960 },
      { s: 'S46', kg: 14390 },
      { s: 'S47', kg: 15240 }
    ]
  },
  // Semana prevista: 4 gimnasio + 2 natación
  semana: [
    { dia: 'L', tipo: 'gimnasio', estado: 'hecha', nombre: 'Empuje' },
    { dia: 'M', tipo: 'natacion', estado: 'hecha', nombre: 'Natación' },
    { dia: 'X', tipo: 'gimnasio', estado: 'hecha', nombre: 'Tirón' },
    { dia: 'J', tipo: 'gimnasio', estado: 'hoy', nombre: 'Pierna' },
    { dia: 'V', tipo: 'natacion', estado: 'prevista', nombre: 'Natación' },
    { dia: 'S', tipo: 'gimnasio', estado: 'prevista', nombre: 'Cuerpo completo' }
  ] as { dia: string; tipo: 'gimnasio' | 'natacion'; estado: 'hecha' | 'hoy' | 'prevista'; nombre: string }[],
  records: [
    { ejercicio: 'Press banca', marca: '82,5 kg × 5', mejora: '+2,5 kg', fecha: '18 nov', tipo: 'e1RM 96,3 kg' },
    { ejercicio: 'Sentadilla', marca: '110 kg × 4', mejora: '+5 kg', fecha: '14 nov', tipo: 'e1RM 124,7 kg' },
    { ejercicio: 'Dominadas lastradas', marca: '+20 kg × 6', mejora: '+1 rep', fecha: '11 nov', tipo: 'Más reps con lastre' }
  ],
  seriesPorGrupo: [
    { grupo: 'Espalda', series: 17 },
    { grupo: 'Pecho', series: 14 },
    { grupo: 'Piernas', series: 12 },
    { grupo: 'Hombros', series: 9 },
    { grupo: 'Bíceps', series: 8 },
    { grupo: 'Tríceps', series: 7 },
    { grupo: 'Core', series: 6 }
  ],
  objetivoMin: 10,
  objetivoMax: 20,
  // e1RM semanal de press banca (kg) y proyección al ritmo actual
  e1rm: {
    ejercicio: 'Press banca',
    metaKg: 100,
    fechaMeta: '31 ene. 2027',
    actualKg: 96.3,
    ritmoKgSemana: 0.78,
    proyeccionKg: 104.1,
    serie: [88.0, 88.9, 89.1, 90.6, 91.2, 92.0, 92.2, 93.5, 94.1, 94.8, 95.4, 96.3].map((kg, i) => ({ semana: i + 1, kg, proy: i === 11 ? kg : null as number | null })),
    proyeccion: [{ semana: 12, proy: 96.3 }, { semana: 16, proy: 99.3 }, { semana: 20, proy: 102.3 }, { semana: 22, proy: 104.1 }]
  },
  segundoObjetivo: {
    ejercicio: 'Sentadilla',
    metaKg: 140,
    fechaMeta: '31 ene. 2027',
    actualKg: 128.0,
    proyeccionKg: 134.2,
    necesitaKgSemana: 1.15,
    ritmoKgSemana: 0.6
  },
  hyrox: { nombre: 'HYROX Open Madrid', fecha: '20/03/2027', dias: 121, semanas: 17, bloque: 'Fuerza base', semanaBloque: '4 de 8' },
  sesiones: [
    { fecha: 'Mié 18 nov', nombre: 'Tirón', tipo: 'gimnasio', dur: '58 min', dato: '4.960 kg', extra: '17 series', pr: true },
    { fecha: 'Mar 17 nov', nombre: 'Natación', tipo: 'natacion', dur: '41 min', dato: '1.800 m', extra: '6 ejercicios', pr: false },
    { fecha: 'Lun 16 nov', nombre: 'Empuje', tipo: 'gimnasio', dur: '64 min', dato: '5.320 kg', extra: '18 series', pr: true },
    { fecha: 'Sáb 14 nov', nombre: 'Pierna y core', tipo: 'gimnasio', dur: '71 min', dato: '4.960 kg', extra: '20 series', pr: true },
    { fecha: 'Vie 13 nov', nombre: 'Natación', tipo: 'natacion', dur: '38 min', dato: '1.650 m', extra: '5 ejercicios', pr: false }
  ] as { fecha: string; nombre: string; tipo: 'gimnasio' | 'natacion'; dur: string; dato: string; extra: string; pr: boolean }[],
  // Cuántas sesiones por día en las últimas 12 semanas (mapa de constancia, 0 a 2)
  constancia: Array.from({ length: 84 }, (_, i): number | null => {
    const d = i % 7
    if (i >= 80) return null // jueves (hoy, aún sin hacer) y días futuros
    if (d === 6) return 0
    const p = (i * 37 + 11) % 10
    return p < 2 ? 0 : p < 6 ? 1 : p < 9 ? 2 : 3
  })
}

/* ======================= Ajustes ======================= */

export const copias = [
  { fecha: '19 nov 2026, 08:12', motivo: 'Automática al abrir', tamano: '1,8 MB' },
  { fecha: '12 nov 2026, 21:40', motivo: 'Antes de actualizar', tamano: '1,8 MB' },
  { fecha: '30 oct 2026, 09:03', motivo: 'Manual', tamano: '1,7 MB' }
]

export const categoriasAjustes = [
  { grupo: 'Vivienda', tipo: 'Gasto', categorias: ['Alquiler', 'Comunidad', 'Suministros', 'Hogar'] },
  { grupo: 'Alimentación', tipo: 'Gasto', categorias: ['Supermercado', 'Mercado', 'Comida a domicilio'] },
  { grupo: 'Ocio y restaurantes', tipo: 'Gasto', categorias: ['Restaurantes', 'Cafés', 'Cine y conciertos', 'Viajes'] },
  { grupo: 'Ingresos', tipo: 'Ingreso', categorias: ['Nómina', 'Otros ingresos', 'Intereses'] }
]
