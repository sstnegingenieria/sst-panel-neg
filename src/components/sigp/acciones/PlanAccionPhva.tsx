// Plan de acción PHVA de una AC/AP (F2a). Cada actividad ES una tarea del módulo
// Tareas (contexto {tipo:'ac_ap', id, label: consecutivo}, fase P|H|V|A): acá se
// CREAN y se ven por fase; su gestión (iniciar, balón, cerrar, reasignar) vive en
// Tareas — la edición de fase/organización es de este plan, no de la UI de Tareas.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../../shared/Modal'
import SelectField from '../../shared/SelectField'
import TextField from '../../shared/TextField'
import { toast } from '../../shared/Toast'
import { fFechaAccion } from '../../../pages/acciones/AccionesMejora'
import {
  ESTADO_TAREA_COLOR, ESTADO_TAREA_LABEL, FASES_TAREA, FASE_TAREA_COLOR, FASE_TAREA_LABEL,
  motivoInvalidoTareaAcap, type FaseTarea, type TareaConId,
} from '../../../types/sigp/tarea'
import { timestampDeFechaInput, type EstadoAccion } from '../../../types/sigp/accionMejora'
import { diasDeVencida, esTareaVencida, type TareasPorFase } from '../../../utils/sigp/tareasUi'
import { crearTareaAcap, listarAsignables, type PersonaAsignable } from '../../../utils/sigp/tareas'

interface Props {
  accionId: string
  consecutivo: string | null
  estado: EstadoAccion
  /** Quien puede crear actividades (gestiona AC/AP). */
  puedeGestionar: boolean
  creador: { uid: string; nombre: string } | null
  porFase: TareasPorFase
  cargando: boolean
  error: boolean
}

interface FormActividad { titulo: string; responsable: string; fecha: string }
const FORM_VACIO: FormActividad = { titulo: '', responsable: '', fecha: '' }

export default function PlanAccionPhva({
  accionId, consecutivo, estado, puedeGestionar, creador, porFase, cargando, error,
}: Props) {
  const [fase, setFase] = useState<FaseTarea | null>(null)   // fase del modal abierto
  const [form, setForm] = useState<FormActividad>(FORM_VACIO)
  const [personas, setPersonas] = useState<PersonaAsignable[]>([])
  const [guardando, setGuardando] = useState(false)

  const abierta = estado === 'abierta'
  const puedeAgregar = abierta && puedeGestionar && !!consecutivo && !!creador

  // Las personas se cargan al abrir el modal por primera vez (mismo selector de Tareas).
  useEffect(() => {
    if (fase && personas.length === 0) {
      listarAsignables().then(setPersonas).catch(() => setPersonas([]))
    }
  }, [fase, personas.length])

  const cerrar = () => { setFase(null); setForm(FORM_VACIO) }

  const datosActividad = (f: FaseTarea) => {
    const p = personas.find(x => x.uid === form.responsable)
    const fechaLimite = timestampDeFechaInput(form.fecha)
    return {
      titulo: form.titulo,
      responsable: { uid: p?.uid ?? '', nombre: p?.nombre ?? '' },
      fechaLimite: fechaLimite!,
      acapId: accionId,
      consecutivo: consecutivo ?? '',
      fase: f,
    }
  }
  const motivoInvalido = fase && creador ? motivoInvalidoTareaAcap(datosActividad(fase), creador) : null

  const guardar = async () => {
    if (!fase || !creador || motivoInvalido) return
    setGuardando(true)
    try {
      const id = await crearTareaAcap(datosActividad(fase), creador)
      if (!id) { toast('No se pudo crear la actividad: revisa los datos', 'error'); return }
      toast('Actividad agregada al plan')
      cerrar()
    } catch {
      toast('No se pudo crear la actividad (verifica tu rol)', 'error')
    } finally {
      setGuardando(false)
    }
  }

  if (estado === 'borrador') {
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">3 · Plan de acción (PHVA)</h2>
        <p className="text-sm text-gray-500">
          El plan de acción se arma al <b>emitir</b> la acción: cada actividad queda como una tarea con responsable y fecha.
        </p>
      </section>
    )
  }

  const total = FASES_TAREA.reduce((n, f) => n + porFase[f].length, 0) + porFase.sinFase.length

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">3 · Plan de acción (PHVA)</h2>
        <span className="text-xs text-gray-500">{cargando ? 'Cargando…' : `${total} actividad${total === 1 ? '' : 'es'}`}</span>
      </div>

      {error && <p className="text-sm text-red-600">No se pudieron leer las actividades del plan.</p>}
      {estado === 'anulada' && (
        <p className="text-xs text-gray-500">La acción está anulada: el plan queda como consulta. Las actividades abiertas se gestionan desde Tareas.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {FASES_TAREA.map(f => (
          <div key={f} className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2" data-fase={f}>
            <div className="flex items-center justify-between">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${FASE_TAREA_COLOR[f]}`}>
                {f} · {FASE_TAREA_LABEL[f]}
              </span>
              {puedeAgregar && (
                <button type="button" onClick={() => setFase(f)}
                  className="text-xs font-medium text-brand-700 hover:underline">
                  ＋ Actividad
                </button>
              )}
            </div>
            {porFase[f].length === 0 ? (
              <p className="text-xs text-gray-400">Sin actividades en esta fase.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {porFase[f].map(t => <FilaActividad key={t.id} t={t} />)}
              </ul>
            )}
          </div>
        ))}
      </div>

      {porFase.sinFase.length > 0 && (
        <div className="border border-dashed border-gray-300 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">Tareas de esta acción sin fase PHVA</p>
          <ul className="flex flex-col gap-2">
            {porFase.sinFase.map(t => <FilaActividad key={t.id} t={t} />)}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Cada actividad es una tarea: su responsable la inicia, la cierra o pasa el balón desde{' '}
        <Link to="/tareas" className="underline">Tareas</Link>.
      </p>

      <Modal
        isOpen={fase !== null}
        title={fase ? `Nueva actividad · ${fase} · ${FASE_TAREA_LABEL[fase]}` : ''}
        onClose={cerrar}
        actions={[
          { label: 'Volver', variant: 'secondary', onClick: cerrar },
          { label: 'Agregar actividad', onClick: guardar, loading: guardando, disabled: !!motivoInvalido },
        ]}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Descripción de la actividad <span className="text-red-500">*</span></label>
            <textarea
              value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              rows={3}
              maxLength={300}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <SelectField
            label="Responsable"
            required
            value={form.responsable}
            onChange={v => setForm(f => ({ ...f, responsable: v }))}
            options={personas.map(p => ({ value: p.uid, label: p.nombre }))}
            placeholder={personas.length === 0 ? 'Cargando personas…' : 'Selecciona…'}
          />
          <TextField
            label="Fecha de ejecución"
            type="date"
            required
            value={form.fecha}
            onChange={v => setForm(f => ({ ...f, fecha: v }))}
            hint="Obligatoria: una actividad sin fecha nunca podría vencer."
          />
          {motivoInvalido && form.titulo + form.responsable + form.fecha !== '' && (
            <p className="text-xs text-amber-700">{motivoInvalido}</p>
          )}
        </div>
      </Modal>
    </section>
  )
}

function FilaActividad({ t }: { t: TareaConId }) {
  const vencida = esTareaVencida(t)
  return (
    <li className="text-sm border-l-2 border-gray-200 pl-3" data-actividad={t.id}>
      <p className="text-gray-900 break-words">{t.titulo}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ESTADO_TAREA_COLOR[t.estado] ?? 'bg-gray-100 text-gray-600'}`}>
          {ESTADO_TAREA_LABEL[t.estado] ?? t.estado}
        </span>
        <span className="text-xs text-gray-500">{t.asignada_a_nombre ?? '—'}</span>
        <span className={`text-xs ${vencida ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          {fFechaAccion(t.fecha_limite)}{vencida ? ` · vencida hace ${diasDeVencida(t)} d` : ''}
        </span>
      </div>
    </li>
  )
}
