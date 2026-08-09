// Modal "Registrar ausentismo" — el docId se genera ANTES de subir el
// soporte (patrón proveedores/liquidación) porque la ruta de Storage lo
// necesita; el detalle médico (sub-doc privado/detalle) se escribe DESPUÉS
// del doc principal y solo si hay texto y el rol gestiona horario.
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Timestamp, collection, doc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import SelectField from '../../shared/SelectField'
import TextField from '../../shared/TextField'
import { TIPOS_AUSENTISMO, TIPO_AUSENTISMO_LABEL } from '../../../types/sigp/horario'
import type { TipoAusentismo } from '../../../types/sigp/horario'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  puedeGestionar: boolean
  userUid: string | undefined
}

function extensionDe(file: File): string {
  const partes = file.name.split('.')
  return partes.length > 1 ? partes[partes.length - 1] : 'dat'
}

export default function AusentismoFormModal({ isOpen, onClose, onSaved, puedeGestionar, userUid }: Props) {
  const [empleadoNombre, setEmpleadoNombre] = useState('')
  const [tipo, setTipo] = useState<TipoAusentismo>('permiso')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [diagnostico, setDiagnostico] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setEmpleadoNombre(''); setTipo('permiso'); setFechaInicio(''); setFechaFin('')
    setDescripcion(''); setArchivo(null); setDetalleAbierto(false)
    setDiagnostico(''); setObservaciones('')
  }, [isOpen])

  const onArchivo = (e: ChangeEvent<HTMLInputElement>) => setArchivo(e.target.files?.[0] ?? null)

  const fechasValidas = fechaInicio !== '' && fechaFin !== '' && fechaFin >= fechaInicio
  const valido = empleadoNombre.trim() !== '' && fechasValidas && archivo !== null

  const guardar = async () => {
    if (!valido || !archivo) return
    setGuardando(true)
    try {
      const id = doc(collection(db, 'ausentismos')).id
      const archivoRef = ref(storage, `ausentismos/${id}/soporte/${crypto.randomUUID()}.${extensionDe(archivo)}`)
      await uploadBytes(archivoRef, archivo)
      const soporte_url = await getDownloadURL(archivoRef)
      const ahora = Timestamp.now()
      await setDoc(doc(db, 'ausentismos', id), {
        empleado_nombre: empleadoNombre.trim(),
        tipo,
        fecha_inicio: Timestamp.fromDate(new Date(fechaInicio + 'T12:00:00')),
        fecha_fin: Timestamp.fromDate(new Date(fechaFin + 'T12:00:00')),
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        soporte_url,
        estado: 'activo',
        registrado_por: userUid ?? '',
        fecha_creacion: ahora,
      })
      if (puedeGestionar && (diagnostico.trim() || observaciones.trim())) {
        await setDoc(doc(db, 'ausentismos', id, 'privado', 'detalle'), {
          ...(diagnostico.trim() ? { diagnostico: diagnostico.trim() } : {}),
          ...(observaciones.trim() ? { observaciones_medicas: observaciones.trim() } : {}),
        })
      }
      toast('Ausentismo registrado')
      onSaved()
      onClose()
    } catch {
      toast('Error al registrar el ausentismo', 'error')
    } finally { setGuardando(false) }
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Registrar ausentismo"
      onClose={onClose}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        { label: guardando ? 'Guardando…' : 'Guardar', onClick: guardar, variant: 'primary', loading: guardando, disabled: !valido },
      ]}
    >
      <div className="space-y-4">
        <TextField label="Nombre del empleado" value={empleadoNombre} onChange={setEmpleadoNombre}
          required placeholder="Nombre completo" />
        <SelectField label="Tipo" value={tipo} onChange={v => setTipo(v as TipoAusentismo)} required
          options={TIPOS_AUSENTISMO.map(t => ({ value: t, label: TIPO_AUSENTISMO_LABEL[t] }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">
            Fecha inicio <span className="text-red-500">*</span>
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <label className="text-xs text-gray-500">
            Fecha fin <span className="text-red-500">*</span>
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
        </div>
        {fechaInicio !== '' && fechaFin !== '' && fechaFin < fechaInicio && (
          <p className="text-xs text-red-600">La fecha fin no puede ser anterior a la fecha inicio.</p>
        )}
        <label className="block text-xs text-gray-500">
          Descripción (opcional)
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
            className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Soporte (PDF o imagen) <span className="text-red-500">*</span></span>
          <input type="file" accept=".pdf,image/*" onChange={onArchivo}
            className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
        </label>

        {puedeGestionar && (
          <div className="border-t border-gray-100 pt-3">
            <button type="button" onClick={() => setDetalleAbierto(v => !v)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1">
              {detalleAbierto ? '▲' : '▼'} Detalle médico (confidencial)
            </button>
            {detalleAbierto && (
              <div className="mt-3 space-y-3">
                <label className="block text-xs text-gray-500">
                  Diagnóstico
                  <textarea value={diagnostico} onChange={e => setDiagnostico(e.target.value)} rows={2}
                    className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                </label>
                <label className="block text-xs text-gray-500">
                  Observaciones médicas
                  <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
                    className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                </label>
                <p className="text-[11px] text-gray-400">Este detalle es confidencial — solo visible para roles con gestión de horario.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
