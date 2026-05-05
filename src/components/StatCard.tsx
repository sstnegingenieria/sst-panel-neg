interface StatCardProps {
  title: string
  value: number | string
  loading?: boolean
  icon: React.ReactNode
  color: 'blue' | 'green' | 'orange'
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-green-50 text-green-700 border-green-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
}

const iconBg = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  orange: 'bg-orange-100 text-orange-600',
}

export default function StatCard({ title, value, loading, icon, color }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 flex items-center gap-4 ${colorMap[color]}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium opacity-75">{title}</p>
        {loading ? (
          <div className="mt-1 h-7 w-16 bg-current opacity-20 rounded animate-pulse" />
        ) : (
          <p className="text-3xl font-bold">{value}</p>
        )}
      </div>
    </div>
  )
}
