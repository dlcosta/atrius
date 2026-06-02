'use client'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export type ToastPayload = {
  title?: string
  message: string
  tone?: ToastTone
  durationMs?: number
}

type ToastListener = (payload: ToastPayload) => void

const listeners = new Set<ToastListener>()

function emit(payload: ToastPayload) {
  for (const listener of listeners) listener(payload)
}

export function subscribeToToast(listener: ToastListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const toast = {
  show(payload: ToastPayload) {
    emit(payload)
  },
  info(message: string, title = 'Aviso') {
    emit({ tone: 'info', title, message })
  },
  success(message: string, title = 'Sucesso') {
    emit({ tone: 'success', title, message })
  },
  warning(message: string, title = 'Atenção') {
    emit({ tone: 'warning', title, message })
  },
  error(message: string, title = 'Erro') {
    emit({ tone: 'error', title, message })
  },
}
