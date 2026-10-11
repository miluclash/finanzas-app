// Puente seguro entre la interfaz y el proceso principal: solo expone llamadas a la API.
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  call: (method: string, args: unknown[]) => ipcRenderer.invoke('api', method, args),
  setTheme: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme', theme)
}

contextBridge.exposeInMainWorld('finanzas', api)
