// src/pages/ObraRegistros.tsx
import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, updateDoc, addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { toast } from '../components/shared/Toast'
import { useObrasConRegistros } from '../hooks/useObrasConRegistros'
import RegistroCard from '../components/RegistroCard'
import RegistroKanban from '../components/RegistroKanban'
import RegistroDetalleModal from '../components/RegistroDetalleModal'
import { TIPO_LABELS, type Formulario } from '../types/formulario'

type ViewMode = 'lista' | 'kanban'
type EstadoFilter = 'todos' | 'pendiente' | 'aprobado' | 'rechazado'

export default function ObraRegistros() {
  const { obraId = '' } = useParams<{ obraId: string }>()
  const navigate = useNavigate()
  const { obras, formulariosByObra, loading, reload } = useObrasConRegistros()

  const obra = useMemo(() => obras.find(o => o.id === obraId), [obras, obraId])
  const formularios = useMemo(() => formulariosByObra(obraId), [formulariosByObra, obraId])

  const [view, setView] = useState<ViewMode>('lista')
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('todos')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Formulario | null>(null)

  const filtrados = useMemo(() => {
    let result = formularios
    if (estadoFilter !== 'todos') {
      result = result.filter(f => (f.revision_sst?.estado ?? 'pendiente') === estadoFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(f =>
        f.responsable.toLowerCase().includes(q) ||
        f.codigo_formato.toLowerCase().includes(q)
      )
    }
    return result
  }, [formularios, estadoFilter, search])

  const counts = useMemo(() => {
    const c = { todos: formularios.length, pendiente: 0, aprobado: 0, rechazado: 0 }
    for (const f of formularios) {
      const e = f.revision_sst?.estado ?? 'pendiente'
      if (e === 'pendiente') c.pendiente++
      else if (e === 'aprobado') c.aprobado++
      else if (e === 'rechazado') c.rechazado++
    }
    return c
  }, [formularios])

  // ── Acciones (visto bueno, marcar descargado) ──

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

    const formulario = formularios.find(f => f.id === id)
    if (formulario?.uid_creador) {
      const tipoLabel = TIPO_LABELS[formulario.tipo] ?? formulario.tipo
      await addDoc(collection(db, 'notificaciones'), {
        user_id:        formulario.uid_creador,
        formulario_id:  id,
        formulario_tipo: formulario.tipo,
        tipo:           estado,
        titulo:         estado === 'aprobado' ? '✅ Formulario aprobado' : '❌ Formulario rechazado',
        mensaje:        estado === 'aprobado'
          ? `Tu ${tipoLabel} fue aprobado por ${revisadoPor}.`
          : `Tu ${tipoLabel} fue rechazado por ${revisadoPor}.${observacion ? ` Motivo: ${observacion}` : ''}`,
        leido:          false,
        fecha:          Timestamp.now(),
      })
    }

    setSelected(prev => prev?.id === id ? { ...prev, revision_sst: revision } : prev)
    await reload()
    toast(`Formulario ${estado} correctamente`)
  }

  const handlePdfDescargado = async (id: string) => {
    try {
      await updateDoc(doc(db, 'formularios', id), {
        descargado_sst: true,
        fecha_descarga: new Date().toISOString(),
      })
    } catch {
      // No crítico
    }
  }

  // ── 404 si obraId no existe ────────────────────────────────────────────────

  if (!loading && !obra) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900">Obra no encontrada</h1>
        <p className="text-gray-500 text-sm mt-2">El ID no coincide con ninguna obra.</p>
        <button
          onClick={() => navigate('/registros')}
          className="mt-6 text-sm text-blue-700 hover:underline"
        >
          ← Volver al hub
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">

      {/* Breadcrumb */}
      <div className="text-xs text-gray-500">
        <Link to="/registros" className="text-blue-700 hover:underline">← Registros</Link>
        {obra && <span className="text-gray-400"> / {obra.nombre_sitio}</span>}
      </div>

      {/* Banner de obra */}
      {obra && (
        <div className="rounded-lg p-4 text-white flex flex-wrap items-center justify-between gap-3"
             style={{ background: 'linear-gradient(to right, #0f172a, #1e293b)' }}>
          <div>
            <h2 className="text-lg font-bold leading-tight">{obra.nombre_sitio}</h2>
            <div className="font-mono text-[11px] opacity-70 mt-0.5">
              {obra.codigo}
              {obra.cliente && <span> · {obra.cliente}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="bg-white/10 rounded-md px-3 py-1.5 text-center">
              <span className="block text-lg font-bold leading-tight">{counts.todos}</span>
              <span className="text-[9px] uppercase opacity-70 tracking-wide">Registros</span>
            </div>
            <div className="rounded-md px-3 py-1.5 text-center" style={{ background: 'rgba(245,158,11,0.22)' }}>
              <span className="block text-lg font-bold leading-tight">{counts.pendiente}</span>
              <span className="text-[9px] uppercase opacity-70 tracking-wide">Pendientes</span>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar interno */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar técnico, código…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-transparent rounded-lg focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Estado filter chips */}
        {([
          { v: 'todos',     l: 'Todos' },
          { v: 'pendiente', l: `Pendientes (${counts.pendiente})` },
          { v: 'aprobado',  l: `Aprobados (${counts.aprobado})` },
          { v: 'rechazado', l: `Rechazados (${counts.rechazado})` },
        ] as { v: EstadoFilter; l: string }[]).map(opt => (
          <button
            key={opt.v}
            onClick={() => setEstadoFilter(opt.v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              estadoFilter === opt.v
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt.l}
          </button>
        ))}

        {/* View toggle */}
        <div className="bg-gray-100 rounded-md p-0.5 flex gap-0.5">
          <button
            onClick={() => setView('lista')}
            className={`text-[11px] px-2.5 py-1 rounded ${view === 'lista' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500'}`}
          >
            ≡ Lista
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`text-[11px] px-2.5 py-1 rounded ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500'}`}
          >
            ⊞ Kanban
          </button>
        </div>
      </div>

      {/* Loading / Empty */}
      {loading && (
        <div className="grid gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && filtrados.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center">
          <p className="text-gray-500 text-sm">
            {formularios.length === 0
              ? 'Esta obra no tiene registros todavía.'
              : 'Ningún registro coincide con los filtros.'}
          </p>
        </div>
      )}

      {/* Body según view */}
      {!loading && filtrados.length > 0 && view === 'lista' && (
        <div className="space-y-1.5">
          {filtrados.map(f => (
            <RegistroCard key={f.id} formulario={f} onClick={() => setSelected(f)} />
          ))}
        </div>
      )}

      {!loading && filtrados.length > 0 && view === 'kanban' && (
        <RegistroKanban formularios={filtrados} onCardClick={setSelected} />
      )}

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
