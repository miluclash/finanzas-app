// Constructor de gráficos y paneles editables del núcleo. Las páginas y la raíz importan de aquí.
export { PanelEditable, type PanelEditableProps } from './PanelEditable'
export { TarjetasProvider, tarjetasDePanel, useTarjetas, type FixedCardDef, type FixedCardProps } from './tarjetas'
export { GraficoVista, GraficoDatos, GraficoNoValido, type GraficoVistaProps } from './GraficoVista'
export { ConstructorGrafico, type ConstructorGraficoProps } from './ConstructorGrafico'
export { CLASE_TAMANO, NOMBRE_TAMANO } from './rejilla'
export { formatoValor, formatoEje, textoRango, textoUnidad } from './formato'
