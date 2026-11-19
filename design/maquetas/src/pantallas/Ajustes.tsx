import { Check, Copy, DownloadSimple, FloppyDisk, FolderOpen, Monitor, Moon, PencilSimple, Plus, ShieldCheck, Sun, UploadSimple } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import { categoriasAjustes, copias } from '../../datos-ficticios'
import { cx } from '../lib'
import type { PrefTema } from '../tema'
import { Button, DatePicker, IconButton, Switch, TextField } from '../ui/controls'
import { ConfirmDialog, StatusBadge, Tag, Tooltip, useToast } from '../ui/feedback'
import { PageHeader } from '../ui/layout'

const params = new URLSearchParams(location.search)
const demo = params.get('demo')

/** Miniatura de la app en un tema concreto: el atributo data-theme anidado cambia todos los tokens */
function Mini({ tema }: { tema: 'dark' | 'light' }) {
  return (
    <div data-theme={tema} className="absolute inset-0 flex bg-canvas" aria-hidden>
      <div className="flex w-1/4 flex-col gap-1 border-r border-line bg-sidebar p-2">
        <span className="h-1 w-3/4 r-full bg-ink" />
        <span className="h-1 w-full r-full bg-interactive" />
        <span className="h-1 w-2/3 r-full bg-accent-mark" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <span className="h-1 w-1/3 r-full bg-ink-3" />
        <div className="flex flex-1 gap-1">
          <span className="flex-1 r-tag border border-line bg-card" />
          <span className="flex-1 r-tag border border-line bg-card" />
        </div>
      </div>
    </div>
  )
}
function TemaCard({ id, texto, icono, actual, onElegir }: { id: PrefTema; texto: string; icono: ReactNode; actual: PrefTema; onElegir: (t: PrefTema) => void }) {
  const activo = actual === id
  return (
    <button type="button" role="radio" aria-checked={activo} onClick={() => onElegir(id)} className={cx('r-card border p-2 text-left transition-colors', activo ? 'border-ink bg-raised' : 'border-line-strong bg-card hover:bg-raised')} style={activo ? { boxShadow: 'inset 0 0 0 1px var(--ink)' } : undefined}>
      <span className="relative block h-16 overflow-hidden r-control border border-line">
        {id === 'sistema' ? (
          <>
            <Mini tema="dark" />
            <span className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
              <Mini tema="light" />
            </span>
          </>
        ) : (
          <Mini tema={id} />
        )}
      </span>
      <span className="mt-2 flex items-center gap-2 px-1">
        <span className="text-ink-2">{icono}</span>
        <span className="t-body flex-1 font-semibold">{texto}</span>
        <span className={cx('grid size-6 place-items-center r-full border', activo ? 'border-transparent bg-primary text-on-primary' : 'border-control')}>{activo && <Check size={14} weight="bold" aria-hidden />}</span>
      </span>
    </button>
  )
}
function Seccion({ id, titulo, texto, children }: { id: string; titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="card scroll-mt-8">
      <h2 id={`${id}-t`} className="t-section">
        {titulo}
      </h2>
      {texto && <p className="t-label mt-1">{texto}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}
const ANCLAS = [
  ['apariencia', 'Apariencia'],
  ['seguimiento', 'Seguimiento y liquidez'],
  ['avisos', 'Avisos'],
  ['categorias', 'Categorías'],
  ['datos', 'Datos y copias']
] as const

export function Ajustes({ pref, onPref }: { pref: PrefTema; onPref: (t: PrefTema) => void }) {
  const toast = useToast()
  const [activa, setActiva] = useState<string>('apariencia')
  const [duplicados, setDuplicados] = useState(true)
  const [verificar, setVerificar] = useState(true)
  const [concentracion, setConcentracion] = useState(false)
  const [liquidez, setLiquidez] = useState('1.500,00')
  const [colchon, setColchon] = useState('6')
  const [margen, setMargen] = useState(demo === 'error' ? '45' : '3')
  const [presupuesto, setPresupuesto] = useState('80')
  const [inicio, setInicio] = useState('2024-01-01')
  const [sucio, setSucio] = useState(demo === 'error')
  const [guardado, setGuardado] = useState(demo === 'guardado')
  const [restaurando, setRestaurando] = useState<string | null>(params.get('restaurar') === '1' ? copias[0].fecha : null)
  const cambia = <T,>(set: (v: T) => void) => (v: T) => (set(v), setSucio(true), setGuardado(false))

  const errMargen = !/^\d+$/.test(margen) || Number(margen) > 30 ? 'Introduce un número entero entre 0 y 30.' : undefined
  const errPres = !/^\d+$/.test(presupuesto) || Number(presupuesto) < 1 || Number(presupuesto) > 100 ? 'Introduce un porcentaje entre 1 y 100.' : undefined
  const hayError = !!errMargen || !!errPres

  useEffect(() => {
    const el = document.getElementById('contenido')
    if (!el) return
    const o = new IntersectionObserver(
      (es) => {
        const visible = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiva(visible.target.id)
      },
      { root: el, rootMargin: '0px 0px -60% 0px' }
    )
    ANCLAS.forEach(([id]) => document.getElementById(id) && o.observe(document.getElementById(id)!))
    return () => o.disconnect()
  }, [])

  const guardar = () => {
    if (hayError) return
    setSucio(false)
    setGuardado(true)
    toast({ tono: 'success', texto: 'Ajustes guardados' })
  }

  return (
    <div>
      <PageHeader titulo="Ajustes" texto="Todo lo configurable se cambia desde aquí. Los datos no salen de tu equipo." />
      <div className="settings-layout">
        <nav aria-label="Secciones de ajustes" className="@4xl:sticky @4xl:top-0 h-fit self-start">
          <ul className="flex flex-wrap gap-1 @4xl:flex-col">
            {ANCLAS.map(([id, t]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={activa === id ? 'true' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    setActiva(id)
                    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="nav-item nav-item-sub"
                >
                  {t}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Seccion id="apariencia" titulo="Apariencia" texto="Elige cómo quieres ver la app. Se recuerda entre sesiones.">
            <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-3">
              <TemaCard id="dark" texto="Oscuro" icono={<Moon size={20} weight={pref === 'dark' ? 'fill' : 'regular'} aria-hidden />} actual={pref} onElegir={onPref} />
              <TemaCard id="light" texto="Claro" icono={<Sun size={20} weight={pref === 'light' ? 'fill' : 'regular'} aria-hidden />} actual={pref} onElegir={onPref} />
              <TemaCard id="sistema" texto="Sistema" icono={<Monitor size={20} weight={pref === 'sistema' ? 'fill' : 'regular'} aria-hidden />} actual={pref} onElegir={onPref} />
            </div>
          </Seccion>

          <Seccion id="seguimiento" titulo="Seguimiento y liquidez" texto="Desde cuándo cuentas y qué colchón quieres mantener.">
            <div className="auto-grid-wide">
              <TextField label="Moneda base" value="EUR" disabled readOnly ayuda="Por ahora solo euros." />
              <DatePicker label="Inicio del seguimiento" value={inicio} onChange={cambia(setInicio)} ayuda="Fecha desde la que registras movimientos." />
              <TextField label="Mínimo de liquidez" unidad="€" inputMode="decimal" value={liquidez} onChange={(e) => cambia(setLiquidez)(e.target.value)} ayuda="Por debajo, el panel y la previsión te avisan." className="[&_input]:text-right" />
              <TextField label="Colchón de emergencia" unidad="meses" inputMode="numeric" value={colchon} onChange={(e) => cambia(setColchon)(e.target.value)} ayuda="Meses de gastos que quieres tener ahorrados." className="[&_input]:text-right" />
            </div>
          </Seccion>

          <Seccion id="avisos" titulo="Avisos" texto="Qué quieres que te señale el panel.">
            <ul className="divide-line">
              {[
                ['Posibles duplicados', 'Misma cuenta e importe en pocos días.', duplicados, setDuplicados],
                ['Cuentas sin verificar', 'Cuando una cuenta lleva más de 30 días sin cuadrar.', verificar, setVerificar],
                ['Concentración de inversión', 'Si una acción supera el 25 % de la cartera.', concentracion, setConcentracion]
              ].map(([t, d, v, set]) => (
                <li key={t as string} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1">
                    <div className="t-body font-semibold">{t as string}</div>
                    <div className="t-meta">{d as string}</div>
                  </div>
                  <Switch checked={v as boolean} onChange={(x) => cambia(set as (v: boolean) => void)(x)} label={t as string} />
                </li>
              ))}
            </ul>
            <div className="auto-grid-wide mt-6 border-t border-line pt-6">
              <TextField label="Avisar al llegar al presupuesto" unidad="%" inputMode="numeric" value={presupuesto} onChange={(e) => cambia(setPresupuesto)(e.target.value)} error={errPres} ayuda="Entre 1 y 100." className="[&_input]:text-right" />
              <TextField label="Margen para detectar duplicados" unidad="días" inputMode="numeric" value={margen} onChange={(e) => cambia(setMargen)(e.target.value)} error={errMargen} ayuda="Entre 0 y 30 días." className="[&_input]:text-right" />
            </div>
          </Seccion>

          <Seccion id="categorias" titulo="Categorías" texto="Los grupos y categorías con los que clasificas. Puedes cambiarlos cuando quieras.">
            <ul className="divide-line">
              {categoriasAjustes.map((g) => (
                <li key={g.grupo} className="flex flex-wrap items-start gap-4 py-3 first:pt-0">
                  <div className="w-48 shrink-0">
                    <div className="t-body font-semibold">{g.grupo}</div>
                    <div className="t-meta">{g.tipo}</div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    {g.categorias.map((c) => (
                      <Tag key={c}>{c}</Tag>
                    ))}
                  </div>
                  <Tooltip texto={`Editar ${g.grupo}`}>
                    <IconButton variant="ghost" size="sm" etiqueta={`Editar ${g.grupo}`} icono={<PencilSimple size={16} />} />
                  </Tooltip>
                </li>
              ))}
            </ul>
            <Button className="mt-4" size="sm" icon={<Plus size={14} weight="bold" />}>
              Nuevo grupo
            </Button>
          </Seccion>

          <Seccion id="datos" titulo="Datos y copias" texto="Importar, exportar, copiar y restaurar son cuatro cosas distintas. Antes de actualizar, la app hace una copia sola.">
            <div className="flex flex-wrap items-center gap-3 r-card bg-raised p-4" role="status">
              <StatusBadge tono="success">Última copia: hoy, 19 nov 2026, 08:12</StatusBadge>
              <span className="t-meta">
                {copias[0].tamano} · {copias[0].motivo.toLowerCase()}
              </span>
            </div>

            <div className="divide-line mt-6">
              <div className="grid gap-4 py-6 first:pt-0 cols-label">
                <div>
                  <h3 className="t-card-title flex items-center gap-2">
                    <UploadSimple size={20} weight="duotone" aria-hidden /> Importar
                  </h3>
                  <p className="t-meta mt-1">Traer datos de un archivo.</p>
                </div>
                <div>
                  <p className="t-label">Verás una vista previa con recuentos, avisos y duplicados antes de importar nada.</p>
                  <Button className="mt-3" size="sm">
                    Elegir archivo
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 py-6 cols-label">
                <div>
                  <h3 className="t-card-title flex items-center gap-2">
                    <DownloadSimple size={20} weight="duotone" aria-hidden /> Exportar
                  </h3>
                  <p className="t-meta mt-1">Sacar tus datos a un archivo.</p>
                </div>
                <div>
                  <p className="t-label">Todo, con sus identificadores y relaciones, en un archivo de Excel.</p>
                  <Button className="mt-3" size="sm">
                    Exportar todo
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 py-6 cols-label">
                <div>
                  <h3 className="t-card-title flex items-center gap-2">
                    <ShieldCheck size={20} weight="duotone" aria-hidden /> Copias de seguridad
                  </h3>
                  <p className="t-meta mt-1">Guardar una copia de la base.</p>
                </div>
                <div>
                  <Button variant="accent" size="sm" icon={<FloppyDisk size={16} />} onClick={() => toast({ tono: 'success', texto: 'Copia creada' })}>
                    Crear copia ahora
                  </Button>
                  <ul className="divide-line mt-4 r-card border border-line">
                    {copias.map((c) => (
                      <li key={c.fecha} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="t-body tnum font-medium">{c.fecha}</span>
                        <Tag>{c.motivo}</Tag>
                        <span className="t-meta tnum ml-auto">{c.tamano}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="t-meta mt-3 flex items-center gap-2">
                    <FolderOpen size={16} aria-hidden /> <code className="tnum">%APPDATA%\Finanzas</code>
                    <Button size="sm" variant="ghost" icon={<Copy size={14} />}>
                      Copiar ruta
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 py-6 last:pb-0 cols-label">
                <div>
                  <h3 className="t-card-title flex items-center gap-2">Restaurar</h3>
                  <p className="t-meta mt-1">Volver a una copia anterior.</p>
                </div>
                <div>
                  <p className="t-label">Sustituye los datos actuales por los de la copia. Antes se hace una copia de lo que tienes ahora.</p>
                  <Button className="mt-3" size="sm" variant="danger" onClick={() => setRestaurando(copias[1].fecha)}>
                    Restaurar desde una copia…
                  </Button>
                </div>
              </div>
            </div>
          </Seccion>

          {/* Aviso de guardado: sin cambios, con cambios o con errores */}
          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 r-card border border-line-strong bg-overlay px-4 py-3" role="region" aria-label="Guardado de ajustes" style={{ boxShadow: 'var(--shadow-raised)' }}>
            {hayError ? (
              <StatusBadge tono="error">Hay campos con errores: corrígelos para guardar</StatusBadge>
            ) : sucio ? (
              <StatusBadge tono="warning">Tienes cambios sin guardar</StatusBadge>
            ) : guardado ? (
              <StatusBadge tono="success">Cambios guardados hace un momento</StatusBadge>
            ) : (
              <span className="t-meta">Sin cambios pendientes</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" disabled={!sucio} onClick={() => (setSucio(false), setMargen('3'), setPresupuesto('80'))}>
                Descartar
              </Button>
              <Button variant="accent" disabled={!sucio || hayError} onClick={guardar} icon={<FloppyDisk size={16} />}>
                Guardar cambios
              </Button>
            </div>
          </div>
        </div>
      </div>

      {restaurando && (
        <ConfirmDialog
          titulo="¿Restaurar esta copia?"
          texto={`Se sustituirán tus datos actuales por los de la copia del ${restaurando}. Antes se guardará una copia de lo que tienes ahora.`}
          confirmar="Restaurar copia"
          onCancelar={() => setRestaurando(null)}
          onConfirmar={() => (setRestaurando(null), toast({ tono: 'success', texto: 'Copia restaurada' }))}
        />
      )}
    </div>
  )
}
