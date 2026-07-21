// Encuesta de satisfacción del cliente (Panel SIGP · indicador ISO 4).
// Registro simple al cierre: puntaje 1–5 + fecha + nota. Meta: ≥4 en ≥90 %.
import { useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import { ESTADOS_PROYECTO, esPuntajeValido } from '../../../types/sigp/proyecto'
import type { Proyecto } from '../../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

export default function SatisfaccionClienteCard({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const ev = proyecto.evaluacion_cliente
  const [puntaje, setPuntaje] = useState(0)
  const [nota, setNota] = useState('')
  const [aplicando, setAplicando] = useState(false)

  // Se encuesta al cliente desde la entrega en adelante.
  const desdeEntrega = ESTADOS_PROYECTO.indexOf(proyecto.estado) >= ESTADOS_PROYECTO.indexOf('entregado_cliente')
  if (!ev && !desdeEntrega) return null

  const guardar = async () => {
    if (!esPuntajeValido(puntaje)) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        evaluacion_cliente: {
          satisfaccion: puntaje, fecha: ahora, por: user?.uid ?? '',
          ...(nota.trim() ? { nota: nota.trim() } : {}),
        },
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: proyecto.estado, a: proyecto.estado, por: user?.uid ?? '', fecha: ahora,
          motivo: `Encuesta de satisfacción del cliente registrada — ${puntaje}/5`,
        }),
      })
      toast('Encuesta de satisfacción guardada')
      await reload()
    } catch { toast('Error al guardar la encuesta', 'error') } finally { setAplicando(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Satisfacción del cliente</p>
        {ev && (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            {ev.satisfaccion}/5
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-400">Encuesta simple al cierre · indicador ISO (meta: ≥4 en ≥90 % de los proyectos)</p>

      {ev ? (
        <div className="text-sm space-y-1">
          <p className="font-mono text-gray-700">
            {'★'.repeat(ev.satisfaccion)}<span className="text-gray-300">{'★'.repeat(5 - ev.satisfaccion)}</span> {ev.satisfaccion}/5
          </p>
          {ev.nota && <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">{ev.nota}</p>}
          <p className="text-[11px] text-gray-400">Registrada el {fFecha(ev.fecha)}</p>
        </div>
      ) : puedeGestionar ? (
        <div className="space-y-2.5">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setPuntaje(n)}
                className={`w-8 h-8 rounded-lg text-sm font-semibold border transition-colors ${
                  puntaje === n ? 'bg-brand-700 border-brand-700 text-white'
                  : puntaje >= n ? 'bg-brand-50 border-brand-200 text-brand-700'
                  : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                }`}>
                {n}
              </button>
            ))}
          </div>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
            placeholder="Comentario del cliente (opcional)"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
          <button onClick={guardar} disabled={!esPuntajeValido(puntaje) || aplicando}
            className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
            {aplicando ? 'Guardando…' : 'Guardar encuesta'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Pendiente de registro por el área de proyectos.</p>
      )}
    </div>
  )
}
