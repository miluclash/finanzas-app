import { Check, Copy, Database, DownloadSimple, FloppyDisk, FolderOpen, Moon, Monitor, PencilSimple, Plus, ShieldCheck, Sun, UploadSimple } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { categoriasAjustes, copias } from '../../datos-ficticios'
import type { PrefTema } from '../tema'
import { cx } from '../lib'
import { Button, Chip, Field, Input, PageHeader, Select, Switch } from '../ui/basics'

/** Miniatura de la app en un tema concreto: el atributo data-theme anidado cambia todos los tokens */
function Mini({ tema }: { tema: 'dark' | 'light' }) {
  return (
    <div data-theme={tema} className="absolute inset-0 flex bg-bg" aria-hidden>
      <div className="flex w-[24%] flex-col gap-1.5 border-r border-line bg-sidebar p-2.5">
        <span className="h-2 w-8 rounded-full bg-ink" />
        <span className="mt-1 h-1.5 w-full rounded-full bg-surface-3" />
        <span className="h-1.5 w-4/5 rounded-full" style={{ background: 'var(--accent-mark)', opacity: 0.8 }} />
        <span className="h-1.5 w-3/5 rounded-full bg-surface-3" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <span className="h-2 w-16 rounded-full bg-ink-3" />
        <div className="flex gap-2">
          <div className="flex-1 rounded-[8px] border border-line bg-surface-1 p-2">
            <span className="block h-1.5 w-8 rounded-full bg-ink-3" />
            <span className="mt-2 block h-3.5 w-14 rounded-full bg-ink" />
          </div>
          <div className="flex-1 rounded-[8px] border border-line bg-surface-1 p-2">
            <span className="block h-1.5 w-6 rounded-full bg-ink-3" />
            <div className="mt-2 flex h-4 items-end gap-1">
              {[40, 70, 55, 90, 65].map((h, i) => (
                <span key={i} className="w-1.5 rounded-t-[2px]" style={{ height: `${h}%`, background: i === 3 ? 'var(--accent-mark)' : 'var(--muted-mark)' }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 rounded-[8px] border border-line bg-surface-1" />
      </div>
    </div>
  )
}

function TemaCard({ id, texto, icono, actual, onElegir, detalle }: { id: PrefTema; texto: string; icono: ReactNode; actual: PrefTema; onElegir: (t: PrefTema) => void; detalle: string }) {
  const activo = actual === id
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={() => onElegir(id)}
      className={cx('group rounded-[var(--radius-lg)] border p-2 text-left transition-[border-color,box-shadow,transform] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5', activo ? 'border-ink bg-surface-2 shadow-[0_0_0_1px_var(--ink)]' : 'border-line-strong bg-surface-1 hover:border-control')}
    >
      <div className="relative h-[116px] overflow-hidden rounded-[var(--radius-md)] border border-line">
        {id === 'sistema' ? (
          <>
            <Mini tema="dark" />
            <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
              <Mini tema="light" />
            </div>
          </>
        ) : (
          <Mini tema={id} />
        )}
      </div>
      <div className="flex items-center gap-2.5 px-1.5 pb-1 pt-3">
        <span className="text-ink-2">{icono}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[length:var(--fs-body)] font-[600]">{texto}</span>
          <span className="t-small block text-ink-3">{detalle}</span>
        </span>
        <span className={cx('grid size-5 place-items-center rounded-full border', activo ? 'border-transparent bg-primary text-on-primary' : 'border-control')}>{activo && <Check size={12} weight="bold" aria-hidden />}</span>
      </div>
    </button>
  )
}

function Seccion({ id, titulo, texto, children }: { id: string; titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="card scroll-mt-6">
      <h2 id={`${id}-t`} className="t-heading">
        {titulo}
      </h2>
      {texto && <p className="t-small mt-1 text-ink-2">{texto}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function Ajustes({ pref, onPref }: { pref: PrefTema; onPref: (t: PrefTema) => void }) {
  const [duplicados, setDuplicados] = useState(true)
  const [verificar, setVerificar] = useState(true)
  const [concentracion, setConcentracion] = useState(false)
  const anclas = [
    ['apariencia', 'Apariencia'],
    ['seguimiento', 'Seguimiento y liquidez'],
    ['avisos', 'Avisos'],
    ['categorias', 'Categorías'],
    ['datos', 'Datos y copias']
  ]
  return (
    <div>
      <PageHeader titulo="Ajustes" texto="Todo lo configurable se cambia desde aquí. Los datos no salen de tu equipo." />
      <div className="grid grid-cols-[190px_1fr] gap-10">
        <nav aria-label="Secciones de ajustes" className="sticky top-0 flex h-fit flex-col gap-0.5 self-start">
          {anclas.map(([id, t], i) => (
            <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className={cx('rounded-[var(--radius-sm)] px-3 py-1.5 text-[length:var(--fs-small)] transition-colors hover:bg-surface-3 hover:text-ink', i === 0 ? 'bg-surface-3 font-[600] text-ink' : 'text-ink-2')}>
              {t}
            </a>
          ))}
        </nav>

        <div className="flex max-w-[880px] flex-col gap-5">
          <Seccion id="apariencia" titulo="Apariencia" texto="Elige cómo quieres ver la app. Se recuerda entre sesiones.">
            <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-4">
              <TemaCard id="dark" texto="Oscuro" detalle="Por defecto" icono={<Moon size={20} weight={pref === 'dark' ? 'fill' : 'regular'} />} actual={pref} onElegir={onPref} />
              <TemaCard id="light" texto="Claro" detalle="Para luz de día" icono={<Sun size={20} weight={pref === 'light' ? 'fill' : 'regular'} />} actual={pref} onElegir={onPref} />
              <TemaCard id="sistema" texto="Sistema" detalle="Sigue a Windows" icono={<Monitor size={20} weight={pref === 'sistema' ? 'fill' : 'regular'} />} actual={pref} onElegir={onPref} />
            </div>
          </Seccion>

          <Seccion id="seguimiento" titulo="Seguimiento y liquidez">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Field label="Moneda base">{(id) => <Input id={id} value="EUR" disabled readOnly />}</Field>
              <Field label="Inicio del seguimiento" hint="Fecha desde la que registras movimientos.">{(id) => <Input id={id} type="date" defaultValue="2024-01-01" />}</Field>
              <Field label="Mínimo de liquidez" hint="Por debajo, el panel y la previsión te avisan.">
                {(id) => (
                  <div className="relative">
                    <Input id={id} defaultValue="1.500,00" inputMode="decimal" className="tnum pr-8 text-right" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3">€</span>
                  </div>
                )}
              </Field>
              <Field label="Meses de gastos para el colchón" hint="Referencia para el fondo de emergencia.">{(id) => <Input id={id} type="number" defaultValue={6} min={0} max={36} />}</Field>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost">Descartar</Button>
              <Button variant="primary" icon={<FloppyDisk size={16} />}>
                Guardar ajustes
              </Button>
            </div>
          </Seccion>

          <Seccion id="avisos" titulo="Avisos" texto="Qué quieres que te señale el panel.">
            <ul className="divide-hair">
              {[
                ['Posibles duplicados', 'Misma cuenta e importe en pocos días.', duplicados, setDuplicados],
                ['Cuentas sin verificar', 'Cuando una cuenta lleva más de 30 días sin cuadrar.', verificar, setVerificar],
                ['Concentración de inversión', 'Si una acción supera el 25 % de la cartera.', concentracion, setConcentracion]
              ].map(([t, d, v, set]) => (
                <li key={t as string} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div className="flex-1">
                    <div className="text-[length:var(--fs-body)] font-[560]">{t as string}</div>
                    <div className="t-small text-ink-3">{d as string}</div>
                  </div>
                  <Switch checked={v as boolean} onChange={set as (v: boolean) => void} label={t as string} />
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-2 gap-x-6 border-t border-line pt-5">
              <Field label="Avisar al llegar al presupuesto (%)">{(id) => <Input id={id} type="number" defaultValue={80} />}</Field>
              <Field label="Días de margen para duplicados" hint="Entre 0 y 30.">{(id) => <Input id={id} type="number" defaultValue={3} />}</Field>
            </div>
          </Seccion>

          <Seccion id="categorias" titulo="Categorías" texto="Los grupos y categorías que usas para clasificar. Puedes cambiarlos cuando quieras.">
            <ul className="divide-hair">
              {categoriasAjustes.map((g) => (
                <li key={g.grupo} className="flex items-start gap-4 py-3.5 first:pt-0">
                  <div className="w-[190px] shrink-0">
                    <div className="text-[length:var(--fs-body)] font-[600]">{g.grupo}</div>
                    <div className="t-small text-ink-3">{g.tipo}</div>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {g.categorias.map((c) => (
                      <span key={c} className="chip">
                        {c}
                      </span>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" aria-label={`Editar ${g.grupo}`} icon={<PencilSimple size={15} />} />
                </li>
              ))}
            </ul>
            <Button className="mt-4" size="sm" icon={<Plus size={14} weight="bold" />}>
              Nuevo grupo
            </Button>
          </Seccion>

          <Seccion id="datos" titulo="Datos y copias" texto="Importar, exportar y copias de seguridad. Antes de actualizar, la app hace una copia sola.">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-[var(--radius-md)] border border-line bg-surface-2 p-4">
                <div className="flex items-center gap-2 text-[length:var(--fs-body)] font-[600]">
                  <UploadSimple size={18} weight="duotone" className="text-accent-text" aria-hidden /> Importar
                </div>
                <p className="t-small mt-1 text-ink-2">Verás una vista previa con recuentos, avisos y duplicados antes de importar nada.</p>
                <Button className="mt-3" size="sm">
                  Elegir archivo
                </Button>
              </div>
              <div className="rounded-[var(--radius-md)] border border-line bg-surface-2 p-4">
                <div className="flex items-center gap-2 text-[length:var(--fs-body)] font-[600]">
                  <DownloadSimple size={18} weight="duotone" className="text-accent-text" aria-hidden /> Exportar
                </div>
                <p className="t-small mt-1 text-ink-2">Todo, con sus identificadores y relaciones, en un archivo de Excel.</p>
                <Button className="mt-3" size="sm">
                  Exportar todo
                </Button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <h3 className="t-small font-[600]">Copias de seguridad</h3>
              <Button size="sm" variant="primary" icon={<Database size={15} />}>
                Hacer copia ahora
              </Button>
            </div>
            <ul className="mt-3 divide-hair rounded-[var(--radius-md)] border border-line">
              {copias.map((c, i) => (
                <li key={c.fecha} className="flex items-center gap-4 px-4 py-3 text-[length:var(--fs-small)]">
                  <ShieldCheck size={18} weight={i === 0 ? 'fill' : 'regular'} className={i === 0 ? 'text-pos' : 'text-ink-3'} aria-hidden />
                  <span className="tnum font-[560]">{c.fecha}</span>
                  <Chip>{c.motivo}</Chip>
                  <span className="tnum ml-auto text-ink-3">{c.tamano}</span>
                  <Button size="sm" variant="ghost">
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 px-4 py-3">
              <FolderOpen size={20} weight="duotone" className="text-ink-2" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="t-small text-ink-3">Dónde están tus datos</div>
                <code className="tnum text-[length:var(--fs-small)]">%APPDATA%\Finanzas</code>
              </div>
              <Button size="sm" variant="ghost" icon={<Copy size={15} />}>
                Copiar ruta
              </Button>
            </div>
          </Seccion>
        </div>
      </div>
    </div>
  )
}
