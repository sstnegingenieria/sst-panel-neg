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
import { evaluarVentana, isoLocal } from './ventanaLicitacion'

/** Licitación con su id de documento (lo que consume la UI). */
export type LicitacionConId = Licitacion & { id: string }

export type SeccionBandeja =
  | 'radar' | 'activas' | 'registro_anterior' | 'descartadas' | 'cerradas'

/** El radar va PRIMERO: es la cola de entrada, lo que todavia no es de nadie. */
export const SECCIONES_BANDEJA: SeccionBandeja[] = [
  'radar', 'activas', 'registro_anterior', 'descartadas', 'cerradas',
]

export const SECCION_LABEL: Record<SeccionBandeja, string> = {
  radar: 'Radar',
  activas: 'Activas',
  registro_anterior: 'Del registro anterior',
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
  l: Pick<Licitacion, 'estado'>
    & Partial<Pick<Licitacion, 'radar' | 'migrado'>>,
): SeccionBandeja {
  if (l.estado === 'descartada') return 'descartadas'
  if (esLicitacionTerminal(l.estado)) return 'cerradas'
  if (l.estado === 'detectada' && esDelRadar(l)) return 'radar'
  if (l.migrado === true) return 'registro_anterior'
  return 'activas'
}

/**
 * ── POR QUÉ LAS MIGRADAS SALEN DE ACTIVAS ───────────────────────────────────
 *
 * Medido el 14-nov-2026: Activas tenía 39 documentos y **38 eran del registro
 * histórico**. Karen abría su cola de trabajo y 38 de 39 cosas no eran trabajo.
 *
 * No caían ahí por un dato malo: caían POR DESCARTE. Una histórica
 * `manifestada` no está descartada, no es terminal y no es del radar, así que
 * la última línea de `seccionDe` se la quedaba.
 *
 * Y están todas muertas: **37 de las 38 ya pasaron su fecha de cierre**,
 * ninguna tiene cierre futuro, y la más reciente cerró el 1-sep-2026 — diez
 * semanas antes de medirlo.
 *
 * ── POR QUÉ UN FILTRO Y NO UN ACTO DE DATOS ─────────────────────────────────
 *
 * La alternativa era cerrarlas en producción con un estado y un motivo. No se
 * puede hacer con honestidad: 16 están `manifestada` y 4 `presentada` — **NEG
 * participó y no sabemos qué pasó**, porque el registro anterior no guardaba
 * el desenlace. `descartada` diría que decidimos no ir, y fuimos. `perdida`
 * afirmaría una derrota que nadie registró.
 *
 * Un hueco se ve; un dato inventado se cita. Así que la sección dice la verdad
 * —vienen del registro anterior y no tienen desenlace— y no escribe ninguno.
 *
 * ── POR QUÉ `migrado` Y NO LA FECHA DE CIERRE ───────────────────────────────
 *
 * Filtrar por "cierre ya pasó" habría sacado de Activas el trabajo REAL de
 * Karen: una licitación que presentó y cuyo plazo venció es exactamente donde
 * está esperando el resultado para registrarlo. Esconderla sería peor que el
 * problema que se arregla.
 *
 * `migrado` no es un atajo: es el campo que marca "vino de un registro que no
 * guardaba desenlaces", que es la propiedad que importa. La fecha de cierre
 * es la EVIDENCIA de que ninguna está en vuelo, no el criterio.
 */

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

/** La fase en la que un proceso YA pasó la puerta de la manifestación. */
export const FASE_PRESENTACION_OFERTA = 'Presentación de oferta'
/** La fase de la puerta misma. Si está en `fases_previas`, la puerta existió. */
export const FASE_MANIFESTACION = 'Manifestación de interés (Menor Cuantía)'

export type MotivoNoAlcanza =
  | 'plazo_vencido'
  | 'manifestacion_cerrada'
  | 'ventana_insuficiente'

export interface NoAlcanza {
  motivo: MotivoNoAlcanza
  /** Lo que la fila dice, en una línea. */
  frase: string
}

/** Fecha de cierre como `AAAA-MM-DD` local, o `null`. */
export function cierreIsoDe(l: Pick<Licitacion, 'cronograma'>): string | null {
  const d = l.cronograma.cierre?.toDate?.()
  return d ? isoLocal(d) : null
}

/**
 * ¿La manifestación de interés ya cerró para este proceso?
 *
 * ── LO QUE NO SE PUEDE MIRAR ───────────────────────────────────────
 * El límite de manifestación NO existe en datos abiertos: medido sobre 10.421
 * procesos de 2026, `fecha_de_recepcion_de` vale lo mismo en la fila de
 * manifestación y en la de oferta en el 85,8 % — es el límite de la OFERTA,
 * estampado también sobre la otra. No hay fecha que comparar.
 *
 * ── LO QUE SÍ ──────────────────────────────────────────────────
 * La FASE. Un proceso en «Presentación de oferta» que ANTES pasó por una fase
 * de manifestación es un proceso cuya puerta ya se cerró. No es una
 * estimación: es el origen diciendo por dónde pasó.
 *
 * Las dos condiciones son necesarias. `menor_cuantia` sola no alcanza —la
 * modalidad «Sin Manifestacion Interes» también mapea ahí, 4.817 procesos— y
 * «está en fase de oferta» sola tampoco: una mínima cuantía está siempre en
 * esa fase y nunca tuvo manifestación.
 */
export function manifestacionCerrada(l: Pick<Licitacion, 'radar'>): boolean {
  const r = l.radar
  if (!r) return false
  return r.fase === FASE_PRESENTACION_OFERTA
    && (r.fases_previas ?? []).some(f => f === FASE_MANIFESTACION)
}

/**
 * ¿Por qué este proceso ya no se puede trabajar? `null` si sí se puede.
 *
 * Tres razones, y el orden importa porque la fila muestra UNA:
 *  1. el plazo pasó — el hecho más duro, no hay nada que agregar;
 *  2. la manifestación cerró — explica más que «no alcanza», porque no es un
 *     problema de tiempo sino de puerta;
 *  3. no da el tiempo — lo mide `evaluarVentana`, que existe desde el 1.4 y ya
 *     cuenta días hábiles contra horas de armado por modalidad. No se inventa
 *     ningún umbral nuevo acá.
 */
export function porQueNoAlcanza(
  l: Pick<Licitacion, 'cronograma' | 'modalidad' | 'radar'>,
  hoy: string, horasUtilesDia: number,
): NoAlcanza | null {
  const v = evaluarVentana(cierreIsoDe(l), l.modalidad, hoy, horasUtilesDia)

  if (v.vencida) return { motivo: 'plazo_vencido', frase: 'El plazo ya pasó' }
  if (manifestacionCerrada(l)) {
    return {
      motivo: 'manifestacion_cerrada',
      frase: 'La manifestación de interés ya cerró — no se puede presentar aunque el plazo siga abierto',
    }
  }
  if (v.insuficiente) {
    const d = v.dias_habiles ?? 0
    return {
      motivo: 'ventana_insuficiente',
      frase: d === 0
        ? 'Cierra hoy: no da tiempo de armarla'
        : `Quedan ${d} día${d === 1 ? '' : 's'} hábil${d === 1 ? '' : 'es'} y hacen falta ${v.necesarios}`,
    }
  }
  return null
}

/**
 * AL FILO: cabe, pero exactamente. El sistema informa, no decide — mismo
 * criterio que el rojo informado: la fila se queda arriba, trabajable, y dice
 * en qué se está metiendo quien la tome.
 *
 * Medido sobre la cola real: cuatro mínimas cuantías que cerraban al día
 * siguiente tenían 1 día hábil y necesitaban 1. El modelo dice que cabe, y es
 * cierto; lo que no dice solo es que no hay ni un día de margen.
 *
 * ⚠ `horas_utiles_dia` es HOY UN SUPUESTO, no un dato medido — ver la nota en
 * `docs/onboarding-licitaciones.md`. Este aviso hereda esa incertidumbre, y es
 * justamente la razón de informar en vez de decidir.
 */
export function avisoAlFilo(
  l: Pick<Licitacion, 'cronograma' | 'modalidad'>, hoy: string, horasUtilesDia: number,
): string | null {
  const v = evaluarVentana(cierreIsoDe(l), l.modalidad, hoy, horasUtilesDia)
  if (v.vencida || v.insuficiente || v.dias_habiles === null) return null
  if (v.dias_habiles > v.necesarios) return null
  return v.dias_habiles === 1
    ? 'Justo al filo: queda 1 día hábil y hace falta 1 — habría que armarla hoy'
    : `Justo al filo: quedan ${v.dias_habiles} días hábiles y hacen falta ${v.necesarios}`
}

/**
 * ¿Este proceso tuvo manifestación de interés y nadie anotó su fecha límite?
 *
 * No es un reproche: esa fecha NO viene en datos abiertos, así que la única
 * forma de tenerla es que alguien la lea del pliego. Pero sin ella, el aviso
 * de la «ventana fatal» no se puede dar, y el cierre —que sí se ve— muestra
 * más tiempo del que realmente hay.
 */
export function faltaFechaManifestacion(
  l: Pick<Licitacion, 'cronograma' | 'radar'>,
): boolean {
  const r = l.radar
  if (!r) return false
  const hubo = r.fase === FASE_MANIFESTACION
    || (r.fases_previas ?? []).some(f => f === FASE_MANIFESTACION)
  return hubo && l.cronograma.manifestacion == null
}

/** Una fila de la cola que ya no se puede trabajar, con su razón. */
export interface FilaSinSalida {
  l: LicitacionConId
  porque: NoAlcanza
}

export interface RepartoRadar {
  /** El origen no les dio fecha. Van ARRIBA: nadie puede priorizarlas solo. */
  sinFecha: LicitacionConId[]
  /** Lo que todavía se puede trabajar, por fecha de cierre. */
  vigentes: LicitacionConId[]
  /** Ya no alcanza. NO se esconden: se muestran al final, con el porqué. */
  noAlcanza: FilaSinSalida[]
}

/**
 * Reparte la cola del radar en tres, y es el ÚNICO criterio de orden de esa
 * sección.
 *
 * ── POR QUÉ EL GRUPO DE ABAJO NO ES «VENCIDOS» ───────────────────────
 * Porque «vencido» se queda corto. Medido sobre la cola real con
 * `horas_utiles_dia = 4`: 2 tenían el plazo pasado, pero otros 5 cerraban el
 * mismo día con CERO días hábiles por delante. Esos cinco no están vencidos y
 * son igual de intrabajables. La consecuencia para Karen es la misma, así que
 * el tratamiento es el mismo y lo que cambia es la frase.
 *
 * El umbral no se inventa: lo pone `evaluarVentana`, que existe desde el 1.4.
 *
 * ── POR QUÉ NO SE OCULTAN ──────────────────────────────────────
 * Esconderlos daría la impresión de que el radar no los trajo, y el conteo de
 * lo que llega es justamente lo que se quiere poder mirar. Karen necesita
 * poder CERRAR lo que ya no sirve, no que desaparezca sin que lo vea.
 *
 * ── POR QUÉ LAS SIN FECHA SIGUEN ARRIBA ───────────────────────────
 * `ordenarPorCierre` manda al FINAL lo que no tiene reloj, y para las activas
 * eso es correcto. En el radar hunde justo las filas que nadie puede priorizar
 * solo, y que entraron por un acto deliberado.
 */
export function repartirRadar(
  ls: LicitacionConId[], hoy: string, horasUtilesDia: number,
): RepartoRadar {
  const sinFecha: LicitacionConId[] = []
  const vigentes: LicitacionConId[] = []
  const noAlcanza: FilaSinSalida[] = []
  for (const l of ls) {
    if (sinFechaEnElOrigen(l)) { sinFecha.push(l); continue }
    const porque = porQueNoAlcanza(l, hoy, horasUtilesDia)
    if (porque) noAlcanza.push({ l, porque })
    else vigentes.push(l)
  }
  return {
    sinFecha: sinFecha.sort(ordenarPorCierre),
    vigentes: vigentes.sort(ordenarPorCierre),
    // La más reciente primero: la que acaba de quedar fuera es la que todavía
    // puede importarle a alguien.
    noAlcanza: noAlcanza.sort((a, b) => ordenarPorCierre(b.l, a.l)),
  }
}

// ── La medición de capacidad: cuántas se vencen ESPERANDO ───────────────

/**
 * ¿Este proceso llegó YA VENCIDO?
 *
 * Son dos casos distintos y conviene no mezclarlos:
 *  · **nació vencido** — el plazo ya había pasado cuando el radar lo trajo.
 *    Karen no pudo hacer nada: es ruido en su bandeja.
 *  · **se venció esperando** — entró vivo y murió en la cola. Eso SÍ es
 *    información suya.
 */
export function nacioVencida(l: Pick<Licitacion, 'cronograma' | 'creado_en'>): boolean {
  const cierre = cierreIsoDe(l)
  const nacio = l.creado_en?.toDate?.()
  if (!cierre || !nacio) return false
  return cierre < isoLocal(nacio)
}

/**
 * ¿Se venció ESPERANDO en la cola? Entró viva y el plazo pasó mientras estaba.
 *
 * ── SE DERIVA, NO SE ACUMULA ────────────────────────────────────
 * `creado_en` y `cronograma.cierre` ya están en el documento, así que esta
 * cifra se calcula en cualquier momento y HACIA ATRÁS. No hace falta un
 * contador que alguien tenga que acordarse de incrementar — y un contador
 * incrementado es, además, un dato que no se puede auditar contra nada.
 *
 * Sobrevive al triage: una que se venció esperando y después se descartó sigue
 * teniendo sus dos fechas, y sigue contando. Que es lo correcto: se venció.
 */
export function vencioEsperando(
  l: Pick<Licitacion, 'cronograma' | 'creado_en'>, hoy: string,
): boolean {
  const cierre = cierreIsoDe(l)
  if (!cierre || cierre >= hoy) return false
  return !nacioVencida(l)
}

export interface CapacidadSemanal {
  /** Se vencieron esperando dentro de la ventana mirada. */
  vencidas_esperando: number
  /** Llegaron ya vencidas en la misma ventana. Ruido, no capacidad. */
  nacieron_vencidas: number
  dias: number
}

/**
 * Cuántas se vencieron esperando en los últimos `dias`, y cuántas llegaron ya
 * muertas. Separadas a propósito: la primera mide si la bandeja se está
 * trabajando o acumulando; la segunda mide el ruido del origen.
 *
 * Se cuenta sobre la fecha de CIERRE, que es cuando el proceso murió.
 */
export function capacidadSemanal(
  ls: LicitacionConId[], hoy: string, dias = 7,
): CapacidadSemanal {
  const desde = isoLocal(new Date(Date.parse(`${hoy}T12:00:00`) - dias * 86_400_000))
  let vencidas_esperando = 0
  let nacieron_vencidas = 0
  for (const l of ls) {
    const cierre = cierreIsoDe(l)
    if (!cierre || cierre >= hoy || cierre < desde) continue
    if (nacioVencida(l)) nacieron_vencidas++
    else vencidas_esperando++
  }
  return { vencidas_esperando, nacieron_vencidas, dias }
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
  const out: Record<SeccionBandeja, number> = {
    radar: 0, activas: 0, registro_anterior: 0, descartadas: 0, cerradas: 0,
  }
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
  texto_vetado: 'bg-gray-100 text-gray-600',
  sin_codigo_ni_texto: 'bg-gray-100 text-gray-600',
  fuera_de_territorio: 'bg-gray-100 text-gray-600',
}

/** Color del chip del semáforo (Tailwind). Sin azules — manual de marca. */
export const SEMAFORO_CHIP: Record<Semaforo, string> = {
  verde: 'bg-emerald-100 text-emerald-800',
  amarillo: 'bg-amber-100 text-amber-800',
  rojo: 'bg-red-100 text-red-700',
}
