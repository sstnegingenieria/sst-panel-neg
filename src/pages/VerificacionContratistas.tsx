// Verificación de contratistas — Gate SST (Administrativa · Bloque 3a).
//
// Antes de liquidar (pagar el saldo al contratista), SST confirma que el
// contratista está "al día en formatos" de esa obra. El criterio es MANUAL
// de SST (no se cablea). Cola: proyectos ejecutados en el tramo
// administrativo previo a la liquidación (facturado / pagado_cliente).
//
// CONFIDENCIALIDAD: esta vista lee SOLO la proyección `verificaciones_sst`
// (identidad + estado, sin NADA financiero) — SST no tiene acceso a
// `proyectos`. La proyección la mantiene la Cloud Function
// sincronizarVerificacionSst; el gate lo escribe SST aquí (fuente de verdad).
//
// Roles: sst y residente_sst OPERAN; admin ve (infra). El gate es NO
// esquivable: sin 'al_dia' las reglas impiden liquidar (Bloque 3b).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../components/shared/Toast'
import Modal from '../components/shared/Modal'
import {
  ESTADO_PRY_LABEL, ESTADO_PRY_COLOR, enColaVerificacionSst,
  estadoSstGate, SST_GATE_LABEL, SST_GATE_COLOR,
} from '../types/sigp/proyecto'
import { puedeMarcarSstGateUI } from '../types/sigp/permisos'
import type { EstadoSstGate } from '../types/sigp/proyecto'
import type { VerificacionSst } from '../types/sigp/verificacionSst'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function VerificacionContratistas() {
  const { user } = useAuth()
  const puedeMarcar = puedeMarcarSstGateUI(user?.rol)
  const [verificaciones, setVerificaciones] = useState<VerificacionSst[]>([])
  const [loading, setLoading] = useState(true)
  const [aplicando, setAplicando] = useState(false)
  // novedad (observación obligatoria)
  const [novedadTarget, setNovedadTarget] = useState<VerificacionSst | null>(null)
  const [observacion, setObservacion] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'verificaciones_sst'))
      const todas = snap.docs.map(d => ({ proyecto_id: d.id, ...d.data() }) as VerificacionSst)
      setVerificaciones(todas.filter(v => enColaVerificacionSst(v.estado)))
    } catch {
      toast('Error al cargar la cola de verificación', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Pendientes primero, luego con novedad, al día al final
  const orden: Record<string, number> = { pendiente: 0, con_novedad: 1, al_dia: 2 }
  const ordenadas = useMemo(
    () => [...verificaciones].sort((a, b) => orden[estadoSstGate(a)] - orden[estadoSstGate(b)]),
    [verificaciones],  // eslint-disable-line react-hooks/exhaustive-deps
  )
  const pendientes = verificaciones.filter(v => estadoSstGate(v) !== 'al_dia').length

  const marcar = async (v: VerificacionSst, estado: EstadoSstGate, obs?: string) => {
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'verificaciones_sst', v.proyecto_id), {
        sst_gate: {
          estado,
          verificado_por: user?.uid ?? '',
          fecha: ahora,
          ...(obs?.trim() ? { observacion: obs.trim() } : {}),
        },
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: estadoSstGate(v), a: estado, por: user?.uid ?? '', fecha: ahora,
          motivo: estado === 'al_dia'
            ? `Gate SST: contratista AL DÍA en formatos — habilita la liquidación (verificado por SST)`
            : `Gate SST: CON NOVEDAD — ${obs?.trim() ?? ''} (la liquidación queda bloqueada)`,
        }),
      })
      toast(estado === 'al_dia' ? 'Contratista al día — liquidación habilitada' : 'Novedad registrada — liquidación bloqueada')
      setNovedadTarget(null)
      setObservacion('')
      await load()
    } catch {
      toast('Error al registrar la verificación (verifica tu rol)', 'error')
    } finally { setAplicando(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Verificación de contratistas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gate SST previo a la liquidación: confirma que el contratista está al día en los
          formatos de la obra. Sin tu aval no se paga el saldo.
        </p>
      </div>

      <p className="text-xs text-gray-500">
        <span className="font-semibold text-amber-700">{pendientes}</span> por verificar · {verificaciones.length} en la cola
      </p>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-3 px-4 font-semibold">Proyecto</th>
              <th className="py-3 px-4 font-semibold">Sitio</th>
              <th className="py-3 px-4 font-semibold">Contratista</th>
              <th className="py-3 px-4 font-semibold">Estado del proyecto</th>
              <th className="py-3 px-4 font-semibold">Gate SST</th>
              <th className="py-3 px-4 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && ordenadas.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">
                No hay proyectos en el tramo de verificación (facturado / pagado por el cliente).
              </td></tr>
            )}
            {!loading && ordenadas.map(v => {
              const gate = estadoSstGate(v)
              return (
                <tr key={v.proyecto_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    {/* Sin enlace a la ficha del proyecto: SST no accede a `proyectos` */}
                    <span className="font-mono text-gray-800 font-semibold">{v.consecutivo}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-gray-800">{v.nombre_sitio || '—'}</span>
                    <Link to={`/registros/${v.obra_id}`}
                      className="block text-[11px] text-brand-700 hover:underline"
                      title="Formularios SST de la obra-espejo de este proyecto">
                      Ver formularios de la obra →
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-gray-700">{v.contratista_nombre || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_PRY_COLOR[v.estado]}`}>
                      {ESTADO_PRY_LABEL[v.estado]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${SST_GATE_COLOR[gate]}`}
                      title={v.sst_gate?.observacion ? `Observación: ${v.sst_gate.observacion}` : undefined}>
                      {SST_GATE_LABEL[gate]}
                    </span>
                    {v.sst_gate && (
                      <span className="block text-[11px] text-gray-400 mt-0.5">{fFecha(v.sst_gate.fecha)}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {puedeMarcar ? (
                      <div className="flex items-center justify-end gap-2">
                        {gate !== 'al_dia' && (
                          <button onClick={() => marcar(v, 'al_dia')} disabled={aplicando}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                            ✔ Al día
                          </button>
                        )}
                        {gate !== 'con_novedad' && (
                          <button onClick={() => { setNovedadTarget(v); setObservacion('') }} disabled={aplicando}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                            ⚠ Con novedad
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">solo SST</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Novedad — observación OBLIGATORIA */}
      <Modal
        isOpen={novedadTarget !== null}
        title={`Novedad SST — ${novedadTarget?.consecutivo ?? ''}`}
        onClose={() => setNovedadTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setNovedadTarget(null), variant: 'secondary' },
          {
            label: aplicando ? 'Registrando…' : 'Registrar novedad (bloquea liquidación)',
            onClick: () => { if (observacion.trim() && novedadTarget) marcar(novedadTarget, 'con_novedad', observacion) },
            variant: 'danger', loading: aplicando,
          },
        ]}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Contratista <strong>{novedadTarget?.contratista_nombre || '—'}</strong> — describe la
            novedad: mientras exista, la liquidación queda bloqueada.
          </p>
          <label className="text-sm font-medium text-gray-700">
            Observación <span className="text-red-500">*</span>
          </label>
          <textarea value={observacion} onChange={e => setObservacion(e.target.value)} rows={3}
            placeholder="Ej: faltan permisos de trabajo en alturas de la semana del 15…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          {!observacion.trim() && <p className="text-xs text-red-600">La observación es obligatoria.</p>}
        </div>
      </Modal>
    </div>
  )
}
