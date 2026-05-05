import { useState, useEffect } from 'react'
import Modal from './shared/Modal'
import TextField from './shared/TextField'
import SelectField from './shared/SelectField'

export interface ObraFormData {
  nombre_sitio: string
  codigo: string
  cliente: string
  alcance: string
  estado: 'activa' | 'inactiva'
}

interface ObrasFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ObraFormData) => Promise<void>
  initial?: ObraFormData | null
  existingCodigos: string[]
  editId?: string | null
}

const empty: ObraFormData = { nombre_sitio: '', codigo: '', cliente: '', alcance: '', estado: 'activa' }

type Errors = Partial<Record<keyof ObraFormData, string>>

export default function ObrasForm({
  isOpen,
  onClose,
  onSave,
  initial,
  existingCodigos,
  editId,
}: ObrasFormProps) {
  const [form, setForm] = useState<ObraFormData>(empty)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(initial ?? empty)
    setErrors({})
  }, [initial, isOpen])

  const set = <K extends keyof ObraFormData>(key: K, val: ObraFormData[K]) => {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  const validate = (): boolean => {
    const e: Errors = {}
    if (!form.nombre_sitio.trim() || form.nombre_sitio.trim().length < 3)
      e.nombre_sitio = 'Mínimo 3 caracteres'
    if (!form.codigo.trim())
      e.codigo = 'El código es requerido'
    else if (existingCodigos.includes(form.codigo.trim()) && form.codigo !== initial?.codigo)
      e.codigo = 'Este código ya existe'
    if (!form.cliente.trim())
      e.cliente = 'El cliente es requerido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await onSave({ ...form, nombre_sitio: form.nombre_sitio.trim(), codigo: form.codigo.trim(), cliente: form.cliente.trim(), alcance: form.alcance.trim() })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={editId ? 'Editar obra' : 'Nueva obra'}
      onClose={onClose}
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        { label: 'Guardar', onClick: handleSave, variant: 'primary', loading: saving },
      ]}
    >
      <div className="space-y-4">
        <TextField
          label="Nombre del sitio"
          value={form.nombre_sitio}
          onChange={v => set('nombre_sitio', v)}
          error={errors.nombre_sitio}
          placeholder="Ej: Datacenter Triara"
          required
        />
        <TextField
          label="Código"
          value={form.codigo}
          onChange={v => set('codigo', v)}
          error={errors.codigo}
          placeholder="Ej: TRI-2025-001"
          required
        />
        <TextField
          label="Cliente"
          value={form.cliente}
          onChange={v => set('cliente', v)}
          error={errors.cliente}
          placeholder="Ej: Claro Colombia"
          required
        />
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Alcance / Objeto de la obra
          </label>
          <textarea
            value={form.alcance}
            onChange={e => set('alcance', e.target.value)}
            placeholder="Ej: Instalación de sistema de puesta a tierra en sala principal..."
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
          />
          <p className="text-xs text-gray-400">Describe el trabajo específico a realizar en este sitio.</p>
        </div>
        <SelectField
          label="Estado"
          value={form.estado}
          onChange={v => set('estado', v as 'activa' | 'inactiva')}
          options={[
            { value: 'activa', label: 'Activa' },
            { value: 'inactiva', label: 'Inactiva' },
          ]}
          required
        />
      </div>
    </Modal>
  )
}
