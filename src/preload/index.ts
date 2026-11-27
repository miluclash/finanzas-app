// Puente seguro entre la interfaz y el proceso principal: solo expone llamadas a la API y los
// eventos del asistente (streaming de respuestas, canal `ai:event`).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// Mismo valor que `AI_EVENT_CHANNEL` en src/shared/core/ai-types.ts (el preload no importa código compartido).
const AI_EVENT_CHANNEL = 'ai:event'

const api = {
  call: (method: string, args: unknown[]) => ipcRenderer.invoke('api', method, args),
  /** Se suscribe a los eventos del asistente; devuelve la función para darse de baja. */
  onAiEvent: (cb: (event: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(AI_EVENT_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(AI_EVENT_CHANNEL, listener)
    }
  },
  updateStatus: () => ipcRenderer.invoke('update.status'),
  checkUpdate: () => ipcRenderer.invoke('update.check'),
  installUpdate: () => ipcRenderer.invoke('update.install'),
  setTheme: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme', theme)
}

contextBridge.exposeInMainWorld('finanzas', api)
