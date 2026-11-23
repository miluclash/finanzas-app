import { ArrowCircleUp } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { toast } from '../../lib/toast'
import { Button, IconButton, Tooltip } from '../ui'

/** Pie de la barra lateral: versión y estado de la actualización automática. */
export function UpdateFooter({ plegada, version }: { plegada: boolean; version: string }) {
  const [st, setSt] = useState<UpdateStatus | null>(null)
  const [installing, setInstalling] = useState(false)
  useEffect(() => {
    let alive = true
    const poll = () =>
      window.finanzas
        .updateStatus?.()
        .then((s) => alive && setSt(s))
        .catch(() => {})
    poll()
    const t = setInterval(poll, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  const instalar = async () => {
    if (installing) return
    setInstalling(true)
    try {
      // Si no se ha podido guardar antes de instalar, no se instala y llega el motivo.
      const r = await window.finanzas.installUpdate()
      if (r && r !== true) toast.error(r.error)
    } catch (e) {
      toast.error(`No se ha podido instalar la actualización: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setInstalling(false)
    }
  }
  const actual = st?.current ?? version

  if (st?.state === 'ready') {
    if (plegada)
      return (
        <Tooltip texto={`Versión ${st.version} lista: reiniciar y actualizar`} lado="right">
          <IconButton variant="accent" className="w-full" etiqueta={`Reiniciar y actualizar a la versión ${st.version}`} cargando={installing} disabled={installing} onClick={instalar} icono={<ArrowCircleUp size={20} weight="fill" />} />
        </Tooltip>
      )
    return (
      <div className="px-3 pt-1">
        <div className="t-label font-semibold text-ink">Versión {st.version} lista</div>
        <div className="t-meta mt-1">Se instala al cerrar la app. Tus datos no cambian.</div>
        <Button variant="accent" size="sm" className="mt-3 w-full" cargando={installing} disabled={installing} onClick={instalar}>
          Reiniciar y actualizar
        </Button>
      </div>
    )
  }

  if (plegada)
    return (
      <p className="t-meta tnum text-center" title={`Versión ${actual}. Datos guardados solo en este PC`}>
        v{actual}
      </p>
    )
  return (
    <div className="t-meta px-3">
      <p>Datos guardados solo en este PC</p>
      <p className="tnum mt-1">
        Versión {actual}
        {st?.state === 'downloading' && ` · descargando ${st.version} (${st.percent} %)`}
        {st?.state === 'checking' && ' · buscando actualizaciones…'}
        {st?.state === 'none' && ' · al día'}
        {st?.state === 'error' && <span title={st.message}> · no se pudo comprobar si hay versión nueva</span>}
      </p>
    </div>
  )
}
