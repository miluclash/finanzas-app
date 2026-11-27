// Propuestas de cambio del asistente. El asistente nunca escribe: propone, y aquí Michael confirma o descarta.
// - `single`: una tarjeta con el antes → después de un cambio, que se confirma sola.
// - `group`: varios cambios relacionados (mismo criterio): una tarjeta resumen y una ventana con todos.
// Estados finales siempre con icono y texto: aplicada, descartada, caducada, parcial y fallida.
import { ArrowRight, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import type { ChartSpec } from '@shared/core/metrics-types'
import type { AiChange, AiChangeOp, AiProposal } from '@shared/core/ai-types'
import { useId, useState } from 'react'
import { Aviso, Button, Modal, StatusBadge, Tag, cx } from '../ui'
import { GraficoVista } from '../graficos'
import { useAiAccept, useAiReject } from './aiApi'

const OP: Record<AiChangeOp, { texto: string; plural: string; Icono: typeof Plus }> = {
  create: { texto: 'Crear', plural: 'altas', Icono: Plus },
  update: { texto: 'Editar', plural: 'ediciones', Icono: PencilSimple },
  delete: { texto: 'Borrar', plural: 'borrados', Icono: Trash }
}

function EtiquetaOp({ op }: { op: AiChangeOp }) {
  const { texto, Icono } = OP[op]
  return (
    <Tag icono={<Icono size={14} weight={op === 'delete' ? 'fill' : 'bold'} aria-hidden />} tono={op === 'delete' ? 'warning' : op === 'create' ? 'accent' : 'info'}>
      {texto}
    </Tag>
  )
}

const VACIO = '—'
const texto = (v: string | null) => (v === null || v === '' ? VACIO : v)

/** Estado final de una propuesta, con icono y texto. */
function EstadoFinal({ p }: { p: AiProposal }) {
  const aplicados = p.changes.filter((c) => c.status === 'applied').length
  const fallo = p.changes.find((c) => c.status === 'failed' && c.error)
  switch (p.status) {
    case 'applied':
      return <StatusBadge tono="success">{p.mode === 'group' ? `Aplicados los ${p.changes.length} cambios` : 'Aplicado'}</StatusBadge>
    case 'rejected':
      return <StatusBadge tono="neutral">Descartado</StatusBadge>
    case 'stale':
      return (
        <Aviso tono="warning">
          <span className="t-strong">Caducada</span>
          <span>Los datos han cambiado desde que se propuso. Pídelo otra vez.</span>
        </Aviso>
      )
    case 'partial':
      return (
        <Aviso tono="warning">
          <span className="t-strong">
            Aplicado en parte: {aplicados} de {p.changes.length}
          </span>
          {fallo && (
            <span>
              Se paró en «{fallo.label}»: {fallo.error}
            </span>
          )}
          <span>Los cambios que ya se aplicaron se quedan como están.</span>
        </Aviso>
      )
    case 'failed':
      return (
        <Aviso tono="error">
          <span className="t-strong">No se ha aplicado</span>
          <span>{fallo?.error ?? p.changes[0]?.error ?? 'Ha ocurrido un error. No se ha cambiado nada.'}</span>
        </Aviso>
      )
    default:
      return null
  }
}

const ESTADO_CAMBIO: Record<AiChange['status'], { texto: string; tono: 'success' | 'error' | 'neutral' }> = {
  pending: { texto: 'Pendiente', tono: 'neutral' },
  applied: { texto: 'Aplicado', tono: 'success' },
  failed: { texto: 'Falló', tono: 'error' },
  skipped: { texto: 'Sin aplicar', tono: 'neutral' }
}

/** Antes → después de uno o varios cambios. Con `conEtiqueta` añade una columna con el registro afectado. */
function TablaCambios({ cambios, conEtiqueta, conEstado, titulo, alto }: { cambios: AiChange[]; conEtiqueta: boolean; conEstado: boolean; titulo: string; alto?: boolean }) {
  // Solo crear o solo borrar: una columna de valor basta
  const soloAlta = cambios.every((c) => c.op === 'create')
  const soloBaja = cambios.every((c) => c.op === 'delete')
  // Si todos son del mismo tipo, la etiqueta («Editar») en cada fila sobra
  const mismoTipo = cambios.every((c) => c.op === cambios[0].op)
  return (
    <div className={cx('max-w-full overflow-x-auto r-control border border-line', alto && 'max-h-[50vh] overflow-y-auto')} tabIndex={0} role="region" aria-label={titulo}>
      <table className="t-label w-full border-collapse">
        <thead className="sticky top-0 bg-raised text-left">
          <tr>
            {conEtiqueta && (
              <th scope="col" className="px-3 py-2 font-semibold text-ink">
                Registro
              </th>
            )}
            <th scope="col" className="px-3 py-2 font-semibold text-ink">
              Campo
            </th>
            {!soloAlta && (
              <th scope="col" className="px-3 py-2 font-semibold text-ink">
                {soloBaja ? 'Valor' : 'Antes'}
              </th>
            )}
            {!soloBaja && (
              <th scope="col" className="px-3 py-2 font-semibold text-ink">
                {soloAlta ? 'Valor' : 'Después'}
              </th>
            )}
            {conEstado && (
              <th scope="col" className="px-3 py-2 font-semibold text-ink">
                Estado
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {cambios.map((c) => {
            const filas = c.fields.length ? c.fields : [{ label: c.label, before: null, after: null }]
            return filas.map((f, i) => (
              <tr key={`${c.id}-${i}`} className={cx('align-top', i === 0 && 'border-t border-line')}>
                {conEtiqueta && (
                  <td className="px-3 py-2 text-ink">
                    {i === 0 && (
                      <span className="flex flex-col items-start gap-1">
                        {!mismoTipo && <EtiquetaOp op={c.op} />}
                        <span className="[overflow-wrap:anywhere]">{c.label}</span>
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2 text-ink-2">{f.label}</td>
                {!soloAlta && <td className={cx('tnum px-3 py-2 [overflow-wrap:anywhere]', c.op === 'delete' ? 'text-ink' : 'text-ink-2')}>{c.op === 'create' ? VACIO : texto(f.before)}</td>}
                {!soloBaja && (
                  <td className="tnum px-3 py-2 text-ink [overflow-wrap:anywhere]">
                    {c.op === 'delete' ? (
                      <span className="text-ink-3">Se borra</span>
                    ) : (
                      <span className="inline-flex items-start gap-1">
                        {!soloAlta && <ArrowRight size={14} className="mt-0.5 shrink-0 text-ink-3" aria-label="pasa a" role="img" />}
                        <span className="font-semibold">{texto(f.after)}</span>
                      </span>
                    )}
                  </td>
                )}
                {conEstado && (
                  <td className="px-3 py-2">
                    {i === 0 && (
                      <span className="flex flex-col gap-1">
                        <StatusBadge tono={ESTADO_CAMBIO[c.status].tono}>{ESTADO_CAMBIO[c.status].texto}</StatusBadge>
                        {c.error && <span className="text-error [overflow-wrap:anywhere]">{c.error}</span>}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Cuerpo de un cambio suelto: tabla de campos o vista previa de un gráfico. */
function CuerpoCambio({ c, conEstado }: { c: AiChange; conEstado: boolean }) {
  if (c.preview?.kind === 'chart') {
    return (
      <div className="r-control border border-line p-3">
        <GraficoVista spec={c.preview.spec as ChartSpec} titulo={c.preview.title} alto="200px" />
      </div>
    )
  }
  return <TablaCambios cambios={[c]} conEtiqueta={false} conEstado={conEstado} titulo={`Cambios de «${c.label}»`} />
}

/** Propuesta dentro del mensaje del asistente. */
export function PropuestaCard({ propuesta }: { propuesta: AiProposal }) {
  const aceptar = useAiAccept()
  const descartar = useAiReject()
  // La respuesta del servidor se ve al momento; el hilo la trae después
  const [resuelta, setResuelta] = useState<AiProposal | null>(null)
  const [ventana, setVentana] = useState(false)
  const tid = useId()
  const p = resuelta ?? propuesta
  const pendiente = p.status === 'pending'
  const ocupado = aceptar.isPending || descartar.isPending
  const esGrupo = p.mode === 'group'
  const primero = p.changes[0]
  const borra = p.changes.length > 0 && p.changes.every((c) => c.op === 'delete')

  const confirmar = () => aceptar.mutate({ proposalId: p.id }, { onSuccess: (r) => (setResuelta(r), setVentana(false)) })
  const rechazar = () => descartar.mutate(p.id, { onSuccess: (r) => (setResuelta(r), setVentana(false)) })

  const resumenOps = (['create', 'update', 'delete'] as const)
    .map((op) => ({ op, n: p.changes.filter((c) => c.op === op).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${OP[x.op].plural}`)
    .join(', ')

  return (
    <section aria-labelledby={tid} className="r-card border border-line-strong bg-card">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={tid} className="t-card-title t-plain [overflow-wrap:anywhere]">
              {esGrupo ? p.title : (primero?.label ?? p.title)}
            </h3>
            {esGrupo ? (
              <p className="t-label mt-1">
                {p.changes.length} cambios{p.criterion ? ` · criterio: ${p.criterion}` : ''}
                {resumenOps && p.changes.some((c) => c.op !== 'update') ? ` · ${resumenOps}` : ''}
              </p>
            ) : (
              p.title !== primero?.label && <p className="t-label mt-1">{p.title}</p>
            )}
          </div>
          {!esGrupo && primero && <EtiquetaOp op={primero.op} />}
        </div>

        {!esGrupo && primero && <CuerpoCambio c={primero} conEstado={false} />}

        {pendiente ? (
          <div className="flex flex-wrap items-center gap-2">
            {esGrupo ? (
              <Button variant="accent" size="sm" onClick={() => setVentana(true)} disabled={ocupado} aria-haspopup="dialog">
                Revisar y confirmar
              </Button>
            ) : (
              <Button variant={borra ? 'danger-solid' : 'accent'} size="sm" onClick={confirmar} disabled={ocupado} cargando={aceptar.isPending}>
                {borra ? 'Confirmar borrado' : 'Confirmar'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={rechazar} disabled={ocupado} cargando={descartar.isPending}>
              Descartar
            </Button>
            <span className="t-meta">{esGrupo ? 'No se cambia nada hasta que lo confirmes.' : 'Hasta que confirmes, no se cambia nada.'}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <EstadoFinal p={p} />
            {esGrupo && (
              <div>
                <Button variant="ghost" size="sm" onClick={() => setVentana(true)} aria-haspopup="dialog">
                  Ver los cambios
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {ventana && esGrupo && (
        <Modal
          titulo={p.title}
          descripcion={`${p.changes.length} cambios${p.criterion ? ` · criterio: ${p.criterion}` : ''}`}
          ancho="xl"
          onCerrar={() => setVentana(false)}
          pie={
            pendiente ? (
              <>
                <Button variant="ghost" onClick={rechazar} disabled={ocupado} cargando={descartar.isPending}>
                  Descartar
                </Button>
                <Button variant={borra ? 'danger-solid' : 'accent'} onClick={confirmar} disabled={ocupado} cargando={aceptar.isPending}>
                  Confirmar todo
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setVentana(false)}>
                Cerrar
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-4">
            {pendiente ? (
              <Aviso tono="info">
                <span>Se aplican todos en orden al confirmar. Si uno falla, se para y te digo cuáles se han aplicado.</span>
              </Aviso>
            ) : (
              <EstadoFinal p={p} />
            )}
            <TablaCambios cambios={p.changes} conEtiqueta conEstado={!pendiente && p.status !== 'rejected'} titulo="Cambios propuestos" alto />
          </div>
        </Modal>
      )}
    </section>
  )
}

