import { MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import { EXERCISE_CATEGORIES, MEASURE_TYPES, type Exercise, type ExerciseCategory, type MeasureType, type WorkoutKind } from '@shared/modules/entreno/types'
import { Button, Modal, Select, Tag, TextField } from '../../core/ui'
import { useApiMutation } from '../../lib/api'
import { CATEGORY_LABEL, fechaDe, MEASURE_LABEL, normalizar, SIN_CLASIFICAR } from './format'

const MEDIDA_POR_TIPO: Partial<Record<WorkoutKind, MeasureType>> = { SWIM: 'REPS', RUN: 'DISTANCE_DURATION', HYROX: 'DISTANCE_DURATION' }
const CATEGORIA_POR_TIPO: Partial<Record<WorkoutKind, ExerciseCategory>> = { GYM: 'STRENGTH', SWIM: 'SWIM', HYROX: 'HYROX', RUN: 'CARDIO' }
const MAX_RESULTADOS = 40

/**
 * Elige un ejercicio del catálogo (con buscador) o crea uno nuevo al vuelo con lo que se ha escrito.
 * `tipo` solo sirve para proponer la medida y la categoría del ejercicio nuevo.
 */
export function ElegirEjercicio({ catalogo, tipo, onElegir, onCerrar }: { catalogo: Exercise[]; tipo: WorkoutKind | null; onElegir: (e: Exercise) => void; onCerrar: () => void }) {
  const [texto, setTexto] = useState('')
  const [creando, setCreando] = useState(false)
  const [medida, setMedida] = useState<MeasureType>((tipo && MEDIDA_POR_TIPO[tipo]) || 'WEIGHT_REPS')
  const [categoria, setCategoria] = useState<ExerciseCategory | ''>((tipo && CATEGORIA_POR_TIPO[tipo]) || '')
  const entrada = useRef<HTMLInputElement>(null)
  const crear = useApiMutation('entreno:exercises.save', { success: 'Ejercicio creado', onSuccess: onElegir })

  const q = normalizar(texto.trim())
  const resultados = useMemo(() => {
    const activos = catalogo.filter((e) => e.active)
    const filtrados = q ? activos.filter((e) => normalizar(e.title).includes(q) || e.aliases.some((a) => normalizar(a.alias).includes(q))) : activos
    return filtrados.sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || a.title.localeCompare(b.title, 'es')).slice(0, MAX_RESULTADOS)
  }, [catalogo, q])
  const nombre = texto.trim()
  const existeIgual = catalogo.some((e) => normalizar(e.title) === q || e.aliases.some((a) => normalizar(a.alias) === q))

  const confirmarCreacion = () => crear.mutate([{ title: nombre, measure: medida, category: categoria || null }])

  return (
    <Modal
      titulo={creando ? 'Nuevo ejercicio' : 'Añadir ejercicio'}
      descripcion={creando ? 'Se añade al catálogo y a esta sesión.' : 'Busca en tu catálogo o crea uno nuevo.'}
      ancho="lg"
      inicial={entrada}
      onCerrar={onCerrar}
    >
      {creando ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (nombre) confirmarCreacion()
          }}
        >
          <TextField ref={entrada} label="Nombre" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={200} autoComplete="off" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Qué se mide" value={medida} onChange={(e) => setMedida(e.target.value as MeasureType)}>
              {MEASURE_TYPES.map((m) => (
                <option key={m} value={m}>
                  {MEASURE_LABEL[m]}
                </option>
              ))}
            </Select>
            <Select label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value as ExerciseCategory | '')}>
              <option value="">{SIN_CLASIFICAR}</option>
              {EXERCISE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <p className="t-meta">Los grupos musculares los puedes completar después, en Ejercicios.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreando(false)}>
              Volver
            </Button>
            <Button type="submit" variant="primary" disabled={!nombre} cargando={crear.isPending}>
              Crear y añadir
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <TextField
            ref={entrada}
            label="Buscar ejercicio"
            ocultarEtiqueta
            icono={<MagnifyingGlass size={16} />}
            placeholder="Escribe para buscar o crear"
            value={texto}
            autoComplete="off"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (resultados[0]) onElegir(resultados[0])
              else if (nombre) setCreando(true)
            }}
          />
          <ul className="-mx-2 flex max-h-96 flex-col overflow-y-auto" aria-label="Ejercicios del catálogo">
            {nombre && !existeIgual && (
              <li>
                <button type="button" onClick={() => setCreando(true)} className="flex w-full items-center gap-3 r-control px-3 py-3 text-left text-accent-text hover:bg-interactive">
                  <Plus size={16} weight="bold" aria-hidden />
                  <span className="t-body font-semibold">Crear «{nombre}»</span>
                </button>
              </li>
            )}
            {resultados.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onElegir(e)} className="flex w-full items-center gap-3 r-control px-3 py-3 text-left hover:bg-interactive">
                  <span className="t-body min-w-0 flex-1 truncate font-semibold">{e.title}</span>
                  <Tag>{e.category ? CATEGORY_LABEL[e.category] : SIN_CLASIFICAR}</Tag>
                  <span className="t-meta w-28 shrink-0 text-right tnum">{e.lastUsed ? fechaDe(e.lastUsed) : 'Sin usar'}</span>
                </button>
              </li>
            ))}
            {resultados.length === 0 && !nombre && <li className="t-label px-3 py-6 text-center">Tu catálogo está vacío. Escribe un nombre para crear el primer ejercicio.</li>}
            {resultados.length === 0 && nombre && existeIgual && <li className="t-label px-3 py-6 text-center">Ese ejercicio existe pero está desactivado. Actívalo en Ejercicios.</li>}
          </ul>
        </div>
      )}
    </Modal>
  )
}
