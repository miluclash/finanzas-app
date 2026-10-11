// Cliente tipado de la API del proceso principal + hooks de React Query.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import type { ApiArgs, ApiMethod, ApiResult } from '../../../main/services/api'
import { toast } from './toast'

export class ApiError extends Error {
  constructor(
    message: string,
    public user: boolean
  ) {
    super(message)
  }
}

export async function api<K extends ApiMethod>(method: K, ...args: ApiArgs<K>): Promise<ApiResult<K>> {
  const res = await window.finanzas.call(method, args as unknown[])
  if (!res.ok) throw new ApiError(res.error ?? 'Error desconocido', !!res.user)
  return res.data as ApiResult<K>
}

/** Consulta cacheada. La clave es el método + argumentos. */
export function useApi<K extends ApiMethod>(
  method: K,
  args: ApiArgs<K>,
  opts?: Omit<UseQueryOptions<ApiResult<K>, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<ApiResult<K>, ApiError>({
    queryKey: [method, ...(args as unknown[])],
    queryFn: () => api(method, ...args),
    ...opts
  })
}

/**
 * Mutación: tras cualquier cambio se invalidan TODAS las consultas, así saldos, presupuestos,
 * objetivos, patrimonio y previsiones se recalculan siempre desde los datos guardados.
 */
export function useApiMutation<K extends ApiMethod>(
  method: K,
  opts: { success?: string | ((r: ApiResult<K>) => string | null); onSuccess?: (r: ApiResult<K>) => void; silentError?: boolean } = {}
) {
  const qc = useQueryClient()
  return useMutation<ApiResult<K>, ApiError, ApiArgs<K>>({
    mutationFn: (args) => api(method, ...args),
    onSuccess: async (r) => {
      await qc.invalidateQueries()
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success
      if (msg) toast.success(msg)
      opts.onSuccess?.(r)
    },
    onError: (e) => {
      if (!opts.silentError) toast.error(e.message)
    }
  })
}
