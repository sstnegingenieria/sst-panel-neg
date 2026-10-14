// Aval SST por FORMATOS FÍSICOS — modelo puro y patch builders.
//
// Cuando el cliente exige los formatos SST en papel (PRY-2026-040 y otras
// obras) no hay formularios en la app y la cola de Verificación SST queda sin
// evidencia. Esta vía permite a Gestión Integral dar el aval, pero NO como un
// clic: EXIGE un REGISTRO DE CUSTODIA — quién guarda el archivo físico, dónde,
// qué formatos cubre, de qué fecha, por qué fue físico — y la DECLARACIÓN
// expresa de que los originales están archivados y disponibles para auditoría.
//
// Los formatos NO se escanean (Ingrid, GI: pueden ser 100+ hojas): el panel
// no duplica el archivo físico, guarda la constancia de su custodia y quién da
// fe (principio §5.10 del CLAUDE.md del SIGP: cuando el custodio del documento
// es otro, guardamos la constancia, no una segunda copia).
//
// La obligatoriedad vive en la REGLA de Firestore (`verificaciones_sst`), no
// solo aquí. Este archivo es su espejo en el cliente: el mismo predicado
// habilita el botón y valida el guardado (patrón de los builders del módulo —
// la UI no improvisa writes). La evidencia vive en `sst_gate.fisico` (mismo
// doc; el merge de la CF sincronizarVerificacionSst jamás toca sst_gate) y se
// copia a la entrada de `historial`.
import { TIPO_LABELS } from '../formulario'
import type { AvalFisicoSst, SstGateProyecto } from './proyecto'
import type { EntradaHistorialGate, VerificacionSst } from './verificacionSst'
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
export const MIN_RESPONSABLE_ARCHIVO = 3
/** Ubicación LOCALIZABLE: mínimo 10 caracteres para desalentar lo genérico
 *  ("archivo", "oficina"). La regla no puede exigir "específico" — es guía +
 *  longitud mínima (espejo de la regla). */
export const MIN_UBICACION = 10
export const PLACEHOLDER_UBICACION = 'ej. Archivador 3, carpeta Claro 2026'
export const AYUDA_UBICACION = 'Indica un lugar localizable: mueble, carpeta, año.'
export const MIN_MOTIVO_FISICO = 10
export const MIN_FORMATO_OTRO = 3
/** Tope de longitud de cualquier texto libre — espejo de `textoValido` en la
 *  regla (un texto enorme, duplicado en la copia del historial, bloquearía el
 *  doc). */
export const MAX_TEXTO_AVAL = 2000
/** Antigüedad máxima de los formatos (≈ 2 años) — espejo de la regla. */
export const MAX_DIAS_ANTIGUEDAD_FORMATOS = 730
/** Máximo de formatos distintos que cubre un aval — espejo de la regla. */
export const MAX_TIPOS_FORMATO = 20

/**
 * Declaración que firma (marca) quien avala — VERSIONADA. El texto queda ligado
 * a su versión: cambiar una sola palabra de un texto ya publicado obliga a
 * agregar una versión NUEVA (y no tocar la anterior), porque los avales ya
 * registrados guardan la `declaracion_version` que aceptaron. Un test fija el
 * texto de cada versión publicada. La regla de Firestore valida que la versión
 * sea una de las conocidas (`f.declaracion_version in [...]`).
 */
export const VERSION_DECLARACION_VIGENTE = 'SST-FIS-v1'
export const TEXTOS_DECLARACION: Record<string, string> = {
  'SST-FIS-v1':
    'Declaro que los formatos SST originales están archivados en la ubicación indicada y disponibles para auditoría.',
}
export const VERSIONES_DECLARACION = Object.keys(TEXTOS_DECLARACION)
/** Texto de la versión vigente (el que ve quien avala hoy). */
export const TEXTO_DECLARACION = TEXTOS_DECLARACION[VERSION_DECLARACION_VIGENTE]
/** Texto de una versión ya registrada (para el rastro de auditoría). */
export const textoDeclaracionDe = (version: string | undefined): string =>
  (version && TEXTOS_DECLARACION[version]) || `(texto de la versión ${version ?? 'desconocida'} no disponible en esta app)`

/** Leyenda del badge: lo que el aval físico afirma. */
export const LEYENDA_AVAL_FISICO = 'originales en archivo, disponibles para auditoría'

/** ¿Este gate es un aval físico completo? (badge "físico"). */
export const esAvalFisico = (gate: SstGateProyecto | undefined | null): boolean =>
  gate?.origen === 'fisico' && !!gate.fisico

export interface EntradaAvalFisico {
  /** Quién custodia el archivo físico. */
  responsable_archivo: string
  /** Dónde está archivado (oficina, carpeta, bodega…). */
  ubicacion: string
  /** Fecha de los formatos (YYYY-MM-DD del input date). */
  fecha_formatos: string
  tipos_formato: string[]
  formato_otro?: string
  motivo: string
  /** La casilla de declaración — debe estar marcada. */
  declaracion: boolean
}

export type ErroresAvalFisico = Partial<Record<
  'responsable_archivo' | 'ubicacion' | 'fecha_formatos' | 'tipos_formato' | 'formato_otro' | 'motivo' | 'declaracion',
  string
>>

/** Medianoche LOCAL del día elegido: nunca queda en el futuro si el día es
 *  hoy (a mediodía sí podría, y la regla exige fecha_formatos <= request.time). */
export const fechaFormatosATimestampMs = (yyyyMmDd: string): number =>
  new Date(`${yyyyMmDd}T00:00:00`).getTime()

/** Valida la entrada. Devuelve los errores por campo ({} = lista para
 *  avalar). `hoy` es inyectable para testear la fecha futura. */
export function validarAvalFisico(e: EntradaAvalFisico, hoy: Date = new Date()): ErroresAvalFisico {
  const err: ErroresAvalFisico = {}
  if (e.responsable_archivo.trim().length < MIN_RESPONSABLE_ARCHIVO || e.responsable_archivo.length > MAX_TEXTO_AVAL) {
    err.responsable_archivo = 'Indica quién es el responsable del archivo físico.'
  }
  if (e.ubicacion.trim().length < MIN_UBICACION || e.ubicacion.length > MAX_TEXTO_AVAL) {
    err.ubicacion = `Indica un lugar localizable (mueble, carpeta, año) — mínimo ${MIN_UBICACION} caracteres.`
  }
  if (!e.fecha_formatos) {
    err.fecha_formatos = 'Indica la fecha de los formatos.'
  } else if (fechaFormatosATimestampMs(e.fecha_formatos) > hoy.getTime()) {
    err.fecha_formatos = 'La fecha de los formatos no puede estar en el futuro.'
  } else if (fechaFormatosATimestampMs(e.fecha_formatos) <= hoy.getTime() - MAX_DIAS_ANTIGUEDAD_FORMATOS * 86_400_000) {
    err.fecha_formatos = 'Los formatos tienen más de 2 años — revisa la fecha.'
  }
  if (e.tipos_formato.length === 0) err.tipos_formato = 'Elige al menos un formato que cubre el aval.'
  else if (e.tipos_formato.length > MAX_TIPOS_FORMATO) err.tipos_formato = `Máximo ${MAX_TIPOS_FORMATO} formatos por aval.`
  if (e.tipos_formato.includes(TIPO_FORMATO_OTRO)
      && ((e.formato_otro ?? '').trim().length < MIN_FORMATO_OTRO || (e.formato_otro ?? '').length > MAX_TEXTO_AVAL)) {
    err.formato_otro = 'Nombra el formato ("Otro").'
  }
  if (e.motivo.trim().length < MIN_MOTIVO_FISICO || e.motivo.length > MAX_TEXTO_AVAL) {
    err.motivo = `Explica por qué fue físico (mínimo ${MIN_MOTIVO_FISICO} caracteres), ej. exigencia del cliente.`
  }
  if (e.declaracion !== true) err.declaracion = 'Marca la declaración para poder avalar.'
  return err
}

export const avalFisicoValido = (e: EntradaAvalFisico, hoy?: Date): boolean =>
  Object.keys(validarAvalFisico(e, hoy)).length === 0

/** Recorta un texto libre para la LEYENDA del historial (el dato completo ya
 *  viaja en la copia `fisico`; la regla limita el motivo de la entrada a 5000). */
const corto = (t: string, max = 300): string => {
  const x = t.trim()
  return x.length > max ? `${x.slice(0, max)}…` : x
}

/** Texto de la entrada de historial — también lo pinta el tooltip del badge. */
export function motivoHistorialFisico(
  f: Pick<AvalFisicoSst, 'responsable_archivo' | 'ubicacion' | 'motivo'>,
): string {
  return `Gate SST: AL DÍA por FORMATOS FÍSICOS — archivo a cargo de ${corto(f.responsable_archivo)} ` +
    `(${corto(f.ubicacion)}); motivo: ${corto(f.motivo)} ` +
    `(declaración de Gestión Integral: ${LEYENDA_AVAL_FISICO})`
}

/**
 * Builder del aval físico. null si la entrada no valida (el mismo predicado
 * que habilita el botón). No toca Firestore: devuelve el `sst_gate` y la
 * entrada de historial; el caller arma el updateDoc.
 *
 * Registra QUIÉN declara de forma legible y auténtica: `declaracion_email` es el
 * correo del token de la sesión (no tecleado) y `declaracion_version` liga el
 * texto aceptado.
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
  /** Correo de la sesión (`auth.currentUser.email`): la regla exige que sea el del token. */
  email: string,
  estadoAnterior: string,
  ahoraServidor: TS,
  ahoraCliente: Timestamp,
  fechaFormatos: Timestamp,
  hoy?: Date,
): { sst_gate: Record<string, unknown>; entradaHistorial: EntradaHistorialGate } | null {
  if (!uid || !email.trim() || !avalFisicoValido(entrada, hoy)) return null
  const base = {
    responsable_archivo: entrada.responsable_archivo.trim(),
    ubicacion: entrada.ubicacion.trim(),
    fecha_formatos: fechaFormatos,
    tipos_formato: [...entrada.tipos_formato],
    ...(entrada.tipos_formato.includes(TIPO_FORMATO_OTRO) && entrada.formato_otro?.trim()
      ? { formato_otro: entrada.formato_otro.trim() } : {}),
    motivo: entrada.motivo.trim(),
    declaracion: true as const,
    declaracion_version: VERSION_DECLARACION_VIGENTE,
    declaracion_email: email.trim(),
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

/** Etiquetas legibles de los formatos que cubre el aval (para el tooltip). */
export function etiquetasFormatosAval(f: Pick<AvalFisicoSst, 'tipos_formato' | 'formato_otro'>): string[] {
  return f.tipos_formato.map(t =>
    t === TIPO_FORMATO_OTRO ? (f.formato_otro?.trim() || 'Otro') : (TIPO_LABELS[t] ?? t))
}

/** Resumen de la custodia para tooltips / liquidación. */
export function resumenCustodiaFisica(
  f: Pick<AvalFisicoSst, 'responsable_archivo' | 'ubicacion' | 'tipos_formato' | 'formato_otro' | 'motivo'>,
): string {
  return `Responsable del archivo: ${f.responsable_archivo} · Ubicación: ${f.ubicacion} · ` +
    `Formatos: ${etiquetasFormatosAval(f).join(', ')} · Motivo: ${f.motivo}`
}

// ── Lista de auditoría: avales "en físico" ─────────────────────────────────

/** Columnas de la lista que pide el auditor (en este orden). */
export const COLUMNAS_AVALES_FISICOS = [
  'Proyecto', 'Cliente', 'Sitio', 'Contratista', 'Fecha de los formatos',
  'Responsable del archivo', 'Ubicación', 'Formatos', 'Motivo',
] as const

const fechaCorta = (t: { toDate?: () => Date } | undefined): string => {
  const d = t?.toDate?.()
  if (!d) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** ¿Hoy está avalado en físico? (el gate VIGENTE es físico: si otro avalista
 *  lo sobrescribió por la rama app, el aval físico ya no está vigente — sigue
 *  en el rastro). */
export const estaAvaladoEnFisico = (v: Pick<VerificacionSst, 'sst_gate'>): boolean => esAvalFisico(v.sst_gate)

/** Fila de exportación de UN aval físico vigente; null si no lo es. */
export function filaAvalFisico(v: VerificacionSst): Record<(typeof COLUMNAS_AVALES_FISICOS)[number], string> | null {
  if (!estaAvaladoEnFisico(v) || !v.sst_gate?.fisico) return null
  const f = v.sst_gate.fisico
  return {
    'Proyecto': v.consecutivo ?? '',
    'Cliente': (v.cliente_nombre ?? '').trim(),
    'Sitio': v.nombre_sitio ?? '',
    'Contratista': v.contratista_nombre ?? '',
    'Fecha de los formatos': fechaCorta(f.fecha_formatos),
    'Responsable del archivo': f.responsable_archivo,
    'Ubicación': f.ubicacion,
    'Formatos': etiquetasFormatosAval(f).join(', '),
    'Motivo': f.motivo,
  }
}

/** Filas de la lista de auditoría (solo avales físicos vigentes), ordenadas
 *  por cliente y proyecto. */
export function filasAvalesFisicos(vs: VerificacionSst[]) {
  return vs
    .map(v => filaAvalFisico(v))
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .sort((a, b) => a.Cliente.localeCompare(b.Cliente, 'es') || a.Proyecto.localeCompare(b.Proyecto, 'es'))
}

// ── Rastro de custodia: la declaración NUNCA se edita en sitio ──────────────

export interface EntradaRastroCustodia {
  fisico: AvalFisicoSst
  /** uid de quien registró */
  por: string
  /** fecha de la entrada del historial (hora del cliente) */
  fecha: Timestamp
  /** true = es la declaración que sostiene el gate HOY; false = anterior. */
  vigente: boolean
}

/**
 * Rastro de las declaraciones de custodia de un proyecto, la más reciente
 * primero. Una corrección es un aval físico NUEVO (nueva entrada del historial
 * con su propia fecha_registro); la anterior permanece. "Vigente" = la última
 * entrada física, SOLO si el gate sigue siendo físico: si otro avalista lo
 * sobrescribió por la rama app, todas quedan como anteriores.
 */
export function rastroCustodia(
  v: Pick<VerificacionSst, 'sst_gate' | 'historial'>,
): EntradaRastroCustodia[] {
  const fisicas = (v.historial ?? []).filter(h => !!h.fisico)
  const gateFisico = esAvalFisico(v.sst_gate)
  return fisicas
    .map((h, i) => ({
      fisico: h.fisico as AvalFisicoSst,
      por: h.por,
      fecha: h.fecha,
      vigente: gateFisico && i === fisicas.length - 1,
    }))
    .reverse()
}
