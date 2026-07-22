// Bloque D — obra-espejo: el proyecto SIGP alimenta el panel SST creando una
// obra en la colección `obras` (la que la app Flutter YA lee) al entrar en
// ejecución. Relación 1:1 por construcción: id = pry_{proyectoId} → reintentar
// jamás duplica. La app NO se toca; el contrato de campos es EXACTO al de
// obra_model.dart (mapeo verificado campo por campo el 22-jul-2026):
//   nombre_sitio · codigo · cliente · estado ('activa' es lo único que lista) ·
//   fecha_creacion · nombre_completo ("sitio | codigo | cliente").
// Extras solo-SIGP (la app los ignora): proyecto_id, proyecto_consecutivo,
// origen:'sigp' — el panel los usa para marcar el espejo y bloquear identidad.
//
// Un solo escritor del estado: el PROYECTO (decisión 22-jul — SST no escribe
// obras). 'activa' desde en_ejecucion; 'inactiva' desde enviado_a_facturacion.

import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { ESTADOS_PROYECTO } from '../../types/sigp/proyecto'
import type { Proyecto, EstadoProyecto } from '../../types/sigp/proyecto'

/** Id determinístico de la obra-espejo (idempotencia del upsert). */
export const idObraEspejo = (proyectoId: string) => `pry_${proyectoId}`

/** "jul-2026" — distingue trabajos recurrentes del mismo sitio. */
export const mesAnio = (d: Date) =>
  `${d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')}-${d.getFullYear()}`

export interface IdentidadObraEspejo {
  nombre_sitio: string
  codigo: string
  cliente: string
  alcance: string
  nombre_completo: string
  proyecto_id: string
  proyecto_consecutivo: string
  origen: 'sigp'
}

/** Identidad de la obra desde el snapshot del proyecto (pura, testeable).
 *  Título = sitio + alcance corto (asunto) + mes/año; código = PRY-YYYY-NNN. */
export function construirObraEspejo(
  p: Pick<Proyecto, 'id' | 'consecutivo' | 'snapshot'>,
  sitio: string | undefined,
  fecha: Date,
): IdentidadObraEspejo {
  const asunto = (p.snapshot.asunto || '').trim()
  const base = (sitio || '').trim()
  const nombre_sitio = base
    ? `${base} — ${asunto} (${mesAnio(fecha)})`
    : `${asunto} (${mesAnio(fecha)})`
  return {
    nombre_sitio,
    codigo: p.consecutivo,
    cliente: p.snapshot.cliente,
    alcance: asunto,
    // Mismo formato que calcula/escribe la app: "sitio | codigo | cliente"
    nombre_completo: `${nombre_sitio} | ${p.consecutivo} | ${p.snapshot.cliente}`,
    proyecto_id: p.id,
    proyecto_consecutivo: p.consecutivo,
    origen: 'sigp',
  }
}

/** Estado de la obra según el ciclo del proyecto: 'activa' mientras hay
 *  trabajo de campo; 'inactiva' desde el handoff a facturación en adelante. */
export function estadoObraSegunProyecto(estado: EstadoProyecto): 'activa' | 'inactiva' {
  const i = ESTADOS_PROYECTO.indexOf(estado)
  const corte = ESTADOS_PROYECTO.indexOf('enviado_a_facturacion')
  return i >= 0 && i >= corte ? 'inactiva' : 'activa'
}

/** Sitio físico del proyecto: preventivo → sitio IHS de su solicitud (doc id
 *  compartido); cotización → solicitud enlazada → campo `sitio`. */
export async function obtenerSitioProyecto(
  p: Pick<Proyecto, 'id' | 'origen'>,
): Promise<string | undefined> {
  try {
    if (p.origen === 'preventivo') {
      const s = await getDoc(doc(db, 'solicitudes', p.id))
      return (s.data()?.preventivo?.sitio_nombre as string) || (s.data()?.sitio as string) || undefined
    }
    const c = await getDoc(doc(db, 'cotizaciones', p.id))
    const solId = c.data()?.solicitud_id as string | undefined
    if (!solId) return undefined
    const s = await getDoc(doc(db, 'solicitudes', solId))
    return (s.data()?.sitio as string) || undefined
  } catch {
    return undefined
  }
}

/**
 * Upsert IDEMPOTENTE de la obra-espejo. Primera vez: identidad completa +
 * estado + fecha_creacion. Siguientes: solo estado (la identidad quedó
 * congelada al crear — coherente con el principio de snapshot). NUNCA lanza
 * hacia el flujo del proyecto: devuelve false si falló y el caller avisa.
 */
export async function sincronizarObraEspejo(
  p: Pick<Proyecto, 'id' | 'consecutivo' | 'snapshot' | 'origen' | 'estado'>,
): Promise<boolean> {
  // Defensa en profundidad: antes de en_ejecucion NO existe trabajo de campo —
  // jamás crear una obra prematura (la UI ya gatea; esto lo garantiza).
  if (ESTADOS_PROYECTO.indexOf(p.estado) < ESTADOS_PROYECTO.indexOf('en_ejecucion')) {
    console.warn(`obra-espejo: ignorado — el proyecto está en '${p.estado}' (aún sin ejecución)`)
    return false
  }
  try {
    const refObra = doc(db, 'obras', idObraEspejo(p.id))
    const estado = estadoObraSegunProyecto(p.estado)
    const ahora = Timestamp.now()
    const existente = await getDoc(refObra)
    if (!existente.exists()) {
      const sitio = await obtenerSitioProyecto(p)
      await setDoc(refObra, {
        ...construirObraEspejo(p, sitio, ahora.toDate()),
        estado,
        fecha_creacion: ahora,
        fecha_actualizacion: ahora,
      })
    } else {
      await updateDoc(refObra, { estado, fecha_actualizacion: ahora })
    }
    return true
  } catch (e) {
    console.error('Error sincronizando la obra-espejo:', e)
    return false
  }
}
