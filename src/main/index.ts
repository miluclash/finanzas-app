// Proceso principal de Electron: ventana, base de datos e IPC.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Db } from './db/db'
import { createHandlers, type DialogProvider, type Handlers } from './services/api'
import { AppState, UserError } from './services/state'

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL

// Formato español en controles nativos (fechas DD/MM/AAAA, separadores)
app.commandLine.appendSwitch('lang', 'es-ES')

// Carpeta de datos: %APPDATA%\Finanzas (o FINANZAS_DATA_DIR para pruebas)
function dataDir(): string {
  if (process.env.FINANZAS_DATA_DIR) return process.env.FINANZAS_DATA_DIR
  return path.join(app.getPath('appData'), 'Finanzas')
}

let mainWindow: BrowserWindow | null = null
let state: AppState | null = null
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
  state = AppState.init(db, { dbPath, backupsDir: path.join(dir, 'backups') })
  handlers = createHandlers(state, dialogs, app.getVersion())
  try {
    handlers['backup.auto']()
  } catch (e) {
    console.error('No se pudo hacer la copia automática', e)
  }
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
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
