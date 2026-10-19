/**
 * Módulo Tareas — utilidades de acceso a datos.
 *
 * `listarAsignables()` reemplaza a la CF `listarAsignables` del diseño
 * original (SB1): el `read` de `users` en firestore.rules ya cubre get+list
 * para `esPersonalPanel()` (los 9 roles del panel), así que el selector de
 * "asignar a / pasar el balón a" es un query directo — cero cambios a las
 * reglas de `users`, cero CF nueva, cero exposición nueva.
 *
 * Caveat anotado: `cliente_final` está en ROLES_PANEL_WEB pero NO en
 * esPersonalPanel() — es rol futuro sin usuarios; cuando se active habrá
 * que revisitar su acceso (no podría listar personas ni leer tareas).
 */
import { addDoc, collection, getDocs, query, Timestamp, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { ROLES_PANEL_WEB } from '../../types/sigp/roles'
import { construirTareaAcap, type DatosTareaAcap } from '../../types/sigp/tarea'

export interface PersonaAsignable {
  uid: string
  nombre: string
  email: string
  rol: string
}

/** Personas activas del panel, elegibles para asignar tareas o recibir el
 *  balón. El filtro de rol va CLIENT-SIDE (maneja el legacy `role` y evita
 *  un `where in` con índice). Orden alfabético por nombre (es-CO). */
export async function listarAsignables(): Promise<PersonaAsignable[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('estado', '==', 'activo')))
  const roles = ROLES_PANEL_WEB as readonly string[]
  return snap.docs
    .map(d => {
      const data = d.data() as Record<string, unknown>
      return {
        uid: d.id,
        nombre: String(data.nombre ?? data.email ?? d.id),
        email: String(data.email ?? ''),
        rol: String(data.rol ?? data.role ?? ''),
      }
    })
    .filter(p => roles.includes(p.rol))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
}

/**
 * Crea la tarea de una actividad del plan PHVA de una AC/AP. Todo el documento sale
 * del builder `construirTareaAcap` (la UI no arma writes). Devuelve el id de la
 * tarea creada, o null si los datos no sirven (sin escribir). Lanza si la regla
 * deniega (p. ej. un rol sin permiso para asignar a otros).
 */
export async function crearTareaAcap(
  datos: DatosTareaAcap, creador: { uid: string; nombre: string },
): Promise<string | null> {
  const tarea = construirTareaAcap(datos, creador, Timestamp.now())
  if (!tarea) return null
  const ref = await addDoc(collection(db, 'tareas'), tarea)
  return ref.id
}
