import { useState, useEffect, useCallback, useMemo } from 'react'
import ObrasTable, { Obra } from '../components/ObrasTable'
import StatCard from '../components/StatCard'
import { useFirestore } from '../hooks/useFirestore'
import { toast } from '../components/shared/Toast'

export default function Obras() {
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const { getAllOrdered } = useFirestore()

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

  const stats = useMemo(() => {
    const activas = obras.filter(o => o.estado === 'activa').length
    return { activas, inactivas: obras.length - activas, total: obras.length }
  }, [obras])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Vista SOLO LECTURA: la gestión de obras vive en Proyectos (SIGP).
          Las obras nacen de los proyectos al entrar en ejecución. */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Obras activas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Vista informativa. Las obras nacen de los proyectos del SIGP al entrar en ejecución
          — su gestión vive en <span className="font-medium">Proyectos</span>.
          Los técnicos se asignan desde <span className="font-medium">Usuarios</span>.
        </p>
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
          color="brand"
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
        <ObrasTable obras={obras} loading={loading} />
      </div>
    </div>
  )
}
