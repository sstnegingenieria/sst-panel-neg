import { useState, useEffect, useMemo, Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  doc, getDocs, collection, query, where, updateDoc, deleteField, Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useCotizacionDetalle } from '../../hooks/sigp/useCotizacionDetalle'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import { puedeGestionarCotizacionesUI } from '../../types/sigp/permisos'
import {
  calcularTotales, valorTotalItem, estadoEfectivo,
  ESTADO_COT_LABEL, ESTADO_COT_COLOR, ESQUEMA_LABEL, ESQUEMAS,
} from '../../types/sigp/cotizacion'
import type { ItemCotizacion, EsquemaTributario, ConfigAIU, CondicionesCotizacion } from '../../types/sigp/cotizacion'
import type { ItemLPU } from '../../types/sigp/lpu'
import type { CantidadPreliminar } from '../../types/sigp/visita'
import CotizacionAcciones from '../../components/sigp/cotizaciones/CotizacionAcciones'
import VersionesCotizacion from '../../components/sigp/cotizaciones/VersionesCotizacion'

const fMoneda = (n: number) => '$ ' + Math.round(n || 0).toLocaleString('es-CO')

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d
    ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '—'
}

export default function CotizacionDetalleSigp() {
  const { cotizacionId } = useParams<{ cotizacionId: string }>()
  const { cotizacion, version, cliente, loading, noEncontrada, reload } = useCotizacionDetalle(cotizacionId)
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarCotizacionesUI(user?.rol)

  // Estado editable (se inicializa desde la versión activa)
  const [items, setItems] = useState<ItemCotizacion[]>([])
  const [esquema, setEsquema] = useState<EsquemaTributario>('iva_pleno')
  const [aiuAdmin, setAiuAdmin] = useState('9')
  const [aiuImprev, setAiuImprev] = useState('5')
  const [aiuUtil, setAiuUtil] = useState('4')
  const [ivaPct, setIvaPct] = useState('19')
  const [cond, setCond] = useState<CondicionesCotizacion>({ forma_pago: '', validez_dias: 30, tiempo_ejecucion: '', garantia: '', moneda: 'COP' })
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Filas con descripción expandida (por índice del ítem)
  const [expandidos, setExpandidos] = useState<Record<number, boolean>>({})
  const [asunto, setAsunto] = useState('')

  // Datos auxiliares
  const [lpuItems, setLpuItems] = useState<ItemLPU[]>([])
  const [lpuNombre, setLpuNombre] = useState<string | null>(null)
  const [lpuVigenteId, setLpuVigenteId] = useState<string | null>(null)
  const [visitaCant, setVisitaCant] = useState<CantidadPreliminar[]>([])
  const [visitaCons, setVisitaCons] = useState<string | null>(null)

  useEffect(() => {
    setAsunto(cotizacion?.asunto ?? '')
  }, [cotizacion?.id, cotizacion?.asunto]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!version) return
    setItems(version.items ?? [])
    setEsquema(version.esquema)
    setAiuAdmin(String(version.aiu?.admin ?? 9))
    setAiuImprev(String(version.aiu?.imprevistos ?? 5))
    setAiuUtil(String(version.aiu?.utilidad ?? 4))
    setIvaPct(String(version.iva_pct))
    setCond(version.condiciones)
  }, [version?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar LPU vigente del cliente (para el buscador) y visita realizada vinculada.
  useEffect(() => {
    if (!cotizacion) return
    ;(async () => {
      if (cotizacion.cliente_id) {
        try {
          const lpus = await getDocs(query(collection(db, 'lpus'), where('cliente_id', '==', cotizacion.cliente_id)))
          const vig = lpus.docs.map(d => ({ id: d.id, ...d.data() })).find((l: any) => l.estado === 'vigente') as any
          if (vig) {
            setLpuNombre(vig.nombre)
            setLpuVigenteId(vig.id)
            const its = await getDocs(collection(db, 'lpus', vig.id, 'items'))
            setLpuItems(its.docs.map(d => ({ id: d.id, ...d.data() }) as ItemLPU))
          }
        } catch { /* LPU opcional */ }
      }
      if (cotizacion.solicitud_id) {
        try {
          const vis = await getDocs(query(collection(db, 'visitas'), where('solicitud_id', '==', cotizacion.solicitud_id)))
          const real = vis.docs.map(d => ({ id: d.id, ...d.data() })).find((v: any) => v.estado === 'realizada') as any
          if (real?.cantidades?.length) { setVisitaCant(real.cantidades); setVisitaCons(real.consecutivo) }
        } catch { /* opcional */ }
      }
    })()
  }, [cotizacion?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const aiuConfig = (): ConfigAIU | undefined =>
    esquema === 'aiu' ? { admin: Number(aiuAdmin), imprevistos: Number(aiuImprev), utilidad: Number(aiuUtil) } : undefined

  const totales = useMemo(
    () => calcularTotales(items, esquema, aiuConfig(), Number(ivaPct) || 0),
    [items, esquema, aiuAdmin, aiuImprev, aiuUtil, ivaPct], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const editable = cotizacion?.estado === 'borrador' && puedeGestionar
  const capitulos = useMemo(() => [...new Set(items.map(i => i.capitulo?.trim()).filter(Boolean))] as string[], [items])
  const itemsCero = items.filter(i => (i.valor_unitario || 0) <= 0).length

  const grupos = useMemo(() => {
    const m = new Map<string, { it: ItemCotizacion; idx: number }[]>()
    items.forEach((it, idx) => {
      const cap = it.capitulo?.trim() || 'Sin capítulo'
      if (!m.has(cap)) m.set(cap, [])
      m.get(cap)!.push({ it, idx })
    })
    return [...m.entries()]
  }, [items])

  const lpuFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return lpuItems.filter(i => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q)).slice(0, 15)
  }, [busqueda, lpuItems])

  if (loading) return <div className="max-w-5xl mx-auto p-8 text-sm text-gray-400">Cargando…</div>
  if (noEncontrada || !cotizacion) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <p className="text-gray-500">La cotización no existe o fue eliminada.</p>
        <Link to="/sigp/cotizaciones" className="text-brand-700 text-sm hover:underline mt-2 inline-block">← Volver a cotizaciones</Link>
      </div>
    )
  }

  const setItem = (i: number, patch: Partial<ItemCotizacion>) => setItems(prev => prev.map((it, j) => {
    if (j !== i) return it
    const m = { ...it, ...patch }
    m.valor_total = valorTotalItem(m.valor_unitario, m.cantidad)
    return m
  }))
  const quitarItem = (i: number) => setItems(prev => prev.filter((_, j) => j !== i))

  const agregarLpu = (li: ItemLPU) => setItems(prev => [...prev, {
    origen: 'lpu', codigo: li.codigo, descripcion: li.descripcion, unidad: li.unidad,
    valor_unitario: li.valor_unitario, cantidad: 1, valor_total: valorTotalItem(li.valor_unitario, 1),
    ...(li.capitulo ? { capitulo: li.capitulo } : {}),
    ...(lpuVigenteId ? { lpu_id: lpuVigenteId } : {}), lpu_item_id: li.id,
  }])

  const agregarManual = () => setItems(prev => [...prev, { origen: 'manual', codigo: '', descripcion: '', unidad: '', valor_unitario: 0, cantidad: 1, valor_total: 0 }])

  const prellenarVisita = () => setItems(prev => [...prev, ...visitaCant.map(c => ({
    origen: 'manual' as const, codigo: '', descripcion: c.descripcion, unidad: c.unidad,
    valor_unitario: 0, cantidad: c.cantidad, valor_total: 0,
  }))])

  const guardar = async (silencioso = false): Promise<boolean> => {
    if (itemsCero > 0 && !window.confirm(`Hay ${itemsCero} ítem(s) en $0 sin precio. ¿Guardar de todos modos?`)) return false
    setGuardando(true)
    try {
      const aiu = aiuConfig()
      const tot = calcularTotales(items, esquema, aiu, Number(ivaPct) || 0)
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(cotizacion.version_activa)), {
        items, esquema, aiu: aiu ?? deleteField(), iva_pct: Number(ivaPct) || 0, condiciones: { ...cond, validez_dias: Number(cond.validez_dias) || 0 }, totales: tot,
      })
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
        total: tot.total, validez_dias: Number(cond.validez_dias) || 0,
        asunto: asunto.trim(), fecha_actualizacion: Timestamp.now(),
      })
      if (!silencioso) { toast('Cotización guardada'); await reload() }
      return true
    } catch { toast('Error al guardar', 'error'); return false } finally { setGuardando(false) }
  }

  const est = estadoEfectivo(cotizacion)
  const origen = cliente?.nombre ?? cotizacion.prospecto_nombre ?? '—'

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24">
      <Link to="/sigp/cotizaciones" className="text-sm text-gray-500 hover:text-brand-700 inline-flex items-center gap-1">← Cotizaciones</Link>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800 font-mono">{cotizacion.consecutivo}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${ESTADO_COT_COLOR[est]}`}>{ESTADO_COT_LABEL[est]}</span>
        <span className="text-sm text-gray-400">v{cotizacion.version_activa}</span>
        <span className="text-sm text-gray-600">· {origen}{cotizacion.es_licitacion && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-semibold">LICITACIÓN</span>}</span>
      </div>

      {/* Asunto (CM-FT-CT-19): editable solo en borrador */}
      {editable ? (
        <div className="flex items-center gap-2 max-w-xl">
          <label className="text-xs text-gray-500 flex-shrink-0">Asunto</label>
          <input value={asunto} onChange={e => setAsunto(e.target.value)}
            placeholder="Ej: Adecuaciones estación Ráquira"
            className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 ${asunto.trim() ? 'border-gray-300' : 'border-amber-300'}`} />
        </div>
      ) : (
        <p className="text-sm text-gray-700"><span className="text-xs text-gray-400 mr-2">Asunto</span>{cotizacion.asunto || '—'}</p>
      )}

      {/* Acciones de estado */}
      <CotizacionAcciones
        cotizacion={cotizacion}
        efectivo={est}
        puedeGestionar={puedeGestionar}
        guardarBorrador={() => guardar(true)}
        reload={reload}
      />

      {!editable && (
        <div className="rounded-lg bg-gray-100 border border-gray-200 px-4 py-2 text-xs text-gray-600">
          Versión v{cotizacion.version_activa} en estado «{ESTADO_COT_LABEL[est]}» — solo lectura.
        </div>
      )}

      {cotizacion.motivo_rechazo && est === 'rechazada' && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-xs text-rose-700">
          <span className="font-semibold">Motivo del rechazo:</span> {cotizacion.motivo_rechazo}
        </div>
      )}

      {cotizacion.evidencia_aprobacion && est === 'aprobada' && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs text-emerald-800">
          <span className="font-semibold">Evidencia de aprobación:</span>{' '}
          <a href={cotizacion.evidencia_aprobacion.url} target="_blank" rel="noreferrer" className="underline hover:text-emerald-900">
            📎 {cotizacion.evidencia_aprobacion.nombre}
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Constructor de ítems */}
        <div className="lg:col-span-2 space-y-3">
          {editable && (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <button onClick={agregarManual} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">+ Ítem manual</button>
                {visitaCant.length > 0 && (
                  <button onClick={prellenarVisita} className="text-xs px-3 py-1.5 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium">
                    Prellenar desde {visitaCons} ({visitaCant.length})
                  </button>
                )}
              </div>
              {/* Buscador LPU */}
              {lpuItems.length > 0 ? (
                <div className="relative">
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder={`Buscar en LPU ${lpuNombre ?? 'vigente'} por código o descripción…`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                  {lpuFiltrado.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {lpuFiltrado.map(li => (
                        <button key={li.id} onClick={() => { agregarLpu(li); setBusqueda('') }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 border-b border-gray-50">
                          <span className="flex justify-between gap-2">
                            <span className="font-mono text-gray-400">{li.codigo || '—'}</span>
                            <span className="text-gray-500 flex-shrink-0">{li.unidad ? `${li.unidad} · ` : ''}{fMoneda(li.valor_unitario)}</span>
                          </span>
                          <span className="block text-gray-800 mt-0.5 whitespace-normal">{li.descripcion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : cotizacion.cliente_id ? (
                <p className="text-xs text-gray-400">El cliente no tiene LPU vigente; usa ítems manuales.</p>
              ) : (
                <p className="text-xs text-gray-400">Cotización sin cliente registrado (prospecto): solo ítems manuales.</p>
              )}
            </div>
          )}

          {/* Lista de ítems */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <datalist id="capitulos">{capitulos.map(c => <option key={c} value={c} />)}</datalist>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-2 py-2 font-semibold">Código</th>
                  <th className="px-2 py-2 font-semibold">Descripción</th>
                  <th className="px-2 py-2 font-semibold">Und</th>
                  <th className="px-2 py-2 font-semibold text-right">V. Unit</th>
                  <th className="px-2 py-2 font-semibold text-right">Cant</th>
                  <th className="px-2 py-2 font-semibold text-right">V. Total</th>
                  {editable && <th className="px-2 py-2"></th>}
                </tr>
              </thead>
              {items.length === 0 && <tbody><tr><td colSpan={editable ? 7 : 6} className="px-2 py-6 text-center text-gray-400">Sin ítems. Agrega desde el LPU o manuales.</td></tr></tbody>}
              {grupos.map(([cap, filas]) => {
                  const sub = filas.reduce((s, f) => s + (f.it.valor_total || 0), 0)
                  return (
                    <tbody key={cap}>
                      <tr className="bg-gray-50"><td colSpan={editable ? 7 : 6} className="px-2 py-1.5 text-[11px] font-semibold text-gray-600 uppercase">{cap} <span className="text-gray-400 normal-case">· {fMoneda(sub)}</span></td></tr>
                      {filas.map(({ it, idx }) => {
                        const cero = (it.valor_unitario || 0) <= 0
                        const exp = !!expandidos[idx]
                        const toggleExp = () => setExpandidos(p => ({ ...p, [idx]: !p[idx] }))
                        return (
                          <Fragment key={idx}>
                          <tr className={`${exp ? '' : 'border-b border-gray-50'} ${cero ? 'bg-amber-50' : ''}`}>
                            <td className="px-2 py-1">{editable ? <input value={it.codigo} onChange={e => setItem(idx, { codigo: e.target.value })} className="w-16 px-1 py-1 border border-gray-200 rounded" /> : <span className="font-mono text-gray-500">{it.codigo || '—'}</span>}</td>
                            <td className="px-2 py-1 max-w-md">
                              <div className="flex items-start gap-1">
                                {editable
                                  ? <input value={it.descripcion} onChange={e => setItem(idx, { descripcion: e.target.value })} className="w-full min-w-[10rem] px-1 py-1 border border-gray-200 rounded" />
                                  : <span onClick={toggleExp} title="Clic para expandir / contraer" className="block w-full text-gray-800 cursor-pointer truncate">{it.descripcion}</span>}
                                <button onClick={toggleExp} title={exp ? 'Contraer' : 'Ver descripción completa'} className="text-gray-400 hover:text-gray-600 mt-1 flex-shrink-0">{exp ? '▴' : '▾'}</button>
                              </div>
                              {editable && <input list="capitulos" value={it.capitulo ?? ''} onChange={e => setItem(idx, { capitulo: e.target.value })} placeholder="capítulo" className="mt-1 w-full px-1 py-0.5 border border-gray-100 rounded text-[11px] text-gray-500" />}</td>
                            <td className="px-2 py-1">
                              {/* Unidad: heredada del LPU = solo lectura. Editable solo en ítems
                                  manuales — o si la LPU importada no traía unidad (dato legacy). */}
                              {editable && (it.origen !== 'lpu' || !it.unidad)
                                ? <input value={it.unidad} onChange={e => setItem(idx, { unidad: e.target.value })} className="w-12 px-1 py-1 border border-gray-200 rounded" />
                                : <span title={it.origen === 'lpu' ? 'Heredada del LPU (solo lectura)' : undefined}>{it.unidad || '—'}</span>}
                            </td>
                            <td className="px-2 py-1 text-right">{editable ? <input inputMode="numeric" value={it.valor_unitario ? '$ ' + it.valor_unitario.toLocaleString('es-CO') : ''}
                                onChange={e => {
                                  // es-CO: punto = miles (se descarta), coma = decimal. Preserva
                                  // precios LPU con decimales reales (ej. 16031,954) sin corromperlos.
                                  const crudo = e.target.value.replace(/[^\d,]/g, '').replace(',', '.')
                                  setItem(idx, { valor_unitario: Number(crudo) || 0 })
                                }}
                                placeholder="$ 0" className={`w-28 px-1 py-1 border rounded text-right ${cero ? 'border-amber-300' : 'border-gray-200'}`} /> : fMoneda(it.valor_unitario)}</td>
                            <td className="px-2 py-1 text-right">{editable ? <input type="number" value={it.cantidad || ''} onChange={e => setItem(idx, { cantidad: Number(e.target.value) })} className="w-16 px-1 py-1 border border-gray-200 rounded text-right" /> : it.cantidad}</td>
                            <td className="px-2 py-1 text-right font-mono text-gray-700">{fMoneda(it.valor_total)}</td>
                            {editable && <td className="px-2 py-1 text-right"><button onClick={() => quitarItem(idx)} className="text-red-400 hover:text-red-600">✕</button></td>}
                          </tr>
                          {/* Descripción expandida: fila propia a todo el ancho de la tabla */}
                          {exp && (
                            <tr className={`border-b border-gray-50 ${cero ? 'bg-amber-50' : ''}`}>
                              <td colSpan={editable ? 7 : 6} className="px-2 pb-2 pt-0">
                                {editable
                                  ? <textarea value={it.descripcion} onChange={e => setItem(idx, { descripcion: e.target.value })} rows={3} autoFocus
                                      className="w-full px-2 py-1.5 border border-gray-200 rounded resize-y text-xs focus:outline-none focus:ring-2 focus:ring-brand-300" />
                                  : <p className="w-full text-gray-700 whitespace-pre-wrap bg-gray-50 rounded px-2 py-1.5">{it.descripcion}</p>}
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  )
                })}
            </table>
          </div>
          {editable && itemsCero > 0 && <p className="text-xs text-amber-700">⚠ {itemsCero} ítem(s) en $0 (resaltados). Se puede guardar, pero completa los precios antes de enviar.</p>}
        </div>

        {/* Totales */}
        <div className="space-y-3">
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 lg:sticky lg:top-4">
            <h2 className="font-semibold text-gray-800 text-sm">Totales</h2>
            {editable && (
              <div className="space-y-2">
                <select value={esquema} onChange={e => setEsquema(e.target.value as EsquemaTributario)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {ESQUEMAS.map(e => <option key={e} value={e}>{ESQUEMA_LABEL[e]}</option>)}
                </select>
                {esquema === 'aiu' && (
                  <div className="grid grid-cols-3 gap-1">
                    <input type="number" value={aiuAdmin} onChange={e => setAiuAdmin(e.target.value)} placeholder="A%" className="px-1 py-1 border border-gray-200 rounded text-xs text-center" />
                    <input type="number" value={aiuImprev} onChange={e => setAiuImprev(e.target.value)} placeholder="I%" className="px-1 py-1 border border-gray-200 rounded text-xs text-center" />
                    <input type="number" value={aiuUtil} onChange={e => setAiuUtil(e.target.value)} placeholder="U%" className="px-1 py-1 border border-gray-200 rounded text-xs text-center" />
                  </div>
                )}
                <div className="flex items-center gap-2"><span className="text-xs text-gray-500 flex-1">IVA %</span><input type="number" value={ivaPct} onChange={e => setIvaPct(e.target.value)} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-right" /></div>
              </div>
            )}
            <div className="text-sm space-y-1 pt-2 border-t border-gray-100">
              <Fila k="Costos directos" v={fMoneda(totales.costos_directos)} />
              {esquema === 'aiu' && <>
                <Fila k={`Admin (${aiuAdmin}%)`} v={fMoneda(totales.admin ?? 0)} />
                <Fila k={`Imprevistos (${aiuImprev}%)`} v={fMoneda(totales.imprevistos ?? 0)} />
                <Fila k={`Utilidad (${aiuUtil}%)`} v={fMoneda(totales.utilidad ?? 0)} />
              </>}
              <Fila k={`IVA (${ivaPct}%${esquema === 'aiu' ? ' s/U' : ''})`} v={fMoneda(totales.iva)} />
              <div className="flex justify-between pt-2 border-t border-gray-100 font-bold text-gray-900"><span>Total</span><span>{fMoneda(totales.total)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Condiciones */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800 text-sm">Condiciones comerciales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Campo label="Validez (días)" tipo="number" v={String(cond.validez_dias)} on={v => setCond(c => ({ ...c, validez_dias: Number(v) }))} editable={editable} />
          <Campo label="Forma de pago" v={cond.forma_pago} on={v => setCond(c => ({ ...c, forma_pago: v }))} editable={editable} />
          <Campo label="Tiempo de ejecución" v={cond.tiempo_ejecucion} on={v => setCond(c => ({ ...c, tiempo_ejecucion: v }))} editable={editable} />
          <Campo label="Garantía" v={cond.garantia} on={v => setCond(c => ({ ...c, garantia: v }))} editable={editable} />
        </div>
        <div>
          <label className="text-xs text-gray-500">Observaciones / exclusiones</label>
          {editable
            ? <textarea value={cond.observaciones ?? ''} onChange={e => setCond(c => ({ ...c, observaciones: e.target.value }))} rows={2} className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            : <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{cond.observaciones || '—'}</p>}
        </div>
      </div>

      {/* Comparación de versiones (solo si hay >1) */}
      <VersionesCotizacion cotizacionId={cotizacion.id} versionActiva={cotizacion.version_activa} />

      {/* Timeline del historial */}
      {cotizacion.historial?.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">Historial</h2>
          <ol className="space-y-2">
            {[...cotizacion.historial].reverse().map((h, i) => (
              <li key={i} className="flex items-start gap-3 text-xs">
                <span className="mt-1 h-2 w-2 rounded-full bg-brand-600 flex-shrink-0" />
                <div>
                  <span className="text-gray-800 font-medium">
                    {h.de ? `${ESTADO_COT_LABEL[h.de]} → ` : ''}{ESTADO_COT_LABEL[h.a]}
                  </span>
                  {h.version !== undefined && <span className="ml-1 text-gray-400">(v{h.version})</span>}
                  <span className="ml-2 text-gray-400">{fFecha(h.fecha)}</span>
                  {h.motivo && <p className="text-gray-500 mt-0.5">{h.motivo}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Barra guardar */}
      {editable && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-end gap-3">
            <span className="text-sm text-gray-500 mr-auto">Total: <span className="font-bold text-gray-800">{fMoneda(totales.total)}</span></span>
            <button onClick={() => guardar()} disabled={guardando} className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Fila({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between text-gray-600"><span>{k}</span><span className="font-mono text-gray-800">{v}</span></div>
}

function Campo({ label, v, on, editable, tipo }: { label: string; v: string; on: (v: string) => void; editable?: boolean; tipo?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      {editable
        ? <input type={tipo} value={v} onChange={e => on(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        : <p className="text-gray-800">{v || '—'}</p>}
    </div>
  )
}
