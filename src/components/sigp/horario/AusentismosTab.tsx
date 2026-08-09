// Pestaña "Ausentismos" de Horario y asistencia — gestión con soporte
// obligatorio y detalle médico confidencial en sub-doc privado/detalle.
// Solo gestiona (registrar/anular/ver detalle) puedeGestionarHorarioUI
// (gerencia_administrativa + admin); los demás roles ven la tabla en lectura.
import { useCallback, useEffect, useState } from 'react'
import { Timestamp, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { puedeGestionarHorarioUI } from '../../../types/sigp/permisos'
import { TIPO_AUSENTISMO_COLOR, TIPO_AUSENTISMO_LABEL } from '../../../types/sigp/horario'
import type { Ausentismo, AusentismoDetallePrivado } from '../../../types/sigp/horario'
import AusentismoFormModal from './AusentismoFormModal'

const fFecha = (t?: Timestamp) =>
  t?.toDate?.().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function AusentismosTab() {
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarHorarioUI(user?.rol)

  const [ausentismos, setAusentismos] = useState<Ausentismo[]>([])
  const [loading, setLoading] = useState(true)
  const [crearOpen, setCrearOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'ausentismos'))
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Ausentismo)
        .sort((a, b) => (b.fecha_inicio?.toMillis?.() ?? 0) - (a.fecha_inicio?.toMillis?.() ?? 0))
      setAusentismos(items)
    } catch {
      toast('Error al cargar los ausentismos', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Anular ────────────────────────────────────────────────────────────
  const [anularTarget, setAnularTarget] = useState<Ausentismo | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [anulando, setAnulando] = useState(false)

  const abrirAnular = (a: Ausentismo) => { setAnularTarget(a); setMotivoAnulacion('') }

  const anular = async () => {
    if (!anularTarget || !motivoAnulacion.trim()) return
    setAnulando(true)
    try {
      await updateDoc(doc(db, 'ausentismos', anularTarget.id), {
        estado: 'anulado',
        motivo_anulacion: motivoAnulacion.trim(),
        fecha_actualizacion: Timestamp.now(),
      })
      toast('Ausentismo anulado')
      setAnularTarget(null)
      await load()
    } catch {
      toast('Error al anular el ausentismo', 'error')
    } finally { setAnulando(false) }
  }

  // ── Detalle médico (confidencial) ────────────────────────────────────
  const [detalleTarget, setDetalleTarget] = useState<Ausentismo | null>(null)
  const [detalle, setDetalle] = useState<AusentismoDetallePrivado | null | undefined>(undefined)

  const abrirDetalle = async (a: Ausentismo) => {
    setDetalleTarget(a)
    setDetalle(undefined)
    try {
      const snap = await getDoc(doc(db, 'ausentismos', a.id, 'privado', 'detalle'))
      setDetalle(snap.exists() ? (snap.data() as AusentismoDetallePrivado) : null)
    } catch {
      setDetalle(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {puedeGestionar && (
          <button onClick={() => setCrearOpen(true)}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            + Registrar ausentismo
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-3 px-4 font-semibold">Empleado</th>
              <th className="py-3 px-4 font-semibold">Tipo</th>
              <th className="py-3 px-4 font-semibold">Desde</th>
              <th className="py-3 px-4 font-semibold">Hasta</th>
              <th className="py-3 px-4 font-semibold">Descripción</th>
              <th className="py-3 px-4 font-semibold">Soporte</th>
              <th className="py-3 px-4 font-semibold">Estado</th>
              {puedeGestionar && <th className="py-3 px-4 font-semibold text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={puedeGestionar ? 8 : 7} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && ausentismos.length === 0 && (
              <tr><td colSpan={puedeGestionar ? 8 : 7} className="py-12 text-center text-gray-400">No hay ausentismos registrados.</td></tr>
            )}
            {!loading && ausentismos.map(a => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 font-medium text-gray-800">{a.empleado_nombre}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_AUSENTISMO_COLOR[a.tipo]}`}>
                    {TIPO_AUSENTISMO_LABEL[a.tipo]}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-700">{fFecha(a.fecha_inicio)}</td>
                <td className="py-3 px-4 text-gray-700">{fFecha(a.fecha_fin)}</td>
                <td className="py-3 px-4 text-gray-600">
                  <span className="block max-w-[220px] truncate" title={a.descripcion || undefined}>
                    {a.descripcion || '—'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {a.soporte_url ? (
                    <a href={a.soporte_url} target="_blank" rel="noreferrer"
                      className="text-brand-700 underline underline-offset-2 text-xs font-medium">📎 ver</a>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="py-3 px-4">
                  {a.estado === 'activo' ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Activo</span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 line-through"
                      title={a.motivo_anulacion ?? 'Sin motivo registrado'}>
                      Anulado
                    </span>
                  )}
                </td>
                {puedeGestionar && (
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => abrirDetalle(a)} title="Ver detalle médico"
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">
                        🔒 Detalle
                      </button>
                      {a.estado === 'activo' && (
                        <button onClick={() => abrirAnular(a)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium border border-red-300 text-red-700 hover:bg-red-50">
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AusentismoFormModal
        isOpen={crearOpen}
        onClose={() => setCrearOpen(false)}
        onSaved={load}
        puedeGestionar={puedeGestionar}
        userUid={user?.uid}
      />

      <Modal
        isOpen={anularTarget !== null}
        title={`Anular ausentismo — ${anularTarget?.empleado_nombre ?? ''}`}
        onClose={() => setAnularTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setAnularTarget(null), variant: 'secondary' },
          { label: anulando ? 'Anulando…' : 'Anular', onClick: anular, variant: 'danger', loading: anulando, disabled: !motivoAnulacion.trim() },
        ]}
      >
        <label className="block text-xs text-gray-500">
          Motivo de anulación <span className="text-red-500">*</span>
          <textarea value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} rows={3}
            placeholder="Ej: se registró por error, duplicado con otro ausentismo…"
            className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </label>
      </Modal>

      <Modal
        isOpen={detalleTarget !== null}
        title="Detalle médico (confidencial)"
        onClose={() => setDetalleTarget(null)}
        actions={[{ label: 'Cerrar', onClick: () => setDetalleTarget(null), variant: 'secondary' }]}
      >
        {detalle === undefined ? (
          <p className="text-sm text-gray-400 text-center py-6">Cargando…</p>
        ) : !detalle || (!detalle.diagnostico && !detalle.observaciones_medicas) ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin detalle registrado.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {detalle.diagnostico && (
              <div>
                <p className="text-xs text-gray-500 font-medium">Diagnóstico</p>
                <p className="text-gray-800 whitespace-pre-wrap">{detalle.diagnostico}</p>
              </div>
            )}
            {detalle.observaciones_medicas && (
              <div>
                <p className="text-xs text-gray-500 font-medium">Observaciones</p>
                <p className="text-gray-800 whitespace-pre-wrap">{detalle.observaciones_medicas}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
