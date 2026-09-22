import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, updateDoc, deleteField, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import { puedeGestionarTecnicosUI } from '../types/sigp/permisos'
import Modal from '../components/shared/Modal'
import { Tecnico } from '../components/UsuariosPendientes'
import UsuariosPendientes from '../components/UsuariosPendientes'
import UsuariosActivos from '../components/UsuariosActivos'
import UsuariosPanel from '../components/UsuariosPanel'
import AsignarObrasModal from '../components/AsignarObrasModal'
import TecnicoPerfilModal from '../components/TecnicoPerfilModal'
import InvitarUsuarioModal from '../components/InvitarUsuarioModal'
import EditarDocumentosModal from '../components/EditarDocumentosModal'
import EditarFirmaModal from '../components/EditarFirmaModal'
import { Obra } from '../components/ObrasTable'
import { useModal } from '../hooks/useModal'
import { useFirestore } from '../hooks/useFirestore'
import { toast } from '../components/shared/Toast'

export default function Usuarios() {
  const { user: currentUser } = useAuth()
  // PR C (22-sep): la gestión de TÉCNICOS (aprobar/rechazar, obras+empleador,
  // activar/desactivar) se destapa a sst y gestion_integral — espejo exacto
  // de puedeAdministrarSST() en reglas, que ya se los permitía. isAdmin queda
  // SOLO para infraestructura (Invitar, ⇄ Rol, ✎ Firma, personal de panel).
  const isAdmin = currentUser?.rol === 'admin'
  const puedeGestionarTecnicos = puedeGestionarTecnicosUI(currentUser?.rol)
  const [pendientes, setPendientes] = useState<Tecnico[]>([])
  const [rechazados, setRechazados] = useState<Tecnico[]>([])
  const [verRechazados, setVerRechazados] = useState(false)
  const [rechazoTarget, setRechazoTarget] = useState<Tecnico | null>(null)
  const [rechazoMotivo, setRechazoMotivo] = useState('')
  const [activos, setActivos] = useState<Tecnico[]>([])
  const [panelUsers, setPanelUsers] = useState<Tecnico[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [contratistas, setContratistas] = useState<{ id: string; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [asignarTarget, setAsignarTarget] = useState<Tecnico | null>(null)
  const [perfilTarget, setPerfilTarget] = useState<Tecnico | null>(null)
  const [docsTarget, setDocsTarget] = useState<Tecnico | null>(null)
  const [firmaTarget, setFirmaTarget] = useState<Tecnico | null>(null)
  const modalAsignar  = useModal()
  const modalPerfil   = useModal()
  const modalInvitar  = useModal()
  const modalDocs     = useModal()
  const modalFirma    = useModal()
  const { getAllOrdered } = useFirestore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Cargar obras (para chips y modal)
      const obrasData = await getAllOrdered('obras', 'nombre_sitio', 'asc')
      setObras(obrasData as Obra[])

      // Bloque 3+5 — contratistas activos (empleador del técnico + aval de obras)
      const contratistasData = await getAllOrdered('contratistas', 'nombre', 'asc') as { id: string; nombre: string; estado?: string }[]
      setContratistas(contratistasData.filter(c => c.estado === 'activo').map(({ id, nombre }) => ({ id, nombre })))

      // Cargar todos los usuarios
      const snap = await getDocs(collection(db, 'users'))
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Tecnico[]

      setPendientes(todos.filter(t => t.estado === 'pendiente'))
      // PR C: 'rechazado' es ESTADO, no borrado — un registro rechazado es
      // información (alguien dijo trabajar para un contratista y no pasó).
      setRechazados(todos.filter(t => t.estado === 'rechazado'))
      setActivos(todos.filter(t => t.rol === 'tecnico' && t.estado !== 'pendiente' && t.estado !== 'rechazado'))
      // OC1: la sección de panel lista TODO el personal con acceso al panel
      // (antes solo sst/admin — los roles SIGP eran invisibles acá y el
      // admin no tenía dónde capturar cargo/celular del firmante de OCs).
      setPanelUsers(todos.filter(t => t.rol !== 'tecnico' && t.estado !== 'pendiente' && t.estado !== 'rechazado'))
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

  // ── Documentos ─────────────────────────────────────────────────────────────
  const openDocs = (t: Tecnico) => { setDocsTarget(t); modalDocs.open() }

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

  // ── Rechazar técnico pendiente — ESTADO, no borrado (PR C, 22-sep) ────────
  // Antes hacía deleteDoc: borraba la evidencia de que alguien intentó
  // registrarse (tensión con la restricción 5.1 destapada al ampliar el
  // acceso). Ahora estado 'rechazado' + motivo obligatorio + traza, y es
  // reversible (Restaurar a pendiente). La app bloquea al rechazado por la
  // vía "sin obras asignadas" (mensaje genérico — la app no se toca).
  const handleRechazar = (t: Tecnico) => {
    setRechazoMotivo('')
    setRechazoTarget(t)
  }

  const confirmarRechazo = async () => {
    if (!rechazoTarget || !rechazoMotivo.trim()) return
    const t = rechazoTarget
    setRechazoTarget(null)
    try {
      await updateDoc(doc(db, 'users', t.id), {
        estado: 'rechazado',
        rechazo: {
          motivo: rechazoMotivo.trim(),
          por: currentUser?.uid ?? '',
          por_nombre: currentUser?.nombre ?? '',
          por_rol: currentUser?.rol ?? '',
          fecha: Timestamp.now(),
        },
      })
      toast(`${t.nombre} rechazado (queda en el registro)`, 'info')
      await load()
    } catch {
      toast('Error al rechazar el técnico', 'error')
    }
  }

  const handleRestaurar = async (t: Tecnico) => {
    if (!window.confirm(`¿Restaurar a ${t.nombre} a la cola de pendientes?`)) return
    try {
      await updateDoc(doc(db, 'users', t.id), {
        estado: 'pendiente',
        'rechazo.restaurado': {
          por: currentUser?.uid ?? '', por_nombre: currentUser?.nombre ?? '', fecha: Timestamp.now(),
        },
      })
      toast(`${t.nombre} restaurado a pendientes`)
      await load()
    } catch {
      toast('Error al restaurar', 'error')
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

  const handleGuardarObras = async (
    tecnicoId: string,
    obraIds: string[],
    contratista: { id: string; nombre: string } | null,
  ) => {
    try {
      await updateDoc(doc(db, 'users', tecnicoId), {
        obras_asignadas: obraIds,
        // Bloque 3+5 — empleador del técnico (base del aval de obras)
        contratista_id: contratista?.id ?? deleteField(),
        contratista_nombre: contratista?.nombre ?? deleteField(),
      })
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Aprobación, roles y gestión de acceso</p>
        </div>
        {isAdmin && (
          <button
            onClick={modalInvitar.open}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invitar usuario
          </button>
        )}
      </div>

      {/* Sección pendientes */}
      <UsuariosPendientes
        puedeGestionar={puedeGestionarTecnicos}
        tecnicos={pendientes}
        loading={loading}
        onAprobar={handleAprobar}
        onRechazar={handleRechazar}
        onVerPerfil={openPerfil}
      />

      {/* Rechazados — registro visible, no borrado (PR C) */}
      {rechazados.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 shadow-sm px-6 py-4">
          <button
            onClick={() => setVerRechazados(v => !v)}
            className="text-sm font-bold text-gray-700 flex items-center gap-2"
          >
            <span>{verRechazados ? '▾' : '▸'}</span>
            Registros rechazados
            <span className="text-xs font-normal text-gray-400">({rechazados.length})</span>
          </button>
          {verRechazados && (
            <table className="min-w-full text-xs mt-3">
              <tbody>
                {rechazados.map(t => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-800 font-medium">{t.nombre}</td>
                    <td className="py-2 pr-3 text-gray-400">{t.email}</td>
                    <td className="py-2 pr-3 text-gray-500">{t.contratista_nombre || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500" title={t.rechazo?.motivo}>
                      {t.rechazo ? `por ${t.rechazo.por_nombre} · ${t.rechazo.fecha?.toDate?.().toLocaleDateString('es-CO') ?? ''} · ${t.rechazo.motivo}` : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {puedeGestionarTecnicos && (
                        <button
                          onClick={() => handleRestaurar(t)}
                          className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                        >
                          Restaurar a pendiente
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Sección activos/inactivos */}
      <UsuariosActivos
        isAdmin={isAdmin}
        puedeGestionar={puedeGestionarTecnicos}
        tecnicos={activos}
        obras={obras}
        loading={loading}
        onAsignarObras={openAsignar}
        onDesactivar={handleDesactivar}
        onActivar={handleActivar}
        onVerPerfil={openPerfil}
        onCambiarRol={handleCambiarRol}
        onEditarDocs={openDocs}
      />

      {/* Motivo del rechazo — obligatorio (el registro es evidencia) */}
      <Modal
        isOpen={rechazoTarget != null}
        title={`Rechazar registro — ${rechazoTarget?.nombre ?? ''}`}
        onClose={() => setRechazoTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setRechazoTarget(null), variant: 'secondary' },
          {
            label: 'Rechazar con motivo',
            onClick: confirmarRechazo,
            variant: 'danger',
            disabled: !rechazoMotivo.trim(),
          },
        ]}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            El registro NO se elimina: queda como <b>rechazado</b> con tu nombre, la fecha y el motivo
            — y puede restaurarse a pendientes si fue un error. La persona no podrá usar la app.
          </p>
          <textarea
            value={rechazoMotivo}
            onChange={e => setRechazoMotivo(e.target.value)}
            rows={3}
            placeholder="Ej.: No aparece en la nómina del contratista que declaró y el contratista no lo reconoce."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </Modal>

      {/* Sección personal de panel (SST / Admin) */}
      <UsuariosPanel
        isAdmin={isAdmin}
        usuarios={panelUsers}
        loading={loading}
        onCambiarRol={handleCambiarRol}
        onDesactivar={handleDesactivar}
        onActivar={handleActivar}
        onEditarFirma={(t) => { setFirmaTarget(t); modalFirma.open() }}
      />

      {/* Modal cargo/celular del firmante (OC1) */}
      <EditarFirmaModal
        isOpen={modalFirma.isOpen}
        onClose={modalFirma.close}
        usuario={firmaTarget}
        onGuardado={() => { toast('Datos de firma actualizados'); load() }}
      />

      {/* Modal asignar obras */}
      <AsignarObrasModal
        isOpen={modalAsignar.isOpen}
        onClose={modalAsignar.close}
        tecnico={asignarTarget}
        obras={obras}
        contratistas={contratistas}
        onSave={handleGuardarObras}
      />

      {/* Modal perfil técnico */}
      <TecnicoPerfilModal
        isOpen={modalPerfil.isOpen}
        onClose={modalPerfil.close}
        tecnico={perfilTarget}
        obras={obras}
      />

      {/* Modal invitar usuario al panel */}
      <InvitarUsuarioModal
        isOpen={modalInvitar.isOpen}
        onClose={modalInvitar.close}
        onCreado={() => { toast('Usuario creado. Se envió el correo de acceso.'); load() }}
      />

      {/* Modal editar documentos */}
      <EditarDocumentosModal
        isOpen={modalDocs.isOpen}
        onClose={modalDocs.close}
        tecnico={docsTarget}
        onGuardado={() => { toast('Documentos actualizados'); load() }}
      />
    </div>
  )
}
