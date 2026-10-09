// Latido de PRESENCIA (rebuild jornada oct-2026) — corre mientras el panel
// está EN USO, montado en el Layout del personal interno.
//
// Mecánica: listeners globales de interacción (puntero/tecla/scroll,
// passive) → en el propio handler se evalúa debeLatir(): la PRIMERA
// interacción del día late DE INMEDIATO (la hora de inicio no espera el
// tick — agregado 2) y después a ventana de latido_min. Sin interacción
// nadie evalúa nada: una pestaña abandonada deja de latir por construcción
// (uso vs abandono sin heurística). El cruce de medianoche con pestaña viva
// se resuelve comparando el día local del último latido: la primera
// interacción del día nuevo late de inmediato y la CF la pone en el doc del
// día nuevo (caso Paula).
//
// 🔒 PRIVACIDAD: los listeners tocan UNA variable en memoria y no distinguen
// siquiera clic de tecla; la CF recibe {accion:'latido'} y nada más. Aquí no
// se registra ni puede registrarse qué se hace — solo que se está.
//
// No-fatal por contrato: un fallo de la CF jamás molesta al usuario; el
// estado no se actualiza y la próxima interacción reintenta.
import { useEffect, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, getDoc } from 'firebase/firestore'
import { db, functions } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import { debeLatir, LATIDO_MIN_DEFAULT } from '../types/sigp/jornada'
import { claveDia } from '../types/sigp/horario'
import { accesoResidente, type Rol } from '../types/sigp/roles'

const EVENTOS_INTERACCION = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export function usePresencia(): void {
  const { user } = useAuth()
  const uid = user?.uid
  // El rol decide si este usuario late (espejo del guard de la CF).
  const late = !!uid && !!user?.rol && user.rol !== 'tecnico' && !accesoResidente(user.rol as Rol)

  const ultimoLatido = useRef<{ ms: number; dia: string } | null>(null)
  const enVuelo = useRef(false)
  const latidoMin = useRef(LATIDO_MIN_DEFAULT)

  useEffect(() => {
    if (!late) return
    ultimoLatido.current = null

    // latido_min configurable (configuracion/horario) — best-effort, default 10.
    getDoc(doc(db, 'configuracion', 'horario'))
      .then(s => {
        const v = s.exists() ? (s.data().latido_min as unknown) : null
        if (typeof v === 'number' && v >= 1 && v <= 120) latidoMin.current = v
      })
      .catch(() => { /* sin lectura → default */ })

    const onInteraccion = () => {
      const ahora = Date.now()
      const hoy = claveDia(new Date(ahora))
      // Cambio de día local con la pestaña viva → como primera interacción.
      const previo = ultimoLatido.current && ultimoLatido.current.dia === hoy
        ? ultimoLatido.current.ms
        : null
      if (enVuelo.current || !debeLatir(previo, ahora, latidoMin.current)) return
      enVuelo.current = true
      httpsCallable(functions, 'latidoJornada')({ accion: 'latido' })
        .then(() => { ultimoLatido.current = { ms: ahora, dia: hoy } })
        .catch(e => console.warn('Presencia: latido no registrado', e))
        .finally(() => { enVuelo.current = false })
    }

    for (const ev of EVENTOS_INTERACCION) {
      window.addEventListener(ev, onInteraccion, { passive: true, capture: true })
    }
    return () => {
      for (const ev of EVENTOS_INTERACCION) {
        window.removeEventListener(ev, onInteraccion, { capture: true } as EventListenerOptions)
      }
    }
  }, [late, uid])
}
