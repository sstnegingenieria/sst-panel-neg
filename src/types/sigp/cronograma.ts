// CRONOGRAMA DE OBRA (08-nov-2026) — modelo del documento que los clientes
// piden antes de iniciar el proyecto. Especificación: el modelo que Giovanny
// armó para la licitación SENA Tunja (APU Y CRONOGRAMA.pdf, hojas 12-13).
// Principios fijados:
//
//  - La ACTIVIDAD puede referenciar un ítem del alcance aprobado
//    (item_clave → items_alcance, hereda su descripción: una sola verdad),
//    o ser texto libre (logística de inicio, compra de material, aseo
//    general… — trabajo de obra que no se cobra por separado).
//  - SIN dependencias ni ruta crítica: un calendario con fechas, fases,
//    hitos y una ventana de corte programado. Si algún día hacen falta,
//    se agregan.
//  - El calendario laboral es parte del MODELO, no del render: domingos y
//    festivos colombianos no laborables, sábados media jornada — festivos
//    CALCULADOS por ley (utils/sigp/calendarioColombia), jamás tabulados.
//    El conteo de días hábiles efectivos se CONGELA en el documento.
//  - El cronograma SE EMITE como el corte: consecutivo CRN, congelado,
//    PDF con hash. ¿Cambió el plan? Se emite otro (el vigente es el último
//    emitido; los anteriores quedan — jamás se reescribe uno entregado).
//  - LECCIÓN DEL 058 DE FÁBRICA: las actividades referencian claves de un
//    snapshot que un cambio de alcance puede reemplazar — el modelo trae su
//    lectura de huérfanos desde el nacimiento (listar, no silenciar) y los
//    mensajes JAMÁS imprimen un uuid.
//  - ENGANCHE FUTURO (no se construye ahora): item_clave + barra por días
//    bastan para comparar el plan contra el avance real de los cortes.
//
// Los días son OFFSETS 1-based desde fecha_inicio (día 1 = fecha_inicio):
// mover la fecha de inicio corre el plan completo sin reescribir filas.
import { Timestamp } from 'firebase/firestore'
import type { Proyecto, SnapshotProyecto, EntradaHistorialProyecto, EstadoProyecto } from './proyecto'
import {
  fechaIsoAUtc, sumarDias, diasHabilesEfectivos, festivosEnRango,
  nombrarFechas, fmtDiasHabiles,
} from '../../utils/sigp/calendarioColombia'

// ── Filas del cuadro ─────────────────────────────────────────────────────────

export interface ActividadCronograma {
  /** uuid local — key de React dentro del editor; JAMÁS sale en mensajes. */
  id: string
  tipo: 'actividad'
  /** Copia congelada al elegir el ítem (o texto libre si no hay ítem). */
  descripcion: string
  /** Enganche opcional al alcance aprobado (items_alcance.clave). */
  item_clave?: string
  item_codigo?: string
  dia_inicio: number           // 1-based desde fecha_inicio
  dia_fin: number
  /** Dentro de la ventana de corte programado (render en acento lima). */
  en_ventana?: boolean
}

export interface HitoCronograma {
  id: string
  tipo: 'hito'
  nombre: string
  dia: number                  // 1-based
}

/** El orden de las filas dentro de la fase es el del cuadro (los hitos son
 *  FILAS — cursiva, rombo con fecha — no anotaciones flotantes). */
export type FilaCronograma = ActividadCronograma | HitoCronograma

export interface FaseCronograma {
  id: string
  /** Banda de resumen del cuadro (PRELIMINARES, SUMINISTROS…). */
  nombre: string
  filas: FilaCronograma[]
}

/** Actividades que deben ejecutarse juntas con la energía cortada —
 *  recuadro punteado lima de altura completa + nota al pie. */
export interface VentanaCorte {
  dia_inicio: number
  dia_fin: number
  /** La explicación del pie ("las actividades que requieren desenergizar…
   *  se agrupan en una sola ventana de corte programado"). */
  nota: string
}

// ── El CRONOGRAMA (subcolección proyectos/{id}/cronogramas) ──────────────────

export interface CronogramaObra {
  consecutivo: string          // CRN-YYYY-NNN (al emitir)
  /** 1, 2, 3… dentro del proyecto: cada emisión es un documento nuevo. */
  numero_cronograma: number
  proyecto_id: string
  proyecto_consecutivo: string
  /** Título del documento: el objeto del proyecto (asunto del snapshot). */
  titulo: string
  cliente: string
  cliente_nit?: string
  /** Quien ejecuta frente al cliente (cabecera "Contratista: NEG…"). */
  contratista: string
  cotizacion_consecutivo?: string
  /** Contra qué alcance se armó (la versión aprobada vigente al emitir). */
  cotizacion_version_medida?: number
  fecha_inicio: string         // 'YYYY-MM-DD'
  plazo_dias: number           // días calendario
  /** Derivada y CONGELADA: fecha_inicio + plazo_dias − 1. */
  fecha_fin: string
  fases: FaseCronograma[]
  ventana_corte?: VentanaCorte
  /** CONGELADOS al construir (el documento debe releerse igual aunque el
   *  cálculo de festivos evolucione): */
  dias_habiles_efectivos: number
  festivos_en_rango: { fecha: string; nombre: string }[]
  /** Texto del pie, generado ("Jornada: lunes a viernes…"). */
  nota_jornada: string
  observaciones?: string
  fecha_emision: Timestamp
  emitido_por: string
  emitido_por_nombre?: string
  /** Firma de quien emite (patrón del corte). */
  emisor?: { nombre: string; area: string; correo?: string; telefono?: string }
  pdf_url?: string
  pdf_nombre?: string
  pdf_hash?: string            // SHA-256 (regla 8)
  fecha_creacion: Timestamp
}

export type ResultadoCronograma =
  | { ok: true; cronograma: Omit<CronogramaObra, 'consecutivo' | 'fecha_emision' | 'emitido_por' | 'emitido_por_nombre' | 'emisor' | 'fecha_creacion' | 'pdf_url' | 'pdf_nombre' | 'pdf_hash'> }
  | { ok: false; error: string }

// ── Huérfanos (lección del 058, de fábrica) ──────────────────────────────────

/** Actividades cuyo ítem ya NO existe en el alcance vigente (entró un
 *  cambio de alcance después de armarlas). Se nombran por su descripción
 *  congelada — jamás por la clave. */
export function actividadesHuerfanas(
  fases: FaseCronograma[],
  snapshot: Pick<SnapshotProyecto, 'items_alcance'>,
): { fase: string; actividad: ActividadCronograma }[] {
  const claves = new Set((snapshot.items_alcance ?? []).map(i => i.clave))
  const out: { fase: string; actividad: ActividadCronograma }[] = []
  for (const fase of fases) {
    for (const fila of fase.filas) {
      if (fila.tipo === 'actividad' && fila.item_clave && !claves.has(fila.item_clave)) {
        out.push({ fase: fase.nombre, actividad: fila })
      }
    }
  }
  return out
}

// ── Construcción (validar + congelar derivados) ──────────────────────────────

const etiqueta = (texto: string, tope = 60): string =>
  texto.length > tope ? `${texto.slice(0, tope - 1)}…` : texto

export const PLAZO_MAX_DIAS = 730

export function construirCronograma(params: {
  proyecto: Pick<Proyecto, 'id' | 'consecutivo' | 'snapshot' | 'cotizacion_version' | 'cotizacion_consecutivo'>
  fecha_inicio: string
  plazo_dias: number
  fases: FaseCronograma[]
  ventana_corte?: VentanaCorte
  observaciones?: string
  contratista?: string
  cronogramasPrevios: Pick<CronogramaObra, 'numero_cronograma'>[]
}): ResultadoCronograma {
  const { proyecto, fecha_inicio, plazo_dias, fases, ventana_corte, observaciones, cronogramasPrevios } = params
  const err = (error: string): ResultadoCronograma => ({ ok: false, error })

  if (fechaIsoAUtc(fecha_inicio) === null) return err('La fecha de inicio no es una fecha válida.')
  if (!Number.isInteger(plazo_dias) || plazo_dias < 1) return err('El plazo debe ser un número entero de días calendario (mínimo 1).')
  if (plazo_dias > PLAZO_MAX_DIAS) return err(`El plazo supera el máximo soportado (${PLAZO_MAX_DIAS} días calendario) — verifica que esté en días, no en otra unidad.`)
  if (fases.length === 0) return err('El cronograma no tiene fases — arma al menos una fase con actividades.')

  const items = proyecto.snapshot.items_alcance ?? []
  const porClave = new Map(items.map(i => [i.clave, i]))

  // Huérfanos primero: un documento al cliente no sale referenciando un
  // alcance que ya no existe. El mensaje dice qué hacer y nombra las
  // actividades por su descripción — jamás una clave interna.
  const huerfanas = actividadesHuerfanas(fases, proyecto.snapshot)
  if (huerfanas.length > 0) {
    const nombres = huerfanas.slice(0, 3).map(h => `«${etiqueta(h.actividad.descripcion || h.actividad.item_codigo || 'sin descripción', 50)}»`).join(', ')
    const resto = huerfanas.length > 3 ? ` y ${huerfanas.length - 3} más` : ''
    return err(`${huerfanas.length} actividad(es) del cronograma referencian ítems que ya no existen en el alcance vigente (entró un cambio de alcance posterior): ${nombres}${resto}. Quítalas, vuélvelas texto libre o re-engánchalas a un ítem vigente antes de emitir.`)
  }

  // Validación fase a fase, nombrando SIEMPRE la fila que falla.
  const filasNormalizadas: FaseCronograma[] = []
  for (const fase of fases) {
    const nombreFase = fase.nombre.trim()
    if (!nombreFase) return err('Hay una fase sin nombre — toda banda del cuadro necesita su título.')
    if (fase.filas.length === 0) return err(`La fase «${etiqueta(nombreFase)}» no tiene filas — agrégale actividades o hitos, o quítala.`)
    const filas: FilaCronograma[] = []
    for (const fila of fase.filas) {
      if (fila.tipo === 'hito') {
        const nombre = fila.nombre.trim()
        if (!nombre) return err(`Hay un hito sin nombre en la fase «${etiqueta(nombreFase)}».`)
        if (!Number.isInteger(fila.dia) || fila.dia < 1 || fila.dia > plazo_dias) {
          return err(`El hito «${etiqueta(nombre)}» (fase «${etiqueta(nombreFase)}») cae fuera del plazo: día ${fila.dia} de ${plazo_dias}.`)
        }
        filas.push({ ...fila, nombre })
        continue
      }
      // actividad: si referencia un ítem vigente, hereda su descripción y
      // código (una sola verdad sobre el alcance — se congela aquí).
      const item = fila.item_clave ? porClave.get(fila.item_clave) : undefined
      const descripcion = (item?.descripcion ?? fila.descripcion).trim()
      if (!descripcion) return err(`Hay una actividad sin descripción en la fase «${etiqueta(nombreFase)}».`)
      if (!Number.isInteger(fila.dia_inicio) || !Number.isInteger(fila.dia_fin)) {
        return err(`La actividad «${etiqueta(descripcion, 50)}» (fase «${etiqueta(nombreFase)}») no tiene días válidos.`)
      }
      if (fila.dia_inicio > fila.dia_fin) {
        return err(`La actividad «${etiqueta(descripcion, 50)}» (fase «${etiqueta(nombreFase)}») termina antes de empezar (día ${fila.dia_inicio} → ${fila.dia_fin}).`)
      }
      if (fila.dia_inicio < 1 || fila.dia_fin > plazo_dias) {
        return err(`La actividad «${etiqueta(descripcion, 50)}» (fase «${etiqueta(nombreFase)}») se sale del plazo: días ${fila.dia_inicio}–${fila.dia_fin} de ${plazo_dias}.`)
      }
      filas.push({
        ...fila,
        descripcion,
        ...(item?.codigo ? { item_codigo: item.codigo } : {}),
      })
    }
    filasNormalizadas.push({ ...fase, nombre: nombreFase, filas })
  }

  // Ventana de corte programado: o está completa y bien parada, o no está.
  const enVentana = filasNormalizadas.flatMap(f => f.filas).filter(
    (fila): fila is ActividadCronograma => fila.tipo === 'actividad' && !!fila.en_ventana,
  )
  if (ventana_corte) {
    if (!Number.isInteger(ventana_corte.dia_inicio) || !Number.isInteger(ventana_corte.dia_fin)
      || ventana_corte.dia_inicio > ventana_corte.dia_fin
      || ventana_corte.dia_inicio < 1 || ventana_corte.dia_fin > plazo_dias) {
      return err(`La ventana de corte programado cae fuera del plazo: días ${ventana_corte.dia_inicio}–${ventana_corte.dia_fin} de ${plazo_dias}.`)
    }
    if (!ventana_corte.nota.trim()) return err('La ventana de corte programado necesita su nota al pie — es la que explica por qué esas actividades van juntas.')
    if (enVentana.length === 0) return err('La ventana de corte programado no agrupa ninguna actividad — marca cuáles se ejecutan con la energía cortada, o quítala.')
    for (const a of enVentana) {
      if (a.dia_inicio < ventana_corte.dia_inicio || a.dia_fin > ventana_corte.dia_fin) {
        return err(`La actividad «${etiqueta(a.descripcion, 50)}» está marcada dentro de la ventana de corte pero sus días (${a.dia_inicio}–${a.dia_fin}) se salen del marco (${ventana_corte.dia_inicio}–${ventana_corte.dia_fin}).`)
      }
    }
  } else if (enVentana.length > 0) {
    return err(`${enVentana.length} actividad(es) están marcadas "en ventana de corte" pero el cronograma no define la ventana — defínela o desmárcalas.`)
  }

  // Derivados congelados: calendario laboral colombiano.
  const fecha_fin = sumarDias(fecha_inicio, plazo_dias - 1)
  const habiles = diasHabilesEfectivos(fecha_inicio, plazo_dias)
  const festivos = festivosEnRango(fecha_inicio, plazo_dias).map(f => ({ fecha: f.fecha, nombre: f.nombre }))
  const clausulaFestivos = festivos.length > 0 ? ` y festivos (${nombrarFechas(festivos.map(f => f.fecha))})` : ' y festivos'
  const nota_jornada = `Jornada: lunes a viernes jornada completa; sábados hasta el mediodía; domingos${clausulaFestivos} no se trabaja. Días hábiles efectivos en el plazo: ${fmtDiasHabiles(habiles)}.`

  const numero_cronograma = Math.max(0, ...cronogramasPrevios.map(c => c.numero_cronograma)) + 1

  return {
    ok: true,
    cronograma: {
      numero_cronograma,
      proyecto_id: proyecto.id,
      proyecto_consecutivo: proyecto.consecutivo,
      titulo: proyecto.snapshot.asunto,
      cliente: proyecto.snapshot.cliente,
      ...(proyecto.snapshot.cliente_nit ? { cliente_nit: proyecto.snapshot.cliente_nit } : {}),
      contratista: params.contratista?.trim() || 'NEG Ingeniería S.A.S. BIC',
      ...(proyecto.cotizacion_consecutivo ? { cotizacion_consecutivo: proyecto.cotizacion_consecutivo } : {}),
      ...(proyecto.cotizacion_version ? { cotizacion_version_medida: proyecto.cotizacion_version } : {}),
      fecha_inicio,
      plazo_dias,
      fecha_fin,
      fases: filasNormalizadas,
      ...(ventana_corte ? { ventana_corte: { ...ventana_corte, nota: ventana_corte.nota.trim() } } : {}),
      dias_habiles_efectivos: habiles,
      festivos_en_rango: festivos,
      nota_jornada,
      ...(observaciones?.trim() ? { observaciones: observaciones.trim() } : {}),
    },
  }
}

// ── Historial del proyecto al emitir ─────────────────────────────────────────

export function entradaHistorialCronograma(
  estado: EstadoProyecto, consecutivo: string, numero: number,
  fechaInicio: string, fechaFin: string, uid: string, fecha: Timestamp, nombre?: string,
): EntradaHistorialProyecto {
  return {
    de: estado, a: estado,
    motivo: `Cronograma de obra ${consecutivo} (emisión ${numero}) EMITIDO — plan del ${fechaInicio} al ${fechaFin} (congelado con hash; una modificación del plan se emite como cronograma nuevo)`,
    por: uid, ...(nombre ? { por_nombre: nombre } : {}),
    fecha,
  }
}

// ── Plantilla (requisito 3 de Giovanny: nunca una hoja en blanco) ────────────

const uuid = (): string => crypto.randomUUID()

/** Siembra el cronograma: las actividades del alcance aprobado se cargan
 *  solas (una fase por grupo, cada ítem enganchado por su clave) entre las
 *  fases típicas de obra que no están en el alcance — logística de inicio,
 *  compra de material, y al cierre aseo general y entrega del informe —
 *  pre-escritas para quitar o ajustar (patrón de las observaciones
 *  pre-escritas del corte). Los DÍAS no se inventan: todo arranca en el
 *  día 1 (el acta de entrega en el último) y se programa en el editor. */
export function plantillaFases(
  snapshot: Pick<SnapshotProyecto, 'items_alcance'>,
  plazo_dias: number,
): FaseCronograma[] {
  const ultimo = Math.max(1, plazo_dias)
  const act = (descripcion: string): ActividadCronograma =>
    ({ id: uuid(), tipo: 'actividad', descripcion, dia_inicio: 1, dia_fin: 1 })
  const fases: FaseCronograma[] = [
    {
      id: uuid(), nombre: 'PRELIMINARES', filas: [
        { id: uuid(), tipo: 'hito', nombre: 'Firma del acta de inicio', dia: 1 },
        act('Logística de inicio: plan de trabajo, permisos y coordinación'),
        act('Movilización de personal, equipos y herramientas'),
      ],
    },
    {
      id: uuid(), nombre: 'SUMINISTROS', filas: [
        act('Compra y suministro de materiales y equipos'),
      ],
    },
  ]
  // Una fase por grupo del alcance, en su orden de aparición.
  const porGrupo = new Map<string, FilaCronograma[]>()
  for (const item of snapshot.items_alcance ?? []) {
    const grupo = item.grupo || 'ALCANCE'
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, [])
    porGrupo.get(grupo)!.push({
      id: uuid(), tipo: 'actividad',
      descripcion: item.descripcion,
      item_clave: item.clave,
      ...(item.codigo ? { item_codigo: item.codigo } : {}),
      dia_inicio: 1, dia_fin: 1,
    })
  }
  for (const [grupo, filas] of porGrupo) fases.push({ id: uuid(), nombre: grupo.toUpperCase(), filas })
  fases.push({
    id: uuid(), nombre: 'PRUEBAS, ENTREGA Y CIERRE', filas: [
      act('Aseo general y desmovilización'),
      act('Entrega del informe final con registro fotográfico'),
      { id: uuid(), tipo: 'hito', nombre: 'Acta de entrega y recibo final', dia: ultimo },
    ],
  })
  return fases
}
