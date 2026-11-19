export type PrefTema = 'dark' | 'light' | 'sistema'

export function leerTema(): PrefTema {
  const q = new URLSearchParams(location.search).get('tema')
  const v = q ?? localStorage.getItem('maquetas-tema')
  return v === 'light' || v === 'sistema' ? v : 'dark'
}

export function aplicarTema(pref: PrefTema) {
  const oscuro = pref === 'dark' || (pref === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light')
  // Con ?tema= en la dirección (capturas) no se pisa lo guardado
  if (!new URLSearchParams(location.search).get('tema')) localStorage.setItem('maquetas-tema', pref)
}
