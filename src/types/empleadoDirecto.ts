import type { Timestamp } from 'firebase/firestore'

/**
 * Maestro canónico de personal DIRECTO de NEG (RRHH) — colección
 * `empleados_directos`. NO es la nómina de contratistas
 * (`contratistas/{id}/privado/nomina`, otro frente): aquí solo el personal
 * vinculado directamente a NEG.
 *
 * "Un hecho, un lugar": este es el maestro; el vínculo con la cuenta del
 * panel (`user_uid`) vive de ESTE lado — la colección `users` no se modifica
 * y no se duplican sus datos. Dato sensible (nombre + cédula, Ley 1581):
 * lectura restringida por reglas a gerencia_administrativa/gestion_integral/admin.
 */
export type TipoContratoEmpleado = 'indefinido' | 'fijo' | 'obra_labor'

export const TIPOS_CONTRATO_EMPLEADO: TipoContratoEmpleado[] = ['indefinido', 'fijo', 'obra_labor']

export const TIPO_CONTRATO_EMPLEADO_LABEL: Record<TipoContratoEmpleado, string> = {
  indefinido: 'Indefinido',
  fijo: 'Término fijo',
  obra_labor: 'Obra o labor',
}

export interface EmpleadoDirecto {
  id: string
  nombre: string
  /** Solo dígitos (normalizada). SENSIBLE. */
  cedula: string
  cargo: string
  area: string
  tipo_contrato: TipoContratoEmpleado
  fecha_ingreso: Timestamp
  /** null mientras esté vigente; la baja es soft (fecha_retiro + activo=false). */
  fecha_retiro: Timestamp | null
  activo: boolean
  /** Vínculo a `users/{uid}` cuando la persona tiene cuenta; se guarda SOLO acá. */
  user_uid: string | null
  email?: string
  // Auditoría
  cargado_por: string
  fecha_carga: Timestamp
  actualizado_por: string
  fecha_actualizacion: Timestamp
}
