/**
 * Los PLANIFICADORES de los cuatro actos sobre producción.
 *
 * Acá no hay Firestore, ni red, ni reloj propio. Cada función recibe lo que
 * alguien leyó y devuelve lo que habría que escribir. Es lo que permite que un
 * test corra el acto completo contra datos reales sin tocar la base, y que el
 * dry-run del script sea EL MISMO código que el `--apply` — no una
 * aproximación suya.
 *
 * Los scripts que los ejecutan viven en `functions-radar/actos/` y son cáscara:
 * leen, llaman a estos, escriben, vuelven a leer.
 */
import type {
  DocParaDescartar, ModalidadLicitacion, MotivoDescarte, MotivoSemaforo,
  ProcedenciaRadar, Semaforo,
} from '../../types/sigp/licitacion'
import {
  patchDescartarLicitacion, patchRecalcularSemaforo,
} from '../../types/sigp/licitacion'
import { calcularSemaforo, SEMAFORO_VERSION } from './semaforo'
import { separarFasesDeReferencia, entradaSemaforoSecop } from './secopMapeo'
import { completarSiFalta } from './radarCorrida'

// ════════════════════════════════════════════════════════════════════════════
//  ACTO 1a · Completar los hechos que el origen no capturó
// ════════════════════════════════════════════════════════════════════════════

/** Lo que el origen sabe de un proceso y el documento no tiene. */
export interface HechosDelOrigen {
  /** La columna `fase` de SECOP. `null` si el proceso no tiene fase. */
  fase: string | null
  /** `id_del_portafolio`. `null` en el 9,1 % que no lo trae. */
  portafolio: string | null
}

export interface DocParaCompletar {
  id: string
  numero_proceso?: string | null
  radar?: Record<string, unknown> | null
}

export interface PatchCompletar {
  id: string
  /** Solo `radar`, y solo con los sub-campos que faltaban. */
  patch: { radar: Record<string, unknown> }
  llenados: string[]
}

export interface PlanCompletar {
  patches: PatchCompletar[]
  /** Documentos que ya tenían todo: no se tocan. */
  sin_cambio: number
  /** Documentos sin `radar`: no son del radar, no se tocan. */
  sin_radar: number
  /** Documentos para los que el origen no devolvió nada. */
  sin_datos_del_origen: number
  /** Cuántos quedan con una fase de verdad (no `null`). */
  con_fase: number
  /** Cuántos quedan con portafolio — los que el 3b podrá agrupar. */
  con_portafolio: number
  /** Sub-campos que el acto SE NEGÓ a tocar porque ya tenían valor. */
  respetados: { id: string; campos: string[] }[]
}

/**
 * Plan del acto 1a.
 *
 * ── LA AUTORIZACIÓN, Y LA GUARDA QUE LA HACE CUMPLIR ────────────────────────
 *
 * `radar` está en `CAMPOS_PROTEGIDOS`: el radar no lo toca nunca después del
 * nacimiento, porque es la PROCEDENCIA — por qué trajimos este proceso. Este
 * acto escribe ahí, y lo que lo autoriza es una distinción:
 *
 *     completar lo que el origen no capturó no es reescribir el juicio del
 *     nacimiento.
 *
 * Y la guarda la HACE CUMPLIR en vez de declararla: se escribe únicamente
 * donde el sub-campo está AUSENTE. Si tiene valor, no se toca — aunque el
 * origen diga otra cosa, y aunque ese valor parezca peor. Esos casos se
 * cuentan en `respetados`, que es la prueba de que la guarda operó.
 *
 * Sin eso, el acto sería un precedente para lo segundo: alguien diría «ya
 * escribimos en radar una vez» y reescribiría una señal de nacimiento.
 *
 * ── POR QUÉ `ausente` Y NO `ausente o nulo` ─────────────────────────────────
 *
 * Medido el 14-nov: los 129 documentos tienen los tres sub-campos AUSENTES, no
 * nulos — sus claves no existen. Así que la semántica más estricta alcanza, y
 * es además la correcta: un `null` escrito por el origen SÍ es un valor —
 * significa «este proceso no tiene fase»— y sobrescribirlo sería exactamente
 * lo que la guarda prohíbe.
 *
 * ── DE DÓNDE SALE CADA COSA ─────────────────────────────────────────────────
 *
 * `fase` y `portafolio` vienen del ORIGEN, no del documento. Creí que la fase
 * se podía derivar del `numero_proceso` guardado, y es falso: el número trae
 * pegadas TODAS las fases, incluida la actual, y `separarFasesDeReferencia`
 * necesita saber cuál es la actual para no contarla como previa. Una sola
 * lectura de SECOP da las dos cosas.
 *
 * `numero_proceso` NO se limpia. Limpiarlo no sería llenar un hueco sino
 * sobrescribir un valor, y la guarda es la guarda. El número sigue mostrando
 * el sufijo de la fase; eso se arregla al leer —`limpiarReferencia(numero,
 * fase)` en la UI—, que es código y no datos.
 */
export function planCompletarRadar(
  docs: readonly DocParaCompletar[],
  delOrigen: ReadonlyMap<string, HechosDelOrigen>,
): PlanCompletar {
  const plan: PlanCompletar = {
    patches: [], sin_cambio: 0, sin_radar: 0, sin_datos_del_origen: 0,
    con_fase: 0, con_portafolio: 0, respetados: [],
  }

  for (const d of docs) {
    const radar = d.radar
    if (radar === null || radar === undefined) { plan.sin_radar++; continue }

    const hechos = delOrigen.get(d.id)
    if (hechos === undefined) { plan.sin_datos_del_origen++; continue }

    const { fases_previas } = separarFasesDeReferencia(
      String(d.numero_proceso ?? ''), hechos.fase)

    const traidos: Record<string, unknown> = {
      fase: hechos.fase,
      fases_previas,
      portafolio: hechos.portafolio,
    }

    // Lo que el acto NO va a tocar, contado antes de decidir: es la prueba de
    // que la guarda operó, no una consecuencia silenciosa de que no hizo nada.
    const yaTenian = Object.keys(traidos).filter(k => radar[k] !== undefined)
    if (yaTenian.length > 0) plan.respetados.push({ id: d.id, campos: yaTenian })

    const completado = completarSiFalta(radar, traidos)
    if (completado === null) { plan.sin_cambio++; continue }

    plan.patches.push({
      id: d.id,
      patch: { radar: completado.valor },
      llenados: completado.llenados,
    })
    const r = completado.valor
    if (typeof r.fase === 'string' && r.fase !== '') plan.con_fase++
    if (typeof r.portafolio === 'string' && r.portafolio !== '') plan.con_portafolio++
  }

  return plan
}

// ════════════════════════════════════════════════════════════════════════════
//  ACTO 1b · Retirar lo que el léxico v1.1 ya no reconoce
// ════════════════════════════════════════════════════════════════════════════

export interface DocParaRetirar {
  id: string
  objeto?: string | null
  estado?: string | null
  /**
   * Solo para que el SELLO DEL TRIAGE pueda operar: descartar una fila del
   * radar que esta en `detectada` ES el triage, y sin esto el documento se
   * quedaria sin registro de quien lo saco de la seccion del radar.
   */
  radar?: Partial<ProcedenciaRadar> | null
  override_manual?: unknown
  oferta_neg?: unknown
  manifestaciones?: unknown
}

/**
 * El patch EXACTO que arma `patchDescartarLicitacion`, atado a su firma.
 *
 * Declararlo a mano fue un defecto de verdad, no una formalidad: la primera
 * version escribia `fecha_actualizacion` —el nombre de `accionMejora` y
 * `asignacion`, no el de esta coleccion, que usa `actualizado_en`— y omitia el
 * sello del triage. Habria dejado 34 documentos de produccion con un campo que
 * nadie lee, el campo real sin mover, y sin registro de quien los saco de la
 * seccion del radar.
 */
type PatchDeDescarte<TS> = NonNullable<ReturnType<typeof patchDescartarLicitacion<TS>>>

export interface PatchDescarte<TS> {
  id: string
  patch: PatchDeDescarte<TS>
  /** Por qué este documento está en la lista. Va al reporte, no al documento. */
  porque: string
}

/**
 * `patchDescartarLicitacion` puede decir NO —transicion ilegal, motivo que no
 * esta en la lista—. Cuando lo dice, el documento se reporta uno por uno en vez
 * de contarse en silencio: que el dueno de la invariante rechace un acto de
 * limpieza no es un estorbo, es la invariante funcionando.
 */
export interface DescarteRechazado {
  id: string
  por: string
}

/**
 * Pide el patch al DUENO de la invariante 1 y lo deja en el plan, o anota por
 * que no se pudo. Un acto de limpieza no arma este patch a mano.
 */
function anotarDescarte<TS>(
  dest: { patches: PatchDescarte<TS>[]; rechazados: DescarteRechazado[] },
  id: string, d: DocParaDescartar, motivo: MotivoDescarte, actor: string,
  ahora: TS, porque: string,
): void {
  const patch = patchDescartarLicitacion(d, { uid: actor }, ahora, motivo)
  if (patch === null) {
    dest.rechazados.push({
      id,
      por: `el dueño del patch dijo no: estado «${d.estado}» o motivo «${motivo}»`,
    })
    return
  }
  dest.patches.push({ id, patch, porque })
}

export interface PlanRetiro<TS> {
  patches: PatchDescarte<TS>[]
  /** Los que el DUENO del patch rechazo, con el motivo. */
  rechazados: DescarteRechazado[]
  /** Los que siguen calificando: no se tocan. */
  siguen: number
  /** Los que NO se tocan porque una persona ya trabajó en ellos. */
  intocables: { id: string; por: string[] }[]
  /** Los que ya no están en juego (otro estado): no se tocan. */
  fuera_de_juego: number
}

/** Lo unico que hay que leer para saber si alguien ya trabajo el documento. */
export interface DocConPosibleHuella {
  estado?: string | null
  override_manual?: unknown
  oferta_neg?: unknown
  manifestaciones?: unknown
}

/**
 * ¿Alguien de carne y hueso ya metió mano en este documento?
 *
 * ── ADMITIR CUENTA COMO HUELLA ──────────────────────────────────────────────
 *
 * Salir de `detectada` no lo hace el radar: lo hace una persona al admitir la
 * fila, y el sello del triage existe justamente para registrar ese acto. Asi
 * que un documento que ya avanzo de estado es trabajo humano, aunque no tenga
 * oferta ni manifestaciones todavia.
 *
 * En el 3b esa regla hace algo mejor que proteger: ELIGE. Si de dos duplicados
 * alguien admitio uno, ese es el que Karen esta trabajando — se queda, y el
 * que nadie toco es el que sale. Sin la regla, el acto se habria quedado con
 * el de la fase mas avanzada y habria descartado el que ella abrio.
 *
 * El 1b no la necesita —ya filtra por `detectada` antes— y no le estorba.
 */
export function huellaDePersona(d: DocConPosibleHuella): string[] {
  const out: string[] = []
  const e = d.estado
  if (e !== null && e !== undefined && e !== '' && e !== 'detectada') {
    out.push(`admitida (estado «${e}»)`)
  }
  if (d.override_manual !== null && d.override_manual !== undefined) out.push('override_manual')
  const o = d.oferta_neg
  if (o !== null && o !== undefined && typeof o === 'object'
    && Object.keys(o as object).length > 0) out.push('oferta_neg')
  const m = d.manifestaciones
  if (m !== null && m !== undefined && typeof m === 'object'
    && Object.keys(m as object).length > 0) out.push('manifestaciones')
  return out
}

/**
 * Plan del acto 1b.
 *
 * `decide` es el criterio NUEVO inyectado —normalmente
 * `objeto => coincideVocabulario(objeto).coincide`— para que el acto no
 * contenga una segunda copia del léxico. El mismo motivo por el que el radar
 * se empaqueta en vez de portarse a CJS.
 *
 * ── LO QUE NO SE TOCA, Y POR QUÉ ────────────────────────────────────────────
 *
 * Un documento donde una persona ya trabajó NO se retira, aunque el criterio
 * nuevo diga que no debió entrar. El léxico se equivocó al traerlo; retirarlo
 * borraría el trabajo de alguien para tapar nuestro error. Medido el 14-nov:
 * de los 18 que v1.1 ya no reconoce, CERO tienen huella de persona — así que
 * hoy la guarda no excluye a ninguno. Está igual, porque el día que excluya a
 * uno nadie se va a acordar de mirar.
 *
 * Solo se retira lo que está `detectada`: lo que ya avanzó de estado es de la
 * máquina de estados, no de un acto de limpieza.
 */
export function planRetirarPorLexico<TS>(
  docs: readonly DocParaRetirar[],
  decide: (objeto: string) => boolean,
  motivo: MotivoDescarte,
  actor: string,
  ahora: TS,
): PlanRetiro<TS> {
  const plan: PlanRetiro<TS> = {
    patches: [], rechazados: [], siguen: 0, intocables: [], fuera_de_juego: 0,
  }

  for (const d of docs) {
    const objeto = String(d.objeto ?? '')
    if (objeto.trim() === '') { plan.siguen++; continue }
    if (decide(objeto)) { plan.siguen++; continue }
    if (d.estado !== 'detectada') { plan.fuera_de_juego++; continue }

    const huella = huellaDePersona(d)
    if (huella.length > 0) { plan.intocables.push({ id: d.id, por: huella }); continue }

    // `estado` ya quedo estrechado a 'detectada' por la guarda de arriba, asi
    // que el documento que recibe el dueno del patch no lleva ningun cast.
    anotarDescarte(plan, d.id, { estado: 'detectada', radar: d.radar }, motivo,
      actor, ahora, objeto.replace(/\s+/g, ' ').slice(0, 120))
  }

  return plan
}

// ════════════════════════════════════════════════════════════════════════════
//  ACTO 3b · Los duplicados que ya están escritos
// ════════════════════════════════════════════════════════════════════════════

export interface DocParaFusionar {
  id: string
  estado?: string | null
  radar?: Pick<ProcedenciaRadar, 'portafolio' | 'fases_previas'> | null
  override_manual?: unknown
  oferta_neg?: unknown
  manifestaciones?: unknown
}

export interface PlanFusion<TS> {
  patches: PatchDescarte<TS>[]
  /** Los que el DUENO del patch rechazo, con el motivo. */
  rechazados: DescarteRechazado[]
  /** Grupos encontrados, con quién se queda y quién sale. */
  grupos: { portafolio: string; se_queda: string; salen: string[] }[]
  /** Grupos que NO se tocan porque hay trabajo humano en más de uno. */
  grupos_con_huella: { portafolio: string; ids: { id: string; por: string[] }[] }[]
  /** Documentos sin portafolio: no se pueden agrupar. */
  sin_portafolio: number
}

/**
 * Plan del acto 3b.
 *
 * Agrupa por `radar.portafolio` — NUNCA por el texto del objeto. Emparejar por
 * objeto sirvió para MEDIR el problema; para escribir no, porque dos
 * licitaciones distintas pueden tener el objeto palabra por palabra igual.
 *
 * ── QUIÉN SE QUEDA ──────────────────────────────────────────────────────────
 *
 * El de la fase MÁS AVANZADA, medida por cuántas fases previas arrastra: su
 * plazo es el operativo. Empate por id, para no depender del orden de lectura.
 *
 * Es la MISMA regla que `resolverPorPortafolio` aplica a las filas nuevas, y a
 * propósito: si el acto de limpieza se quedara con uno distinto del que el
 * radar elegiría mañana, la corrida siguiente volvería a crear el otro.
 *
 * ── CUÁNDO NO TOCA NADA ─────────────────────────────────────────────────────
 *
 * Si DOS documentos del mismo grupo tienen huella de persona, el acto se
 * abstiene y los reporta. Fusionar ahí sería decidir cuál trabajo humano vale
 * más, y eso no lo decide un script. Con huella en uno solo, ese se queda.
 */
export function planFusionarDuplicados<TS>(
  docs: readonly DocParaFusionar[],
  motivo: MotivoDescarte,
  actor: string,
  ahora: TS,
): PlanFusion<TS> {
  const plan: PlanFusion<TS> = {
    patches: [], rechazados: [], grupos: [], grupos_con_huella: [],
    sin_portafolio: 0,
  }

  const grupos = new Map<string, DocParaFusionar[]>()
  for (const d of docs) {
    const pf = d.radar?.portafolio ?? null
    if (pf === null || pf === '') { plan.sin_portafolio++; continue }
    const g = grupos.get(pf)
    if (g) g.push(d)
    else grupos.set(pf, [d])
  }

  for (const [pf, g] of grupos) {
    if (g.length < 2) continue

    const conHuella = g
      .map(d => ({ id: d.id, por: huellaDePersona(d) }))
      .filter(x => x.por.length > 0)
    if (conHuella.length > 1) {
      plan.grupos_con_huella.push({ portafolio: pf, ids: conHuella })
      continue
    }

    const avance = (d: DocParaFusionar) => (d.radar?.fases_previas ?? []).length
    const seQueda = conHuella.length === 1
      ? g.find(d => d.id === conHuella[0].id)!
      : [...g].sort((a, b) => {
        const dif = avance(b) - avance(a)
        return dif !== 0 ? dif : a.id.localeCompare(b.id)
      })[0]

    const salen = g.filter(d => d.id !== seQueda.id)
    plan.grupos.push({ portafolio: pf, se_queda: seQueda.id, salen: salen.map(d => d.id) })

    for (const d of salen) {
      // Siempre 'detectada': admitir es un acto humano y cuenta como huella,
      // asi que una admitida o se queda (huella unica) o manda al grupo
      // completo a `grupos_con_huella`. Nunca sale por aca.
      anotarDescarte(plan, d.id, { estado: 'detectada', radar: d.radar }, motivo,
        actor, ahora, `misma licitación que ${seQueda.id} (portafolio ${pf})`)
    }
  }

  return plan
}

// ════════════════════════════════════════════════════════════════════════════
//  ACTO 1c · Recalcular el semáforo con el criterio vigente
// ════════════════════════════════════════════════════════════════════════════

/**
 * Lo UNICO que el recalculo lee del documento. Estrecho a proposito: el acto
 * trae documentos crudos de Firestore, y pedirle un `Licitacion` completo lo
 * obligaba a un `as never` — un cast en el borde de una escritura a
 * produccion, que es exactamente donde no se quiere tener uno.
 *
 * Lo que NO esta aca tambien dice algo: el motor no mira presupuesto, ni
 * entidad mas alla del departamento, ni fechas. Si algun dia las mirara, este
 * tipo tendria que crecer y el acto no compilaria hasta que alguien decidiera
 * de donde sale cada cosa.
 */
export interface DocParaSemaforo {
  id: string
  modalidad: ModalidadLicitacion
  entidad?: { departamento?: string | null } | null
  cronograma?: { sorteo?: unknown } | null
  semaforo: Semaforo
  semaforo_version: string
  semaforo_motivos?: readonly MotivoSemaforo[] | null
}

export interface PatchSemaforo<TS> {
  id: string
  patch: NonNullable<ReturnType<typeof patchRecalcularSemaforo<TS>>>
  antes: { semaforo: string; version: string }
  despues: { semaforo: string; version: string }
}

export interface PlanSemaforo<TS> {
  patches: PatchSemaforo<TS>[]
  sin_cambio: number
  /** Los que el constructor del patch RECHAZÓ, con el motivo. */
  rechazados: { id: string; por: string }[]
  /** Cuántos pasan de rojo a otro color: el volumen de decisión que se suma. */
  dejan_de_ser_rojo: number
  /** Cuántos pasan a rojo: nadie debería, y si pasa hay que mirarlo. */
  pasan_a_rojo: number
  /**
   * Documentos con un dato que el adaptador del radar IGNORA — hoy, una fecha
   * de sorteo puesta a mano. No se recalculan distinto; se NOMBRAN, porque un
   * dato que una persona escribió y el acto no mira tiene que verse.
   */
  con_dato_que_el_adaptador_ignora: { id: string; campos: string[] }[]
}

/**
 * Plan del acto 1c.
 *
 * No calcula el criterio: se lo pide a `calcularSemaforo`, la misma función que
 * corre en el panel y en la corrida. Y no arma el patch a mano: se lo pide a
 * `patchRecalcularSemaforo`, que es el DUEÑO del bloque del semáforo y el que
 * hace cumplir la invariante 5 — mover `semaforo_version` exige un `cambio`
 * declarado con motivo, y sin él devuelve `null`.
 *
 * Que el acto pueda ser rechazado por su propio constructor de patches no es
 * un estorbo: es la invariante funcionando. Los rechazos se reportan uno por
 * uno en vez de contarse en silencio.
 */
export function planRecalcularSemaforo<TS>(
  docs: readonly DocParaSemaforo[],
  motivo: string,
  ahora: TS,
): PlanSemaforo<TS> {
  const plan: PlanSemaforo<TS> = {
    patches: [], sin_cambio: 0, rechazados: [],
    dejan_de_ser_rojo: 0, pasan_a_rojo: 0,
    con_dato_que_el_adaptador_ignora: [],
  }

  for (const d of docs) {
    // EL MISMO adaptador que usa el radar al nacer, y no uno propio. Si el
    // acto alimentara el motor con una entrada mas rica, el resultado mezclaria
    // dos cambios —criterio nuevo y datos nuevos— y no se podria atribuir.
    // El adaptador pone `tiene_sorteo`, `limitacion_mipyme` y
    // `requiere_lectura` en `false` porque SECOP no los trae.
    const r = calcularSemaforo(entradaSemaforoSecop({
      modalidad: d.modalidad,
      entidad: { departamento: d.entidad?.departamento ?? '' },
    }))

    // Lo que el adaptador ignora se NOMBRA en vez de pasar en silencio.
    const ignorados: string[] = []
    if (d.cronograma?.sorteo != null) ignorados.push('cronograma.sorteo')
    if (ignorados.length > 0) {
      plan.con_dato_que_el_adaptador_ignora.push({ id: d.id, campos: ignorados })
    }

    const mismaVersion = r.version === d.semaforo_version
    const cambio = mismaVersion
      ? undefined
      : { motivo, version_anterior: d.semaforo_version }

    const patch = patchRecalcularSemaforo(d, r, ahora, cambio)
    if (patch === null) {
      plan.rechazados.push({
        id: d.id,
        por: mismaVersion
          ? 'misma versión y se le pasó un cambio'
          : `version_anterior no coincide (documento: ${d.semaforo_version})`,
      })
      continue
    }

    const igual = r.semaforo === d.semaforo
      && r.version === d.semaforo_version
      && JSON.stringify([...r.motivos].sort()) === JSON.stringify([...(d.semaforo_motivos ?? [])].sort())
    if (igual) { plan.sin_cambio++; continue }

    if (d.semaforo === 'rojo' && r.semaforo !== 'rojo') plan.dejan_de_ser_rojo++
    if (d.semaforo !== 'rojo' && r.semaforo === 'rojo') plan.pasan_a_rojo++

    plan.patches.push({
      id: d.id,
      patch,
      antes: { semaforo: d.semaforo, version: d.semaforo_version },
      despues: { semaforo: r.semaforo, version: r.version },
    })
  }

  return plan
}

/** La versión del criterio que el acto 1c va a escribir. */
export const VERSION_A_ESCRIBIR = SEMAFORO_VERSION
