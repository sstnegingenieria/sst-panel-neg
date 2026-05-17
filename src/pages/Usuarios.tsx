import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import { Tecnico } from '../components/UsuariosPendientes'
import UsuariosPendientes from '../components/UsuariosPendientes'
import UsuariosActivos from '../components/UsuariosActivos'
import UsuariosPanel from '../components/UsuariosPanel'
import AsignarObrasModal from '../components/AsignarObrasModal'
import TecnicoPerfilModal from '../components/TecnicoPerfilModal'
import { Obra } from '../components/ObrasTable'
import { useModal } from '../hooks/useModal'
import { useFirestore } from '../hooks/useFirestore'
import { toast } from '../components/shared/Toast'

export default function Usuarios() {
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.rol === 'admin'
  const [pendientes, setPendientes] = useState<Tecnico[]>([])
  const [activos, setActivos] = useState<Tecnico[]>([])
  const [panelUsers, setPanelUsers] = useState<Tecnico[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [asignarTarget, setAsignarTarget] = useState<Tecnico | null>(null)
  const [perfilTarget, setPerfilTarget] = useState<Tecnico | null>(null)
  const modalAsignar = useModal()
  const modalPerfil = useModal()
  const { getAllOrdered } = useFirestore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Cargar obras (para chips y modal)
      const obrasData = await getAllOrdered('obras', 'nombre_sitio', 'asc')
      setObras(obrasData as Obra[])

      // Cargar todos los usuarios
      const snap = await getDocs(collection(db, 'users'))
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Tecnico[]

      setPendientes(todos.filter(t => t.estado === 'pendiente'))
      setActivos(todos.filter(t => t.rol === 'tecnico' && t.estado !== 'pendiente'))
      setPanelUsers(todos.filter(t => (t.rol === 'sst' || t.rol === 'admin') && t.estado !== 'pendiente'))
    } catch (err) {
      console.error(err)
      toast('Error al cargar usuarios', 'error')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Perfil ─────────────────────────────────────────────────────────────────
  const openPerfil = (t: Tecnico) => { setPerfilTarget(t); modalPerfil.open() }

  // ── Aprobar técnico pendiente ──────────────────────────────────────────────
  const handleAprobar = async (t: Tecnico) => {
    if (!window.confirm(`¿Aprobar a ${t.nombre}? Se le dará acceso a la app.`)) return
    try {
      await updateDoc(doc(db, 'users', t.id), {
        estado: 'activo',
        fecha_aprobacion: Timestamp.now(),
      })
      toast(`${t.nombre} aprobado correctamente`)
      await load()
    } catch {
      toast('Error al aprobar el técnico', 'error')
    }
  }

  // ── Rechazar / eliminar técnico pendiente ──────────────────────────────────
  const handleRechazar = async (t: Tecnico) => {
    if (!window.confirm(`¿Rechazar y eliminar a ${t.nombre}? Esta acción no se puede deshacer.`)) return
    try {
      await deleteDoc(doc(db, 'users', t.id))
      toast(`${t.nombre} rechazado y eliminado`, 'info')
      await load()
    } catch {
      toast('Error al rechazar el técnico', 'error')
    }
  }

  // ── Desactivar / activar ───────────────────────────────────────────────────
  const handleDesactivar = async (t: Tecnico) => {
    if (!window.confirm(`¿Desactivar a ${t.nombre}? No podrá usar la app.`)) return
    try {
      await updateDoc(doc(db, 'users', t.id), { estado: 'inactivo' })
      toast(`${t.nombre} desactivado`)
      await load()
    } catch {
      toast('Error al desactivar', 'error')
    }
  }

  const handleActivar = async (t: Tecnico) => {
    try {
      await updateDoc(doc(db, 'users', t.id), { estado: 'activo' })
      toast(`${t.nombre} activado`)
      await load()
    } catch {
      toast('Error al activar', 'error')
    }
  }

  // ── Cambiar rol ────────────────────────────────────────────────────────────
  const handleCambiarRol = async (t: Tecnico, nuevoRol: 'tecnico' | 'sst' | 'admin') => {
    try {
      await updateDoc(doc(db, 'users', t.id), { rol: nuevoRol })
      toast(`Rol de ${t.nombre} actualizado a ${nuevoRol}`)
      await load()
    } catch {
      toast('Error al cambiar el rol', 'error')
    }
  }

  // ── Asignar obras ──────────────────────────────────────────────────────────
  const openAsignar = (t: Tecnico) => { setAsignarTarget(t); modalAsignar.open() }

  const handleGuardarObras = async (tecnicoId: string, obraIds: string[]) => {
    try {
      await updateDoc(doc(db, 'users', tecnicoId), { obras_asignadas: obraIds })
      toast('Obras asignadas correctamente')
      await load()
    } catch {
      toast('Error al asignar obras', 'error')
      throw new Error('save failed')
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
        <p className="text-sm text-gray-500 mt-0.5">Aprobación, roles y gestión de acceso</p>
      </div>

      {/* Sección pendientes */}
      <UsuariosPendientes
        isAdmin={isAdmin}
        tecnicos={pendientes}
        loading={loading}
        onAprobar={handleAprobar}
        onRechazar={handleRechazar}
        onVerPerfil={openPerfil}
      />

      {/* Sección activos/inactivos */}
      <UsuariosActivos
        isAdmin={isAdmin}
        tecnicos={activos}
        obras={obras}
        loading={loading}
        onAsignarObras={openAsignar}
        onDesactivar={handleDesactivar}
        onActivar={handleActivar}
        onVerPerfil={openPerfil}
        onCambiarRol={handleCambiarRol}
      />

      {/* Sección personal de panel (SST / Admin) */}
      <UsuariosPanel
        isAdmin={isAdmin}
        usuarios={panelUsers}
        loading={loading}
        onCambiarRol={handleCambiarRol}
        onDesactivar={handleDesactivar}
        onActivar={handleActivar}
      />

      {/* Modal asignar obras */}
      <AsignarObrasModal
        isOpen={modalAsignar.isOpen}
        onClose={modalAsignar.close}
        tecnico={asignarTarget}
        obras={obras}
        onSave={handleGuardarObras}
      />

      {/* Modal perfil técnico */}
      <TecnicoPerfilModal
        isOpen={modalPerfil.isOpen}
        onClose={modalPerfil.close}
        tecnico={perfilTarget}
        obras={obras}
      />
    </div>
  )
}
