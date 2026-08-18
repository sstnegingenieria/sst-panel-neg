// src/components/sigp/actividades/ActividadDetalle.tsx
//
// Ficha de una actividad: los dos hitos (aprobación/ejecución) son
// independientes y sin secuencia obligatoria; cada acción pasa por su patch
// builder puro (types/sigp/actividad) — si devuelve null, toast y ningún
// write. El historial se arma aparte con arrayUnion en cada llamada, tal
// como documenta el motor.
import { useState } from 'react'
import { arrayUnion, doc, Timestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import { toast } from '../../shared/Toast'
import LineasActividad from './LineasActividad'
import { fmtMoney } from '../../../utils/sigp/formato'
import { lpuVigente } from '../../../types/sigp/lpu'
import type { LPU } from '../../../types/sigp/lpu'
import {
  ESTADO_ACTIVIDAD_LABEL, ESTADO_ACTIVIDAD_COLOR,
  estaValorizada, lineasCongeladas,
  patchAprobar, patchEjecutar, patchLineas, patchAnular, patchCabecera,
} from '../../../types/sigp/actividad'
import type { Actividad, LineaActividad as TipoLineaActividad } from '../../../types/sigp/actividad'
import { propuestaVigenteDe } from '../../../types/sigp/propuestaActividad'
import type { PropuestaActividad } from '../../../types/sigp/propuestaActividad'

interface ActividadDetalleProps {
  isOpen: boolean
  onClose: () => void
  actividad: Actividad
  lpus: LPU[]
  puedeGestionar: boolean
  uid: string
  onCambio: () => void
  /** Propuestas del cliente (F1.2) — para el chip de la vigente que cubre la
   *  actividad y para CONGELAR consecutivo+versión al marcar la aprobación. */
  propuestas?: PropuestaActividad[]
}

const hoyISO = () => new Date().toISOString().slice(0, 10)
const aTimestamp = (fechaISO: string) => Timestamp.fromDate(new Date(`${fechaISO}T00:00:00`))
const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function ActividadDetalle({ isOpen, onClose, actividad, lpus, puedeGestionar, uid, onCambio, propuestas }: ActividadDetalleProps) {
  const anulada = !!actividad.anulacion
  const soloLectura = !puedeGestionar || anulada

  const lpu = lpuVigente(lpus, actividad.cliente_id, { contrato: actividad.contrato, naturaleza: actividad.naturaleza })

  // Propuesta VIGENTE que cubre la actividad hoy (puntero vivo — distinta de
  // la evidencia congelada del hito, aprobacion.propuesta_ref).
  const propuestaVigente = actividad.propuesta_consecutivo
    ? propuestaVigenteDe(propuestas ?? [], actividad.propuesta_consecutivo)
    : null

  const [guardando, setGuardando] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(false)

  // ── Aprobación ──
  const [aprobando, setAprobando] = useState(false)
  const [fechaAprob, setFechaAprob] = useState(hoyISO())
  const [refAprob, setRefAprob] = useState('')

  const confirmarAprobacion = async () => {
    // §6d: congela contra qué documento se aprobó — la vigente EN ESTE momento.
    const propuestaRef = propuestaVigente
      ? { consecutivo: propuestaVigente.consecutivo, version: propuestaVigente.version }
      : undefined
    const patch = patchAprobar(actividad, uid, aTimestamp(fechaAprob), refAprob, propuestaRef)
    if (!patch) { toast('No se pudo aprobar (¿ya estaba aprobada o anulada?)', 'error'); return }
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'actividades', actividad.id), {
        ...patch, fecha_actualizacion: ahora,
        historial: arrayUnion({ fecha: ahora, por: uid, accion: `aprobada (ref: ${refAprob.trim() || 'sin referencia'})` }),
      })
      toast('Actividad aprobada')
      setAprobando(false)
      onCambio()
    } catch (e) {
      console.error('ActividadDetalle.aprobar', e)
      toast('No se pudo guardar la aprobación', 'error')
    } finally { setGuardando(false) }
  }

  // ── Ejecución ──
  const [ejecutando, setEjecutando] = useState(false)
  const [fechaEjec, setFechaEjec] = useState(hoyISO())
  const [notaEjec, setNotaEjec] = useState('')

  const confirmarEjecucion = async () => {
    const patch = patchEjecutar(actividad, uid, aTimestamp(fechaEjec), notaEjec)
    if (!patch) { toast('No se pudo registrar la ejecución (¿ya estaba ejecutada o anulada?)', 'error'); return }
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'actividades', actividad.id), {
        ...patch, fecha_actualizacion: ahora,
        historial: arrayUnion({ fecha: ahora, por: uid, accion: 'ejecutada' }),
      })
      toast('Ejecución registrada')
      setEjecutando(false)
      onCambio()
    } catch (e) {
      console.error('ActividadDetalle.ejecutar', e)
      toast('No se pudo guardar la ejecución', 'error')
    } finally { setGuardando(false) }
  }

  // ── Líneas ──
  const onChangeLineas = async (nuevas: TipoLineaActividad[]) => {
    const patch = patchLineas(actividad, nuevas)
    if (!patch) { toast('El congelamiento impide ese cambio', 'error'); return }
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'actividades', actividad.id), { ...patch, fecha_actualizacion: Timestamp.now() })
      onCambio()
    } catch (e) {
      console.error('ActividadDetalle.lineas', e)
      toast('No se pudieron guardar las líneas', 'error')
    } finally { setGuardando(false) }
  }

  // ── Cabecera ──
  const [editandoCabecera, setEditandoCabecera] = useState(false)
  const [descEdit, setDescEdit] = useState(actividad.descripcion)
  const [sedeEdit, setSedeEdit] = useState(actividad.sede_nombre)
  const [solicitanteEdit, setSolicitanteEdit] = useState(actividad.solicitante ?? '')
  const [refEdit, setRefEdit] = useState(actividad.referencia_cliente ?? '')
  const [fechaSolEdit, setFechaSolEdit] = useState(
    actividad.fecha_solicitud?.toDate ? actividad.fecha_solicitud.toDate().toISOString().slice(0, 10) : '',
  )

  const abrirEdicionCabecera = () => {
    setDescEdit(actividad.descripcion); setSedeEdit(actividad.sede_nombre)
    setSolicitanteEdit(actividad.solicitante ?? ''); setRefEdit(actividad.referencia_cliente ?? '')
    setFechaSolEdit(actividad.fecha_solicitud?.toDate ? actividad.fecha_solicitud.toDate().toISOString().slice(0, 10) : '')
    setEditandoCabecera(true)
  }

  const guardarCabecera = async () => {
    const patch = patchCabecera(actividad, {
      descripcion: descEdit.trim(),
      sede_nombre: sedeEdit.trim(),
      ...(solicitanteEdit.trim() ? { solicitante: solicitanteEdit.trim() } : {}),
      ...(refEdit.trim() ? { referencia_cliente: refEdit.trim() } : {}),
      ...(fechaSolEdit ? { fecha_solicitud: aTimestamp(fechaSolEdit) } : {}),
    })
    if (!patch) { toast('No se pudo guardar (¿actividad anulada?)', 'error'); return }
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'actividades', actividad.id), {
        ...patch, fecha_actualizacion: ahora,
        historial: arrayUnion({ fecha: ahora, por: uid, accion: 'cabecera editada' }),
      })
      toast('Cambios guardados')
      setEditandoCabecera(false)
      onCambio()
    } catch (e) {
      console.error('ActividadDetalle.cabecera', e)
      toast('No se pudo guardar', 'error')
    } finally { setGuardando(false) }
  }

  // ── Anular ──
  const [anulando, setAnulando] = useState(false)
  const [motivoAnular, setMotivoAnular] = useState('')

  const confirmarAnulacion = async () => {
    const patch = patchAnular(actividad, uid, Timestamp.now(), motivoAnular)
    if (!patch) { toast('El motivo es obligatorio para anular', 'error'); return }
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'actividades', actividad.id), {
        ...patch, fecha_actualizacion: ahora,
        historial: arrayUnion({ fecha: ahora, por: uid, accion: `anulada: ${motivoAnular.trim()}` }),
      })
      toast('Actividad anulada')
      setAnulando(false)
      onCambio()
    } catch (e) {
      console.error('ActividadDetalle.anular', e)
      toast('No se pudo anular', 'error')
    } finally { setGuardando(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" title={actividad.descripcion || 'Actividad'}>
      <div className="space-y-5">
        {anulada && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold">Anulada</p>
            <p className="mt-0.5">{actividad.anulacion?.motivo}</p>
            <p className="text-xs text-red-600 mt-1">{fFecha(actividad.anulacion?.fecha)}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_ACTIVIDAD_COLOR[actividad.estado] ?? 'bg-gray-100 text-gray-600'}`}>
            {ESTADO_ACTIVIDAD_LABEL[actividad.estado] ?? actividad.estado}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{actividad.sede_nombre || '—'}</span>
          {actividad.zona && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700"
              title="Zona — columna UBICACIÓN de la memoria de cantidades del acta">
              📍 {actividad.zona}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{actividad.contrato || 'sin contrato'}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{actividad.naturaleza}</span>
          {actividad.propuesta_consecutivo && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700"
              title={propuestaVigente
                ? `Cubierta por la propuesta vigente ${propuestaVigente.consecutivo} v${propuestaVigente.version}`
                : 'Propuesta de la serie (vigente no cargada)'}>
              📄 {actividad.propuesta_consecutivo}{propuestaVigente ? ` v${propuestaVigente.version}` : ''}
            </span>
          )}
          {actividad.referencia_cliente && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">ref. {actividad.referencia_cliente}</span>}
          {actividad.solicitante && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">solicita: {actividad.solicitante}</span>}
          {!estaValorizada(actividad) && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">sin valorizar</span>}
          <span className="ml-auto text-lg font-bold text-gray-800">{fmtMoney(actividad.total || 0)}</span>
        </div>

        {/* Cabecera editable */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Datos de la actividad</h3>
            {!soloLectura && !editandoCabecera && (
              <button onClick={abrirEdicionCabecera} className="text-xs text-brand-700 hover:underline">✎ Editar</button>
            )}
          </div>
          {!editandoCabecera ? (
            <p className="text-sm text-gray-600 mt-2">{actividad.descripcion}</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Descripción</label>
                <textarea value={descEdit} onChange={e => setDescEdit(e.target.value)} rows={2}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </div>
              <TextField label="Sede" value={sedeEdit} onChange={setSedeEdit} />
              <TextField label="Solicitante" value={solicitanteEdit} onChange={setSolicitanteEdit} />
              <TextField label="Referencia del cliente" value={refEdit} onChange={setRefEdit} />
              <TextField label="Fecha de solicitud" type="date" value={fechaSolEdit} onChange={setFechaSolEdit} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditandoCabecera(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button onClick={guardarCabecera} disabled={guardando} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">Guardar</button>
              </div>
            </div>
          )}
        </div>

        {/* Hito: Aprobación */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Aprobación</h3>
          {actividad.aprobacion ? (
            <div className="text-sm text-gray-600 space-y-0.5">
              <p>{fFecha(actividad.aprobacion.fecha)}{actividad.aprobacion.referencia ? ` · ref: ${actividad.aprobacion.referencia}` : ''}</p>
              {actividad.aprobacion.propuesta_ref && (
                <p className="text-xs text-gray-500"
                  title="Evidencia congelada al aprobar — no cambia aunque la propuesta se re-emita después">
                  🧊 aprobada contra {actividad.aprobacion.propuesta_ref.consecutivo} v{actividad.aprobacion.propuesta_ref.version}
                </p>
              )}
              <p className="text-xs text-gray-400">registrada por {actividad.aprobacion.por}</p>
            </div>
          ) : !aprobando ? (
            soloLectura ? (
              <p className="text-sm text-gray-400">Sin aprobar.</p>
            ) : (
              <button onClick={() => { setFechaAprob(hoyISO()); setRefAprob(''); setAprobando(true) }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white">
                ✔ Marcar aprobada
              </button>
            )
          ) : (
            <div className="space-y-2">
              <TextField label="Fecha" type="date" value={fechaAprob} onChange={setFechaAprob} />
              <TextField label="Referencia de la aprobación (correo / FAD / nº)" value={refAprob} onChange={setRefAprob}
                hint="la referencia es la evidencia" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAprobando(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button onClick={confirmarAprobacion} disabled={guardando} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">Confirmar</button>
              </div>
            </div>
          )}
        </div>

        {/* Hito: Ejecución */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Ejecución</h3>
          {actividad.ejecucion ? (
            <div className="text-sm text-gray-600 space-y-0.5">
              <p>{fFecha(actividad.ejecucion.fecha)}{actividad.ejecucion.nota ? ` · ${actividad.ejecucion.nota}` : ''}</p>
              <p className="text-xs text-gray-400">registrada por {actividad.ejecucion.por}</p>
            </div>
          ) : !ejecutando ? (
            soloLectura ? (
              <p className="text-sm text-gray-400">Sin ejecutar.</p>
            ) : (
              <button onClick={() => { setFechaEjec(hoyISO()); setNotaEjec(''); setEjecutando(true) }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white">
                🔧 Marcar ejecutada
              </button>
            )
          ) : (
            <div className="space-y-2">
              <TextField label="Fecha" type="date" value={fechaEjec} onChange={setFechaEjec} />
              <TextField label="Nota (opcional)" value={notaEjec} onChange={setNotaEjec} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEjecutando(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button onClick={confirmarEjecucion} disabled={guardando} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">Confirmar</button>
              </div>
            </div>
          )}
        </div>

        {/* Líneas */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Líneas</h3>
          <LineasActividad
            alcance={{ cliente_id: actividad.cliente_id, contrato: actividad.contrato, naturaleza: actividad.naturaleza }}
            lpu={lpu}
            lineas={actividad.lineas ?? []}
            onChange={onChangeLineas}
            disabled={soloLectura}
            congeladas={lineasCongeladas(actividad)}
          />
        </div>

        {/* Anular */}
        {puedeGestionar && !anulada && (
          <div className="border-t border-gray-100 pt-4">
            {!anulando ? (
              <button onClick={() => { setMotivoAnular(''); setAnulando(true) }} className="text-xs text-red-500 hover:text-red-700 hover:underline">
                Anular actividad
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Motivo de anulación<span className="text-red-500 ml-0.5">*</span></label>
                  <textarea value={motivoAnular} onChange={e => setMotivoAnular(e.target.value)} rows={2} autoFocus
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAnulando(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
                  <button onClick={confirmarAnulacion} disabled={guardando || !motivoAnular.trim()} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">Confirmar anulación</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Historial */}
        <div className="border-t border-gray-100 pt-3">
          <button onClick={() => setHistorialAbierto(v => !v)} className="text-xs font-medium text-gray-500 hover:text-gray-700">
            {historialAbierto ? '− Ocultar' : '+ Ver'} historial ({(actividad.historial ?? []).length})
          </button>
          {historialAbierto && (
            <ul className="mt-2 space-y-1 text-xs text-gray-500">
              {(actividad.historial ?? []).map((h, i) => (
                <li key={i}>{fFecha(h.fecha)} — {h.accion}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
