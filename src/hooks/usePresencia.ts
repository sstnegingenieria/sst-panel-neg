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
import { debeLatir, LATIDO_MIN_DEFAULT, CLAVE_MARCA_LS } from '../types/sigp/jornada'
import { claveDia } from '../types/sigp/horario'
import { accesoResidente, type Rol } from '../types/sigp/roles'

/** Marca local del último latido/entrada — la consume el guard de arranque
 *  del AuthContext (día nuevo exige login) sin leer Firestore (el personal
 *  no puede leer `jornadas`; su propia marca vive en SU navegador, que es
 *  exactamente el ámbito correcto para "esta pestaña estaba trabajando"). */
export function guardarMarcaLocal(uid: string, ahora: Date): void {
  try {
    localStorage.setItem(CLAVE_MARCA_LS(uid), JSON.stringify({ dia: claveDia(ahora), ts: ahora.getTime() }))
  } catch { /* LS inaccesible — el guard degradará a pedir login */ }
}

const EVENTOS_INTERACCION = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

// Última interacción REAL (en memoria, jamás persistida — privacidad igual):
// la consume el banner de cierre para distinguir "sigue trabajando" de "ya no
// está" al vencer el countdown (debeCerrarAlVencer). No distingue clic de
// tecla ni dónde ocurrió — solo un instante.
let ultimaInteraccionMs = 0
export const getUltimaInteraccionMs = (): number => ultimaInteraccionMs

export function usePresencia(): void {
  const { user, cerrandoSesion } = useAuth()
  const uid = user?.uid
  // El rol decide si este usuario late (espejo del guard de la CF).
  const late = !!uid && !!user?.rol && user.rol !== 'tecnico' && !accesoResidente(user.rol as Rol)

  const ultimoLatido = useRef<{ ms: number; dia: string } | null>(null)
  const enVuelo = useRef(false)
  const latidoMin = useRef(LATIDO_MIN_DEFAULT)
  // ⚠ CARRERA CERRADA (13-oct, destapada por el E2E de salida anticipada):
  // el PROPIO clic en "Salir" genera pointerdown → un latido lanzado en
  // paralelo con la CF 'salir' puede llegar DESPUÉS del cierre manual y
  // RETIRARLO (la vía "la persona volvió" — correcta para presencia real,
  // espuria para el clic que se está yendo). Durante el cierre de sesión
  // NO se late; la variable de interacción sí se actualiza (el banner la
  // necesita hasta el final).
  const cerrandoRef = useRef(false)
  useEffect(() => { cerrandoRef.current = cerrandoSesion }, [cerrandoSesion])

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
      ultimaInteraccionMs = ahora
      const hoy = claveDia(new Date(ahora))
      // Cambio de día local con la pestaña viva → como primera interacción.
      const previo = ultimoLatido.current && ultimoLatido.current.dia === hoy
        ? ultimoLatido.current.ms
        : null
      if (cerrandoRef.current || enVuelo.current || !debeLatir(previo, ahora, latidoMin.current)) return
      enVuelo.current = true
      httpsCallable(functions, 'latidoJornada')({ accion: 'latido' })
        .then(() => {
          ultimoLatido.current = { ms: ahora, dia: hoy }
          if (uid) guardarMarcaLocal(uid, new Date(ahora))
        })
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
