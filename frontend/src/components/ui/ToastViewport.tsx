'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { subscribeToToast, toast, type ToastPayload, type ToastTone } from '@/lib/ui/toast'

type ToastItem = ToastPayload & { id: string }

const TOAST_STYLE: Record<ToastTone, { Icon: typeof Info; border: string; bg: string; text: string; icon: string }> = {
  info: {
    Icon: Info,
    border: 'border-sky-200',
    bg: 'bg-sky-50/95',
    text: 'text-sky-900',
    icon: 'text-sky-600',
  },
  success: {
    Icon: CheckCircle2,
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/95',
    text: 'text-emerald-900',
    icon: 'text-emerald-600',
  },
  warning: {
    Icon: AlertTriangle,
    border: 'border-amber-200',
    bg: 'bg-amber-50/95',
    text: 'text-amber-900',
    icon: 'text-amber-600',
  },
  error: {
    Icon: AlertCircle,
    border: 'border-red-200',
    bg: 'bg-red-50/95',
    text: 'text-red-900',
    icon: 'text-red-600',
  },
}

function buildToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const unsubscribe = subscribeToToast((payload) => {
      const item: ToastItem = { id: buildToastId(), ...payload, tone: payload.tone ?? 'info' }
      setItems((current) => [...current, item])

      const durationMs = payload.durationMs ?? 4200
      window.setTimeout(() => {
        setItems((current) => current.filter((toastItem) => toastItem.id !== item.id))
      }, durationMs)
    })

    const originalAlert = window.alert.bind(window)
    window.alert = ((message?: unknown) => {
      const formatted =
        typeof message === 'string'
          ? message
          : message == null
            ? 'Atenção'
            : JSON.stringify(message)
      toast.warning(formatted)
    }) as typeof window.alert

    return () => {
      unsubscribe()
      window.alert = originalAlert
    }
  }, [])

  function dismiss(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[200] flex w-full max-w-sm flex-col gap-3">
      {items.map((item) => {
        const tone = item.tone ?? 'info'
        const { Icon, border, bg, text, icon } = TOAST_STYLE[tone]
        return (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-[14px] border ${border} ${bg} ${text} shadow-[var(--shadow-md)] backdrop-blur-sm`}
          >
            <div className="flex items-start gap-3 p-4">
              <div className={`mt-0.5 shrink-0 ${icon}`}>
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                {item.title && <p className="text-sm font-semibold">{item.title}</p>}
                <p className="text-sm leading-5">{item.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-current/70 transition hover:bg-black/5 hover:text-current"
                aria-label="Fechar aviso"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
