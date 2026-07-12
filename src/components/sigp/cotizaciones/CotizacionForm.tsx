import { useState, useEffect } from 'react'
import { collection, doc, writeBatch, getDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import SelectField from '../../shared/SelectField'
import { toast } from '../../shared/Toast'
import { useAuth } from '../../../contexts/AuthContext'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import { useFirestore } from '../../../hooks/useFirestore'
import { ESQUEMAS, ESQUEMA_LABEL, calcularTotales, TIPOS_INVERSION, TIPO_INVERSION_LABEL } from '../../../types/sigp/cotizacion'
import type { EsquemaTributario, ConfigAIU, CondicionesCotizacion, TipoInversion } from '../../../types/sigp/cotizacion'
import type { Cliente } from '../../../types/sigp/cliente'
import type { Solicitud } from '../../../types/sigp/solicitud'

interface CotizacionFormProps {
  isOpen: boolean
  onClose: () => void
  onGuardado: () => void
  clientes: Cliente[]
}

interface FormState {
  asunto: string
  solicitudId: string
  clienteId: string
  prospectoNombre: string
  esLicitacion: boolean
  tipoInversion: TipoInversion | ''
  esquema: EsquemaTributario
  aiuAdmin: string
  aiuImprev: string
  aiuUtil: string
  ivaPct: string
  formaPago: string
  validezDias: string
  tiempoEjecucion: string
  garantia: string
  observaciones: string
}

const inicial = (): FormState => ({
  asunto: '', solicitudId: '', clienteId: '', prospectoNombre: '', esLicitacion: false, tipoInversion: '',
  esquema: 'iva_pleno', aiuAdmin: '9', aiuImprev: '5', aiuUtil: '4', ivaPct: '19',
  formaPago: '', validezDias: '30', tiempoEjecucion: '', garantia: '', observaciones: '',
})

interface Pendiente { id: string; consecutivo: string }

export default function CotizacionForm({ isOpen, onClose, onGuardado, clientes }: CotizacionFormProps) {
  const { user } = useAuth()
  const { obtener } = useConsecutivo()
  const { getAll, update } = useFirestore()
  const [form, setForm] = useState<FormState>(inicial)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])

  useEffect(() => {
    if (!isOpen) return
    setForm(inicial()); setErrores({}); setPendiente(null)
    getAll('solicitudes')
      .then(s => setSolicitudes((s as Solicitud[]).filter(x => x.estado === 'lista_para_cotizar')))
      .catch(() => toast('Error al cargar solicitudes', 'error'))
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrores(e => ({ ...e, [k]: '', origen: '' }))
  }

  const clienteNombres = Object.fromEntries(clientes.map(c => [c.id, c.nombre]))
  const solVinculada = solicitudes.find(s => s.id === form.solicitudId) || null

  /** Pre-sugerir esquema + AIU desde las condiciones comerciales del cliente. */
  const aplicarDefaultsCliente = (clienteId: string, base: FormState): FormState => {
    const c = clientes.find(x => x.id === clienteId)
    const cc = c?.condiciones_comerciales
    const aiu = cc?.aiu_defaults
    return {
      ...base,
      esquema: cc?.esquema_impuestos ?? 'iva_pleno',
      aiuAdmin: String(aiu?.admin ?? 9),
      aiuImprev: String(aiu?.imprevistos ?? 5),
      aiuUtil: String(aiu?.utilidad ?? 4),
    }
  }

  const onSolicitud = (id: string) => {
    const s = solicitudes.find(x => x.id === id)
    setForm(f => {
      let next: FormState = { ...f, solicitudId: id, clienteId: s?.cliente_id ?? '', prospectoNombre: s?.prospecto_nombre ?? '' }
      if (s?.cliente_id) next = aplicarDefaultsCliente(s.cliente_id, next)
      return next
    })
    setErrores(e => ({ ...e, origen: '' }))
  }

  const onCliente = (id: string) => {
    setForm(f => (id ? aplicarDefaultsCliente(id, { ...f, clienteId: id }) : { ...f, clienteId: id }))
    setErrores(e => ({ ...e, origen: '' }))
  }

  const origenBloqueado = !!form.solicitudId

  const isPct = (v: string) => { const n = Number(v); return v.trim() !== '' && n >= 0 && n <= 100 }

  const validar = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.asunto.trim()) e.asunto = 'El asunto es obligatorio'
    if (!form.solicitudId && !form.clienteId && !form.prospectoNombre.trim())
      e.origen = 'Vincula una solicitud, o indica cliente o prospecto'
    if (!isPct(form.ivaPct)) e.ivaPct = '0–100'
    if (!form.validezDias.trim() || Number(form.validezDias) <= 0) e.validezDias = 'Días > 0'
    if (form.esquema === 'aiu' && (!isPct(form.aiuAdmin) || !isPct(form.aiuImprev) || !isPct(form.aiuUtil)))
      e.aiu = 'Porcentajes 0–100'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setGuardando(true)
    let cotizacionId = pendiente?.id
    let consecutivo = pendiente?.consecutivo
    try {
      if (!cotizacionId) cotizacionId = doc(collection(db, 'cotizaciones')).id
      if (!consecutivo) consecutivo = await obtener('COT') // se quema aquí

      const uid = user?.uid ?? ''
      const ahora = Timestamp.now()
      const aiu: ConfigAIU | undefined = form.esquema === 'aiu'
        ? { admin: Number(form.aiuAdmin), imprevistos: Number(form.aiuImprev), utilidad: Number(form.aiuUtil) }
        : undefined
      const condiciones: CondicionesCotizacion = {
        forma_pago: form.formaPago.trim(),
        validez_dias: Number(form.validezDias),
        tiempo_ejecucion: form.tiempoEjecucion.trim(),
        garantia: form.garantia.trim(),
        moneda: 'COP',
        ...(form.observaciones.trim() ? { observaciones: form.observaciones.trim() } : {}),
      }
      const totales = calcularTotales([], form.esquema, aiu, Number(form.ivaPct))

      const versionData: Record<string, unknown> = {
        version: 1, esquema: form.esquema, iva_pct: Number(form.ivaPct),
        items: [], condiciones, totales, creada_por: uid, fecha_creacion: ahora,
      }
      if (aiu) versionData.aiu = aiu

      const parentData: Record<string, unknown> = {
        consecutivo, asunto: form.asunto.trim(), es_licitacion: form.esLicitacion, estado: 'borrador',
        version_activa: 1, total: 0, validez_dias: Number(form.validezDias),
        adjuntos: [], historial: [{ de: null, a: 'borrador', por: uid, fecha: ahora }],
        registrada_por: uid, fecha_creacion: ahora,
      }
      if (form.clienteId) parentData.cliente_id = form.clienteId
      if (form.prospectoNombre.trim()) parentData.prospecto_nombre = form.prospectoNombre.trim()
      if (form.solicitudId) parentData.solicitud_id = form.solicitudId
      if (form.tipoInversion) parentData.tipo_inversion = form.tipoInversion

      const batch = writeBatch(db)
      batch.set(doc(db, 'cotizaciones', cotizacionId), parentData)
      batch.set(doc(db, 'cotizaciones', cotizacionId, 'versiones', '1'), versionData)
      await batch.commit()

      // Transición cruzada: la solicitud vinculada en lista_para_cotizar → cotizada.
      if (form.solicitudId) {
        const sSnap = await getDoc(doc(db, 'solicitudes', form.solicitudId))
        if (sSnap.exists() && sSnap.data().estado === 'lista_para_cotizar') {
          await update('solicitudes', form.solicitudId, {
            estado: 'cotizada',
            historial: arrayUnion({
              de: 'lista_para_cotizar', a: 'cotizada', por: uid, fecha: ahora,
              motivo: `Cotización ${consecutivo} creada`,
            }),
          })
        }
      }

      setPendiente(null)
      toast(`Cotización creada — ${consecutivo}`)
      onGuardado()
      onClose()
    } catch (err) {
      console.error('Error creando cotización:', err)
      if (consecutivo && cotizacionId) {
        setPendiente({ id: cotizacionId, consecutivo })
        toast(`Se generó ${consecutivo} pero falló el guardado. Reintenta para no perder el número.`, 'error')
      } else {
        toast('Error al crear la cotización', 'error')
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

  return (
    <Modal
      isOpen={isOpen}
      title="Nueva cotización"
      onClose={handleClose}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: handleClose, variant: 'secondary' },
        { label: pendiente ? 'Reintentar guardado' : 'Crear', onClick: handleGuardar, variant: 'primary', loading: guardando },
      ]}
    >
      <div className="space-y-4">
        {pendiente && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
            El consecutivo <span className="font-semibold">{pendiente.consecutivo}</span> ya se generó pero el guardado falló. Al reintentar se reutiliza.
          </div>
        )}

        {/* Asunto (campo de la plantilla CM-FT-CT-19) */}
        <TextField label="Asunto" value={form.asunto} onChange={v => set('asunto', v)}
          placeholder="Ej: Adecuaciones estación Ráquira" error={errores.asunto} required />

        {/* Origen */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Origen</p>
          <SelectField
            label="Vincular solicitud (en «lista para cotizar»)"
            value={form.solicitudId}
            onChange={onSolicitud}
            options={[
              { value: '', label: '— Sin solicitud (cotización directa) —' },
              ...solicitudes.map(s => ({ value: s.id, label: `${s.consecutivo} · ${s.cliente_id ? (clienteNombres[s.cliente_id] ?? 'cliente') : (s.prospecto_nombre ?? '—')}` })),
            ]}
          />
          {solVinculada && <p className="text-xs text-brand-700">Cliente/prospecto se toman de {solVinculada.consecutivo}. Al crear, pasará a «cotizada».</p>}
          <SelectField
            label="Cliente"
            value={form.clienteId}
            onChange={onCliente}
            options={[{ value: '', label: '— Prospecto (sin registro) —' }, ...clientes.map(c => ({ value: c.id, label: c.nombre }))]}
            disabled={origenBloqueado}
          />
          {!form.clienteId && (
            <TextField label="Nombre del prospecto" value={form.prospectoNombre} onChange={v => set('prospectoNombre', v)} error={errores.origen} disabled={origenBloqueado} required />
          )}
          {form.clienteId && errores.origen && <p className="text-xs text-red-600">{errores.origen}</p>}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.esLicitacion} onChange={e => set('esLicitacion', e.target.checked)} className="w-4 h-4 accent-brand-700" />
            Es licitación (el documento final es externo, se adjunta)
          </label>
          <SelectField
            label="Tipo de inversión (contratos tipo Claro — opcional)"
            value={form.tipoInversion}
            onChange={v => set('tipoInversion', v as TipoInversion | '')}
            options={[
              { value: '', label: '— Sin clasificar —' },
              ...TIPOS_INVERSION.map(t => ({ value: t, label: TIPO_INVERSION_LABEL[t] })),
            ]}
          />
        </div>

        {/* Esquema tributario */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Esquema tributario <span className="text-xs font-normal text-gray-400">(sugerido del cliente, editable)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField label="Esquema" value={form.esquema} onChange={v => set('esquema', v as EsquemaTributario)}
              options={ESQUEMAS.map(e => ({ value: e, label: ESQUEMA_LABEL[e] }))} />
            <TextField label="IVA %" type="number" value={form.ivaPct} onChange={v => set('ivaPct', v)} error={errores.ivaPct} />
          </div>
          {form.esquema === 'aiu' && (
            <div>
              <label className="text-xs font-medium text-gray-600">AIU % (Admin / Imprevistos / Utilidad)</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <input type="number" value={form.aiuAdmin} onChange={e => set('aiuAdmin', e.target.value)} placeholder="Admin" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                <input type="number" value={form.aiuImprev} onChange={e => set('aiuImprev', e.target.value)} placeholder="Imprev." className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                <input type="number" value={form.aiuUtil} onChange={e => set('aiuUtil', e.target.value)} placeholder="Utilidad" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </div>
              {errores.aiu && <p className="text-xs text-red-600 mt-1">{errores.aiu}</p>}
              <p className="text-[11px] text-gray-400 mt-1">El IVA aplica solo sobre la Utilidad.</p>
            </div>
          )}
        </div>

        {/* Condiciones comerciales */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Condiciones comerciales</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField label="Validez (días)" type="number" value={form.validezDias} onChange={v => set('validezDias', v)} error={errores.validezDias} />
            <TextField label="Forma de pago" value={form.formaPago} onChange={v => set('formaPago', v)} placeholder="Ej: 50% anticipo, 50% contra entrega" />
            <TextField label="Tiempo de ejecución" value={form.tiempoEjecucion} onChange={v => set('tiempoEjecucion', v)} />
            <TextField label="Garantía" value={form.garantia} onChange={v => set('garantia', v)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Observaciones / exclusiones</label>
            <textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} rows={2}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          <p className="text-xs text-gray-400">Los ítems y totales se construyen en el detalle de la cotización.</p>
        </div>
      </div>
    </Modal>
  )
}
