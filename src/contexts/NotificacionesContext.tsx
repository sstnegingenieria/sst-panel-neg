import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from './AuthContext'

interface NotificacionesCtx {
  pendientesRegistros: number   // formularios sin revisar
  pendientesTecnicos: number    // técnicos esperando aprobación
  total: number
}

const Ctx = createContext<NotificacionesCtx>({ pendientesRegistros: 0, pendientesTecnicos: 0, total: 0 })

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [pendientesRegistros, setPendientesRegistros] = useState(0)
  const [pendientesTecnicos, setPendientesTecnicos]   = useState(0)

  useEffect(() => {
    // Solo suscribirse si hay usuario autenticado con rol de panel
    if (!user || !['sst', 'admin'].includes(user.rol)) return

    // ── Formularios pendientes de revisión ────────────────────────────────────
    const unsubFormularios = onSnapshot(
      collection(db, 'formularios'),
      snap => {
        const count = snap.docs.filter(d => {
          const rev = d.data().revision_sst
          return !rev || rev.estado === 'pendiente'
        }).length
        setPendientesRegistros(count)
      },
      () => {} // ignorar errores silenciosamente
    )

    // ── Técnicos pendientes de aprobación ─────────────────────────────────────
    const unsubUsuarios = onSnapshot(
      collection(db, 'users'),
      snap => {
        const count = snap.docs.filter(d => d.data().estado === 'pendiente').length
        setPendientesTecnicos(count)
      },
      () => {}
    )

    return () => {
      unsubFormularios()
      unsubUsuarios()
    }
  }, [user])

  return (
    <Ctx.Provider value={{
      pendientesRegistros,
      pendientesTecnicos,
      total: pendientesRegistros + pendientesTecnicos,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useNotificaciones() {
  return useContext(Ctx)
}
