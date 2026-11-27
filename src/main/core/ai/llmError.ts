// Error tipado del proveedor de IA local (contrato `LlmErrorInfo` de src/shared/core/ai-types.ts).
import type { LlmErrorCode, LlmErrorInfo } from '@shared/core/ai-types'

export class LlmError extends Error implements LlmErrorInfo {
  constructor(
    readonly code: LlmErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

export function isLlmError(e: unknown): e is LlmError {
  return e instanceof LlmError
}
