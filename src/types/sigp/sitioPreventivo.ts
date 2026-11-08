// Maestro de sitios de preventivos (07-nov-2026) — la condición jungle es del
// SITIO, no de la solicitud. Caso que lo motivó: los once de Vertis (PRY-2026-
// 080..090) registrados pesado-normal porque el cliente no informó que eran
// jungle; cuando alguien descubre que un sitio es jungle, ese hecho QUEDA y
// las solicitudes futuras lo heredan — y si alguien clasifica distinto, el
// panel lo contradice en vez de dejarlo pasar.
//
// Doc id = código del sitio del cliente NORMALIZADO (COBOL7049 → COBOL7049).
// Siembra inicial autorizada desde las 50 solicitudes históricas (50 códigos
// únicos, cero contradicciones — la ventana que no vuelve).
//
// Quién escribe: el ALTA la hace quien registra solicitudes (el primer hecho
// lo trae la captura); CAMBIAR la clasificación es de GG/GA/admin (la vía de
// corrección). El panel solo LEE para autocompletar y contradecir.
import { Timestamp } from 'firebase/firestore'
import type { TipoSitio, IntensidadPreventivo, ZonaPreventivo } from './preventivos'
import { TIPO_SITIO_LABEL, INTENSIDAD_LABEL } from './preventivos'

export interface ClasificacionSitio {
  tipo_sitio: TipoSitio
  intensidad: IntensidadPreventivo
  es_jungle: boolean
}

export interface EntradaHistorialSitio {
  fecha: Timestamp
  por: string
  por_nombre?: string
  antes: ClasificacionSitio
  despues: ClasificacionSitio
  motivo: string
}

export interface SitioPreventivo {
  /** = doc id: código del cliente normalizado (mayúsculas, sin espacios). */
  codigo: string
  nombre: string
  departamento: string
  zona: ZonaPreventivo
  clasificacion: ClasificacionSitio
  /** Quién estableció la clasificación VIGENTE y cuándo. */
  establecida_por: string
  establecida_por_nombre?: string
  fecha_establecida: Timestamp
  /** De dónde salió: siembra autorizada del histórico, el registro de una
   *  solicitud (código nuevo), o una corrección de clasificación. */
  origen: 'siembra' | 'solicitud' | 'correccion'
  solicitud_consecutivo?: string
  historial: EntradaHistorialSitio[]
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

/** Normalización del código para usarlo como doc id (y comparar): mayúsculas,
 *  sin espacios internos ni puntuación accidental. '' si no queda nada. */
export const normalizarCodigoSitio = (codigo: string): string =>
  (codigo ?? '').toUpperCase().replace(/\s+/g, '').replace(/[/\\.#$\[\]]/g, '')

export const resumenClasificacion = (c: ClasificacionSitio): string =>
  `${TIPO_SITIO_LABEL[c.tipo_sitio]} · ${INTENSIDAD_LABEL[c.intensidad]} · ${c.es_jungle ? 'Jungle' : 'No jungle'}`

/** Diferencias legibles entre lo elegido y el maestro — [] si coincide.
 *  Alimenta la advertencia de contradicción en el formulario. */
export function contradiccionesConMaestro(
  maestro: Pick<SitioPreventivo, 'clasificacion'>,
  elegida: ClasificacionSitio,
): string[] {
  const m = maestro.clasificacion
  const out: string[] = []
  if (m.tipo_sitio !== elegida.tipo_sitio)
    out.push(`tipo de sitio: el maestro dice ${TIPO_SITIO_LABEL[m.tipo_sitio]}`)
  if (m.intensidad !== elegida.intensidad)
    out.push(`intensidad: el maestro dice ${INTENSIDAD_LABEL[m.intensidad]}`)
  if (m.es_jungle !== elegida.es_jungle)
    out.push(`jungle: el maestro dice ${m.es_jungle ? 'SÍ es jungle' : 'NO es jungle'}`)
  return out
}

/** Alta del maestro al registrar una solicitud con código NUEVO — el primer
 *  hecho conocido del sitio lo trae la captura. Puro: el caller escribe. */
export function construirSitioDesdeSolicitud(args: {
  codigo: string
  nombre: string
  departamento: string
  zona: ZonaPreventivo
  clasificacion: ClasificacionSitio
  uid: string
  nombreUsuario?: string
  solicitudConsecutivo: string
  fecha: Timestamp
}): SitioPreventivo {
  return {
    codigo: normalizarCodigoSitio(args.codigo),
    nombre: args.nombre.trim(),
    departamento: args.departamento,
    zona: args.zona,
    clasificacion: args.clasificacion,
    establecida_por: args.uid,
    ...(args.nombreUsuario ? { establecida_por_nombre: args.nombreUsuario } : {}),
    fecha_establecida: args.fecha,
    origen: 'solicitud',
    solicitud_consecutivo: args.solicitudConsecutivo,
    historial: [],
    fecha_creacion: args.fecha,
  }
}

/** Patch del maestro cuando una CORRECCIÓN cambia la clasificación del sitio
 *  (GG/GA/admin). Append-only al historial; la vigente queda la nueva. */
export function patchMaestroPorCorreccion(
  maestro: SitioPreventivo,
  nueva: ClasificacionSitio,
  uid: string,
  nombreUsuario: string | undefined,
  motivo: string,
  fecha: Timestamp,
): Pick<SitioPreventivo, 'clasificacion' | 'establecida_por' | 'fecha_establecida' | 'origen' | 'historial' | 'fecha_actualizacion'> & { establecida_por_nombre?: string } {
  return {
    clasificacion: nueva,
    establecida_por: uid,
    ...(nombreUsuario ? { establecida_por_nombre: nombreUsuario } : {}),
    fecha_establecida: fecha,
    origen: 'correccion',
    historial: [...(maestro.historial ?? []), {
      fecha, por: uid, ...(nombreUsuario ? { por_nombre: nombreUsuario } : {}),
      antes: maestro.clasificacion, despues: nueva, motivo,
    }],
    fecha_actualizacion: fecha,
  }
}
