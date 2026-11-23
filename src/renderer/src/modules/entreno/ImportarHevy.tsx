import { FileArrowUp, UploadSimple } from '@phosphor-icons/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { HevyImportPreview, HevyWorkoutBrief } from '@shared/modules/entreno/types'
import { Aviso, Button, Modal, StatusBadge, Tag } from '../../core/ui'
import { api, useApiMutation } from '../../lib/api'
import { fechaDe, horaDe } from './format'
import { KindTag, resumenContenido } from './Piezas'

/* ======================= Acceso desde cualquier pantalla (Resumen, Sesiones, Ctrl+K) ======================= */
type Ctx = { abrir: () => void }
const ImportarCtx = createContext<Ctx>({ abrir: () => undefined })
export const useImportarHevy = () => useContext(ImportarCtx)

export function ImportarHevyProvider({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const abrir = useCallback(() => setAbierto(true), [])
  const valor = useMemo(() => ({ abrir }), [abrir])
  return (
    <ImportarCtx.Provider value={valor}>
      {children}
      {/* El modal lleva la identidad de Entreno (lima) aunque se abra desde Ctrl+K en otra pantalla */}
      {abierto && (
        <div data-module="entreno" className="contents">
          <ImportarHevyModal onCerrar={() => setAbierto(false)} />
        </div>
      )}
    </ImportarCtx.Provider>
  )
}

/* ======================= Modal: ayuda → elegir archivo → vista previa → importar ======================= */
function ImportarHevyModal({ onCerrar }: { onCerrar: () => void }) {
  const [preview, setPreview] = useState<HevyImportPreview | null>(null)
  const [eligiendo, setEligiendo] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  // El foco empieza en la acción principal y la sigue cuando pasa de «Elegir archivo» a «Importar»
  const principal = useRef<HTMLButtonElement>(null)
  useEffect(() => principal.current?.focus(), [preview])

  const aplicar = useApiMutation('entreno:import.apply', {
    success: (r) => {
      const partes: string[] = []
      if (r.workoutsNew > 0) partes.push(`${r.workoutsNew} ${r.workoutsNew === 1 ? 'sesión nueva' : 'sesiones nuevas'}`)
      if (r.workoutsChanged > 0) partes.push(`${r.workoutsChanged} ${r.workoutsChanged === 1 ? 'actualizada' : 'actualizadas'}`)
      if (r.exercisesNew > 0) partes.push(`${r.exercisesNew} ${r.exercisesNew === 1 ? 'ejercicio nuevo' : 'ejercicios nuevos'}`)
      return `Importado: ${partes.join(', ')}.${r.backup ? ' Copia previa guardada.' : ''}`
    },
    onSuccess: onCerrar
  })

  const elegir = async () => {
    setEligiendo(true)
    setFallo(null)
    try {
      const p = await api('entreno:import.preview')
      if (p) setPreview(p)
    } catch (e) {
      setFallo(e instanceof Error ? e.message : String(e))
    } finally {
      setEligiendo(false)
    }
  }
  /** Cerrar sin importar: se suelta la vista previa que guarda el proceso principal. */
  const cancelar = () => {
    if (aplicar.isPending) return
    if (preview) void api('entreno:import.cancel', preview.token).catch(() => undefined)
    onCerrar()
  }

  const porImportar = preview ? preview.newWorkouts.length + preview.changedWorkouts.length : 0
  return (
    <Modal
      titulo={preview ? `Vista previa · ${preview.fileName}` : 'Importar de Hevy'}
      descripcion={preview ? 'Todavía no se ha guardado nada. Revisa y confirma.' : 'Sube el archivo que exporta Hevy. Verás una vista previa antes de guardar nada.'}
      ancho="xl"
      inicial={principal}
      onCerrar={cancelar}
      pie={
        <>
          <Button variant="ghost" onClick={cancelar} disabled={aplicar.isPending}>
            Cancelar
          </Button>
          {preview ? (
            <Button ref={principal} variant="primary" disabled={porImportar === 0} cargando={aplicar.isPending} onClick={() => aplicar.mutate([preview.token])}>
              {porImportar === 0 ? 'Nada que importar' : `Importar ${porImportar} ${porImportar === 1 ? 'sesión' : 'sesiones'}`}
            </Button>
          ) : (
            <Button ref={principal} variant="primary" icon={<FileArrowUp size={16} aria-hidden />} cargando={eligiendo} onClick={elegir}>
              Elegir archivo…
            </Button>
          )}
        </>
      }
    >
      {preview ? <VistaPrevia p={preview} /> : <Ayuda fallo={fallo} />}
    </Modal>
  )
}

function Ayuda({ fallo }: { fallo: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      {fallo && <Aviso tono="error">{fallo}</Aviso>}
      <section aria-label="Cómo exportar en Hevy" className="r-card border border-line bg-raised p-4">
        <h3 className="t-card-title t-plain mb-2 flex items-center gap-2">
          <UploadSimple size={16} aria-hidden className="text-accent-text" /> Cómo exportar en Hevy
        </h3>
        <ol className="t-label list-decimal pl-6">
          <li>Abre Hevy y entra en tu perfil.</li>
          <li>
            Ve a <strong className="text-ink">Ajustes → Export &amp; Import Data</strong>.
          </li>
          <li>
            Pulsa <strong className="text-ink">Export Workouts</strong>: Hevy te da un archivo .csv.
          </li>
          <li>Pásalo a este equipo y elígelo aquí con «Elegir archivo».</li>
        </ol>
      </section>
      <p className="t-meta">Puedes importar cuando quieras, también un archivo más completo que el anterior: lo que ya tienes no se duplica. Acepta .csv, .tsv y .xlsx.</p>
    </div>
  )
}

function ListaSesiones({ lista, etiqueta }: { lista: HevyWorkoutBrief[]; etiqueta: string }) {
  return (
    <ul className="divide-line max-h-56 overflow-y-auto r-card border border-line" aria-label={etiqueta} tabIndex={0}>
      {lista.map((s) => (
        <li key={s.hevyKey} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <span className="tnum t-label w-28 shrink-0">
            {fechaDe(s.startTime)} <span className="t-meta">{horaDe(s.startTime)}</span>
          </span>
          <span className="t-body min-w-0 flex-1 truncate font-semibold" title={s.title}>
            {s.title}
          </span>
          <KindTag kind={s.kind} />
          <span className="t-meta shrink-0">{resumenContenido(s)}</span>
        </li>
      ))}
    </ul>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="t-card-title t-plain mb-2">{titulo}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function VistaPrevia({ p }: { p: HevyImportPreview }) {
  const stats: { etiqueta: string; valor: number; aviso?: boolean }[] = [
    { etiqueta: 'Sesiones nuevas', valor: p.newWorkouts.length },
    { etiqueta: 'Sesiones cambiadas', valor: p.changedWorkouts.length },
    { etiqueta: 'Ya estaban', valor: p.duplicateCount },
    { etiqueta: 'Filas con error', valor: p.errors.length, aviso: p.errors.length > 0 },
    { etiqueta: 'Ejercicios nuevos', valor: p.newExercises.length }
  ]
  const nada = p.newWorkouts.length === 0 && p.changedWorkouts.length === 0
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-8 sm:grid-cols-5" aria-label="Resumen de la importación">
        {stats.map((s) => (
          <div key={s.etiqueta} className="flex flex-col gap-1 border-b border-line py-2">
            <dt className="t-meta">{s.etiqueta}</dt>
            <dd className="tnum t-section">{s.valor}</dd>
          </div>
        ))}
      </dl>
      <p className="t-meta">
        {p.rowsValid} de {p.rowsTotal} filas leídas correctamente · formato {p.format}.
      </p>

      {nada && p.errors.length === 0 && <Aviso tono="info">No hay nada nuevo: todas las sesiones de este archivo ya estaban en la app.</Aviso>}
      {p.alreadyImported && !nada && <Aviso tono="warning">Este mismo archivo ya se importó antes.</Aviso>}
      {p.warnings
        .filter((w) => !(p.alreadyImported && w.includes('ya se importó')))
        .map((w, i) => (
          <Aviso key={i} tono="warning">
            {w}
          </Aviso>
        ))}

      {p.newWorkouts.length > 0 && (
        <Bloque titulo={`Sesiones nuevas (${p.newWorkouts.length})`}>
          <ListaSesiones lista={p.newWorkouts} etiqueta="Sesiones nuevas" />
        </Bloque>
      )}
      {p.changedWorkouts.length > 0 && (
        <Bloque titulo={`Sesiones cambiadas (${p.changedWorkouts.length})`}>
          <Aviso tono="info">Estas sesiones ya estaban, pero en el archivo son distintas. Se sustituyen sus series por las del archivo; se conservan tus notas, el tipo y el esfuerzo percibido.</Aviso>
          <ListaSesiones lista={p.changedWorkouts} etiqueta="Sesiones cambiadas" />
        </Bloque>
      )}
      {p.duplicateCount > 0 && (
        <p className="t-label">
          <StatusBadge tono="neutral">
            {p.duplicateCount} {p.duplicateCount === 1 ? 'sesión ya estaba' : 'sesiones ya estaban'} igual: no se tocan.
          </StatusBadge>
        </p>
      )}
      {p.newExercises.length > 0 && (
        <Bloque titulo={`Ejercicios nuevos (${p.newExercises.length})`}>
          <p className="t-label">Se añaden al catálogo sin clasificar. Luego, en Ejercicios, ponles categoría y músculos.</p>
          <ul className="flex max-h-32 flex-wrap gap-2 overflow-y-auto" aria-label="Ejercicios nuevos" tabIndex={0}>
            {p.newExercises.map((t) => (
              <li key={t}>
                <Tag>{t}</Tag>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
      {p.errors.length > 0 && (
        <Bloque titulo={`Filas con error (${p.errors.length})`}>
          <Aviso tono="error">
            {p.sessionsWithErrors === 0
              ? 'Estas filas no se importan.'
              : `${p.sessionsWithErrors === 1 ? 'La sesión afectada no se importa' : `Las ${p.sessionsWithErrors} sesiones afectadas no se importan`}. El resto sí. Corrige el archivo en Hevy y vuelve a importarlo.`}
          </Aviso>
          <div className="max-h-56 overflow-auto r-card border border-line" tabIndex={0} role="region" aria-label="Filas con error">
            <table className="table" data-density="compact" aria-label="Errores del archivo">
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Línea
                  </th>
                  <th scope="col">Columna</th>
                  <th scope="col">Qué pasa</th>
                </tr>
              </thead>
              <tbody>
                {p.errors.map((e, i) => (
                  <tr key={i}>
                    <td className="tnum text-right">{e.line}</td>
                    <td className="text-ink-2">{e.column ?? '—'}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloque>
      )}
    </div>
  )
}
