// Descartar con motivo OBLIGATORIO (invariante 1 del 1.1).
//
// El motivo no es burocracia: la sección "Descartadas" de la bandeja se filtra
// por él, y ese filtro es lo que responde "¿por qué dejamos pasar 117
// procesos el año pasado?" — la pregunta que el registro en Excel no podía
// contestar sin leerlo fila por fila.
import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import SelectField from '../../shared/SelectField'
import { MOTIVOS_DESCARTE, MOTIVO_DESCARTE_LABEL } from '../../../types/sigp/licitacion'
import type { MotivoDescarte } from '../../../types/sigp/licitacion'

interface Props {
  abierto: boolean
  onCerrar: () => void
  onConfirmar: (motivo: MotivoDescarte) => void
}

export default function ModalDescartar({ abierto, onCerrar, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => { if (abierto) setMotivo('') }, [abierto])

  return (
    <Modal
      isOpen={abierto}
      title="Descartar proceso"
      onClose={onCerrar}
      size="md"
      actions={[
        { label: 'Cancelar', onClick: onCerrar, variant: 'secondary' },
        {
          label: 'Descartar',
          onClick: () => onConfirmar(motivo as MotivoDescarte),
          variant: 'danger',
          disabled: !motivo,
        },
      ]}
    >
      <div className="space-y-3">
        <SelectField
          label="Motivo del descarte"
          value={motivo}
          onChange={setMotivo}
          required
          options={[
            { value: '', label: 'Elegir…' },
            ...MOTIVOS_DESCARTE.map(m => ({ value: m, label: MOTIVO_DESCARTE_LABEL[m] })),
          ]}
        />
        <p className="text-xs text-gray-500">
          Descartar es reversible: el proceso se puede reabrir en evaluación.
          Si ya tenía consecutivo, lo conserva — el número gastado no se devuelve.
        </p>
      </div>
    </Modal>
  )
}
