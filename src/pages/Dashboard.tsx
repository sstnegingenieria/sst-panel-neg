import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import StatCard from '../components/StatCard'
import RegistrosTable, { Formulario, TIPO_LABELS } from '../components/RegistrosTable'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

// ── Paleta ───────────────────────────────────────────────────────────────────

const BAR_COLOR  = '#1d4ed8'
const PIE_COLORS = [
  '#1d4ed8', '#7c3aed', '#0891b2', '#059669', '#d97706',
  '#dc2626', '#db2777', '#65a30d', '#0284c7', '#9333ea',
  '#f59e0b', '#10b981', '#ef4444',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function topN<T extends { count: number }>(arr: T[], n = 6): T[] {
  return [...arr].sort((a, b) => b.count - a.count).slice(0, n)
}

function agrupar(formularios: Formulario[], key: keyof Formulario) {
  const mapa: Record<string, number> = {}
  formularios.forEach(f => {
    const val = (f[key] as string) || 'Sin datos'
    mapa[val] = (mapa[val] ?? 0) + 1
  })
  return Object.entries(mapa).map(([name, count]) => ({ name, count }))
}

// ── Tooltip personalizado ────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-sm">
      <p className="font-medium text-gray-700 mb-0.5">{label}</p>
      <p className="text-blue-700 font-semibold">{payload[0].value} formularios</p>
    </div>
  )
}

function PieTooltip({ active, payload }: {
  active?: boolean; payload?: { name: string; value: number }[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-sm">
      <p className="font-medium text-gray-700 mb-0.5">{payload[0].name}</p>
      <p className="text-blue-700 font-semibold">{payload[0].value} formularios</p>
    </div>
  )
}

// ── Componente sección gráfico ────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const [formularios, setFormularios] = useState<Formulario[]>([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const snap = await getDocs(collection(db, 'formularios'))
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Formulario[]
        setFormularios(data)
      } catch (err) {
        console.error('Error loading dashboard:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // ── Stats ────────────────────────────────────────────────────────────────

  const { totalHoy, totalMes, recientes } = useMemo(() => {
    const ahora      = new Date()
    const inicioHoy  = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString()
    const inicioMes  = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()

    let hoy = 0, mes = 0
    formularios.forEach(f => {
      const ts = f.timestamp_creacion ?? ''
      if (ts >= inicioHoy) hoy++
      if (ts >= inicioMes) mes++
    })

    const recientes = [...formularios]
      .sort((a, b) => b.timestamp_creacion.localeCompare(a.timestamp_creacion))
      .slice(0, 10)

    return { totalHoy: hoy, totalMes: mes, recientes }
  }, [formularios])

  // ── Datos para gráficos ──────────────────────────────────────────────────

  const porObra     = useMemo(() => topN(agrupar(formularios, 'proyecto')), [formularios])
  const porTecnico  = useMemo(() => topN(agrupar(formularios, 'responsable')), [formularios])
  const porTipo     = useMemo(() => {
    const raw = agrupar(formularios, 'tipo')
    return raw.map(r => ({ ...r, name: TIPO_LABELS[r.name] ?? r.name }))
  }, [formularios])

  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const sinDatos = !loading && formularios.length === 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500 capitalize mt-0.5">{today}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <StatCard
          title="Total formularios"
          value={formularios.length}
          loading={loading}
          color="purple"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      </div>

      {/* Gráficos */}
      {sinDatos ? null : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Por obra */}
          <ChartCard title="Formularios por obra (top 6)">
            {loading ? <Skeleton h={220} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porObra} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category" dataKey="name" width={110}
                    tick={{ fontSize: 11 }} tickFormatter={s => s.length > 16 ? s.slice(0, 15) + '…' : s}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {porObra.map((_, i) => (
                      <Cell key={i} fill={BAR_COLOR} fillOpacity={1 - i * 0.1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Por técnico */}
          <ChartCard title="Formularios por técnico (top 6)">
            {loading ? <Skeleton h={220} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porTecnico} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category" dataKey="name" width={110}
                    tick={{ fontSize: 11 }} tickFormatter={s => s.length > 16 ? s.slice(0, 15) + '…' : s}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {porTecnico.map((_, i) => (
                      <Cell key={i} fill="#7c3aed" fillOpacity={1 - i * 0.1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Por tipo — dona, ancho completo */}
          <ChartCard title="Distribución por tipo de formulario">
            {loading ? <Skeleton h={260} /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={porTipo}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {porTipo.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Pendientes de revisión SST */}
          <ChartCard title="Estado de revisión SST">
            {loading ? <Skeleton h={260} /> : <RevisionStats formularios={formularios} />}
          </ChartCard>

        </div>
      )}

      {/* Últimos registros */}
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

// ── Subcomponentes ────────────────────────────────────────────────────────────

function Skeleton({ h }: { h: number }) {
  return (
    <div
      className="w-full rounded-lg bg-gray-100 animate-pulse"
      style={{ height: h }}
    />
  )
}

function RevisionStats({ formularios }: { formularios: Formulario[] }) {
  const stats = useMemo(() => {
    let aprobado = 0, rechazado = 0, pendiente = 0
    formularios.forEach(f => {
      const e = f.revision_sst?.estado
      if (e === 'aprobado')   aprobado++
      else if (e === 'rechazado') rechazado++
      else                    pendiente++
    })
    return [
      { name: 'Pendientes',  count: pendiente,  color: '#d97706' },
      { name: 'Aprobados',   count: aprobado,   color: '#059669' },
      { name: 'Rechazados',  count: rechazado,  color: '#dc2626' },
    ]
  }, [formularios])

  const total = formularios.length || 1

  return (
    <div className="flex flex-col justify-center h-full space-y-4 py-4">
      {stats.map(s => (
        <div key={s.name}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 font-medium">{s.name}</span>
            <span className="font-semibold text-gray-800">
              {s.count}
              <span className="text-gray-400 font-normal ml-1">
                ({Math.round((s.count / total) * 100)}%)
              </span>
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
