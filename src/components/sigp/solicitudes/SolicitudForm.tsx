import { useState, useEffect } from 'react'
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import SelectField from '../../shared/SelectField'
import { toast } from '../../shared/Toast'
import { useAuth } from '../../../contexts/AuthContext'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import { CANALES, CANAL_LABEL } from '../../../types/sigp/solicitud'
import type { Canal, Adjunto } from '../../../types/sigp/solicitud'
import type { Cliente } from '../../../types/sigp/cliente'

interface SolicitudFormProps {
  isOpen: boolean
  onClose: () => void
  onGuardado: () => void
  clientes: Cliente[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FormState {
  clienteId: string
  prospectoNombre: string
  contactoNombre: string
  contactoCargo: string
  contactoEmail: string
  contactoTelefono: string
  canal: Canal
  descripcion: string
  sitio: string
  fechaRecepcion: string
}

const inicial = (): FormState => ({
  clienteId: '', prospectoNombre: '',
  contactoNombre: '', contactoCargo: '', contactoEmail: '', contactoTelefono: '',
  canal: 'correo', descripcion: '', sitio: '', fechaRecepcion: hoyISO(),
})

/** Datos de un intento previo cuyo consecutivo ya se generó (para reintentar sin quemar otro). */
interface Pendiente {
  solicitudId: string
  consecutivo: string
  adjuntos: Adjunto[]
}

async function subirAdjuntos(solicitudId: string, archivos: File[]): Promise<Adjunto[]> {
  const out: Adjunto[] = []
  for (const f of archivos) {
    const nombre = f.name.replace(/[^\w.\-]/g, '_')
    const snap = await uploadBytes(ref(storage, `solicitudes/${solicitudId}/${nombre}`), f)
    const url = await getDownloadURL(snap.ref)
    const adj: Adjunto = { nombre: f.name, url, tamano: f.size, subido_en: Timestamp.now() }
    if (f.type) adj.content_type = f.type
    out.push(adj)
  }
  return out
}

export default function SolicitudForm({ isOpen, onClose, onGuardado, clientes }: SolicitudFormProps) {
  const { user } = useAuth()
  const { obtener } = useConsecutivo()
  const [form, setForm] = useState<FormState>(inicial)
  const [archivos, setArchivos] = useState<File[]>([])
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)

  useEffect(() => {
    if (isOpen) {
      setForm(inicial())
      setArchivos([])
      setErrores({})
      setPendiente(null)
    }
  }, [isOpen])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrores(e => ({ ...e, [k]: '' }))
  }

  const validar = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.clienteId && !form.prospectoNombre.trim())
      e.origen = 'Indica un cliente o el nombre del prospecto'
    if (!form.contactoNombre.trim()) e.contactoNombre = 'Requerido'
    if (form.contactoEmail.trim() && !EMAIL_RE.test(form.contactoEmail.trim()))
      e.contactoEmail = 'Correo inválido'
    if (!form.descripcion.trim() || form.descripcion.trim().length < 5)
      e.descripcion = 'Describe la solicitud (mínimo 5 caracteres)'
    const y = new Date(form.fechaRecepcion).getFullYear()
    if (!form.fechaRecepcion || Number.isNaN(y) || y < 1900 || y > 9999)
      e.fechaRecepcion = 'Fecha inválida'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const construirDoc = (consecutivo: string, adjuntos: Adjunto[]) => {
    const ahora = Timestamp.now()
    const doc_: Record<string, unknown> = {
      consecutivo,
      contacto: {
        nombre: form.contactoNombre.trim(),
        ...(form.contactoCargo.trim() ? { cargo: form.contactoCargo.trim() } : {}),
        ...(form.contactoEmail.trim() ? { email: form.contactoEmail.trim() } : {}),
        ...(form.contactoTelefono.trim() ? { telefono: form.contactoTelefono.trim() } : {}),
      },
      canal: form.canal,
      descripcion: form.descripcion.trim(),
      fecha_recepcion: Timestamp.fromDate(new Date(form.fechaRecepcion)),
      responsable: user?.uid ?? '',
      estado: 'recibida',
      historial: [{ de: null, a: 'recibida', por: user?.uid ?? '', fecha: ahora }],
      adjuntos,
      fecha_creacion: ahora,
    }
    if (form.clienteId) doc_.cliente_id = form.clienteId
    if (form.prospectoNombre.trim()) doc_.prospecto_nombre = form.prospectoNombre.trim()
    if (form.sitio.trim()) doc_.sitio = form.sitio.trim()
    return doc_
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setGuardando(true)

    // Reutilizar lo ya generado en un intento previo (evita quemar otro consecutivo).
    let solicitudId = pendiente?.solicitudId
    let consecutivo = pendiente?.consecutivo
    let adjuntos = pendiente?.adjuntos

    try {
      if (!solicitudId) solicitudId = doc(collection(db, 'solicitudes')).id
      if (!adjuntos) adjuntos = await subirAdjuntos(solicitudId, archivos)
      // A partir de aquí se quema el consecutivo: cualquier fallo posterior lo preserva.
      if (!consecutivo) consecutivo = await obtener('SOL')

      await setDoc(doc(db, 'solicitudes', solicitudId), construirDoc(consecutivo, adjuntos))
      setPendiente(null)
      toast(`Solicitud registrada — ${consecutivo}`)
      onGuardado()
      onClose()
    } catch (err) {
      console.error('Error registrando solicitud:', err)
      if (consecutivo && solicitudId) {
        // El consecutivo ya se generó: preservarlo para reintentar sin perder el número.
        setPendiente({ solicitudId, consecutivo, adjuntos: adjuntos ?? [] })
        toast(`Se generó ${consecutivo} pero falló el guardado. Reintenta para no perder el número.`, 'error')
      } else {
        toast('Error al registrar la solicitud', 'error')
      }
    } finally {
      setGuardando(false)
    }
  }

  // Cierre con aviso si hay un consecutivo pendiente sin guardar.
  const handleClose = () => {
    if (pendiente && !window.confirm(
      `Se generó el consecutivo ${pendiente.consecutivo} y no se ha guardado. Si cierras, ese número quedará sin usar. ¿Cerrar de todos modos?`
    )) return
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Nueva solicitud"
      onClose={handleClose}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: handleClose, variant: 'secondary' },
        {
          label: pendiente ? 'Reintentar guardado' : 'Registrar',
          onClick: handleGuardar,
          variant: 'primary',
          loading: guardando,
        },
      ]}
    >
      <div className="space-y-4">
        {pendiente && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
            El consecutivo <span className="font-semibold">{pendiente.consecutivo}</span> ya se generó
            pero el guardado falló. Al reintentar se reutiliza (no se genera otro número).
          </div>
        )}

        {/* Origen: cliente registrado o prospecto */}
        <div className="space-y-2">
          <SelectField
            label="Cliente"
            value={form.clienteId}
            onChange={v => set('clienteId', v)}
            options={[
              { value: '', label: '— Prospecto (sin registro) —' },
              ...clientes.map(c => ({ value: c.id, label: c.nombre })),
            ]}
          />
          {!form.clienteId && (
            <TextField
              label="Nombre del prospecto"
              value={form.prospectoNombre}
              onChange={v => set('prospectoNombre', v)}
              error={errores.origen}
              placeholder="Empresa o persona que solicita"
              required
            />
          )}
        </div>

        {/* Contacto */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Contacto</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField label="Nombre" value={form.contactoNombre} onChange={v => set('contactoNombre', v)} error={errores.contactoNombre} required />
            <TextField label="Cargo" value={form.contactoCargo} onChange={v => set('contactoCargo', v)} />
            <TextField label="Correo" value={form.contactoEmail} onChange={v => set('contactoEmail', v)} error={errores.contactoEmail} />
            <TextField label="Teléfono" value={form.contactoTelefono} onChange={v => set('contactoTelefono', v)} />
          </div>
        </div>

        {/* Datos de la solicitud */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Canal"
            value={form.canal}
            onChange={v => set('canal', v as Canal)}
            options={CANALES.map(c => ({ value: c, label: CANAL_LABEL[c] }))}
            required
          />
          <TextField
            label="Fecha de recepción"
            type="date"
            value={form.fechaRecepcion}
            onChange={v => set('fechaRecepcion', v)}
            error={errores.fechaRecepcion}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Descripción <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            rows={3}
            placeholder="Qué solicita el cliente…"
            className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 ${
              errores.descripcion ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {errores.descripcion && <p className="text-xs text-red-600">{errores.descripcion}</p>}
        </div>

        <TextField
          label="Sitio / ubicación"
          value={form.sitio}
          onChange={v => set('sitio', v)}
          hint="Opcional — dónde se ejecutaría"
        />

        {/* Adjuntos */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Adjuntos</label>
          <input
            type="file"
            multiple
            onChange={e => setArchivos(Array.from(e.target.files ?? []))}
            className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100"
          />
          {archivos.length > 0 && (
            <p className="text-xs text-gray-500">{archivos.length} archivo(s) seleccionado(s)</p>
          )}
          <p className="text-xs text-gray-400">Opcional. Correos, planos, referencias.</p>
        </div>
      </div>
    </Modal>
  )
}
