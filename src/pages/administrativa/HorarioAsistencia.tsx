// Bandeja "Horario y asistencia" — /administrativa/horario.
//
// Dos pestañas: Presencia (jornadas por LATIDO — rebuild oct-2026; el
// subtítulo dice exactamente qué mide: panel en uso, no qué se hace) y
// Ausentismos (gestión con soporte obligatorio + detalle médico
// confidencial — colección del acuerdo con el frente SGI/SST, intacta).
// La visibilidad de la ruta y el gating por rol ya están resueltos en
// App.tsx/Sidebar (ROLES_VE_HORARIO); aquí solo las ACCIONES puntuales.
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
          Presencia en el panel — mide que el panel está <b>en uso</b>, no qué se hace en él.
          Los roles que operan en la app móvil o en obra no se miden aquí: su cero no es ausencia.
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={() => setTab('registros')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
            tab === 'registros' ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Presencia
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
