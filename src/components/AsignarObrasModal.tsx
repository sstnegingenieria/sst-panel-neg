import { useState, useEffect } from 'react'
import Modal from './shared/Modal'
import MultiSelect from './shared/MultiSelect'
import { Tecnico } from './UsuariosPendientes'
import { Obra } from './ObrasTable'

interface AsignarObrasModalProps {
  isOpen: boolean
  onClose: () => void
  tecnico: Tecnico | null
  obras: Obra[]
  onSave: (tecnicoId: string, obraIds: string[]) => Promise<void>
}

export default function AsignarObrasModal({ isOpen, onClose, tecnico, obras, onSave }: AsignarObrasModalProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (tecnico) setSelected(tecnico.obras_asignadas ?? [])
  }, [tecnico, isOpen])

  const handleSave = async () => {
    if (!tecnico) return
    setSaving(true)
    try {
      await onSave(tecnico.id, selected)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const options = obras
    .filter(o => o.estado === 'activa')
    .map(o => ({ value: o.id, label: o.nombre_sitio }))

  return (
    <Modal
      isOpen={isOpen}
      title={`Asignar obras — ${tecnico?.nombre ?? ''}`}
      onClose={onClose}
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        { label: 'Guardar asignación', onClick: handleSave, variant: 'primary', loading: saving },
      ]}
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Selecciona las obras activas a las que tendrá acceso <strong>{tecnico?.nombre}</strong>.
        </p>
        <MultiSelect
          label="Obras disponibles"
          value={selected}
          options={options}
          onChange={setSelected}
        />
      </div>
    </Modal>
  )
}
