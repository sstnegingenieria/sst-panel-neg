/**
 * LA CORRIDA DEL RADAR — capa pura de B.2 (la tarea programada).
 *
 * Acá vive todo lo que la tarea programada DECIDE, sin red, sin Firestore y
 * sin reloj propio: la guarda de volumen, la re-escritura idempotente sobre un
 * documento que ya existe, y el registro de la corrida.
 *
 * Lo que NO vive acá: traer las páginas y escribir en Firestore. Eso es de la
 * Cloud Function, y es deliberado — las tres decisiones de abajo son las que
 * pueden hacer daño, así que se prueban con tests y no con un deploy.
 *
 * ── LAS TRES DECISIONES ─────────────────────────────────────────────────────
 *
 *  1. GUARDA DE VOLUMEN. La primera corrida no tiene marca, así que su ventana
 *     es TODO el histórico: 27.214 procesos reconocidos por código solo en el
 *     territorio. Volcarlos sobre la bandeja de Karen no es un radar, es un
 *     vertedero. `evaluarVolumen` aborta por encima del tope y dice qué hacer;
 *     el primer barrido se hace a propósito, acotado y con la ventana escrita.
 *
 *  2. RE-ESCRITURA IDEMPOTENTE. El solape de 45 días existe porque SECOP
 *     COMPLETA los datos después de publicarlos: el mismo proceso se vuelve a
 *     leer varias veces, y la segunda lectura no puede pisar el trabajo
 *     humano. `patchRadarSobreExistente` solo refresca lo DESCRIPTIVO y jamás
 *     toca el estado, el consecutivo, el semáforo, el override ni la oferta de
 *     NEG. La partición está verificada EN TIEMPO DE COMPILACIÓN: cada campo
 *     del documento es refrescable o protegido, y uno nuevo sin clasificar no
 *     compila.
 *
 *  3. REGISTRO DE LA CORRIDA. Sin el agregado, una corrida que no trajo nada y
 *     una corrida que se cayó a la mitad se ven igual. El resumen lo construye
 *     `construirResumenCorrida` (en `secopMapeo.ts`) y acá se le pega el
 *     resultado de la escritura: creados, refrescados, sin cambio.
 */
import type {
  LicitacionDetectada, ReporteIngestaSecop, ResumenCorridaRadar,
} from './secopMapeo'
import type { CronogramaLicitacion, Licitacion } from '../../types/sigp/licitacion'
import type { VentanaIngesta } from './secopConsulta'

// ── 1. Guarda de volumen ─────────────────────────────────────────────────────

export const GUARDA_VOLUMEN = {
  /**
   * Tope de documentos que una corrida automática puede crear. Calibrado
   * contra lo medido: el territorio produce ~12,7 procesos reconocidos por
   * día hábil y el léxico marca ~11 probables por día. Con DOS corridas
   * diarias (06:30 y 14:00) cada una mueve menos todavía — la de la tarde
   * suele crear casi nada, porque lo de la mañana ya está escrito y el
   * compare-before-write no reescribe lo que no cambió. Doscientos deja
   * margen para un lunes con fin de semana acumulado y para el solape, y
   * sigue siendo una bandeja que una persona puede mirar.
   */
  MAX_CREADOS_POR_CORRIDA: 200,
  /**
   * Tope del PRIMER barrido, cuando no hay marca. Más bajo a propósito: la
   * primera corrida es la única que puede traer años de historia.
   */
  MAX_CREADOS_PRIMERA_CORRIDA: 50,
  /**
   * Días de ventana que una corrida automática puede abarcar. Más que esto
   * es un barrido histórico, y un barrido histórico se hace a mano.
   */
  MAX_DIAS_VENTANA: 120,
} as const

export interface VeredictoVolumen {
  procede: boolean
  /** Cuántos documentos NUEVOS crearía la corrida. */
  crearia: number
  /** Se consultó la API: `crearia` y `tope` son datos reales. */
  consultada: true
  tope: number
  /** Días que abarca la ventana, o `null` si es un barrido completo. */
  dias_ventana: number | null
  motivo: string | null
  /** Qué hacer si no procede. En texto, para que quede en el registro. */
  sugerencia: string | null
}

const DIA_MS = 86_400_000

/** Días que abarca la ventana; `null` si no tiene inicio (barrido completo). */
export function diasDeVentana(v: Pick<VentanaIngesta, 'desde' | 'hasta'>): number | null {
  if (!v.desde) return null
  const d = new Date(v.desde).getTime()
  const h = v.hasta ? new Date(v.hasta).getTime() : Date.now()
  if (Number.isNaN(d) || Number.isNaN(h)) return null
  return Math.max(0, Math.round((h - d) / DIA_MS))
}

/**
 * VEREDICTO DE LA VENTANA — lo único que se puede saber ANTES de pedir nada.
 *
 * ── POR QUÉ EXISTE SEPARADO (11-nov-2026) ───────────────────────────────────
 * La guarda de volumen vivía COMPLETA aguas abajo de la cosecha: se evaluaba
 * después de contar y traer las filas. Con `desde: null` eso son **319.531
 * filas medidas contra la API real**, en páginas de 50.000, dentro de una
 * función de 512 MiB: la corrida muere por memoria o por tiempo ANTES de poder
 * decir su propia razón, y lo único que queda es un error opaco en los logs.
 *
 * Una guarda que solo se evalúa después de traer 319.531 filas no es una
 * guarda: es una etiqueta. Explica lo que ya pasó en vez de impedirlo.
 *
 * Así que las reglas se parten por lo que cada una NECESITA:
 *  · Las de VENTANA (sin inicio, demasiado ancha) solo miran la ventana → se
 *    evalúan antes de la primera petición. Son estas.
 *  · La de VOLUMEN (demasiados documentos nuevos) necesita la clasificación →
 *    sigue aguas abajo, en `evaluarVolumen`, que DELEGA en esta para que la
 *    misma regla no tenga dos nacimientos.
 *
 * `consultada: false` no es decoración: es lo que impide leer mal el registro.
 * Un veredicto sin `crearia` dice "no se contó nada porque no se preguntó", y
 * no puede confundirse con "la API no trajo nada".
 */
export interface VeredictoVentana {
  procede: boolean
  dias_ventana: number | null
  motivo: string | null
  sugerencia: string | null
  /** No se consultó la API: no hay nada contado. */
  consultada: false
}

/**
 * ¿Vale la pena consultar siquiera? PURA, y sin red.
 *
 * `autorizado_manual` es la escotilla: un barrido histórico deliberado pasa
 * igual, pero tiene que decirlo. Nada de que el tope se evapore solo.
 */
export function evaluarVentana(
  ventana: Pick<VentanaIngesta, 'desde' | 'hasta'>,
  opciones?: { autorizado_manual?: boolean },
): VeredictoVentana {
  const dias_ventana = diasDeVentana(ventana)
  const base = { dias_ventana, consultada: false as const }

  if (opciones?.autorizado_manual) {
    return { ...base, procede: true, motivo: null, sugerencia: null }
  }
  if (dias_ventana === null) {
    return {
      ...base,
      procede: false,
      motivo: 'VENTANA SIN INICIO: la corrida abarcaría todo el histórico del dataset.',
      sugerencia: 'Primer arranque: correr con una ventana explícita (por ejemplo '
        + 'los últimos 45 días) y, si se quiere el histórico, hacerlo como barrido '
        + 'manual autorizado y acotado por tramos.',
    }
  }
  if (dias_ventana > GUARDA_VOLUMEN.MAX_DIAS_VENTANA) {
    return {
      ...base,
      procede: false,
      motivo: `VENTANA DEMASIADO ANCHA: ${dias_ventana} días (tope ${GUARDA_VOLUMEN.MAX_DIAS_VENTANA}).`,
      sugerencia: 'Una ventana así es un barrido histórico: va por tramos y con '
        + 'autorización, no en la corrida automática.',
    }
  }
  return { ...base, procede: true, motivo: null, sugerencia: null }
}

/**
 * ¿Puede esta corrida escribir, o hay que parar?
 *
 * `autorizado_manual` es la escotilla: un barrido histórico deliberado pasa
 * igual, pero tiene que decirlo. Nada de que el tope se evapore solo.
 */
export function evaluarVolumen(
  crearia: number,
  ventana: Pick<VentanaIngesta, 'desde' | 'hasta' | 'primera_corrida'>,
  opciones?: { autorizado_manual?: boolean },
): VeredictoVolumen {
  const tope = ventana.primera_corrida
    ? GUARDA_VOLUMEN.MAX_CREADOS_PRIMERA_CORRIDA
    : GUARDA_VOLUMEN.MAX_CREADOS_POR_CORRIDA

  // LAS REGLAS DE VENTANA NO SE REPITEN AQUÍ: se delegan. Son las mismas que
  // corren antes de la primera petición, y dos copias divergirían el día que
  // alguien toque una. Lo único propio de este evaluador es el tope de
  // documentos, que necesita la clasificación y por eso vive aguas abajo.
  const v = evaluarVentana(ventana, opciones)
  const dias_ventana = v.dias_ventana
  const base = { crearia, tope, dias_ventana, consultada: true as const }
  if (!v.procede) {
    return { ...base, procede: false, motivo: v.motivo, sugerencia: v.sugerencia }
  }
  if (opciones?.autorizado_manual) {
    return { ...base, procede: true, motivo: null, sugerencia: null }
  }
  if (crearia > tope) {
    return {
      ...base,
      procede: false,
      motivo: `DEMASIADOS DOCUMENTOS NUEVOS: ${crearia} (tope ${tope}`
        + `${ventana.primera_corrida ? ', primera corrida' : ''}).`,
      sugerencia: 'La bandeja no se llena de golpe: acotar la ventana y repetir, '
        + 'o autorizar el volcado a propósito.',
    }
  }
  return { ...base, procede: true, motivo: null, sugerencia: null }
}

// ── 2. Re-escritura idempotente ──────────────────────────────────────────────

/**
 * Campos que el radar PUEDE refrescar cuando vuelve a leer un proceso.
 *
 * Todos son descriptivos y vienen del origen: si SECOP corrige el presupuesto
 * o por fin le pone la categoría, queremos el dato nuevo. `categoria_unspsc`
 * es el caso central — es justamente para eso que existe el solape de 45 días.
 */
export const CAMPOS_REFRESCABLES = [
  'objeto', 'url_proceso', 'entidad', 'categoria_unspsc',
  'presupuesto_oficial', 'lotes', 'cronograma', 'ofertas_recibidas',
  'ganador', 'oferta_ganador',
] as const

/**
 * Campos que el radar NO TOCA nunca después del nacimiento.
 *
 * Son de las personas o de otros dueños:
 *  · `estado` y `motivo_descarte`: los mueve la máquina de estados.
 *  · `consecutivo`: inmutable por la invariante 7.
 *  · el bloque del semáforo: su dueño es `patchRecalcularSemaforo`, y la
 *    invariante 5 prohíbe que la versión del criterio se mueva de refilón.
 *  · `override_manual`: una decisión humana no se borra sola.
 *  · `oferta_neg` y `manifestaciones`: se capturan al presentar, a mano.
 *  · `capacidad_manual`, `responsable_uid`, `activa`, `migrado`, `creado_*`.
 *
 * `modalidad` está acá A PROPÓSITO aunque venga del origen: cambiarla sin
 * recalcular el semáforo dejaría un documento incoherente (verde con una
 * modalidad que debería ser roja), y recalcular el semáforo es un acto
 * explícito. Si el origen la cambia, se CUENTA como cambio material y lo
 * decide una persona.
 */
export const CAMPOS_PROTEGIDOS = [
  // `radar` es la PROCEDENCIA DEL NACIMIENTO: por qué el radar trajo este
  // proceso. Es historia, no estado — si se refrescara, la pregunta "¿alguno
  // de los que entraron por clase sin texto se trabajó?" dejaría de tener
  // respuesta, que es justamente para lo que existe el campo.
  'radar',
  'consecutivo', 'id_secop', 'origen', 'numero_proceso', 'modalidad',
  'semaforo', 'semaforo_motivos', 'semaforo_version', 'override_manual',
  'estado', 'motivo_descarte', 'oferta_neg', 'manifestaciones',
  'migrado', 'capacidad_manual', 'activa',
] as const

/**
 * Exhaustividad EN TIEMPO DE COMPILACIÓN: cada campo del documento del radar
 * es refrescable o protegido. Si mañana el documento gana un campo y nadie
 * dice en qué grupo va, este `const` no compila y el error lo NOMBRA.
 */
type CampoDoc = keyof LicitacionDetectada
type Clasificados = typeof CAMPOS_REFRESCABLES[number] | typeof CAMPOS_PROTEGIDOS[number]
type SinClasificar = Exclude<CampoDoc, Clasificados>
const _TODOS_LOS_CAMPOS: [SinClasificar] extends [never] ? true
  : ['campos del documento sin clasificar como refrescables o protegidos:', SinClasificar] = true
void _TODOS_LOS_CAMPOS

/**
 * Sub-campos que el ORIGEN NUNCA SABE y que llena una PERSONA. El refresco no
 * los puede pisar con el `null` que trae el mapeo.
 *
 * ── EL DEFECTO QUE ESTO EVITA ───────────────────────────────────
 * `cronograma` es REFRESCABLE, y con razón: la fecha de cierre se corrige en
 * el origen y el solape existe para eso. Pero de sus cinco fechas, el mapeo
 * solo conoce `publicacion` y `cierre`; las otras tres salen siempre en
 * `null`. Sin esta guarda, la primera corrida posterior a que Karen escribiera
 * la fecha de manifestación se la BORRABA — en silencio, y sin que nadie
 * pudiera notarlo hasta necesitarla.
 *
 * El límite de manifestación no existe en datos abiertos (medido: 85,8 % de
 * 10.421 procesos). O sea: si una persona lo escribe, es el ÚNICO lugar donde
 * existe. Pisarlo no es perder un refresco, es perder el dato.
 *
 * La regla es asimétrica a propósito, y es la misma de `completarSiFalta`:
 * el origen puede LLENAR un hueco, nunca VACIAR lo que alguien lleno.
 */
export const SUBCAMPOS_DE_PERSONA: Record<string, readonly string[]> = {
  cronograma: ['manifestacion', 'sorteo', 'adjudicacion'],
}

/**
 * El valor a escribir, con los sub-campos de persona preservados cuando el
 * origen los trae vacíos.
 */
export function preservandoLoDePersona(
  campo: string, antes: unknown, ahora: unknown,
): unknown {
  const propios = SUBCAMPOS_DE_PERSONA[campo]
  if (!propios) return ahora
  if (antes === null || typeof antes !== 'object' || Array.isArray(antes)) return ahora
  if (ahora === null || typeof ahora !== 'object' || Array.isArray(ahora)) return ahora
  const a = antes as Record<string, unknown>
  const b = { ...(ahora as Record<string, unknown>) }
  for (const k of propios) {
    const viejo = a[k]
    // Solo se preserva lo que TIENE valor. Si los dos están vacíos no hay nada
    // que preservar, y si el origen trajera algo (hoy no puede) ganaría él.
    if (viejo !== undefined && viejo !== null && (b[k] === undefined || b[k] === null)) {
      b[k] = viejo
    }
  }
  return b
}

export interface PatchRadar {
  /** Lo que se va a escribir. Nunca incluye un campo protegido. */
  patch: Partial<LicitacionDetectada>
  /** Qué cambió, por nombre de campo. Vacío = no se escribe nada. */
  cambios: string[]
  /**
   * Cambios en campos PROTEGIDOS que el origen trae distintos. No se
   * escriben: se cuentan. El caso típico es `modalidad`.
   */
  cambios_materiales: string[]
}

/**
 * Igualdad por VALOR, con las claves ordenadas en profundidad.
 *
 * `JSON.stringify` a secas depende del orden en que se construyó el objeto, y
 * eso ya mordió en este repositorio: comparar dos lecturas REST del mismo
 * documento daba FALSOS «distintos» (gotcha del PR #81). Acá volvió a morder
 * en cuanto `completarSiFalta` empezó a añadir claves al final: el mismo
 * contenido, otro orden, «cambio material».
 *
 * Dos objetos con el mismo contenido son el mismo dato. El orden de las claves
 * es un detalle de cómo se armó, no un hecho del proceso.
 */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico)
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonico(o[k])
      return acc
    }, {})
  }
  return v
}

const igual = (a: unknown, b: unknown): boolean =>
  JSON.stringify(canonico(a ?? null)) === JSON.stringify(canonico(b ?? null))

/**
 * `radar.corrida` es un SELLO DEL ESCRITOR, no un hecho del proceso.
 *
 * El mapeo produce siempre `corrida: null` —lo dice el propio tipo: «lo sella
 * el escritor, no el mapeo»— y `sellarParaEscritura` le pone el id al crear.
 * Comparar el documento guardado (con sello) contra el recién mapeado (sin
 * sello) hacía que `radar` saliera como CAMBIO MATERIAL en **todos** los
 * documentos, en **todas** las corridas. Medido en producción el 12-nov-2026:
 * la corrida de las 19:00 reportó 24 cambios materiales, los 24 en `radar`, y
 * ninguno era un cambio.
 *
 * Eso no es un conteo inflado y ya: `cambios_materiales` existe para que una
 * persona mire lo que el origen cambió por debajo —el caso típico es
 * `modalidad`—, y un campo que grita en cada corrida es exactamente la forma
 * de que nadie vuelva a mirar la lista.
 */
const SELLOS_DEL_ESCRITOR: Record<string, readonly string[]> = { radar: ['corrida'] }

const sinSellos = (campo: string, v: unknown): unknown => {
  const quitar = SELLOS_DEL_ESCRITOR[campo]
  if (!quitar || v === null || typeof v !== 'object') return v
  const copia = { ...(v as Record<string, unknown>) }
  for (const k of quitar) delete copia[k]
  return copia
}

/**
 * Sub-campos que el documento guardado NO TIENE y el origen SÍ trae: se
 * COMPLETAN, nunca se sobrescriben.
 *
 * Es el patrón «completa-si-falta» que ya usa `sincronizarObraEspejo` con las
 * coordenadas. El caso que lo motiva: los documentos que el radar escribió
 * antes de que se capturaran `fase` y `portafolio` no los tienen, y `radar` es
 * un campo PROTEGIDO —no se refresca— así que sin esto nunca los tendrían y
 * además reportarían «cambio material» para siempre.
 *
 * La asimetría es deliberada y es la misma de la obra-espejo: **rellenar un
 * hueco no es reescribir historia.** Un sub-campo con valor se queda como
 * está, aunque el origen diga otra cosa; eso sí sería reescribir, y para eso
 * está `cambios_materiales`.
 */
export function completarSiFalta(
  antes: unknown, ahora: unknown,
): { valor: Record<string, unknown>; llenados: string[] } | null {
  if (antes === null || typeof antes !== 'object' || Array.isArray(antes)) return null
  if (ahora === null || typeof ahora !== 'object' || Array.isArray(ahora)) return null
  const a = antes as Record<string, unknown>
  const b = ahora as Record<string, unknown>
  const llenados = Object.keys(b).filter(k => a[k] === undefined && b[k] !== undefined)
  if (llenados.length === 0) return null
  const valor = { ...a }
  for (const k of llenados) valor[k] = b[k]
  return { valor, llenados }
}

/**
 * Patch de una RE-LECTURA sobre un documento que ya existe.
 *
 * Compare-before-write (patrón de la CF de compras): si nada cambió devuelve
 * `cambios: []` y el caller NO escribe. Una corrida que re-escribe 3.000
 * documentos idénticos cada día cuesta dinero, ensucia la auditoría y además
 * dispara los triggers de todo el mundo.
 */
export function patchRadarSobreExistente(
  existente: Readonly<Partial<LicitacionDetectada>>,
  nuevo: Readonly<LicitacionDetectada>,
): PatchRadar {
  const patch: Partial<LicitacionDetectada> = {}
  const cambios: string[] = []
  for (const campo of CAMPOS_REFRESCABLES) {
    const antes = (existente as Record<string, unknown>)[campo]
    // Lo que el origen trae, con las fechas de persona a salvo.
    const ahora = preservandoLoDePersona(
      campo, antes, (nuevo as Record<string, unknown>)[campo],
    )
    if (!igual(antes, ahora)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(patch as any)[campo] = ahora
      cambios.push(campo)
    }
  }
  const cambios_materiales: string[] = []
  for (const campo of CAMPOS_PROTEGIDOS) {
    const antes = (existente as Record<string, unknown>)[campo]
    const ahora = (nuevo as Record<string, unknown>)[campo]
    // Solo cuenta si el documento YA tenía valor: un campo que nunca se
    // escribió no es un cambio material, es un documento viejo.
    if (antes === undefined) continue

    // Primero: los huecos se rellenan. Un sub-campo que el documento no tiene
    // no es una discrepancia con el origen, es una ausencia.
    const relleno = completarSiFalta(antes, ahora)
    if (relleno) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(patch as any)[campo] = relleno.valor
      cambios.push(`${campo} (completado: ${relleno.llenados.join(', ')})`)
    }

    // Y recién ahí se compara lo que QUEDA, sin los sellos del escritor.
    const base = relleno ? relleno.valor : antes
    if (!igual(sinSellos(campo, base), sinSellos(campo, ahora))) {
      cambios_materiales.push(campo)
    }
  }
  return { patch, cambios, cambios_materiales }
}

/** ¿Hay algo que escribir? */
export const hayQueEscribir = (p: PatchRadar): boolean => p.cambios.length > 0

// ── 2-bis. El sello del escritor ─────────────────────────────────────────────

/**
 * Campos que el DOCUMENTO de `licitaciones` exige y que el mapeo no puede
 * conocer: quién lo creó, cuándo, y de qué corrida salió. El mapeo es puro y
 * no tiene reloj; el escritor sí.
 *
 * `responsable_uid` nace VACÍO a propósito: nadie es responsable de un proceso
 * que todavía nadie miró, y poner al sistema ahí sería mentir en un campo que
 * la bandeja usa para repartir trabajo.
 */
export interface SelloEscritura<T> {
  /** Id de la corrida que lo trajo. */
  corrida: string
  /** Momento de la escritura, en el tipo que use el escritor. */
  ahora: T
  /** Quién escribe. Para el radar, un identificador de sistema. */
  actor: string
}

export const ACTOR_RADAR = 'radar_secop'

/**
 * El documento que el escritor del radar PONE en `licitaciones`: `Licitacion`
 * completa, con las fechas en el tipo del escritor (`T`) en vez de `Timestamp`
 * —`Timestamp` en la CF, cualquier cosa en el test— más el bloque `radar`.
 *
 * ── POR QUÉ ESTE TIPO EXISTE ────────────────────────────────────────────────
 * Porque el sello devolvía `Record<string, unknown>` y el sitio de la llamada
 * remataba con `as unknown as LicitacionDetectada`. Entre las dos cosas, el
 * compilador dejaba de comparar lo que el radar escribe contra lo que la
 * colección exige — y así se perdió `semaforo_calculado_en`, que `Licitacion`
 * declara OBLIGATORIO y el camino del radar no escribía.
 *
 * El campo no rompía nada el día que faltó: hoy nadie lo lee. Lo rompía después,
 * y de la peor forma. El camino de recálculo (`recalcularSemaforo`) SÍ lo
 * escribe, así que una fila se "arregla sola" la primera vez que alguien la
 * recalcula: el fallo habría quedado intermitente y con forma de "solo algunas
 * filas viejas del radar", que es lo más caro de diagnosticar que hay.
 *
 * Lo que este tipo compra no es el campo —ese es una línea— sino que el
 * PRÓXIMO campo que se agregue a `Licitacion` y el radar no escriba **falle al
 * compilar**, en vez de llegar a producción y esperar a que algo lo lea.
 *
 * `radar` se toma de `LicitacionDetectada` porque ahí vive su forma hoy; cuando
 * B.3 lo declare en `Licitacion` (decisión D2), este `Pick` se cae solo.
 */
export type DocumentoRadar<T> =
  Omit<Licitacion, 'cronograma' | 'semaforo_calculado_en' | 'creado_en' | 'actualizado_en'>
  & Pick<LicitacionDetectada, 'radar'>
  & {
    cronograma: Record<keyof CronogramaLicitacion, T | null>
    semaforo_calculado_en: T
    creado_en: T
    actualizado_en: T
  }

/** Lo que el sello recibe: el documento del mapeo con las fechas ya convertidas
 *  (la salida exacta de `fechasATimestamp`). */
export type DetectadaConFechas<T> =
  Omit<LicitacionDetectada, 'cronograma'>
  & { cronograma: Record<keyof CronogramaLicitacion, T | null> }

/**
 * Agrega al documento lo que solo el escritor sabe. PURA: el `ahora` y el id de
 * corrida entran por parámetro, así que un test puede comparar el resultado
 * campo por campo.
 *
 * `semaforo_calculado_en` se sella AQUÍ y no en el mapeo a propósito: el mapeo
 * es puro y no toca el SDK (lo dice su propia cabecera), las fechas le salen en
 * ISO y la conversión es del escritor. El instante en que se calculó el
 * semáforo ES el instante de la corrida, el mismo `creado_en`.
 */
export function sellarParaEscritura<T>(
  doc: Readonly<DetectadaConFechas<T>>, sello: SelloEscritura<T>,
): DocumentoRadar<T> {
  return {
    ...doc,
    radar: { ...doc.radar, corrida: sello.corrida },
    semaforo_calculado_en: sello.ahora,
    responsable_uid: '',
    // Recien traida por el radar: NADIE la ha revisado todavia. Que estos dos
    // campos nazcan en null es justamente lo que hace que el triage signifique
    // algo cuando alguien los llene (D3).
    revisado_por: null,
    revisado_en: null,
    creado_por: sello.actor,
    creado_en: sello.ahora,
    actualizado_por: sello.actor,
    actualizado_en: sello.ahora,
  }
}

/**
 * Convierte a `Timestamp` las fechas que el mapeo dejó en ISO.
 *
 * El mapeo devuelve ISO porque es puro y no toca el SDK (mismo reparto que el
 * importador histórico); la conversión es del escritor, y va acá para que
 * también tenga test. `hacer` se inyecta: `Timestamp.fromDate` en la CF,
 * cualquier cosa en el test.
 */
export function fechasATimestamp<T>(
  doc: Readonly<LicitacionDetectada>, hacer: (iso: string) => T,
): DetectadaConFechas<T> {
  const c = doc.cronograma
  return {
    ...doc,
    cronograma: {
      publicacion: c.publicacion === null ? null : hacer(c.publicacion),
      manifestacion: null,
      sorteo: null,
      cierre: c.cierre === null ? null : hacer(c.cierre),
      adjudicacion: null,
    },
  }
}

// ── 3. El plan de escritura y el registro de la corrida ─────────────────────

export interface PlanEscritura {
  /** Documentos que no existen: se crean. */
  crear: { doc_id: string; doc: LicitacionDetectada }[]
  /** Documentos que existen y cambiaron: se refrescan con su patch. */
  refrescar: { doc_id: string; patch: Partial<LicitacionDetectada>; cambios: string[] }[]
  /** Existen y no cambiaron: no se tocan. */
  sin_cambio: number
  /** Cambios en campos protegidos, contados y no escritos. */
  cambios_materiales: { doc_id: string; campos: string[] }[]
}

// ── La identidad del documento y el portafolio (3a) ─────────────────────────

/** Un registro con el doc id que el mapeo le calculó. */
export type RegistroConDestino = {
  doc: LicitacionDetectada
  meta: { doc_id: string }
}

export interface FusionPorPortafolio {
  portafolio: string
  /** El doc id que el mapeo había calculado y que NO se va a usar. */
  doc_id_descartado: string
  /** El documento donde esa fase se escribe. */
  doc_id_destino: string
  /** `corrida` si los dos venían en la misma cosecha; `existente` si el destino ya estaba. */
  por: 'corrida' | 'existente'
}

export interface ResolucionIdentidad<R> {
  registros: R[]
  fusiones: FusionPorPortafolio[]
}

/** Qué tan avanzada está la fase: más fases previas = más adelante en la cadena. */
const avance = (r: RegistroConDestino): number => (r.doc.radar?.fases_previas ?? []).length


/**
 * Resuelve a QUÉ documento va cada fila, usando el portafolio.
 *
 * ── EL DEFECTO QUE ESTO ARREGLA ─────────────────────────────────────────────
 *
 * La identidad del documento es `docIdSecop(id_del_proceso)`, y SECOP publica
 * **una fila por FASE** con un `id_del_proceso` distinto en cada una. Así que
 * la misma licitación nacía dos veces: medido el 14-nov, 129 documentos eran
 * 113 licitaciones — el 12 % de la cola de Karen era la misma cosa dos veces.
 *
 * Lo único que une las fases es `id_del_portafolio` (cruzan 10.421 de 11.463,
 * el 90,9 %).
 *
 * ── POR QUÉ NO BASTABA CAMBIAR EL COLAPSO ───────────────────────────────────
 *
 * Agrupar las FILAS por portafolio no alcanza: el doc id sale del
 * `id_del_proceso` del representante, y cuál es el representante cambia cuando
 * llega una fase nueva. La misma licitación podía acabar con un TERCER
 * documento. El arreglo tiene que estar en la identidad, no en el colapso.
 *
 * ── EL ORDEN DE LAS DOS VÍAS, Y POR QUÉ ES ESTE ─────────────────────────────
 *
 * 1. Si el doc id propio YA EXISTE, se usa ese. Es el camino de siempre, y es
 *    el que cubre el caso del documento que nació sin portafolio y después lo
 *    gana: la consulta por portafolio no lo encuentra, su propio id sí, y
 *    queda actualizado con su portafolio — de ahí en adelante las fases
 *    siguientes lo encuentran por la primera vía.
 * 2. Si no existe y hay portafolio, se busca un documento con ese portafolio.
 * 3. Si tampoco, pero OTRA FILA DE ESTA MISMA COSECHA comparte el portafolio,
 *    las dos van al mismo documento. Sin esto el arreglo no serviría para el
 *    caso normal: cuando una licitación es nueva, sus dos fases llegan juntas
 *    y ninguna existe todavía.
 * 4. Si no hay portafolio, su propio doc id. El 9,1 % sin portafolio no es una
 *    excepción: es el caso base, y no se puede agrupar de ninguna manera.
 *
 * El doc id propio va PRIMERO a propósito, y no al revés: si se preguntara por
 * portafolio antes, una fila cuyo documento ya existe podría terminar escrita
 * en OTRO documento —y la consulta no garantiza cuál devuelve primero cuando
 * hay dos—. Abandonar un documento que ya existe, de forma no determinista, es
 * peor que el duplicado que se está arreglando.
 *
 * ── QUÉ FILA MANDA CUANDO DOS VAN AL MISMO DOCUMENTO ────────────────────────
 *
 * La de la fase MÁS AVANZADA, medida por cuántas fases previas arrastra. Su
 * plazo es el que importa —en menor cuantía la fecha operativa es el cierre de
 * ofertas— y `fases_previas` conserva igual las anteriores, así que la
 * detección de manifestación cerrada sigue funcionando. El doc id, en cambio,
 * sale del MENOR de los ids: es estable entre corridas, y una identidad que
 * cambia de un día para otro es otro duplicado con otro nombre.
 *
 * PURA: no lee ni escribe. Las consultas las hace el caller.
 */
export function resolverPorPortafolio<R extends RegistroConDestino>(
  registros: readonly R[],
  existentesPorId: ReadonlySet<string>,
  docIdPorPortafolio: ReadonlyMap<string, string>,
): ResolucionIdentidad<R> {
  const fusiones: FusionPorPortafolio[] = []

  // Paso 1: lo que ya existe por su propio id se queda donde está.
  const yaExiste = new Set<string>()
  for (const r of registros) {
    if (existentesPorId.has(r.meta.doc_id)) yaExiste.add(r.meta.doc_id)
  }

  // Paso 2: agrupar por portafolio los que NO existen por su propio id.
  const grupos = new Map<string, R[]>()
  const sueltos: R[] = []
  for (const r of registros) {
    const pf = r.doc.radar?.portafolio ?? null
    if (yaExiste.has(r.meta.doc_id) || pf === null || pf === '') {
      sueltos.push(r)
      continue
    }
    const g = grupos.get(pf)
    if (g) g.push(r)
    else grupos.set(pf, [r])
  }

  const salida: R[] = [...sueltos]

  for (const [pf, g] of grupos) {
    // El destino: un documento existente con ese portafolio, o el menor id del
    // grupo — estable entre corridas.
    const existente = docIdPorPortafolio.get(pf) ?? null
    const ordenados = [...g].sort((a, b) => a.meta.doc_id.localeCompare(b.meta.doc_id))
    const destino = existente ?? ordenados[0].meta.doc_id
    const por: 'corrida' | 'existente' = existente !== null ? 'existente' : 'corrida'

    // La fila que manda: la fase más avanzada; empate por doc id para no
    // depender del orden en que la API devolvió las filas.
    const manda = [...g].sort((a, b) => {
      const d = avance(b) - avance(a)
      return d !== 0 ? d : a.meta.doc_id.localeCompare(b.meta.doc_id)
    })[0]

    // Se reporta descartado TODO id del grupo que no sea el destino. Ojo con
    // el error facil: descartar `manda` en vez del destino. Son cosas
    // distintas — `manda` aporta el CONTENIDO, el destino aporta la
    // IDENTIDAD, y cuando no coinciden el id que se pierde es el de `manda`.
    for (const r of g) {
      if (r.meta.doc_id === destino) continue
      fusiones.push({
        portafolio: pf,
        doc_id_descartado: r.meta.doc_id,
        doc_id_destino: destino,
        por,
      })
    }

    // Se arrastra el registro COMPLETO y solo cambia el doc_id. El resto de
    // `meta` —la clasificacion, el origen de la fecha, la familia— es lo que
    // el reporte de la corrida cuenta: perderlo dejaria el agregado mintiendo
    // sobre con que criterio entro cada cosa.
    salida.push({ ...manda, meta: { ...manda.meta, doc_id: destino } })
  }

  return { registros: salida, fusiones }
}

/**
 * Los portafolios de una cosecha, listos para consultar.
 *
 * En lotes de 30 porque es el tope del operador `in` de Firestore — medido
 * contra producción, no supuesto: con 31 valores responde
 * `'IN' supports up to 30 comparison values`.
 */
export const TOPE_IN_FIRESTORE = 30

export function lotesDePortafolios(
  registros: readonly RegistroConDestino[],
  tope: number = TOPE_IN_FIRESTORE,
): string[][] {
  const pfs = new Set<string>()
  for (const r of registros) {
    const pf = r.doc.radar?.portafolio
    if (typeof pf === 'string' && pf !== '') pfs.add(pf)
  }
  const todos = [...pfs]
  const lotes: string[][] = []
  for (let i = 0; i < todos.length; i += tope) lotes.push(todos.slice(i, i + tope))
  return lotes
}

/**
 * Arma el plan a partir de lo ingerido y de lo que ya hay en la colección.
 *
 * `existentes` es un mapa doc_id -> documento actual (lo que el caller leyó).
 * PURA: no lee ni escribe; solo decide.
 */
export function planearEscritura(
  registros: readonly { doc: LicitacionDetectada; meta: { doc_id: string } }[],
  existentes: ReadonlyMap<string, Readonly<Partial<LicitacionDetectada>>>,
): PlanEscritura {
  const plan: PlanEscritura = {
    crear: [], refrescar: [], sin_cambio: 0, cambios_materiales: [],
  }
  for (const r of registros) {
    const doc_id = r.meta.doc_id
    const actual = existentes.get(doc_id)
    if (!actual) {
      plan.crear.push({ doc_id, doc: r.doc })
      continue
    }
    const p = patchRadarSobreExistente(actual, r.doc)
    if (p.cambios_materiales.length > 0) {
      plan.cambios_materiales.push({ doc_id, campos: p.cambios_materiales })
    }
    if (hayQueEscribir(p)) plan.refrescar.push({ doc_id, patch: p.patch, cambios: p.cambios })
    else plan.sin_cambio++
  }
  return plan
}

export interface ResultadoEscritura {
  creados: number
  refrescados: number
  sin_cambio: number
  cambios_materiales: { doc_id: string; campos: string[] }[]
}

/** El registro de la corrida: el agregado de la ingesta + lo que se escribió. */
export interface RegistroCorridaRadar extends ResumenCorridaRadar {
  /** El de VOLUMEN si se consultó; el de VENTANA si se detuvo antes de pedir. */
  volumen: VeredictoVolumen | VeredictoVentana
  escritura: ResultadoEscritura | null
  /** Marca que queda para la próxima corrida. */
  marca_nueva: string | null
}

/**
 * Registro final de la corrida. `escritura: null` significa que la guarda de
 * volumen la detuvo — y ESO también se registra: una corrida abortada que no
 * deja rastro es indistinguible de una corrida que no encontró nada.
 */
export function construirRegistroCorrida(
  resumen: ResumenCorridaRadar,
  volumen: VeredictoVolumen | VeredictoVentana,
  escritura: ResultadoEscritura | null,
  marca_nueva: string | null,
): RegistroCorridaRadar {
  return { ...resumen, volumen, escritura, marca_nueva }
}

/**
 * La marca que queda para la próxima corrida.
 *
 * Es el `hasta` de la ventana, NO el máximo de las fechas vistas: si la
 * corrida no trajo nada, el máximo sería `null` y la marca se quedaría
 * clavada, re-leyendo lo mismo para siempre. Y solo avanza si se escribió:
 * una corrida detenida por la guarda no mueve la marca, o el tramo que no
 * entró quedaría saltado sin que nadie lo note.
 */
export function marcaSiguiente(
  ventana: Pick<VentanaIngesta, 'hasta'>,
  escribio: boolean,
  marcaActual: string | null,
): string | null {
  if (!escribio) return marcaActual
  return ventana.hasta ?? marcaActual
}

/** ¿Vale la pena guardar el registro de esta corrida? Siempre. */
export function resumenLegible(r: RegistroCorridaRadar): string {
  const e = r.escritura
  const partes = [
    `modo ${r.modo}`,
    `ventana ${r.ventana.desde ?? '(sin inicio)'} → ${r.ventana.hasta ?? '(hoy)'}`,
    `${r.filas_vistas} filas / ${r.procesos_vistos} procesos`,
    `si ${r.por_veredicto.si} · probable ${r.por_veredicto.probable} · no ${r.por_veredicto.no}`,
    e
      ? `creados ${e.creados} · refrescados ${e.refrescados} · sin cambio ${e.sin_cambio}`
      : `NO SE ESCRIBIÓ: ${r.volumen.motivo ?? 'guarda de volumen'}`,
  ]
  if (r.descartes.con_texto_coincidente > 0) {
    partes.push(`descartados por código con texto de NEG: ${r.descartes.con_texto_coincidente}`)
  }
  if (r.observados.habrian_calificado > 0) {
    partes.push(`habrían calificado fuera del territorio: ${r.observados.habrian_calificado}`)
  }
  return partes.join(' · ')
}

// ── 4. El estado del radar: la marca, el historial y el acumulado ───────────

/**
 * UN SOLO DOCUMENTO para todo el estado del radar: `configuracion/radar_secop`.
 *
 * ── POR QUÉ UN DOC DE `configuracion` Y NO UNA COLECCIÓN NUEVA ──────────────
 *
 * Precedente de la casa: `configuracion/censo_consecutivos`, que escribe solo
 * su CF con Admin SDK y el panel LEE por el match genérico de `configuracion`
 * (`accesoSIGP`). Consecuencia práctica: **NO hace falta regla nueva**, o sea
 * un deploy menos de reglas. Una colección `corridas_radar` habría exigido su
 * propia regla de lectura sin dar nada que este documento no dé.
 *
 * El precio es el límite de 1 MB, y de ahí la forma: el REGISTRO COMPLETO solo
 * de la última corrida, un historial ACOTADO de resúmenes, y un ACUMULADO
 * monótono que sobrevive a la poda. Así la pregunta de los tres meses
 * —"¿cuántos entraron por evidencia sin texto?"— se responde con el acumulado,
 * y "¿alguno se trabajó?" con `licitaciones.radar.senal`, que vive en cada
 * documento.
 */
export interface EstadoRadar {
  /** Marca de la última corrida que SÍ escribió. `null` = nunca corrió. */
  marca: string | null
  solape_dias: number
  /** Escotilla de la guarda de volumen. La pone una persona, no la CF. */
  autorizado_manual?: boolean
  /** El registro completo de la última corrida. */
  ultima_corrida: RegistroCorridaRadar | null
  /** Historial acotado: lo justo para ver la tendencia. */
  corridas: {
    ejecutada_en: string
    resumen: string
    procesos_vistos: number
    persistidos: number
    escribio: boolean
  }[]
  /** Totales monótonos, que sobreviven a la poda del historial. */
  acumulado: {
    corridas: number
    corridas_detenidas: number
    procesos_vistos: number
    creados: number
    refrescados: number
    /** Los que entraron por clase sin que el texto lo dijera. */
    evidencia_sin_texto: number
    /** Los que habrían calificado fuera del territorio. */
    observados_habrian_calificado: number
    /** Descartados por código aunque el léxico los reconoce. */
    descartados_con_texto: number
  }
}

/** Cuántas corridas se guardan en el historial del documento. */
export const MAX_CORRIDAS_EN_HISTORIAL = 30

export const ESTADO_RADAR_INICIAL: EstadoRadar = {
  marca: null,
  solape_dias: 45,
  ultima_corrida: null,
  corridas: [],
  acumulado: {
    corridas: 0, corridas_detenidas: 0, procesos_vistos: 0, creados: 0,
    refrescados: 0, evidencia_sin_texto: 0, observados_habrian_calificado: 0,
    descartados_con_texto: 0,
  },
}

/**
 * Nuevo estado del radar tras una corrida. PURA.
 *
 * El acumulado suma SIEMPRE —incluso si la corrida se detuvo— porque lo que
 * mide es lo que el radar VIO, no lo que escribió; y `corridas_detenidas` deja
 * ver cuántas veces la guarda tuvo que intervenir. La marca la decide
 * `marcaSiguiente`, que no avanza si no se escribió.
 */
export function avanzarEstadoRadar(
  actual: Readonly<EstadoRadar> | null | undefined,
  registro: RegistroCorridaRadar,
  max = MAX_CORRIDAS_EN_HISTORIAL,
): EstadoRadar {
  const base = actual ?? ESTADO_RADAR_INICIAL
  const escribio = registro.escritura !== null
  const e = registro.escritura
  const entrada = {
    ejecutada_en: registro.ejecutada_en,
    resumen: resumenLegible(registro),
    procesos_vistos: registro.procesos_vistos,
    persistidos: e ? e.creados + e.refrescados : 0,
    escribio,
  }
  const a = base.acumulado
  return {
    marca: registro.marca_nueva ?? base.marca,
    solape_dias: base.solape_dias,
    ...(base.autorizado_manual !== undefined
      // La escotilla se CONSUME: si alguien autorizó un volcado, no queda
      // autorizado para siempre.
      ? { autorizado_manual: false }
      : {}),
    ultima_corrida: registro,
    corridas: [entrada, ...base.corridas].slice(0, max),
    acumulado: {
      corridas: a.corridas + 1,
      corridas_detenidas: a.corridas_detenidas + (escribio ? 0 : 1),
      procesos_vistos: a.procesos_vistos + registro.procesos_vistos,
      creados: a.creados + (e?.creados ?? 0),
      refrescados: a.refrescados + (e?.refrescados ?? 0),
      evidencia_sin_texto: a.evidencia_sin_texto + registro.evidencia_sin_texto.total,
      observados_habrian_calificado:
        a.observados_habrian_calificado + registro.observados.habrian_calificado,
      descartados_con_texto:
        a.descartados_con_texto + registro.descartes.con_texto_coincidente,
    },
  }
}

/** Reporte de ingesta + plan, para que el caller no recalcule nada. */
export function cuantosCrearia(
  reporte: Pick<ReporteIngestaSecop, 'registros'>,
  existentes: ReadonlySet<string>,
): number {
  let n = 0
  for (const r of reporte.registros) if (!existentes.has(r.meta.doc_id)) n++
  return n
}
