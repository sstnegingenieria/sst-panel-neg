import { useState, useEffect, useCallback, useMemo } from 'react'
import ClientesTable from '../../components/sigp/clientes/ClientesTable'
import ClientesForm, { ClienteFormData } from '../../components/sigp/clientes/ClientesForm'
import StatCard from '../../components/StatCard'
import { useModal } from '../../hooks/useModal'
import { useFirestore } from '../../hooks/useFirestore'
import { toast } from '../../components/shared/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { puedeGestionarClientesUI } from '../../types/sigp/permisos'
import type { Cliente } from '../../types/sigp/cliente'

export default function ClientesSigp() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [editTarget, setEditTarget] = useState<Cliente | null>(null)
  const modal = useModal()
  const { add, update, getAllOrdered } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarClientesUI(user?.rol)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('clientes', 'nombre', 'asc')
      setClientes(data as Cliente[])
    } catch {
      toast('Error al cargar clientes', 'error')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditTarget(null); modal.open() }
  const openEdit = (c: Cliente) => { setEditTarget(c); modal.open() }

  const handleSave = async (data: ClienteFormData) => {
    try {
      if (editTarget) {
        await update('clientes', editTarget.id, data)
        toast('Cliente actualizado')
      } else {
        // mapeos_lpu_guardados nace vacío; lo alimenta el wizard de LPU (1.1.c).
        await add('clientes', { ...data, mapeos_lpu_guardados: [] })
        toast('Cliente creado')
      }
      await load()
    } catch {
      toast('Error al guardar el cliente', 'error')
      throw new Error('save failed')
    }
  }

  const handleToggle = async (c: Cliente) => {
    const nuevoEstado = c.estado === 'activo' ? 'inactivo' : 'activo'
    const accion = nuevoEstado === 'inactivo' ? 'desactivar' : 'activar'
    if (!window.confirm(`¿Seguro que deseas ${accion} a "${c.nombre}"?`)) return
    try {
      await update('clientes', c.id, { estado: nuevoEstado })
      toast(`Cliente ${nuevoEstado === 'activo' ? 'activado' : 'desactivado'}`)
      await load()
    } catch {
      toast('Error al actualizar el estado', 'error')
    }
  }

  const stats = useMemo(() => {
    const activos = clientes.filter(c => c.estado === 'activo').length
    return {
      total: clientes.length,
      activos,
      inactivos: clientes.length - activos,
    }
  }, [clientes])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(
      c => c.nombre.toLowerCase().includes(q) || c.nit.toLowerCase().includes(q),
    )
  }, [clientes, busqueda])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
            SIGP · Comercial
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Empresas cliente, contactos y condiciones comerciales
          </p>
        </div>
        {puedeGestionar && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo cliente
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Total"
          value={loading ? '…' : stats.total}
          loading={loading}
          color="brand"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
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
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="font-bold text-gray-800">
            Listado de clientes
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">({filtrados.length})</span>
            )}
          </h2>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o NIT…"
            className="w-56 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
        <ClientesTable
          clientes={filtrados}
          loading={loading}
          onEdit={openEdit}
          onToggleEstado={handleToggle}
          puedeGestionar={puedeGestionar}
        />
      </div>

      <ClientesForm
        isOpen={modal.isOpen}
        onClose={modal.close}
        onSave={handleSave}
        initial={editTarget}
      />
    </div>
  )
}
