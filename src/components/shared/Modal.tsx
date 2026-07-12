import { ReactNode, useEffect } from 'react'

interface ModalAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'danger' | 'secondary'
  loading?: boolean
}

interface ModalProps {
  isOpen: boolean
  title: string
  onClose: () => void
  children: ReactNode
  actions?: ModalAction[]
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClass = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-3xl' }
const btnClass = {
  primary: 'bg-brand-700 hover:bg-brand-800 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300',
}

export default function Modal({ isOpen, title, onClose, children, actions, size = 'md' }: ModalProps) {
  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`relative bg-white rounded-xl shadow-2xl w-full ${sizeClass[size]} flex flex-col max-h-[90vh]`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        {actions && actions.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                disabled={action.loading}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                  btnClass[action.variant ?? 'secondary']
                }`}
              >
                {action.loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </span>
                ) : action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
