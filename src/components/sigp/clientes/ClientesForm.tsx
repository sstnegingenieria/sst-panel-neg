import { useState, useEffect } from 'react'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import SelectField from '../../shared/SelectField'
import type { Cliente, Contacto, CondicionesComerciales } from '../../../types/sigp/cliente'

/** Datos que el formulario entrega al guardar (sin id ni sellos de fecha). */
export interface ClienteFormData {
  nombre: string
  nit: string
  estado: 'activo' | 'inactivo'
  usa_tipo_inversion: boolean
  contactos: Contacto[]
  condiciones_comerciales: CondicionesComerciales
}

interface ClientesFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ClienteFormData) => Promise<void>
  initial?: Cliente | null
}

const NIT_RE = /^\d{3}\.\d{3}\.\d{3}-\d$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Estado interno (todo string para inputs controlados) ──────────────────────
interface ContactoRow {
  nombre: string
  cargo: string
  email: string
  telefono: string
}

interface FormState {
  nombre: string
  nit: string
  estado: 'activo' | 'inactivo'
  usaTipoInversion: boolean
  contactos: ContactoRow[]
  esquema: 'iva_pleno' | 'aiu'
  aiu: { admin: string; imprevistos: string; utilidad: string }
}

const EMPTY_CONTACTO: ContactoRow = { nombre: '', cargo: '', email: '', telefono: '' }

function toFormState(c: Cliente | null | undefined): FormState {
  if (!c) {
    return {
      nombre: '', nit: '', estado: 'activo', usaTipoInversion: false,
      contactos: [{ ...EMPTY_CONTACTO }],
      esquema: 'iva_pleno',
      aiu: { admin: '', imprevistos: '', utilidad: '' },
    }
  }
  const aiu = c.condiciones_comerciales.aiu_defaults
  return {
    nombre: c.nombre,
    nit: c.nit,
    estado: c.estado,
    usaTipoInversion: c.usa_tipo_inversion ?? false,
    contactos: c.contactos.length
      ? c.contactos.map(ct => ({
          nombre: ct.nombre,
          cargo: ct.cargo ?? '',
          email: ct.email ?? '',
          telefono: ct.telefono ?? '',
        }))
      : [{ ...EMPTY_CONTACTO }],
    esquema: c.condiciones_comerciales.esquema_impuestos,
    aiu: {
      admin: aiu ? String(aiu.admin) : '',
      imprevistos: aiu ? String(aiu.imprevistos) : '',
      utilidad: aiu ? String(aiu.utilidad) : '',
    },
  }
}

function toFormData(s: FormState): ClienteFormData {
  const contactos: Contacto[] = s.contactos
    .filter(c => c.nombre.trim())
    .map(c => ({
      nombre: c.nombre.trim(),
      ...(c.cargo.trim() ? { cargo: c.cargo.trim() } : {}),
      ...(c.email.trim() ? { email: c.email.trim() } : {}),
      ...(c.telefono.trim() ? { telefono: c.telefono.trim() } : {}),
    }))

  const condiciones_comerciales: CondicionesComerciales =
    s.esquema === 'aiu'
      ? {
          esquema_impuestos: 'aiu',
          aiu_defaults: {
            admin: Number(s.aiu.admin),
            imprevistos: Number(s.aiu.imprevistos),
            utilidad: Number(s.aiu.utilidad),
          },
        }
      : { esquema_impuestos: 'iva_pleno' }

  return {
    nombre: s.nombre.trim(),
    nit: s.nit.trim(),
    estado: s.estado,
    usa_tipo_inversion: s.usaTipoInversion,
    contactos,
    condiciones_comerciales,
  }
}

type Errors = {
  nombre?: string
  nit?: string
  contactos?: (string | undefined)[]
  aiu?: { admin?: string; imprevistos?: string; utilidad?: string }
}

function isPct(v: string): boolean {
  const n = Number(v)
  return v.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 100
}

export default function ClientesForm({ isOpen, onClose, onSave, initial }: ClientesFormProps) {
  const [form, setForm] = useState<FormState>(toFormState(null))
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(toFormState(initial))
    setErrors({})
  }, [initial, isOpen])

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => ({ ...f, [key]: val }))
  }

  const setContacto = (i: number, key: keyof ContactoRow, val: string) => {
    setForm(f => ({
      ...f,
      contactos: f.contactos.map((c, j) => (j === i ? { ...c, [key]: val } : c)),
    }))
  }

  const addContacto = () =>
    setForm(f => ({ ...f, contactos: [...f.contactos, { ...EMPTY_CONTACTO }] }))

  const removeContacto = (i: number) =>
    setForm(f => ({
      ...f,
      contactos: f.contactos.length > 1 ? f.contactos.filter((_, j) => j !== i) : f.contactos,
    }))

  const setAiu = (key: keyof FormState['aiu'], val: string) =>
    setForm(f => ({ ...f, aiu: { ...f.aiu, [key]: val } }))

  const validate = (): boolean => {
    const e: Errors = {}
    if (!form.nombre.trim() || form.nombre.trim().length < 3)
      e.nombre = 'Mínimo 3 caracteres'
    if (!form.nit.trim()) e.nit = 'El NIT es requerido'
    else if (!NIT_RE.test(form.nit.trim())) e.nit = 'Formato: 900.123.456-8'

    const contactErrs = form.contactos.map(c => {
      const algo = c.nombre.trim() || c.cargo.trim() || c.email.trim() || c.telefono.trim()
      if (algo && !c.nombre.trim()) return 'El nombre del contacto es requerido'
      if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) return 'Correo inválido'
      return undefined
    })
    if (contactErrs.some(Boolean)) e.contactos = contactErrs

    if (form.esquema === 'aiu') {
      const aiuErr: NonNullable<Errors['aiu']> = {}
      if (!isPct(form.aiu.admin)) aiuErr.admin = '0–100'
      if (!isPct(form.aiu.imprevistos)) aiuErr.imprevistos = '0–100'
      if (!isPct(form.aiu.utilidad)) aiuErr.utilidad = '0–100'
      if (Object.keys(aiuErr).length) e.aiu = aiuErr
    }

    setErrors(e)
    return !e.nombre && !e.nit && !e.contactos && !e.aiu
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
      title={initial ? 'Editar cliente' : 'Nuevo cliente'}
      onClose={onClose}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        { label: 'Guardar', onClick: handleSave, variant: 'primary', loading: saving },
      ]}
    >
      <div className="space-y-5">
        <TextField
          label="Nombre o razón social"
          value={form.nombre}
          onChange={v => set('nombre', v)}
          error={errors.nombre}
          placeholder="Ej: Ingemec S.A.S"
          required
        />

        <TextField
          label="NIT"
          value={form.nit}
          onChange={v => set('nit', v)}
          error={errors.nit}
          placeholder="900.123.456-8"
          hint="Formato: 900.123.456-8"
          required
        />

        {/* ── Contactos ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Contactos</label>
            <button
              type="button"
              onClick={addContacto}
              className="text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              + Agregar contacto
            </button>
          </div>
          <div className="space-y-3">
            {form.contactos.map((c, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                    <input
                      value={c.nombre}
                      onChange={e => setContacto(i, 'nombre', e.target.value)}
                      placeholder="Nombre"
                      className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 ${
                        errors.contactos?.[i] ? 'border-red-400' : 'border-gray-300'
                      }`}
                    />
                    <input
                      value={c.cargo}
                      onChange={e => setContacto(i, 'cargo', e.target.value)}
                      placeholder="Cargo"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                    <input
                      value={c.email}
                      onChange={e => setContacto(i, 'email', e.target.value)}
                      placeholder="Correo"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                    <input
                      value={c.telefono}
                      onChange={e => setContacto(i, 'telefono', e.target.value)}
                      placeholder="Teléfono"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                  {form.contactos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeContacto(i)}
                      className="p-2 text-gray-400 hover:text-red-600 transition"
                      aria-label="Quitar contacto"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {errors.contactos?.[i] && (
                  <p className="text-xs text-red-600">{errors.contactos[i]}</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Opcional. Las filas vacías se descartan al guardar.
          </p>
        </div>

        {/* ── Condiciones comerciales ───────────────────────────────────── */}
        <div className="space-y-3 rounded-lg bg-gray-50 border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700">Condiciones comerciales</p>
          <SelectField
            label="Esquema de impuestos"
            value={form.esquema}
            onChange={v => set('esquema', v as 'iva_pleno' | 'aiu')}
            options={[
              { value: 'iva_pleno', label: 'IVA pleno' },
              { value: 'aiu', label: 'AIU (Administración, Imprevistos, Utilidad)' },
            ]}
            required
          />
          {form.esquema === 'aiu' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Porcentajes AIU por defecto <span className="text-gray-400 font-normal">(enteros, %)</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['admin', 'imprevistos', 'utilidad'] as const).map(k => (
                  <div key={k}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.aiu[k]}
                      onChange={e => setAiu(k, e.target.value)}
                      placeholder={k === 'admin' ? 'Admin' : k === 'imprevistos' ? 'Imprev.' : 'Utilidad'}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 ${
                        errors.aiu?.[k] ? 'border-red-400' : 'border-gray-300'
                      }`}
                    />
                    <p className="mt-0.5 text-[11px] text-gray-500 capitalize">
                      {k === 'admin' ? 'Administración' : k}
                      {errors.aiu?.[k] && <span className="text-red-600 ml-1">{errors.aiu[k]}</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Bloque 2 — solo con este flag el cotizador muestra el selector OPEX/CAPEX */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.usaTipoInversion}
              onChange={e => set('usaTipoInversion', e.target.checked)}
              className="w-4 h-4 accent-brand-700" />
            Clasifica contratos por tipo de inversión (OPEX/CAPEX — contratos tipo Claro)
          </label>
        </div>

        <SelectField
          label="Estado"
          value={form.estado}
          onChange={v => set('estado', v as 'activo' | 'inactivo')}
          options={[
            { value: 'activo', label: 'Activo' },
            { value: 'inactivo', label: 'Inactivo' },
          ]}
          required
        />
      </div>
    </Modal>
  )
}
