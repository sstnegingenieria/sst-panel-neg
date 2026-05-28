import { useState, useEffect, useCallback, useMemo } from 'react'
import ContratistasTable, { Contratista } from '../components/ContratistasTable'
import ContratistasForm, { ContratistaFormData } from '../components/ContratistasForm'
import StatCard from '../components/StatCard'
import { useModal } from '../hooks/useModal'
import { useFirestore } from '../hooks/useFirestore'
import { toast } from '../components/shared/Toast'

export default function Contratistas() {
  const [contratistas, setContratistas] = useState<Contratista[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Contratista | null>(null)
  const modal = useModal()
  const { add, update, getAllOrdered } = useFirestore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('contratistas', 'nombre', 'asc')
      setContratistas(data as Contratista[])
    } catch {
      toast('Error al cargar contratistas', 'error')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditTarget(null); modal.open() }
  const openEdit = (c: Contratista) => { setEditTarget(c); modal.open() }

  const handleSave = async (data: ContratistaFormData) => {
    try {
      if (editTarget) {
        await update('contratistas', editTarget.id, data)
        toast('Contratista actualizado')
      } else {
        await add('contratistas', data)
        toast('Contratista creado')
      }
      await load()
    } catch {
      toast('Error al guardar el contratista', 'error')
      throw new Error('save failed')
    }
  }

  const stats = useMemo(() => {
    const activos = contratistas.filter(c => c.estado === 'activo').length
    const juridicas = contratistas.filter(c => c.tipo === 'juridica').length
    return {
      activos,
      inactivos: contratistas.length - activos,
      juridicas,
      naturales: contratistas.length - juridicas,
    }
  }, [contratistas])

  const handleToggle = async (c: Contratista) => {
    const nuevoEstado = c.estado === 'activo' ? 'inactivo' : 'activo'
    const accion = nuevoEstado === 'inactivo' ? 'desactivar' : 'activar'
    if (!window.confirm(`¿Seguro que deseas ${accion} a "${c.nombre}"?`)) return
    try {
      await update('contratistas', c.id, { estado: nuevoEstado })
      toast(`Contratista ${nuevoEstado === 'activo' ? 'activado' : 'desactivado'}`)
      await load()
    } catch {
      toast('Error al actualizar el estado', 'error')
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Contratistas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Personas jurídicas y naturales</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo contratista
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Activos"
          value={loading ? '…' : stats.activos}
          loading={loading}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Inactivos"
          value={loading ? '…' : stats.inactivos}
          loading={loading}
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <StatCard
          title="Personas jurídicas"
          value={loading ? '…' : stats.juridicas}
          loading={loading}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          title="Personas naturales"
          value={loading ? '…' : stats.naturales}
          loading={loading}
          color="brand"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">
            Listado de contratistas
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">({contratistas.length})</span>
            )}
          </h2>
        </div>
        <ContratistasTable
          contratistas={contratistas}
          loading={loading}
          onEdit={openEdit}
          onToggleEstado={handleToggle}
        />
      </div>

      <ContratistasForm
        isOpen={modal.isOpen}
        onClose={modal.close}
        onSave={handleSave}
        initial={editTarget ? {
          nombre: editTarget.nombre,
          tipo: editTarget.tipo,
          nit: editTarget.nit ?? '',
          cedula: editTarget.cedula ?? '',
          estado: editTarget.estado,
        } : null}
        editId={editTarget?.id}
      />
    </div>
  )
}
