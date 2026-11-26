// Punto de entrada del estado de finanzas. Carga `index.ts` (que registra el módulo en `appState.ts`) para que
// `AppState.init` siempre lo encuentre; la clase vive en `appState.ts` para que `metrics.ts` no cree un ciclo.
import './index'
export { AppState } from './appState'
