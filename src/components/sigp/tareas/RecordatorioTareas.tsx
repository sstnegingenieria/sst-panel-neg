// Módulo Tareas (SB2, 14-ago-2026) — pop-up "tienes tareas pendientes".
// Calco ESTRUCTURAL de RecordatorioCierreSesion: tarjeta flotante fixed
// bottom-right, SIN overlay, una vez por día por uid (localStorage). Borde
// de MARCA (verde), no ámbar — no es una alerta, es un recordatorio.
//
// Reusa useTareasPendientes (mismo hook del Sidebar) — CERO consultas nuevas.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { useFeatureFlag } from '../../../hooks/useFeatureFlag'
import { useTareasPendientes } from '../../../hooks/sigp/useTareasPendientes'
import { veTareasUI } from '../../../types/sigp/permisos'
import { claveDia } from '../../../types/sigp/horario'
import { tareasActivasOrdenadas } from '../../../utils/sigp/tareasUi'

const CLAVE_LS = (uid: string, dia: string) => `sigp.tareas.recordatorio.${uid}.${dia}`

export default function RecordatorioTareas() {
  const { user } = useAuth()
  const tareasEnabled = useFeatureFlag('sigp_tareas_enabled', false)
  const navigate = useNavigate()
  const activo = tareasEnabled && veTareasUI(user?.rol)
  const { misTareas, tareasAsignadas, balones } = useTareasPendientes(activo, user?.uid)

  const [visible, setVisible] = useState(false)
  const [decidido, setDecidido] = useState(false)

  // Espera a que el hook entregue el primer snapshot real antes de decidir
  // (evita el parpadeo de mostrar/ocultar con el estado inicial en 0).
  useEffect(() => {
    if (!activo || !user || decidido) return
    const clave = CLAVE_LS(user.uid, claveDia(new Date()))
    if (localStorage.getItem(clave)) { setDecidido(true); return }
    if (misTareas > 0 || balones > 0) {
      setVisible(true)
      setDecidido(true)
    }
  }, [activo, user, misTareas, balones, decidido])

  if (!visible || !user) return null

  const marcarVisto = () => {
    localStorage.setItem(CLAVE_LS(user.uid, claveDia(new Date())), '1')
    setVisible(false)
  }

  const proxima = tareasActivasOrdenadas(
    tareasAsignadas.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso'),
  )[0]

  const partes: string[] = []
  if (misTareas > 0) partes.push(`${misTareas} tarea${misTareas === 1 ? '' : 's'} pendiente${misTareas === 1 ? '' : 's'}`)
  if (balones > 0) partes.push(`${balones} balón${balones === 1 ? '' : 'es'} en tu cancha`)

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-sm bg-white border border-brand-300 rounded-xl shadow-lg p-4"
      role="alert">
      <p className="text-sm font-semibold text-gray-800">✓ Tareas</p>
      <p className="text-xs text-gray-600 mt-1">
        Tienes {partes.join(' y ')}.
        {proxima?.titulo && <> Próxima: <b>{proxima.titulo}</b>.</>}
      </p>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={marcarVisto}
          className="text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:bg-gray-50">
          Luego
        </button>
        <button onClick={() => {
          marcarVisto()
          // Micro-fix (14-ago): con SOLO balones (sin tareas propias abiertas)
          // aterrizar en "Balón en mi cancha" — no en una "Mis tareas" vacía.
          navigate(balones > 0 && misTareas === 0 ? '/tareas?balon=1' : '/tareas?pendientes=1')
        }}
          className="text-xs px-3 py-1 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white">
          Ver tareas
        </button>
      </div>
    </div>
  )
}
