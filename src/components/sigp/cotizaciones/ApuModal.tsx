import { useState, useEffect, useMemo } from 'react'
import Modal from '../../shared/Modal'
import { fmtNum } from '../../../utils/sigp/formato'
import {
  SECCIONES_APU, SECCION_APU_LABEL, costoDirectoAPU, precioDesdeCosto,
} from '../../../types/sigp/cotizacion'
import type { APU, InsumoAPU, SeccionAPU } from '../../../types/sigp/cotizacion'

const fMoneda = (n: number) => '$ ' + fmtNum(n || 0)

/** Rendimientos nunca llevan miles: punto Y coma son decimal (acepta 0.0909 y 0,0909). */
const parseRendimiento = (s: string): number => {
  const n = Number(s.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Costos en es-CO: punto = miles (se descarta), coma = decimal. */
const parseCosto = (s: string): number => {
  const n = Number(s.trim().replace(/[^\d,]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

interface InsumoForm { descripcion: string; unidad: string; rendimiento: string; costo_unitario: string }

const aForm = (i: InsumoAPU): InsumoForm => ({
  descripcion: i.descripcion, unidad: i.unidad,
  rendimiento: String(i.rendimiento).replace('.', ','),
  costo_unitario: String(i.costo_unitario).replace('.', ','),
})
const nuevoInsumo = (): InsumoForm => ({ descripcion: '', unidad: '', rendimiento: '', costo_unitario: '' })
const vacio = (i: InsumoForm) => !i.descripcion.trim() && !i.rendimiento.trim() && !i.costo_unitario.trim()

type SeccionesForm = Record<SeccionAPU, InsumoForm[]>

interface ApuModalProps {
  isOpen: boolean
  onClose: () => void
  /** Solo lectura cuando la versión no es editable (consulta de versiones enviadas). */
  editable: boolean
  codigoItem: string
  descripcionItem: string
  apu?: APU
  margenActual?: number
  /** Aplica el APU al ítem (snapshot embebido + costo/margen/precio sugerido). */
  onAplicar: (r: { apu: APU; costo_directo: number; margen: number; valor_unitario: number }) => void
  /** Quita el desglose APU (el ítem vuelve a manual conservando sus valores). */
  onQuitar?: () => void
}

/**
 * Constructor APU (1.4B.b): 5 secciones fijas en orden canónico (APU_CLARO_113).
 * Del costo directo + margen [0,100) sale el precio sugerido del ítem.
 * El análisis es INTERNO: jamás se pinta en el PDF de cara al cliente.
 */
export default function ApuModal({
  isOpen, onClose, editable, codigoItem, descripcionItem, apu, margenActual, onAplicar, onQuitar,
}: ApuModalProps) {
  const [secciones, setSecciones] = useState<SeccionesForm>(() => inicial(apu))
  const [abiertas, setAbiertas] = useState<Record<SeccionAPU, boolean>>(() => abiertasInicial(apu))
  const [margen, setMargen] = useState('10')

  useEffect(() => {
    if (!isOpen) return
    setSecciones(inicial(apu))
    setAbiertas(abiertasInicial(apu))
    setMargen(margenActual !== undefined ? String(margenActual).replace('.', ',') : '10')
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const setInsumo = (sec: SeccionAPU, i: number, patch: Partial<InsumoForm>) =>
    setSecciones(p => ({ ...p, [sec]: p[sec].map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const agregarInsumo = (sec: SeccionAPU) =>
    setSecciones(p => ({ ...p, [sec]: [...p[sec], nuevoInsumo()] }))
  const quitarInsumo = (sec: SeccionAPU, i: number) =>
    setSecciones(p => ({ ...p, [sec]: p[sec].filter((_, j) => j !== i) }))

  const subtotalInsumo = (i: InsumoForm) => parseRendimiento(i.rendimiento) * parseCosto(i.costo_unitario)
  const subtotalSeccion = (sec: SeccionAPU) => secciones[sec].reduce((s, i) => s + subtotalInsumo(i), 0)

  const costoDirecto = useMemo(
    () => SECCIONES_APU.reduce((t, sec) => t + subtotalSeccion(sec), 0),
    [secciones], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const margenNum = Number(margen.trim().replace(',', '.'))
  const margenValido = Number.isFinite(margenNum) && margenNum >= 0 && margenNum < 100
  const precioSugerido = margenValido ? precioDesdeCosto(costoDirecto, margenNum) : null

  const aplicar = () => {
    if (!margenValido || precioSugerido === null || costoDirecto <= 0) return
    const apuFinal = {} as APU
    for (const sec of SECCIONES_APU) {
      apuFinal[sec] = secciones[sec].filter(i => !vacio(i)).map(i => ({
        descripcion: i.descripcion.trim(),
        unidad: i.unidad.trim(),
        rendimiento: parseRendimiento(i.rendimiento),
        costo_unitario: parseCosto(i.costo_unitario),
        subtotal: subtotalInsumo(i),
      }))
    }
    apuFinal.costo_directo = costoDirectoAPU(apuFinal)
    onAplicar({
      apu: apuFinal,
      costo_directo: apuFinal.costo_directo,
      margen: margenNum,
      valor_unitario: Math.round(precioSugerido),
    })
    onClose()
  }

  const quitar = () => {
    if (!onQuitar) return
    if (!window.confirm('¿Quitar el desglose APU? El ítem vuelve a manual conservando su precio, costo y margen actuales.')) return
    onQuitar()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl"
      title={`APU — ${descripcionItem || 'ítem'}${codigoItem ? ` (${codigoItem})` : ''}`}>
      <div className="space-y-3">
        {!editable && (
          <p className="text-xs text-gray-500 bg-gray-100 rounded px-3 py-1.5">
            Versión no editable — desglose en solo lectura.
          </p>
        )}

        {SECCIONES_APU.map(sec => (
          <div key={sec} className="border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setAbiertas(p => ({ ...p, [sec]: !p[sec] }))}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {abiertas[sec] ? '▾' : '▸'} {SECCION_APU_LABEL[sec]}
                <span className="ml-2 font-normal normal-case text-gray-400">({secciones[sec].filter(i => !vacio(i)).length})</span>
              </span>
              <span className="text-xs font-mono text-gray-700">{fMoneda(subtotalSeccion(sec))}</span>
            </button>

            {abiertas[sec] && (
              <div className="p-2 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="px-1 py-1 font-medium">Descripción</th>
                      <th className="px-1 py-1 font-medium">Und</th>
                      <th className="px-1 py-1 font-medium text-right">Rendimiento</th>
                      <th className="px-1 py-1 font-medium text-right">Costo unit</th>
                      <th className="px-1 py-1 font-medium text-right">Subtotal</th>
                      {editable && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {secciones[sec].length === 0 && (
                      <tr><td colSpan={editable ? 6 : 5} className="px-1 py-2 text-center text-gray-300">Sin insumos.</td></tr>
                    )}
                    {secciones[sec].map((ins, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-1 py-1">{editable
                          ? <input value={ins.descripcion} onChange={e => setInsumo(sec, i, { descripcion: e.target.value })} className="w-full min-w-[10rem] px-1 py-1 border border-gray-200 rounded" />
                          : <span className="text-gray-800">{ins.descripcion}</span>}</td>
                        <td className="px-1 py-1">{editable
                          ? <input value={ins.unidad} onChange={e => setInsumo(sec, i, { unidad: e.target.value })} className="w-14 px-1 py-1 border border-gray-200 rounded" />
                          : ins.unidad}</td>
                        <td className="px-1 py-1 text-right">{editable
                          ? <input inputMode="decimal" value={ins.rendimiento} onChange={e => setInsumo(sec, i, { rendimiento: e.target.value })} placeholder="0,0909" className="w-20 px-1 py-1 border border-gray-200 rounded text-right" />
                          : fmtNum(parseRendimiento(ins.rendimiento))}</td>
                        <td className="px-1 py-1 text-right">{editable
                          ? <input inputMode="numeric" value={ins.costo_unitario} onChange={e => setInsumo(sec, i, { costo_unitario: e.target.value })} placeholder="$ 0" className="w-24 px-1 py-1 border border-gray-200 rounded text-right" />
                          : fMoneda(parseCosto(ins.costo_unitario))}</td>
                        <td className="px-1 py-1 text-right font-mono text-gray-700">{fMoneda(subtotalInsumo(ins))}</td>
                        {editable && <td className="px-1 py-1 text-right"><button onClick={() => quitarInsumo(sec, i)} className="text-red-400 hover:text-red-600">✕</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {editable && (
                  <button onClick={() => agregarInsumo(sec)} className="mt-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">+ Insumo</button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Costo directo + margen → precio sugerido */}
        <div className="border-t border-gray-200 pt-3 space-y-2">
          <div className="flex justify-between text-sm font-semibold text-gray-800">
            <span>COSTO DIRECTO DEL ÍTEM</span>
            <span className="font-mono">{fMoneda(costoDirecto)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-600">Margen</label>
            {editable
              ? <input inputMode="decimal" value={margen} onChange={e => setMargen(e.target.value)}
                  className={`w-16 px-2 py-1 border rounded text-right text-sm ${margenValido ? 'border-gray-300' : 'border-red-400'}`} />
              : <span className="font-mono">{margen}</span>}
            <span className="text-gray-500">%</span>
            <span className="text-gray-400 mx-1">→</span>
            <span className="text-gray-600">Precio sugerido:</span>
            <span className="font-mono font-semibold text-gray-900">
              {precioSugerido !== null ? '$ ' + Math.round(precioSugerido).toLocaleString('es-CO') : '—'}
            </span>
          </div>
          {!margenValido && <p className="text-xs text-red-600">El margen debe estar en el rango [0, 100).</p>}
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            {editable && onQuitar && apu && (
              <button onClick={quitar} className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Quitar APU</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
              {editable ? 'Cancelar' : 'Cerrar'}
            </button>
            {editable && (
              <button onClick={aplicar} disabled={!margenValido || costoDirecto <= 0}
                className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
                Aplicar al ítem
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function inicial(apu?: APU): SeccionesForm {
  const s = {} as SeccionesForm
  for (const sec of SECCIONES_APU) s[sec] = (apu?.[sec] ?? []).map(aForm)
  return s
}

/** Abiertas: las que traen insumos; si el APU es nuevo, la primera (mano de obra). */
function abiertasInicial(apu?: APU): Record<SeccionAPU, boolean> {
  const a = {} as Record<SeccionAPU, boolean>
  const hayAlgo = SECCIONES_APU.some(sec => (apu?.[sec] ?? []).length > 0)
  for (const sec of SECCIONES_APU) a[sec] = hayAlgo ? (apu?.[sec] ?? []).length > 0 : sec === 'mano_obra'
  return a
}
