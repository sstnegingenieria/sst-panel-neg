// Mantenimiento de precios del catálogo NEG (#2b) — corrección puntual de UN
// ítem. Escribe `valor_unitario` + una entrada APPEND-ONLY en
// `historial_precios` (arrayUnion — nunca se sobrescribe el historial).
import { useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import InputExpresion from '../cotizaciones/InputExpresion'
import { fmtMoney } from '../../../utils/sigp/formato'
import type { CatalogoItem } from '../../../types/sigp/catalogo'

interface CorregirPrecioModalProps {
  item: CatalogoItem
  isOpen: boolean
  onClose: () => void
  onDone: () => void
}

export default function CorregirPrecioModal({ item, isOpen, onClose, onDone }: CorregirPrecioModalProps) {
  const { user } = useAuth()
  // SIN prefill: el precio nuevo se teclea SIEMPRE (un guardar distraído con
  // el precio vigente prellenado generaría entradas de historial-ruido).
  const [precioNuevo, setPrecioNuevo] = useState<number | undefined>(undefined)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => {
    setPrecioNuevo(undefined)
    setMotivo('')
    onClose()
  }

  const puedeGuardar = precioNuevo !== undefined && precioNuevo > 0 && motivo.trim() !== ''

  const guardar = async () => {
    if (!puedeGuardar || precioNuevo === undefined || !user) return
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'catalogo_items', item.id), {
        valor_unitario: precioNuevo,
        historial_precios: arrayUnion({
          valor_unitario: precioNuevo,
          vigente_desde: Timestamp.now(),
          actualizado_por: user.uid,
          motivo: motivo.trim(),
        }),
      })
      toast(`${item.codigo} — precio actualizado`)
      setMotivo('')
      onDone()
    } catch {
      toast('Error al corregir el precio (verifica tu rol)', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={`Corregir precio — ${item.codigo}`}
      onClose={cerrar}
      actions={[
        { label: 'Cancelar', onClick: cerrar, variant: 'secondary' },
        {
          label: guardando ? 'Guardando…' : 'Guardar',
          onClick: guardar,
          variant: 'primary',
          loading: guardando,
          disabled: !puedeGuardar,
        },
      ]}
    >
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{item.descripcion || '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Precio vigente: <span className="font-mono">{fmtMoney(item.valor_unitario ?? 0)}</span>
          </p>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Precio nuevo <span className="text-red-500">*</span></span>
          <InputExpresion
            valor={precioNuevo}
            onValor={setPrecioNuevo}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Motivo <span className="text-red-500">*</span></span>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Por qué se corrige este precio…"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>
      </div>
    </Modal>
  )
}
