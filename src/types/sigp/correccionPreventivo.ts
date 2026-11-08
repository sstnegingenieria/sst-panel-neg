// Corrección de clasificación de preventivos POR EL PANEL (07-nov-2026).
// Caso que lo motivó: los once de Vertis necesitaron un acto de datos por
// script — un error de captura tiene que tener salida en la herramienta.
//
// Qué corrige: tipo_sitio, intensidad y es_jungle de un preventivo ya
// registrado → recalcula el valor con la matriz → actualiza solicitud,
// proyecto (venta, alcance, ítem, asunto) y la base del alcance de la
// preliquidación DEFINIDA (el valor del contratista JAMÁS — decisión
// comercial aparte, orden expresa de Giovanny en los once).
//
// LÍMITE EXPLÍCITO: la ZONA y el departamento NO se corrigen aquí — si la
// zona estaba mal, esto no lo arregla (la pantalla lo dice; si el caso
// aparece, se trae a Giovanny antes de ampliar).
//
// Quién: gerencia_general, gerencia_administrativa y admin — quien captura
// no se corrige a sí misma. Las PRECONDICIONES no se negocian (las mismas
// del script de los once): sin preliquidación aprobada, sin anticipo girado,
// sin liquidación, sin OC, sin factura, sin pago. Con algo de eso, el camino
// no es corregir — y la pantalla dice EXACTAMENTE qué lo impide, con nombre
// propio, no un "no se puede" seco.
import { Timestamp } from 'firebase/firestore'
import type { Proyecto, EntradaHistorialProyecto } from './proyecto'
import type { Solicitud, CambioEstado, DatosPreventivo } from './solicitud'
import type { AsignacionContratista, EntradaHistorialAsignacion, MargenEnVivo, PreliquidacionAsignacion } from './asignacion'
import { girosVivosDe, anticipoTotalDe, margenEnVivoDe } from './asignacion'
import type { EstadoOrdenCompra } from './ordenCompra'
import { ESTADO_OC_LABEL } from './ordenCompra'
import { precioPreventivo, TIPO_SITIO_LABEL, INTENSIDAD_LABEL } from './preventivos'
import type { PrecioPreventivo } from './preventivos'
import type { ClasificacionSitio } from './sitioPreventivo'
import { resumenClasificacion } from './sitioPreventivo'
import { fmtMoney } from '../../utils/sigp/formato'

/** Lo mínimo que la verificación necesita de una OC ligada al proyecto. */
export interface OcLigada {
  consecutivo?: string
  estado: EstadoOrdenCompra
}

const fechaCorta = (t?: Timestamp): string =>
  t ? t.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/** Los impedimentos CON NOMBRE PROPIO — la mitad del valor del bloque:
 *  "Preliquidación aprobada por Marcela el 03-nov" le dice a quien mira qué
 *  tiene que resolver; "no se puede" lo manda a preguntar. [] = corregible. */
export function impedimentosCorreccion(
  p: Pick<Proyecto, 'origen' | 'estado' | 'facturacion' | 'pago_cliente' | 'liquidacion'>,
  asignaciones: Pick<AsignacionContratista, 'contratista_nombre' | 'estado' | 'preliquidacion' | 'liquidacion'>[],
  ocs: OcLigada[],
  resolverNombre?: (uid: string) => string | undefined,
): string[] {
  const out: string[] = []
  if (p.origen !== 'preventivo') out.push('No es un proyecto de preventivo (el precio no sale de la matriz)')
  if (p.estado === 'cerrado') out.push('Proyecto CERRADO — inmutable')
  if (p.estado === 'cancelado') out.push('Proyecto CANCELADO — inmutable')
  if (p.facturacion)
    out.push(`Factura ${p.facturacion.numero} registrada el ${fechaCorta(p.facturacion.fecha_registro ?? p.facturacion.fecha)} por ${fmtMoney(p.facturacion.valor)}`)
  if (p.pago_cliente)
    out.push(`Pago del cliente registrado el ${fechaCorta(p.pago_cliente.fecha)} por ${fmtMoney(p.pago_cliente.valor)}`)
  if (p.liquidacion) out.push('Liquidación del contratista registrada')
  for (const a of asignaciones) {
    if (a.estado === 'cancelada') continue
    const pre = a.preliquidacion
    if (pre?.aprobada_por) {
      const quien = resolverNombre?.(pre.aprobada_por) ?? pre.aprobada_por
      out.push(`Preliquidación de ${a.contratista_nombre} APROBADA por ${quien} el ${fechaCorta(pre.fecha_aprobacion)}`)
    }
    const giros = girosVivosDe(pre)
    if (giros.length > 0)
      out.push(`Anticipo girado a ${a.contratista_nombre}: ${fmtMoney(anticipoTotalDe(pre))} (${giros.length} giro(s) vivo(s))`)
    if (a.estado === 'liquidada' || a.liquidacion)
      out.push(`Asignación de ${a.contratista_nombre} LIQUIDADA`)
  }
  for (const oc of ocs) {
    if (oc.estado === 'anulada') continue
    out.push(`Orden de compra ${oc.consecutivo ?? '(borrador sin código)'} en estado ${ESTADO_OC_LABEL[oc.estado] ?? oc.estado} ligada al proyecto`)
  }
  return out
}

/** Vista previa del margen de una preliquidación definida con la venta nueva —
 *  el caso real de los once: las diez de David pasaron a 77% y había que
 *  verlo ANTES de aplicar. */
export interface MargenCorreccion {
  contratista: string
  valor_contratista: number
  antes: MargenEnVivo
  despues: MargenEnVivo
}

export interface PlanCorreccion {
  ventaAntes: number
  ventaNueva: number
  precio: PrecioPreventivo
  asuntoNuevo: string
  clasifAntes: ClasificacionSitio
  /** Margen antes→después por asignación con preliquidación definida. */
  margenes: MargenCorreccion[]
  patchSolicitud: { preventivo: DatosPreventivo; historial: CambioEstado[]; fecha_actualizacion: Timestamp }
  patchProyecto: {
    valor_venta_inicial: number
    snapshot: Proyecto['snapshot']
    historial: EntradaHistorialProyecto[]
    fecha_actualizacion: Timestamp
  }
  /** Solo las asignaciones con preliquidación definida (valor_alcance). */
  patchesAsignacion: { id: string; preliquidacion: PreliquidacionAsignacion; historial: EntradaHistorialAsignacion[]; fecha_actualizacion: Timestamp }[]
}

export type ResultadoPlan = { ok: true; plan: PlanCorreccion } | { ok: false; error: string }

/** Arma el plan completo de la corrección — PURO (quien llama escribe los
 *  tres docs en UN batch). Falla con razón si la combinación nueva no existe
 *  en la matriz, si nada cambia, o si la solicitud no trae el dato. */
export function planCorreccionPreventivo(args: {
  solicitud: Pick<Solicitud, 'preventivo' | 'historial' | 'estado'>
  proyecto: Pick<Proyecto, 'snapshot' | 'historial' | 'estado' | 'valor_venta_inicial'>
  asignaciones: (Pick<AsignacionContratista, 'contratista_nombre' | 'estado' | 'preliquidacion' | 'historial'> & { id: string })[]
  nueva: ClasificacionSitio
  motivo: string
  uid: string
  nombreUsuario?: string
  rol: string
  fecha: Timestamp
}): ResultadoPlan {
  const { solicitud, proyecto, asignaciones, nueva, uid, rol, fecha } = args
  const motivo = args.motivo.trim()
  const prev = solicitud.preventivo
  if (!prev) return { ok: false, error: 'La solicitud no tiene datos de preventivo' }
  if (!motivo) return { ok: false, error: 'El motivo es obligatorio' }
  const antes: ClasificacionSitio = { tipo_sitio: prev.tipo_sitio, intensidad: prev.intensidad, es_jungle: prev.es_jungle }
  if (antes.tipo_sitio === nueva.tipo_sitio && antes.intensidad === nueva.intensidad && antes.es_jungle === nueva.es_jungle)
    return { ok: false, error: 'La clasificación elegida es la misma que la registrada — nada que corregir' }
  const precio = precioPreventivo({ zona: prev.zona, tipo: nueva.tipo_sitio, intensidad: nueva.intensidad, es_jungle: nueva.es_jungle, es_sai: prev.es_sai })
  if (!precio) return { ok: false, error: `Combinación no disponible en la matriz (${TIPO_SITIO_LABEL[nueva.tipo_sitio]} ${INTENSIDAD_LABEL[nueva.intensidad]} — rooftop solo pesado)` }

  const snap = proyecto.snapshot
  const ventaAntes = snap.valor_venta
  const ventaNueva = precio.total
  if ((snap.alcance ?? []).length !== 1 || (snap.items_alcance ?? []).length !== 1)
    return { ok: false, error: 'El alcance del proyecto no es el renglón único de matriz esperado — corregir por acto de datos' }

  // Asunto reconstruido con la plantilla del nacimiento (construirSnapshotPreventivo)
  const renglon = `Mantenimiento preventivo ${INTENSIDAD_LABEL[nueva.intensidad].toLowerCase()} — ${prev.sitio_nombre}`
  const asuntoNuevo = `${renglon} (${TIPO_SITIO_LABEL[nueva.tipo_sitio]}${nueva.es_jungle ? ' · jungle' : ''}${prev.es_sai ? ' · SAI' : ''} · ${prev.zona})`

  const quien = args.nombreUsuario ? `${args.nombreUsuario} (${rol})` : rol
  const motivoCompleto =
    `Corrección de clasificación del preventivo — ${resumenClasificacion(antes)} → ${resumenClasificacion(nueva)} · ` +
    `venta ${ventaAntes} → ${ventaNueva} (matriz ${prev.zona}${prev.es_sai ? ' · SAI' : ''}) · ` +
    `el valor del contratista NO se toca (decisión comercial aparte) · Motivo: ${motivo} · Autorizó: ${quien}`

  const margenes: MargenCorreccion[] = []
  const patchesAsignacion: PlanCorreccion['patchesAsignacion'] = []
  for (const a of asignaciones) {
    if (a.estado === 'cancelada') continue
    const pre = a.preliquidacion
    if (!pre) continue
    margenes.push({
      contratista: a.contratista_nombre,
      valor_contratista: pre.valor_contratista,
      antes: margenEnVivoDe(ventaAntes, pre.valor_contratista),
      despues: margenEnVivoDe(ventaNueva, pre.valor_contratista),
    })
    const entradaA: EntradaHistorialAsignacion = {
      de: a.estado, a: a.estado, por: uid,
      ...(args.nombreUsuario ? { por_nombre: args.nombreUsuario } : {}),
      fecha, motivo: motivoCompleto,
    }
    patchesAsignacion.push({
      id: a.id,
      preliquidacion: { ...pre, valor_alcance: ventaNueva },
      historial: [...(a.historial ?? []), entradaA],
      fecha_actualizacion: fecha,
    })
  }

  const entradaS: CambioEstado = { de: solicitud.estado, a: solicitud.estado, por: uid, fecha, motivo: motivoCompleto }
  const entradaP: EntradaHistorialProyecto = {
    de: proyecto.estado, a: proyecto.estado, por: uid,
    ...(args.nombreUsuario ? { por_nombre: args.nombreUsuario } : {}),
    fecha, motivo: motivoCompleto,
  } as EntradaHistorialProyecto

  return {
    ok: true,
    plan: {
      ventaAntes, ventaNueva, precio, asuntoNuevo, clasifAntes: antes, margenes,
      patchSolicitud: {
        preventivo: { ...prev, tipo_sitio: nueva.tipo_sitio, intensidad: nueva.intensidad, es_jungle: nueva.es_jungle },
        historial: [...(solicitud.historial ?? []), entradaS],
        fecha_actualizacion: fecha,
      },
      patchProyecto: {
        valor_venta_inicial: ventaNueva,
        snapshot: {
          ...snap,
          valor_venta: ventaNueva,
          asunto: asuntoNuevo,
          alcance: [{ ...snap.alcance[0], subtotal: ventaNueva }],
          items_alcance: [{ ...snap.items_alcance![0], valor_total: ventaNueva }],
        },
        historial: [...(proyecto.historial ?? []), entradaP],
        fecha_actualizacion: fecha,
      },
      patchesAsignacion,
    },
  }
}
