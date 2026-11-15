// Handlers IPC del núcleo: información de la app, auditoría, copias de seguridad y carpeta de datos.
// Los de cada módulo los construye su `ipc` (ver registry.ts) y se juntan en la raíz de composición.
import { autoBackup, createBackup, listBackups, restoreBackup } from './backup'
import type { CoreContext } from './context'
import { UserError } from './errors'
import { schemaVersion } from './migrations'

/** Diálogos nativos y acciones del sistema (en tests se sustituyen por unos falsos). */
export interface DialogProvider {
  openFile(title: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  saveFile(title: string, defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  openDir(title: string): Promise<string | null>
  showItem(p: string): void
  openPath(p: string): void
}

export function createCoreHandlers(ctx: CoreContext, dialogs: DialogProvider, appVersion = '0.0.0') {
  return {
    'app.info': () => ({
      version: appVersion,
      dbPath: ctx.paths.dbPath,
      backupsDir: ctx.paths.backupsDir,
      schemaVersion: schemaVersion(ctx.db),
      today: ctx.today(),
      isEmpty: ctx.registry.modules.every((m) => (m.isEmpty ? m.isEmpty(ctx) : true))
    }),

    // Auditoría
    'audit.list': (limit = 300, entity?: string) =>
      ctx.db.all<{
        id: number
        ts: string
        entity: string
        entity_id: string
        action: string
        summary: string | null
        before_json: string | null
        after_json: string | null
      }>(
        `SELECT * FROM audit_log ${entity ? 'WHERE entity = ?' : ''} ORDER BY id DESC LIMIT ${Math.min(Math.max(1, limit), 5000)}`,
        entity ? [entity] : undefined
      ),

    // Copias
    'backup.list': () => listBackups(ctx),
    'backup.create': () => createBackup(ctx, 'manual'),
    'backup.auto': () => autoBackup(ctx),
    'backup.restore': async (file?: string) => {
      const f =
        file ??
        (await dialogs.openFile('Elige una copia para restaurar', [{ name: 'Copia de Finanzas', extensions: ['sqlite', 'json'] }]))
      if (!f) return null
      return restoreBackup(ctx, f)
    },
    'backup.openFolder': () => {
      if (!ctx.paths.backupsDir) throw new UserError('No hay carpeta de copias.')
      dialogs.openPath(ctx.paths.backupsDir)
      return true
    },
    'data.openFolder': () => {
      if (ctx.paths.dbPath) dialogs.showItem(ctx.paths.dbPath)
      return true
    }
  }
}

export type CoreHandlers = ReturnType<typeof createCoreHandlers>
