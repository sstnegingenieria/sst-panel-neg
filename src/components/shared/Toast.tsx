import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: number
  message: string
  type: ToastType
}

let toastId = 0
const listeners: ((toast: ToastMessage) => void)[] = []

export function toast(message: string, type: ToastType = 'success') {
  const msg: ToastMessage = { id: ++toastId, message, type }
  listeners.forEach(fn => fn(msg))
}

const icons = {
  success: (
    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

const bg = {
  success: 'border-green-200 bg-green-50',
  error: 'border-red-200 bg-red-50',
  info: 'border-brand-200 bg-brand-50',
}

function ToastItem({ msg, onDone }: { msg: ToastMessage; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(msg.id), 3500)
    return () => clearTimeout(t)
  }, [msg.id, onDone])

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm animate-slide-in ${bg[msg.type]}`}
    >
      {icons[msg.type]}
      <span className="text-gray-800">{msg.message}</span>
    </div>
  )
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const handler = (msg: ToastMessage) => setToasts(prev => [...prev, msg])
    listeners.push(handler)
    return () => {
      const idx = listeners.indexOf(handler)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }, [])

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 min-w-[260px]">
      {toasts.map(t => (
        <ToastItem key={t.id} msg={t} onDone={remove} />
      ))}
    </div>
  )
}
