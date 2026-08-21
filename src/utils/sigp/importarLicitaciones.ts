/**
 * Importador del registro histórico de licitaciones (sub-bloque 1.3).
 *
 * PARSER PURO: recibe matrices de celdas (lo que devuelve `sheet_to_json` con
 * `header: 1`) y devuelve registros normalizados + un reporte. CERO Firestore,
 * CERO SheetJS, CERO React — el script de importación y los tests le pasan
 * las filas ya leídas.
 *
 * Los ~350 registros entran como `migrado: true`, `origen: 'manual'` y
 * `consecutivo: ''` — la invariante 6 no aplica a los históricos (ver el campo
 * `migrado` en `types/sigp/licitacion.ts`).
 *
 * ── TRAMPAS DEL ORIGEN, verificadas contra los archivos reales ───────────────
 *  · El ENCABEZADO no está en una fila fija: se DETECTA. Filas 1–4 (o 1–7) son
 *    el membrete ISO CM-FT-CPG-26, no datos.
 *  · 28 filas de la hoja 2025 están DUPLICADAS por NUMERO → dedupe conservando
 *    la primera. Post-dedupe: 164 procesos, 32 presentados, 3 adjudicados.
 *  · `LIMITACIÓN MIPYMES` contiene FECHAS, no banderas — está mal rotulada en
 *    el origen. Va a `observacion_cruda`; `limitacion_mipyme` NO se puebla.
 *  · `SUSCRITO` NO significa ganado (observación "MANIFESTAR" y cierres
 *    futuros) → `manifestada`. Jamás `adjudicada`.
 *  · Formatos numéricos mezclados EN EL MISMO archivo: "75.000.000" (punto =
 *    miles), "209.913.601,59" (coma = decimal) y 359936409.64 (number nativo).
 *  · Seriales de fecha inválidos (el real: 4572620833 en 2025!N139) → null.
 *  · Variantes y erratas de TIPO PROCESO y MOTIVO, normalizadas abajo.
 *  · `ENTIDAD` es 'N/A' en la mayoría de 2025 → `null`, no la cadena.
 */
import type {
  EstadoLicitacion, ModalidadLicitacion, MotivoDescarte, Semaforo, MotivoSemaforo,
} from '../../types/sigp/licitacion'
import { calcularSemaforo, SEMAFORO_VERSION } from './semaforo'
import type { EntradaSemaforo } from './semaforo'

// ── Entrada / salida ─────────────────────────────────────────────────────────

/** Celda cruda tal como la entrega SheetJS con `raw: true`. */
export type Celda = string | number | boolean | null | undefined

/** Una hoja a importar: filas crudas + de dónde viene. */
export interface HojaFuente {
  /** Nombre del archivo (para el reporte). */
  archivo: string
  /** Nombre de la hoja. */
  hoja: string
  /** Filas crudas, incluido el membrete. Índice 0 = primera fila del rango. */
  filas: Celda[][]
  /** Año de referencia de la hoja, usado como último recurso. */
  anio_declarado: number
  /**
   * Resolución de modalidad por FUENTE EXTERNA, para hojas que no registran
   * el tipo de proceso. Solo aplica a las filas cuyo ESTADO crudo esté en
   * `estados`, y solo cuando la hoja no trae la columna (o viene vacía).
   *
   * La declara el CALLER junto con la cita de dónde salió el dato — el parser
   * no infiere modalidad de nada (ni de prefijos del número de proceso: un
   * "MC-" no prueba que sea mínima cuantía).
   */
  modalidad_externa?: {
    estados: string[]
    modalidad: ModalidadLicitacion
    /** De dónde sale el dato. Viaja al `observacion_cruda` del registro. */
    fuente: string
  }
}

/** Registro histórico listo para escribir (subset de `Licitacion`). */
export interface LicitacionImportada {
  consecutivo: ''
  numero_proceso: string
  id_secop: null
  origen: 'manual'
  url_proceso: string
  entidad: {
    nombre: string | null
    nit: ''
    orden: ''
    departamento: ''
    ciudad: string
  }
  objeto: string
  categoria_unspsc: null
  modalidad: ModalidadLicitacion
  presupuesto_oficial: number | null
  lotes: number
  cronograma: {
    publicacion: null
    /** Fechas como ISO 'YYYY-MM-DD'; el script las convierte a Timestamp. */
    manifestacion: string | null
    sorteo: string | null
    cierre: string | null
    adjudicacion: null
  }
  estado: EstadoLicitacion
  motivo_descarte: MotivoDescarte | null
  oferta_neg: number | null
  oferta_ganador: number | null
  manifestaciones: null
  ofertas_recibidas: null
  migrado: true
  /**
   * `false` cuando la hoja de origen NO TIENE columna de tipo de proceso
   * (PROCESOS.xlsx/PRESENTADAS) o la celda está vacía. En ese caso
   * `modalidad` vale 'otra' por obligación del tipo, pero NO es un dato: es
   * la ausencia de dato. El contrafactual del semáforo EXCLUYE estos
   * registros — clasificarlos en rojo por una columna que nunca existió
   * produciría un veredicto falso.
   */
  modalidad_conocida: boolean
  /** `false` si la hoja de origen no tiene columna PRESUPUESTO OFICIAL. */
  presupuesto_columna_presente: boolean
  /** Año atribuido (del cierre, del número de proceso, o el declarado). */
  anio: number
  /** Texto crudo de columnas mal rotuladas o sin destino tipado. */
  observacion_cruda: string
  /** Procedencia, para auditar el import. */
  fuente: { archivo: string; hoja: string; fila_excel: number }
}

/** Fila que no se pudo importar, con el motivo. */
export interface FilaDescartada {
  fuente: { archivo: string; hoja: string; fila_excel: number }
  motivo: string
  detalle?: string
}

/** Estado del origen que no está en el mapa — requiere resolución manual. */
export interface EstadoSinMapear {
  crudo: string
  /** `false` para los ambiguos conocidos (TERMINADO): se listan, no bloquean. */
  imprevisto: boolean
  mapeado_a: EstadoLicitacion
  fuente: { archivo: string; hoja: string; fila_excel: number }
  numero_proceso: string
}

/** Fila cuyo estado se mapeó por un juicio que conviene confirmar. */
export interface MapeoAConfirmar {
  crudo: string
  mapeado_a: EstadoLicitacion
  justificacion: string
  fuente: { archivo: string; hoja: string; fila_excel: number }
  numero_proceso: string
}

export interface ReporteImportacion {
  registros: LicitacionImportada[]
  descartadas: FilaDescartada[]
  duplicadas: { numero_proceso: string; conservada: number; descartadas: number[] }[]
  /** Estados que cayeron a `en_evaluacion` por no estar previstos. */
  estados_sin_mapear: EstadoSinMapear[]
  /** Mapeos aplicados en firme pero pendientes de confirmación humana. */
  mapeos_a_confirmar: MapeoAConfirmar[]
  /** Encabezado detectado por hoja (para verificar contra lo esperado). */
  encabezados: { archivo: string; hoja: string; fila_excel: number; columnas: string[] }[]
  /** Señales del guard de calidad. Si hay alguna, la importación NO procede. */
  senales: string[]
  /** `true` solo si `senales` está vacío. */
  puede_importar: boolean
}

// ── Normalización de texto ───────────────────────────────────────────────────

/** MAYÚSCULAS, sin tildes, espacios colapsados, sin puntos finales. */
export function norm(v: Celda): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Texto tal cual, solo con espacios colapsados. `''` si vacío o 'N/A'. */
export function texto(v: Celda): string {
  if (v === null || v === undefined) return ''
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s
}

/** Igual que `texto` pero devuelve `null` para vacío y para 'N/A'. */
export function textoONull(v: Celda): string | null {
  const s = texto(v)
  if (s === '') return null
  if (norm(s) === 'N/A' || norm(s) === 'NA' || norm(s) === '#N/A') return null
  return s
}

/** Clave de deduplicación: número de proceso normalizado. */
export function claveProceso(v: Celda): string {
  return norm(v)
}

// ── Números: los tres formatos que conviven en los archivos ──────────────────

/**
 * Parsea un presupuesto. Los archivos mezclan tres formatos EN EL MISMO libro:
 *
 *  · `number` nativo (359936409.64) → tal cual, el punto ya es decimal.
 *  · string con COMA ("209.913.601,59") → convención es-CO: puntos = miles,
 *    coma = decimal.
 *  · string SIN coma ("75.000.000", "12.577.839.416") → los puntos son
 *    SEPARADORES DE MILES y se quitan.
 *
 * La última regla es segura porque se verificó contra los tres archivos: no
 * existe ningún string de la forma `\d+(\.\d{3})*\.\d{1,2}` (punto decimal sin
 * coma). Si alguna vez apareciera, caería a miles y quedaría inflado ×100 — por
 * eso el guard de calidad vigila el % de presupuestos no parseables.
 *
 * Devuelve `null` para vacío, 'N/A', errores de Excel (#VALUE!, #DIV/0!) y
 * cualquier cosa que no sea un número finito positivo o cero.
 */
export function parsearMonto(v: Celda): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return null

  const s = String(v).trim()
  if (s === '') return null
  const n = norm(s)
  if (n === 'N/A' || n === 'NA' || n.startsWith('#')) return null

  // Limpia moneda y espacios (incl. el no-rompible de Excel).
  const limpio = s.replace(/[$\s ]/g, '')
  if (!/^-?[\d.,]+$/.test(limpio)) return null

  let num: string
  if (limpio.includes(',')) {
    num = limpio.replace(/\./g, '').replace(',', '.')
  } else {
    num = limpio.replace(/\./g, '')
  }

  const r = Number(num)
  return Number.isFinite(r) ? r : null
}

// ── Fechas: seriales de Excel, strings y basura ──────────────────────────────

/**
 * Rango aceptable de seriales de Excel: 1990-01-01 (32874) a 2049-12-31
 * (54788). Fuera de ahí es basura — el caso real es 4572620833 en 2025!N139,
 * que como serial cae en el año 12'517'821.
 */
const SERIAL_MIN = 32874
const SERIAL_MAX = 54788

/**
 * Convierte una celda de fecha a ISO 'YYYY-MM-DD', o `null`.
 *
 * Acepta: serial de Excel en rango · string 'd/m/yyyy [hh:mm:ss AM]' (aparece
 * en 2025!SORTEO) · 'yyyy-mm-dd'. Rechaza: 'N/A', vacío, seriales fuera de
 * rango, cualquier otra cosa. NUNCA lanza.
 */
export function parsearFecha(v: Celda): string | null {
  if (v === null || v === undefined || v === '') return null

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    if (v < SERIAL_MIN || v > SERIAL_MAX) return null    // el caso 4572620833
    return serialAIso(v)
  }

  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s === '') return null
  const n = norm(s)
  if (n === 'N/A' || n === 'NA' || n.startsWith('#')) return null

  // 'yyyy-mm-dd' (posible sufijo de hora)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return fechaValida(+iso[1], +iso[2], +iso[3])

  // 'd/m/yyyy' o 'dd/mm/yyyy' (posible hora)
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (dmy) return fechaValida(+dmy[3], +dmy[2], +dmy[1])

  // Un string que es solo dígitos: serial en texto.
  if (/^\d+(\.\d+)?$/.test(s)) return parsearFecha(Number(s))

  return null
}

/** Serial de Excel (base 1899-12-30) a ISO. Ignora la parte de hora. */
function serialAIso(serial: number): string | null {
  const dias = Math.floor(serial)
  const ms = Date.UTC(1899, 11, 30) + dias * 86_400_000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`
}

const dos = (n: number) => String(n).padStart(2, '0')

function fechaValida(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  if (a < 1990 || a > 2049) return null
  return `${a}-${dos(m)}-${dos(d)}`
}

// ── Modalidad ────────────────────────────────────────────────────────────────

/**
 * Variantes reales encontradas en los tres archivos, con sus erratas de
 * tecleo: MINIMA · MÍNIMA · MÌNIMA · MINIMO · MIIMA · MININA → mínima cuantía.
 * MENOR · MENOR SECOP I · MENOR SELECCION ABREVIADA DE MENOR CUANTIA → menor.
 * LP → licitación pública.
 */
export function mapearModalidad(v: Celda): ModalidadLicitacion {
  const n = norm(v)
  if (n === '') return 'otra'

  // Mínima cuantía: cubre MINIMA/MINIMO y las erratas por transposición.
  if (/^MI+N?[IA]?M[AO]$/.test(n)) return 'minima_cuantia'
  if (n === 'MIIMA' || n === 'MININA' || n === 'MINIMA' || n === 'MINIMO') return 'minima_cuantia'
  if (n.startsWith('MINIMA') || n.startsWith('MINIMO')) return 'minima_cuantia'

  if (n.includes('SELECCION ABREVIADA')) return 'menor_cuantia'   // el rótulo real dice MENOR
  if (n.startsWith('MENOR')) return 'menor_cuantia'

  if (n === 'LP' || n.includes('LICITACION PUBLICA')) return 'licitacion_publica'
  if (n.includes('REGIMEN ESPECIAL')) return 'regimen_especial'

  return 'otra'
}

// ── Estado ───────────────────────────────────────────────────────────────────

/** Mapa del sub-bloque 1.3, tal como se acordó. */
const MAPA_ESTADO: Record<string, EstadoLicitacion> = {
  'NO': 'descartada',
  'NO PRESENTADA': 'descartada',
  'PERDIDA': 'perdida',
  'PERDIDO': 'perdida',
  'GANADA': 'adjudicada',
  'GANADO': 'adjudicada',
  'SUSCRITO': 'manifestada',      // NO es ganado: obs. "MANIFESTAR", cierres futuros
  'MANIFESTADO': 'manifestada',
  'MANIFESTAR': 'en_preparacion',
  'PRESENTAR': 'en_preparacion',
  'PRESENTADA': 'presentada',
  'EN PROCESO': 'presentada',
  'REVOCADO': 'revocada',
  'RECHAZADO': 'rechazada',
  'DESIERTO': 'desierta',
  /**
   * TERMINADO → PERDIDA (1.3b, decisión de la dirección).
   *
   * La hoja se llama PRESENTADAS y sus 20 filas TERMINADO conviven con 5
   * GANADO en la misma columna. SECOP II registra 6 adjudicaciones a NEG en
   * 2022, no 20+: si TERMINADO significara "ganado", el año habría tenido 25
   * adjudicaciones. Significa que el proceso cerró sin que NEG ganara.
   *
   * Se mapea en firme, pero las filas se siguen LISTANDO en el reporte
   * (`mapeos_a_confirmar`) para que Karen confirme la lectura — mapear no es
   * lo mismo que dar por cerrado.
   */
  'TERMINADO': 'perdida',
}

/**
 * Valores cuyo mapeo fue un JUICIO, no una equivalencia obvia. Se aplican en
 * firme (a diferencia de los ambiguos, que caían a `en_evaluacion`) pero se
 * reportan aparte para confirmación humana.
 */
export const MAPEOS_A_CONFIRMAR: Record<string, string> = {
  TERMINADO: 'perdida — la hoja es PRESENTADAS y SECOP registra 6 adjudicaciones '
    + 'a NEG en 2022, no 20+',
}

/** Estado al que caen los valores ambiguos o imprevistos. */
export const ESTADO_PARA_RESOLVER: EstadoLicitacion = 'en_evaluacion'

/**
 * Valores AMBIGUOS conocidos: se mapean a `en_evaluacion` y se listan para
 * resolución manual, pero NO cuentan para el guard del 5 %.
 *
 * VACÍO desde 1.3b: `TERMINADO` era el único y la dirección lo resolvió a
 * `perdida` (ver MAPA_ESTADO). El mecanismo se conserva porque el próximo
 * archivo del área traerá su propio vocabulario y esta es la escotilla para
 * un valor que se sabe ambiguo y todavía no se decidió.
 */
export const AMBIGUOS_CONOCIDOS = [] as const

export interface ResultadoEstado {
  estado: EstadoLicitacion
  /** `true` si necesita ojo humano (ambiguo conocido O imprevisto). */
  requiere_resolucion: boolean
  /** `true` solo si el valor NO estaba previsto — este cuenta para el guard. */
  imprevisto: boolean
}

/**
 * Mapea el estado del origen.
 *
 * `TERMINADO` es AMBIGUO en PROCESOS.xlsx (convive con GANADO en la misma
 * columna: 20 TERMINADO y 5 GANADO). No se adivina — cae a `en_evaluacion` y
 * se lista en el reporte para resolución manual. Misma regla para cualquier
 * valor no previsto.
 */
export function mapearEstado(v: Celda): ResultadoEstado {
  const n = norm(v)
  if (n === '') return { estado: 'detectada', requiere_resolucion: false, imprevisto: false }
  const m = MAPA_ESTADO[n]
  if (m) return { estado: m, requiere_resolucion: false, imprevisto: false }
  const conocido = (AMBIGUOS_CONOCIDOS as readonly string[]).includes(n)
  return { estado: ESTADO_PARA_RESOLVER, requiere_resolucion: true, imprevisto: !conocido }
}

// ── Motivo de descarte ───────────────────────────────────────────────────────

/**
 * Motivos reales del origen con sus erratas: BAJO PRESUPUESTTO (doble T),
 * "EXPERIENCIA " con espacio final (el trim lo resuelve),
 * EXPERIENCIA/INDICADORES (compuesto → gana el primero),
 * LIMITACION MYPIMES (MYPIMES, no MIPYMES).
 *
 * Los que no tienen casilla en el vocabulario (AMPARO GARANTIA DE SERIEDAD,
 * PERSONAL, PERDIDA, REVOCADA) caen a OTRO — el texto crudo se conserva en
 * `observacion_cruda`, así que nada se pierde.
 */
export function mapearMotivoDescarte(v: Celda): MotivoDescarte | null {
  const n = norm(v)
  if (n === '') return null

  if (n.includes('SORTEO')) return 'SORTEO'
  if (n.includes('MYPIME') || n.includes('MIPYME')) return 'LIMITACION_MIPYME'
  if (n.includes('EXPERIENCIA')) return 'EXPERIENCIA'          // gana sobre INDICADORES
  if (n.includes('INDICADOR')) return 'INDICADORES'
  if (n.includes('PRESUPUEST')) return 'BAJO_PRESUPUESTO'      // cubre PRESUPUESTTO
  if (n.includes('UBICACION')) return 'UBICACION'
  if (n.includes('CAPACIDAD')) return 'CAPACIDAD'
  return 'OTRO'
}

// ── Detección del encabezado ─────────────────────────────────────────────────

/**
 * Tokens que identifican la fila de encabezado. Las filas 1–4 (o 1–7) del
 * membrete ISO no los tienen.
 */
const TOKENS_ENCABEZADO = [
  'NUMERO', 'ESTADO', 'ENTIDAD', 'OBJETO', 'TIPO PROCESO', 'PRESUPUESTO',
  'LINK', 'MOTIVO', 'PROCESO', 'CIUDAD',
]

/**
 * Encuentra la fila de encabezado: la de mayor cantidad de tokens conocidos
 * dentro de las primeras `limite` filas.
 *
 * Se DETECTA en vez de fijarse porque los archivos reales NO coinciden con lo
 * documentado: el encabezado está en la fila 7 de dos hojas, la 8 de "2024",
 * la 7 de "2025" y la 6 de PROCESOS.xlsx. Fijarlo habría corrido todas las
 * columnas (la lección del corrimiento de Claro en C1.1).
 */
export function detectarEncabezado(filas: Celda[][], limite = 15): number {
  let mejor = -1
  let score = 0
  for (let i = 0; i < Math.min(limite, filas.length); i++) {
    const s = (filas[i] ?? []).filter(c => {
      const n = norm(c)
      return n !== '' && TOKENS_ENCABEZADO.some(t => n.includes(t))
    }).length
    if (s > score) { score = s; mejor = i }
  }
  return score >= 3 ? mejor : -1
}

/**
 * Índice de la primera columna cuyo encabezado es EXACTAMENTE una de las
 * alternativas (ya normalizadas), o -1.
 *
 * ⚠ EXACTO A PROPÓSITO. Un match por substring buscando 'PROCESO' engancha
 * 'TIPO PROCESO' — y entonces `numero_proceso` termina valiendo "MENOR" o
 * "MINIMA", las 350 filas colapsan a un puñado de claves y el dedupe se come
 * el archivo. Es exactamente el corrimiento de columnas de C1.1: por eso la
 * identidad de las columnas se resuelve por igualdad, nunca por inclusión.
 */
export function colExacta(head: string[], ...alternativas: string[]): number {
  for (const alt of alternativas) {
    const i = head.findIndex(h => h === alt)
    if (i >= 0) return i
  }
  return -1
}

/**
 * Igual que `colExacta` pero admite inclusión como ÚLTIMO recurso. Solo para
 * columnas cuyo nombre no es prefijo/sufijo de otra del mismo archivo.
 */
function col(head: string[], ...alternativas: string[]): number {
  const exacta = colExacta(head, ...alternativas)
  if (exacta >= 0) return exacta
  for (const alt of alternativas) {
    const i = head.findIndex(h => h.includes(alt))
    if (i >= 0) return i
  }
  return -1
}

const celda = (fila: Celda[], i: number): Celda => (i < 0 ? null : fila[i])

/** LOTES: número si lo hay; 1 en cualquier otro caso ('NO', vacío, texto). */
export function parsearLotes(v: Celda): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1) return Math.floor(v)
  const n = parsearMonto(v)
  if (n !== null && n >= 1 && Number.isInteger(n)) return n
  return 1
}

// ── Año atribuido ────────────────────────────────────────────────────────────

/**
 * Año del proceso, en orden de confianza: fecha de cierre/presentación → año
 * de 4 dígitos dentro del número de proceso → año declarado de la hoja.
 */
export function atribuirAnio(
  cierreIso: string | null, numeroProceso: string, declarado: number,
): number {
  if (cierreIso) return Number(cierreIso.slice(0, 4))
  const m = /(?:^|[^\d])(20[12]\d)(?:[^\d]|$)/.exec(numeroProceso)
  if (m) return Number(m[1])
  return declarado
}

// ── Parseo de una hoja ───────────────────────────────────────────────────────

interface ParseoHoja {
  registros: LicitacionImportada[]
  descartadas: FilaDescartada[]
  estados_sin_mapear: EstadoSinMapear[]
  mapeos_a_confirmar: MapeoAConfirmar[]
  encabezado: { fila_excel: number; columnas: string[] } | null
}

/**
 * Parsea UNA hoja. No deduplica (eso es global) ni aplica el guard.
 * `fila_excel` es 1-based respecto del rango leído, para poder señalar la
 * celda en el archivo.
 */
export function parsearHoja(fuente: HojaFuente): ParseoHoja {
  const out: ParseoHoja = {
    registros: [], descartadas: [], estados_sin_mapear: [],
    mapeos_a_confirmar: [], encabezado: null,
  }
  const iHead = detectarEncabezado(fuente.filas)
  if (iHead < 0) {
    out.descartadas.push({
      fuente: { archivo: fuente.archivo, hoja: fuente.hoja, fila_excel: 0 },
      motivo: 'sin_encabezado',
      detalle: 'No se encontró una fila de encabezado con al menos 3 tokens conocidos',
    })
    return out
  }

  const head = (fuente.filas[iHead] ?? []).map(c => norm(c))
  out.encabezado = { fila_excel: iHead + 1, columnas: head }

  // PROCESOS.xlsx: `NUMERO` es un índice secuencial (1,2,3…) y el número real
  // del proceso vive en `PROCESO`. En las demás hojas `NUMERO` ES el proceso.
  // EXACTO en los dos (ver colExacta): 'PROCESO' por inclusión engancharía
  // 'TIPO PROCESO'.
  const iProceso = colExacta(head, 'PROCESO')
  const iNumero = colExacta(head, 'NUMERO', 'NUMERO PROCESO')
  const iNumProc = iProceso >= 0 ? iProceso : iNumero

  const c = {
    numero: iNumProc,
    link: col(head, 'LINK'),
    tipo: colExacta(head, 'TIPO PROCESO'),
    ciudad: col(head, 'CIUDAD'),
    entidad: col(head, 'ENTIDAD'),
    objeto: col(head, 'OBJETO'),
    lotes: col(head, 'LOTES'),
    presupuesto: col(head, 'PRESUPUESTO OFICIAL'),
    neg: col(head, 'PRESUPUESTO NEG', 'PRESUPUESTO  NEG'),
    ganador: col(head, 'PRESUPUESTO GANADOR', 'PRESUPUESTO  GANADOR'),
    mipyme: col(head, 'LIMITACION MIPYMES'),
    manifestacion: col(head, 'MANIFESTACION'),
    sorteo: col(head, 'SORTEO'),
    cierre: col(head, 'PRESENTACION', 'FECHA CIERRE'),
    estado: col(head, 'ESTADO'),
    observacion: col(head, 'OBSERVACION'),
    motivo: col(head, 'MOTIVO'),
  }

  for (let i = iHead + 1; i < fuente.filas.length; i++) {
    const fila = fuente.filas[i] ?? []
    const filaExcel = i + 1
    const ref = { archivo: fuente.archivo, hoja: fuente.hoja, fila_excel: filaExcel }

    // Fila completamente vacía: no es un descarte, es el final del rango.
    if (!fila.some(x => x !== null && x !== undefined && String(x).trim() !== '')) continue

    const numero = texto(celda(fila, c.numero))
    if (numero === '') {
      out.descartadas.push({ ...{ fuente: ref }, motivo: 'sin_numero_proceso' })
      continue
    }

    const estadoCrudo = celda(fila, c.estado)
    const { estado, requiere_resolucion, imprevisto } = mapearEstado(estadoCrudo)
    if (requiere_resolucion) {
      out.estados_sin_mapear.push({
        crudo: texto(estadoCrudo), imprevisto, mapeado_a: estado,
        fuente: ref, numero_proceso: numero,
      })
    }

    const confirmar = MAPEOS_A_CONFIRMAR[norm(estadoCrudo)]
    if (confirmar) {
      out.mapeos_a_confirmar.push({
        crudo: texto(estadoCrudo), mapeado_a: estado, justificacion: confirmar,
        fuente: ref, numero_proceso: numero,
      })
    }

    // Modalidad: de la columna si existe; si no, de la fuente externa
    // declarada por el caller para ESTE estado. Nunca inferida.
    const tipoCrudo = celda(fila, c.tipo)
    const tieneTipo = c.tipo >= 0 && norm(tipoCrudo) !== ''
    const ext = fuente.modalidad_externa
    const aplicaExt = !tieneTipo && !!ext
      && ext.estados.map(e => norm(e)).includes(norm(estadoCrudo))

    const modalidad = tieneTipo
      ? mapearModalidad(tipoCrudo)
      : (aplicaExt ? ext!.modalidad : mapearModalidad(null))

    const motivo = estado === 'descartada'
      ? (mapearMotivoDescarte(celda(fila, c.motivo))
         ?? mapearMotivoDescarte(celda(fila, c.observacion))
         ?? 'OTRO')
      : null

    const cierre = parsearFecha(celda(fila, c.cierre))

    // La columna mal rotulada + la observación se conservan crudas.
    const crudo = [
      c.mipyme >= 0 ? `LIMITACIÓN MIPYMES (col. mal rotulada, contiene fechas): ${texto(celda(fila, c.mipyme)) || '—'}` : '',
      c.observacion >= 0 && texto(celda(fila, c.observacion)) ? `OBSERVACIÓN: ${texto(celda(fila, c.observacion))}` : '',
      c.motivo >= 0 && texto(celda(fila, c.motivo)) ? `MOTIVO: ${texto(celda(fila, c.motivo))}` : '',
      aplicaExt ? `MODALIDAD POR FUENTE EXTERNA: ${ext!.fuente}` : '',
    ].filter(Boolean).join(' | ')

    out.registros.push({
      consecutivo: '',
      numero_proceso: numero,
      id_secop: null,
      origen: 'manual',
      url_proceso: texto(celda(fila, c.link)),
      entidad: {
        nombre: textoONull(celda(fila, c.entidad)),
        nit: '', orden: '', departamento: '',
        ciudad: texto(celda(fila, c.ciudad)),
      },
      objeto: texto(celda(fila, c.objeto)),
      categoria_unspsc: null,
      modalidad,
      modalidad_conocida: tieneTipo || aplicaExt,
      presupuesto_columna_presente: c.presupuesto >= 0,
      presupuesto_oficial: parsearMonto(celda(fila, c.presupuesto)),
      // La columna LOTES del origen dice 'NO' (= sin lotes) o queda vacía;
      // nunca trae un conteo. 1 = el proceso es un solo lote.
      lotes: parsearLotes(celda(fila, c.lotes)),
      cronograma: {
        publicacion: null,
        manifestacion: parsearFecha(celda(fila, c.manifestacion)),
        sorteo: parsearFecha(celda(fila, c.sorteo)),
        cierre,
        adjudicacion: null,
      },
      estado,
      motivo_descarte: motivo,
      oferta_neg: parsearMonto(celda(fila, c.neg)),
      oferta_ganador: parsearMonto(celda(fila, c.ganador)),
      manifestaciones: null,
      ofertas_recibidas: null,
      migrado: true,
      anio: atribuirAnio(cierre, numero, fuente.anio_declarado),
      observacion_cruda: crudo,
      fuente: ref,
    })
  }

  return out
}

// ── Guard de calidad ─────────────────────────────────────────────────────────

/** Umbrales del guard. Superarlos ABORTA la importación. */
export const GUARD = {
  MAX_PCT_SIN_PRESUPUESTO: 10,
  MAX_PCT_ESTADO_SIN_MAPEAR: 5,
  /** Conteos exactos que la hoja 2025 debe dar post-dedupe. */
  ESPERADO_2025: { procesos: 164, presentados: 32, adjudicados: 3 },
} as const

/** Estados que cuentan como "presentado" (se hizo el trabajo y se entregó). */
export const ESTADOS_PRESENTADO: EstadoLicitacion[] = [
  'presentada', 'adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta',
]

export interface ConteoAnio {
  anio: number
  total: number
  presentadas: number
  adjudicadas: number
  /** adjudicadas / presentadas × 100, o null si no hubo presentadas. */
  tasa_pct: number | null
}

export function contarPorAnio(registros: LicitacionImportada[]): ConteoAnio[] {
  const porAnio = new Map<number, LicitacionImportada[]>()
  for (const r of registros) {
    const a = porAnio.get(r.anio) ?? []
    a.push(r)
    porAnio.set(r.anio, a)
  }
  return [...porAnio.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([anio, rs]) => {
      const presentadas = rs.filter(r => ESTADOS_PRESENTADO.includes(r.estado)).length
      const adjudicadas = rs.filter(r => r.estado === 'adjudicada').length
      return {
        anio, total: rs.length, presentadas, adjudicadas,
        tasa_pct: presentadas > 0 ? (adjudicadas / presentadas) * 100 : null,
      }
    })
}

// ── Importación completa ─────────────────────────────────────────────────────

/**
 * Parsea todas las hojas, deduplica por `numero_proceso` normalizado
 * (conservando la PRIMERA aparición) y aplica el guard de calidad.
 *
 * La deduplicación es GLOBAL: el mismo proceso puede aparecer en dos hojas.
 */
export function importarLicitaciones(hojas: HojaFuente[]): ReporteImportacion {
  const registros: LicitacionImportada[] = []
  const descartadas: FilaDescartada[] = []
  const estados_sin_mapear: EstadoSinMapear[] = []
  const mapeos_a_confirmar: MapeoAConfirmar[] = []
  const encabezados: ReporteImportacion['encabezados'] = []

  const vistos = new Map<string, number>()   // clave → fila_excel conservada
  const dupPorClave = new Map<string, number[]>()

  for (const hoja of hojas) {
    const p = parsearHoja(hoja)
    descartadas.push(...p.descartadas)
    estados_sin_mapear.push(...p.estados_sin_mapear)
    mapeos_a_confirmar.push(...p.mapeos_a_confirmar)
    if (p.encabezado) {
      encabezados.push({ archivo: hoja.archivo, hoja: hoja.hoja, ...p.encabezado })
    }
    for (const r of p.registros) {
      const k = claveProceso(r.numero_proceso)
      if (vistos.has(k)) {
        const lista = dupPorClave.get(k) ?? []
        lista.push(r.fuente.fila_excel)
        dupPorClave.set(k, lista)
        continue
      }
      vistos.set(k, r.fuente.fila_excel)
      registros.push(r)
    }
  }

  const duplicadas = [...dupPorClave.entries()].map(([numero_proceso, filas]) => ({
    numero_proceso,
    conservada: vistos.get(numero_proceso) ?? 0,
    descartadas: filas,
  }))

  // ── Guard de calidad ──
  const senales: string[] = []
  const total = registros.length

  if (total === 0) {
    senales.push('cero_registros: ninguna fila resultó importable')
  } else {
    // Solo cuentan las filas cuya hoja TIENE columna de presupuesto oficial.
    // La hoja "LICITACIONES LEIDAS Y NO PRESENTADAS" no la trae (nunca se
    // cotizaron, no había qué anotar): contarlas como "no parseable" mediría
    // una ausencia estructural, no un fallo del parser.
    const conColumna = registros.filter(r => r.presupuesto_columna_presente)
    if (conColumna.length > 0) {
      const sinPresupuesto = conColumna.filter(r => r.presupuesto_oficial === null).length
      const pctSin = (sinPresupuesto / conColumna.length) * 100
      if (pctSin > GUARD.MAX_PCT_SIN_PRESUPUESTO) {
        senales.push(
          `presupuesto_no_parseable: ${sinPresupuesto}/${conColumna.length} (${pctSin.toFixed(1)}%) `
          + `de las filas CON columna de presupuesto supera el ${GUARD.MAX_PCT_SIN_PRESUPUESTO}% permitido`,
        )
      }
    }

    // Solo los IMPREVISTOS bloquean; los ambiguos conocidos se listan.
    const imprevistos = estados_sin_mapear.filter(e => e.imprevisto).length
    const pctEstado = (imprevistos / total) * 100
    if (pctEstado > GUARD.MAX_PCT_ESTADO_SIN_MAPEAR) {
      senales.push(
        `estado_imprevisto: ${imprevistos}/${total} (${pctEstado.toFixed(1)}%) `
        + `supera el ${GUARD.MAX_PCT_ESTADO_SIN_MAPEAR}% permitido`,
      )
    }
  }

  // Conteo canónico de 2025: el número que valida todo el importador.
  const h2025 = hojas.find(h => h.hoja.trim() === '2025')
  if (h2025) {
    const de2025 = registros.filter(
      r => r.fuente.hoja === h2025.hoja && r.fuente.archivo === h2025.archivo,
    )
    const presentados = de2025.filter(r => ESTADOS_PRESENTADO.includes(r.estado)).length
    const adjudicados = de2025.filter(r => r.estado === 'adjudicada').length
    const e = GUARD.ESPERADO_2025
    if (de2025.length !== e.procesos || presentados !== e.presentados || adjudicados !== e.adjudicados) {
      senales.push(
        `conteo_2025: obtenido ${de2025.length}/${presentados}/${adjudicados}, `
        + `esperado ${e.procesos}/${e.presentados}/${e.adjudicados} (procesos/presentados/adjudicados)`,
      )
    }
  }

  // SUSCRITO jamás puede terminar en adjudicada.
  const suscritoAdjudicado = registros.filter(
    r => r.estado === 'adjudicada' && /SUSCRITO/.test(norm(r.observacion_cruda)),
  )
  if (suscritoAdjudicado.length > 0) {
    senales.push(
      `suscrito_adjudicado: ${suscritoAdjudicado.length} registro(s) con SUSCRITO cayeron en `
      + `adjudicada — el mapeo de estado está roto`,
    )
  }

  return {
    registros, descartadas, duplicadas, estados_sin_mapear, mapeos_a_confirmar,
    encabezados, senales,
    puede_importar: senales.length === 0,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SEMÁFORO RETROACTIVO — la validación que decide si el módulo sigue
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Construye la entrada del semáforo para un registro HISTÓRICO.
 *
 * ⚠ HONESTIDAD DE LA MEDICIÓN: de las cuatro señales del criterio v1.0, los
 * archivos históricos solo permiten calcular DOS.
 *
 *  · `modalidad` — SÍ, de la columna TIPO PROCESO.
 *  · `tiene_sorteo` — SÍ, presencia de fecha en la columna SORTEO.
 *  · `limitacion_mipyme` — NO. La columna LIMITACIÓN MIPYMES contiene FECHAS,
 *    no banderas (está mal rotulada en el origen). Se pasa `false`: asumir
 *    que no aplica es lo conservador — el filtro deja pasar MÁS, nunca menos,
 *    así que no puede inventar un descarte que la realidad no tuvo.
 *  · `requiere_lectura` — NO. Es un juicio humano que no quedó registrado.
 *    `false` por la misma razón conservadora.
 *
 * Consecuencia: el semáforo retroactivo mide, en la práctica, MODALIDAD +
 * SORTEO. Es una cota INFERIOR de cuánto filtraría el criterio completo —
 * suficiente para responder la pregunta que importa (¿habría descartado una
 * adjudicación real?) porque las dos señales que faltan solo pueden AGREGAR
 * amarillos, y el amarillo no bloquea.
 */
export function entradaSemaforoDe(r: LicitacionImportada): EntradaSemaforo {
  return {
    modalidad: r.modalidad,
    tiene_sorteo: r.cronograma.sorteo !== null,
    limitacion_mipyme: false,      // la columna del origen es inservible
    departamento: '',              // no existe en los archivos (solo CIUDAD libre)
    requiere_lectura: false,       // juicio humano no registrado
  }
}

export interface RegistroConSemaforo extends LicitacionImportada {
  semaforo: Semaforo
  semaforo_motivos: MotivoSemaforo[]
  semaforo_version: string
}

/** Estampa el semáforo v1.0 sobre cada registro migrado. */
export function estamparSemaforo(
  registros: LicitacionImportada[],
): RegistroConSemaforo[] {
  return registros.map(r => {
    const s = calcularSemaforo(entradaSemaforoDe(r))
    return { ...r, semaforo: s.semaforo, semaforo_motivos: s.motivos, semaforo_version: s.version }
  })
}

/** El portero bloquea SOLO el rojo (ver ESTADOS_TRAS_PORTERO). */
export const dejaPasar = (s: Semaforo): boolean => s !== 'rojo'

export interface EvaluacionAnio {
  anio: number
  /** Procesos del año en el registro histórico. */
  total: number
  /** Presentados de verdad (se hizo y se entregó la propuesta). */
  presentadas: number
  /**
   * Presentadas cuya MODALIDAD el origen no registró — el contrafactual las
   * excluye. Con la columna ausente, el semáforo las pintaría rojo por
   * omisión y el veredicto sería un artefacto de medición, no un hallazgo.
   */
  presentadas_sin_modalidad: number
  /** Presentadas con modalidad conocida: la base real del contrafactual. */
  evaluables: number
  /** Adjudicadas SIN modalidad registrada (no evaluables, se reportan). */
  adjudicadas_sin_modalidad: number
  adjudicadas: number
  /** adjudicadas / presentadas × 100. */
  tasa_real_pct: number | null

  // ── Contrafactual: qué habría hecho el filtro ──
  /** Presentadas que el semáforo habría dejado pasar. */
  pasan_filtro: number
  /** Adjudicaciones que el filtro CONSERVA. */
  adjudicaciones_conservadas: number
  /**
   * Adjudicaciones que el filtro HABRÍA DESCARTADO. Cualquier valor > 0 es
   * el criterio de CANCELACIÓN acordado.
   */
  adjudicaciones_perdidas: number
  /** Presentadas sin adjudicación que el filtro habría bloqueado. */
  sin_retorno_bloqueadas: number
  /** Tasa que habría resultado: conservadas / pasan_filtro × 100. */
  tasa_filtrada_pct: number | null
}

export interface EvaluacionRetroactiva {
  version_criterio: string
  por_anio: EvaluacionAnio[]
  /** Presentadas excluidas del contrafactual por no tener modalidad. */
  excluidas_sin_modalidad: number
  /** De esas, cuántas fueron adjudicaciones (el hueco de la medición). */
  adjudicaciones_no_evaluables: number
  /** Suma de `adjudicaciones_perdidas` de todos los años. */
  adjudicaciones_perdidas_total: number
  /**
   * `false` si el filtro habría descartado alguna adjudicación real.
   * Criterio de cancelación: con `false` NO se avanza al sub-bloque 1.4.
   */
  criterio_aprobado: boolean
  /** Las adjudicaciones que el filtro habría matado, para reportarlas. */
  adjudicaciones_perdidas_detalle: {
    anio: number
    numero_proceso: string
    presupuesto_oficial: number | null
    modalidad: ModalidadLicitacion
    semaforo: Semaforo
    motivos: MotivoSemaforo[]
  }[]
}

/**
 * Evalúa el criterio v1.0 contra el histórico, año por año.
 *
 * Solo cuentan las PRESENTADAS: una licitación que NEG nunca presentó no dice
 * nada sobre si el filtro acierta — el filtro existe para decidir a qué
 * dedicarle horas, y el contrafactual honesto es "de las que sí presentamos,
 * ¿cuáles habría frenado?".
 */
export function evaluarRetroactivo(
  registros: LicitacionImportada[],
): EvaluacionRetroactiva {
  const conSemaforo = estamparSemaforo(registros)
  const anios = [...new Set(conSemaforo.map(r => r.anio))].sort((a, b) => a - b)

  const por_anio: EvaluacionAnio[] = []
  const perdidas: EvaluacionRetroactiva['adjudicaciones_perdidas_detalle'] = []

  for (const anio of anios) {
    const delAnio = conSemaforo.filter(r => r.anio === anio)
    const presentadas = delAnio.filter(r => ESTADOS_PRESENTADO.includes(r.estado))
    const adjudicadas = presentadas.filter(r => r.estado === 'adjudicada')

    // El contrafactual SOLO corre sobre lo que el origen sí registró.
    const evaluables = presentadas.filter(r => r.modalidad_conocida)
    const noEvaluables = presentadas.filter(r => !r.modalidad_conocida)
    const adjEvaluables = evaluables.filter(r => r.estado === 'adjudicada')
    const sinRetorno = evaluables.filter(r => r.estado !== 'adjudicada')

    const pasan = evaluables.filter(r => dejaPasar(r.semaforo))
    const adjConservadas = adjEvaluables.filter(r => dejaPasar(r.semaforo))
    const adjPerdidas = adjEvaluables.filter(r => !dejaPasar(r.semaforo))
    const bloqueadasSinRetorno = sinRetorno.filter(r => !dejaPasar(r.semaforo))

    for (const r of adjPerdidas) {
      perdidas.push({
        anio, numero_proceso: r.numero_proceso,
        presupuesto_oficial: r.presupuesto_oficial,
        modalidad: r.modalidad, semaforo: r.semaforo, motivos: r.semaforo_motivos,
      })
    }

    por_anio.push({
      anio,
      total: delAnio.length,
      presentadas: presentadas.length,
      presentadas_sin_modalidad: noEvaluables.length,
      evaluables: evaluables.length,
      adjudicadas_sin_modalidad: noEvaluables.filter(r => r.estado === 'adjudicada').length,
      adjudicadas: adjudicadas.length,
      tasa_real_pct: presentadas.length > 0
        ? (adjudicadas.length / presentadas.length) * 100 : null,
      pasan_filtro: pasan.length,
      adjudicaciones_conservadas: adjConservadas.length,
      adjudicaciones_perdidas: adjPerdidas.length,
      sin_retorno_bloqueadas: bloqueadasSinRetorno.length,
      tasa_filtrada_pct: pasan.length > 0
        ? (adjConservadas.length / pasan.length) * 100 : null,
    })
  }

  return {
    version_criterio: SEMAFORO_VERSION,
    por_anio,
    excluidas_sin_modalidad: por_anio.reduce((a, x) => a + x.presentadas_sin_modalidad, 0),
    adjudicaciones_no_evaluables: por_anio.reduce((a, x) => a + x.adjudicadas_sin_modalidad, 0),
    adjudicaciones_perdidas_total: perdidas.length,
    criterio_aprobado: perdidas.length === 0,
    adjudicaciones_perdidas_detalle: perdidas,
  }
}
