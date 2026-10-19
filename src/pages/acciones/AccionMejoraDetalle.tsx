// Acciones de Mejora / NC — Fase 1: detalle con el ENCABEZADO OFICIAL del SGI.
// Edición solo en borrador; la baja es SOLO por anulación (sin borrado físico).
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAccionesMejora } from '../../hooks/useAccionesMejora'
import { useTareasDeContexto } from '../../hooks/sigp/useTareasDeContexto'
import { puedeGestionarAcapUI } from '../../types/sigp/permisos'
import {
  CLAVES_PORQUE, ESTADO_ACCION_COLOR, PREFIJO_POR_TIPO, ESTADO_ACCION_LABEL, FUENTE_ACCION_LABEL,
  TIPO_ACCION_COLOR, TIPO_ACCION_LABEL, actividadesAbiertas, faltantesParaEmitir, formDeAccion, porquesDiligenciados,
  puedeAnularAccion, puedeEditarAccion, puedeEmitirAccion,
  type AccionFormData, type AccionMejoraConId,
} from '../../types/sigp/accionMejora'
import { ACCION_MEJORA } from '../../utils/sigp/isoControl'
import EncabezadoIso from '../../components/sigp/shared/EncabezadoIso'
import AccionMejoraFormModal from '../../components/sigp/acciones/AccionMejoraFormModal'
import PlanAccionPhva from '../../components/sigp/acciones/PlanAccionPhva'
import Modal from '../../components/shared/Modal'
import { toast } from '../../components/shared/Toast'
import { fFechaAccion } from './AccionesMejora'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">{children}</div>
    </div>
  )
}

export default function AccionMejoraDetalle() {
  const { accionId } = useParams<{ accionId: string }>()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarAcapUI(user?.rol)
  const { cargarUna, editar, anular, emitir } = useAccionesMejora()

  const [accion, setAccion] = useState<AccionMejoraConId | null>(null)
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [emitiendo, setEmitiendo] = useState(false)

  const load = useCallback(async () => {
    if (!accionId) return
    setLoading(true)
    try {
      setAccion(await cargarUna(accionId))
    } catch {
      toast('Error al cargar la acción', 'error')
    } finally {
      setLoading(false)
    }
  }, [accionId, cargarUna])
  useEffect(() => { load() }, [load])

  // Plan PHVA: las actividades son tareas del contexto {ac_ap, id}. En borrador no
  // existe plan (se arma al emitir), así que no se suscribe.
  const { porFase, tareas, loading: tareasLoading, error: tareasError } = useTareasDeContexto(
    'ac_ap', accion && accion.estado !== 'borrador' ? accion.id : undefined,
  )
  const abiertas = actividadesAbiertas(tareas)
  const faltantes = accion ? faltantesParaEmitir(accion) : []

  const handleEmitir = async () => {
    if (!user || !accion) return
    setGuardando(true)
    try {
      const r = await emitir(accion, { uid: user.uid, nombre: user.nombre })
      if (!r.ok) { toast(r.faltantes[0] ?? 'No se puede emitir', 'error'); return }
      toast(`${r.consecutivo} emitida`)
      setEmitiendo(false)
      await load()
    } catch {
      // El consecutivo (si ya se pidió a la CF) queda guardado: reintentar NO quema otro.
      toast('No se pudo emitir — el consecutivo se conserva para reintentar', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const handleEditar = async (form: AccionFormData) => {
    if (!user || !accion) return
    setGuardando(true)
    try {
      const ok = await editar(accion, form, { uid: user.uid, nombre: user.nombre })
      if (!ok) { toast('No se pudo editar: solo un borrador es editable y los campos obligatorios deben estar completos', 'error'); return }
      toast('Acción actualizada')
      setEditando(false)
      await load()
    } catch {
      toast('No se pudo guardar (verifica tu rol)', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const handleAnular = async () => {
    if (!user || !accion) return
    setGuardando(true)
    try {
      const ok = await anular(accion, motivo, { uid: user.uid, nombre: user.nombre })
      if (!ok) { toast('Indica el motivo de la anulación', 'error'); return }
      toast('Acción anulada')
      setAnulando(false)
      setMotivo('')
      await load()
    } catch {
      toast('No se pudo anular (verifica tu rol)', 'error')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Cargando…</p>
  if (!accion) {
    return (
      <div className="flex flex-col gap-3">
        <Link to="/acciones-mejora" className="text-sm text-brand-700 hover:underline">← Acciones de mejora</Link>
        <p className="text-sm text-gray-500">No se encontró la acción.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <Link to="/acciones-mejora" className="text-sm text-brand-700 hover:underline">← Acciones de mejora</Link>

      <EncabezadoIso control={ACCION_MEJORA} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${TIPO_ACCION_COLOR[accion.tipo] ?? ''}`}>
            {TIPO_ACCION_LABEL[accion.tipo] ?? accion.tipo}
          </span>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_ACCION_COLOR[accion.estado] ?? ''}`}>
            {ESTADO_ACCION_LABEL[accion.estado] ?? accion.estado}
          </span>
          <span className="font-mono text-sm text-gray-600">
            {accion.consecutivo ?? 'Sin consecutivo — se asigna al emitir'}
          </span>
        </div>
        {puedeGestionar && (
          <div className="flex gap-2">
            {puedeEditarAccion(accion.estado) && (
              <button type="button" onClick={() => setEditando(true)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium">
                ✎ Editar
              </button>
            )}
            {puedeEmitirAccion(accion.estado) && (
              <button type="button" onClick={() => setEmitiendo(true)} disabled={faltantes.length > 0}
                title={faltantes.length > 0 ? faltantes.join(' · ') : 'Asigna el consecutivo y abre la acción'}
                className="px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                Emitir
              </button>
            )}
            {puedeAnularAccion(accion.estado) && (
              <button type="button" onClick={() => setAnulando(true)}
                className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50 text-sm font-medium">
                Anular
              </button>
            )}
          </div>
        )}
      </div>

      {accion.estado === 'anulada' && accion.anulacion && (
        <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 text-sm">
          <p className="font-semibold text-gray-700">Acción anulada · {fFechaAccion(accion.anulacion.fecha)}</p>
          <p className="text-gray-600 mt-1 whitespace-pre-wrap">{accion.anulacion.motivo}</p>
          <p className="text-xs text-gray-400 mt-1">Por {accion.anulacion.por_nombre ?? accion.anulacion.por}</p>
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">1 · Descripción general</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Fecha de tratamiento">{fFechaAccion(accion.fecha_tratamiento)}</Campo>
          <Campo label="Fuente">{FUENTE_ACCION_LABEL[accion.fuente] ?? accion.fuente}</Campo>
          <Campo label="Cliente / proceso">{accion.cliente_proceso || '—'}</Campo>
          <Campo label="Líder del proceso">{accion.lider_proceso || '—'}</Campo>
        </div>
        <Campo label="Numeral de la norma">
          {accion.numeral_norma?.length ? accion.numeral_norma.join(' · ') : '—'}
        </Campo>
        <Campo label="Descripción de la no conformidad">{accion.descripcion_nc}</Campo>
        <Campo label="Observaciones">{accion.observaciones || '—'}</Campo>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">2 · Causa raíz — 5 por qués</h2>
          <span className="text-xs text-gray-500">{porquesDiligenciados(accion.causa_raiz)} de 5 diligenciados</span>
        </div>
        {CLAVES_PORQUE.map((k, i) => (
          <Campo key={k} label={`¿Por qué? ${i + 1}`}>{accion.causa_raiz?.[k] || <span className="text-gray-400">Pendiente</span>}</Campo>
        ))}
      </section>

      {puedeEmitirAccion(accion.estado) && puedeGestionar && faltantes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">Para emitir falta:</p>
          <ul className="list-disc pl-5">
            {faltantes.map(f => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      <PlanAccionPhva
        accionId={accion.id}
        consecutivo={accion.consecutivo}
        estado={accion.estado}
        puedeGestionar={puedeGestionar}
        creador={user ? { uid: user.uid, nombre: user.nombre } : null}
        porFase={porFase}
        cargando={tareasLoading}
        error={tareasError}
      />

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Historial</h2>
        <ul className="flex flex-col gap-2">
          {[...(accion.historial ?? [])].reverse().map((h, i) => (
            <li key={i} className="text-sm border-l-2 border-gray-200 pl-3">
              <p className="text-gray-900">{h.nota ?? (h.a ? ESTADO_ACCION_LABEL[h.a] : 'Movimiento')}</p>
              <p className="text-xs text-gray-400">{fFechaAccion(h.fecha)} · {h.por_nombre ?? h.por}</p>
            </li>
          ))}
        </ul>
      </section>

      <AccionMejoraFormModal
        isOpen={editando}
        titulo="Editar acción (borrador)"
        inicial={formDeAccion(accion)}
        guardando={guardando}
        onClose={() => setEditando(false)}
        onSubmit={handleEditar}
      />

      <Modal
        isOpen={emitiendo}
        title="Emitir acción"
        onClose={() => setEmitiendo(false)}
        actions={[
          { label: 'Volver', variant: 'secondary', onClick: () => setEmitiendo(false) },
          { label: 'Emitir y asignar consecutivo', onClick: handleEmitir, loading: guardando },
        ]}
      >
        <p className="text-sm text-gray-600">
          Al emitir se asigna el consecutivo <b>{PREFIJO_POR_TIPO[accion.tipo]}-AAAA-NNN</b> y
          la acción pasa a <b>abierta</b>: ya no se edita y se arma su plan de acción PHVA. El consecutivo no se puede cambiar después.
        </p>
      </Modal>

      <Modal
        isOpen={anulando}
        title="Anular acción"
        onClose={() => setAnulando(false)}
        actions={[
          { label: 'Volver', variant: 'secondary', onClick: () => setAnulando(false) },
          { label: 'Anular acción', variant: 'danger', onClick: handleAnular, loading: guardando, disabled: !motivo.trim() },
        ]}
      >
        <p className="text-sm text-gray-600 mb-3">
          La anulación es la baja: queda registrada con su motivo y la acción permanece como evidencia. No se puede deshacer.
        </p>
        {abiertas.length > 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            {abiertas.length} actividad{abiertas.length === 1 ? '' : 'es'} abierta{abiertas.length === 1 ? '' : 's'};
            {' '}{abiertas.length === 1 ? 'gestiónala' : 'gestiónalas'} desde Tareas. Anular la acción no {abiertas.length === 1 ? 'la cancela' : 'las cancela'}.
          </p>
        )}
        <label className="text-sm font-medium text-gray-700">Motivo de la anulación <span className="text-red-500">*</span></label>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          rows={3}
          maxLength={2000}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
      </Modal>
    </div>
  )
}
