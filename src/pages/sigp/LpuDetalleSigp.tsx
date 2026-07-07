import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLpuDetalle } from '../../hooks/sigp/useLpuDetalle'
import { useAuth } from '../../contexts/AuthContext'
import { puedeGestionarLpusUI } from '../../types/sigp/permisos'
import ImportarLpuWizard from '../../components/sigp/lpus/ImportarLpuWizard'
import type { ItemLPU } from '../../types/sigp/lpu'

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}
const fmt = (n: number) => n.toLocaleString('es-CO')

interface Grupo { categoria: string; capitulos: { capitulo: string; items: ItemLPU[] }[] }

function agrupar(items: ItemLPU[]): Grupo[] {
  const porCat = new Map<string, Map<string, ItemLPU[]>>()
  for (const it of items) {
    const cat = it.categoria || 'Sin categoría'
    const cap = it.capitulo || 'Sin capítulo'
    if (!porCat.has(cat)) porCat.set(cat, new Map())
    const m = porCat.get(cat)!
    if (!m.has(cap)) m.set(cap, [])
    m.get(cap)!.push(it)
  }
  return [...porCat.entries()].map(([categoria, caps]) => ({
    categoria,
    capitulos: [...caps.entries()].map(([capitulo, items]) => ({ capitulo, items })),
  }))
}

export default function LpuDetalleSigp() {
  const { lpuId } = useParams<{ lpuId: string }>()
  const { lpu, items, cliente, predecesora, sucesora, versiones, loading, noEncontrada, reload } = useLpuDetalle(lpuId)
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarLpusUI(user?.rol)
  const [busqueda, setBusqueda] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => i.descripcion.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q))
  }, [items, busqueda])

  const grupos = useMemo(() => agrupar(filtrados), [filtrados])

  if (loading) {
    return <div className="max-w-5xl mx-auto p-8 text-sm text-gray-400">Cargando…</div>
  }
  if (noEncontrada || !lpu) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <p className="text-gray-500">La LPU no existe o fue eliminada.</p>
        <Link to="/sigp/lpus" className="text-brand-700 text-sm hover:underline mt-2 inline-block">← Volver a listas de precios</Link>
      </div>
    )
  }

  const esHistorica = lpu.estado === 'historica'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/sigp/lpus" className="text-sm text-gray-500 hover:text-brand-700 inline-flex items-center gap-1">
        ← Listas de precios
      </Link>

      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
            SIGP · Comercial · {cliente?.nombre ?? '—'}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">{lpu.nombre}</h1>
            <span className="text-sm text-gray-400">v{lpu.version}</span>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              esHistorica ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {esHistorica ? 'Histórica' : 'Vigente'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lpu.archivo_original_url && (
            <a href={lpu.archivo_original_url} target="_blank" rel="noopener noreferrer"
              className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition font-medium inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Excel original
            </a>
          )}
          {puedeGestionar && !esHistorica && (
            <button onClick={() => setWizardOpen(true)}
              className="text-xs px-3 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white transition font-medium">
              Nueva versión
            </button>
          )}
        </div>
      </div>

      {/* Trazabilidad de versiones */}
      {esHistorica && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-3">
          <span>Esta es una versión <span className="font-semibold">histórica</span>. Ya no es la lista de precios vigente.</span>
          {sucesora && (
            <Link to={`/sigp/lpus/${sucesora.id}`}
              className="flex-shrink-0 font-medium text-amber-900 underline hover:no-underline">
              Ir a la versión que la reemplazó (v{sucesora.version}) →
            </Link>
          )}
        </div>
      )}
      {!esHistorica && predecesora && (
        <p className="text-xs text-gray-500">
          Reemplazó a{' '}
          <Link to={`/sigp/lpus/${predecesora.id}`} className="text-brand-700 hover:underline">
            v{predecesora.version} «{predecesora.nombre}»
          </Link>.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Metadata + versiones */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm space-y-2">
            <h2 className="font-semibold text-gray-800 mb-1">Datos</h2>
            <Dato k="Ítems" v={fmt(lpu.total_items)} />
            <Dato k="Moneda" v={lpu.moneda} />
            <Dato k="Importada" v={fFecha(lpu.fecha_importacion)} />
            <Dato k="Vigencia" v={
              lpu.vigencia && (lpu.vigencia.desde || lpu.vigencia.hasta)
                ? `${fFecha(lpu.vigencia.desde)} — ${lpu.vigencia.hasta ? fFecha(lpu.vigencia.hasta) : 'indefinida'}`
                : '—'
            } />
            <Dato k="Categorías" v={lpu.categorias.join(', ') || '—'} />
          </div>

          {versiones.length > 1 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-800 mb-2 text-sm">Versiones ({versiones.length})</h2>
              <ul className="space-y-1">
                {versiones.map(v => (
                  <li key={v.id}>
                    <Link to={`/sigp/lpus/${v.id}`}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition ${
                        v.id === lpu.id ? 'bg-brand-50 text-brand-800 font-medium' : 'hover:bg-gray-50 text-gray-600'
                      }`}>
                      <span>v{v.version}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        v.estado === 'vigente' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>{v.estado === 'vigente' ? 'Vigente' : 'Histórica'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Ítems agrupados */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
            <h2 className="font-bold text-gray-800 text-sm">
              Ítems <span className="text-xs font-normal text-gray-400">({filtrados.length})</span>
            </h2>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por código o descripción…"
              className="w-56 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>

          <div className="max-h-[32rem] overflow-y-auto">
            {grupos.length === 0 && (
              <p className="px-5 py-10 text-center text-gray-400 text-sm">Sin ítems que coincidan.</p>
            )}
            {grupos.map(g => (
              <div key={g.categoria}>
                <div className="px-5 py-2 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide sticky top-0">
                  {g.categoria}
                </div>
                {g.capitulos.map(cap => (
                  <div key={cap.capitulo}>
                    {cap.capitulo !== 'Sin capítulo' && (
                      <div className="px-5 py-1.5 text-xs font-medium text-brand-700 bg-brand-50/40">{cap.capitulo}</div>
                    )}
                    <table className="min-w-full text-xs">
                      <tbody>
                        {cap.items.map(it => (
                          <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-5 py-1.5 font-mono text-gray-400 w-24">{it.codigo || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-800">{it.descripcion}</td>
                            <td className="px-3 py-1.5 text-gray-500 w-16">{it.unidad || '—'}</td>
                            <td className="px-5 py-1.5 text-right text-gray-700 w-28">${fmt(it.valor_unitario)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {cliente && (
        <ImportarLpuWizard
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          clientes={[cliente]}
          lpus={versiones}
          onImportado={reload}
          clienteIdInicial={cliente.id}
        />
      )}
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-800 text-right">{v}</span>
    </div>
  )
}
