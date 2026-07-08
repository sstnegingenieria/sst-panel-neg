import { useState, useEffect, useMemo, useCallback } from 'react'
import LpusTable from '../../components/sigp/lpus/LpusTable'
import ImportarLpuWizard from '../../components/sigp/lpus/ImportarLpuWizard'
import StatCard from '../../components/StatCard'
import { useLpus } from '../../hooks/sigp/useLpus'
import { useFirestore } from '../../hooks/useFirestore'
import { toast } from '../../components/shared/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { puedeGestionarLpusUI } from '../../types/sigp/permisos'
import type { Cliente } from '../../types/sigp/cliente'

export default function LpusSigp() {
  const { lpus, loading, reload } = useLpus()
  const { getAllOrdered } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarLpusUI(user?.rol)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [filtroCliente, setFiltroCliente] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)

  const loadClientes = useCallback(async () => {
    try {
      const data = await getAllOrdered('clientes', 'nombre', 'asc')
      setClientes(data as Cliente[])
    } catch {
      toast('Error al cargar clientes', 'error')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadClientes() }, [loadClientes])

  const clienteNombres = useMemo(
    () => Object.fromEntries(clientes.map(c => [c.id, c.nombre])),
    [clientes],
  )

  const filtradas = useMemo(
    () => (filtroCliente ? lpus.filter(l => l.cliente_id === filtroCliente) : lpus),
    [lpus, filtroCliente],
  )

  const stats = useMemo(() => ({
    total: lpus.length,
    vigentes: lpus.filter(l => l.estado === 'vigente').length,
    clientes: new Set(lpus.map(l => l.cliente_id)).size,
  }), [lpus])

  const handleImportar = () => setWizardOpen(true)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
            SIGP · Comercial
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Listas de precios (LPU)</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Listas de precios unitarios por cliente, importadas desde Excel
          </p>
        </div>
        {puedeGestionar && (
          <button
            onClick={handleImportar}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importar LPU
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="LPU totales"
          value={loading ? '…' : stats.total}
          loading={loading}
          color="brand"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          title="Vigentes"
          value={loading ? '…' : stats.vigentes}
          loading={loading}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Clientes con LPU"
          value={loading ? '…' : stats.clientes}
          loading={loading}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="font-bold text-gray-800">
            Listas importadas
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">({filtradas.length})</span>
            )}
          </h2>
          <select
            value={filtroCliente}
            onChange={e => setFiltroCliente(e.target.value)}
            className="w-56 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">Todos los clientes</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <LpusTable lpus={filtradas} loading={loading} clienteNombres={clienteNombres} />
      </div>

      <ImportarLpuWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        clientes={clientes.filter(c => c.estado === 'activo')}
        lpus={lpus}
        onImportado={reload}
      />
    </div>
  )
}
