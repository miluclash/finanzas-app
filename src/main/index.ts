// Proceso principal de Electron: ventana, base de datos e IPC.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MessageBoxSyncOptions } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createAppHandlers, createAppRegistry, type Handlers } from './app'
import { createBackup } from './core/backup'
import { createCoreContext, initCore, type CoreContext } from './core/context'
import { Db, SaveError } from './core/db'
import { UserError } from './core/errors'
import type { DialogProvider } from './core/handlers'
import { initUpdater, type UpdaterControl } from './core/updater'

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
let updater: UpdaterControl | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'Finanzas',
    // Lienzo del sistema de diseño (tokens --canvas, oscuro y claro) para que no haya destello al abrir
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0c0f' : '#f3f4f6',
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

type GuardadoFinal = { kind: 'guardado' } | { kind: 'copia'; path: string } | { kind: 'fallo' }

/**
 * `queue.committedCount` del último momento en que se aceptó salir sin guardar en el archivo: al
 * hacer una copia `sin-guardar` (que lo tiene todo hasta ahí) o al elegir "Cerrar sin guardar".
 * Cualquier escritura posterior cambia el contador y obliga a repetir el proceso al cerrar.
 */
let salidaSinGuardarEn: number | null = null

/** Se puede salir ya: la cola está libre y todo está guardado (o no ha cambiado nada desde la copia). */
function puedeSalir(c: CoreContext): boolean {
  if (c.queue.busy) return false
  return !c.queue.hasPendingSave || c.queue.committedCount === salidaSinGuardarEn
}

/**
 * Antes de cerrar o de instalar una actualización: intenta dejar todo guardado y, si el archivo
 * no se puede guardar, vuelca la base en memoria a una copia `sin-guardar` (en un turno de la cola).
 */
async function guardarOCopiar(c: CoreContext): Promise<GuardadoFinal> {
  try {
    await settleWrites(c)
    return { kind: 'guardado' }
  } catch (e) {
    console.error('No se pudieron guardar los últimos cambios', e)
  }
  if (!c.paths.backupsDir) return { kind: 'fallo' }
  try {
    const copia = await c.queue.enqueueTask('core:backup.sin-guardar', async () => {
      const b = createBackup(c, 'sin-guardar')
      // En el turno de la copia no entra ninguna escritura: el contador es exactamente el de la copia.
      salidaSinGuardarEn = c.queue.committedCount
      return b
    })
    return { kind: 'copia', path: copia.path }
  } catch (e) {
    console.error('Tampoco se pudo hacer la copia sin-guardar', e)
    return { kind: 'fallo' }
  }
}

/** Diálogo bloqueante, con la ventana principal como padre si sigue abierta. */
function mostrarDialogo(opts: MessageBoxSyncOptions): number {
  const w = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  return w ? dialog.showMessageBoxSync(w, opts) : dialog.showMessageBoxSync(opts)
}

/** Aviso (bloqueante) de que los cambios no se guardaron en el archivo pero sí en una copia. */
function avisarCopiaSinGuardar(copia: string): void {
  mostrarDialogo({
    type: 'warning',
    title: 'Finanzas',
    message: 'No se han podido guardar tus últimos cambios en el archivo de datos',
    detail:
      `No se ha perdido nada: está todo en esta copia de seguridad:\n${copia}\n\n` +
      'Al volver a abrir la app, restáurala desde Ajustes → Copias de seguridad.',
    buttons: ['Entendido'],
    noLink: true
  })
}

/** Pregunta si reintentar el guardado (true) o cerrar sin guardar (false). */
function preguntarReintentar(): boolean {
  const r = mostrarDialogo({
    type: 'error',
    title: 'Finanzas',
    message: 'No se han podido guardar tus últimos cambios',
    detail:
      'Tampoco se ha podido hacer una copia de seguridad con ellos. Si cierras ahora, se perderán los ' +
      'cambios que no se hayan guardado. Comprueba que queda espacio en el disco y vuelve a intentarlo.',
    buttons: ['Reintentar', 'Cerrar sin guardar'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  return r === 0
}

/**
 * Al cerrar: guarda, o hace la copia `sin-guardar` y avisa, o pregunta hasta que se guarde o Michael
 * decida cerrar sin guardar (entonces tampoco se instala la actualización pendiente en este cierre).
 */
async function cerrarSinPerder(c: CoreContext): Promise<void> {
  const r = await guardarOCopiar(c)
  if (r.kind === 'guardado') return
  if (r.kind === 'copia') {
    avisarCopiaSinGuardar(r.path)
    return
  }
  while (preguntarReintentar()) {
    try {
      await settleWrites(c)
      return
    } catch (e) {
      console.error('El reintento de guardado ha vuelto a fallar', e)
    }
  }
  // "Cerrar sin guardar": el diálogo es síncrono, así que no ha entrado nada desde que se eligió.
  salidaSinGuardarEn = c.queue.committedCount
  updater?.skipInstallOnQuit()
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
    // Los cambios están hechos en memoria (`saved: true`: la interfaz refresca los datos para no
    // repetirlos); el mensaje es para Michael (se reintenta al guardar).
    if (e instanceof SaveError) {
      console.error(`[api] ${method}`, e)
      return { ok: false, error: e.message, user: true, saved: true }
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
    updater = initUpdater({
      beforeInstall: async () => {
        const c = core
        if (!c) return
        await c.queue.onIdle()
        await c.queue.enqueueTask('core:backup.actualizar', async () => {
          createBackup(c, 'antes-de-actualizar')
        })
      },
      settle: async () => {
        const c = core
        if (!c) return { ok: true }
        const r = await guardarOCopiar(c)
        if (r.kind === 'fallo')
          return {
            ok: false,
            error:
              'No se han podido guardar tus últimos cambios (ni hacer una copia con ellos), así que la actualización no se ha instalado. Comprueba que queda espacio en el disco y vuelve a intentarlo.'
          }
        // Con la copia hecha, el cierre de la instalación sale sin repetirla si no entra nada más
        // (`salidaSinGuardarEn`); si entra alguna escritura, `before-quit` vuelve a empezar.
        if (r.kind === 'copia') avisarCopiaSinGuardar(r.path)
        return { ok: true }
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
  // espera y se reintenta el guardado; si falla, copia `sin-guardar` o diálogo (`cerrarSinPerder`).
  // Después se vuelve a pedir el cierre una sola vez; mientras tanto, `settling` evita empezar otro.
  // Se sale sin repetir nada si la cola está libre y no ha entrado ninguna escritura desde la copia
  // (o desde "Cerrar sin guardar"); si ha entrado alguna, se repite el proceso.
  let settling = false
  app.on('before-quit', (e) => {
    const c = core
    if (!c || puedeSalir(c)) return
    e.preventDefault()
    if (settling) return
    settling = true
    void cerrarSinPerder(c)
      .catch((err) => {
        // No debería pasar (`cerrarSinPerder` captura sus errores). Se sale igual, sin bucles.
        console.error('No se pudieron guardar los últimos cambios al cerrar', err)
        salidaSinGuardarEn = c.queue.committedCount
      })
      .finally(() => {
        settling = false
        app.quit()
      })
  })
}
