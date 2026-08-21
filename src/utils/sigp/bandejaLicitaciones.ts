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
import type { EstadoLicitacion, Licitacion, Semaforo, Timestamp } from '../../types/sigp/licitacion'
import { esLicitacionTerminal } from '../../types/sigp/licitacion'

/** Licitación con su id de documento (lo que consume la UI). */
export type LicitacionConId = Licitacion & { id: string }

export type SeccionBandeja = 'activas' | 'descartadas' | 'cerradas'

export const SECCIONES_BANDEJA: SeccionBandeja[] = ['activas', 'descartadas', 'cerradas']

export const SECCION_LABEL: Record<SeccionBandeja, string> = {
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
 */
export function seccionDe(l: Pick<Licitacion, 'estado'>): SeccionBandeja {
  if (l.estado === 'descartada') return 'descartadas'
  if (esLicitacionTerminal(l.estado)) return 'cerradas'
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
  const out: Record<SeccionBandeja, number> = { activas: 0, descartadas: 0, cerradas: 0 }
  for (const l of ls) out[seccionDe(l)]++
  return out
}

/** Estados que la bandeja considera "en juego" (útil para tests y queries). */
export const ESTADOS_ACTIVOS_BANDEJA: EstadoLicitacion[] = [
  'detectada', 'en_evaluacion', 'en_preparacion', 'manifestada', 'presentada',
]

/** Color del chip del semáforo (Tailwind). Sin azules — manual de marca. */
export const SEMAFORO_CHIP: Record<Semaforo, string> = {
  verde: 'bg-emerald-100 text-emerald-800',
  amarillo: 'bg-amber-100 text-amber-800',
  rojo: 'bg-red-100 text-red-700',
}
