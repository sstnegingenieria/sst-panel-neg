import { useState } from 'react'
import { Tecnico } from './UsuariosPendientes'
import { Obra } from './ObrasTable'

interface UsuariosActivosProps {
  tecnicos: Tecnico[]
  obras: Obra[]
  loading: boolean
  onAsignarObras: (t: Tecnico) => void
  onDesactivar: (t: Tecnico) => void
  onActivar: (t: Tecnico) => void
  onVerPerfil: (t: Tecnico) => void
  onCambiarRol: (t: Tecnico, nuevoRol: 'tecnico' | 'sst' | 'admin') => void
}

function RolSelector({ tecnico, onCambiarRol }: { tecnico: Tecnico; onCambiarRol: UsuariosActivosProps['onCambiarRol'] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition font-medium"
      >
        ⇄ Rol
      </button>
      {open && (
        <select
          autoFocus
          size={3}
          className="absolute right-0 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg text-xs text-gray-700 cursor-pointer"
          onChange={e => {
            const val = e.target.value as 'tecnico' | 'sst' | 'admin'
            onCambiarRol(tecnico, val)
            setOpen(false)
          }}
          onBlur={() => setOpen(false)}
        >
          <option value="tecnico">Técnico</option>
          <option value="sst">SST</option>
          <option value="admin">Admin</option>
        </select>
      )}
    </div>
  )
}

const estadoBadge = {
  activo: 'bg-green-100 text-green-800',
  inactivo: 'bg-red-100 text-red-800',
  pendiente: 'bg-amber-100 text-amber-800',
}

export default function UsuariosActivos({
  tecnicos, obras, loading, onAsignarObras, onDesactivar, onActivar, onVerPerfil, onCambiarRol,
}: UsuariosActivosProps) {
  const obraMap = Object.fromEntries(obras.map(o => [o.id, o.nombre_sitio]))

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">
          Técnicos registrados
          {!loading && (
            <span className="ml-2 text-xs font-normal text-gray-400">({tecnicos.length})</span>
          )}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Nombre</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cédula</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">EPS / ARL</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Contratista</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Obras asignadas</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && tecnicos.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  No hay técnicos registrados.
                </td>
              </tr>
            )}

            {!loading &&
              tecnicos.map(t => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-800">{t.nombre}</div>
                    <div className="text-xs text-gray-400">{t.email}</div>
                  </td>
                  <td className="py-3 px-4 text-gray-700 font-mono text-xs">
                    {t.cedula ?? <span className="text-gray-300 font-sans">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-xs text-gray-700">
                      {t.eps
                        ? <span><span className="text-gray-400">EPS:</span> {t.eps}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </div>
                    <div className="text-xs text-gray-700 mt-0.5">
                      {t.arl
                        ? <span><span className="text-gray-400">ARL:</span> {t.arl}</span>
                        : null
                      }
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{t.contratista_nombre ?? '—'}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {(t.obras_asignadas ?? []).length === 0 && (
                        <span className="text-gray-400 text-xs">Sin asignar</span>
                      )}
                      {(t.obras_asignadas ?? []).map(id => (
                        <span
                          key={id}
                          className="inline-flex px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs border border-blue-100"
                        >
                          {obraMap[id] ?? id}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${estadoBadge[t.estado]}`}>
                      {t.estado}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <button
                        onClick={() => onVerPerfil(t)}
                        title="Ver perfil completo"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium"
                      >
                        👤 Ver
                      </button>
                      <button
                        onClick={() => onAsignarObras(t)}
                        title="Asignar obras"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition font-medium"
                      >
                        🔗 Obras
                      </button>
                      <RolSelector tecnico={t} onCambiarRol={onCambiarRol} />
                      {t.estado === 'activo' ? (
                        <button
                          onClick={() => onDesactivar(t)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition font-medium"
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          onClick={() => onActivar(t)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition font-medium"
                        >
                          Activar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
