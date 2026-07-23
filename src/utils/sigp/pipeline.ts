// Pipeline automático solicitud → visita → cotización (23-jul-2026).
//
// La DECISIÓN de la solicitud (y la realización de la visita) crea sola el
// siguiente pendiente como BORRADOR SIN código, precargado y editable:
//   · solicitud → "requiere visita"    ⇒ visita `pendiente_agendar`
//   · solicitud → "lista para cotizar" ⇒ cotización `pendiente_diligenciar`
//   · visita `realizada`               ⇒ cotización `pendiente_diligenciar`
//
// PRINCIPIO (contigüidad ISO): los borradores NO llevan consecutivo. El
// número (server-side, generarConsecutivo) se asigna al MATERIALIZAR — la
// visita al AGENDAR (VIS), la cotización al DILIGENCIAR (COT). Un pendiente
// cancelado jamás quema número.
//
// IDEMPOTENCIA por dos capas: id determinístico (`sol_{id}` / `vis_{id}` —
// reintentar no duplica) + consulta previa por enlace (si la solicitud ya
// tiene visita/cotización — incluso creada a mano — no se crea otra).
import {
  collection, doc, getDoc, getDocs, query, where, limit, setDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { calcularTotales } from '../../types/sigp/cotizacion'
import type { Solicitud } from '../../types/sigp/solicitud'
import type { Visita } from '../../types/sigp/visita'
import type { Cliente } from '../../types/sigp/cliente'

/** Doc del borrador de VISITA (puro, testeable). SIN consecutivo. */
export function docBorradorVisita(solicitud: Solicitud, uid: string, ahora: Timestamp): Record<string, unknown> {
  return {
    consecutivo: '',                       // se asigna al AGENDAR
    tipo: 'estacion_base',                 // default editable al agendar
    subtipo: 'greenfield',
    estado: 'pendiente_agendar',
    solicitud_id: solicitud.id,
    ...(solicitud.cliente_id ? { cliente_id: solicitud.cliente_id } : {}),
    ...(solicitud.prospecto_nombre ? { prospecto_nombre: solicitud.prospecto_nombre } : {}),
    ...(solicitud.nombre_sitio?.trim() ? { sitio: solicitud.nombre_sitio.trim() } : {}),
    ejecutor: { tipo: 'neg' },             // se define al agendar
    registrada_por: uid,
    checklist: [], hallazgos: [], cantidades: [], adjuntos: [],
    historial: [{ de: null, a: 'pendiente_agendar', por: uid, fecha: ahora }],
    fecha_creacion: ahora,
  }
}

/** Doc padre + versión 1 del borrador de COTIZACIÓN (puro). SIN consecutivo. */
export function docBorradorCotizacion(
  solicitud: Solicitud, uid: string, ahora: Timestamp,
  cliente: Pick<Cliente, 'contactos' | 'condiciones_comerciales'> | null,
  visitaId?: string,
): { padre: Record<string, unknown>; version: Record<string, unknown> } {
  const esquema = cliente?.condiciones_comerciales?.esquema_impuestos ?? 'iva_pleno'
  const totales = calcularTotales([], esquema, undefined, 19)
  const contacto = solicitud.contacto?.nombre?.trim() || cliente?.contactos?.[0]?.nombre || ''
  return {
    padre: {
      consecutivo: '',                     // se asigna al DILIGENCIAR
      asunto: solicitud.asunto?.trim() || `Solicitud ${solicitud.consecutivo}`,
      es_licitacion: false,
      estado: 'pendiente_diligenciar',
      version_activa: 1, total: 0, validez_dias: 30, adjuntos: [],
      solicitud_id: solicitud.id,
      ...(visitaId ? { visita_id: visitaId } : {}),
      ...(solicitud.cliente_id ? { cliente_id: solicitud.cliente_id } : {}),
      ...(solicitud.prospecto_nombre ? { prospecto_nombre: solicitud.prospecto_nombre } : {}),
      ...(contacto ? { contacto } : {}),
      ...(solicitud.nombre_sitio?.trim() ? { nombre_sitio: solicitud.nombre_sitio.trim() } : {}),
      ...(solicitud.codigo_sitio_cliente?.trim() ? { codigo_sitio_cliente: solicitud.codigo_sitio_cliente.trim() } : {}),
      historial: [{ de: null, a: 'pendiente_diligenciar', por: uid, fecha: ahora }],
      registrada_por: uid, fecha_creacion: ahora,
    },
    version: {
      version: 1, esquema, iva_pct: 19, items: [],
      condiciones: { forma_pago: '', validez_dias: 30, tiempo_ejecucion: '', garantia: '', moneda: 'COP' },
      totales, creada_por: uid, fecha_creacion: ahora,
    },
  }
}

/** ¿Ya existe una visita enlazada a la solicitud? (cualquiera, incluso manual). */
async function hayVisitaDeSolicitud(solicitudId: string): Promise<boolean> {
  const q = await getDocs(query(collection(db, 'visitas'), where('solicitud_id', '==', solicitudId), limit(1)))
  return !q.empty
}

/** ¿Ya existe una cotización enlazada a la solicitud? (una sola por solicitud). */
async function hayCotizacionDeSolicitud(solicitudId: string): Promise<boolean> {
  const q = await getDocs(query(collection(db, 'cotizaciones'), where('solicitud_id', '==', solicitudId), limit(1)))
  return !q.empty
}

/** Crea el borrador de visita para la solicitud. Devuelve true si lo creó
 *  (false = ya existía una — idempotente, no duplica). */
export async function crearBorradorVisita(solicitud: Solicitud, uid: string): Promise<boolean> {
  const id = `sol_${solicitud.id}`
  if ((await getDoc(doc(db, 'visitas', id))).exists()) return false
  if (await hayVisitaDeSolicitud(solicitud.id)) return false
  await setDoc(doc(db, 'visitas', id), docBorradorVisita(solicitud, uid, Timestamp.now()))
  return true
}

/** Crea el borrador de cotización (vía directa `sol_{id}` o desde visita
 *  `vis_{id}`). Devuelve true si lo creó (false = ya existía — idempotente). */
export async function crearBorradorCotizacion(
  solicitud: Solicitud, uid: string, visita?: Pick<Visita, 'id'>,
): Promise<boolean> {
  const id = visita ? `vis_${visita.id}` : `sol_${solicitud.id}`
  if ((await getDoc(doc(db, 'cotizaciones', id))).exists()) return false
  if (await hayCotizacionDeSolicitud(solicitud.id)) return false
  let cliente: (Pick<Cliente, 'contactos' | 'condiciones_comerciales'>) | null = null
  if (solicitud.cliente_id) {
    const c = await getDoc(doc(db, 'clientes', solicitud.cliente_id))
    if (c.exists()) cliente = c.data() as Cliente
  }
  const ahora = Timestamp.now()
  const { padre, version } = docBorradorCotizacion(solicitud, uid, ahora, cliente, visita?.id)
  await setDoc(doc(db, 'cotizaciones', id), padre)
  await setDoc(doc(db, 'cotizaciones', id, 'versiones', '1'), version)
  return true
}
