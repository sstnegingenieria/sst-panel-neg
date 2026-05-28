interface StatCardProps {
  title: string
  value: number | string
  loading?: boolean
  icon: React.ReactNode
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red'
  /** Chip de variación opcional (p. ej. "+12% vs mes ant."). */
  delta?: { label: string; positive?: boolean }
}

const iconBg = {
  blue:   'bg-brand-50 text-brand-700',
  green:  'bg-emerald-50 text-emerald-700',
  orange: 'bg-amber-50 text-amber-700',
  purple: 'bg-violet-50 text-violet-700',
  red:    'bg-red-50 text-red-600',
}

export default function StatCard({ title, value, loading, icon, color, delta }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg[color]}`}>
          {icon}
        </div>
        {delta && (
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              delta.positive === false
                ? 'bg-red-50 text-red-600'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {delta.label}
          </span>
        )}
      </div>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </p>
      {loading ? (
        <div className="mt-1.5 h-8 w-20 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className="mt-0.5 text-3xl font-display font-bold text-gray-900 leading-tight">
          {value}
        </p>
      )}
    </div>
  )
}
