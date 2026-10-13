// Aval SST por FORMATOS FÍSICOS — modelo puro y patch builders.
//
// Cuando el cliente exige los formatos SST en papel (PRY-2026-040 y otras
// obras) no hay formularios en la app y la cola de Verificación SST queda sin
// evidencia. Esta vía permite a Gestión Integral dar el aval, pero NO como un
// clic: EXIGE el escaneo de los formatos + quién tiene el original + fecha +
// qué formatos cubre + por qué fue físico. Sin archivo no hay aval — y la
// obligatoriedad vive en la REGLA de Firestore (`verificaciones_sst`), no solo
// aquí. Este archivo es el espejo de esa regla en el cliente: el mismo
// predicado habilita el botón y valida el guardado (patrón de los builders
// del módulo — la UI no improvisa writes).
//
// La evidencia vive en `sst_gate.fisico` (decisión: mismo doc, el hasOnly ya lo
// permite, el merge de la CF sincronizarVerificacionSst jamás toca sst_gate) y
// se copia a la entrada de `historial`.
import { TIPO_LABELS } from '../formulario'
import type { AvalFisicoSst, SstGateProyecto } from './proyecto'
import type { EntradaHistorialGate } from './verificacionSst'
import type { Timestamp } from 'firebase/firestore'

/** Clave del tipo "otro" — pide texto libre para nombrar el formato propio
 *  del cliente. */
export const TIPO_FORMATO_OTRO = 'otro'

/** Opciones del multi-select: los 14 tipos de formulario de la app + 'otro'.
 *  La REGLA solo valida lista no vacía (no se acopla al catálogo: los tipos
 *  crecen con la app Flutter). */
export const OPCIONES_TIPO_FORMATO: { valor: string; etiqueta: string }[] = [
  ...Object.entries(TIPO_LABELS).map(([valor, etiqueta]) => ({ valor, etiqueta })),
  { valor: TIPO_FORMATO_OTRO, etiqueta: 'Otro (especificar)' },
]

/** Longitudes mínimas — ESPEJO de la regla. Existen para que un "x" no pase
 *  por evidencia: el aval físico es el camino que no puede ser un clic fácil. */
export const MIN_QUIEN_TIENE_ORIGINAL = 3
export const MIN_MOTIVO_FISICO = 10
export const MIN_FORMATO_OTRO = 3
/** Tope de longitud de cualquier texto libre — espejo de `textoValido` en la
 *  regla (un texto enorme, duplicado en la copia del historial, bloquearía el
 *  doc). */
export const MAX_TEXTO_AVAL = 2000
/** Antigüedad máxima de los formatos (≈ 2 años) — espejo de la regla. */
export const MAX_DIAS_ANTIGUEDAD_FORMATOS = 730

/** ¿Este gate es un aval físico completo? (badge "físico"). */
export const esAvalFisico = (gate: SstGateProyecto | undefined | null): boolean =>
  gate?.origen === 'fisico' && !!gate.fisico

export interface EntradaAvalFisico {
  /** URL de descarga del escaneo ya subido a Storage ('' = aún sin archivo). */
  soporte_url: string
  quien_tiene_original: string
  cargo?: string
  /** Fecha de los formatos (YYYY-MM-DD del input date). */
  fecha_formatos: string
  tipos_formato: string[]
  formato_otro?: string
  motivo: string
}

export type ErroresAvalFisico = Partial<Record<
  'soporte_url' | 'quien_tiene_original' | 'fecha_formatos' | 'tipos_formato' | 'formato_otro' | 'motivo',
  string
>>

/** Valida la entrada. Devuelve los errores por campo ({} = lista para
 *  avalar). `hoy` es inyectable para testear la fecha futura. */
export function validarAvalFisico(e: EntradaAvalFisico, hoy: Date = new Date()): ErroresAvalFisico {
  const err: ErroresAvalFisico = {}
  if (!e.soporte_url.trim()) err.soporte_url = 'Sube el escaneo de los formatos — sin archivo no hay aval.'
  if (e.quien_tiene_original.trim().length < MIN_QUIEN_TIENE_ORIGINAL
      || e.quien_tiene_original.length > MAX_TEXTO_AVAL) {
    err.quien_tiene_original = 'Indica quién tiene el original.'
  }
  if (!e.fecha_formatos) {
    err.fecha_formatos = 'Indica la fecha de los formatos.'
  } else if (fechaFormatosATimestampMs(e.fecha_formatos) > hoy.getTime()) {
    err.fecha_formatos = 'La fecha de los formatos no puede estar en el futuro.'
  } else if (fechaFormatosATimestampMs(e.fecha_formatos) <= hoy.getTime() - MAX_DIAS_ANTIGUEDAD_FORMATOS * 86_400_000) {
    err.fecha_formatos = 'Los formatos tienen más de 2 años — revisa la fecha.'
  }
  if (e.tipos_formato.length === 0) err.tipos_formato = 'Elige al menos un formato que cubre el aval.'
  if (e.tipos_formato.includes(TIPO_FORMATO_OTRO)
      && ((e.formato_otro ?? '').trim().length < MIN_FORMATO_OTRO || (e.formato_otro ?? '').length > MAX_TEXTO_AVAL)) {
    err.formato_otro = 'Nombra el formato ("Otro").'
  }
  if (e.motivo.trim().length < MIN_MOTIVO_FISICO || e.motivo.length > MAX_TEXTO_AVAL) {
    err.motivo = `Explica por qué fue físico (mínimo ${MIN_MOTIVO_FISICO} caracteres), ej. exigencia del cliente.`
  }
  return err
}

export const avalFisicoValido = (e: EntradaAvalFisico, hoy?: Date): boolean =>
  Object.keys(validarAvalFisico(e, hoy)).length === 0

/** Medianoche LOCAL del día elegido: nunca queda en el futuro si el día es
 *  hoy (a mediodía sí podría, y la regla exige fecha_formatos <= request.time). */
export const fechaFormatosATimestampMs = (yyyyMmDd: string): number =>
  new Date(`${yyyyMmDd}T00:00:00`).getTime()

/** Texto de la entrada de historial — también lo pinta el tooltip del badge. */
export function motivoHistorialFisico(f: Pick<AvalFisicoSst, 'quien_tiene_original' | 'motivo'>): string {
  return `Gate SST: AL DÍA por FORMATOS FÍSICOS — original en poder de ${f.quien_tiene_original.trim()}; ` +
    `motivo: ${f.motivo.trim()} (verificado por Gestión Integral con escaneo adjunto)`
}

/**
 * Builder del aval físico. null si la entrada no valida (el mismo predicado
 * que habilita el botón). No toca Firestore: devuelve el `sst_gate` y la
 * entrada de historial; el caller arma el updateDoc.
 *
 * `ahoraServidor` (serverTimestamp()) va a `sst_gate.fecha` y a
 * `fisico.fecha_registro`: la regla exige igualdad con `request.time`, así la
 * fecha del aval no se falsea desde el navegador. La copia del historial va
 * con `ahoraCliente` (un Timestamp real: serverTimestamp() no es válido
 * dentro de arrayUnion).
 */
export function patchAvalFisico<TS>(
  entrada: EntradaAvalFisico,
  uid: string,
  estadoAnterior: string,
  ahoraServidor: TS,
  ahoraCliente: Timestamp,
  fechaFormatos: Timestamp,
  hoy?: Date,
): { sst_gate: Record<string, unknown>; entradaHistorial: EntradaHistorialGate } | null {
  if (!uid || !avalFisicoValido(entrada, hoy)) return null
  const base = {
    soporte_url: entrada.soporte_url.trim(),
    quien_tiene_original: entrada.quien_tiene_original.trim(),
    ...(entrada.cargo?.trim() ? { cargo: entrada.cargo.trim() } : {}),
    fecha_formatos: fechaFormatos,
    tipos_formato: [...entrada.tipos_formato],
    ...(entrada.tipos_formato.includes(TIPO_FORMATO_OTRO) && entrada.formato_otro?.trim()
      ? { formato_otro: entrada.formato_otro.trim() } : {}),
    motivo: entrada.motivo.trim(),
    registrado_por: uid,
  }
  return {
    sst_gate: {
      estado: 'al_dia',
      verificado_por: uid,
      fecha: ahoraServidor,
      origen: 'fisico',
      fisico: { ...base, fecha_registro: ahoraServidor },
    },
    entradaHistorial: {
      de: estadoAnterior,
      a: 'al_dia',
      por: uid,
      fecha: ahoraCliente,
      motivo: motivoHistorialFisico(base),
      fisico: { ...base, fecha_registro: ahoraCliente },
    },
  }
}

/** Extensión del archivo según su tipo MIME — la regla de Firestore ancla la
 *  URL a `{uuid}.{ext}` con ext alfanumérica de 1–5 caracteres, y la de Storage
 *  solo admite estos tipos (sin SVG). null = tipo no admitido. */
export function extensionDeEscaneo(mime: string): string | null {
  switch (mime) {
    case 'application/pdf': return 'pdf'
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/heic': return 'heic'
    case 'image/heif': return 'heif'
    default: return null
  }
}

/** ¿Es seguro pintar esta URL como enlace? Solo https a Firebase Storage —
 *  `soporte_url` es texto escrito por un usuario (la regla ancla su forma, pero
 *  defensa en profundidad: jamás un `javascript:` ni un host ajeno en un href). */
export const esUrlEscaneoSegura = (url: string | undefined): boolean =>
  !!url && url.startsWith('https://firebasestorage.googleapis.com/')

/** Etiquetas legibles de los formatos que cubre el aval (para el tooltip). */
export function etiquetasFormatosAval(f: Pick<AvalFisicoSst, 'tipos_formato' | 'formato_otro'>): string[] {
  return f.tipos_formato.map(t =>
    t === TIPO_FORMATO_OTRO ? (f.formato_otro?.trim() || 'Otro') : (TIPO_LABELS[t] ?? t))
}
