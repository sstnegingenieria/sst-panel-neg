// Maestro de empleados directos de NEG (RRHH). Dato sensible (Ley 1581):
// la lectura la limitan las reglas a gerencia_administrativa/gestion_integral/
// admin — los mismos roles que gestionan. NO es la nómina de contratistas.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useModal } from '../../hooks/useModal'
import { useEmpleadosDirectos, type UsuarioVinculable } from '../../hooks/useEmpleadosDirectos'
import { puedeGestionarEmpleadosUI } from '../../types/sigp/permisos'
import type { EmpleadoDirecto } from '../../types/empleadoDirecto'
import { TIPO_CONTRATO_EMPLEADO_LABEL } from '../../types/empleadoDirecto'
import { enmascararCedula, timestampAFechaInput, type EmpleadoFormData } from '../../utils/empleadosDirectos'
import EmpleadoDirectoModal from '../../components/EmpleadoDirectoModal'
import Modal from '../../components/shared/Modal'
import TextField from '../../components/shared/TextField'
import { toast } from '../../components/shared/Toast'

type FiltroEstado = 'activos' | 'inactivos' | 'todos'

const hoyInput = () => timestampAFechaInput(Timestamp.now())

export default function EmpleadosDirectos() {
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarEmpleadosUI(user?.rol)
  const { cargar, cargarUsuariosVinculables, crear, editar, darDeBaja, reactivar } = useEmpleadosDirectos()

  const [empleados, setEmpleados] = useState<EmpleadoDirecto[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioVinculable[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroEstado>('activos')
  const [visibles, setVisibles] = useState<Set<string>>(new Set())

  const modal = useModal()
  const [editTarget, setEditTarget] = useState<EmpleadoDirecto | null>(null)

  const [bajaTarget, setBajaTarget] = useState<EmpleadoDirecto | null>(null)
  const [fechaBaja, setFechaBaja] = useState('')
  const [bajando, setBajando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [emps, us] = await Promise.all([cargar(), cargarUsuariosVinculables()])
      setEmpleados(emps)
      setUsuarios(us)
    } catch {
      toast('Error al cargar los empleados', 'error')
    } finally {
      setLoading(false)
    }
  }, [cargar, cargarUsuariosVinculables])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return empleados
      .filter(e => filtro === 'todos' ? true : e.activo === (filtro === 'activos'))
      .filter(e => !q
        || e.nombre.toLowerCase().includes(q)
        || e.cedula.includes(q.replace(/[.\s-]/g, ''))
        || e.cargo.toLowerCase().includes(q)
        || e.area.toLowerCase().includes(q))
  }, [empleados, busqueda, filtro])

  const nombreVinculo = (uid: string | null) => {
    if (!uid) return null
    const u = usuarios.find(x => x.id === uid)
    return u ? (u.nombre || u.email) : 'Usuario vinculado'
  }

  const abrirCrear = () => { setEditTarget(null); modal.open() }
  const abrirEditar = (e: EmpleadoDirecto) => { setEditTarget(e); modal.open() }

  const handleSave = async (form: EmpleadoFormData) => {
    if (!user) return
    try {
      if (editTarget) {
        await editar(editTarget.id, form, user.uid)
        toast('Empleado actualizado')
      } else {
        await crear(form, user.uid)
        toast('Empleado creado')
      }
      modal.close()
      await load()
    } catch {
      toast('No se pudo guardar el empleado', 'error')
    }
  }

  const abrirBaja = (e: EmpleadoDirecto) => { setBajaTarget(e); setFechaBaja(hoyInput()) }

  const confirmarBaja = async () => {
    if (!user || !bajaTarget) return
    setBajando(true)
    try {
      const ok = await darDeBaja(bajaTarget, fechaBaja, user.uid)
      if (!ok) { toast('La fecha de retiro es obligatoria y no puede ser anterior al ingreso', 'error'); return }
      toast('Empleado dado de baja')
      setBajaTarget(null)
      await load()
    } catch {
      toast('No se pudo dar de baja', 'error')
    } finally {
      setBajando(false)
    }
  }

  const handleReactivar = async (e: EmpleadoDirecto) => {
    if (!user) return
    if (!window.confirm(`¿Reactivar a "${e.nombre}"?`)) return
    try {
      await reactivar(e.id, user.uid)
      toast('Empleado reactivado')
      await load()
    } catch {
      toast('No se pudo reactivar', 'error')
    }
  }

  const toggleVisible = (id: string) =>
    setVisibles(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const fFecha = (t?: { toDate?: () => Date } | null) =>
    t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-gray-900">Empleados directos</h1>
          <p className="text-sm text-gray-500">
            Maestro de personal vinculado directamente a NEG. Contiene datos personales: acceso restringido.
          </p>
        </div>
        {puedeGestionar && (
          <button onClick={abrirCrear}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white transition">
            ＋ Nuevo empleado
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, cédula, cargo o área…"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400" />
        <select value={filtro} onChange={e => setFiltro(e.target.value as FiltroEstado)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400">
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <p className="p-8 text-center text-sm text-gray-400">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No hay empleados para mostrar.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Cédula</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Área</th>
                <th className="px-4 py-3">Contrato</th>
                <th className="px-4 py-3">Estado</th>
                {puedeGestionar && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(e => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{e.nombre}</p>
                    {e.user_uid && (
                      <p className="text-[11px] text-gray-400">Cuenta: {nombreVinculo(e.user_uid)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600">
                    <span>{visibles.has(e.id) ? e.cedula : enmascararCedula(e.cedula)}</span>
                    <button onClick={() => toggleVisible(e.id)}
                      className="ml-2 text-xs text-brand-700 hover:underline font-sans"
                      aria-label={visibles.has(e.id) ? 'Ocultar cédula' : 'Ver cédula'}>
                      {visibles.has(e.id) ? 'ocultar' : 'ver'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.cargo}</td>
                  <td className="px-4 py-3 text-gray-600">{e.area}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {TIPO_CONTRATO_EMPLEADO_LABEL[e.tipo_contrato] ?? e.tipo_contrato}
                    <p className="text-[11px] text-gray-400">Ingreso {fFecha(e.fecha_ingreso)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {e.activo ? (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Activo</span>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        Retirado {fFecha(e.fecha_retiro)}
                      </span>
                    )}
                  </td>
                  {puedeGestionar && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => abrirEditar(e)}
                        className="text-xs font-medium text-brand-700 hover:underline mr-3">Editar</button>
                      {e.activo ? (
                        <button onClick={() => abrirBaja(e)}
                          className="text-xs font-medium text-red-600 hover:underline">Dar de baja</button>
                      ) : (
                        <button onClick={() => handleReactivar(e)}
                          className="text-xs font-medium text-emerald-700 hover:underline">Reactivar</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {puedeGestionar && (
        <EmpleadoDirectoModal
          isOpen={modal.isOpen}
          onClose={modal.close}
          onSave={handleSave}
          initial={editTarget}
          empleados={empleados}
          usuarios={usuarios}
        />
      )}

      <Modal
        isOpen={!!bajaTarget}
        onClose={() => setBajaTarget(null)}
        title="Dar de baja"
        size="sm"
        actions={[
          { label: 'Cancelar', onClick: () => setBajaTarget(null), variant: 'secondary' },
          { label: 'Confirmar baja', onClick: confirmarBaja, variant: 'danger', loading: bajando },
        ]}
      >
        <p className="text-sm text-gray-600 mb-4">
          {bajaTarget?.nombre} quedará inactivo. El registro se conserva (no se borra) y se puede reactivar.
        </p>
        <TextField label="Fecha de retiro" required type="date" value={fechaBaja} onChange={setFechaBaja} />
      </Modal>
    </div>
  )
}
