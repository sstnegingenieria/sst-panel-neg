import { useEffect, useMemo, useState } from 'react'
import Modal from './shared/Modal'
import TextField from './shared/TextField'
import SelectField from './shared/SelectField'
import type { EmpleadoDirecto } from '../types/empleadoDirecto'
import { TIPOS_CONTRATO_EMPLEADO, TIPO_CONTRATO_EMPLEADO_LABEL } from '../types/empleadoDirecto'
import type { UsuarioVinculable } from '../hooks/useEmpleadosDirectos'
import {
  EMPLEADO_FORM_VACIO, timestampAFechaInput, validarEmpleado,
  type EmpleadoFormData,
} from '../utils/empleadosDirectos'

interface EmpleadoDirectoModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (form: EmpleadoFormData) => Promise<void>
  /** null = alta. */
  initial: EmpleadoDirecto | null
  empleados: EmpleadoDirecto[]
  usuarios: UsuarioVinculable[]
}

export default function EmpleadoDirectoModal({
  isOpen, onClose, onSave, initial, empleados, usuarios,
}: EmpleadoDirectoModalProps) {
  const [form, setForm] = useState<EmpleadoFormData>(EMPLEADO_FORM_VACIO)
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setIntentado(false)
    setForm(initial ? {
      nombre: initial.nombre,
      cedula: initial.cedula,
      cargo: initial.cargo,
      area: initial.area,
      tipo_contrato: initial.tipo_contrato,
      fecha_ingreso: timestampAFechaInput(initial.fecha_ingreso),
      user_uid: initial.user_uid ?? '',
      email: initial.email ?? '',
    } : EMPLEADO_FORM_VACIO)
  }, [isOpen, initial])

  const set = <K extends keyof EmpleadoFormData>(k: K, v: EmpleadoFormData[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const errores = useMemo(
    () => validarEmpleado(form, empleados, initial?.id),
    [form, empleados, initial?.id],
  )
  // Tras el primer intento se muestran todos; antes, solo el de cédula
  // (duplicado/formato) en cuanto se escribe algo.
  const ver = (k: keyof EmpleadoFormData) =>
    intentado || (k === 'cedula' && form.cedula.trim() !== '') ? errores[k] : undefined

  const handleSave = async () => {
    setIntentado(true)
    if (Object.keys(errores).length > 0) return
    setGuardando(true)
    try { await onSave(form) } finally { setGuardando(false) }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'Editar empleado' : 'Nuevo empleado'}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        { label: initial ? 'Guardar cambios' : 'Crear empleado', onClick: handleSave, variant: 'primary', loading: guardando },
      ]}
    >
      <div className="flex flex-col gap-4">
        <TextField label="Nombre completo" required value={form.nombre}
          onChange={v => set('nombre', v)} error={ver('nombre')} />
        <TextField label="Cédula" required value={form.cedula} inputMode="numeric"
          onChange={v => set('cedula', v)} error={ver('cedula')}
          hint="Solo dígitos; se guarda sin puntos ni espacios" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Cargo" required value={form.cargo}
            onChange={v => set('cargo', v)} error={ver('cargo')} />
          <TextField label="Área" required value={form.area}
            onChange={v => set('area', v)} error={ver('area')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField label="Tipo de contrato" required value={form.tipo_contrato}
            placeholder="Selecciona…" error={ver('tipo_contrato')}
            options={TIPOS_CONTRATO_EMPLEADO.map(t => ({ value: t, label: TIPO_CONTRATO_EMPLEADO_LABEL[t] }))}
            onChange={v => set('tipo_contrato', v as EmpleadoFormData['tipo_contrato'])} />
          <TextField label="Fecha de ingreso" required type="date" value={form.fecha_ingreso}
            onChange={v => set('fecha_ingreso', v)} error={ver('fecha_ingreso')} />
        </div>
        <TextField label="Correo (opcional)" type="email" value={form.email}
          onChange={v => set('email', v)} error={ver('email')} />
        <SelectField label="Vincular a usuario del panel (opcional)" value={form.user_uid}
          error={ver('user_uid')}
          options={[
            { value: '', label: 'Sin vínculo' },
            ...usuarios.map(u => ({ value: u.id, label: `${u.nombre || u.email}${u.nombre ? ` · ${u.email}` : ''}` })),
          ]}
          onChange={v => set('user_uid', v)} />
        <p className="text-xs text-gray-400">
          El vínculo se guarda solo en este maestro; la cuenta del usuario no se modifica.
        </p>
      </div>
    </Modal>
  )
}
