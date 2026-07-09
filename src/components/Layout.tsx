import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useMediaQuery } from '../hooks/useMediaQuery'

export default function Layout() {
  const esEscritorio = useMediaQuery('(min-width: 1024px)')
  const [collapsed, setCollapsed] = useState(false)   // rail (escritorio)
  const [mobileOpen, setMobileOpen] = useState(false) // cajón (móvil)

  // La hamburguesa colapsa el rail en escritorio y abre/cierra el cajón en móvil.
  const toggle = () => {
    if (esEscritorio) setCollapsed(c => !c)
    else setMobileOpen(o => !o)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        collapsed={esEscritorio ? collapsed : false}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      {/* Backdrop del cajón (solo móvil) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onToggleSidebar={toggle} sidebarCollapsed={collapsed} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
