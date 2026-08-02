// Bandeja de Órdenes de compra (Compras · C2), sub-bloque 3 — UI.
//
// Solo lectura + navegación: las acciones (crear/editar/emitir/aprobar/
// anular) viven en la ficha del proyecto (OrdenesCompraProyecto) — aquí se
// SURFACEA, no se reinventa. Protegida por ROLES_VEN_OC en App.tsx.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { toast } from '../../components/shared/Toast'
import { fmtMoney } from '../../utils/sigp/formato'
import { ESTADO_OC_LABEL, ESTADO_OC_COLOR } from '../../types/sigp/ordenCompra'
import type { OrdenCompra, EstadoOrdenCompra } from '../../types/sigp/ordenCompra'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

type Seccion = 'todas' | EstadoOrdenCompra

const PILLS: { clave: Seccion; etiqueta: string }[] = [
  { clave: 'borrador', etiqueta: 'Borradores' },
  { clave: 'emitida', etiqueta: 'Por aprobar' },
  { clave: 'aprobada', etiqueta: 'Aprobadas' },
  { clave: 'anulada', etiqueta: 'Anuladas' },
  { clave: 'todas', etiqueta: 'Todas' },
]

export default function OrdenesCompraSigp() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  // Default: "Por aprobar" — es la cola de trabajo del aprobador.
  const [seccion, setSeccion] = useState<Seccion>('emitida')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'ordenes_compra'))
      const datos = snap.docs.map(d => ({ id: d.id, ...d.data() }) as OrdenCompra)
      datos.sort((a, b) => (b.fecha_creacion?.toMillis?.() ?? 0) - (a.fecha_creacion?.toMillis?.() ?? 0))
      setOrdenes(datos)
    } catch {
      toast('Error al cargar las órdenes de compra', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const conteo = useMemo(() => Object.fromEntries(
    PILLS.map(p => [p.clave, p.clave === 'todas' ? ordenes.length : ordenes.filter(o => o.estado === p.clave).length]),
  ) as Record<Seccion, number>, [ordenes])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const base = seccion === 'todas' ? ordenes : ordenes.filter(o => o.estado === seccion)
    if (!q) return base
    return base.filter(o =>
      (o.consecutivo ?? '').toLowerCase().includes(q) ||
      (o.proveedor_snapshot?.razon_social ?? '').toLowerCase().includes(q) ||
      (o.proyecto_consecutivo ?? '').toLowerCase().includes(q))
  }, [ordenes, seccion, busqueda])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">SIGP · Compras · C2</p>
        <h1 className="text-2xl font-bold text-gray-800">Órdenes de compra</h1>
        <p className="text-sm text-gray-500">
          Las acciones (crear, editar, emitir, aprobar, anular) se hacen desde la ficha del
          proyecto — aquí solo se consultan.
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {PILLS.map(p => (
          <button key={p.clave} onClick={() => setSeccion(p.clave)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              seccion === p.clave ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {p.etiqueta} ({conteo[p.clave] ?? 0})
          </button>
        ))}
      </div>

      <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por consecutivo, proveedor o proyecto…"
        className="w-full sm:max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-3 px-4 font-semibold">Consecutivo</th>
              <th className="py-3 px-4 font-semibold">Proyecto</th>
              <th className="py-3 px-4 font-semibold">Proveedor</th>
              <th className="py-3 px-4 font-semibold text-right">Total</th>
              <th className="py-3 px-4 font-semibold">Estado</th>
              <th className="py-3 px-4 font-semibold">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && filtradas.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">
                No hay órdenes de compra{busqueda ? ' con esa búsqueda' : ' en esta sección'}.
              </td></tr>
            )}
            {!loading && filtradas.map(oc => (
              <tr key={oc.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <Link to={`/sigp/proyectos/${oc.proyecto_id}`} className="font-mono text-brand-700 font-semibold hover:underline">
                    {oc.consecutivo || 'sin código'}
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <Link to={`/sigp/proyectos/${oc.proyecto_id}`} className="font-mono text-gray-700 hover:underline">
                    {oc.proyecto_consecutivo}
                  </Link>
                </td>
                <td className="py-3 px-4 text-gray-700">{oc.proveedor_snapshot?.razon_social ?? '—'}</td>
                <td className="py-3 px-4 text-right font-mono text-gray-700">{fmtMoney(oc.valor_total)}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_OC_COLOR[oc.estado]}`}>
                    {ESTADO_OC_LABEL[oc.estado]}
                  </span>
                  {oc.salvedad_aprobacion && (
                    <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800"
                      title={`Aprobación con salvedad: ${oc.salvedad_aprobacion}`}>
                      Salvedad
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-500">{fFecha(oc.fecha_creacion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
