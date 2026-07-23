import { useState, useEffect } from 'react'
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import SelectField from '../../shared/SelectField'
import { toast } from '../../shared/Toast'
import { useAuth } from '../../../contexts/AuthContext'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import { useFirestore } from '../../../hooks/useFirestore'
import {
  TIPOS_VISITA, TIPO_VISITA_LABEL, SUBTIPOS_ESTACION, SUBTIPO_LABEL,
} from '../../../types/sigp/visita'
import type { TipoVisita, SubtipoEstacion, Ejecutor, Visita } from '../../../types/sigp/visita'
import type { Cliente } from '../../../types/sigp/cliente'
import type { Solicitud } from '../../../types/sigp/solicitud'

interface VisitaFormProps {
  isOpen: boolean
  onClose: () => void
  onGuardado: () => void
  clientes: Cliente[]
  /** Pipeline (23-jul): borrador `pendiente_agendar` a MATERIALIZAR — el form
   *  precarga sus datos y al Programar sobreescribe ESE doc (mismo id) con el
   *  VIS recién asignado. Sin borrador: flujo manual clásico. */
  borrador?: Visita | null
}

interface UsuarioNEG { id: string; nombre?: string; rol?: string; estado?: string }
interface ContratistaRef { id: string; nombre: string; estado?: string }

function hoyISO(): string { return new Date().toISOString().slice(0, 10) }

interface FormState {
  tipo: TipoVisita
  subtipo: SubtipoEstacion
  solicitudId: string
  clienteId: string
  prospectoNombre: string
  sitio: string
  fechaProgramada: string
  ejecutorTipo: 'neg' | 'contratista'
  ejecutorUid: string
  ejecutorContratistaId: string
}

const inicial = (uid: string): FormState => ({
  tipo: 'estacion_base', subtipo: 'greenfield',
  solicitudId: '', clienteId: '', prospectoNombre: '', sitio: '',
  fechaProgramada: hoyISO(),
  ejecutorTipo: 'neg', ejecutorUid: uid, ejecutorContratistaId: '',
})

interface Pendiente { visitaId: string; consecutivo: string }

export default function VisitaForm({ isOpen, onClose, onGuardado, clientes, borrador = null }: VisitaFormProps) {
  const { user } = useAuth()
  const { obtener } = useConsecutivo()
  const { getAll } = useFirestore()

  const [form, setForm] = useState<FormState>(inicial(''))
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [contratistas, setContratistas] = useState<ContratistaRef[]>([])
  const [usuariosNEG, setUsuariosNEG] = useState<UsuarioNEG[]>([])

  useEffect(() => {
    if (!isOpen) return
    // Precarga: del borrador del pipeline (editable) o formulario limpio.
    setForm(borrador ? {
      ...inicial(user?.uid ?? ''),
      tipo: borrador.tipo, subtipo: borrador.subtipo ?? 'greenfield',
      solicitudId: borrador.solicitud_id ?? '',
      clienteId: borrador.cliente_id ?? '',
      prospectoNombre: borrador.prospecto_nombre ?? '',
      sitio: borrador.sitio ?? '',
    } : inicial(user?.uid ?? ''))
    setErrores({})
    setPendiente(null)
    ;(async () => {
      try {
        const [sols, contr, users] = await Promise.all([
          getAll('solicitudes'),
          getAll('contratistas'),
          getAll('users'),
        ])
        setSolicitudes((sols as Solicitud[]).filter(s => s.estado === 'requiere_visita' || s.id === borrador?.solicitud_id))
        setContratistas((contr as ContratistaRef[]).filter(c => c.estado === 'activo'))
        setUsuariosNEG((users as UsuarioNEG[]).filter(
          u => u.rol && u.rol !== 'tecnico' && u.rol !== 'contratista' && u.estado === 'activo',
        ))
      } catch {
        toast('Error al cargar opciones del formulario', 'error')
      }
    })()
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrores(e => ({ ...e, [k]: '', origen: '', ejecutor: '' }))
  }

  const clienteNombres = Object.fromEntries(clientes.map(c => [c.id, c.nombre]))
  const solVinculada = solicitudes.find(s => s.id === form.solicitudId) || null

  // Al vincular una solicitud, se copian cliente/prospecto/sitio (denormalización).
  const onSolicitud = (id: string) => {
    const s = solicitudes.find(x => x.id === id)
    setForm(f => ({
      ...f,
      solicitudId: id,
      clienteId: s?.cliente_id ?? '',
      prospectoNombre: s?.prospecto_nombre ?? '',
      sitio: s?.nombre_sitio ?? s?.sitio ?? f.sitio,   // Bloque 1: el canónico primero
    }))
    setErrores(e => ({ ...e, origen: '' }))
  }

  const validar = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.solicitudId && !form.clienteId && !form.prospectoNombre.trim())
      e.origen = 'Vincula una solicitud, o indica cliente o prospecto'
    const y = new Date(form.fechaProgramada).getFullYear()
    if (!form.fechaProgramada || Number.isNaN(y) || y < 1900 || y > 9999)
      e.fechaProgramada = 'Fecha inválida'
    if (form.ejecutorTipo === 'neg' && !form.ejecutorUid) e.ejecutor = 'Elige el ejecutor NEG'
    if (form.ejecutorTipo === 'contratista' && !form.ejecutorContratistaId) e.ejecutor = 'Elige el contratista'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const construirEjecutor = (): Ejecutor => {
    if (form.ejecutorTipo === 'contratista') {
      const c = contratistas.find(x => x.id === form.ejecutorContratistaId)
      return { tipo: 'contratista', contratista_id: form.ejecutorContratistaId, ...(c?.nombre ? { nombre: c.nombre } : {}) }
    }
    const u = usuariosNEG.find(x => x.id === form.ejecutorUid)
    return { tipo: 'neg', uid: form.ejecutorUid, ...(u?.nombre ? { nombre: u.nombre } : {}) }
  }

  const construirDoc = (consecutivo: string) => {
    const ahora = Timestamp.now()
    const d: Record<string, unknown> = {
      consecutivo,
      tipo: form.tipo,
      fecha_programada: Timestamp.fromDate(new Date(form.fechaProgramada)),
      ejecutor: construirEjecutor(),
      registrada_por: user?.uid ?? '',
      estado: 'programada',
      checklist: [],
      hallazgos: [],
      cantidades: [],
      adjuntos: [],
      historial: borrador
        ? [...borrador.historial, { de: 'pendiente_agendar', a: 'programada', por: user?.uid ?? '', fecha: ahora }]
        : [{ de: null, a: 'programada', por: user?.uid ?? '', fecha: ahora }],
      fecha_creacion: borrador?.fecha_creacion ?? ahora,
    }
    if (form.tipo === 'estacion_base') d.subtipo = form.subtipo
    if (form.solicitudId) d.solicitud_id = form.solicitudId
    if (form.clienteId) d.cliente_id = form.clienteId
    if (form.prospectoNombre.trim()) d.prospecto_nombre = form.prospectoNombre.trim()
    if (form.sitio.trim()) d.sitio = form.sitio.trim()
    return d
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setGuardando(true)
    let visitaId = pendiente?.visitaId ?? borrador?.id
    let consecutivo = pendiente?.consecutivo
    try {
      if (!visitaId) visitaId = doc(collection(db, 'visitas')).id
      if (!consecutivo) consecutivo = await obtener('VIS') // se quema aquí
      await setDoc(doc(db, 'visitas', visitaId), construirDoc(consecutivo))
      setPendiente(null)
      toast(`Visita programada — ${consecutivo}`)
      onGuardado()
      onClose()
    } catch (err) {
      console.error('Error programando visita:', err)
      if (consecutivo && visitaId) {
        setPendiente({ visitaId, consecutivo })
        toast(`Se generó ${consecutivo} pero falló el guardado. Reintenta para no perder el número.`, 'error')
      } else {
        toast('Error al programar la visita', 'error')
      }
    } finally {
      setGuardando(false)
    }
  }

  const handleClose = () => {
    if (pendiente && !window.confirm(
      `Se generó el consecutivo ${pendiente.consecutivo} y no se ha guardado. Si cierras, ese número quedará sin usar. ¿Cerrar de todos modos?`
    )) return
    onClose()
  }

  const origenBloqueado = !!form.solicitudId  // heredado de la solicitud

  return (
    <Modal
      isOpen={isOpen}
      title="Programar visita técnica"
      onClose={handleClose}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: handleClose, variant: 'secondary' },
        { label: pendiente ? 'Reintentar guardado' : 'Programar', onClick: handleGuardar, variant: 'primary', loading: guardando },
      ]}
    >
      <div className="space-y-4">
        {pendiente && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
            El consecutivo <span className="font-semibold">{pendiente.consecutivo}</span> ya se generó
            pero el guardado falló. Al reintentar se reutiliza (no se genera otro).
          </div>
        )}

        {/* Tipo + subtipo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Tipo de visita"
            value={form.tipo}
            onChange={v => set('tipo', v as TipoVisita)}
            options={TIPOS_VISITA.map(t => ({ value: t, label: TIPO_VISITA_LABEL[t] }))}
            required
          />
          {form.tipo === 'estacion_base' && (
            <SelectField
              label="Subtipo"
              value={form.subtipo}
              onChange={v => set('subtipo', v as SubtipoEstacion)}
              options={SUBTIPOS_ESTACION.map(s => ({ value: s, label: SUBTIPO_LABEL[s] }))}
              required
            />
          )}
        </div>

        {/* Origen: solicitud vinculada o cliente/prospecto */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Origen</p>
          <SelectField
            label="Vincular solicitud (en «requiere visita»)"
            value={form.solicitudId}
            onChange={onSolicitud}
            options={[
              { value: '', label: '— Sin solicitud (visita general) —' },
              ...solicitudes.map(s => ({
                value: s.id,
                label: `${s.consecutivo} · ${s.cliente_id ? (clienteNombres[s.cliente_id] ?? 'cliente') : (s.prospecto_nombre ?? '—')}`,
              })),
            ]}
          />
          {solVinculada && (
            <p className="text-xs text-brand-700">
              Cliente/prospecto y sitio se toman de {solVinculada.consecutivo}.
            </p>
          )}
          <SelectField
            label="Cliente"
            value={form.clienteId}
            onChange={v => set('clienteId', v)}
            options={[
              { value: '', label: '— Prospecto (sin registro) —' },
              ...clientes.map(c => ({ value: c.id, label: c.nombre })),
            ]}
            disabled={origenBloqueado}
          />
          {!form.clienteId && (
            <TextField
              label="Nombre del prospecto"
              value={form.prospectoNombre}
              onChange={v => set('prospectoNombre', v)}
              error={errores.origen}
              disabled={origenBloqueado}
              required
            />
          )}
          {form.clienteId && errores.origen && <p className="text-xs text-red-600">{errores.origen}</p>}
        </div>

        {/* Sitio + fecha */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Sitio / ubicación"
            value={form.sitio}
            onChange={v => set('sitio', v)}
            disabled={origenBloqueado}
            hint={origenBloqueado ? 'Tomado de la solicitud' : 'Dónde es la visita'}
          />
          <TextField
            label="Fecha programada"
            type="date"
            value={form.fechaProgramada}
            onChange={v => set('fechaProgramada', v)}
            error={errores.fechaProgramada}
            required
          />
        </div>

        {/* Ejecutor */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Ejecutor</p>
          <SelectField
            label="Realiza la visita"
            value={form.ejecutorTipo}
            onChange={v => set('ejecutorTipo', v as 'neg' | 'contratista')}
            options={[
              { value: 'neg', label: 'Personal NEG' },
              { value: 'contratista', label: 'Contratista' },
            ]}
          />
          {form.ejecutorTipo === 'neg' ? (
            <SelectField
              label="Persona NEG"
              value={form.ejecutorUid}
              onChange={v => set('ejecutorUid', v)}
              options={[
                { value: '', label: '— Elegir —' },
                ...usuariosNEG.map(u => ({ value: u.id, label: u.nombre || u.id })),
              ]}
              error={errores.ejecutor}
              required
            />
          ) : (
            <SelectField
              label="Contratista (activo)"
              value={form.ejecutorContratistaId}
              onChange={v => set('ejecutorContratistaId', v)}
              options={[
                { value: '', label: '— Elegir —' },
                ...contratistas.map(c => ({ value: c.id, label: c.nombre })),
              ]}
              error={errores.ejecutor}
              required
            />
          )}
          {form.ejecutorTipo === 'contratista' && (
            <p className="text-xs text-gray-400">
              El material que envíe el contratista lo registra NEG en la ejecución (evidencia centralizada).
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
