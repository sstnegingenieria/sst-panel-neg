// src/components/sigp/actividades/LineasActividad.tsx
//
// Buscador + tabla de líneas de una actividad. Las líneas nacen SIEMPRE del
// LPU del alcance exacto (cliente+contrato+naturaleza) — sin líneas
// manuales; el trabajo no previsto entra por origen 'negociada' (ítem del
// LPU + valor acordado → cantidad despejada). Cualquier write pasa por los
// builders puros de types/sigp/actividad — este componente nunca arma una
// línea a mano.
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import InputExpresion from '../cotizaciones/InputExpresion'
import { toast } from '../../shared/Toast'
import { fmtMoney, fmtNum } from '../../../utils/sigp/formato'
import { construirLinea, construirLineaNegociada, totalLineas } from '../../../types/sigp/actividad'
import type { Actividad, LineaActividad as TipoLineaActividad } from '../../../types/sigp/actividad'
import type { LPU, ItemLPU } from '../../../types/sigp/lpu'

type AlcanceActividad = Pick<Actividad, 'cliente_id' | 'contrato' | 'naturaleza'>

interface LineasActividadProps {
  alcance: AlcanceActividad
  lpu: LPU | null
  lineas: TipoLineaActividad[]
  onChange: (lineas: TipoLineaActividad[]) => void
  disabled?: boolean
  congeladas?: boolean
}

export default function LineasActividad({ alcance, lpu, lineas, onChange, disabled, congeladas }: LineasActividadProps) {
  const [itemsLpu, setItemsLpu] = useState<ItemLPU[] | null>(null)
  const [termino, setTermino] = useState('')
  const [itemSel, setItemSel] = useState<ItemLPU | null>(null)
  const [modo, setModo] = useState<'medida' | 'negociada'>('medida')
  const [cantidad, setCantidad] = useState<number | undefined>(undefined)
  const [valorNeg, setValorNeg] = useState<number | undefined>(undefined)

  const puedeBuscar = !disabled && !congeladas && !!lpu

  // Lazy: carga la subcolección de ítems UNA sola vez, solo cuando el
  // buscador es visible (congeladas/disabled lo ocultan por completo).
  useEffect(() => {
    if (!puedeBuscar || !lpu || itemsLpu !== null) return
    let vivo = true
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, 'lpus', lpu.id, 'items'))
        if (vivo) setItemsLpu(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ItemLPU))
      } catch {
        if (vivo) setItemsLpu([])
      }
    })()
    return () => { vivo = false }
  }, [puedeBuscar, lpu?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const resultados = useMemo(() => {
    const q = termino.trim().toLowerCase()
    if (!q || !itemsLpu) return []
    return itemsLpu.filter(i => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q)).slice(0, 30)
  }, [termino, itemsLpu])

  const elegirItem = (it: ItemLPU) => {
    setItemSel(it); setModo('medida'); setCantidad(undefined); setValorNeg(undefined); setTermino('')
  }

  const cancelarSeleccion = () => { setItemSel(null); setCantidad(undefined); setValorNeg(undefined) }

  let cantidadDespejada: number | null = null
  if (itemSel && valorNeg && itemSel.valor_unitario > 0) {
    cantidadDespejada = valorNeg / itemSel.valor_unitario
  }

  const agregarLinea = () => {
    if (!lpu || !itemSel) return
    const linea = modo === 'medida'
      ? construirLinea(lpu, itemSel, cantidad ?? 0, 'medida', alcance)
      : construirLineaNegociada(lpu, itemSel, valorNeg ?? 0, alcance)
    if (!linea) {
      toast('No se pudo agregar la línea — revisa la cantidad/valor (o el ítem no pertenece a este alcance)', 'error')
      return
    }
    onChange([...lineas, linea])
    cancelarSeleccion()
  }

  const quitarLinea = (idx: number) => onChange(lineas.filter((_, i) => i !== idx))

  const actualizarCantidadCongelada = (idx: number, nuevaCantidad: number) => {
    onChange(lineas.map((l, i) => (i === idx
      ? { ...l, cantidad: nuevaCantidad, total: Math.round(nuevaCantidad * l.valor_unitario) }
      : l)))
  }

  if (!lpu) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2.5">
        No hay LPU vigente para este alcance ({alcance.contrato || 'sin contrato'} · {alcance.naturaleza}) — no se pueden cargar líneas.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {congeladas && !disabled && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Líneas congeladas por la aprobación — solo cantidades.
        </p>
      )}

      {puedeBuscar && (
        <div className="relative">
          <input value={termino} onChange={e => setTermino(e.target.value)}
            placeholder="Buscar ítem por código o descripción…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          {resultados.length > 0 && (
            <div className="mt-1 border border-gray-200 rounded-lg max-h-56 overflow-y-auto bg-white shadow-sm">
              {resultados.map(it => (
                <button key={it.id} type="button" onClick={() => elegirItem(it)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 border-b border-gray-50">
                  <span className="flex justify-between gap-2 items-center">
                    <span className="font-mono text-gray-400">{it.codigo}</span>
                    <span className="text-gray-500 flex-shrink-0">{it.unidad ? `${it.unidad} · ` : ''}{fmtMoney(it.valor_unitario)}</span>
                  </span>
                  <span className="block text-gray-800 mt-0.5">{it.descripcion}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {puedeBuscar && itemSel && (
        <div className="border border-brand-200 bg-brand-50/40 rounded-lg p-3 space-y-2">
          <p className="text-xs text-gray-700"><span className="font-mono">{itemSel.codigo}</span> · {itemSel.descripcion}</p>
          <div className="flex gap-2">
            {(['medida', 'negociada'] as const).map(m => (
              <button key={m} type="button" onClick={() => setModo(m)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${modo === m ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600'}`}>
                {m === 'medida' ? 'Cantidad medida' : 'Valor negociado'}
              </button>
            ))}
          </div>
          {modo === 'medida' ? (
            <label className="block text-xs text-gray-600">
              Cantidad ({itemSel.unidad})
              <InputExpresion valor={cantidad} onValor={setCantidad}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          ) : (
            <label className="block text-xs text-gray-600">
              Valor acordado
              <InputExpresion valor={valorNeg} onValor={setValorNeg}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
              {cantidadDespejada !== null && (
                <span className="block mt-1 text-[11px] text-gray-400">
                  {fmtNum(cantidadDespejada, 4)} {itemSel.unidad} · cantidad despejada
                </span>
              )}
            </label>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancelarSeleccion} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="button" onClick={agregarLinea} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-700 hover:bg-brand-800 text-white">Agregar línea</button>
          </div>
        </div>
      )}

      {lineas.length > 0 ? (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left uppercase tracking-wide text-gray-500">
                <th className="py-2 px-3 font-semibold">Código</th>
                <th className="py-2 px-3 font-semibold">Descripción</th>
                <th className="py-2 px-3 font-semibold">Cantidad</th>
                <th className="py-2 px-3 font-semibold">Und</th>
                <th className="py-2 px-3 font-semibold text-right">Vr. unitario</th>
                <th className="py-2 px-3 font-semibold text-right">Total</th>
                {!congeladas && !disabled && <th className="py-2 px-3" />}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={`${l.lpu_item_id}-${i}`} className="border-b border-gray-100">
                  <td className="py-2 px-3 font-mono text-gray-400">{l.codigo}</td>
                  <td className="py-2 px-3 text-gray-700 max-w-[220px] truncate" title={l.descripcion}>{l.descripcion}</td>
                  <td className="py-2 px-3">
                    {congeladas && !disabled ? (
                      <InputExpresion valor={l.cantidad} onValor={n => actualizarCantidadCongelada(i, n)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    ) : (
                      <span>
                        {fmtNum(l.cantidad, 4)}{' '}
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">{l.origen_cantidad}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-gray-500">{l.unidad}</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-600">{fmtMoney(l.valor_unitario)}</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-700">{fmtMoney(l.total)}</td>
                  {!congeladas && !disabled && (
                    <td className="py-2 px-3 text-right">
                      <button type="button" onClick={() => quitarLinea(i)} className="text-gray-400 hover:text-red-600" aria-label="Quitar línea">✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="py-2 px-3 text-right font-semibold text-gray-600">TOTAL</td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-gray-800">{fmtMoney(totalLineas(lineas))}</td>
                {!congeladas && !disabled && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Sin líneas — la actividad queda sin valorizar.</p>
      )}
    </div>
  )
}
