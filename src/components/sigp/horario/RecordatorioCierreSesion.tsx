// Validador de horario (#3, SB3) — recordatorio "no olvides cerrar sesión".
//
// Para TODOS los roles logueados (decisión 07-ago): al pasar la
// `hora_fin_jornada` de configuracion/horario (comparada en HORA LOCAL del
// navegador) muestra un banner una vez por día (marca en localStorage), con
// botón directo de cerrar sesión — el logout es lo que registra la marca de
// salida vía CF. Sin config o sin permiso de lectura → silencioso.
// Chequeo suave: al montar + cada 5 minutos (sin timers agresivos).
import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { claveDia, esHoraValida } from '../../../types/sigp/horario'

const CLAVE_LS = (dia: string) => `sigp.horario.recordatorio.${dia}`
const INTERVALO_MS = 5 * 60_000

export default function RecordatorioCierreSesion() {
  const { user, logout, cerrandoSesion } = useAuth()
  const [horaFin, setHoraFin] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  // La hora de fin de jornada se lee una vez por montaje (cambia poco).
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'configuracion', 'horario'))
      .then(s => {
        const h = s.exists() ? (s.data().hora_fin_jornada as string | undefined) : undefined
        setHoraFin(h && esHoraValida(h) ? h.trim() : null)
      })
      .catch(() => setHoraFin(null))   // sin permiso/offline → sin recordatorio
  }, [user])

  useEffect(() => {
    if (!user || !horaFin) return
    const chequear = () => {
      const ahora = new Date()
      const [h, m] = horaFin.split(':').map(Number)
      const pasoLaHora = ahora.getHours() > h || (ahora.getHours() === h && ahora.getMinutes() >= m)
      if (pasoLaHora && !localStorage.getItem(CLAVE_LS(claveDia(ahora)))) setVisible(true)
    }
    chequear()
    const t = setInterval(chequear, INTERVALO_MS)
    return () => clearInterval(t)
  }, [user, horaFin])

  if (!visible || !user) return null

  const descartar = () => {
    localStorage.setItem(CLAVE_LS(claveDia(new Date())), '1')
    setVisible(false)
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-sm bg-white border border-amber-300 rounded-xl shadow-lg p-4"
      role="alert">
      <p className="text-sm font-semibold text-gray-800">🕔 Fin de la jornada</p>
      <p className="text-xs text-gray-600 mt-1">
        Ya pasaron las {horaFin}. No olvides <b>cerrar sesión</b> al terminar — así queda registrada tu hora de salida.
      </p>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={descartar}
          className="text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:bg-gray-50">
          Sigo trabajando
        </button>
        <button onClick={() => { descartar(); logout() }}
          disabled={cerrandoSesion}
          className="text-xs px-3 py-1 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-60 disabled:cursor-wait">
          {cerrandoSesion ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  )
}
