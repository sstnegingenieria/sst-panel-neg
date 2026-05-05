import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import StatCard from '../components/StatCard'
import RegistrosTable, { Formulario } from '../components/RegistrosTable'

export default function Dashboard() {
  const navigate = useNavigate()
  const [recientes, setRecientes] = useState<Formulario[]>([])
  const [totalHoy, setTotalHoy]   = useState(0)
  const [totalMes, setTotalMes]   = useState(0)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        // Últimos 10 formularios
        const q = query(
          collection(db, 'formularios'),
          orderBy('timestamp_creacion', 'desc'),
          limit(10),
        )
        const snap = await getDocs(q)
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Formulario[]
        setRecientes(rows)

        // Stats: hoy y este mes (filtrado client-side sobre todos los formularios)
        const allSnap = await getDocs(collection(db, 'formularios'))
        const ahora = new Date()
        const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString()
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()

        let hoy = 0
        let mes = 0
        allSnap.forEach(d => {
          const ts: string = d.data().timestamp_creacion ?? ''
          if (ts >= inicioHoy) hoy++
          if (ts >= inicioMes) mes++
        })
        setTotalHoy(hoy)
        setTotalMes(mes)
      } catch (err) {
        console.error('Error loading dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500 capitalize mt-0.5">{today}</p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Formularios hoy"
          value={totalHoy}
          loading={loading}
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          title="Formularios este mes"
          value={totalMes}
          loading={loading}
          color="green"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
      </div>

      {/* Tabla de recientes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Últimos 10 formularios</h2>
          <button
            onClick={() => navigate('/registros')}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium transition"
          >
            Ver todos →
          </button>
        </div>
        <RegistrosTable
          formularios={recientes}
          loading={loading}
          onVerDetalle={() => navigate('/registros')}
        />
      </div>
    </div>
  )
}
