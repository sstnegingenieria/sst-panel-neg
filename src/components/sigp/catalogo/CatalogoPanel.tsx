// Mantenimiento de precios del catálogo NEG (#2b) — contenido extraído de la
// antigua página CatalogoSigp (reorganización de navegación: el catálogo vive
// como pestaña de Cotizaciones). Lógica y permisos INTACTOS: lectura de
// `catalogo_items` con corrección puntual y ajuste masivo por %, todo trazado
// en `historial_precios` (APPEND-ONLY). Solo lectura para roles sin
// `puedeMantenerCatalogoUI`.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import CorregirPrecioModal from './CorregirPrecioModal'
import AjusteMasivoModal from './AjusteMasivoModal'
import { fmtMoney } from '../../../utils/sigp/formato'
import { puedeMantenerCatalogoUI } from '../../../types/sigp/permisos'
import type { CatalogoItem, EntradaHistorialPrecio } from '../../../types/sigp/catalogo'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

function ultimoHistorial(item: CatalogoItem): EntradaHistorialPrecio | null {
  const h = item.historial_precios
  return h && h.length > 0 ? h[h.length - 1] : null
}

export default function CatalogoPanel() {
  const { user } = useAuth()
  const esMantenedor = puedeMantenerCatalogoUI(user?.rol)

  const [items, setItems] = useState<CatalogoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [todoElCatalogo, setTodoElCatalogo] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'catalogo_items'), orderBy('codigo', 'asc')))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CatalogoItem))
    } catch {
      toast('Error al cargar el catálogo', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    let base = items
    if (soloActivos) base = base.filter(it => it.estado !== 'inactivo')
    if (q) {
      base = base.filter(it =>
        (it.codigo ?? '').toLowerCase().includes(q) ||
        (it.descripcion ?? '').toLowerCase().includes(q))
    }
    return base
  }, [items, soloActivos, busqueda])

  // La selección solo tiene sentido sobre lo visible — al filtrar, se poda.
  useEffect(() => {
    const visibles = new Set(filtrados.map(it => it.id))
    setSeleccion(prev => {
      const podada = new Set([...prev].filter(id => visibles.has(id)))
      return podada.size === prev.size ? prev : podada
    })
  }, [filtrados])

  const toggleExpandido = (id: string) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSeleccion = (id: string) => {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const todosFiltradosSeleccionados = filtrados.length > 0 && filtrados.every(it => seleccion.has(it.id))
  const toggleSeleccionarTodos = () => {
    setSeleccion(todosFiltradosSeleccionados ? new Set() : new Set(filtrados.map(it => it.id)))
  }

  // ── Corregir precio (1 ítem) ──
  const [corrigiendoId, setCorrigiendoId] = useState<string | null>(null)
  const itemCorrigiendo = corrigiendoId ? items.find(it => it.id === corrigiendoId) ?? null : null

  const abrirCorregir = () => {
    if (seleccion.size !== 1) return
    setCorrigiendoId([...seleccion][0])
  }

  const alTerminarCorreccion = () => {
    setCorrigiendoId(null)
    setSeleccion(new Set())
    load()
  }

  // ── Ajuste masivo (selección o todo el catálogo activo) ──
  const [ajustando, setAjustando] = useState(false)
  const itemsAfectados = useMemo(() => {
    if (seleccion.size > 0) return items.filter(it => seleccion.has(it.id))
    if (todoElCatalogo) return items.filter(it => it.estado !== 'inactivo')
    return []
  }, [items, seleccion, todoElCatalogo])

  const alTerminarAjuste = () => {
    setAjustando(false)
    setSeleccion(new Set())
    setTodoElCatalogo(false)
    load()
  }

  const colSpan = (esMantenedor ? 1 : 0) + 7

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por código o descripción…"
          className="w-full sm:max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
          <input type="checkbox" checked={!soloActivos} onChange={e => setSoloActivos(!e.target.checked)} />
          Mostrar inactivos
        </label>
        <span className="text-sm text-gray-500 sm:ml-auto whitespace-nowrap">{filtrados.length} ítems</span>
      </div>

      {esMantenedor && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
          <button
            onClick={abrirCorregir}
            disabled={seleccion.size !== 1}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            ✎ Corregir precio
          </button>
          <button
            onClick={() => setAjustando(true)}
            disabled={itemsAfectados.length === 0}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            📊 Ajuste masivo por %
          </button>
          <button
            onClick={toggleSeleccionarTodos}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            {todosFiltradosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos (filtrados)'}
          </button>
          <label className="flex items-center gap-2 text-xs text-gray-600 sm:ml-auto whitespace-nowrap">
            <input type="checkbox" checked={todoElCatalogo} onChange={e => setTodoElCatalogo(e.target.checked)} />
            Todo el catálogo activo ({items.filter(it => it.estado !== 'inactivo').length})
          </label>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-3 px-3 font-semibold w-8" />
              {esMantenedor && <th className="py-3 px-3 font-semibold w-8" />}
              <th className="py-3 px-4 font-semibold">Código</th>
              <th className="py-3 px-4 font-semibold">Descripción</th>
              <th className="py-3 px-4 font-semibold">Unidad</th>
              <th className="py-3 px-4 font-semibold text-right">Precio vigente</th>
              <th className="py-3 px-4 font-semibold">Última actualización</th>
              <th className="py-3 px-4 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={colSpan + 1} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && filtrados.length === 0 && (
              <tr><td colSpan={colSpan + 1} className="py-12 text-center text-gray-400">
                No hay ítems{busqueda ? ' con esa búsqueda' : ' en el catálogo'}.
              </td></tr>
            )}
            {!loading && filtrados.map(item => {
              const ultimo = ultimoHistorial(item)
              const expandido = expandidos.has(item.id)
              const historialDesc = [...(item.historial_precios ?? [])].reverse()
              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3">
                      <button
                        onClick={() => toggleExpandido(item.id)}
                        className="text-gray-400 hover:text-gray-600 transition"
                        aria-label={expandido ? 'Contraer historial' : 'Expandir historial'}
                      >
                        <span className={`inline-block transition-transform ${expandido ? 'rotate-90' : ''}`}>▸</span>
                      </button>
                    </td>
                    {esMantenedor && (
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={seleccion.has(item.id)}
                          onChange={() => toggleSeleccion(item.id)}
                        />
                      </td>
                    )}
                    <td className="py-3 px-4 font-mono text-gray-700">{item.codigo || '—'}</td>
                    <td className="py-3 px-4 text-gray-700 max-w-xs">
                      <span className="block truncate" title={item.descripcion}>{item.descripcion || '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{item.unidad || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono text-gray-800">
                      {fmtMoney(item.valor_unitario ?? 0)}
                    </td>
                    <td className="py-3 px-4">
                      {ultimo ? (
                        <span className="text-xs text-gray-500">
                          {fFecha(ultimo.vigente_desde)}
                          {ultimo.motivo && (
                            <span className="block truncate max-w-[14rem]" title={ultimo.motivo}>{ultimo.motivo}</span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
                          ítem anterior a esta función
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        item.estado === 'inactivo' ? 'bg-gray-100 text-gray-500' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {item.estado === 'inactivo' ? 'Inactivo' : 'Activo'}
                      </span>
                    </td>
                  </tr>
                  {expandido && (
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <td colSpan={colSpan + 1} className="py-3 px-6">
                        {historialDesc.length === 0 ? (
                          <p className="text-xs text-gray-400">Sin historial — ítem anterior a esta función.</p>
                        ) : (
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-left uppercase tracking-wide text-gray-400">
                                <th className="py-1.5 pr-4 font-semibold">Desde</th>
                                <th className="py-1.5 pr-4 font-semibold text-right">Precio</th>
                                <th className="py-1.5 pr-4 font-semibold">Motivo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historialDesc.map((h, i) => (
                                <tr key={i} className="border-t border-gray-200" title={`Actualizado por: ${h.actualizado_por || '—'}`}>
                                  <td className="py-1.5 pr-4 text-gray-500">{fFecha(h.vigente_desde)}</td>
                                  <td className="py-1.5 pr-4 text-right font-mono text-gray-700">{fmtMoney(h.valor_unitario ?? 0)}</td>
                                  <td className="py-1.5 pr-4 text-gray-600">{h.motivo || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {itemCorrigiendo && (
        <CorregirPrecioModal
          item={itemCorrigiendo}
          isOpen={corrigiendoId !== null}
          onClose={() => setCorrigiendoId(null)}
          onDone={alTerminarCorreccion}
        />
      )}

      {esMantenedor && (
        <AjusteMasivoModal
          items={itemsAfectados}
          isOpen={ajustando}
          onClose={() => setAjustando(false)}
          onDone={alTerminarAjuste}
        />
      )}
    </div>
  )
}
