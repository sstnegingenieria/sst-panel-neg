// src/components/sigp/actividades/ActividadForm.tsx
//
// Registro en menos de un minuto (criterio que manda sobre todo): sede +
// contrato (si aplica) + naturaleza + descripción es el camino mínimo;
// todo lo demás está plegado. "Registrar como ejecutada (hoy)" cubre la
// emergencia — un solo tap extra, misma pantalla.
import { useState } from 'react'
import { addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import SelectField from '../../shared/SelectField'
import { toast } from '../../shared/Toast'
import LineasActividad from './LineasActividad'
import { estadoDe, totalLineas } from '../../../types/sigp/actividad'
import type { LineaActividad, HitoEjecucion, EntradaHistorialActividad } from '../../../types/sigp/actividad'
import type { Cliente } from '../../../types/sigp/cliente'
import { lpuVigente } from '../../../types/sigp/lpu'
import type { LPU } from '../../../types/sigp/lpu'

interface ActividadFormProps {
  isOpen: boolean
  onClose: () => void
  cliente: Cliente
  lpus: LPU[]
  onRegistrada: () => void
  clienteFijo?: boolean
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

export default function ActividadForm({ isOpen, onClose, cliente, lpus, onRegistrada, clienteFijo }: ActividadFormProps) {
  const { user } = useAuth()

  const sedes = cliente.sedes ?? []
  const contratos = cliente.contratos ?? []
  const solicitantesCliente = cliente.contactos_solicitantes ?? []

  const [sedeId, setSedeId] = useState('')
  const [sedeLibre, setSedeLibre] = useState('')
  const [contrato, setContrato] = useState(contratos.length === 1 ? contratos[0] : '')
  const [naturaleza, setNaturaleza] = useState<'opex' | 'capex'>('opex')
  const [descripcion, setDescripcion] = useState('')

  const [detallesAbiertos, setDetallesAbiertos] = useState(false)
  const [solicitanteSel, setSolicitanteSel] = useState('')
  const [solicitanteLibre, setSolicitanteLibre] = useState('')
  const [fechaSolicitud, setFechaSolicitud] = useState(hoyISO())
  const [referenciaCliente, setReferenciaCliente] = useState('')

  const [lineasAbiertas, setLineasAbiertas] = useState(false)
  const [lineas, setLineas] = useState<LineaActividad[]>([])

  const [guardando, setGuardando] = useState<'registrar' | 'ejecutar' | null>(null)

  const [zona, setZona] = useState('')

  const reset = () => {
    setSedeId(''); setSedeLibre(''); setZona(''); setContrato(contratos.length === 1 ? contratos[0] : '')
    setNaturaleza('opex'); setDescripcion(''); setDetallesAbiertos(false)
    setSolicitanteSel(''); setSolicitanteLibre(''); setFechaSolicitud(hoyISO()); setReferenciaCliente('')
    setLineasAbiertas(false); setLineas([])
  }

  const cerrar = () => { if (!guardando) { reset(); onClose() } }

  const sedeSeleccionada = sedes.find(s => s.id === sedeId)
  const sedeNombreFinal = sedes.length > 0 ? (sedeSeleccionada?.nombre ?? '') : sedeLibre.trim()
  const solicitanteFinal = solicitanteSel === '__nuevo__' ? solicitanteLibre.trim() : solicitanteSel
  // La zona es la columna UBICACIÓN del acta (p. ej. "Búnker XI") — si la
  // sede tiene zonas, elegir una es OBLIGATORIO: sin ella, F2 no tendría qué
  // imprimir y habría que reconstruirla de memoria.
  const zonasSede = sedeSeleccionada?.zonas ?? []
  const zonaRequerida = zonasSede.length > 0

  const alcance = { cliente_id: cliente.id, contrato, naturaleza }
  const lpuAlcance = lpuVigente(lpus, cliente.id, { contrato, naturaleza })

  const valido = descripcion.trim() !== '' && sedeNombreFinal !== '' && (!zonaRequerida || zona !== '')

  const registrar = async (marcarEjecutada: boolean) => {
    if (!user || !valido) {
      toast('Completa sede y descripción para registrar', 'error')
      return
    }
    setGuardando(marcarEjecutada ? 'ejecutar' : 'registrar')
    try {
      const ahora = Timestamp.now()
      const ejecucion: HitoEjecucion | undefined = marcarEjecutada ? { fecha: ahora, por: user.uid } : undefined
      const estado = estadoDe({ aprobacion: undefined, ejecucion, anulacion: undefined })
      const historial: EntradaHistorialActividad[] = [{ fecha: ahora, por: user.uid, accion: 'registrada' }]
      if (ejecucion) historial.push({ fecha: ahora, por: user.uid, accion: 'ejecutada (registro inmediato)' })

      const nuevaActividad: Record<string, unknown> = {
        cliente_id: cliente.id,
        ...(sedeSeleccionada ? { sede_id: sedeSeleccionada.id } : {}),
        sede_nombre: sedeNombreFinal,
        ...(zona ? { zona } : {}),
        contrato,
        naturaleza,
        descripcion: descripcion.trim(),
        ...(solicitanteFinal ? { solicitante: solicitanteFinal } : {}),
        ...(referenciaCliente.trim() ? { referencia_cliente: referenciaCliente.trim() } : {}),
        ...(fechaSolicitud ? { fecha_solicitud: Timestamp.fromDate(new Date(`${fechaSolicitud}T00:00:00`)) } : {}),
        ...(ejecucion ? { ejecucion } : {}),
        lineas,
        total: totalLineas(lineas),
        estado,
        historial,
        creada_por: user.uid,
        fecha_creacion: ahora,
      }
      await addDoc(collection(db, 'actividades'), nuevaActividad)
      toast(marcarEjecutada ? 'Actividad registrada como ejecutada' : 'Actividad registrada')
      reset()
      onRegistrada()
    } catch (e) {
      console.error('ActividadForm.registrar', e)
      toast('No se pudo registrar la actividad', 'error')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Modal isOpen={isOpen} title="Registrar actividad" onClose={cerrar} size="lg"
      actions={[
        { label: 'Cancelar', onClick: cerrar, variant: 'secondary', disabled: !!guardando },
        { label: 'Registrar como ejecutada (hoy)', onClick: () => registrar(true), variant: 'secondary', loading: guardando === 'ejecutar', disabled: !valido || !!guardando },
        { label: 'Registrar', onClick: () => registrar(false), variant: 'primary', loading: guardando === 'registrar', disabled: !valido || !!guardando },
      ]}
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          Cliente <b className="text-gray-600">{cliente.nombre}</b>{clienteFijo ? ' 🔒' : ''}
        </p>

        {sedes.length > 0 ? (
          <SelectField label="Sede" value={sedeId} onChange={v => { setSedeId(v); setZona('') }} required
            options={sedes.map(s => ({ value: s.id, label: s.ciudad ? `${s.nombre} · ${s.ciudad}` : s.nombre }))}
            placeholder="Selecciona la sede" />
        ) : (
          <TextField label="Sede" value={sedeLibre} onChange={setSedeLibre} required placeholder="Nombre de la sede" />
        )}

        {zonaRequerida && (
          <SelectField label="Zona (ubicación en la sede)" value={zona} onChange={setZona} required
            options={zonasSede.map(z => ({ value: z, label: z }))}
            placeholder="Selecciona la zona" />
        )}

        {contratos.length > 1 && (
          <SelectField label="Contrato" value={contrato} onChange={setContrato}
            options={contratos.map(c => ({ value: c, label: c }))} placeholder="Selecciona el contrato" />
        )}
        {contratos.length === 1 && (
          <p className="text-xs text-gray-400">Contrato: <span className="text-gray-600 font-medium">{contratos[0]}</span></p>
        )}

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Naturaleza</label>
          <div className="flex gap-4">
            {(['opex', 'capex'] as const).map(n => (
              <label key={n} className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="radio" name="naturaleza" checked={naturaleza === n} onChange={() => setNaturaleza(n)} />
                {n.toUpperCase()}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Descripción<span className="text-red-500 ml-0.5">*</span></label>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} required
            placeholder="Qué se hizo o qué se solicita…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>

        <button type="button" onClick={() => setDetallesAbiertos(v => !v)}
          className="text-xs font-medium text-brand-700 hover:underline">
          {detallesAbiertos ? '− Ocultar' : '+'} Detalles (opcional)
        </button>

        {detallesAbiertos && (
          <div className="space-y-3 border-l-2 border-gray-100 pl-3">
            {solicitantesCliente.length > 0 ? (
              <SelectField label="Solicitante" value={solicitanteSel} onChange={setSolicitanteSel}
                options={[...solicitantesCliente.map(s => ({ value: s, label: s })), { value: '__nuevo__', label: '＋ Nuevo…' }]}
                placeholder="Selecciona el solicitante" />
            ) : (
              <TextField label="Solicitante" value={solicitanteLibre} onChange={setSolicitanteLibre} />
            )}
            {solicitantesCliente.length > 0 && solicitanteSel === '__nuevo__' && (
              <TextField label="Nombre del solicitante" value={solicitanteLibre} onChange={setSolicitanteLibre} />
            )}
            <TextField label="Fecha de solicitud" type="date" value={fechaSolicitud} onChange={setFechaSolicitud} />
            <TextField label="Referencia del cliente" value={referenciaCliente} onChange={setReferenciaCliente} placeholder="Código / radicado del cliente" />
          </div>
        )}

        <button type="button" onClick={() => setLineasAbiertas(v => !v)}
          className="text-xs font-medium text-brand-700 hover:underline">
          {lineasAbiertas ? '− Ocultar' : '+'} Líneas (opcional)
        </button>

        {lineasAbiertas && (
          <LineasActividad alcance={alcance} lpu={lpuAlcance} lineas={lineas} onChange={setLineas} />
        )}
        {!lineasAbiertas && lineas.length > 0 && (
          <p className="text-xs text-gray-400">{lineas.length} línea(s) cargada(s) — ábrelas para ver el detalle.</p>
        )}
      </div>
    </Modal>
  )
}
