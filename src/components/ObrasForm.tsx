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
  // Coordenadas de referencia del sitio como texto del formulario; se parsean al guardar
  latitud_sitio?: string
  longitud_sitio?: string
}

// Payload que se persiste en Firestore: las coordenadas van como objeto
// `coordenadas_sitio` solo cuando ambas fueron diligenciadas (nunca null)
export interface ObraSaveData {
  nombre_sitio: string
  codigo: string
  cliente: string
  alcance: string
  estado: 'activa' | 'inactiva'
  coordenadas_sitio?: { latitud: number; longitud: number }
}

interface ObrasFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ObraSaveData) => Promise<void>
  initial?: ObraFormData | null
  existingCodigos: string[]
  editId?: string | null
}

const empty: ObraFormData = { nombre_sitio: '', codigo: '', cliente: '', alcance: '', estado: 'activa', latitud_sitio: '', longitud_sitio: '' }

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

    // Coordenadas del sitio: opcionales, pero si se diligencia una se exigen ambas
    const lat = (form.latitud_sitio ?? '').trim()
    const lng = (form.longitud_sitio ?? '').trim()
    if (lat || lng) {
      if (!lat)
        e.latitud_sitio = 'Si ingresas longitud, la latitud es requerida'
      else if (isNaN(Number(lat)))
        e.latitud_sitio = 'Debe ser un número válido (usa punto decimal)'
      else if (Number(lat) < -90 || Number(lat) > 90)
        e.latitud_sitio = 'Debe estar entre -90 y 90'
      if (!lng)
        e.longitud_sitio = 'Si ingresas latitud, la longitud es requerida'
      else if (isNaN(Number(lng)))
        e.longitud_sitio = 'Debe ser un número válido (usa punto decimal)'
      else if (Number(lng) < -180 || Number(lng) > 180)
        e.longitud_sitio = 'Debe estar entre -180 y 180'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload: ObraSaveData = {
        nombre_sitio: form.nombre_sitio.trim(),
        codigo: form.codigo.trim(),
        cliente: form.cliente.trim(),
        alcance: form.alcance.trim(),
        estado: form.estado,
      }
      const lat = (form.latitud_sitio ?? '').trim()
      const lng = (form.longitud_sitio ?? '').trim()
      if (lat && lng) {
        payload.coordenadas_sitio = { latitud: Number(lat), longitud: Number(lng) }
      }
      await onSave(payload)
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
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Latitud del sitio"
            value={form.latitud_sitio ?? ''}
            onChange={v => set('latitud_sitio', v)}
            error={errors.latitud_sitio}
            placeholder="Ej: 4.60971"
            hint="Opcional. Referencia GPS de la obra."
          />
          <TextField
            label="Longitud del sitio"
            value={form.longitud_sitio ?? ''}
            onChange={v => set('longitud_sitio', v)}
            error={errors.longitud_sitio}
            placeholder="Ej: -74.08175"
            hint="Opcional. Se requiere junto a la latitud."
          />
        </div>
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
