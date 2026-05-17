import { useState, useEffect, useRef, FormEvent } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import Modal from './shared/Modal'
import { Tecnico } from './UsuariosPendientes'
import { toast } from './shared/Toast'
import { getDocEstado, estadoLabel, estadoClasses, formatFechaVenc } from '../utils/vencimiento'

interface Props {
  isOpen: boolean
  onClose: () => void
  tecnico: Tecnico | null
  onGuardado: () => void
}

export default function EditarDocumentosModal({ isOpen, onClose, tecnico, onGuardado }: Props) {
  const [epsVenc, setEpsVenc] = useState('')
  const [arlVenc, setArlVenc] = useState('')
  const [pensionVenc, setPensionVenc] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (tecnico) {
      setEpsVenc(tecnico.eps_vencimiento ?? '')
      setArlVenc(tecnico.arl_vencimiento ?? '')
      setPensionVenc(tecnico.pension_vencimiento ?? '')
    }
  }, [tecnico])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!tecnico) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'users', tecnico.id), {
        eps_vencimiento: epsVenc || null,
        arl_vencimiento: arlVenc || null,
        pension_vencimiento: pensionVenc || null,
      })
      onGuardado()
      onClose()
    } catch {
      toast('Error al guardar las fechas', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={`Documentos — ${tecnico?.nombre ?? ''}`}
      onClose={onClose}
      size="md"
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        { label: 'Guardar fechas', onClick: () => formRef.current?.requestSubmit(), variant: 'primary', loading: saving },
      ]}
    >
      <form ref={formRef} id="docs-form" onSubmit={handleSubmit} className="space-y-5">
        {/* Section header */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Fechas de vencimiento de documentos</h3>
          <p className="text-xs text-gray-500 mt-1">
            Ingresa la fecha de vencimiento de cada documento de seguridad social. El sistema alertará cuando
            estén próximos a vencer (≤ 30 días) o vencidos.
          </p>
        </div>

        {/* EPS */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            📋 EPS
            {tecnico?.eps && (
              <span className="ml-1.5 text-gray-400 font-normal">({tecnico.eps})</span>
            )}
          </label>
          <input
            type="date"
            value={epsVenc}
            onChange={e => setEpsVenc(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {epsVenc && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoClasses[getDocEstado(epsVenc)]}`}>
                {estadoLabel(getDocEstado(epsVenc))}
              </span>
              <span className="text-xs text-gray-400">Vence: {formatFechaVenc(epsVenc)}</span>
            </div>
          )}
        </div>

        {/* ARL */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            🦺 ARL
            {tecnico?.arl && (
              <span className="ml-1.5 text-gray-400 font-normal">({tecnico.arl})</span>
            )}
          </label>
          <input
            type="date"
            value={arlVenc}
            onChange={e => setArlVenc(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {arlVenc && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoClasses[getDocEstado(arlVenc)]}`}>
                {estadoLabel(getDocEstado(arlVenc))}
              </span>
              <span className="text-xs text-gray-400">Vence: {formatFechaVenc(arlVenc)}</span>
            </div>
          )}
        </div>

        {/* Pensión */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            💼 Fondo de Pensión
            {tecnico?.fondo_pension && (
              <span className="ml-1.5 text-gray-400 font-normal">({tecnico.fondo_pension})</span>
            )}
          </label>
          <input
            type="date"
            value={pensionVenc}
            onChange={e => setPensionVenc(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {pensionVenc && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoClasses[getDocEstado(pensionVenc)]}`}>
                {estadoLabel(getDocEstado(pensionVenc))}
              </span>
              <span className="text-xs text-gray-400">Vence: {formatFechaVenc(pensionVenc)}</span>
            </div>
          )}
        </div>

        {/* Hidden submit to allow form submission via the Modal action button */}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
