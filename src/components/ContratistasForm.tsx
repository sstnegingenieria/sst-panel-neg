import { useState, useEffect } from 'react'
import Modal from './shared/Modal'
import TextField from './shared/TextField'
import SelectField from './shared/SelectField'

export interface ContratistaFormData {
  nombre: string
  tipo: 'juridica' | 'natural'   // derivado de tipoDoc — se guarda en Firestore
  nit: string
  cedula: string
  estado: 'activo' | 'inactivo'
}

interface ContratistasFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ContratistaFormData) => Promise<void>
  initial?: ContratistaFormData | null
  editId?: string | null
}

// ── Estado interno simplificado (sin redundancia) ─────────────────────────────
interface FormState {
  nombre:   string
  tipoDoc:  'nit' | 'cedula'   // NIT → jurídica | Cédula → natural
  numero:   string
  estado:   'activo' | 'inactivo'
}

const NIT_RE = /^\d{3}\.\d{3}\.\d{3}-\d$/

function toFormState(data: ContratistaFormData | null | undefined): FormState {
  if (!data) return { nombre: '', tipoDoc: 'nit', numero: '', estado: 'activo' }
  return {
    nombre:  data.nombre,
    tipoDoc: data.tipo === 'natural' ? 'cedula' : 'nit',
    numero:  data.tipo === 'natural' ? (data.cedula ?? '') : (data.nit ?? ''),
    estado:  data.estado,
  }
}

function toFormData(state: FormState): ContratistaFormData {
  const num = state.numero.trim()
  return {
    nombre:  state.nombre.trim(),
    tipo:    state.tipoDoc === 'nit' ? 'juridica' : 'natural',
    nit:     state.tipoDoc === 'nit'    ? num : '',
    cedula:  state.tipoDoc === 'cedula' ? num : '',
    estado:  state.estado,
  }
}

type Errors = Partial<Record<keyof FormState, string>>

export default function ContratistasForm({
  isOpen, onClose, onSave, initial, editId,
}: ContratistasFormProps) {
  const [form, setForm]     = useState<FormState>(toFormState(null))
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(toFormState(initial))
    setErrors({})
  }, [initial, isOpen])

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  const validate = (): boolean => {
    const e: Errors = {}
    if (!form.nombre.trim() || form.nombre.trim().length < 3)
      e.nombre = 'Mínimo 3 caracteres'
    if (!form.numero.trim()) {
      e.numero = form.tipoDoc === 'nit' ? 'El NIT es requerido' : 'La cédula es requerida'
    } else if (form.tipoDoc === 'nit' && !NIT_RE.test(form.numero.trim())) {
      e.numero = 'Formato: 900.123.456-8'
    } else if (form.tipoDoc === 'cedula' && !/^\d+$/.test(form.numero.trim())) {
      e.numero = 'Solo números'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await onSave(toFormData(form))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={editId ? 'Editar contratista' : 'Nuevo contratista'}
      onClose={onClose}
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        { label: 'Guardar', onClick: handleSave, variant: 'primary', loading: saving },
      ]}
    >
      <div className="space-y-4">
        <TextField
          label="Nombre o razón social"
          value={form.nombre}
          onChange={v => set('nombre', v)}
          error={errors.nombre}
          placeholder="Ej: Valmick S.A.S"
          required
        />

        {/* Un solo campo de identificación — sin select de tipo redundante */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Identificación <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {/* Tipo de documento */}
            <select
              value={form.tipoDoc}
              onChange={e => {
                set('tipoDoc', e.target.value as 'nit' | 'cedula')
                set('numero', '')   // limpiar número al cambiar tipo
              }}
              className="w-28 flex-shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="nit">NIT</option>
              <option value="cedula">Cédula</option>
            </select>

            {/* Número */}
            <input
              type={form.tipoDoc === 'cedula' ? 'number' : 'text'}
              inputMode={form.tipoDoc === 'cedula' ? 'numeric' : 'text'}
              value={form.numero}
              onChange={e => set('numero', e.target.value)}
              placeholder={form.tipoDoc === 'nit' ? '900.123.456-8' : '1020345678'}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.numero ? 'border-red-400' : 'border-gray-300'
              }`}
            />
          </div>
          {errors.numero && (
            <p className="text-xs text-red-500 mt-0.5">{errors.numero}</p>
          )}
          <p className="text-xs text-gray-400">
            {form.tipoDoc === 'nit'
              ? 'Persona jurídica — formato: 900.123.456-8'
              : 'Persona natural — solo dígitos'}
          </p>
        </div>

        <SelectField
          label="Estado"
          value={form.estado}
          onChange={v => set('estado', v as 'activo' | 'inactivo')}
          options={[
            { value: 'activo',   label: 'Activo' },
            { value: 'inactivo', label: 'Inactivo' },
          ]}
          required
        />
      </div>
    </Modal>
  )
}
