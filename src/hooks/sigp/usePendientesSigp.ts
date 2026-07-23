// Contadores VIVOS de los pendientes del pipeline comercial (23-jul-2026):
// visitas `pendiente_agendar` y cotizaciones `pendiente_diligenciar`.
// Alimenta los badges CLICKEABLES del sidebar (estilo "Registros: 32") —
// mismo patrón onSnapshot de NotificacionesContext, acotado: solo suscribe
// cuando el usuario tiene acceso SIGP y el flag está activo (lo decide el
// caller pasando `activo`).
import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'

export function usePendientesSigp(activo: boolean) {
  const [visitasPendientes, setVisitasPendientes] = useState(0)
  const [cotizacionesPendientes, setCotizacionesPendientes] = useState(0)

  useEffect(() => {
    if (!activo) return
    const unsubV = onSnapshot(
      query(collection(db, 'visitas'), where('estado', '==', 'pendiente_agendar')),
      snap => setVisitasPendientes(snap.size),
      () => setVisitasPendientes(0),
    )
    const unsubC = onSnapshot(
      query(collection(db, 'cotizaciones'), where('estado', '==', 'pendiente_diligenciar')),
      snap => setCotizacionesPendientes(snap.size),
      () => setCotizacionesPendientes(0),
    )
    return () => { unsubV(); unsubC() }
  }, [activo])

  return { visitasPendientes, cotizacionesPendientes }
}
