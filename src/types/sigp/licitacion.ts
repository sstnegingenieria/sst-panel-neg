/**
 * Módulo Licitaciones (sub-bloque 1.1) — modelo, máquina de estados y patch
 * builders puros. CERO Firestore, CERO React, CERO UI: este archivo describe
 * la forma del documento y las transiciones legales, nada más.
 *
 * Patrón calcado de `types/sigp/tarea.ts`: los helpers de patch son PUROS —
 * validan la transición y devuelven el objeto a persistir, o `null` si el
 * movimiento no es legal. La UI (bloque posterior) persiste EXACTAMENTE lo
 * que devuelven; no improvisa writes.
 *
 * LAS CINCO INVARIANTES (cada una con su validador puro y su test):
 *  1. `estado === 'descartada'` <=> `motivo_descarte !== null`.
 *  2. `activa === false` <=> estado inactivo (terminales + descartada).
 *     DERIVADA — la mantienen los builders, nunca se escribe a mano.
 *  3. PORTERO: con `semaforo === 'rojo'` no se avanza a en_preparacion /
 *     manifestada / presentada salvo que exista `override_manual`.
 *  4. `override_manual !== null` implica `por` y `motivo` no vacíos y
 *     `semaforo_anterior` igual al valor real previo al override.
 *  5. `semaforo_version` NO se muta como efecto colateral de un recálculo:
 *     cambiar de criterio es un acto explícito que declara la versión que
 *     se está dejando atrás.
 *  6. Los estados de COMPROMISO y de RESULTADO exigen `consecutivo`; los tres
 *     estados de triage (detectada, en_evaluacion, descartada) lo admiten
 *     vacío. Implicación en un solo sentido — ver ESTADOS_EXIGEN_CONSECUTIVO.
 *     NO aplica a los registros `migrado` (ver el campo).
 *  7. `consecutivo` es inmutable una vez asignado. La única transición legal
 *     es `'' -> 'LIC-AAAA-NNNN'`, y ocurre UNA vez.
 */
import type { Timestamp } from 'firebase/firestore'

export type { Timestamp }

// ── Vocabularios cerrados ────────────────────────────────────────────────────

export const MODALIDADES_LICITACION = [
  'minima_cuantia', 'menor_cuantia', 'licitacion_publica',
  'seleccion_abreviada', 'regimen_especial', 'otra',
] as const
export type ModalidadLicitacion = typeof MODALIDADES_LICITACION[number]

export const ORIGENES_LICITACION = ['secop_ii', 'secop_i', 'manual'] as const
export type OrigenLicitacion = typeof ORIGENES_LICITACION[number]

export const SEMAFOROS = ['verde', 'amarillo', 'rojo'] as const
export type Semaforo = typeof SEMAFOROS[number]

export const ESTADOS_LICITACION = [
  'detectada', 'en_evaluacion', 'descartada', 'en_preparacion',
  'manifestada', 'presentada', 'adjudicada', 'perdida',
  'rechazada', 'revocada', 'desierta',
] as const
export type EstadoLicitacion = typeof ESTADOS_LICITACION[number]

export const MOTIVOS_DESCARTE = [
  'SORTEO', 'LIMITACION_MIPYME', 'EXPERIENCIA', 'INDICADORES',
  'BAJO_PRESUPUESTO', 'UBICACION', 'CAPACIDAD', 'OTRO',
] as const
export type MotivoDescarte = typeof MOTIVOS_DESCARTE[number]

export const MOTIVOS_SEMAFORO = [
  'MODALIDAD_SIN_HISTORIAL', 'SORTEO', 'LIMITACION_MIPYME', 'REQUIERE_LECTURA',
] as const
export type MotivoSemaforo = typeof MOTIVOS_SEMAFORO[number]

// ── Sub-tipos ────────────────────────────────────────────────────────────────

/** Entidad contratante. `orden` y geografía llegan de SECOP tal cual. */
export interface EntidadLicitacion {
  nombre: string
  nit: string
  orden: string
  departamento: string
  ciudad: string
}

/** Hitos del proceso. `null` es información, no ausencia de dato: un
 *  `sorteo: null` significa "este proceso no tiene sorteo de consolidación",
 *  y el motor del semáforo lo lee así. */
export interface CronogramaLicitacion {
  publicacion: Timestamp | null
  manifestacion: Timestamp | null
  sorteo: Timestamp | null
  cierre: Timestamp | null
  adjudicacion: Timestamp | null
}

/** Anulación manual del semáforo (invariante 4). Registra QUIÉN, CUÁNDO,
 *  POR QUÉ y QUÉ valor había antes — sin las cuatro cosas no es auditable. */
export interface OverrideSemaforo {
  por: string
  en: Timestamp
  motivo: string
  semaforo_anterior: Semaforo
}

/** Ganador del proceso (solo con resultado conocido). */
export interface GanadorLicitacion {
  nombre: string
  nit: string
}

// ── Documento de la colección `licitaciones` ─────────────────────────────────

export interface Licitacion {
  /**
   * LIC-AAAA-NNNN (padding 4, serie anual). DIFERIDO: nace en `''` y se quema
   * al MATERIALIZAR — al entrar en `en_preparacion`, que es donde NEG se
   * compromete con horas de trabajo. Un proceso detectado en SECOP y
   * descartado a los dos minutos no gasta número (contigüidad ISO, misma
   * costumbre que SOL/VIS/COT/PEA).
   *
   * Si ya se quemó y luego el proceso se descarta, el número SE CONSERVA: el
   * hueco en la serie es legítimo y trazable, igual que en SOL.
   *
   * Invariantes 6 y 7 — ver `consecutivoConsistente` y
   * `transicionConsecutivoValida`.
   */
  consecutivo: string
  numero_proceso: string
  id_secop: string | null
  origen: OrigenLicitacion
  url_proceso: string
  entidad: EntidadLicitacion
  objeto: string
  categoria_unspsc: string | null
  modalidad: ModalidadLicitacion
  presupuesto_oficial: number
  lotes: number
  cronograma: CronogramaLicitacion

  // ── Semáforo: valor, por qué, con qué criterio y cuándo ──
  semaforo: Semaforo
  semaforo_motivos: MotivoSemaforo[]
  /** Versión del CRITERIO que produjo este semáforo (SEMAFORO_VERSION del
   *  motor). Invariante 5: no se mueve por efecto colateral. */
  semaforo_version: string
  semaforo_calculado_en: Timestamp
  override_manual: OverrideSemaforo | null

  // ── Estado del proceso ──
  estado: EstadoLicitacion
  motivo_descarte: MotivoDescarte | null

  // ── Resultado (se conoce tarde; null mientras no haya dato) ──
  oferta_neg: number | null
  oferta_ganador: number | null
  ganador: GanadorLicitacion | null
  manifestaciones: number | null
  ofertas_recibidas: number | null

  /**
   * Registro HISTÓRICO importado del registro CM-FT-CPG-26 (sub-bloque 1.3):
   * ~350 procesos de 2022, 2024, 2025 y 2026 que NEG siguió antes de que
   * existiera el módulo. Entran con `origen: 'manual'` y `consecutivo: ''`.
   *
   * La INVARIANTE 6 no aplica cuando esto es `true`: no se retro-numera una
   * serie ISO que no existió. Un Listado Maestro con números inventados hacia
   * atrás es peor que uno que empieza hoy — la serie LIC arranca con la
   * primera licitación nueva.
   *
   * Inmutable: un histórico no se convierte en numerado ni al revés.
   */
  migrado: boolean

  /**
   * Decisión MANUAL sobre la capacidad semanal (1.4). `null` = la licitación
   * cae donde la deje el orden por fecha de cierre (lo normal).
   *
   * La bandeja solo tiene sitio para `capacidad_semanal` activas. Meter una
   * que quedó fuera obliga a sacar otra — y el intercambio queda escrito en
   * LOS DOS documentos (`intercambio_con` apunta al otro), porque "por qué
   * esta y no aquella" es exactamente la pregunta que nadie recuerda tres
   * meses después.
   */
  capacidad_manual: {
    en_capacidad: boolean
    por: string
    en: Timestamp
    motivo: string
    /** Id de la licitación con la que se intercambió el cupo. */
    intercambio_con: string | null
  } | null

  // ── Trazabilidad ──
  responsable_uid: string
  creado_por: string
  creado_en: Timestamp
  actualizado_por: string
  actualizado_en: Timestamp
  /** DERIVADA del estado (invariante 2) — la mantienen los builders. */
  activa: boolean
}

// ── Etiquetas (datos puros; los colores son cosa de la UI, no de aquí) ──────

export const MODALIDAD_LICITACION_LABEL: Record<ModalidadLicitacion, string> = {
  minima_cuantia: 'Mínima cuantía',
  menor_cuantia: 'Menor cuantía',
  licitacion_publica: 'Licitación pública',
  seleccion_abreviada: 'Selección abreviada',
  regimen_especial: 'Régimen especial',
  otra: 'Otra',
}

export const ESTADO_LICITACION_LABEL: Record<EstadoLicitacion, string> = {
  detectada: 'Detectada',
  en_evaluacion: 'En evaluación',
  descartada: 'Descartada',
  en_preparacion: 'En preparación',
  manifestada: 'Manifestada',
  presentada: 'Presentada',
  adjudicada: 'Adjudicada',
  perdida: 'Perdida',
  rechazada: 'Rechazada',
  revocada: 'Revocada',
  desierta: 'Desierta',
}

export const MOTIVO_DESCARTE_LABEL: Record<MotivoDescarte, string> = {
  SORTEO: 'Sorteo de consolidación',
  LIMITACION_MIPYME: 'Limitación a MiPyme territorial',
  EXPERIENCIA: 'Experiencia no acreditable',
  INDICADORES: 'Indicadores financieros',
  BAJO_PRESUPUESTO: 'Presupuesto no rentable',
  UBICACION: 'Ubicación fuera de cobertura',
  CAPACIDAD: 'Capacidad operativa',
  OTRO: 'Otro',
}

export const MOTIVO_SEMAFORO_LABEL: Record<MotivoSemaforo, string> = {
  MODALIDAD_SIN_HISTORIAL: 'Modalidad sin historial de NEG',
  SORTEO: 'El proceso tiene sorteo de consolidación',
  LIMITACION_MIPYME: 'Limitación a MiPyme de otro territorio',
  REQUIERE_LECTURA: 'Requiere lectura del pliego',
}

// ── Máquina de estados ───────────────────────────────────────────────────────

/**
 * Transiciones legales SIN distinguir actor (quién puede cada una lo dirán
 * las reglas y los guards de UI, en su bloque).
 *
 * `descartada -> en_evaluacion` es la ÚNICA reapertura del sistema: descartar
 * es reversible porque se descarta con información incompleta. Los cinco
 * estados de resultado son terminales duros — un resultado no se "corrige",
 * y si el proceso revive es otro proceso.
 */
export const TRANSICIONES_LICITACION: Record<EstadoLicitacion, EstadoLicitacion[]> = {
  detectada:      ['en_evaluacion', 'descartada'],
  en_evaluacion:  ['en_preparacion', 'descartada'],
  en_preparacion: ['manifestada', 'presentada', 'descartada'],
  manifestada:    ['presentada', 'descartada', 'revocada'],
  presentada:     ['adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta'],
  descartada:     ['en_evaluacion'],
  adjudicada:     [],
  perdida:        [],
  rechazada:      [],
  revocada:       [],
  desierta:       [],
}

export function puedeTransicionarLicitacion(de: EstadoLicitacion, a: EstadoLicitacion): boolean {
  return (TRANSICIONES_LICITACION[de] ?? []).includes(a)
}

/** Terminal duro: sin salidas. `descartada` NO es terminal (se reabre). */
export const esLicitacionTerminal = (estado: EstadoLicitacion): boolean =>
  TRANSICIONES_LICITACION[estado]?.length === 0

/**
 * Estados que apagan `activa` (invariante 2): los cinco terminales MÁS
 * `descartada`. Descartada no es terminal pero tampoco está en juego — sale
 * de la bandeja de trabajo hasta que alguien la reabra.
 */
export const ESTADOS_INACTIVOS: EstadoLicitacion[] = [
  'descartada', 'adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta',
]

/** `activa` derivada del estado — fuente única para los patch builders. */
export const esLicitacionActiva = (estado: EstadoLicitacion): boolean =>
  !ESTADOS_INACTIVOS.includes(estado)

/**
 * Estados a los que el PORTERO del semáforo rojo bloquea el paso
 * (invariante 3): comprometerse con el proceso cuesta horas. Evaluar y
 * descartar siguen libres — leer para decidir no cuesta nada.
 */
export const ESTADOS_TRAS_PORTERO: EstadoLicitacion[] = [
  'en_preparacion', 'manifestada', 'presentada',
]

/**
 * Estados que EXIGEN consecutivo (invariante 6): los tres de compromiso más
 * los cinco de resultado. Complemento exacto: `detectada`, `en_evaluacion` y
 * `descartada` — los tres de triage, donde todavía no se gastó nada.
 *
 * `descartada` está FUERA a propósito y la implicación va en UN solo sentido:
 * admite el consecutivo vacío (lo normal, se descartó antes de materializar)
 * pero también admite uno asignado (se materializó y después se descartó —
 * el número se conserva).
 */
export const ESTADOS_EXIGEN_CONSECUTIVO: EstadoLicitacion[] = [
  'en_preparacion', 'manifestada', 'presentada',
  'adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta',
]

/** Formato de la serie: LIC-AAAA-NNNN con padding mínimo 4 (extensible). */
export const PATRON_CONSECUTIVO_LIC = /^LIC-\d{4}-\d{4,}$/

export function esConsecutivoLicValido(c: string): boolean {
  return PATRON_CONSECUTIVO_LIC.test(c)
}

// ── Validadores puros de las invariantes ─────────────────────────────────────

/** Invariante 1: descartada <=> motivo_descarte presente. */
export function motivoDescarteConsistente(
  estado: EstadoLicitacion, motivo: MotivoDescarte | null,
): boolean {
  return estado === 'descartada' ? motivo !== null : motivo === null
}

/** Invariante 2: activa es exactamente la negación de "estado inactivo". */
export function activaConsistente(estado: EstadoLicitacion, activa: boolean): boolean {
  return activa === esLicitacionActiva(estado)
}

/**
 * Invariante 3 (portero): ¿el semáforo deja pasar a `destino`?
 * Rojo bloquea los tres estados de compromiso; con override registrado, pasa.
 */
export function porteroPermite(
  l: Pick<Licitacion, 'semaforo' | 'override_manual'>, destino: EstadoLicitacion,
): boolean {
  if (l.semaforo !== 'rojo') return true
  if (!ESTADOS_TRAS_PORTERO.includes(destino)) return true
  return l.override_manual !== null
}

/** Invariante 4: forma mínima auditable de un override. */
export function overrideValido(o: OverrideSemaforo | null): boolean {
  if (o === null) return true
  return o.por.trim() !== '' && o.motivo.trim() !== ''
}

/**
 * Invariante 6: los estados de compromiso y resultado exigen consecutivo.
 * Implicación en UN sentido — los tres de triage no exigen nada, ni vacío ni
 * lleno (una descartada puede conservar el número que quemó).
 *
 * EXCEPCIÓN de los MIGRADOS (1.3): un histórico importado no lleva número
 * porque la serie no existía cuando ocurrió. Ver el campo `migrado`.
 */
export function consecutivoConsistente(
  estado: EstadoLicitacion, consecutivo: string, migrado = false,
): boolean {
  if (migrado) return true
  if (!ESTADOS_EXIGEN_CONSECUTIVO.includes(estado)) return true
  return consecutivo !== ''
}

/** ¿Este destino exige número PARA ESTE documento? (migrado nunca lo exige). */
export function exigeConsecutivo(
  destino: EstadoLicitacion, migrado: boolean,
): boolean {
  return !migrado && ESTADOS_EXIGEN_CONSECUTIVO.includes(destino)
}

/**
 * Invariante 7: `consecutivo` es inmutable una vez asignado. Legales solo dos
 * casos — que no cambie, o la asignación inicial desde `''` con el formato de
 * la serie. Reescribir, limpiar o asignar basura: ilegal.
 */
export function transicionConsecutivoValida(anterior: string, nuevo: string): boolean {
  if (nuevo === anterior) return true
  if (anterior !== '') return false          // reescritura o borrado
  return esConsecutivoLicValido(nuevo)       // asignación inicial
}

/** Las invariantes de forma, juntas — útil para aserciones de test. */
export function licitacionConsistente(l: Licitacion): boolean {
  return motivoDescarteConsistente(l.estado, l.motivo_descarte)
      && activaConsistente(l.estado, l.activa)
      && overrideValido(l.override_manual)
      && consecutivoConsistente(l.estado, l.consecutivo, l.migrado)
}

// ── Derivados (NO se persisten — mismo criterio que `validez_dias`) ─────────

/**
 * Oferta de NEG como % del presupuesto oficial (0–100, convención `pct` de
 * la casa: `iva_pct`, `margen`, `aiu_defaults`). `null` si falta la oferta o
 * el presupuesto no es positivo — jamás una división por cero disfrazada.
 */
export function pctNeg(l: Pick<Licitacion, 'oferta_neg' | 'presupuesto_oficial'>): number | null {
  if (l.oferta_neg === null) return null
  if (l.presupuesto_oficial <= 0) return null
  return (l.oferta_neg / l.presupuesto_oficial) * 100
}

/** Oferta ganadora como % del presupuesto oficial. Mismas guardas. */
export function pctGanador(l: Pick<Licitacion, 'oferta_ganador' | 'presupuesto_oficial'>): number | null {
  if (l.oferta_ganador === null) return null
  if (l.presupuesto_oficial <= 0) return null
  return (l.oferta_ganador / l.presupuesto_oficial) * 100
}

// ── Patch builders puros ─────────────────────────────────────────────────────
// Devuelven `null` si el movimiento no es legal desde el estado actual.
// El timestamp lo pone el caller (Timestamp.now()) para mantenerlos puros.
// Ninguno escribe `activa` a mano: siempre sale de esLicitacionActiva().

/** Quién ejecuta el movimiento (alimenta `actualizado_por`). */
export interface ActorLicitacion {
  uid: string
}

/** Campos de trazabilidad que TODO patch arrastra. */
interface SelloPatch {
  actualizado_por: string
  actualizado_en: Timestamp
}

const sello = (actor: ActorLicitacion, ahora: Timestamp): SelloPatch => ({
  actualizado_por: actor.uid,
  actualizado_en: ahora,
})

/**
 * Avance normal por la máquina de estados. NO cubre `descartada` (la dueña
 * de la invariante 1 es `patchDescartarLicitacion`) ni la reapertura desde
 * descartada (`patchReabrirLicitacion`) — cada invariante tiene un solo
 * dueño, así no hay dos caminos que puedan divergir.
 *
 * Aplica el PORTERO (invariante 3) antes que nada.
 *
 * CONSECUTIVO (invariantes 6 y 7): al avanzar a un estado que lo exige y la
 * licitación todavía no lo tiene, hay que pasarlo en `opciones.consecutivo` y
 * viaja EN EL MISMO PATCH — nunca en una escritura aparte, o existiría un
 * instante con el documento en `en_preparacion` sin número. El caller lo
 * obtiene de la CF `generarConsecutivo('LIC')` justo antes.
 */
export function patchAvanzarLicitacion(
  l: Licitacion, destino: EstadoLicitacion, actor: ActorLicitacion, ahora: Timestamp,
  opciones?: { consecutivo?: string },
) {
  if (destino === 'descartada') return null          // -> patchDescartarLicitacion
  if (l.estado === 'descartada') return null         // -> patchReabrirLicitacion
  if (!puedeTransicionarLicitacion(l.estado, destino)) return null
  if (!porteroPermite(l, destino)) return null       // invariante 3

  const propuesto = opciones?.consecutivo
  const yaTiene = l.consecutivo !== ''
  const exige = exigeConsecutivo(destino, l.migrado)

  // Invariante 7: si ya tiene número, nadie lo reescribe — ni pasando el mismo.
  if (propuesto !== undefined && yaTiene) return null
  // Fuera de los estados que lo exigen no se quema número (contigüidad ISO).
  if (propuesto !== undefined && !exige) return null
  // Invariante 6: el destino lo exige y no hay de dónde sacarlo.
  if (exige && !yaTiene && propuesto === undefined) return null
  // Formato de la serie (invariante 7, asignación inicial).
  if (propuesto !== undefined && !esConsecutivoLicValido(propuesto)) return null

  return {
    estado: destino,
    activa: esLicitacionActiva(destino),             // invariante 2
    motivo_descarte: null,                           // invariante 1
    // Solo aparece en la asignación inicial; si ya lo tenía, ni se toca.
    ...(propuesto !== undefined ? { consecutivo: propuesto } : {}),
    ...sello(actor, ahora),
  }
}

/**
 * Descarte con motivo OBLIGATORIO (invariante 1). Legal desde cualquier
 * estado que liste `descartada` como salida; el portero no aplica —
 * descartar nunca está bloqueado.
 */
export function patchDescartarLicitacion(
  l: Licitacion, actor: ActorLicitacion, ahora: Timestamp, motivo: MotivoDescarte,
) {
  if (!puedeTransicionarLicitacion(l.estado, 'descartada')) return null
  if (!MOTIVOS_DESCARTE.includes(motivo)) return null
  return {
    estado: 'descartada' as EstadoLicitacion,
    activa: esLicitacionActiva('descartada'),        // false, invariante 2
    motivo_descarte: motivo,                         // invariante 1
    ...sello(actor, ahora),
  }
}

/**
 * Reapertura — la única del sistema. Vuelve a `en_evaluacion` y LIMPIA el
 * motivo de descarte (invariante 1: fuera de descartada, motivo === null).
 */
export function patchReabrirLicitacion(
  l: Licitacion, actor: ActorLicitacion, ahora: Timestamp,
) {
  if (l.estado !== 'descartada') return null
  return {
    estado: 'en_evaluacion' as EstadoLicitacion,
    activa: esLicitacionActiva('en_evaluacion'),     // true, invariante 2
    motivo_descarte: null,                           // invariante 1
    ...sello(actor, ahora),
  }
}

/**
 * Override manual del semáforo (invariante 4). `semaforo_anterior` NO lo
 * elige el caller: sale del documento, así no se puede falsear. Exige `por`
 * y `motivo` no vacíos.
 *
 * Un override que MANTIENE el rojo es legítimo y es el caso central del
 * portero: "sé que está en rojo, entro igual y queda escrito por qué".
 */
export function patchOverrideSemaforo(
  l: Licitacion, actor: ActorLicitacion, ahora: Timestamp,
  destino: { semaforo: Semaforo; motivo: string },
) {
  if (!actor.uid.trim()) return null
  if (!destino.motivo.trim()) return null
  if (!SEMAFOROS.includes(destino.semaforo)) return null
  const override: OverrideSemaforo = {
    por: actor.uid,
    en: ahora,
    motivo: destino.motivo.trim(),
    semaforo_anterior: l.semaforo,                   // valor real previo
  }
  return {
    semaforo: destino.semaforo,
    override_manual: override,
    ...sello(actor, ahora),
  }
}

/**
 * CAPTURA OBLIGATORIA AL PRESENTAR (1.4).
 *
 * `presentada` es el único momento en que estos tres datos existen y alguien
 * los tiene a la vista. Si no se piden acá, no se piden nunca — y sin
 * `manifestaciones` no hay `probabilidadSorteo`, sin `ofertas_recibidas` no
 * hay medición de competencia (la hipótesis de v1.1 del registro de
 * versiones), y sin `oferta_neg` no hay `pctNeg`.
 */
export interface DatosPresentacion {
  oferta_neg: number
  manifestaciones: number
  ofertas_recibidas: number
}

/** ¿Están los tres datos y son números sanos? */
export function datosPresentacionCompletos(d: Partial<DatosPresentacion>): boolean {
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  return ok(d.oferta_neg) && ok(d.manifestaciones) && ok(d.ofertas_recibidas)
}

/**
 * Transición a `presentada` CON la captura. Sin los tres datos devuelve
 * `null` — el botón de la UI se deshabilita con el mismo predicado, así que
 * la regla vive en un solo lugar.
 */
export function patchPresentarLicitacion(
  l: Licitacion, actor: ActorLicitacion, ahora: Timestamp,
  datos: Partial<DatosPresentacion>,
) {
  if (!puedeTransicionarLicitacion(l.estado, 'presentada')) return null
  if (!porteroPermite(l, 'presentada')) return null
  if (!datosPresentacionCompletos(datos)) return null
  // `presentada` exige consecutivo (invariante 6): debe venir de en_preparacion
  // o manifestada, que ya lo tienen. Un migrado está exento.
  if (exigeConsecutivo('presentada', l.migrado) && l.consecutivo === '') return null

  return {
    estado: 'presentada' as EstadoLicitacion,
    activa: esLicitacionActiva('presentada'),
    motivo_descarte: null,
    oferta_neg: datos.oferta_neg!,
    manifestaciones: datos.manifestaciones!,
    ofertas_recibidas: datos.ofertas_recibidas!,
    ...sello(actor, ahora),
  }
}

/** Cierre con resultado conocido: exige quién ganó y con cuánto. */
export interface DatosResultado {
  oferta_ganador: number
  ganador: GanadorLicitacion
}

export function datosResultadoCompletos(d: Partial<DatosResultado>): boolean {
  const monto = typeof d.oferta_ganador === 'number'
    && Number.isFinite(d.oferta_ganador) && d.oferta_ganador >= 0
  return monto && !!d.ganador && d.ganador.nombre.trim() !== ''
}

/**
 * Cierre en `adjudicada` o `perdida`. Ambos exigen saber quién ganó y con
 * cuánto — incluso el propio: sin `oferta_ganador` no hay `pctGanador`, y sin
 * eso el histórico no sirve para calibrar nada.
 *
 * Los otros tres terminales (rechazada, revocada, desierta) NO pasan por acá:
 * en ellos no hubo ganador que registrar. Van por `patchAvanzarLicitacion`.
 */
export function patchCerrarConResultado(
  l: Licitacion, destino: 'adjudicada' | 'perdida',
  actor: ActorLicitacion, ahora: Timestamp, datos: Partial<DatosResultado>,
) {
  if (!puedeTransicionarLicitacion(l.estado, destino)) return null
  if (!datosResultadoCompletos(datos)) return null
  return {
    estado: destino as EstadoLicitacion,
    activa: esLicitacionActiva(destino),
    motivo_descarte: null,
    oferta_ganador: datos.oferta_ganador!,
    ganador: {
      nombre: datos.ganador!.nombre.trim(),
      nit: (datos.ganador!.nit ?? '').trim(),
    },
    ...sello(actor, ahora),
  }
}

/** Resultado del motor puro (`utils/sigp/semaforo.ts`), sin importarlo. */
export interface ResultadoSemaforoLicitacion {
  semaforo: Semaforo
  motivos: MotivoSemaforo[]
  version: string
}

/**
 * Declaración EXPLÍCITA de cambio de criterio (invariante 5). Obligatoria
 * cuando la versión del motor difiere de la guardada; prohibida cuando
 * coincide (afirmar un cambio que no ocurre también es ruido de auditoría).
 */
export interface CambioDeVersionSemaforo {
  motivo: string
  /** Debe coincidir con el `semaforo_version` real del documento. */
  version_anterior: string
}

/**
 * Recálculo del semáforo (invariante 5).
 *
 *  - MISMA versión: se refresca valor, motivos y fecha. `semaforo_version`
 *    NO aparece en el patch — la prueba de que no se mutó.
 *  - VERSIÓN DISTINTA: se exige `cambio` con motivo no vacío y
 *    `version_anterior` igual al valor real del documento. Sin eso devuelve
 *    `null`: un criterio nuevo jamás entra como efecto colateral.
 *
 * NO toca `override_manual`: una decisión humana no se borra sola. El
 * override queda como registro del acto que fue, con el `semaforo_anterior`
 * que era cierto en su momento.
 */
export function patchRecalcularSemaforo(
  l: Licitacion, r: ResultadoSemaforoLicitacion, ahora: Timestamp,
  cambio?: CambioDeVersionSemaforo,
) {
  const mismaVersion = r.version === l.semaforo_version

  if (mismaVersion) {
    if (cambio) return null                          // no hay cambio que declarar
    return {
      semaforo: r.semaforo,
      semaforo_motivos: r.motivos,
      semaforo_calculado_en: ahora,
      // semaforo_version deliberadamente AUSENTE (invariante 5)
    }
  }

  if (!cambio) return null                           // invariante 5
  if (!cambio.motivo.trim()) return null
  if (cambio.version_anterior !== l.semaforo_version) return null

  return {
    semaforo: r.semaforo,
    semaforo_motivos: r.motivos,
    semaforo_calculado_en: ahora,
    semaforo_version: r.version,                     // acto explícito
  }
}
