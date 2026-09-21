// Evaluación del contratista (F2.1.d) — set corto de criterios ISO con
// puntaje 1–5 + comentario. Disponible desde que el proyecto está ejecutado.
// Extensible: los criterios viven en CRITERIOS_EVALUACION (GI podrá refinar).
//
// 21-sep (3a, fuera de P2-3): en proyectos POR ASIGNACIÓN la evaluación baja
// al sub-doc — un bloque POR CONTRATISTA (directas fuera: NEG no es proveedor
// que se reevalúe a sí mismo). El resumen lleva evaluados/evaluables y el
// hito de cierre exige TODOS evaluados. El camino legacy (campo singular del
// padre) queda intacto para proyectos sin migrar.
import { useState, useEffect } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import { fmtNum } from '../../../utils/sigp/formato'
import {
  CRITERIOS_EVALUACION, esPuntajeValido, promedioEvaluacion, ESTADOS_PROYECTO,
} from '../../../types/sigp/proyecto'
import type { Proyecto, CriterioEvaluacion, EvaluacionContratista } from '../../../types/sigp/proyecto'
import { patchEvaluarContratista, tipoDe } from '../../../types/sigp/asignacion'
import type { AsignacionContratista } from '../../../types/sigp/asignacion'
import { cargarAsignaciones, escribirAsignacion } from '../../../utils/sigp/asignaciones'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

/** Estrellitas 1–5 de un criterio (compartidas por ambos modos). */
function SelectorPuntaje({ valor, onValor }: { valor?: number; onValor: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onValor(n)}
          className={`w-8 h-8 rounded-lg text-sm font-semibold border transition-colors ${
            valor === n
              ? 'bg-brand-700 border-brand-700 text-white'
              : (valor ?? 0) >= n
                ? 'bg-brand-50 border-brand-200 text-brand-700'
                : 'border-gray-200 text-gray-400 hover:bg-gray-50'
          }`}>
          {n}
        </button>
      ))}
    </div>
  )
}

function EvaluacionLectura({ ev }: { ev: EvaluacionContratista }) {
  return (
    <div className="space-y-1.5 text-sm">
      {CRITERIOS_EVALUACION.map(c => (
        <div key={c.key} className="flex justify-between">
          <span className="text-gray-500">{c.label}</span>
          <span className="font-mono text-gray-700">{'★'.repeat(ev.criterios[c.key] ?? 0)}<span className="text-gray-300">{'★'.repeat(5 - (ev.criterios[c.key] ?? 0))}</span> {ev.criterios[c.key]}/5</span>
        </div>
      ))}
      {ev.comentario && <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">{ev.comentario}</p>}
      <p className="text-[11px] text-gray-400">Evaluado el {fFecha(ev.fecha)}</p>
    </div>
  )
}

export default function EvaluacionContratistaCard({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const evalActual = proyecto.evaluacion_contratista
  const [puntajes, setPuntajes] = useState<Partial<Record<CriterioEvaluacion, number>>>({})
  const [comentario, setComentario] = useState('')
  const [aplicando, setAplicando] = useState(false)

  // ── Modo POR ASIGNACIÓN (21-sep): carga los sub-docs y evalúa cada uno ──
  const esMulti = !!proyecto.resumen_asignaciones
  const [asigs, setAsigs] = useState<AsignacionContratista[]>([])
  const [pjA, setPjA] = useState<Record<string, Partial<Record<CriterioEvaluacion, number>>>>({})
  const [comA, setComA] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!esMulti || !proyecto.id) return
    cargarAsignaciones(proyecto.id).then(setAsigs).catch(() => setAsigs([]))
  }, [esMulti, proyecto.id, proyecto.fecha_actualizacion])

  // Se evalúa una vez ejecutados los trabajos (con la experiencia completa).
  const desdeEjecutado = ESTADOS_PROYECTO.indexOf(proyecto.estado) >= ESTADOS_PROYECTO.indexOf('ejecutado')

  const guardarAsignacion = async (a: AsignacionContratista) => {
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      const r = patchEvaluarContratista(a, pjA[a.id] ?? {}, comA[a.id], user?.uid ?? '', ahora)
      if (!r) { toast('Faltan puntajes, o la asignación no es evaluable', 'error'); return }
      const trasPatch = asigs.map(x => x.id === a.id
        ? { ...x, ...r.sub, historial: [...x.historial, r.entradaHistorial] } as AsignacionContratista : x)
      // Sub + resumen en el MISMO batch: los contadores evaluados/evaluables
      // que consume el hito de cierre quedan al día al instante.
      await escribirAsignacion(proyecto.id, proyecto.snapshot.alcance ?? [], a.id,
        { ...r.sub, historial: arrayUnion(r.entradaHistorial) }, trasPatch)
      toast(`${a.contratista_nombre} evaluado — promedio ${fmtNum(r.evaluacion.promedio)}/5`)
      setAsigs(trasPatch)
      await reload()
    } catch { toast('Error al guardar la evaluación', 'error') } finally { setAplicando(false) }
  }

  if (esMulti) {
    // Evaluables: no canceladas de tipo contratista (directas fuera).
    const evaluables = asigs.filter(a => a.estado !== 'cancelada' && tipoDe(a) !== 'administracion_directa')
    const evaluadas = evaluables.filter(a => !!a.evaluacion_contratista)
    if (evaluables.length === 0 && !desdeEjecutado) return null
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Evaluación de contratistas</p>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            evaluables.length > 0 && evaluadas.length >= evaluables.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {evaluadas.length}/{evaluables.length}
          </span>
        </div>
        <p className="text-[11px] text-gray-400">
          Un bloque por contratista · evidencia ISO de reevaluación de proveedores
          (las administraciones directas no se evalúan — NEG no es proveedor de sí misma).
          El cierre marca el hito solo con TODOS evaluados.
        </p>
        {!desdeEjecutado ? (
          <p className="text-xs text-gray-400">Disponible cuando los trabajos estén ejecutados.</p>
        ) : evaluables.length === 0 ? (
          <p className="text-xs text-gray-400">Sin contratistas evaluables (solo administración directa o canceladas).</p>
        ) : (
          <div className="space-y-4">
            {evaluables.map(a => (
              <div key={a.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-700">{a.contratista_nombre}</p>
                  {a.evaluacion_contratista && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                      {fmtNum(a.evaluacion_contratista.promedio)}/5
                    </span>
                  )}
                </div>
                {a.evaluacion_contratista ? (
                  <EvaluacionLectura ev={a.evaluacion_contratista} />
                ) : puedeGestionar ? (
                  <div className="space-y-2.5">
                    {CRITERIOS_EVALUACION.map(c => (
                      <div key={c.key} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-600">{c.label}</span>
                        <SelectorPuntaje valor={pjA[a.id]?.[c.key]}
                          onValor={n => setPjA(s => ({ ...s, [a.id]: { ...s[a.id], [c.key]: n } }))} />
                      </div>
                    ))}
                    <textarea value={comA[a.id] ?? ''} onChange={e => setComA(s => ({ ...s, [a.id]: e.target.value }))} rows={2}
                      placeholder="Comentario (opcional) — hallazgos, recomendaciones"
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    <button onClick={() => guardarAsignacion(a)}
                      disabled={aplicando || !CRITERIOS_EVALUACION.every(c => esPuntajeValido(pjA[a.id]?.[c.key]))}
                      className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
                      {aplicando ? 'Guardando…' : `Guardar evaluación de ${a.contratista_nombre}`}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Pendiente de evaluación por el área de proyectos.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Modo LEGACY (campo singular del padre) — intacto ──
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
        <EvaluacionLectura ev={evalActual} />
      ) : puedeGestionar ? (
        <div className="space-y-2.5">
          {CRITERIOS_EVALUACION.map(c => (
            <div key={c.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">{c.label}</span>
              <SelectorPuntaje valor={puntajes[c.key]}
                onValor={n => setPuntajes(p => ({ ...p, [c.key]: n }))} />
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
