// Proceso principal de Electron: ventana, base de datos e IPC.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createAppHandlers, createAppRegistry, type Handlers } from './app'
import { createBackup } from './core/backup'
import { createCoreContext, initCore, type CoreContext } from './core/context'
import { Db, SaveError } from './core/db'
import { UserError } from './core/errors'
import type { DialogProvider } from './core/handlers'
import { initUpdater } from './core/updater'

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL

// Formato español en controles nativos (fechas DD/MM/AAAA, separadores)
app.commandLine.appendSwitch('lang', 'es-ES')

// Carpeta de datos: %APPDATA%\Finanzas (o FINANZAS_DATA_DIR para pruebas). Se decide solo aquí:
// el núcleo recibe las rutas como parámetro.
function dataDir(): string {
  if (process.env.FINANZAS_DATA_DIR) return process.env.FINANZAS_DATA_DIR
  return path.join(app.getPath('appData'), 'Finanzas')
}

let mainWindow: BrowserWindow | null = null
let core: CoreContext | null = null
let handlers: Handlers | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'Finanzas',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f6f7f9',
    autoHideMenuBar: true,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Nada de navegar fuera de la app ni abrir ventanas nuevas
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !(isDev && url.startsWith(process.env.ELECTRON_RENDERER_URL!))) e.preventDefault()
  })
  if (isDev) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

const dialogs: DialogProvider = {
  async openFile(title, filters) {
    if (process.env.FINANZAS_TEST_OPEN_FILE) return process.env.FINANZAS_TEST_OPEN_FILE
    const r = await dialog.showOpenDialog(mainWindow!, { title, filters, properties: ['openFile'] })
    return r.canceled ? null : r.filePaths[0] ?? null
  },
  async saveFile(title, defaultName, filters) {
    const r = await dialog.showSaveDialog(mainWindow!, { title, defaultPath: path.join(app.getPath('documents'), defaultName), filters })
    return r.canceled ? null : r.filePath ?? null
  },
  async openDir(title) {
    const r = await dialog.showOpenDialog(mainWindow!, { title, properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0] ?? null
  },
  showItem(p) {
    shell.showItemInFolder(p)
  },
  openPath(p) {
    void shell.openPath(p)
  }
}

async function initData(): Promise<void> {
  const dir = dataDir()
  fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'finanzas.sqlite')
  const db = await Db.open(dbPath)
  core = createCoreContext(db, { dbPath, backupsDir: path.join(dir, 'backups') }, createAppRegistry())
  initCore(core)
  handlers = createAppHandlers(core, dialogs, app.getVersion())
  try {
    await handlers['core:backup.auto']()
  } catch (e) {
    console.error('No se pudo hacer la copia automática', e)
  }
}

/**
 * Espera a que la cola de escritura termine y, en un turno propio, reintenta el guardado en disco
 * que hubiera quedado pendiente (lanza si vuelve a fallar).
 */
async function settleWrites(c: CoreContext): Promise<void> {
  await c.queue.onIdle()
  await c.queue.enqueueTask('core:cerrar', async () => c.queue.flush())
}

ipcMain.handle('api', async (_e, method: string, args: unknown[]) => {
  if (!handlers) return { ok: false, error: 'La base de datos aún no está lista.' }
  const fn = (handlers as Record<string, (...a: unknown[]) => unknown>)[method]
  if (typeof fn !== 'function') return { ok: false, error: `Método desconocido: ${method}` }
  try {
    const data = await fn(...(Array.isArray(args) ? args : []))
    return { ok: true, data }
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, user: true }
    // Los cambios están hechos en memoria; el mensaje es para Michael (se reintenta al guardar).
    if (e instanceof SaveError) {
      console.error(`[api] ${method}`, e)
      return { ok: false, error: e.message, user: true }
    }
    console.error(`[api] ${method}`, e)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('theme', (_e, theme: 'system' | 'light' | 'dark') => {
  nativeTheme.themeSource = theme
  return nativeTheme.shouldUseDarkColors
})

const single = app.requestSingleInstanceLock()
if (!single) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.miluclash.finanzas')
    if (!isDev) Menu.setApplicationMenu(null)
    try {
      await initData()
    } catch (e) {
      dialog.showErrorBox('Finanzas', `No se pudo abrir la base de datos:\n${e instanceof Error ? e.message : String(e)}`)
      app.quit()
      return
    }
    createWindow()
    initUpdater({
      beforeInstall: async () => {
        const c = core
        if (!c) return
        await c.queue.onIdle()
        await c.queue.enqueueTask('core:backup.actualizar', async () => {
          createBackup(c, 'antes-de-actualizar')
        })
      },
      settle: async () => {
        if (core) await settleWrites(core)
      }
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  // Al cerrar no se puede perder nada: si la cola está trabajando o hay un guardado pendiente, se
  // espera, se reintenta el guardado y se vuelve a pedir el cierre (una sola vez).
  let readyToQuit = false
  let settling = false
  app.on('before-quit', (e) => {
    const c = core
    if (readyToQuit || !c) return
    if (!c.queue.busy && !c.queue.hasPendingSave) return
    e.preventDefault()
    if (settling) return
    settling = true
    void settleWrites(c)
      .catch((err) => console.error('No se pudieron guardar los últimos cambios al cerrar', err))
      .finally(() => {
        readyToQuit = true
        app.quit()
      })
  })
}
