// Panel del PREVENTIVO IHS en el detalle de la solicitud (F2.2).
//
// Sin cotización: la decisión es ACEPTAR (calcula el precio con la matriz y
// CREA el proyecto — reutiliza el nacimiento de F2.1 con origen 'preventivo',
// idempotente) o RECHAZAR (motivo → descartada). Reemplaza las transiciones
// genéricas de la máquina comercial.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import { crearProyectoDesdePreventivo } from '../../../utils/sigp/proyectos'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { fmtMoney } from '../../../utils/sigp/formato'
import { precioPreventivo, TIPO_SITIO_LABEL, INTENSIDAD_LABEL, TRANSPORTE_PREVENTIVO } from '../../../types/sigp/preventivos'
import type { Solicitud } from '../../../types/sigp/solicitud'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  solicitud: Solicitud
  puedeGestionar: boolean
  reload: () => Promise<void>
}

export default function PreventivoPanel({ solicitud, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const { obtener } = useConsecutivo()
  const [aplicando, setAplicando] = useState(false)
  const [modalRechazo, setModalRechazo] = useState(false)
  const [motivo, setMotivo] = useState('')
  // Patrón SOL/VIS/COT/PRY: el consecutivo se preserva ante fallos.
  const pryPendiente = useRef<string | null>(null)

  const p = solicitud.preventivo
  if (!p) return null

  const precio = precioPreventivo({
    zona: p.zona, tipo: p.tipo_sitio, intensidad: p.intensidad,
    es_jungle: p.es_jungle, es_sai: p.es_sai,
  })
  const decidible = puedeGestionar && ['recibida', 'en_estudio'].includes(solicitud.estado)

  const obtenerPry = async () => {
    if (pryPendiente.current) return pryPendiente.current
    const c = await obtener('PRY')
    pryPendiente.current = c
    return c
  }

  const aceptar = async () => {
    if (!precio) return
    if (!window.confirm(`¿Aceptar el preventivo ${solicitud.consecutivo}? Se crea el proyecto con el precio de matriz ${fmtMoney(precio.total)} (IVA pleno aguas abajo).`)) return
    setAplicando(true)
    try {
      const r = await crearProyectoDesdePreventivo({
        solicitud, uid: user?.uid ?? '', obtenerConsecutivo: obtenerPry,
      })
      pryPendiente.current = null
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'solicitudes', solicitud.id), {
        estado: 'aceptada',
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: solicitud.estado, a: 'aceptada', por: user?.uid ?? '', fecha: ahora,
          motivo: `Preventivo aceptado — proyecto ${r.consecutivo} · precio de matriz ${fmtMoney(precio.total)}`,
        }),
      })
      toast(r.creado ? `Proyecto ${r.consecutivo} creado` : `El proyecto ${r.consecutivo} ya existía`)
      await reload()
    } catch (e) {
      console.error('Error aceptando el preventivo:', e)
      toast('No se pudo aceptar — reintenta (el consecutivo se preserva)', 'error')
    } finally { setAplicando(false) }
  }

  const rechazar = async () => {
    if (!motivo.trim()) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'solicitudes', solicitud.id), {
        estado: 'descartada',
        motivo_descarte: motivo.trim(),
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: solicitud.estado, a: 'descartada', por: user?.uid ?? '', fecha: ahora,
          motivo: `Preventivo rechazado: ${motivo.trim()}`,
        }),
      })
      toast('Preventivo rechazado')
      setModalRechazo(false); setMotivo('')
      await reload()
    } catch { toast('Error al rechazar', 'error') } finally { setAplicando(false) }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-semibold text-gray-800 text-sm">Preventivo IHS</h2>
        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-50 text-brand-700">PREVENTIVO</span>
        {solicitud.proyecto_id && (
          <Link to={`/sigp/proyectos/${solicitud.proyecto_id}`}
            className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-semibold hover:bg-brand-100">
            🏗 {solicitud.proyecto_consecutivo ?? 'Proyecto'} →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        <Dato k="Sitio" v={`${p.sitio_nombre}${p.sitio_id ? ` (${p.sitio_id})` : ''}`} />
        <Dato k="Tipo" v={`${TIPO_SITIO_LABEL[p.tipo_sitio]}${p.es_jungle ? ' · Jungle' : ''}${p.es_sai ? ' · SAI' : ''}`} />
        <Dato k="Intensidad" v={INTENSIDAD_LABEL[p.intensidad]} />
        <Dato k="Departamento" v={`${p.departamento} (${p.zona})`} />
        <Dato k="Asignación" v={fFecha(p.fecha_asignacion)} />
      </div>

      {/* Precio de matriz */}
      {precio ? (
        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Valor de matriz ({p.es_jungle ? 'jungle' : 'normal'})</span><span className="font-mono text-gray-700">{fmtMoney(precio.base)}</span></div>
          {precio.transporte > 0 && (
            <div className="flex justify-between"><span className="text-gray-500">Transporte ({p.es_sai && !p.es_jungle ? 'San Andrés' : 'jungle/SAI'})</span><span className="font-mono text-gray-700">{fmtMoney(TRANSPORTE_PREVENTIVO)}</span></div>
          )}
          <div className="flex justify-between font-semibold"><span className="text-gray-700">Precio del preventivo</span><span className="font-mono text-gray-900">{fmtMoney(precio.total)}</span></div>
          <p className="text-[11px] text-gray-400">Esquema IVA pleno — el IVA se aplica en la facturación (Gerencia Administrativa, futuro).</p>
        </div>
      ) : (
        <p className="text-xs text-red-600 font-medium">⚠ Combinación no disponible en la matriz ({p.zona} · {TIPO_SITIO_LABEL[p.tipo_sitio]} · {INTENSIDAD_LABEL[p.intensidad]}).</p>
      )}

      {/* Decisión */}
      {decidible && (
        <div className="flex flex-wrap gap-2">
          <button onClick={aceptar} disabled={!precio || aplicando}
            className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
            ✓ Aceptar y crear proyecto
          </button>
          <button onClick={() => { setModalRechazo(true); setMotivo('') }} disabled={aplicando}
            className="text-sm px-3 py-1.5 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
            ✕ Rechazar
          </button>
        </div>
      )}
      {solicitud.estado === 'aceptada' && !solicitud.proyecto_id && puedeGestionar && (
        <button onClick={aceptar} disabled={aplicando}
          className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 font-medium disabled:opacity-50">
          🏗 Crear proyecto (reintento)
        </button>
      )}

      {/* Modal rechazo (motivo obligatorio) */}
      <Modal isOpen={modalRechazo} onClose={() => setModalRechazo(false)} title={`Rechazar preventivo ${solicitud.consecutivo}`}
        actions={[
          { label: 'Cancelar', onClick: () => setModalRechazo(false), variant: 'secondary' },
          { label: 'Rechazar', onClick: rechazar, variant: 'danger', loading: aplicando },
        ]}>
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Registra el motivo (obligatorio) — p. ej. sin cuadrilla disponible en la zona.</p>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
            placeholder="Motivo del rechazo…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          {!motivo.trim() && <p className="text-xs text-red-600">El motivo es obligatorio.</p>}
        </div>
      </Modal>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-gray-400 text-xs">{k}</span>
      <p className="text-gray-800">{v}</p>
    </div>
  )
}
