import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { toast } from '../components/shared/Toast'
import { Formulario, TIPO_LABELS, normalizarDoc } from '../components/RegistrosTable'
import StatCard from '../components/StatCard'
import * as XLSX from 'xlsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtFecha(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtHora(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function toRows(formularios: Formulario[]) {
  return formularios.map(f => ({
    'Fecha':              fmtFecha(f.timestamp_creacion),
    'Hora':               fmtHora(f.timestamp_creacion),
    'Tipo':               TIPO_LABELS[f.tipo] ?? f.tipo,
    'Obra / Proyecto':    f.proyecto ?? '',
    'Técnico':            f.responsable ?? '',
    'Ciudad':             f.ciudad ?? '',
    'Dirección':          f.direccion ?? '',
    'Código formato':     f.codigo_formato ?? '',
    'Estado revisión':    f.revision_sst?.estado ?? 'pendiente',
    'Revisado por':       f.revision_sst?.revisado_por ?? '',
    'Fecha revisión':     fmtFecha(f.revision_sst?.fecha_revision),
    'Observación SST':    f.revision_sst?.observacion ?? '',
    'URL PDF':            f.pdf_url ?? '',
  }))
}

function exportarExcel(formularios: Formulario[], nombre: string) {
  const rows  = toRows(formularios)
  const ws    = XLSX.utils.json_to_sheet(rows)
  const wb    = XLSX.utils.book_new()

  // Ancho de columnas aproximado
  const cols = [
    { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 28 }, { wch: 22 },
    { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 22 },
    { wch: 14 }, { wch: 30 }, { wch: 50 },
  ]
  ws['!cols'] = cols

  XLSX.utils.book_append_sheet(wb, ws, 'Formularios')
  XLSX.writeFile(wb, `${nombre}.xlsx`)
}

function exportarCSV(formularios: Formulario[], nombre: string) {
  const rows   = toRows(formularios)
  if (!rows.length) return
  const header = Object.keys(rows[0]).join(';')
  const body   = rows.map(r =>
    Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')
  ).join('\n')
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${nombre}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function nombreArchivo(filters: typeof INIT_FILTERS) {
  const partes = ['SST_Reporte']
  if (filters.tipo)       partes.push(TIPO_LABELS[filters.tipo] ?? filters.tipo)
  if (filters.proyecto)   partes.push(filters.proyecto.slice(0, 20))
  if (filters.fechaDesde) partes.push('desde_' + filters.fechaDesde)
  if (filters.fechaHasta) partes.push('hasta_' + filters.fechaHasta)
  if (filters.revision)   partes.push(filters.revision)
  return partes.join('_').replace(/\s+/g, '_')
}

// ── Constantes ────────────────────────────────────────────────────────────────

const INIT_FILTERS = {
  tipo:       '',
  proyecto:   '',
  tecnico:    '',
  fechaDesde: '',
  fechaHasta: '',
  revision:   '',
}

const REVISION_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobado:  'Aprobado',
  rechazado: 'Rechazado',
}

const REVISION_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobado:  'bg-green-100  text-green-800',
  rechazado: 'bg-red-100    text-red-800',
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function Reportes() {
  const [formularios, setFormularios] = useState<Formulario[]>([])
  const [loading, setLoading]         = useState(true)
  const [filters, setFilters]         = useState(INIT_FILTERS)
  const [page, setPage]               = useState(1)
  const PER_PAGE = 15

  // ── Carga ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'formularios'))
      const data = snap.docs.map(d =>
        normalizarDoc(d.id, d.data() as Record<string, unknown>)
      )
      // Ordenar client-side descendente por fecha normalizada
      data.sort((a, b) => (b.timestamp_creacion ?? '').localeCompare(a.timestamp_creacion ?? ''))
      setFormularios(data)
    } catch (err) {
      console.error('Error al cargar reportes:', err)
      toast('Error al cargar datos', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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

  // ── Filtrado ──────────────────────────────────────────────────────────────

  // Resetear página cuando cambian filtros
  useEffect(() => { setPage(1) }, [filters])

  const filtered = useMemo(() => {
    return formularios.filter(f => {
      if (filters.tipo && f.tipo !== filters.tipo) return false
      if (filters.proyecto && f.proyecto !== filters.proyecto) return false
      if (filters.tecnico && !f.responsable?.toLowerCase().includes(filters.tecnico.toLowerCase())) return false
      if (filters.fechaDesde && (f.timestamp_creacion ?? '') < filters.fechaDesde) return false
      if (filters.fechaHasta && (f.timestamp_creacion ?? '') > filters.fechaHasta + 'T23:59:59') return false
      if (filters.revision) {
        const estado = f.revision_sst?.estado ?? 'pendiente'
        if (estado !== filters.revision) return false
      }
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formularios, filters])

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    let pendiente = 0, aprobado = 0, rechazado = 0
    filtered.forEach(f => {
      const e = f.revision_sst?.estado ?? 'pendiente'
      if (e === 'aprobado')   aprobado++
      else if (e === 'rechazado') rechazado++
      else pendiente++
    })
    return { total: filtered.length, pendiente, aprobado, rechazado }
  }, [filtered])

  const obrasUnicas = useMemo(() => {
    const set = new Set(formularios.map(f => f.proyecto).filter(Boolean))
    return Array.from(set).sort()
  }, [formularios])

  const hayFiltros = Object.values(filters).some(v => v !== '')

  // ── Paginación ────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // ── Handlers export ───────────────────────────────────────────────────────

  const handleExcel = () => {
    if (!filtered.length) { toast('No hay datos para exportar', 'error'); return }
    exportarExcel(filtered, nombreArchivo(filters))
    toast(`Excel generado (${filtered.length} registros)`, 'success')
  }

  const handleCSV = () => {
    if (!filtered.length) { toast('No hay datos para exportar', 'error'); return }
    exportarCSV(filtered, nombreArchivo(filters))
    toast(`CSV generado (${filtered.length} registros)`, 'success')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Módulo de Reportes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Auditorías, inspecciones y registros SST · exportá a Excel o CSV
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title="Actualizar datos"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-100 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:block">Actualizar</span>
          </button>
          <button
            onClick={handleCSV}
            disabled={loading || !filtered.length}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            CSV
          </button>
          <button
            onClick={handleExcel}
            disabled={loading || !filtered.length}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Seleccionados"
          value={loading ? '…' : stats.total}
          loading={loading}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          title="Pendientes"
          value={loading ? '…' : stats.pendiente}
          loading={loading}
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Aprobados"
          value={loading ? '…' : stats.aprobado}
          loading={loading}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Rechazados"
          value={loading ? '…' : stats.rechazado}
          loading={loading}
          color="red"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-6 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Filtros de búsqueda</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

          <select
            value={filters.tipo}
            onChange={e => setFilters(f => ({ ...f, tipo: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          <select
            value={filters.proyecto}
            onChange={e => setFilters(f => ({ ...f, proyecto: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Todas las obras</option>
            {obrasUnicas.map(o => <option key={o} value={o}>{o}</option>)}
          </select>

          <input
            type="text"
            placeholder="Buscar técnico…"
            value={filters.tecnico}
            onChange={e => setFilters(f => ({ ...f, tecnico: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          <div className="relative">
            <span className="absolute left-3 top-2.5 text-[10px] text-gray-400 font-medium uppercase">Desde</span>
            <input
              type="date"
              value={filters.fechaDesde}
              onChange={e => setFilters(f => ({ ...f, fechaDesde: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 pt-6 pb-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="relative">
            <span className="absolute left-3 top-2.5 text-[10px] text-gray-400 font-medium uppercase">Hasta</span>
            <input
              type="date"
              value={filters.fechaHasta}
              onChange={e => setFilters(f => ({ ...f, fechaHasta: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 pt-6 pb-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <select
            value={filters.revision}
            onChange={e => setFilters(f => ({ ...f, revision: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Todas las revisiones</option>
            <option value="pendiente">⏳ Pendientes</option>
            <option value="aprobado">✅ Aprobados</option>
            <option value="rechazado">❌ Rechazados</option>
          </select>
        </div>

        {hayFiltros && (
          <button
            onClick={() => setFilters(INIT_FILTERS)}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla preview */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">
            Vista previa de reportes
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({filtered.length} registros
                {filtered.length !== formularios.length ? ` de ${formularios.length} totales` : ''})
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No hay registros con los filtros aplicados</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold">Obra / Proyecto</th>
                    <th className="px-4 py-3 text-left font-semibold">Técnico</th>
                    <th className="px-4 py-3 text-left font-semibold">Estado SST</th>
                    <th className="px-4 py-3 text-left font-semibold">Revisado por</th>
                    <th className="px-4 py-3 text-left font-semibold">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map(f => {
                    const estado = f.revision_sst?.estado ?? 'pendiente'
                    return (
                      <tr key={f.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtFecha(f.timestamp_creacion)}
                          <span className="text-gray-400 ml-1.5 text-xs">{fmtHora(f.timestamp_creacion)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-700">{TIPO_LABELS[f.tipo] ?? f.tipo}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                          {f.proyecto || <span className="text-gray-300 italic">Sin obra</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                          {f.responsable || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${REVISION_COLOR[estado] ?? 'bg-gray-100 text-gray-700'}`}>
                            {REVISION_LABEL[estado] ?? estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {f.revision_sst?.revisado_por ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {f.pdf_url ? (
                            <a
                              href={f.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handlePdfDescargado(f.id)}
                              className="text-brand-600 hover:text-brand-800 text-xs underline"
                            >
                              Ver PDF
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  Pág. {page} de {totalPages}
                </span>
                <div className="flex gap-1">
                  <PageBtn label="←" disabled={page === 1}          onClick={() => setPage(p => p - 1)} />
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    // Páginas visibles alrededor de la actual
                    let num = i + 1
                    if (totalPages > 7) {
                      const start = Math.max(1, Math.min(page - 3, totalPages - 6))
                      num = start + i
                    }
                    return (
                      <PageBtn
                        key={num}
                        label={String(num)}
                        active={num === page}
                        onClick={() => setPage(num)}
                      />
                    )
                  })}
                  <PageBtn label="→" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function PageBtn({
  label, onClick, disabled, active,
}: {
  label: string; onClick: () => void; disabled?: boolean; active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded text-sm font-medium transition
        ${active
          ? 'bg-brand-600 text-white'
          : 'text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed'}
      `}
    >
      {label}
    </button>
  )
}
