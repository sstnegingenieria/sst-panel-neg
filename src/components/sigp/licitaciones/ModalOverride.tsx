// "Trabajar de todos modos" — override del semáforo rojo (1.4).
//
// El override NO blanquea el semáforo: lo deja en rojo y autoriza avanzar con
// el rojo puesto (invariante 3 del 1.1). Esa es la diferencia entre un filtro
// que informa y uno que manda — quien lo abre después ve que el criterio
// decía "no" y que alguien decidió lo contrario, con su nombre y su razón.
//
// El texto de `limitaciones` se repite acá a propósito: quien está a punto de
// saltarse el criterio tiene que leer, en ese momento, qué es lo que el
// criterio no midió.
import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import { MODALIDAD_LICITACION_LABEL } from '../../../types/sigp/licitacion'
import type { Licitacion } from '../../../types/sigp/licitacion'

interface Props {
  abierto: boolean
  lic: Licitacion
  /** Texto vivo del registro de versiones. `null` si no se pudo leer. */
  limitaciones: string | null
  onCerrar: () => void
  onConfirmar: (motivo: string) => void
}

export default function ModalOverride({ abierto, lic, limitaciones, onCerrar, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => { if (abierto) setMotivo('') }, [abierto])

  return (
    <Modal
      isOpen={abierto}
      title="Trabajar de todos modos"
      onClose={onCerrar}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: onCerrar, variant: 'secondary' },
        {
          label: 'Registrar y continuar',
          onClick: () => onConfirmar(motivo),
          variant: 'primary',
          disabled: !motivo.trim(),
        },
      ]}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          El criterio <strong>{lic.semaforo_version}</strong> marca este proceso en rojo
          por ser <strong>{MODALIDAD_LICITACION_LABEL[lic.modalidad].toLowerCase()}</strong>.
        </p>

        {limitaciones && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3">
            <p className="text-xs font-semibold text-amber-900 mb-1">
              Lo que el criterio NO midió:
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">{limitaciones}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ¿Por qué vale la pena esta? <span className="text-red-600">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={4}
            placeholder="Ej.: pocas manifestaciones, entidad conocida, el pliego no pide experiencia que no tengamos"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
          />
          <p className="text-xs text-gray-500 mt-1">
            Queda con tu nombre y la fecha. El semáforo <strong>sigue en rojo</strong>:
            esto no lo blanquea, deja constancia de que se decidió avanzar igual.
          </p>
        </div>
      </div>
    </Modal>
  )
}
