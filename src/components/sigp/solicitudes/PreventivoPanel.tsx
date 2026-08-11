// Panel del PREVENTIVO IHS en el detalle de la solicitud (F2.2).
//
// Sin cotización: la decisión es ACEPTAR (calcula el precio con la matriz,
// STAGEA el snapshot del proyecto y pasa la solicitud a `aceptada` — el
// proyecto lo crea SERVER-SIDE la CF crearProyectoAlAceptarPreventivo, §16 ii)
// o RECHAZAR (motivo → descartada). Reemplaza las transiciones genéricas de
// la máquina comercial.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { fmtMoney } from '../../../utils/sigp/formato'
import { precioPreventivo, construirSnapshotPreventivo, TIPO_SITIO_LABEL, INTENSIDAD_LABEL, TRANSPORTE_PREVENTIVO } from '../../../types/sigp/preventivos'
import { veProyectosUI } from '../../../types/sigp/permisos'
import { useNacimientoProyecto } from '../../../hooks/sigp/useNacimientoProyecto'
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
  const [aplicando, setAplicando] = useState(false)
  const [modalRechazo, setModalRechazo] = useState(false)
  const [motivo, setMotivo] = useState('')

  // §16 (ii): el proyecto nace server-side — listener del enlace inverso
  // (antes del early-return: los hooks no pueden ser condicionales).
  const veProyectos = veProyectosUI(user?.rol)
  const esperandoNacimiento = solicitud.estado === 'aceptada'
    && !solicitud.proyecto_id && !!solicitud.snapshot_proyecto
  const nacimiento = useNacimientoProyecto('solicitudes', solicitud.id, esperandoNacimiento)
  const proyectoId = solicitud.proyecto_id ?? nacimiento.proyectoId
  const proyectoConsecutivo = solicitud.proyecto_consecutivo ?? nacimiento.proyectoConsecutivo
  const recienCreado = !solicitud.proyecto_id && !!nacimiento.proyectoId

  const p = solicitud.preventivo
  if (!p) return null

  const precio = precioPreventivo({
    zona: p.zona, tipo: p.tipo_sitio, intensidad: p.intensidad,
    es_jungle: p.es_jungle, es_sai: p.es_sai,
  })
  const decidible = puedeGestionar && ['recibida', 'en_estudio'].includes(solicitud.estado)

  /** Snapshot para el STAGING (§16 ii): matriz TS + cliente (read no-fatal). */
  const construirStaging = async () => {
    if (!precio) return null
    let clienteNombre: string | undefined
    let clienteNit: string | undefined
    if (solicitud.cliente_id) {
      try {
        const c = await getDoc(doc(db, 'clientes', solicitud.cliente_id))
        if (c.exists()) {
          clienteNombre = c.data().nombre as string
          clienteNit = (c.data().nit as string) || undefined
        }
      } catch { /* fallback: 'IHS' desde el builder */ }
    }
    return construirSnapshotPreventivo(solicitud, p, precio, clienteNombre, clienteNit)
  }

  const aceptar = async () => {
    if (!precio) return
    if (!window.confirm(`¿Aceptar el preventivo ${solicitud.consecutivo}? El sistema crea el proyecto con el precio de matriz ${fmtMoney(precio.total)} (IVA pleno aguas abajo).`)) return
    setAplicando(true)
    try {
      const staged = await construirStaging()
      if (!staged) { toast('No se pudo preparar el snapshot del proyecto — reintenta', 'error'); return }
      const ahora = Timestamp.now()
      // UN solo updateDoc: staging + transición. La CF (trigger →aceptada en
      // preventivos) copia el snapshot, asigna el PRY y escribe el enlace.
      const patch: Record<string, unknown> = {
        snapshot_proyecto: staged,
        fecha_actualizacion: ahora,
      }
      if (solicitud.estado !== 'aceptada') {
        patch.estado = 'aceptada'
        patch.historial = arrayUnion({
          de: solicitud.estado, a: 'aceptada', por: user?.uid ?? '', fecha: ahora,
          motivo: `Preventivo aceptado — precio de matriz ${fmtMoney(precio.total)} · proyecto creado por el sistema`,
        })
      }
      await updateDoc(doc(db, 'solicitudes', solicitud.id), patch)
      toast('Preventivo aceptado — el sistema está creando el proyecto')
      await reload()
    } catch (e) {
      console.error('Error aceptando el preventivo:', e)
      toast('No se pudo aceptar — reintenta', 'error')
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
        <h2 className="font-semibold text-gray-800 text-sm">Preventivo</h2>
        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-50 text-brand-700">PREVENTIVO</span>
        {proyectoId ? (
          veProyectos ? (
            <Link to={`/sigp/proyectos/${proyectoId}`}
              className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-semibold hover:bg-brand-100">
              🏗 {proyectoConsecutivo ?? 'Proyecto'}{recienCreado ? ' creado ✓' : ' →'}
            </Link>
          ) : (
            <span className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-semibold cursor-default"
              title="Proyecto en manos de Gerencia de Proyectos — la gestión comercial termina aquí">
              🏗 {proyectoConsecutivo ?? 'Proyecto'}{recienCreado ? ' creado ✓' : ''}
            </span>
          )
        ) : esperandoNacimiento && !nacimiento.tardando ? (
          <span className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 font-medium animate-pulse">
            ⏳ Creando proyecto…
          </span>
        ) : null}
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
      {solicitud.estado === 'aceptada' && !proyectoId && puedeGestionar
        && (!esperandoNacimiento || nacimiento.tardando) && (
        <div className="flex items-center gap-2">
          <button onClick={aceptar} disabled={aplicando}
            title="Solicitud aceptada sin proyecto — el reintento re-stagea el snapshot y re-toca el doc; el sistema lo crea"
            className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 font-medium disabled:opacity-50">
            🏗 Reintentar proyecto
          </button>
          {esperandoNacimiento && nacimiento.tardando && (
            <span className="text-[11px] text-gray-400">El sistema está tardando más de lo normal…</span>
          )}
        </div>
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
