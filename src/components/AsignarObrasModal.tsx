import { useState, useEffect, useMemo } from 'react'
import Modal from './shared/Modal'
import MultiSelect from './shared/MultiSelect'
import SelectField from './shared/SelectField'
import { Tecnico } from './UsuariosPendientes'
import { Obra, esObraEspejo } from './ObrasTable'

interface AsignarObrasModalProps {
  isOpen: boolean
  onClose: () => void
  tecnico: Tecnico | null
  obras: Obra[]
  /** Bloque 3+5 — contratistas activos para fijar el empleador del técnico. */
  contratistas: { id: string; nombre: string }[]
  onSave: (
    tecnicoId: string,
    obraIds: string[],
    contratista: { id: string; nombre: string } | null,
  ) => Promise<void>
}

export default function AsignarObrasModal({ isOpen, onClose, tecnico, obras, contratistas, onSave }: AsignarObrasModalProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [empleadorId, setEmpleadorId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (tecnico) {
      setSelected(tecnico.obras_asignadas ?? [])
      setEmpleadorId(tecnico.contratista_id ?? '')
    }
  }, [tecnico, isOpen])

  const handleSave = async () => {
    if (!tecnico) return
    setSaving(true)
    try {
      const emp = contratistas.find(c => c.id === empleadorId) ?? null
      await onSave(tecnico.id, selected, emp)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Bloque 3+5 (#3b — aval SST): con empleador fijado, el técnico solo puede
  // recibir obras de SU contratista (obra-espejo con el mismo contratista_id).
  // Las ya asignadas siguen visibles (para poder gestionarlas/retirarlas) y
  // las obras manuales sin contratista solo aparecen si el técnico no tiene
  // empleador. Sin empleador → sin filtro (retrocompatibilidad).
  const options = useMemo(() => {
    const yaAsignadas = new Set(tecnico?.obras_asignadas ?? [])
    return obras
      .filter(o => o.estado === 'activa' || yaAsignadas.has(o.id))
      .filter(o => !empleadorId || yaAsignadas.has(o.id) || o.contratista_id === empleadorId)
      .map(o => ({
        value: o.id,
        label: `${o.nombre_sitio}${esObraEspejo(o) ? ` · ${o.proyecto_consecutivo ?? 'SIGP'}` : ''}`,
      }))
  }, [obras, empleadorId, tecnico])

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
        <SelectField
          label="Contratista (empleador)"
          value={empleadorId}
          onChange={setEmpleadorId}
          options={[
            { value: '', label: '— Sin contratista —' },
            ...contratistas.map(c => ({ value: c.id, label: c.nombre })),
          ]}
        />
        <p className="text-sm text-gray-500">
          {empleadorId
            ? <>Aval SST: solo se listan las obras del contratista de <strong>{tecnico?.nombre}</strong> (más las que ya tiene asignadas).</>
            : <>Selecciona las obras activas a las que tendrá acceso <strong>{tecnico?.nombre}</strong>. Sin empleador fijado se listan todas.</>}
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
