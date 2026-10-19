// utils/sigp/autoria.ts
//
// LA LÍNEA DE TIEMPO DICE QUIÉN (19-oct-2026) — resolución del autor de una
// entrada de historial para pintarla en pantalla.
//
// Principios (mandato de Giovanny):
//  1. Lo que no se guardó NO se inventa: una entrada sin autor muestra '—'
//     (jamás se deduce del contexto ni se atribuye al dueño del proyecto).
//     Censo de prod 19-oct: las 604 entradas vivas traen autor — el '—'
//     existe como red, no como realidad.
//  2. Lo que escribe una Cloud Function dice "el sistema" — con la precisión
//     del nacimiento y los cambios de alcance: la función escribió la
//     entrada, pero la PERSONA autorizó el hecho, y ese dato está guardado
//     (`creado_por` del proyecto / `aprobado_por` del cambio). El rótulo
//     "el sistema — al aprobar COT-X (Nombre)" no miente sobre quién
//     escribió: dice quién autorizó. Si el dato no existe o no resuelve,
//     "el sistema" a secas.
//  3. `por_nombre` (denormalizado al escribir, patrón del módulo Tareas) GANA
//     sobre el lookup por uid: el historial guarda lo que era cierto en el
//     momento del acto — si la persona cambia de nombre en `users`, las
//     entradas viejas no se reescriben solas. Mismo criterio de los snapshots.
//     Las entradas anteriores a este bloque no lo traen y se resuelven por
//     uid contra `users` (eso no es inventar: el uid ES el autor guardado).
import type { Timestamp } from 'firebase/firestore'
import type { Proyecto, EntradaHistorialProyecto } from '../../types/sigp/proyecto'

/** uid → nombre, construido de `users` (useNombresUsuarios). */
export type MapaNombres = Record<string, string>

export const AUTOR_SISTEMA = 'el sistema'
export const AUTOR_DESCONOCIDO = '—'

/** Autor legible de una entrada cualquiera (proyecto o asignación):
 *  por_nombre congelado → 'el sistema' → lookup uid → '—'. */
export function autorDe(
  e: { por?: string; por_nombre?: string },
  nombres: MapaNombres,
): string {
  if (e.por_nombre && e.por_nombre.trim()) return e.por_nombre.trim()
  if (e.por === 'sistema') return AUTOR_SISTEMA
  if (!e.por) return AUTOR_DESCONOCIDO
  return nombres[e.por] ?? AUTOR_DESCONOCIDO
}

const millis = (t: Timestamp | undefined): number | null =>
  t && typeof t.toMillis === 'function' ? t.toMillis() : null

/** Autor de una entrada del historial del PROYECTO, con las dos precisiones
 *  de las entradas 'sistema' (agregado 1 del OK):
 *  — nacimiento (sin `de`, a 'creado'): "el sistema — al aprobar COT-X (Nombre)"
 *    desde `creado_por` (dato guardado por la CF, no deducción); preventivos
 *    dicen "al aceptar SOL-X". Sin creado_por resoluble → "el sistema".
 *  — cambio de alcance: la entrada y su registro en `cambios_alcance[]` se
 *    escriben con el MISMO Timestamp en la misma transacción de la CF — el
 *    match por fecha es exacto y recupera `aprobado_por` (dato guardado). */
export function autorEntradaProyecto(
  e: EntradaHistorialProyecto,
  p: Pick<Proyecto, 'creado_por' | 'origen' | 'cotizacion_consecutivo' | 'solicitud_consecutivo' | 'cambios_alcance'>,
  nombres: MapaNombres,
): string {
  if (e.por !== 'sistema') return autorDe(e, nombres)

  if (!e.de && e.a === 'creado') {
    const quien = p.creado_por && p.creado_por !== 'sistema' ? nombres[p.creado_por] : undefined
    if (!quien) return AUTOR_SISTEMA
    const preventivo = p.origen === 'preventivo'
    const consec = preventivo ? p.solicitud_consecutivo : p.cotizacion_consecutivo
    return `${AUTOR_SISTEMA} — al ${preventivo ? 'aceptar' : 'aprobar'}${consec ? ` ${consec}` : ''} (${quien})`
  }

  const fe = millis(e.fecha)
  const cambio = fe != null
    ? (p.cambios_alcance ?? []).find(c => millis(c.fecha) === fe)
    : undefined
  if (cambio && cambio.aprobado_por && cambio.aprobado_por !== 'sistema') {
    const quien = nombres[cambio.aprobado_por]
    if (quien) {
      return `${AUTOR_SISTEMA} — al aprobar${p.cotizacion_consecutivo ? ` ${p.cotizacion_consecutivo}` : ''} v${cambio.version} (${quien})`
    }
  }
  return AUTOR_SISTEMA
}

/** Denormaliza el nombre en una entrada RECIÉN construida (Parte 2 del
 *  bloque). El guard `e.por === uid` hace dos cosas: jamás le pone el nombre
 *  del operador a una entrada 'sistema' (p. ej. las sintetizadas legacy), y
 *  jamás toca entradas viejas de otros (el pasado queda como está — este
 *  helper solo se aplica a la entrada nueva del write en curso). */
export function conAutor<T extends { por: string }>(
  e: T,
  uid: string | undefined,
  nombre: string | undefined,
): T & { por_nombre?: string } {
  return uid && nombre && e.por === uid ? { ...e, por_nombre: nombre } : e
}
