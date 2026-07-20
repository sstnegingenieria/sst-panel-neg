// Evaluación del contratista (F2.1.d) — set corto de criterios ISO con
// puntaje 1–5 + comentario. Disponible desde que el proyecto está ejecutado.
// Extensible: los criterios viven en CRITERIOS_EVALUACION (GI podrá refinar).
import { useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import { fmtNum } from '../../../utils/sigp/formato'
import {
  CRITERIOS_EVALUACION, esPuntajeValido, promedioEvaluacion, ESTADOS_PROYECTO,
} from '../../../types/sigp/proyecto'
import type { Proyecto, CriterioEvaluacion } from '../../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

export default function EvaluacionContratistaCard({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const evalActual = proyecto.evaluacion_contratista
  const [puntajes, setPuntajes] = useState<Partial<Record<CriterioEvaluacion, number>>>({})
  const [comentario, setComentario] = useState('')
  const [aplicando, setAplicando] = useState(false)

  // Se evalúa una vez ejecutados los trabajos (con la experiencia completa).
  const desdeEjecutado = ESTADOS_PROYECTO.indexOf(proyecto.estado) >= ESTADOS_PROYECTO.indexOf('ejecutado')
  const visible = evalActual || (desdeEjecutado && proyecto.asignacion)
  const completa = CRITERIOS_EVALUACION.every(c => esPuntajeValido(puntajes[c.key]))

  const guardar = async () => {
    if (!completa) return
    setAplicando(true)
    try {
      const criterios = Object.fromEntries(CRITERIOS_EVALUACION.map(c => [c.key, puntajes[c.key]!])) as Record<CriterioEvaluacion, number>
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        evaluacion_contratista: {
          criterios,
          promedio: promedioEvaluacion(criterios),
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
          evaluado_por: user?.uid ?? '',
          fecha: ahora,
        },
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: proyecto.estado, a: proyecto.estado, por: user?.uid ?? '', fecha: ahora,
          motivo: `Contratista evaluado — promedio ${fmtNum(promedioEvaluacion(criterios))}/5`,
        }),
      })
      toast('Evaluación del contratista guardada')
      await reload()
    } catch { toast('Error al guardar la evaluación', 'error') } finally { setAplicando(false) }
  }

  if (!visible) {
    return (
      <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-400">Evaluación del contratista</p>
        <p className="text-xs text-gray-400 mt-1">Disponible cuando los trabajos estén ejecutados.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Evaluación del contratista</p>
        {evalActual && (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            {fmtNum(evalActual.promedio)}/5
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-400">{proyecto.asignacion?.contratista_nombre ?? '—'} · evidencia ISO de reevaluación de proveedores</p>

      {evalActual ? (
        <div className="space-y-1.5 text-sm">
          {CRITERIOS_EVALUACION.map(c => (
            <div key={c.key} className="flex justify-between">
              <span className="text-gray-500">{c.label}</span>
              <span className="font-mono text-gray-700">{'★'.repeat(evalActual.criterios[c.key] ?? 0)}<span className="text-gray-300">{'★'.repeat(5 - (evalActual.criterios[c.key] ?? 0))}</span> {evalActual.criterios[c.key]}/5</span>
            </div>
          ))}
          {evalActual.comentario && <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">{evalActual.comentario}</p>}
          <p className="text-[11px] text-gray-400">Evaluado el {fFecha(evalActual.fecha)}</p>
        </div>
      ) : puedeGestionar ? (
        <div className="space-y-2.5">
          {CRITERIOS_EVALUACION.map(c => (
            <div key={c.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">{c.label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setPuntajes(p => ({ ...p, [c.key]: n }))}
                    className={`w-8 h-8 rounded-lg text-sm font-semibold border transition-colors ${
                      puntajes[c.key] === n
                        ? 'bg-brand-700 border-brand-700 text-white'
                        : (puntajes[c.key] ?? 0) >= n
                          ? 'bg-brand-50 border-brand-200 text-brand-700'
                          : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={2}
            placeholder="Comentario (opcional) — hallazgos, recomendaciones"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
          <button onClick={guardar} disabled={!completa || aplicando}
            className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
            {aplicando ? 'Guardando…' : 'Guardar evaluación'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Pendiente de evaluación por el área de proyectos.</p>
      )}
    </div>
  )
}
