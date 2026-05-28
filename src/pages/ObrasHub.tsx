// src/pages/ObrasHub.tsx
import { useState, useMemo } from 'react'
import { useObrasConRegistros, type ObraConStats } from '../hooks/useObrasConRegistros'
import ObraCard from '../components/ObraCard'

type EstadoFilter = 'activas' | 'inactivas' | 'todas'
type SortBy = 'recientes' | 'pendientes' | 'alfabetico'

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

export default function ObrasHub() {
  const { obrasConStats, loading, error, reload } = useObrasConRegistros()

  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('activas')
  const [conPendientes, setConPendientes] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('recientes')

  // ── Filtros + sort ─────────────────────────────────────────────────────────

  const filtradas = useMemo<ObraConStats[]>(() => {
    let result = obrasConStats

    if (estadoFilter === 'activas') result = result.filter(o => o.estado === 'activa')
    else if (estadoFilter === 'inactivas') result = result.filter(o => o.estado === 'inactiva')

    if (conPendientes) result = result.filter(o => o.pendientes > 0)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        o.nombre_sitio.toLowerCase().includes(q) ||
        o.codigo.toLowerCase().includes(q) ||
        (o.cliente ?? '').toLowerCase().includes(q)
      )
    }

    const sorted = [...result]
    if (sortBy === 'recientes') {
      sorted.sort((a, b) => b.ultimoTimestamp.localeCompare(a.ultimoTimestamp))
    } else if (sortBy === 'pendientes') {
      sorted.sort((a, b) => b.pendientes - a.pendientes)
    } else {
      sorted.sort((a, b) => a.nombre_sitio.localeCompare(b.nombre_sitio))
    }
    return sorted
  }, [obrasConStats, estadoFilter, conPendientes, search, sortBy])

  // ── Auto-secciones (recientes vs otras) ────────────────────────────────────

  const { recientes, otras } = useMemo(() => {
    const cutoff = Date.now() - SIETE_DIAS_MS
    const rec: ObraConStats[] = []
    const otr: ObraConStats[] = []
    for (const o of filtradas) {
      const ts = o.ultimoTimestamp ? new Date(o.ultimoTimestamp).getTime() : 0
      if (ts >= cutoff) rec.push(o)
      else otr.push(o)
    }
    return { recientes: rec, otras: otr }
  }, [filtradas])

  // ── Métricas globales ──────────────────────────────────────────────────────

  const totales = useMemo(() => {
    const activas = obrasConStats.filter(o => o.estado === 'activa').length
    const registros = obrasConStats.reduce((sum, o) => sum + o.totalRegistros, 0)
    const pendientes = obrasConStats.reduce((sum, o) => sum + o.pendientes, 0)
    return { activas, registros, pendientes }
  }, [obrasConStats])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hub de Registros por Obra</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading
              ? 'Cargando…'
              : `${totales.activas} obras activas · ${totales.registros} registros · ${totales.pendientes} pendientes`}
          </p>
        </div>
        <button
          onClick={reload}
          className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800 font-medium px-3 py-2 rounded-lg hover:bg-blue-50 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código o cliente…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-transparent rounded-lg focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="recientes">↓ Más recientes</option>
          <option value="pendientes">↓ Con más pendientes</option>
          <option value="alfabetico">↓ Alfabético</option>
        </select>

        {/* Estado chips (mutuamente excluyentes) */}
        {(['activas', 'inactivas', 'todas'] as EstadoFilter[]).map(opt => (
          <button
            key={opt}
            onClick={() => setEstadoFilter(opt)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              estadoFilter === opt
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt === 'activas' ? 'Activas' : opt === 'inactivas' ? 'Inactivas' : 'Todas'}
          </button>
        ))}

        {/* Toggle Con pendientes */}
        <button
          onClick={() => setConPendientes(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            conPendientes
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          }`}
        >
          Con pendientes
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Vacío */}
      {!loading && filtradas.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center">
          <p className="text-gray-500 text-sm">
            {obrasConStats.length === 0
              ? 'No hay obras todavía. Creá una desde el menú Obras.'
              : 'Ninguna obra coincide con los filtros.'}
          </p>
        </div>
      )}

      {/* Sección 1: Actividad reciente */}
      {!loading && recientes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
              Actividad reciente · esta semana
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recientes.map(o => <ObraCard key={o.id} obra={o} />)}
          </div>
        </section>
      )}

      {/* Sección 2: Otras obras */}
      {!loading && otras.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
              {recientes.length > 0
                ? `Otras obras (${otras.length})`
                : `Obras (${otras.length})`}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {otras.map(o => <ObraCard key={o.id} obra={o} />)}
          </div>
        </section>
      )}
    </div>
  )
}
