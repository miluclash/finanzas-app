// Ajustes › Entreno: grupos musculares, reglas de tipo de sesión, historial de importaciones y datos (exportar y restaurar).
import { ArrowDown, ArrowUp, DownloadSimple, FileArrowUp, Plus, Trash } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { KIND_RULE_FIELDS, WORKOUT_KINDS, type KindRule, type KindRuleField, type MuscleGroup, type WorkoutKind } from '@shared/modules/entreno/types'
import { Aviso, Button, ConfirmDialog, ErrorState, IconButton, LoadingState, Select, StatusBadge, Switch, TextField, Tooltip } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { fechaHoraLocal, KIND_LABEL } from './format'

const CAMPO_LABEL: Record<KindRuleField, string> = { title: 'Título de la sesión', exercise: 'Algún ejercicio' }
/** En la fila de una regla, más corto para que quepa en una línea */
const CAMPO_CORTO: Record<KindRuleField, string> = { title: 'Título', exercise: 'Ejercicio' }

function Sub({ titulo, texto, children }: { titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="border-t border-line pt-6 first:border-0 first:pt-0">
      <h3 className="t-card-title mb-1">{titulo}</h3>
      {texto && <p className="t-label mb-4 max-w-3xl">{texto}</p>}
      {children}
    </section>
  )
}

export function AjustesEntreno() {
  return (
    <div className="flex flex-col gap-8">
      <GruposMusculares />
      <ReglasDeTipo />
      <Importaciones />
      <DatosDeEntreno />
    </div>
  )
}

/* ======================= Grupos musculares ======================= */
function GruposMusculares() {
  const q = useApi('entreno:muscleGroups.list', [])
  const [nuevo, setNuevo] = useState('')
  const [borrar, setBorrar] = useState<MuscleGroup | null>(null)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)
  const guardar = useApiMutation('entreno:muscleGroups.save', {})
  const añadir = useApiMutation('entreno:muscleGroups.save', { success: 'Grupo añadido', onSuccess: () => setNuevo('') })
  const eliminar = useApiMutation('entreno:muscleGroups.delete', { success: 'Grupo borrado' })
  return (
    <Sub titulo="Grupos musculares" texto="Los músculos que usas para clasificar ejercicios. Puedes renombrarlos, desactivarlos o crear los tuyos.">
      {q.isLoading && <LoadingState filas={3} etiqueta="Cargando los grupos musculares" />}
      {q.error && <ErrorState titulo="No se han podido cargar los grupos" texto={q.error.message} />}
      {q.data && (
        <>
          <ul className="divide-line r-card border border-line" aria-label="Grupos musculares">
            {q.data.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <TextField
                  className="min-w-48 flex-1"
                  label={`Nombre del grupo ${g.name}`}
                  ocultarEtiqueta
                  tamano="sm"
                  defaultValue={g.name}
                  maxLength={100}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (!v) e.target.value = g.name
                    else if (v !== g.name) guardar.mutate([{ id: g.id, name: v, active: g.active }])
                  }}
                />
                <span className="t-meta w-28 shrink-0">
                  {g.exerciseCount} {g.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                </span>
                <span className="flex items-center gap-2">
                  <Switch checked={g.active} label={`Grupo ${g.name} activo`} onChange={(v) => guardar.mutate([{ id: g.id, name: g.name, active: v }])} />
                  <span className="t-meta w-16">{g.active ? 'Activo' : 'Desactivado'}</span>
                </span>
                <Tooltip texto="Borrar grupo">
                  <IconButton variant="ghost" size="sm" etiqueta={`Borrar el grupo ${g.name}`} icono={<Trash size={16} />} onClick={() => (setErrorBorrado(null), setBorrar(g))} />
                </Tooltip>
              </li>
            ))}
          </ul>
          {errorBorrado && (
            <Aviso tono="error" className="mt-3">
              {errorBorrado}
            </Aviso>
          )}
          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (nuevo.trim()) añadir.mutate([{ name: nuevo.trim(), active: true }])
            }}
          >
            <TextField className="w-72" label="Nuevo grupo muscular" tamano="sm" value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={100} autoComplete="off" />
            <Button size="sm" type="submit" icon={<Plus size={14} weight="bold" aria-hidden />} disabled={!nuevo.trim()} cargando={añadir.isPending}>
              Añadir
            </Button>
          </form>
        </>
      )}
      {borrar && (
        <ConfirmDialog
          titulo={`¿Borrar «${borrar.name}»?`}
          texto={borrar.exerciseCount > 0 ? `Lo usan ${borrar.exerciseCount} ejercicios, así que probablemente no se podrá borrar. Si quieres quitarlo de la lista, desactívalo.` : 'Se quita del catálogo. No se puede deshacer.'}
          confirmar="Borrar grupo"
          onCancelar={() => setBorrar(null)}
          onConfirmar={() => {
            const g = borrar
            setBorrar(null)
            eliminar.mutate([g.id], { onError: (e) => setErrorBorrado(e.message) })
          }}
        />
      )}
    </Sub>
  )
}

/* ======================= Reglas de tipo de sesión ======================= */
function ReglasDeTipo() {
  const q = useApi('entreno:kindRules.list', [])
  const guardar = useApiMutation('entreno:kindRules.save', {})
  const nueva = useApiMutation('entreno:kindRules.save', { success: 'Regla añadida', onSuccess: () => setTexto('') })
  const ordenar = useApiMutation('entreno:kindRules.reorder', {})
  const eliminar = useApiMutation('entreno:kindRules.delete', { success: 'Regla borrada' })
  const reaplicar = useApiMutation('entreno:kindRules.reapply', {})
  const [resultado, setResultado] = useState<{ checked: number; changed: number } | null>(null)
  const [campo, setCampo] = useState<KindRuleField>('title')
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<WorkoutKind>('SWIM')

  const cambiar = (r: KindRule, parcial: Partial<KindRule>) => guardar.mutate([{ ...r, ...parcial }])
  const mover = (i: number, d: -1 | 1) => {
    const ids = (q.data ?? []).map((r) => r.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    ordenar.mutate([ids])
  }
  return (
    <Sub titulo="Reglas de tipo de sesión" texto="Así se decide si una sesión es de gimnasio, natación, HYROX… Se mira la lista de arriba abajo y gana la primera regla activa que coincida. Una sesión con el tipo fijado a mano no cambia.">
      {q.isLoading && <LoadingState filas={3} etiqueta="Cargando las reglas" />}
      {q.error && <ErrorState titulo="No se han podido cargar las reglas" texto={q.error.message} />}
      {q.data && (
        <>
          {q.data.length === 0 && <p className="t-label mb-3">No hay reglas: todas las sesiones salen como «{KIND_LABEL.GYM}».</p>}
          {q.data.length > 0 && (
            <ol className="divide-line r-card border border-line" aria-label="Reglas, de mayor a menor prioridad">
              {q.data.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="tnum t-meta flex h-10 w-6 items-center">{i + 1}</span>
                  <Select className="w-36" label={`Dónde buscar, regla ${i + 1}`} ocultarEtiqueta tamano="sm" value={r.field} onChange={(e) => cambiar(r, { field: e.target.value as KindRuleField })}>
                    {KIND_RULE_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {CAMPO_CORTO[f]}
                      </option>
                    ))}
                  </Select>
                  <TextField
                    className="min-w-40 flex-1"
                    label={`Contiene, regla ${i + 1}`}
                    ocultarEtiqueta
                    tamano="sm"
                    defaultValue={r.contains}
                    maxLength={200}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (!v) e.target.value = r.contains
                      else if (v !== r.contains) cambiar(r, { contains: v })
                    }}
                  />
                  <span className="t-meta flex h-10 items-center">→</span>
                  <Select className="w-36" label={`Tipo, regla ${i + 1}`} ocultarEtiqueta tamano="sm" value={r.kind} onChange={(e) => cambiar(r, { kind: e.target.value as WorkoutKind })}>
                    {WORKOUT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <span className="flex h-10 items-center" title={r.active ? "Activa" : "Apagada"}>
                    <Switch checked={r.active} label={`Regla ${i + 1} activa`} onChange={(v) => cambiar(r, { active: v })} />
                  </span>
                  <span className="flex h-10 items-center gap-1">
                    <IconButton variant="ghost" size="sm" etiqueta={`Subir la regla ${i + 1} (más prioridad)`} icono={<ArrowUp size={16} />} disabled={i === 0 || ordenar.isPending} onClick={() => mover(i, -1)} />
                    <IconButton variant="ghost" size="sm" etiqueta={`Bajar la regla ${i + 1} (menos prioridad)`} icono={<ArrowDown size={16} />} disabled={i === q.data.length - 1 || ordenar.isPending} onClick={() => mover(i, 1)} />
                    <IconButton variant="ghost" size="sm" etiqueta={`Borrar la regla ${i + 1}`} icono={<Trash size={16} />} onClick={() => eliminar.mutate([r.id])} />
                  </span>
                </li>
              ))}
            </ol>
          )}
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            aria-label="Nueva regla"
            onSubmit={(e) => {
              e.preventDefault()
              if (texto.trim()) nueva.mutate([{ field: campo, contains: texto.trim(), kind: tipo, active: true }])
            }}
          >
            <Select className="w-48" label="Dónde buscar" tamano="sm" value={campo} onChange={(e) => setCampo(e.target.value as KindRuleField)}>
              {KIND_RULE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {CAMPO_LABEL[f]}
                </option>
              ))}
            </Select>
            <TextField className="min-w-40 flex-1" label="Contiene" tamano="sm" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="natación, hyrox…" maxLength={200} autoComplete="off" />
            <Select className="w-40" label="Entonces es" tamano="sm" value={tipo} onChange={(e) => setTipo(e.target.value as WorkoutKind)}>
              {WORKOUT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <Button size="sm" type="submit" icon={<Plus size={14} weight="bold" aria-hidden />} disabled={!texto.trim()} cargando={nueva.isPending}>
              Añadir regla
            </Button>
          </form>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="sm" cargando={reaplicar.isPending} onClick={() => reaplicar.mutate([], { onSuccess: setResultado })}>
              Volver a aplicar a las sesiones
            </Button>
            <span className="t-meta">Recalcula el tipo de las sesiones que no has fijado a mano.</span>
          </div>
          {resultado && (
            <p className="mt-3" role="status">
              <StatusBadge tono="success">
                {resultado.checked} {resultado.checked === 1 ? 'sesión revisada' : 'sesiones revisadas'}, {resultado.changed} {resultado.changed === 1 ? 'cambiada' : 'cambiadas'}.
              </StatusBadge>
            </p>
          )}
        </>
      )}
    </Sub>
  )
}

/* ======================= Historial de importaciones ======================= */
function Importaciones() {
  const q = useApi('entreno:imports.list', [])
  return (
    <Sub titulo="Historial de importaciones" texto="Los archivos de Hevy que has importado.">
      {q.isLoading && <LoadingState filas={2} etiqueta="Cargando el historial" />}
      {q.error && <ErrorState titulo="No se ha podido cargar el historial" texto={q.error.message} />}
      {q.data && q.data.length === 0 && <p className="t-meta">Aún no has importado nada.</p>}
      {q.data && q.data.length > 0 && (
        <div className="card card-flush max-h-80 overflow-auto">
          <table className="table" data-density="compact" aria-label="Importaciones">
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Archivo</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Nuevas
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Cambiadas
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Ya estaban
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Con error
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((i) => (
                <tr key={i.id}>
                  <td className="tnum whitespace-nowrap text-ink-2">{fechaHoraLocal(i.importedAt)}</td>
                  <td className="max-w-64">
                    <span className="block truncate" title={i.fileName}>
                      {i.fileName}
                    </span>
                  </td>
                  <td className="tnum text-right">{i.workoutsNew}</td>
                  <td className="tnum text-right">{i.workoutsChanged}</td>
                  <td className="tnum text-right text-ink-2">{i.workoutsDuplicate}</td>
                  <td className="tnum text-right text-ink-2">{i.rowsError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sub>
  )
}

/* ======================= Exportar y restaurar ======================= */
function DatosDeEntreno() {
  const exportado = (r: string | null) => (r ? 'Exportado' : null)
  const csv = useApiMutation('entreno:export.csv', { success: exportado })
  const xlsx = useApiMutation('entreno:export.xlsx', { success: exportado })
  const json = useApiMutation('entreno:export.json', { success: exportado })
  const restaurar = useApiMutation('entreno:restore.json', {
    success: (r) => (r ? `Datos de entreno restaurados.${r.safetyBackup ? ' Copia previa guardada.' : ''}` : null),
    invalidateOnError: true
  })
  const [confirmar, setConfirmar] = useState(false)
  return (
    <Sub titulo="Datos de entreno" texto="Exportar y restaurar son cosas distintas. Tus datos de finanzas no se tocan.">
      <div className="flex flex-col gap-6">
        <div>
          <h4 className="t-body mb-1 font-semibold">Exportar</h4>
          <p className="t-label mb-3">El CSV tiene el mismo formato que el de Hevy. El JSON incluye todo y sirve para restaurar.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<DownloadSimple size={16} aria-hidden />} cargando={csv.isPending} onClick={() => csv.mutate([])}>
              CSV (formato Hevy)
            </Button>
            <Button size="sm" icon={<DownloadSimple size={16} aria-hidden />} cargando={xlsx.isPending} onClick={() => xlsx.mutate([])}>
              Excel (.xlsx)
            </Button>
            <Button size="sm" icon={<DownloadSimple size={16} aria-hidden />} cargando={json.isPending} onClick={() => json.mutate([])}>
              JSON completo (restaurable)
            </Button>
          </div>
        </div>
        <div className="border-t border-line pt-6">
          <h4 className="t-body mb-1 font-semibold">Restaurar</h4>
          <p className="t-label mb-3">Vuelve a unos datos de entreno exportados antes en JSON. Antes se hace una copia de seguridad.</p>
          <Button size="sm" variant="danger" icon={<FileArrowUp size={16} aria-hidden />} cargando={restaurar.isPending} onClick={() => setConfirmar(true)}>
            Restaurar desde un JSON…
          </Button>
        </div>
      </div>
      {confirmar && (
        <ConfirmDialog
          titulo="¿Restaurar los datos de entreno?"
          texto="Se sustituyen todos tus datos de entreno (sesiones, ejercicios, reglas y ajustes) por los del archivo que elijas. Tus datos de finanzas no cambian. Antes se guarda una copia de seguridad de lo que tienes ahora."
          confirmar="Elegir archivo y restaurar"
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => {
            setConfirmar(false)
            restaurar.mutate([])
          }}
        />
      )}
    </Sub>
  )
}
