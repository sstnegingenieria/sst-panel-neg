// Bandeja "Horario y asistencia" (Validador de horario #3) — /administrativa/horario.
//
// Dos pestañas: Registros (reportes de reloj, solo lectura — los eventos los
// escribe la CF registrarEventoHorario) y Ausentismos (gestión con soporte
// obligatorio + detalle médico confidencial). La visibilidad de la ruta y el
// gating por rol ya están resueltos en App.tsx/Sidebar (ROLES_VE_HORARIO);
// aquí solo se gatean las ACCIONES puntuales (config, registrar/anular
// ausentismo, ver detalle médico) con los helpers de permisos.ts.
import { useState } from 'react'
import RegistrosTab from '../../components/sigp/horario/RegistrosTab'
import AusentismosTab from '../../components/sigp/horario/AusentismosTab'

type Tab = 'registros' | 'ausentismos'

export default function HorarioAsistencia() {
  const [tab, setTab] = useState<Tab>('registros')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Horario y asistencia</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Registros de ingreso y salida del panel + ausentismos · la marca la pone el sistema al iniciar/cerrar sesión
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={() => setTab('registros')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
            tab === 'registros' ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Registros
        </button>
        <button onClick={() => setTab('ausentismos')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
            tab === 'ausentismos' ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Ausentismos
        </button>
      </div>

      {tab === 'registros' ? <RegistrosTab /> : <AusentismosTab />}
    </div>
  )
}
