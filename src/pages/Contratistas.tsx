import { useState, useEffect, useCallback } from 'react'
import ContratistasTable, { Contratista } from '../components/ContratistasTable'
import ContratistasForm, { ContratistaFormData } from '../components/ContratistasForm'
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
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo contratista
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Todos los contratistas
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
