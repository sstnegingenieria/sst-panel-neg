// Config inline de horario (doc configuracion/horario) — tarjeta plegable
// dentro de la pestaña Registros. Edita GG/admin (editaMetaIndicadoresUI,
// misma regla genérica de `configuracion` que la meta de margen); los demás
// roles ven los valores en texto plano. Si el getDoc falla (sin permiso de
// lectura, offline, doc con reglas más estrictas) la tarjeta se oculta
// silenciosamente — no es información crítica para operar la bandeja.
import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import { editaMetaIndicadoresUI } from '../../../types/sigp/permisos'
import { esHoraValida } from '../../../types/sigp/horario'
import type { ConfigHorario } from '../../../types/sigp/horario'

export default function ConfigHorarioCard() {
  const { user } = useAuth()
  const puedeEditar = editaMetaIndicadoresUI(user?.rol)

  const [cargando, setCargando] = useState(true)
  const [visible, setVisible] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [ipsTexto, setIpsTexto] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let activo = true
    getDoc(doc(db, 'configuracion', 'horario'))
      .then(snap => {
        if (!activo) return
        const data = snap.exists() ? (snap.data() as ConfigHorario) : {}
        setIpsTexto((data.ips_oficina ?? []).join('\n'))
        setHoraFin(data.hora_fin_jornada ?? '')
        setVisible(true)
      })
      .catch(() => { if (activo) setVisible(false) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [])

  if (cargando || !visible) return null

  const horaInvalida = horaFin.trim() !== '' && !esHoraValida(horaFin)

  const guardar = async () => {
    if (horaInvalida) return
    setGuardando(true)
    try {
      const ips = ipsTexto.split('\n').map(s => s.trim()).filter(Boolean)
      await setDoc(doc(db, 'configuracion', 'horario'), {
        ips_oficina: ips,
        ...(horaFin.trim() ? { hora_fin_jornada: horaFin.trim() } : {}),
        actualizado_por: user?.uid ?? '',
        fecha_actualizacion: Timestamp.now(),
      }, { merge: true })
      toast('Configuración guardada')
    } catch {
      toast('Error al guardar la configuración', 'error')
    } finally { setGuardando(false) }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <button onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700">
        <span>⚙ Configuración</span>
        <span className="text-gray-400 text-xs">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
          {puedeEditar ? (
            <>
              <label className="block text-xs text-gray-500">
                IPs/CIDRs de oficina (una por línea)
                <textarea value={ipsTexto} onChange={e => setIpsTexto(e.target.value)} rows={4}
                  placeholder={'Ej: 190.85.12.4\n192.168.1.0/24'}
                  className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </label>
              <label className="block text-xs text-gray-500 max-w-xs">
                Hora fin de jornada (HH:mm)
                <input value={horaFin} onChange={e => setHoraFin(e.target.value)} placeholder="17:30"
                  className={`mt-1 w-full text-sm px-3 py-2 border rounded-lg font-mono focus:outline-none focus:ring-2 ${
                    horaInvalida ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-brand-300'}`} />
                {horaInvalida && <span className="block text-red-600 mt-1">Formato inválido — usa HH:mm (ej: 17:30)</span>}
              </label>
              <div className="flex justify-end">
                <button onClick={guardar} disabled={guardando || horaInvalida}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="text-gray-500">IPs de oficina:</span> {ipsTexto ? ipsTexto.split('\n').join(', ') : '—'}</p>
              <p><span className="text-gray-500">Hora fin de jornada:</span> {horaFin || '—'}</p>
            </div>
          )}
          <p className="text-[11px] text-gray-400 pt-1">
            en_oficina se marca al comparar la IP del evento contra esta lista · el recordatorio de cierre usa la hora fin
          </p>
        </div>
      )}
    </div>
  )
}
