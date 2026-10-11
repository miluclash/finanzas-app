// Actualizaciones automáticas desde GitHub Releases (solo en la app instalada).
// Al abrir se busca versión nueva; se descarga en segundo plano, se guarda una copia de seguridad
// y se instala al cerrar la app (o al pulsar "Reiniciar ahora"). Los datos están en %APPDATA%\Finanzas
// y no se tocan.
import { app, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' | 'disabled' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

let status: UpdateStatus = { state: 'idle' }

export function initUpdater(beforeInstall: () => void): void {
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
  let backedUp = false
  const backup = () => {
    if (backedUp) return
    backedUp = true
    try {
      beforeInstall()
    } catch (e) {
      console.error('No se pudo hacer la copia antes de actualizar', e)
    }
  }
  autoUpdater.on('checking-for-update', () => (status = { state: 'checking' }))
  autoUpdater.on('update-not-available', () => (status = { state: 'none' }))
  autoUpdater.on('update-available', (i) => (status = { state: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => {
    if (status.state === 'downloading') status = { ...status, percent: Math.round(p.percent) }
  })
  autoUpdater.on('update-downloaded', (i) => {
    backup()
    status = { state: 'ready', version: i.version }
  })
  autoUpdater.on('error', (e) => (status = { state: 'error', message: e?.message ?? String(e) }))
  const check = () => autoUpdater.checkForUpdates().catch((e) => (status = { state: 'error', message: String(e?.message ?? e) }))
  ipcMain.handle('update.check', () => check())
  ipcMain.handle('update.install', () => {
    if (status.state !== 'ready') return null
    backup()
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return true
  })
  setTimeout(check, 5000)
  setInterval(check, 6 * 60 * 60 * 1000)
}
