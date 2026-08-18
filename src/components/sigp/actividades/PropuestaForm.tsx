// src/components/sigp/actividades/PropuestaForm.tsx
//
// Modal de EMISIÓN de la propuesta económica (F1.2) — v1 de una serie nueva
// o re-emisión (versión n+1 del MISMO consecutivo). El consecutivo PEA se
// quema SOLO en la v1 (contigüidad ISO, con preservación ante fallo: si el
// batch falla tras quemar el número, se conserva y el reintento NO quema
// otro — patrón SOL/VIS/COT). La emisión completa la hace
// emitirVersionPropuesta (PDF + hash + Storage + batch atómico).
import { useMemo, useState } from 'react'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import { toast } from '../../shared/Toast'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import { emitirVersionPropuesta } from '../../../utils/sigp/propuestaActividad'
import { construirFotoPropuesta, VALIDEZ_DIAS_DEFAULT } from '../../../types/sigp/propuestaActividad'
import type { PropuestaActividad } from '../../../types/sigp/propuestaActividad'
import { PRESETS_FORMA_PAGO, PRESETS_TIEMPO_EJECUCION, PRESETS_GARANTIA, OBSERVACIONES_BASE } from '../../../types/sigp/cotizacion'
import { fmtMoney } from '../../../utils/sigp/formato'
import type { Actividad } from '../../../types/sigp/actividad'
import type { Cliente } from '../../../types/sigp/cliente'

interface PropuestaFormProps {
  isOpen: boolean
  onClose: () => void
  cliente: Cliente
  /** El conjunto de ESTA emisión (la selección de la página). */
  actividades: Actividad[]
  /** Vigente de la serie al RE-EMITIR; ausente = serie nueva (v1). */
  reemitirDe?: PropuestaActividad
  firmante: { nombre: string; correo?: string; celular?: string }
  uid: string
  onEmitida: (p: PropuestaActividad) => void
}

const datalist = (id: string, opciones: string[]) => (
  <datalist id={id}>{opciones.map(o => <option key={o} value={o} />)}</datalist>
)

export default function PropuestaForm({ isOpen, onClose, cliente, actividades, reemitirDe, firmante, uid, onEmitida }: PropuestaFormProps) {
  const { obtener } = useConsecutivo()

  const [asunto, setAsunto] = useState(reemitirDe?.asunto ?? '')
  const [formaPago, setFormaPago] = useState(reemitirDe?.condiciones.forma_pago ?? '')
  const [validez, setValidez] = useState(String(reemitirDe?.condiciones.validez_dias ?? VALIDEZ_DIAS_DEFAULT))
  const [tiempoEjec, setTiempoEjec] = useState(reemitirDe?.condiciones.tiempo_ejecucion ?? '')
  const [garantia, setGarantia] = useState(reemitirDe?.condiciones.garantia ?? '')
  const [observaciones, setObservaciones] = useState(reemitirDe?.observaciones ?? OBSERVACIONES_BASE)
  const [emitiendo, setEmitiendo] = useState(false)
  // Preservación del consecutivo ante fallo posterior: no se quema otro.
  const [consecutivoReservado, setConsecutivoReservado] = useState<string | null>(null)

  const foto = useMemo(
    () => construirFotoPropuesta(actividades, cliente, reemitirDe?.consecutivo),
    [actividades, cliente, reemitirDe],
  )

  const valido = !!foto && asunto.trim().length > 0 && Number(validez) > 0

  const emitir = async () => {
    if (!valido || emitiendo) return
    setEmitiendo(true)
    try {
      let consecutivo = reemitirDe?.consecutivo ?? consecutivoReservado
      if (!consecutivo) {
        consecutivo = await obtener('PEA')
        setConsecutivoReservado(consecutivo)
      }
      const p = await emitirVersionPropuesta({
        consecutivo,
        ...(reemitirDe ? { reemplazaA: reemitirDe } : {}),
        cliente,
        actividades,
        asunto: asunto.trim(),
        condiciones: {
          forma_pago: formaPago.trim(),
          validez_dias: Number(validez) || VALIDEZ_DIAS_DEFAULT,
          tiempo_ejecucion: tiempoEjec.trim(),
          garantia: garantia.trim(),
          moneda: 'COP',
        },
        ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
        firmante,
        uid,
      })
      toast(`Propuesta ${p.consecutivo}${p.version > 1 ? ` v${p.version}` : ''} emitida`)
      setConsecutivoReservado(null)
      onEmitida(p)
    } catch (e) {
      console.error('PropuestaForm.emitir', e)
      toast('No se pudo emitir la propuesta — el número quedó reservado, reintenta', 'error')
    } finally { setEmitiendo(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg"
      title={reemitirDe ? `Re-emitir ${reemitirDe.consecutivo} (versión ${reemitirDe.version + 1})` : 'Emitir propuesta económica'}>
      <div className="space-y-4">
        {!foto && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
            El conjunto seleccionado no es proponible: toda actividad debe estar valorizada, sin anular
            y sin otra propuesta vigente que ya la cubra.
          </div>
        )}

        {foto && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 space-y-1">
            <p className="font-medium text-gray-700">{actividades.length} actividad{actividades.length === 1 ? '' : 'es'} · total {fmtMoney(foto.totales.total)}</p>
            <ul className="text-xs space-y-0.5">
              {foto.grupos.map(g => <li key={g.id} className="truncate">· {g.nombre}</li>)}
            </ul>
            {reemitirDe && (
              <p className="text-xs text-gray-400 pt-1">
                La v{reemitirDe.version} pasa a histórica (se conserva con su PDF); las actividades que
                salgan del conjunto conservan su evidencia de aprobación congelada.
              </p>
            )}
          </div>
        )}

        <TextField label="Asunto" value={asunto} onChange={setAsunto} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Forma de pago</label>
            <input list="pea-forma-pago" value={formaPago} onChange={e => setFormaPago(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            {datalist('pea-forma-pago', PRESETS_FORMA_PAGO)}
          </div>
          <TextField label="Validez (días)" type="number" value={validez} onChange={setValidez} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Tiempo de ejecución</label>
            <input list="pea-tiempo" value={tiempoEjec} onChange={e => setTiempoEjec(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            {datalist('pea-tiempo', PRESETS_TIEMPO_EJECUCION)}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Garantía</label>
            <input list="pea-garantia" value={garantia} onChange={e => setGarantia(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            {datalist('pea-garantia', PRESETS_GARANTIA)}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Notas importantes (una por línea)</label>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={3}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
          <button onClick={onClose} disabled={emitiendo}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={emitir} disabled={!valido || emitiendo}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
            {emitiendo ? 'Emitiendo…' : reemitirDe ? `Emitir versión ${reemitirDe.version + 1}` : '📄 Emitir propuesta'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
