// Módulo Compras (C1) — Proveedores.
//
// MODELO NEG: los materiales los compra NEG (no el contratista) — el
// proveedor es la contraparte de esas compras (C2: órdenes de compra, aún
// por construir). Doc id = identificación NORMALIZADA (regla de negocio: sin
// duplicados por el mismo NIT/CC/CE, ver `normalizarIdentificacion`).
//
// Identidad + rut_url son visibles a los operativos con acceso SIGP (C2 los
// necesita para elegir proveedor); lo BANCARIO vive en la subcolección
// privada `proveedores/{id}/privado/datos_bancarios`, solo para
// gerencia_administrativa/admin — mismo principio de separación que la
// proyección `verificaciones_sst` del Bloque 3a administrativo.
import type { Timestamp } from 'firebase/firestore'

export interface ContactoProveedor {
  nombre: string
  telefono: string
  correo: string
}

/** Documento principal de la colección `proveedores` (doc id = identificación normalizada). */
export interface Proveedor {
  id: string
  identificacion: string
  tipo_identificacion: 'nit' | 'cc' | 'ce'
  tipo_persona: 'natural' | 'juridica'
  razon_social: string
  rut_url: string
  contacto: ContactoProveedor
  estado: 'activo' | 'inactivo'
  creado_por: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

/** Subcolección privada `proveedores/{id}/privado/datos_bancarios`. */
export interface DatosBancariosProveedor {
  banco: string
  tipo_cuenta: 'ahorros' | 'corriente'
  numero_cuenta: string
  certificacion_bancaria_url: string
  actualizado_por: string
  fecha_actualizacion: Timestamp
}

/** Semilla de autocompletado de contactos (colección `contactos_lookup`, solo lectura). */
export interface ContactoLookup {
  id: string
  nombre: string
  correo: string
}

// ── Constantes con labels ──────────────────────────────────────────────────

export const TIPOS_IDENTIFICACION = ['nit', 'cc', 'ce'] as const
export type TipoIdentificacion = (typeof TIPOS_IDENTIFICACION)[number]
export const TIPO_IDENTIFICACION_LABEL: Record<TipoIdentificacion, string> = {
  nit: 'NIT',
  cc: 'Cédula de ciudadanía',
  ce: 'Cédula de extranjería',
}

export const TIPOS_PERSONA = ['natural', 'juridica'] as const
export type TipoPersona = (typeof TIPOS_PERSONA)[number]
export const TIPO_PERSONA_LABEL: Record<TipoPersona, string> = {
  natural: 'Persona natural',
  juridica: 'Persona jurídica',
}

export const TIPOS_CUENTA = ['ahorros', 'corriente'] as const
export type TipoCuenta = (typeof TIPOS_CUENTA)[number]
export const TIPO_CUENTA_LABEL: Record<TipoCuenta, string> = {
  ahorros: 'Ahorros',
  corriente: 'Corriente',
}

export const ESTADO_PROVEEDOR_LABEL: Record<Proveedor['estado'], string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
}
export const ESTADO_PROVEEDOR_COLOR: Record<Proveedor['estado'], string> = {
  activo: 'bg-emerald-100 text-emerald-800',
  inactivo: 'bg-gray-100 text-gray-700',
}

// ── Helpers puros ───────────────────────────────────────────────────────────

/**
 * Normaliza una identificación para usarla como doc id / clave de
 * comparación: quita todo lo que no sea alfanumérico y pasa a mayúsculas.
 * '900.555.111-2' → '9005551112'. Sin alfanuméricos → ''.
 */
export function normalizarIdentificacion(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/** Campos del formulario de registro que valida `validarProveedorNuevo`. */
export interface DatosProveedorNuevo {
  identificacion: string
  razon_social: string
  contactoNombre: string
  banco: string
  tipoCuenta: string
  numeroCuenta: string
  rutFile: boolean
  certFile: boolean
}

/**
 * Validación PURA del formulario de "Nuevo proveedor". Devuelve un mapa de
 * errores por campo (vacío = formulario válido). No consulta Firestore — el
 * chequeo de duplicados contra la lista cargada en UI y el respaldo
 * server-side en la transacción son responsabilidad del componente.
 */
export function validarProveedorNuevo(d: DatosProveedorNuevo): Record<string, string> {
  const errores: Record<string, string> = {}

  if (normalizarIdentificacion(d.identificacion) === '') {
    errores.identificacion = 'La identificación es obligatoria'
  }
  if (!d.razon_social.trim()) {
    errores.razon_social = 'La razón social es obligatoria'
  }
  if (!d.banco.trim()) {
    errores.banco = 'El banco es obligatorio'
  }
  if (!d.tipoCuenta.trim()) {
    errores.tipoCuenta = 'El tipo de cuenta es obligatorio'
  }
  if (!d.numeroCuenta.trim()) {
    errores.numeroCuenta = 'El número de cuenta es obligatorio'
  }
  if (!d.rutFile) {
    errores.rutFile = 'El RUT es obligatorio'
  }
  if (!d.certFile) {
    errores.certFile = 'La certificación bancaria es obligatoria'
  }

  return errores
}
