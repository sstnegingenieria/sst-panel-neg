/**
 * RADAR DE LICITACIONES · la tarea programada (B.2).
 *
 * Codebase `radar`, separado del `default` a propósito: este necesita un paso
 * de build (importa la lógica TypeScript del repo) y el otro no. Las 12
 * funciones del codebase `default` no cambian ni se re-despliegan por esto.
 *
 * ── ESTA FUNCIÓN NO DECIDE NADA ─────────────────────────────────────────────
 *
 * Trae páginas, lee, escribe y registra. TODAS las decisiones viven en la capa
 * pura, con tests: la consulta (`secopConsulta`), la clasificación
 * (`secopMapeo`), y la guarda de volumen, la re-escritura idempotente y el
 * registro de la corrida (`radarCorrida`). Si algo de lo que hace esta función
 * te parece una decisión, está en el lugar equivocado.
 *
 * ── LO QUE PROTEGE A KAREN ──────────────────────────────────────────────────
 *
 *  · GUARDA DE VOLUMEN: la primera corrida no vuelca el histórico. Sin marca,
 *    o con una ventana de más de 120 días, o con más documentos nuevos que el
 *    tope, la corrida NO escribe — y deja registro de que no escribió.
 *  · IDEMPOTENCIA: el doc id es determinístico (`docIdSecop`), así que releer
 *    actualiza y nunca duplica; y el patch de re-lectura solo toca lo
 *    descriptivo: jamás el estado, el consecutivo, el semáforo, el override ni
 *    la oferta de NEG.
 *  · COMPARE-BEFORE-WRITE: si nada cambió, no se escribe. Una corrida que
 *    reescribe miles de documentos idénticos cada día cuesta dinero y dispara
 *    los triggers de los otros frentes.
 *
 * ── DÓNDE QUEDA EL ESTADO ───────────────────────────────────────────────────
 *
 * Todo en `configuracion/radar_secop`: la marca, el registro de la última
 * corrida, el historial acotado y el acumulado. Es el patrón de
 * `configuracion/censo_consecutivos` (lo escribe solo su CF con Admin SDK; el
 * panel lo lee por el match genérico de `configuracion` = `accesoSIGP`), y
 * tiene una consecuencia práctica: **NO hace falta regla nueva**. Una colección
 * `corridas_radar` habría exigido su propia regla de lectura sin dar nada que
 * este documento no dé.
 *
 * ── APP TOKEN: ARRANCA SIN ÉL ───────────────────────────────────────────────
 *
 * Decisión explícita: el radar **arranca sin app token**. Dos corridas diarias
 * son un volumen mínimo y el riesgo de 429 por el pool compartido de IPs de
 * Google es bajo a esa frecuencia. Entra después, por configuración, SIN tocar
 * código.
 *
 * DÓNDE SE PONE, cuando esté:
 *
 *   1. Crear `functions-radar/.env` (está gitignoreado — no se commitea):
 *          SECOP_APP_TOKEN=el-token-que-entregue-socrata
 *      Para un token distinto por proyecto: `functions-radar/.env.neg-sst-app`.
 *   2. Volver a desplegar SOLO este codebase:
 *          firebase deploy --only functions:radar
 *
 * Eso es todo: `defineString` lo lee de ahí al desplegar. Sin variable, el
 * valor es `''` y `cabecerasConsulta('')` no manda la cabecera — la petición
 * sale anónima, que es el estado de arranque.
 *
 * El token va en la cabecera `X-App-Token`, NUNCA en el query string (Socrata
 * también acepta `$$app_token` en la URL; las URLs quedan en logs). Y con
 * token inválido la API responde 403 y la corrida FALLA a propósito — no hay
 * reintento anónimo, porque un token mal configurado tiene que doler.
 *
 * ── SI EL SCHEDULER FALLA ───────────────────────────────────────────────────
 *
 * No se pierde nada: la marca no avanza y la siguiente corrida cubre el hueco
 * (más el solape de 45 días). La alarma es la fecha de `ultima_corrida` en el
 * documento: un radar vencido se muestra como "no sé", que es distinto de
 * "no hay nada". Re-corrida a mano: consola de GCP → Cloud Scheduler → job
 * `firebase-schedule-ingerirRadarSecop-us-central1` → "Forzar ejecución".
 */
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'

import {
  urlIngesta, urlConteo, cabecerasConsulta, ventanaIngesta,
  verificarCosecha, LIMITE_PAGINA, MODO_INGESTA_DEFECTO,
} from '../../src/utils/sigp/secopConsulta'
import { ingerirSecop, construirResumenCorrida } from '../../src/utils/sigp/secopMapeo'
import type { FilaSecop, LicitacionDetectada } from '../../src/utils/sigp/secopMapeo'
import {
  terminosVigentes, versionVocabularioVigente,
} from '../../src/types/sigp/vocabularioNeg'
import type { RegistroVocabularioNeg } from '../../src/types/sigp/vocabularioNeg'
import {
  RUTA_ESTADO_RADAR, RUTA_VOCABULARIO_NEG, rutaLicitacion, validarRutaEscritura,
} from '../../src/utils/sigp/radarRutas'
import {
  evaluarVolumen, cuantosCrearia, planearEscritura, construirRegistroCorrida,
  marcaSiguiente, sellarParaEscritura, fechasATimestamp, avanzarEstadoRadar,
  resumenLegible, ACTOR_RADAR, ESTADO_RADAR_INICIAL,
} from '../../src/utils/sigp/radarCorrida'
import type { EstadoRadar } from '../../src/utils/sigp/radarCorrida'

if (getApps().length === 0) initializeApp()

const SECOP_APP_TOKEN = defineString('SECOP_APP_TOKEN', { default: '' })

/**
 * LAS DOS UNICAS PUERTAS a Firestore de esta funcion.
 *
 * Todo `db.doc(...)` de este archivo pasa por una de estas dos lineas, y la de
 * escritura valida la ruta contra la lista blanca de `radarRutas.ts`. No es
 * estilo: con `datastore.user` la cuenta puede escribir en cualquier parte de
 * la base, asi que el limite vive en el codigo — y su test lee ESTE archivo
 * para verificar que no hay una tercera puerta.
 */
const refLectura = (db: Firestore, ruta: string) => db.doc(ruta)
const refEscritura = (db: Firestore, ruta: string) => db.doc(validarRutaEscritura(ruta))

/** Tamaño de los lotes de escritura. El límite de Firestore es 500. */
const LOTE_ESCRITURA = 400
/** Documentos por lectura masiva. */
const LOTE_LECTURA = 200

const hash = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8)

const trozos = <T>(xs: readonly T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** GET con la cabecera del token. Un no-2xx LANZA: el silencio no es un dato. */
async function traer(url: string, token: string): Promise<unknown> {
  const r = await fetch(url, { headers: cabecerasConsulta(token) })
  if (!r.ok) {
    const cuerpo = (await r.text()).slice(0, 300)
    throw new Error(`SECOP respondió ${r.status}: ${cuerpo}`)
  }
  return r.json()
}

/** `count(1)` de la ventana: el número contra el que se verifica la cosecha. */
async function contar(opciones: Parameters<typeof urlConteo>[0], token: string): Promise<number> {
  const j = await traer(urlConteo(opciones), token)
  const fila = Array.isArray(j) ? (j[0] as Record<string, unknown> | undefined) : undefined
  const n = Number(fila?.total ?? NaN)
  if (!Number.isFinite(n)) throw new Error('el conteo de SECOP no vino como número')
  return n
}

/** Cosecha paginada con `$order` y `$offset`, verificada contra el conteo. */
async function cosechar(
  opciones: Parameters<typeof urlIngesta>[0], total: number, token: string,
): Promise<FilaSecop[]> {
  const filas: FilaSecop[] = []
  for (let offset = 0; offset < total; offset += LIMITE_PAGINA) {
    const pagina = await traer(urlIngesta({ ...opciones, offset, limite: LIMITE_PAGINA }), token)
    if (!Array.isArray(pagina)) throw new Error('una página de SECOP no vino como lista')
    filas.push(...(pagina as FilaSecop[]))
    if (pagina.length === 0) break
  }
  return filas
}

/**
 * Opciones comunes de las dos corridas. Una sola implementación; lo único que
 * cambia entre las dos es la hora.
 */
const OPCIONES_CORRIDA = {
  timeZone: 'America/Bogota',
  timeoutSeconds: 540,
  memory: '512MiB' as const,
  retryCount: 0,
}

/**
 * DOS CORRIDAS AL DÍA: 06:30 y 14:00, lunes a viernes, hora de Bogotá.
 *
 * No es redundancia, es la ventana. Medimos que el cierre
 * (`fecha_de_recepcion_de`) cae entre 4 y 13 días después de la publicación:
 * en una mínima cuantía, **un día de retraso es entre el 8 % y el 25 % del
 * tiempo disponible** para decidir y armar la propuesta. Con una sola corrida
 * a las 6:30, un proceso publicado a las 8 de la mañana se ve al día
 * siguiente — y ese día sale del lado de NEG.
 *
 * El costo es despreciable: cada corrida son un `count(1)`, una o dos páginas
 * de la API y unas decenas de escrituras. La de la tarde suele encontrar poco
 * que crear, porque el doc id es determinístico y el compare-before-write deja
 * en cero lo que no cambió.
 *
 * SON DOS EXPORTS Y NO UN CRON porque unix-cron no puede expresar dos horas
 * con MINUTOS DISTINTOS en una sola expresión: `30 6,14` daría 6:30 y 14:30, y
 * `0,30 6,14` daría cuatro disparos. Dos exports sobre EL MISMO handler dan
 * las horas exactas sin duplicar una línea de lógica. Cloud Scheduler crea un
 * job por cada uno:
 * `firebase-schedule-ingerirRadarSecopManana-us-central1` y
 * `firebase-schedule-ingerirRadarSecopTarde-us-central1`.
 */
async function corridaDelRadar(): Promise<void> {
  const db = getFirestore()
  const token = SECOP_APP_TOKEN.value()
  const inicio = new Date()
  const corridaId = inicio.toISOString()

  // ── 1. Estado y léxico ──
  const [snapEstado, snapVocab] = await Promise.all([
    refLectura(db, RUTA_ESTADO_RADAR).get(),
    refLectura(db, RUTA_VOCABULARIO_NEG).get(),
  ])
  const estado: EstadoRadar = snapEstado.exists
    ? { ...ESTADO_RADAR_INICIAL, ...(snapEstado.data() as Partial<EstadoRadar>) }
    : ESTADO_RADAR_INICIAL
  const registroVocab = snapVocab.exists
    ? (snapVocab.data() as RegistroVocabularioNeg)
    : null
  const terminos = terminosVigentes(registroVocab)
  const vocabulario_version = versionVocabularioVigente(registroVocab)

  const ventana = ventanaIngesta(estado.marca, inicio, estado.solape_dias)
  const consulta = { modo: MODO_INGESTA_DEFECTO, desde: ventana.desde, hasta: ventana.hasta }
  logger.info('radar: arranca', { ventana, vocabulario_version, con_token: token !== '' })

  // ── 2. Cosecha verificada ──
  const total = await contar(consulta, token)
  const filas = await cosechar(consulta, total, token)
  const cosecha = verificarCosecha(total, filas.length)
  if (!cosecha.completa) {
    // Una cosecha a medias no se escribe: «no falló» no es «funcionó».
    throw new Error(cosecha.senal ?? 'cosecha incompleta')
  }

  // ── 3. Clasificación (pura) ──
  const reporte = ingerirSecop(filas, hash, { terminos, vocabulario_version })
  const resumen = construirResumenCorrida(reporte, {
    ejecutada_en: corridaId,
    modo: MODO_INGESTA_DEFECTO,
    ventana: { desde: ventana.desde, hasta: ventana.hasta, solape_dias: ventana.solape_dias },
  })

  // ── 4. Qué hay ya en la colección ──
  const ids = reporte.registros.map(r => r.meta.doc_id)
  const existentes = new Map<string, Partial<LicitacionDetectada>>()
  for (const grupo of trozos(ids, LOTE_LECTURA)) {
    const snaps = await db.getAll(...grupo.map(id => refLectura(db, rutaLicitacion(id))))
    for (const s of snaps) {
      if (s.exists) existentes.set(s.id, s.data() as Partial<LicitacionDetectada>)
    }
  }

  // ── 5. Guarda de volumen ──
  const volumen = evaluarVolumen(
    cuantosCrearia(reporte, new Set(existentes.keys())),
    ventana,
    { autorizado_manual: estado.autorizado_manual === true },
  )

  if (!volumen.procede || !reporte.puede_escribir) {
    const motivo = volumen.motivo ?? reporte.senales.join(' · ')
    const registro = construirRegistroCorrida(resumen, volumen, null,
      marcaSiguiente(ventana, false, estado.marca))
    await refEscritura(db, RUTA_ESTADO_RADAR).set(avanzarEstadoRadar(estado, registro), { merge: false })
    logger.warn('radar: NO se escribió', { motivo, sugerencia: volumen.sugerencia })
    return
  }

  // ── 6. Escritura idempotente ──
  const plan = planearEscritura(reporte.registros, existentes)
  const aTs = (iso: string) => Timestamp.fromDate(new Date(iso))
  const ahora = Timestamp.fromDate(inicio)

  for (const grupo of trozos(plan.crear, LOTE_ESCRITURA)) {
    const lote = db.batch()
    for (const { doc_id, doc } of grupo) {
      const conTs = fechasATimestamp(doc, aTs) as unknown as LicitacionDetectada
      lote.create(refEscritura(db, rutaLicitacion(doc_id)),
        sellarParaEscritura(conTs, { corrida: corridaId, ahora, actor: ACTOR_RADAR }))
    }
    await lote.commit()
  }
  for (const grupo of trozos(plan.refrescar, LOTE_ESCRITURA)) {
    const lote = db.batch()
    for (const { doc_id, patch } of grupo) {
      const p = patch.cronograma !== undefined
        ? { ...patch, cronograma: fechasATimestamp(patch as LicitacionDetectada, aTs).cronograma }
        : patch
      lote.update(refEscritura(db, rutaLicitacion(doc_id)), {
        ...p, actualizado_por: ACTOR_RADAR, actualizado_en: ahora,
      })
    }
    await lote.commit()
  }

  // ── 7. Registro de la corrida ──
  const escritura = {
    creados: plan.crear.length,
    refrescados: plan.refrescar.length,
    sin_cambio: plan.sin_cambio,
    cambios_materiales: plan.cambios_materiales,
  }
  const registro = construirRegistroCorrida(resumen, volumen, escritura,
    marcaSiguiente(ventana, true, estado.marca))
  await refEscritura(db, RUTA_ESTADO_RADAR).set(avanzarEstadoRadar(estado, registro), { merge: false })
  logger.info('radar: ' + resumenLegible(registro))
}

/** 06:30 L–V (Bogotá) — la corrida de la mañana. */
export const ingerirRadarSecopManana = onSchedule(
  { ...OPCIONES_CORRIDA, schedule: '30 6 * * 1-5' },
  corridaDelRadar,
)

/** 14:00 L–V (Bogotá) — la segunda pasada del día, por la ventana de cierre. */
export const ingerirRadarSecopTarde = onSchedule(
  { ...OPCIONES_CORRIDA, schedule: '0 14 * * 1-5' },
  corridaDelRadar,
)
