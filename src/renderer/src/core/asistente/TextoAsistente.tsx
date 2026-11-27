// Renderizado ligero y seguro del texto del asistente: párrafos, listas, tablas sencillas, títulos, negrita,
// cursiva y código en línea. Todo se construye con elementos de React (nunca HTML en bruto) y los enlaces
// se muestran como texto: lo que escriba el modelo no puede abrir nada ni inyectar nada.
import { Fragment, type ReactNode } from 'react'

/** Texto en línea: **negrita**, *cursiva*, `código`. */
function enLinea(texto: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|`([^`]+)`|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])|(?<![_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index))
    if (m[1] !== undefined) out.push(<strong key={k++}>{enLinea(m[1])}</strong>)
    else if (m[2] !== undefined) out.push(<code key={k++} className="tnum r-tag bg-interactive px-1 py-px">{m[2]}</code>)
    else out.push(<em key={k++}>{enLinea(m[3] ?? m[4])}</em>)
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo))
  return out
}

type Bloque =
  | { tipo: 'p'; lineas: string[] }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'ul'; items: string[] }
  | { tipo: 'ol'; items: string[] }
  | { tipo: 'tabla'; filas: string[][] }

const ES_ITEM_UL = /^\s*[-*•]\s+(.*)$/
const ES_ITEM_OL = /^\s*\d+[.)]\s+(.*)$/
const ES_TITULO = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const ES_FILA_TABLA = /^\s*\|.*\|\s*$/
const ES_SEPARADOR = /^\s*\|?[\s:|-]+\|?\s*$/

function celdas(linea: string): string[] {
  return linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

function bloques(texto: string): Bloque[] {
  const out: Bloque[] = []
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lineas.length) {
    const l = lineas[i]
    if (!l.trim()) {
      i++
      continue
    }
    if (ES_TITULO.test(l)) {
      out.push({ tipo: 'titulo', texto: l.match(ES_TITULO)![1] })
      i++
    } else if (ES_FILA_TABLA.test(l)) {
      const filas: string[][] = []
      while (i < lineas.length && ES_FILA_TABLA.test(lineas[i])) {
        if (!(ES_SEPARADOR.test(lineas[i]) && /-/.test(lineas[i]))) filas.push(celdas(lineas[i]))
        i++
      }
      out.push({ tipo: 'tabla', filas })
    } else if (ES_ITEM_UL.test(l) || ES_ITEM_OL.test(l)) {
      const ordenada = ES_ITEM_OL.test(l)
      const re = ordenada ? ES_ITEM_OL : ES_ITEM_UL
      const items: string[] = []
      while (i < lineas.length && re.test(lineas[i])) {
        items.push(lineas[i].match(re)![1])
        i++
      }
      out.push(ordenada ? { tipo: 'ol', items } : { tipo: 'ul', items })
    } else {
      const ls: string[] = []
      while (i < lineas.length && lineas[i].trim() && !ES_TITULO.test(lineas[i]) && !ES_FILA_TABLA.test(lineas[i]) && !ES_ITEM_UL.test(lineas[i]) && !ES_ITEM_OL.test(lineas[i])) {
        ls.push(lineas[i])
        i++
      }
      out.push({ tipo: 'p', lineas: ls })
    }
  }
  return out
}

export function TextoAsistente({ texto }: { texto: string }) {
  return (
    <div className="t-body flex min-w-0 flex-col gap-2 break-words text-ink [overflow-wrap:anywhere]">
      {bloques(texto).map((b, i) => {
        if (b.tipo === 'titulo')
          return (
            <p key={i} className="t-strong mt-1">
              {enLinea(b.texto)}
            </p>
          )
        if (b.tipo === 'p')
          return (
            <p key={i}>
              {b.lineas.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {enLinea(l)}
                </Fragment>
              ))}
            </p>
          )
        if (b.tipo === 'ul' || b.tipo === 'ol') {
          const Lista = b.tipo
          return (
            <Lista key={i} className={b.tipo === 'ul' ? 'list-disc pl-5' : 'list-decimal pl-5'}>
              {b.items.map((it, j) => (
                <li key={j} className="pl-1">
                  {enLinea(it)}
                </li>
              ))}
            </Lista>
          )
        }
        const [cab, ...cuerpo] = b.filas
        return (
          <div key={i} className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de la respuesta">
            <table className="t-label w-full border-collapse">
              <thead>
                <tr>
                  {cab?.map((c, j) => (
                    <th key={j} scope="col" className="border-b border-line-strong px-2 py-1 text-left font-semibold text-ink">
                      {enLinea(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuerpo.map((f, j) => (
                  <tr key={j}>
                    {f.map((c, k) => (
                      <td key={k} className="border-b border-line px-2 py-1 align-top">
                        {enLinea(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
