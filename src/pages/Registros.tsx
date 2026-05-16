import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, getDocs, query, orderBy, doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { toast } from '../components/shared/Toast'
import RegistrosTable, { Formulario, TIPO_LABELS } from '../components/RegistrosTable'
import RegistroDetalleModal from '../components/RegistroDetalleModal'

// ── Página principal ─────────────────────────────────────────────────────────

export default function Registros() {
  const [formularios, setFormularios]   = useState<Formulario[]>([])
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState<Formulario | null>(null)
  const [filters, setFilters] = useState({
    tipo:       '',
    proyecto:   '',
    tecnico:    '',
    fechaDesde: '',
    fechaHasta: '',
    revision:   '',
  })

  // ── Carga ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'formularios'),
        orderBy('timestamp_creacion', 'desc'),
      )
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Formulario[]
      setFormularios(data)
    } catch {
      toast('Error al cargar registros', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Filtrado client-side ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return formularios.filter(f => {
      if (filters.tipo && f.tipo !== filters.tipo) return false
      if (filters.proyecto && f.proyecto !== filters.proyecto) return false
      if (
        filters.tecnico &&
        !f.responsable.toLowerCase().includes(filters.tecnico.toLowerCase())
      ) return false
      if (filters.fechaDesde && f.timestamp_creacion < filters.fechaDesde) return false
      if (
        filters.fechaHasta &&
        f.timestamp_creacion > filters.fechaHasta + 'T23:59:59'
      ) return false
      if (filters.revision) {
        const estado = f.revision_sst?.estado ?? 'pendiente'
        if (estado !== filters.revision) return false
      }
      return true
    })
  }, [formularios, filters])

  // Obras únicas para el select
  const obrasUnicas = useMemo(() => {
    const set = new Set(formularios.map(f => f.proyecto).filter(Boolean))
    return Array.from(set).sort()
  }, [formularios])

  const hayFiltros = Object.values(filters).some(v => v !== '')

  // ── Marcar PDF como descargado ────────────────────────────────────────────

  const handlePdfDescargado = useCallback(async (id: string) => {
    try {
      await updateDoc(doc(db, 'formularios', id), {
        descargado_sst: true,
        fecha_descarga: new Date().toISOString(),
      })
      setFormularios(prev =>
        prev.map(f => f.id === id ? { ...f, descargado_sst: true } : f)
      )
    } catch {
      // No crítico — no interrumpir al usuario si falla
    }
  }, [])

  // ── Visto bueno ────────────────────────────────────────────────────────────

  const handleVistobueno = async (
    id: string,
    estado: 'aprobado' | 'rechazado',
    observacion: string,
    revisadoPor: string,
  ) => {
    const revision = {
      estado,
      observacion,
      revisado_por: revisadoPor,
      fecha_revision: new Date().toISOString(),
    }
    await updateDoc(doc(db, 'formularios', id), {
      revision_sst: revision,
      fecha_actualizacion: Timestamp.now(),
    })
    // Actualiza local sin recargar todo
    setFormularios(prev =>
      prev.map(f => f.id === id ? { ...f, revision_sst: revision } : f)
    )
    setSelected(prev => prev?.id === id ? { ...prev, revision_sst: revision } : prev)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Registros</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Formularios SST enviados por los técnicos
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800 font-medium px-3 py-2 rounded-lg hover:bg-blue-50 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

          {/* Tipo */}
          <select
            value={filters.tipo}
            onChange={e => setFilters(f => ({ ...f, tipo: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {/* Obra */}
          <select
            value={filters.proyecto}
            onChange={e => setFilters(f => ({ ...f, proyecto: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las obras</option>
            {obrasUnicas.map(o => <option key={o} value={o}>{o}</option>)}
          </select>

          {/* Técnico */}
          <input
            type="text"
            placeholder="Buscar técnico…"
            value={filters.tecnico}
            onChange={e => setFilters(f => ({ ...f, tecnico: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Fecha desde */}
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-[10px] text-gray-400 font-medium uppercase">Desde</span>
            <input
              type="date"
              value={filters.fechaDesde}
              onChange={e => setFilters(f => ({ ...f, fechaDesde: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 pt-6 pb-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Fecha hasta */}
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-[10px] text-gray-400 font-medium uppercase">Hasta</span>
            <input
              type="date"
              value={filters.fechaHasta}
              onChange={e => setFilters(f => ({ ...f, fechaHasta: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 pt-6 pb-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Revisión SST */}
          <select
            value={filters.revision}
            onChange={e => setFilters(f => ({ ...f, revision: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las revisiones</option>
            <option value="pendiente">⏳ Pendientes</option>
            <option value="aprobado">✅ Aprobados</option>
            <option value="rechazado">❌ Rechazados</option>
          </select>
        </div>

        {hayFiltros && (
          <button
            onClick={() => setFilters({ tipo: '', proyecto: '', tecnico: '', fechaDesde: '', fechaHasta: '', revision: '' })}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">
            Formularios enviados
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({filtered.length}
                {filtered.length !== formularios.length && ` de ${formularios.length}`})
              </span>
            )}
          </h2>

          {/* Indicador de pendientes */}
          {!loading && (() => {
            const pendientes = filtered.filter(f => !f.revision_sst || f.revision_sst.estado === 'pendiente').length
            if (pendientes === 0) return null
            return (
              <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                {pendientes} pendiente{pendientes !== 1 ? 's' : ''} de revisión
              </span>
            )
          })()}
        </div>

        <RegistrosTable
          formularios={filtered}
          loading={loading}
          onVerDetalle={setSelected}
        />
      </div>

      {/* Modal de detalle */}
      {selected && (
        <RegistroDetalleModal
          formulario={selected}
          onClose={() => setSelected(null)}
          onVistobueno={handleVistobueno}
          onPdfDescargado={handlePdfDescargado}
        />
      )}
    </div>
  )
}
