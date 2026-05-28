import { useAuth } from '../contexts/AuthContext'

interface HeaderProps {
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
}

function initials(name?: string): string {
  if (!name) return '?'
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
      {/* Toggle sidebar */}
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* User chip */}
        <div className="flex items-center gap-2.5 pl-1">
          <div className="text-right hidden sm:block leading-tight">
            <div className="text-sm font-semibold text-gray-800">{user?.nombre}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {user?.rol}
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ring-2 ring-brand-50">
            {initials(user?.nombre)}
          </div>
        </div>

        {/* Divider */}
        <span className="h-6 w-px bg-gray-200" aria-hidden />

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition px-2 py-1.5 rounded-lg hover:bg-red-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:block">Salir</span>
        </button>
      </div>
    </header>
  )
}
