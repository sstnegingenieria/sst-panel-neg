import { useState, useEffect, useCallback, useMemo } from 'react'
import ObrasTable, { Obra } from '../components/ObrasTable'
import ObrasForm, { ObraFormData } from '../components/ObrasForm'
import StatCard from '../components/StatCard'
import { useModal } from '../hooks/useModal'
import { useFirestore } from '../hooks/useFirestore'
import { toast } from '../components/shared/Toast'

export default function Obras() {
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Obra | null>(null)
  const modal = useModal()
  const { add, update, getAllOrdered } = useFirestore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('obras', 'nombre_sitio', 'asc')
      setObras(data as Obra[])
    } catch {
      toast('Error al cargar obras', 'error')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditTarget(null)
    modal.open()
  }

  const openEdit = (obra: Obra) => {
    setEditTarget(obra)
    modal.open()
  }

  const handleSave = async (data: ObraFormData) => {
    try {
      if (editTarget) {
        await update('obras', editTarget.id, data)
        toast('Obra actualizada correctamente')
      } else {
        await add('obras', data)
        toast('Obra creada correctamente')
      }
      await load()
    } catch {
      toast('Error al guardar la obra', 'error')
      throw new Error('save failed')
    }
  }

  const handleToggle = async (obra: Obra) => {
    const nuevoEstado = obra.estado === 'activa' ? 'inactiva' : 'activa'
    const accion = nuevoEstado === 'inactiva' ? 'desactivar' : 'activar'
    if (!window.confirm(`¿Seguro que deseas ${accion} la obra "${obra.nombre_sitio}"?`)) return
    try {
      await update('obras', obra.id, { estado: nuevoEstado })
      toast(`Obra ${nuevoEstado === 'activa' ? 'activada' : 'desactivada'}`)
      await load()
    } catch {
      toast('Error al actualizar el estado', 'error')
    }
  }

  const existingCodigos = obras.map(o => o.codigo)

  const stats = useMemo(() => {
    const activas = obras.filter(o => o.estado === 'activa').length
    return { activas, inactivas: obras.length - activas, total: obras.length }
  }, [obras])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Obras</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestión de sitios y proyectos</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva obra
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Obras activas"
          value={loading ? '…' : stats.activas}
          loading={loading}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          title="Obras inactivas"
          value={loading ? '…' : stats.inactivas}
          loading={loading}
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <StatCard
          title="Total de sitios"
          value={loading ? '…' : stats.total}
          loading={loading}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          }
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">
            Listado de sitios
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">({obras.length})</span>
            )}
          </h2>
        </div>
        <ObrasTable
          obras={obras}
          loading={loading}
          onEdit={openEdit}
          onToggleEstado={handleToggle}
        />
      </div>

      {/* Modal */}
      <ObrasForm
        isOpen={modal.isOpen}
        onClose={modal.close}
        onSave={handleSave}
        initial={editTarget ? { ...editTarget, alcance: editTarget.alcance ?? '' } : null}
        existingCodigos={existingCodigos}
        editId={editTarget?.id}
      />
    </div>
  )
}
