/**
 * Bandeja de licitaciones (1.4) — secciones, orden y capacidad semanal.
 *
 * PURO: sin Firestore, sin React. La página persiste EXACTAMENTE lo que
 * devuelven los planificadores de acá; no improvisa writes.
 *
 * La idea de fondo: la bandeja no es una lista, es una COLA CON TOPE. Karen
 * no puede armar veinte propuestas a la semana, así que mostrar veinte
 * "activas" en igualdad de condiciones es mentirle al que mira. Lo que excede
 * el tope se muestra igual —abajo y atenuado— porque esconderlo sería peor:
 * el trabajo que no cabe sigue existiendo.
 */
import type {
  EstadoLicitacion, Licitacion, SenalClasificacion, Semaforo, Timestamp,
} from '../../types/sigp/licitacion'
import { esDelRadar, esLicitacionTerminal } from '../../types/sigp/licitacion'

/** Licitación con su id de documento (lo que consume la UI). */
export type LicitacionConId = Licitacion & { id: string }

export type SeccionBandeja = 'radar' | 'activas' | 'descartadas' | 'cerradas'

/** El radar va PRIMERO: es la cola de entrada, lo que todavia no es de nadie. */
export const SECCIONES_BANDEJA: SeccionBandeja[] = ['radar', 'activas', 'descartadas', 'cerradas']

export const SECCION_LABEL: Record<SeccionBandeja, string> = {
  radar: 'Radar',
  activas: 'Activas',
  descartadas: 'Descartadas',
  cerradas: 'Cerradas',
}

/** Tope por defecto si `configuracion/licitaciones` no existe todavía. */
export const CAPACIDAD_SEMANAL_DEFAULT = 5

/**
 * Sección de una licitación.
 *
 * `descartada` va a su propia sección (no es "cerrada": se reabre, y su
 * motivo es lo que se quiere poder filtrar). Los cinco terminales duros son
 * "cerradas". Todo lo demás está en juego.
 *
 * ── LA PROCEDENCIA DECIDE, NO EL ESTADO (D1) ────────────────────────────────
 * Una `detectada` QUE TRAJO EL RADAR va a `radar`; una `detectada` tecleada a
 * mano se queda en `activas`, porque alguien la escribió a propósito.
 *
 * El daño que esto repara estaba medido: `repartirPorCapacidad` recibe las
 * `activas`, y las filas del radar nacen con `capacidad_manual: null`, así que
 * entraban a competir, se ordenaban por fecha de cierre y **empujaban fuera del
 * cupo semanal a licitaciones reales de Karen**. Un radar que le reordena la
 * semana a quien debía ayudar no es un radar. Sacarlas de `activas` es lo único
 * que lo arregla: un filtro cambia lo que se ve, no lo que compite.
 *
 * `radar` es OPCIONAL en el parámetro a propósito: los ~350 del registro
 * histórico no tienen el campo, y su ausencia significa "no vino del radar" —
 * la misma convención que `esDelRadar`. Así un caller que solo conoce el estado
 * sigue funcionando y cae del lado seguro.
 */
export function seccionDe(
  l: Pick<Licitacion, 'estado'> & Partial<Pick<Licitacion, 'radar'>>,
): SeccionBandeja {
  if (l.estado === 'descartada') return 'descartadas'
  if (esLicitacionTerminal(l.estado)) return 'cerradas'
  if (l.estado === 'detectada' && esDelRadar(l)) return 'radar'
  return 'activas'
}

/**
 * ¿Esta licitación compite por un cupo de la semana?
 *
 * Solo verdes y amarillas. Una roja no ocupa capacidad porque el portero no
 * la deja avanzar sin override — y si tiene override, el criterio ya no la
 * está frenando y entra a competir como cualquiera.
 */
export function compitePorCupo(l: Pick<Licitacion, 'semaforo' | 'override_manual'>): boolean {
  return l.semaforo !== 'rojo' || l.override_manual !== null
}

/**
 * Orden de las activas: por fecha de cierre ASCENDENTE — lo que vence primero
 * primero. Sin fecha va al final (no se puede priorizar lo que no tiene reloj),
 * y entre iguales manda el número de proceso para que el orden sea estable
 * entre renders.
 */
export function ordenarPorCierre(a: LicitacionConId, b: LicitacionConId): number {
  const ma = a.cronograma.cierre?.toMillis?.() ?? null
  const mb = b.cronograma.cierre?.toMillis?.() ?? null
  if (ma === null && mb === null) return a.numero_proceso.localeCompare(b.numero_proceso, 'es')
  if (ma === null) return 1
  if (mb === null) return -1
  if (ma !== mb) return ma - mb
  return a.numero_proceso.localeCompare(b.numero_proceso, 'es')
}

/**
 * ¿El origen no le dio ninguna fecha a este proceso?
 *
 * Desde el PR #252 la corrida automática excluye estas filas, así que una que
 * esté en la colección entró por el BARRIDO AUTORIZADO del backlog.
 */
export function sinFechaEnElOrigen(l: Pick<Licitacion, 'radar'>): boolean {
  return l.radar?.origen_fecha === 'ninguna'
}

/**
 * ¿El plazo de este proceso YA VENCIÓ?
 *
 * Compara contra `hoy` en formato ISO `AAAA-MM-DD` —no contra `Date.now()`—
 * para que la función sea pura y testeable, y para que la comparación sea por
 * DÍA CIVIL y no por instante: un proceso que cierra hoy sigue vivo hasta el
 * final del día, aunque sean las 23:00.
 *
 * Sin fecha de cierre NO está vencido: no se puede declarar muerto lo que no
 * tiene reloj. Esas filas tienen su propio lugar, arriba de todo.
 */
export function plazoVencido(
  l: Pick<Licitacion, 'cronograma'>, hoy: string,
): boolean {
  const d = l.cronograma.cierre?.toDate?.()
  if (!d) return false
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return iso < hoy
}

export interface RepartoRadar {
  /** El origen no les dio fecha. Van ARRIBA: nadie puede priorizarlas solo. */
  sinFecha: LicitacionConId[]
  /** Lo que todavía se puede trabajar, por fecha de cierre. */
  vigentes: LicitacionConId[]
  /** El plazo ya pasó. NO se esconden: se muestran al final y se dicen muertas. */
  vencidas: LicitacionConId[]
}

/**
 * Reparte la cola del radar en tres, y es el ÚNICO criterio de orden de esa
 * sección.
 *
 * ── POR QUÉ LOS VENCIDOS VAN APARTE ────────────────────────────────────────
 * Medido el 12-nov-2026 sobre lo que el radar escribió en producción: **12 de
 * 24 documentos tenían el cierre YA PASADO**. La bandeja los mostraba mezclados
 * con los vivos y con la misma pinta. Un proceso muerto en la cola de trabajo
 * no es un detalle de orden: es trabajo que alguien puede empezar a hacer para
 * nada.
 *
 * No se ocultan —esconderlos daría la impresión de que el radar no los trajo, y
 * el conteo de lo que llega es justamente lo que se quiere poder mirar—. Se
 * muestran al final, atenuados, y la sección lo dice con todas las letras.
 *
 * ── POR QUÉ LAS SIN FECHA SIGUEN ARRIBA ────────────────────────────────────
 * `ordenarPorCierre` manda al FINAL lo que no tiene reloj, y para las activas
 * eso es correcto. En el radar hunde justo las filas que nadie puede priorizar
 * solo, y que entraron por un acto deliberado.
 *
 * Los tres grupos ordenan por dentro con `ordenarPorCierre`, que ya resuelve el
 * empate por número de proceso y mantiene el orden estable entre renders.
 */
export function repartirRadar(ls: LicitacionConId[], hoy: string): RepartoRadar {
  const sinFecha: LicitacionConId[] = []
  const vigentes: LicitacionConId[] = []
  const vencidas: LicitacionConId[] = []
  for (const l of ls) {
    if (sinFechaEnElOrigen(l)) sinFecha.push(l)
    else if (plazoVencido(l, hoy)) vencidas.push(l)
    else vigentes.push(l)
  }
  return {
    sinFecha: sinFecha.sort(ordenarPorCierre),
    vigentes: vigentes.sort(ordenarPorCierre),
    // Las vencidas, la más reciente primero: la que acaba de morir es la que
    // todavía puede importarle a alguien.
    vencidas: vencidas.sort((a, b) => ordenarPorCierre(b, a)),
  }
}

export interface RepartoCapacidad {
  /** Las que caben en la semana, en orden de trabajo. */
  dentro: LicitacionConId[]
  /** Las que no caben. Se muestran atenuadas, no se esconden. */
  fuera: LicitacionConId[]
  /** Las que el semáforo frena (rojas sin override): no compiten por cupo. */
  frenadas: LicitacionConId[]
  capacidad: number
}

/**
 * Reparte las activas contra el tope semanal.
 *
 * Orden de precedencia:
 *  1. Las que tienen `capacidad_manual.en_capacidad === true` entran SIEMPRE
 *     (alguien decidió a mano que van).
 *  2. Las que lo tienen en `false` quedan fuera SIEMPRE (alguien las bajó).
 *  3. El resto se ordena por cierre y llena los cupos que queden.
 *
 * Si las fijadas a mano superan el tope, el tope se respeta como INFORMACIÓN
 * pero no se recorta la decisión humana: `dentro` puede exceder `capacidad` y
 * la UI lo dice. Recortar en silencio una decisión explícita sería peor que
 * mostrar que se pasaron.
 */
export function repartirPorCapacidad(
  activas: LicitacionConId[], capacidad: number,
): RepartoCapacidad {
  const cupos = Math.max(0, Math.floor(capacidad))
  const frenadas: LicitacionConId[] = []
  const compiten: LicitacionConId[] = []

  for (const l of activas) {
    (compitePorCupo(l) ? compiten : frenadas).push(l)
  }
  compiten.sort(ordenarPorCierre)

  const fijadasDentro = compiten.filter(l => l.capacidad_manual?.en_capacidad === true)
  const fijadasFuera = compiten.filter(l => l.capacidad_manual?.en_capacidad === false)
  const libres = compiten.filter(l => l.capacidad_manual == null)

  const restantes = Math.max(0, cupos - fijadasDentro.length)
  const dentro = [...fijadasDentro, ...libres.slice(0, restantes)].sort(ordenarPorCierre)
  const fuera = [...libres.slice(restantes), ...fijadasFuera].sort(ordenarPorCierre)

  return { dentro, fuera, frenadas: frenadas.sort(ordenarPorCierre), capacidad: cupos }
}

// ── Intercambio de cupo ──────────────────────────────────────────────────────

export interface ParPatchIntercambio {
  /** Patch para la que ENTRA a la capacidad. */
  entra: { id: string; patch: Record<string, unknown> }
  /** Patch para la que SALE. */
  sale: { id: string; patch: Record<string, unknown> }
}

/**
 * Plan del intercambio de cupo: una entra, otra sale, en UN solo writeBatch.
 *
 * Los dos documentos quedan apuntándose (`intercambio_con`), así que la
 * pregunta "¿por qué esta y no aquella?" se responde desde cualquiera de los
 * dos lados. Motivo OBLIGATORIO: un intercambio sin razón escrita es
 * exactamente el dato que nadie recuerda después.
 *
 * Devuelve `null` si el movimiento no tiene sentido (misma licitación, motivo
 * vacío, actor sin uid, o alguna de las dos no está activa).
 */
export function planIntercambioCupo(
  entra: LicitacionConId, sale: LicitacionConId,
  actor: { uid: string }, ahora: Timestamp, motivo: string,
): ParPatchIntercambio | null {
  if (entra.id === sale.id) return null
  if (!actor.uid.trim()) return null
  if (!motivo.trim()) return null
  if (seccionDe(entra) !== 'activas' || seccionDe(sale) !== 'activas') return null
  // Sacar una que el semáforo ya frena no libera cupo: no ocupaba ninguno.
  if (!compitePorCupo(sale)) return null

  const base = { por: actor.uid, en: ahora, motivo: motivo.trim() }
  return {
    entra: {
      id: entra.id,
      patch: {
        capacidad_manual: { ...base, en_capacidad: true, intercambio_con: sale.id },
        actualizado_por: actor.uid,
        actualizado_en: ahora,
      },
    },
    sale: {
      id: sale.id,
      patch: {
        capacidad_manual: { ...base, en_capacidad: false, intercambio_con: entra.id },
        actualizado_por: actor.uid,
        actualizado_en: ahora,
      },
    },
  }
}

/** Patch para soltar una fijación manual y volver al orden por cierre. */
export function patchLiberarCupo(actor: { uid: string }, ahora: Timestamp) {
  if (!actor.uid.trim()) return null
  return {
    capacidad_manual: null,
    actualizado_por: actor.uid,
    actualizado_en: ahora,
  }
}

// ── Filtros de la bandeja ────────────────────────────────────────────────────

/** Búsqueda de texto sobre lo que alguien recordaría de un proceso. */
export function coincideBusqueda(l: LicitacionConId, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (t === '') return true
  const campos = [
    l.numero_proceso, l.consecutivo, l.objeto,
    l.entidad.nombre ?? '', l.entidad.ciudad, l.id_secop ?? '',
  ]
  return campos.some(c => c.toLowerCase().includes(t))
}

/** Conteo por sección, para los pills con contador. */
export function contarSecciones(ls: LicitacionConId[]): Record<SeccionBandeja, number> {
  const out: Record<SeccionBandeja, number> = { radar: 0, activas: 0, descartadas: 0, cerradas: 0 }
  for (const l of ls) out[seccionDe(l)]++
  return out
}

/** Estados que la bandeja considera "en juego" (útil para tests y queries). */
export const ESTADOS_ACTIVOS_BANDEJA: EstadoLicitacion[] = [
  'detectada', 'en_evaluacion', 'en_preparacion', 'manifestada', 'presentada',
]

/**
 * Color del chip de la SEÑAL del radar (Tailwind). Sin azules.
 *
 * El color dice CUÁNTO respalda la entrada, no qué tan urgente es:
 *  · verde  — el código lo respalda (familia del RUP, o clase con el texto de
 *             acuerdo).
 *  · ámbar  — entró por EVIDENCIA de adjudicación y el texto no dijo nada:
 *             merece una segunda mirada, y `RUIDO_LEXICO` no aplica.
 *  · gris   — solo el texto, o una señal que no se persiste.
 */
export const SENAL_CHIP: Record<SenalClasificacion, string> = {
  codigo_en_familia: 'bg-emerald-100 text-emerald-800',
  codigo_en_clase_con_texto: 'bg-emerald-50 text-emerald-700',
  codigo_en_clase_sin_texto: 'bg-amber-100 text-amber-800',
  texto_coincide: 'bg-gray-100 text-gray-700',
  codigo_fuera_de_familia: 'bg-gray-100 text-gray-600',
  sin_codigo_ni_texto: 'bg-gray-100 text-gray-600',
  fuera_de_territorio: 'bg-gray-100 text-gray-600',
}

/** Color del chip del semáforo (Tailwind). Sin azules — manual de marca. */
export const SEMAFORO_CHIP: Record<Semaforo, string> = {
  verde: 'bg-emerald-100 text-emerald-800',
  amarillo: 'bg-amber-100 text-amber-800',
  rojo: 'bg-red-100 text-red-700',
}
