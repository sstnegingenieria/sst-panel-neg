// Rastro de autoría de la habilitación de contratistas (21-sep-2026).
//
// La habilitación (campo `estado`) es el control de CALIFICACIÓN DE
// PROVEEDORES del SGI (Caracterización: responsabilidad de Gestión
// Integral; también la ejerce Gestión Administrativa) y hasta hoy no
// dejaba evidencia de quién la ejerció ni cuándo. Cada cambio de estado
// escribe una entrada en `contratistas.historial[]` (append-only vía
// arrayUnion — cero borrado físico, restricción 5.1).
//
// La entrada se construye AQUÍ (builder puro, testeable) — la UI no
// improvisa writes. Las vías del aval en reglas EXIGEN la traza
// (hasAll estado+historial, historial que crece, por == uid; salvedad
// para el respaldo).
//
// 📓 BITÁCORA (22-sep-2026): el contratista NACE INACTIVO (regla de
// create) — nadie nace avalado, así "¿quién avaló y cuándo?" siempre
// tiene respuesta. La traza rige desde esta fecha: los 11 contratistas
// existentes conservan su estado SIN registro de quién los avaló porque
// son anteriores al control — HISTORIA ACEPTADA, no se inventa
// retroactivamente (su primera entrada será el próximo toggle real).

import { Timestamp } from 'firebase/firestore'

export interface CambioEstadoContratista {
  campo: 'estado'
  de: 'activo' | 'inactivo'
  a: 'activo' | 'inactivo'
  /** uid de quien ejerció el control (evidencia; el doc de users es la fuente auditable). */
  por: string
  por_nombre: string
  por_rol: string
  fecha: Timestamp
  /** Aval POR EXCEPCIÓN (22-sep, modelo del aval de Giovanny): el titular es
   *  gestion_integral y habilita SIN salvedad; el respaldo (gerencia_general,
   *  gerencia_administrativa, admin) habilita CON salvedad obligatoria escrita
   *  — por qué no lo hizo el titular. Presente ⇔ aval por excepción; la traza
   *  distingue el aval normal del de respaldo, que es lo que un auditor
   *  quiere poder separar. La regla lo EXIGE para los roles de respaldo. */
  salvedad?: string
}

/** Entrada de historial para un cambio de estado. `fecha` se inyecta para
 *  testabilidad; en la UI es `Timestamp.now()` (arrayUnion no admite
 *  serverTimestamp dentro de elementos de array). `salvedad` solo se incluye
 *  cuando viene con texto — arrayUnion rechaza `undefined` y una salvedad
 *  vacía no es una salvedad. */
export function entradaCambioEstado(
  de: CambioEstadoContratista['de'],
  a: CambioEstadoContratista['a'],
  usuario: { uid: string; nombre?: string; rol?: string },
  fecha: Timestamp,
  salvedad?: string,
): CambioEstadoContratista {
  const e: CambioEstadoContratista = {
    campo: 'estado',
    de,
    a,
    por: usuario.uid,
    por_nombre: usuario.nombre ?? '',
    por_rol: usuario.rol ?? '',
    fecha,
  }
  if (salvedad?.trim()) e.salvedad = salvedad.trim()
  return e
}

// ── Corrección de IDENTIDAD (14-oct-2026, OK de Giovanny — cuarto permiso
// que le faltaba a GI): quien inscribe corrige. Ingrid inscribía y avalaba
// pero un nombre o NIT mal tecleado exigía pedirle la corrección a alguien
// más. Cada edición de identidad deja QUIÉN corrigió QUÉ en el mismo
// historial append-only del aval.
//
// ⚠ La CÉDULA vive en el sub-doc privado (Ley 1581, C2.1 paso 5) y el
// historial está en el DOC PÚBLICO (read: if true) — su corrección se traza
// SIN valores ("cédula actualizada"), jamás el número. El NIT es registro
// mercantil público (RUES) y se traza con valores.
export interface CorreccionIdentidadContratista {
  campo: 'identidad'
  /** "nombre: X → Y" · "nit: A → B" · "tipo: natural → juridica" ·
   *  "cédula actualizada" (sin valores) · "vínculo técnico principal actualizado". */
  cambios: string[]
  por: string
  por_nombre: string
  por_rol: string
  fecha: Timestamp
}

/** Entrada de historial para una corrección de identidad — null si nada
 *  cambió (una edición sin cambios no fabrica traza-ruido). */
export function entradaCorreccionIdentidad(
  antes: { nombre?: string; tipo?: string; nit?: string; cedula?: string; usuario_tecnico_id?: string },
  despues: { nombre?: string; tipo?: string; nit?: string; cedula?: string; usuario_tecnico_id?: string },
  usuario: { uid: string; nombre?: string; rol?: string },
  fecha: Timestamp,
): CorreccionIdentidadContratista | null {
  const cambios: string[] = []
  const pub = (campo: 'nombre' | 'tipo' | 'nit') => {
    const a = (antes[campo] ?? '').trim()
    const d = (despues[campo] ?? '').trim()
    if (a !== d) cambios.push(`${campo}: ${a || '—'} → ${d || '—'}`)
  }
  pub('nombre'); pub('tipo'); pub('nit')
  if ((antes.cedula ?? '').trim() !== (despues.cedula ?? '').trim()) cambios.push('cédula actualizada')
  if ((antes.usuario_tecnico_id ?? '') !== (despues.usuario_tecnico_id ?? '')) cambios.push('vínculo técnico principal actualizado')
  if (cambios.length === 0) return null
  return {
    campo: 'identidad',
    cambios,
    por: usuario.uid,
    por_nombre: usuario.nombre ?? '',
    por_rol: usuario.rol ?? '',
    fecha,
  }
}

/** Último cambio de estado del historial (para pintar "por X · fecha" bajo
 *  el chip). Tolerante con docs legado sin historial y con entradas de
 *  otros campos que un futuro agregue al mismo arreglo. */
export function ultimoCambioEstado(
  historial: unknown[] | undefined,
): CambioEstadoContratista | null {
  if (!historial?.length) return null
  for (let i = historial.length - 1; i >= 0; i--) {
    const h = historial[i] as Partial<CambioEstadoContratista> | null
    if (h && h.campo === 'estado' && typeof h.por === 'string') {
      return h as CambioEstadoContratista
    }
  }
  return null
}
