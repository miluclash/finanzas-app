// Actualizaciones automáticas desde GitHub Releases (solo en la app instalada).
// Al abrir se busca versión nueva; se descarga en segundo plano, se guarda una copia de seguridad
// y se instala al cerrar la app (o al pulsar "Reiniciar ahora"). Los datos están en %APPDATA%\Finanzas
// y no se tocan. La copia y la instalación esperan a la cola de escritura (ver `UpdaterHooks`); al
// instalar al cerrar, la espera la hace el `before-quit` de index.ts.
import { app, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' | 'disabled' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

let status: UpdateStatus = { state: 'idle' }

/** Lo que el actualizador necesita de la app (sin conocer la base ni la cola). */
export interface UpdaterHooks {
  /** Copia `antes-de-actualizar` (en un turno de la cola). Se llama una sola vez. */
  beforeInstall(): Promise<void>
  /** Espera a que no quede nada por escribir: cola vacía y guardado en disco al día. */
  settle(): Promise<void>
}

export function initUpdater(hooks: UpdaterHooks): void {
  ipcMain.handle('update.status', () => ({ current: app.getVersion(), ...status }))
  if (!app.isPackaged || process.env.FINANZAS_DATA_DIR) {
    status = { state: 'disabled' }
    ipcMain.handle('update.check', () => null)
    ipcMain.handle('update.install', () => null)
    return
  }
  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Una sola copia por actualización descargada; quien llega después espera a la misma.
  let backup: Promise<void> | null = null
  const ensureBackup = (): Promise<void> => {
    if (!backup)
      backup = Promise.resolve()
        .then(() => hooks.beforeInstall())
        .catch((e) => {
          console.error('No se pudo hacer la copia antes de actualizar', e)
        })
    return backup
  }
  autoUpdater.on('checking-for-update', () => (status = { state: 'checking' }))
  autoUpdater.on('update-not-available', () => (status = { state: 'none' }))
  autoUpdater.on('update-available', (i) => (status = { state: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => {
    if (status.state === 'downloading') status = { ...status, percent: Math.round(p.percent) }
  })
  autoUpdater.on('update-downloaded', (i) => {
    void ensureBackup()
    status = { state: 'ready', version: i.version }
  })
  autoUpdater.on('error', (e) => (status = { state: 'error', message: e?.message ?? String(e) }))
  const check = () => autoUpdater.checkForUpdates().catch((e) => (status = { state: 'error', message: String(e?.message ?? e) }))
  ipcMain.handle('update.check', () => check())
  ipcMain.handle('update.install', async () => {
    if (status.state !== 'ready') return null
    await ensureBackup()
    // Nada a medias: se espera a que la cola termine y el guardado esté al día antes de instalar.
    try {
      await hooks.settle()
    } catch (e) {
      console.error('No se pudo terminar de guardar antes de actualizar', e)
    }
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return true
  })
  setTimeout(check, 5000)
  setInterval(check, 6 * 60 * 60 * 1000)
}
