import { useCallback, useRef } from 'react'
import { addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useFirestore } from './useFirestore'
import { ROLES_PANEL_WEB } from '../types/sigp/roles'
import type { EmpleadoDirecto } from '../types/empleadoDirecto'
import {
  construirAlta, construirEdicion, patchBaja, patchReactivar,
  type EmpleadoFormData,
} from '../utils/empleadosDirectos'

export interface UsuarioVinculable {
  id: string
  nombre: string
  email: string
  rol: string
}

const COL = 'empleados_directos'

export function useEmpleadosDirectos() {
  // useFirestore() devuelve funciones NUEVAS en cada render; si entraran como
  // dependencia de los useCallback, el `useEffect(load)` de la página se
  // re-dispararía en bucle. La ref las deja fuera de las deps y mantiene
  // estables las funciones que expone este hook.
  const fs = useFirestore()
  const fsRef = useRef(fs)
  fsRef.current = fs

  const cargar = useCallback(async () => {
    return await fsRef.current.getAllOrdered(COL, 'nombre', 'asc') as EmpleadoDirecto[]
  }, [])

  /** Usuarios ACTIVOS del panel (excluye técnicos y cliente_final) para el vínculo opcional. */
  const cargarUsuariosVinculables = useCallback(async () => {
    const users = await fsRef.current.getAll('users') as unknown as
      { id: string; nombre?: string; email?: string; rol?: string; estado?: string }[]
    const rolesPanel = ROLES_PANEL_WEB.filter(r => r !== 'cliente_final') as string[]
    return users
      .filter(u => u.estado === 'activo' && !!u.rol && rolesPanel.includes(u.rol))
      .map(u => ({ id: u.id, nombre: u.nombre ?? '', email: u.email ?? '', rol: u.rol as string }))
      .sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email, 'es', { sensitivity: 'base' })) as UsuarioVinculable[]
  }, [])

  // addDoc directo (no useFirestore.add): éste inyectaría un `fecha_creacion`
  // redundante con `fecha_carga` — un hecho, un lugar.
  const crear = useCallback(async (form: EmpleadoFormData, uid: string) => {
    const ref = await addDoc(collection(db, COL), construirAlta(form, uid, Timestamp.now()))
    return ref.id
  }, [])

  const editar = useCallback(async (id: string, form: EmpleadoFormData, uid: string) => {
    await fsRef.current.update(COL, id, construirEdicion(form, uid, Timestamp.now()))
  }, [])

  /** Baja SOFT. Devuelve false si la fecha es inválida (sin escribir). */
  const darDeBaja = useCallback(async (emp: EmpleadoDirecto, fechaRetiro: string, uid: string) => {
    const patch = patchBaja(fechaRetiro, emp.fecha_ingreso, uid, Timestamp.now())
    if (!patch) return false
    await fsRef.current.update(COL, emp.id, patch)
    return true
  }, [])

  const reactivar = useCallback(async (id: string, uid: string) => {
    await fsRef.current.update(COL, id, patchReactivar(uid, Timestamp.now()))
  }, [])

  return { cargar, cargarUsuariosVinculables, crear, editar, darDeBaja, reactivar }
}
