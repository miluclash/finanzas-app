import { PanelEditable } from '../graficos'
import { INICIO_POR_DEFECTO } from './porDefecto'

const LARGA = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function saludo(h: number) {
  return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
}

/** Inicio, el panel de vida: lo de hoy arriba, un resumen de cada módulo y lo complementario al final.
 *  Es un panel editable. Las tarjetas las registra cada módulo (`modules/<módulo>/tarjetas.tsx`) y el diseño
 *  por defecto (`porDefecto.ts`) solo las referencia por id: el núcleo no importa nada de los módulos.
 *  Va con los tokens del núcleo: no se tiñe de ningún módulo. */
export function Inicio() {
  const ahora = new Date()
  const fecha = LARGA.format(ahora)
  return <PanelEditable dashboardId="inicio" porDefecto={INICIO_POR_DEFECTO} titulo={saludo(ahora.getHours())} texto={fecha.charAt(0).toUpperCase() + fecha.slice(1)} />
}
