// Validador de horario / asistencia (#3) — tipos y helper puro de apareo.
//
// `registros_horario` son EVENTOS PLANOS escritos SOLO por la CF
// registrarEventoHorario (timestamp/IP/dispositivo server-side). El par
// ingreso↔salida y los "sin salida" son INTERPRETACIÓN de lectura: se
// derivan aquí (puro, testeable) — la CF es stateless a propósito.

import type { Timestamp } from 'firebase/firestore'

// ── Registros de reloj ────────────────────────────────────────────────────────

export type TipoEventoHorario = 'ingreso' | 'salida'
export type DispositivoHorario = 'escritorio' | 'movil' | 'desconocido'

export interface RegistroHorario {
  id: string
  uid: string
  nombre: string
  rol: string
  tipo: TipoEventoHorario
  fecha: Timestamp
  ip: string
  /** true/false = juzgado contra configuracion/horario.ips_oficina;
   *  null = sin config o sin IP determinable — la UI muestra "—". */
  en_oficina: boolean | null
  dispositivo: DispositivoHorario
  user_agent?: string
}

/** Jornada derivada: un ingreso con (o sin) su salida del MISMO día local,
 *  o una salida huérfana (sin ingreso previo ese día). */
export interface JornadaDia {
  uid: string
  nombre: string
  rol: string
  /** Clave de día local YYYY-MM-DD (del primer evento de la jornada). */
  dia: string
  ingreso?: RegistroHorario
  salida?: RegistroHorario
  /** Solo cuando hay ingreso Y salida. */
  duracionMs?: number
  /** Ingreso sin salida. La UI decide el matiz: día pasado = "sin salida"
   *  (anomalía); día de hoy = "en jornada" (normal). */
  abierta: boolean
}

/** Clave de día LOCAL del navegador (la operación de NEG es un solo huso,
 *  America/Bogota; el dato crudo sigue siendo el Timestamp server). */
export function claveDia(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`
}

// ── Marca de ingreso una-vez-por-día (fix 10-ago: sesiones persistidas) ──────
// La marca vive en onAuthStateChanged con guard en localStorage; el login
// EXPLÍCITO marca siempre (Opción B). Claves por uid+día local; el valor es
// 'ok' (marcada), 'pendiente:{ts}' (CF en vuelo — centinela anti-carrera
// multi-pestaña) o ausente (marcar). Solo-tras-éxito: el fallo de la CF
// borra la clave y el próximo arranque reintenta.

export const PREFIJO_INGRESO_LS = 'sigp.horario.ingreso.'
export const PENDIENTE_INGRESO_TTL_MS = 2 * 60_000

export const claveIngresoLS = (uid: string, fecha: Date): string =>
  `${PREFIJO_INGRESO_LS}${uid}.${claveDia(fecha)}`

/** ¿Corresponde marcar ingreso según el valor guardado para HOY?
 *  null/ausente → sí · 'ok' → no · 'pendiente:{ts}' fresco (< TTL) → no
 *  (otra pestaña la tiene en vuelo) · pendiente viejo o valor corrupto → sí
 *  (mejor un posible doble —el apareo lo tolera— que un día sin marca). */
export function evaluarMarcaIngreso(valor: string | null, ahora: Date): boolean {
  if (!valor) return true
  if (valor === 'ok') return false
  const m = /^pendiente:(\d+)$/.exec(valor)
  if (m) return ahora.getTime() - Number(m[1]) > PENDIENTE_INGRESO_TTL_MS
  return true
}

/** Clave de ingreso de ESTE uid pero de otro día → podable (higiene de LS). */
export const esClaveIngresoObsoleta = (clave: string, uid: string, claveHoy: string): boolean =>
  clave.startsWith(`${PREFIJO_INGRESO_LS}${uid}.`) && clave !== claveHoy

/**
 * Aparea eventos planos en jornadas por persona + día local.
 * Reglas: cada `ingreso` abre una jornada; una `salida` cierra la última
 * jornada abierta de esa persona/día; salida sin ingreso previo = jornada
 * huérfana (solo salida); doble ingreso = dos jornadas (la primera queda
 * abierta). Devuelve las jornadas ordenadas por fecha DESC (recientes arriba).
 */
export function aparearJornadas(eventos: RegistroHorario[]): JornadaDia[] {
  const ordenados = [...eventos].sort((a, b) => a.fecha.toMillis() - b.fecha.toMillis())
  const abiertas = new Map<string, JornadaDia>()   // clave uid|dia → jornada abierta
  const jornadas: JornadaDia[] = []

  for (const ev of ordenados) {
    const dia = claveDia(ev.fecha.toDate())
    const clave = `${ev.uid}|${dia}`
    const base = { uid: ev.uid, nombre: ev.nombre, rol: ev.rol, dia }
    if (ev.tipo === 'ingreso') {
      const previa = abiertas.get(clave)
      if (previa) jornadas.push(previa)            // doble ingreso: la anterior queda abierta
      abiertas.set(clave, { ...base, ingreso: ev, abierta: true })
    } else {
      const abierta = abiertas.get(clave)
      if (abierta) {
        abierta.salida = ev
        abierta.abierta = false
        abierta.duracionMs = ev.fecha.toMillis() - (abierta.ingreso?.fecha.toMillis() ?? ev.fecha.toMillis())
        jornadas.push(abierta)
        abiertas.delete(clave)
      } else {
        jornadas.push({ ...base, salida: ev, abierta: false })   // salida huérfana
      }
    }
  }
  jornadas.push(...abiertas.values())

  // Ancla = el evento MÁS RECIENTE de la jornada (salida si existe) —
  // "recientes arriba" según la última actividad, no el ingreso.
  const ancla = (j: JornadaDia) => (j.salida ?? j.ingreso)!.fecha.toMillis()
  return jornadas.sort((a, b) => ancla(b) - ancla(a))
}

/** "7 h 35 min" — para la columna Duración. */
export function fmtDuracion(ms: number): string {
  const min = Math.round(ms / 60_000)
  const h = Math.floor(min / 60)
  return h > 0 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`
}

// ── Ausentismos ───────────────────────────────────────────────────────────────

export type TipoAusentismo = 'incapacidad' | 'permiso' | 'justificacion' | 'vacaciones' | 'otro'

export interface Ausentismo {
  id: string
  empleado_uid?: string
  empleado_nombre: string
  tipo: TipoAusentismo
  fecha_inicio: Timestamp
  fecha_fin: Timestamp
  descripcion?: string
  soporte_url: string          // OBLIGATORIO al crear (regla + UI)
  estado: 'activo' | 'anulado' // sin delete — anulación soft con motivo
  motivo_anulacion?: string
  registrado_por: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

/** Detalle médico (sub-doc privado/detalle) — dato de SALUD, solo
 *  gerencia_administrativa + admin (línea dura, decisión 07-ago). */
export interface AusentismoDetallePrivado {
  diagnostico?: string
  observaciones_medicas?: string
}

export const TIPOS_AUSENTISMO: TipoAusentismo[] = [
  'incapacidad', 'permiso', 'justificacion', 'vacaciones', 'otro',
]

export const TIPO_AUSENTISMO_LABEL: Record<TipoAusentismo, string> = {
  incapacidad: 'Incapacidad médica',
  permiso: 'Permiso',
  justificacion: 'Justificación',
  vacaciones: 'Vacaciones',
  otro: 'Otro',
}

export const TIPO_AUSENTISMO_COLOR: Record<TipoAusentismo, string> = {
  incapacidad: 'bg-rose-100 text-rose-800',
  permiso: 'bg-amber-100 text-amber-800',
  justificacion: 'bg-gray-100 text-gray-600',
  vacaciones: 'bg-emerald-100 text-emerald-800',
  otro: 'bg-gray-100 text-gray-600',
}

// ── Configuración (doc configuracion/horario) ────────────────────────────────

export interface ConfigHorario {
  /** IPs exactas o CIDRs IPv4 de la oficina (una entrada por línea en la UI). */
  ips_oficina?: string[]
  /** 'HH:mm' — dispara el recordatorio de cierre de sesión (hora local). */
  hora_fin_jornada?: string
}

/** ¿'HH:mm' válida? (para la edición inline). */
export function esHoraValida(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim())
}
