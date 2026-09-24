// Maestro de empleados directos — lógica pura (validación, duplicados, máscara
// y builders de los writes). La UI y el hook no improvisan writes: usan estos
// builders, que ya traen la auditoría (`actualizado_por`/`fecha_actualizacion`)
// exigida por las reglas.
import { Timestamp } from 'firebase/firestore'
import { normalizarCedula } from './contratistasNomina'
import type { EmpleadoDirecto, TipoContratoEmpleado } from '../types/empleadoDirecto'
import { TIPOS_CONTRATO_EMPLEADO } from '../types/empleadoDirecto'

export interface EmpleadoFormData {
  nombre: string
  cedula: string
  cargo: string
  area: string
  tipo_contrato: TipoContratoEmpleado | ''
  /** yyyy-mm-dd (input type="date"). */
  fecha_ingreso: string
  user_uid: string
  email: string
}

export const EMPLEADO_FORM_VACIO: EmpleadoFormData = {
  nombre: '', cedula: '', cargo: '', area: '', tipo_contrato: '',
  fecha_ingreso: '', user_uid: '', email: '',
}

/** ••••1234 — deja visibles los 4 últimos dígitos. */
export function enmascararCedula(cedula: string): string {
  if (!cedula) return ''
  if (cedula.length <= 4) return '•'.repeat(cedula.length)
  return '•'.repeat(cedula.length - 4) + cedula.slice(-4)
}

/** yyyy-mm-dd → Timestamp a mediodía local (evita el corrimiento de día por zona horaria). */
export function fechaInputATimestamp(valor: string): Timestamp {
  const [y, m, d] = valor.split('-').map(Number)
  return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0))
}

export function timestampAFechaInput(ts: Timestamp | null | undefined): string {
  const d = ts?.toDate?.()
  if (!d) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Otro empleado (distinto de `excluirId`) con la misma cédula normalizada, si existe. */
export function buscarDuplicadoPorCedula(
  empleados: Pick<EmpleadoDirecto, 'id' | 'cedula' | 'nombre'>[],
  cedulaNormalizada: string,
  excluirId?: string,
): Pick<EmpleadoDirecto, 'id' | 'cedula' | 'nombre'> | null {
  if (!cedulaNormalizada) return null
  return empleados.find(e => e.id !== excluirId && e.cedula === cedulaNormalizada) ?? null
}

/** ¿Otro empleado ya tiene vinculado este usuario? */
export function buscarVinculoDuplicado(
  empleados: Pick<EmpleadoDirecto, 'id' | 'user_uid' | 'nombre'>[],
  userUid: string,
  excluirId?: string,
): Pick<EmpleadoDirecto, 'id' | 'user_uid' | 'nombre'> | null {
  if (!userUid) return null
  return empleados.find(e => e.id !== excluirId && e.user_uid === userUid) ?? null
}

export type ErroresEmpleado = Partial<Record<keyof EmpleadoFormData, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarEmpleado(
  form: EmpleadoFormData,
  empleados: Pick<EmpleadoDirecto, 'id' | 'cedula' | 'nombre' | 'user_uid'>[],
  excluirId?: string,
): ErroresEmpleado {
  const errores: ErroresEmpleado = {}
  if (form.nombre.trim().length < 3) errores.nombre = 'El nombre debe tener al menos 3 caracteres'

  if (form.cedula.trim() === '') {
    errores.cedula = 'La cédula es obligatoria'
  } else if (!/^[\d.\s-]+$/.test(form.cedula.trim())) {
    errores.cedula = 'La cédula solo admite dígitos'
  } else {
    const norm = normalizarCedula(form.cedula)
    if (!norm) {
      errores.cedula = 'Cédula inválida (6 a 12 dígitos)'
    } else {
      const dup = buscarDuplicadoPorCedula(empleados, norm, excluirId)
      if (dup) errores.cedula = `Ya existe un empleado con esa cédula: ${dup.nombre}`
    }
  }

  if (form.cargo.trim() === '') errores.cargo = 'El cargo es obligatorio'
  if (form.area.trim() === '') errores.area = 'El área es obligatoria'
  if (!TIPOS_CONTRATO_EMPLEADO.includes(form.tipo_contrato as TipoContratoEmpleado)) {
    errores.tipo_contrato = 'Selecciona el tipo de contrato'
  }
  if (form.fecha_ingreso === '') errores.fecha_ingreso = 'La fecha de ingreso es obligatoria'
  if (form.email.trim() !== '' && !EMAIL_RE.test(form.email.trim())) errores.email = 'Correo inválido'
  if (form.user_uid) {
    const dup = buscarVinculoDuplicado(empleados, form.user_uid, excluirId)
    if (dup) errores.user_uid = `Ese usuario ya está vinculado a ${dup.nombre}`
  }
  return errores
}

/** Doc completo del alta. `cedula` va normalizada (solo dígitos). */
export function construirAlta(form: EmpleadoFormData, uid: string, ahora: Timestamp) {
  const doc: Record<string, unknown> = {
    nombre: form.nombre.trim(),
    cedula: normalizarCedula(form.cedula) ?? '',
    cargo: form.cargo.trim(),
    area: form.area.trim(),
    tipo_contrato: form.tipo_contrato,
    fecha_ingreso: fechaInputATimestamp(form.fecha_ingreso),
    fecha_retiro: null,
    activo: true,
    user_uid: form.user_uid || null,
    cargado_por: uid,
    fecha_carga: ahora,
    actualizado_por: uid,
    fecha_actualizacion: ahora,
  }
  if (form.email.trim() !== '') doc.email = form.email.trim()
  return doc
}

/** Edición de los campos descriptivos. NUNCA toca cargado_por/fecha_carga ni el estado de baja. */
export function construirEdicion(form: EmpleadoFormData, uid: string, ahora: Timestamp) {
  return {
    nombre: form.nombre.trim(),
    cedula: normalizarCedula(form.cedula) ?? '',
    cargo: form.cargo.trim(),
    area: form.area.trim(),
    tipo_contrato: form.tipo_contrato,
    fecha_ingreso: fechaInputATimestamp(form.fecha_ingreso),
    user_uid: form.user_uid || null,
    email: form.email.trim(),
    actualizado_por: uid,
    fecha_actualizacion: ahora,
  }
}

/** Baja SOFT: fecha_retiro + activo=false. Null si la fecha es anterior al ingreso o falta. */
export function patchBaja(
  fechaRetiro: string,
  fechaIngreso: Timestamp,
  uid: string,
  ahora: Timestamp,
) {
  if (!fechaRetiro) return null
  const retiro = fechaInputATimestamp(fechaRetiro)
  if (retiro.toMillis() < fechaIngreso.toMillis()) return null
  return { fecha_retiro: retiro, activo: false, actualizado_por: uid, fecha_actualizacion: ahora }
}

export function patchReactivar(uid: string, ahora: Timestamp) {
  return { fecha_retiro: null, activo: true, actualizado_por: uid, fecha_actualizacion: ahora }
}
