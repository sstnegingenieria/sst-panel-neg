import { useState } from 'react'
import { Tecnico } from './UsuariosPendientes'
import { ROL_LABEL } from '../types/sigp/roles'

interface Props {
  isAdmin: boolean
  usuarios: Tecnico[]
  loading: boolean
  onCambiarRol: (t: Tecnico, nuevoRol: 'tecnico' | 'sst' | 'admin') => void
  onDesactivar: (t: Tecnico) => void
  onActivar: (t: Tecnico) => void
  /** OC1 — cargo y celular del firmante (admin-only, modal). */
  onEditarFirma: (t: Tecnico) => void
}

const rolBadge: Record<string, string> = {
  sst: 'bg-brand-100 text-brand-800',
  admin: 'bg-purple-100 text-purple-800',
  tecnico: 'bg-gray-100 text-gray-700',
}

// Los roles SIGP/residente muestran su etiqueta central (ROL_LABEL); el
// selector ⇄ Rol queda SOLO para los legacy (tecnico/sst/admin) — cambiar
// un rol SIGP desde acá rompería claims y accesos (se hace por decisión
// aparte, no por un select de 3 opciones).
const ROLES_LEGACY = new Set(['tecnico', 'sst', 'admin'])
const rolLabel: Record<string, string> = ROL_LABEL

const estadoBadge: Record<string, string> = {
  activo: 'bg-green-100 text-green-800',
  inactivo: 'bg-gray-100 text-gray-600',
  pendiente: 'bg-amber-100 text-amber-800',
}

function RolSelector({ tecnico, onCambiarRol }: { tecnico: Tecnico; onCambiarRol: Props['onCambiarRol'] }) {
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

export default function UsuariosPanel({ isAdmin, usuarios, loading, onCambiarRol, onDesactivar, onActivar, onEditarFirma }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 bg-brand-50 rounded-t-lg">
        <h2 className="font-bold text-brand-800">
          Personal de panel
          {!loading && (
            <span className="ml-2 text-xs font-normal text-brand-500">({usuarios.length})</span>
          )}
        </h2>
        <p className="text-xs text-brand-600 mt-0.5">
          Usuarios con acceso al panel web (SST, SIGP y administración) — el botón ✎ Firma captura
          cargo y celular del firmante de documentos
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Nombre</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Email</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Rol</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 2 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-400">
                  No hay personal de panel registrado. Puedes promover un técnico cambiando su rol.
                </td>
              </tr>
            )}

            {!loading &&
              usuarios.map(u => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-800">{u.nombre}</div>
                    {(u.cargo || u.celular) && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {[u.cargo, u.celular].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-xs">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${rolBadge[u.rol] ?? 'bg-gray-100 text-gray-700'}`}>
                      {rolLabel[u.rol] ?? u.rol}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${estadoBadge[u.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {u.estado}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {isAdmin ? (
                        <>
                          <button
                            onClick={() => onEditarFirma(u)}
                            title="Cargo y celular para la firma de documentos (órdenes de compra)"
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-brand-200 text-brand-700 hover:bg-brand-50 transition font-medium"
                          >
                            ✎ Firma
                          </button>
                          {ROLES_LEGACY.has(u.rol) && <RolSelector tecnico={u} onCambiarRol={onCambiarRol} />}
                          {u.estado === 'activo' ? (
                            <button
                              onClick={() => onDesactivar(u)}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition font-medium"
                            >
                              Desactivar
                            </button>
                          ) : (
                            <button
                              onClick={() => onActivar(u)}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition font-medium"
                            >
                              Activar
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Solo lectura</span>
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
