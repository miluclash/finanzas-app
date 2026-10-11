import { useEffect, useState } from 'react'

/** Pie de la barra lateral: versión y estado de la actualización automática. */
export function UpdateFooter() {
  const [st, setSt] = useState<UpdateStatus | null>(null)
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
  const line = 'border-t border-line px-5 py-3 text-[11px] text-muted'
  if (st?.state === 'ready')
    return (
      <div className="border-t border-line px-5 py-3 text-[12px]">
        <div className="font-medium text-ink">Versión {st.version} lista</div>
        <div className="text-muted">Se instala al cerrar la app. Tus datos no cambian.</div>
        <button
          className="mt-2 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink hover:brightness-110"
          onClick={() => window.finanzas.installUpdate()}
        >
          Reiniciar y actualizar
        </button>
      </div>
    )
  return (
    <div className={line}>
      Datos guardados solo en este PC
      {st && (
        <div className="mt-0.5">
          Versión {st.current}
          {st.state === 'downloading' && ` · descargando ${st.version} (${st.percent} %)`}
          {st.state === 'checking' && ' · buscando actualizaciones…'}
          {st.state === 'none' && ' · al día'}
          {st.state === 'error' && <span title={st.message}> · no se pudo comprobar si hay versión nueva</span>}
        </div>
      )}
    </div>
  )
}
