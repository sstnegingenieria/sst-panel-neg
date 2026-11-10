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
import type { VentanaIngesta } from './secopConsulta'

// ── 1. Guarda de volumen ─────────────────────────────────────────────────────

export const GUARDA_VOLUMEN = {
  /**
   * Tope de documentos que una corrida automática puede crear. Calibrado
   * contra lo medido: el territorio produce ~12,7 procesos reconocidos por
   * día hábil y el léxico marca ~11 probables por día, así que una corrida
   * diaria normal mueve decenas. Doscientos deja margen para un lunes con
   * fin de semana acumulado y para el solape, y sigue siendo una bandeja que
   * una persona puede mirar.
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
  const dias_ventana = diasDeVentana(ventana)
  const tope = ventana.primera_corrida
    ? GUARDA_VOLUMEN.MAX_CREADOS_PRIMERA_CORRIDA
    : GUARDA_VOLUMEN.MAX_CREADOS_POR_CORRIDA

  if (opciones?.autorizado_manual) {
    return {
      procede: true, crearia, tope, dias_ventana,
      motivo: null,
      sugerencia: null,
    }
  }

  if (dias_ventana === null) {
    return {
      procede: false, crearia, tope, dias_ventana,
      motivo: 'VENTANA SIN INICIO: la corrida abarcaría todo el histórico del dataset.',
      sugerencia: 'Primer arranque: correr con una ventana explícita (por ejemplo '
        + 'los últimos 45 días) y, si se quiere el histórico, hacerlo como barrido '
        + 'manual autorizado y acotado por tramos.',
    }
  }
  if (dias_ventana > GUARDA_VOLUMEN.MAX_DIAS_VENTANA) {
    return {
      procede: false, crearia, tope, dias_ventana,
      motivo: `VENTANA DEMASIADO ANCHA: ${dias_ventana} días (tope ${GUARDA_VOLUMEN.MAX_DIAS_VENTANA}).`,
      sugerencia: 'Una ventana así es un barrido histórico: va por tramos y con '
        + 'autorización, no en la corrida automática.',
    }
  }
  if (crearia > tope) {
    return {
      procede: false, crearia, tope, dias_ventana,
      motivo: `DEMASIADOS DOCUMENTOS NUEVOS: ${crearia} (tope ${tope}`
        + `${ventana.primera_corrida ? ', primera corrida' : ''}).`,
      sugerencia: 'La bandeja no se llena de golpe: acotar la ventana y repetir, '
        + 'o autorizar el volcado a propósito.',
    }
  }
  return { procede: true, crearia, tope, dias_ventana, motivo: null, sugerencia: null }
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

const igual = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

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
    const ahora = (nuevo as Record<string, unknown>)[campo]
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
    if (antes !== undefined && !igual(antes, ahora)) cambios_materiales.push(campo)
  }
  return { patch, cambios, cambios_materiales }
}

/** ¿Hay algo que escribir? */
export const hayQueEscribir = (p: PatchRadar): boolean => p.cambios.length > 0

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
  volumen: VeredictoVolumen
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
  volumen: VeredictoVolumen,
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

/** Reporte de ingesta + plan, para que el caller no recalcule nada. */
export function cuantosCrearia(
  reporte: Pick<ReporteIngestaSecop, 'registros'>,
  existentes: ReadonlySet<string>,
): number {
  let n = 0
  for (const r of reporte.registros) if (!existentes.has(r.meta.doc_id)) n++
  return n
}
