// src/components/sigp/actividades/LineasActividad.tsx
//
// Buscador + tabla de líneas de una actividad, con la ANATOMÍA DEL COTIZADOR
// (F1.5 opción B, decisión de Giovanny): mismo buscador —código en mono,
// unidad y precio a la derecha, descripción debajo—, mismas columnas
// (Código · Descripción · Und · V. Unit · Cant · V. Total), zebra y
// descripción expandible. La pantalla se REPLICA; CotizacionDetalleSigp.tsx
// no se toca y la entidad conserva su modelo.
//
// Las líneas nacen SIEMPRE del LPU del alcance exacto (cliente+contrato+
// naturaleza) — sin líneas manuales; el trabajo no previsto entra por origen
// 'negociada' (ítem del LPU + valor acordado → cantidad despejada, con el
// despeje EN VIVO mientras se teclea). El ítem elegido aparece como FILA
// BORRADOR dentro de la misma tabla — el toggle medida/negociada es parte de
// la fila, no un parche encima. Cualquier write pasa por los builders puros
// de types/sigp/actividad — este componente nunca arma una línea a mano.
import { Fragment, useEffect, useMemo, useState } from 'react'
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
  // Fila BORRADOR: el ítem elegido del buscador, dentro de la tabla.
  const [itemSel, setItemSel] = useState<ItemLPU | null>(null)
  const [modo, setModo] = useState<'medida' | 'negociada'>('medida')
  const [cantidad, setCantidad] = useState<number | undefined>(undefined)
  const [valorNeg, setValorNeg] = useState<number | undefined>(undefined)
  // Valor evaluado EN CADA TECLA (onVivo de InputExpresion) — alimenta el
  // total (medida) o el despeje (negociada) en vivo, antes de confirmar.
  const [vivo, setVivo] = useState<number | null>(null)
  // Descripciones expandidas (por índice de línea guardada)
  const [expandidos, setExpandidos] = useState<Record<number, boolean>>({})

  const puedeBuscar = !disabled && !congeladas && !!lpu

  // Lazy: carga la subcolección de ítems UNA sola vez, solo cuando el
  // buscador es visible (congeladas/disabled lo ocultan por completo).
  useEffect(() => {
    if (!puedeBuscar || !lpu || itemsLpu !== null) return
    let vivoEf = true
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, 'lpus', lpu.id, 'items'))
        if (vivoEf) setItemsLpu(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ItemLPU))
      } catch {
        if (vivoEf) setItemsLpu([])
      }
    })()
    return () => { vivoEf = false }
  }, [puedeBuscar, lpu?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const resultados = useMemo(() => {
    const q = termino.trim().toLowerCase()
    if (!q || !itemsLpu) return []
    return itemsLpu.filter(i => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q)).slice(0, 30)
  }, [termino, itemsLpu])

  const elegirItem = (it: ItemLPU) => {
    setItemSel(it); setModo('medida'); setCantidad(undefined); setValorNeg(undefined); setVivo(null); setTermino('')
  }
  const cancelarSeleccion = () => { setItemSel(null); setCantidad(undefined); setValorNeg(undefined); setVivo(null) }
  const cambiarModo = (m: 'medida' | 'negociada') => { setModo(m); setVivo(null) }

  // Valores EN VIVO de la fila borrador (lo tecleado gana; lo confirmado queda)
  const cantidadViva = modo === 'medida' ? (vivo ?? cantidad) : undefined
  const valorVivo = modo === 'negociada' ? (vivo ?? valorNeg) : undefined
  const despejeVivo = itemSel && modo === 'negociada' && valorVivo && itemSel.valor_unitario > 0
    ? valorVivo / itemSel.valor_unitario
    : null
  const totalVivoMedida = itemSel && modo === 'medida' && cantidadViva
    ? Math.round(cantidadViva * itemSel.valor_unitario)
    : null

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

  const toggleExp = (i: number) => setExpandidos(p => ({ ...p, [i]: !p[i] }))

  const editableTabla = !congeladas && !disabled
  const nCols = 6 + (editableTabla ? 1 : 0)
  const listoParaAgregar = modo === 'medida' ? (cantidad ?? 0) > 0 : (valorNeg ?? 0) > 0

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

      {/* Buscador — disposición del cotizador: código en mono, unidad · precio
          a la derecha, descripción debajo a ancho completo. Solo LPU del
          alcance (el modelo lo manda — sin manuales ni catálogo). */}
      {puedeBuscar && (
        <div className="relative">
          <input value={termino} onChange={e => setTermino(e.target.value)}
            placeholder="Buscar ítem del LPU por código o descripción…"
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
                  <span className="block text-gray-800 mt-0.5 whitespace-normal">{it.descripcion}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabla — anatomía del cotizador: mismas columnas, zebra, descripción
          expandible. La fila BORRADOR del ítem elegido vive dentro. */}
      {(lineas.length > 0 || itemSel) ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="px-2 py-2 font-semibold">Código</th>
                <th className="px-2 py-2 font-semibold">Descripción</th>
                <th className="px-2 py-2 font-semibold">Und</th>
                <th className="px-2 py-2 font-semibold text-right">V. Unit</th>
                <th className="px-2 py-2 font-semibold text-right">Cant</th>
                <th className="px-2 py-2 font-semibold text-right">V. Total</th>
                {editableTabla && <th className="px-2 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const exp = !!expandidos[i]
                return (
                  <Fragment key={`${l.lpu_item_id}-${i}`}>
                    <tr className={`${exp ? '' : 'border-b border-gray-50'} ${i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono text-gray-500"
                        title="Snapshot del LPU — solo lectura">{l.codigo || '—'}</td>
                      <td className="px-2 py-1.5 max-w-md">
                        <div className="flex items-start gap-1">
                          <span onClick={() => toggleExp(i)} title={l.descripcion}
                            className="block w-full text-gray-800 cursor-pointer truncate">{l.descripcion}</span>
                          <button type="button" onClick={() => toggleExp(i)} title={exp ? 'Contraer' : 'Ver descripción completa'}
                            className="text-gray-400 hover:text-gray-600 flex-shrink-0">{exp ? '▴' : '▾'}</button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">{l.unidad || '—'}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-600">{fmtMoney(l.valor_unitario)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {congeladas && !disabled ? (
                          <InputExpresion valor={l.cantidad} onValor={n => actualizarCantidadCongelada(i, n)}
                            className="w-20 px-1 py-1 border border-gray-200 rounded text-right text-xs focus:outline-none focus:ring-1 focus:ring-brand-300" />
                        ) : (
                          <span>{fmtNum(l.cantidad, 4)}</span>
                        )}
                        {l.origen_cantidad === 'negociada' && (
                          <span className="ml-1 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500"
                            title="Cantidad despejada del valor negociado con el cliente">negociada</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-700">{fmtMoney(l.total)}</td>
                      {editableTabla && (
                        <td className="px-2 py-1.5 text-right">
                          <button type="button" onClick={() => quitarLinea(i)} className="text-gray-400 hover:text-red-600" aria-label="Quitar línea">✕</button>
                        </td>
                      )}
                    </tr>
                    {exp && (
                      <tr className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}>
                        <td colSpan={nCols} className="px-2 pb-2">
                          <p className="w-full text-gray-700 whitespace-pre-wrap bg-gray-50 rounded px-2 py-1.5">{l.descripcion}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}

              {/* FILA BORRADOR — el ítem elegido, con el toggle medida/negociada
                  como parte de la fila (patrón del cotizador: los controles
                  secundarios viven bajo la descripción). En 'medida' se teclea
                  la cantidad y el total se deriva; en 'negociada' se teclea el
                  VALOR ACORDADO en su columna y la cantidad se DESPEJA en vivo. */}
              {itemSel && (
                <tr className="border-y border-brand-200 bg-brand-50/50">
                  <td className="px-2 py-2 whitespace-nowrap font-mono text-gray-500">{itemSel.codigo}</td>
                  <td className="px-2 py-2 max-w-md">
                    <span className="block text-gray-800 truncate" title={itemSel.descripcion}>{itemSel.descripcion}</span>
                    <div className="mt-1 flex gap-1">
                      {(['medida', 'negociada'] as const).map(m => (
                        <button key={m} type="button" onClick={() => cambiarModo(m)}
                          title={m === 'medida' ? 'Cantidad medida en campo — el total se deriva' : 'Trabajo no previsto: valor acordado con el cliente — la cantidad se despeja'}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${modo === m ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                          {m === 'medida' ? 'Cantidad medida' : 'Valor negociado'}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-gray-500">{itemSel.unidad || '—'}</td>
                  <td className="px-2 py-2 text-right font-mono text-gray-600">{fmtMoney(itemSel.valor_unitario)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {modo === 'medida' ? (
                      <InputExpresion valor={cantidad} onValor={setCantidad} onVivo={setVivo} autoFocus
                        placeholder="cant."
                        className="w-20 px-1 py-1 border border-brand-300 rounded text-right text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-400" />
                    ) : (
                      <span className={despejeVivo !== null ? 'text-gray-700' : 'text-gray-300'}
                        title="Cantidad despejada = valor acordado ÷ V. Unit (precisión completa)">
                        {despejeVivo !== null ? fmtNum(despejeVivo, 4) : '—'}
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-100 text-brand-800">despejada</span>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {modo === 'medida' ? (
                      <span className={`font-mono ${totalVivoMedida !== null ? 'text-gray-700' : 'text-gray-300'}`}>
                        {totalVivoMedida !== null ? fmtMoney(totalVivoMedida) : '—'}
                      </span>
                    ) : (
                      <InputExpresion valor={valorNeg} onValor={setValorNeg} onVivo={setVivo} autoFocus
                        placeholder="$ acordado" titulo="Valor acordado con el cliente — la cantidad se despeja sola"
                        className="w-28 px-1 py-1 border border-brand-300 rounded text-right text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-400" />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <button type="button" onClick={agregarLinea} disabled={!listoParaAgregar}
                      title={listoParaAgregar ? 'Agregar la línea' : 'Confirma la cantidad o el valor (Enter) para agregar'}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-40">✓ Agregar</button>
                    <button type="button" onClick={cancelarSeleccion} title="Descartar"
                      className="ml-1 text-gray-400 hover:text-red-600">✕</button>
                  </td>
                </tr>
              )}
            </tbody>
            {lineas.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={5} className="px-2 py-2 text-right font-semibold text-gray-600">TOTAL</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-gray-800">{fmtMoney(totalLineas(lineas))}</td>
                  {editableTabla && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Sin líneas — la actividad queda sin valorizar.</p>
      )}
    </div>
  )
}
