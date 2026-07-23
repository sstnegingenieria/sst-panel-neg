import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { arrayUnion, Timestamp } from 'firebase/firestore'
import { useSolicitudDetalle } from '../../hooks/sigp/useSolicitudDetalle'
import { useFirestore } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import Modal from '../../components/shared/Modal'
import { puedeGestionarSolicitudesUI } from '../../types/sigp/permisos'
import { propagarAsunto } from '../../utils/sigp/asunto'
import { crearBorradorVisita, crearBorradorCotizacion } from '../../utils/sigp/pipeline'
import PreventivoPanel from '../../components/sigp/solicitudes/PreventivoPanel'
import {
  ESTADO_LABEL, ESTADO_COLOR, CANAL_LABEL, TRANSICIONES,
} from '../../types/sigp/solicitud'
import type { EstadoSolicitud, Solicitud } from '../../types/sigp/solicitud'

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d
    ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '—'
}

function origen(s: Solicitud, clienteNombre: string | null): string {
  return clienteNombre ?? s.prospecto_nombre ?? '—'
}

export default function SolicitudDetalleSigp() {
  const { solicitudId } = useParams<{ solicitudId: string }>()
  const { solicitud, cliente, loading, noEncontrada, reload } = useSolicitudDetalle(solicitudId)
  const { update } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarSolicitudesUI(user?.rol)

  const [transicionA, setTransicionA] = useState<EstadoSolicitud | null>(null)
  const [motivo, setMotivo] = useState('')
  const [aplicando, setAplicando] = useState(false)
  // Bloque B — edición inline del asunto canónico (se propaga a las cotizaciones)
  const [editandoAsunto, setEditandoAsunto] = useState(false)
  const [asuntoEdit, setAsuntoEdit] = useState('')
  const [guardandoAsunto, setGuardandoAsunto] = useState(false)

  const guardarAsunto = async () => {
    if (!solicitud) return
    setGuardandoAsunto(true)
    try {
      const n = await propagarAsunto({ solicitudId: solicitud.id, asunto: asuntoEdit })
      toast(n > 0 ? `Asunto actualizado — ${n} cotización(es) sincronizada(s)` : 'Asunto actualizado')
      setEditandoAsunto(false)
      await reload()
    } catch {
      toast('Error al actualizar el asunto', 'error')
    } finally { setGuardandoAsunto(false) }
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto p-8 text-sm text-gray-400">Cargando…</div>
  }
  if (noEncontrada || !solicitud) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <p className="text-gray-500">La solicitud no existe o fue eliminada.</p>
        <Link to="/sigp/solicitudes" className="text-brand-700 text-sm hover:underline mt-2 inline-block">← Volver a solicitudes</Link>
      </div>
    )
  }

  // F2.2 — los preventivos tienen su propia decisión (aceptar/rechazar en el
  // panel); las transiciones genéricas de la máquina comercial no aplican.
  const esPreventivo = solicitud.tipo === 'preventivo'
  const transicionesPosibles = esPreventivo ? [] : TRANSICIONES[solicitud.estado]
  const requiereMotivo = transicionA === 'descartada'

  const abrirTransicion = (a: EstadoSolicitud) => { setTransicionA(a); setMotivo('') }

  const aplicar = async () => {
    if (!transicionA) return
    if (requiereMotivo && !motivo.trim()) return
    setAplicando(true)
    try {
      const entrada = {
        de: solicitud.estado,
        a: transicionA,
        por: user?.uid ?? '',
        fecha: Timestamp.now(),
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      }
      await update('solicitudes', solicitud.id, {
        estado: transicionA,
        historial: arrayUnion(entrada),
        ...(transicionA === 'descartada' ? { motivo_descarte: motivo.trim() } : {}),
      })
      toast(`Solicitud → ${ESTADO_LABEL[transicionA]}`)
      // Pipeline (23-jul): la DECISIÓN crea sola el siguiente pendiente como
      // borrador SIN código (el consecutivo se asigna al materializar).
      // Idempotente: si ya existe visita/cotización enlazada, no duplica.
      if (transicionA === 'requiere_visita') {
        const creada = await crearBorradorVisita(solicitud, user?.uid ?? '')
        if (creada) toast('Visita pendiente de agendar creada (sin código) — ver Visitas')
      } else if (transicionA === 'lista_para_cotizar') {
        const creada = await crearBorradorCotizacion(solicitud, user?.uid ?? '')
        if (creada) toast('Cotización pendiente de diligenciar creada (sin código) — ver Cotizaciones')
      }
      setTransicionA(null)
      setMotivo('')
      await reload()
    } catch {
      toast('Error al cambiar el estado', 'error')
    } finally {
      setAplicando(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/sigp/solicitudes" className="text-sm text-gray-500 hover:text-brand-700 inline-flex items-center gap-1">
        ← Solicitudes
      </Link>

      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
            SIGP · Comercial · {origen(solicitud, cliente?.nombre ?? null)}
            {!solicitud.cliente_id && <span className="ml-2 text-gray-400 normal-case">(prospecto)</span>}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800 font-mono">{solicitud.consecutivo}</h1>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${ESTADO_COLOR[solicitud.estado]}`}>
              {ESTADO_LABEL[solicitud.estado]}
            </span>
          </div>
        </div>
      </div>

      {/* Panel del preventivo (F2.2) — decide aceptar/rechazar y muestra el precio */}
      {esPreventivo && <PreventivoPanel solicitud={solicitud} puedeGestionar={puedeGestionar} reload={reload} />}

      {/* Acciones de transición (solo flujo comercial) */}
      {puedeGestionar && !esPreventivo && (
        <div className="flex flex-wrap items-center gap-2">
          {transicionesPosibles.length === 0 ? (
            <span className="text-xs text-gray-400">Estado terminal · sin acciones disponibles.</span>
          ) : (
            transicionesPosibles.map(a => (
              <button
                key={a}
                onClick={() => abrirTransicion(a)}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium border transition ${
                  a === 'descartada'
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-brand-300 text-brand-700 hover:bg-brand-50'
                }`}
              >
                {a === 'descartada' ? 'Descartar' : `Marcar «${ESTADO_LABEL[a]}»`}
              </button>
            ))
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datos + contacto + adjuntos */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">Solicitud</h2>

            {/* Bloque B — asunto canónico, enlazado con la(s) cotización(es) */}
            {!esPreventivo && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                {editandoAsunto ? (
                  <div className="flex items-center gap-2">
                    <input value={asuntoEdit} onChange={e => setAsuntoEdit(e.target.value)} autoFocus
                      placeholder="Ej: Adecuaciones estación Ráquira"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    <button onClick={guardarAsunto} disabled={guardandoAsunto}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 flex-shrink-0">
                      {guardandoAsunto ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditandoAsunto(false)} disabled={guardandoAsunto}
                      className="text-xs px-2 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-gray-800">
                      <span className="text-xs text-gray-400 mr-2">Asunto</span>
                      {solicitud.asunto || <span className="text-gray-400">— sin asunto aún</span>}
                    </p>
                    {puedeGestionar && (
                      <button onClick={() => { setAsuntoEdit(solicitud.asunto ?? ''); setEditandoAsunto(true) }}
                        title="El asunto es compartido con la(s) cotización(es) de esta solicitud: editarlo aquí las actualiza"
                        className="text-xs text-brand-700 hover:underline flex-shrink-0">
                        ✎ Editar
                      </button>
                    )}
                  </div>
                )}
                {solicitud.estado === 'cotizada' && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Enlazado con la cotización: editar el asunto aquí o allá actualiza ambos.
                  </p>
                )}
              </div>
            )}

            <p className="text-sm text-gray-700 whitespace-pre-wrap">{solicitud.descripcion}</p>
            <div className="grid grid-cols-2 gap-2 text-sm pt-1">
              <Dato k="Nombre del sitio" v={solicitud.nombre_sitio || '—'} />
              <Dato k="Código del sitio (cliente)" v={solicitud.codigo_sitio_cliente || '—'} />
              <Dato k="Canal" v={CANAL_LABEL[solicitud.canal] ?? solicitud.canal} />
              <Dato k="Recepción" v={fFecha(solicitud.fecha_recepcion)} />
              <Dato k="Ubicación" v={solicitud.sitio || '—'} />
              <Dato k="Registrada" v={fFecha(solicitud.fecha_creacion)} />
            </div>
            {solicitud.motivo_descarte && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                <span className="font-semibold">Motivo de descarte:</span> {solicitud.motivo_descarte}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
            <h2 className="font-semibold text-gray-800 text-sm">Contacto</h2>
            <p className="text-sm text-gray-800">{solicitud.contacto.nombre}</p>
            <div className="text-xs text-gray-500 space-y-0.5">
              {solicitud.contacto.cargo && <p>{solicitud.contacto.cargo}</p>}
              {solicitud.contacto.email && <p>{solicitud.contacto.email}</p>}
              {solicitud.contacto.telefono && <p>{solicitud.contacto.telefono}</p>}
            </div>
          </div>

          {solicitud.adjuntos.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
              <h2 className="font-semibold text-gray-800 text-sm">Adjuntos ({solicitud.adjuntos.length})</h2>
              <ul className="space-y-1">
                {solicitud.adjuntos.map((a, i) => (
                  <li key={i}>
                    <a href={a.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-brand-700 hover:underline inline-flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      {a.nombre}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Timeline del historial */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-800 text-sm mb-3">Historial</h2>
          <ol className="space-y-4">
            {solicitud.historial.map((h, i) => (
              <li key={i} className="relative pl-5">
                <span className="absolute left-0 top-1 w-2 h-2 rounded-full bg-brand-600" />
                {i < solicitud.historial.length - 1 && (
                  <span className="absolute left-[3px] top-3 bottom-[-16px] w-px bg-gray-200" />
                )}
                <p className="text-sm text-gray-800">
                  {h.de ? `${ESTADO_LABEL[h.de]} → ` : 'Registrada · '}
                  <span className="font-medium">{ESTADO_LABEL[h.a]}</span>
                </p>
                <p className="text-[11px] text-gray-400">{fFecha(h.fecha)}</p>
                {h.motivo && <p className="text-xs text-gray-500 mt-0.5">{h.motivo}</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Modal de confirmación de transición */}
      <Modal
        isOpen={transicionA !== null}
        title={transicionA === 'descartada' ? 'Descartar solicitud' : `Cambiar a «${transicionA ? ESTADO_LABEL[transicionA] : ''}»`}
        onClose={() => setTransicionA(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setTransicionA(null), variant: 'secondary' },
          {
            label: transicionA === 'descartada' ? 'Descartar' : 'Confirmar',
            onClick: aplicar,
            variant: transicionA === 'descartada' ? 'danger' : 'primary',
            loading: aplicando,
          },
        ]}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            {solicitud.consecutivo}: <span className="font-medium">{ESTADO_LABEL[solicitud.estado]}</span>
            {' → '}
            <span className="font-medium">{transicionA ? ESTADO_LABEL[transicionA] : ''}</span>
          </p>
          <label className="text-sm font-medium text-gray-700">
            Motivo {requiereMotivo ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(opcional)</span>}
          </label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            placeholder={requiereMotivo ? 'Por qué se descarta…' : 'Nota opcional para el historial…'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          {requiereMotivo && !motivo.trim() && (
            <p className="text-xs text-red-600">El motivo es obligatorio para descartar.</p>
          )}
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
