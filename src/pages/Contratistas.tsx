import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import ContratistasTable, { Contratista } from '../components/ContratistasTable'
import ContratistasForm, { ContratistaFormData } from '../components/ContratistasForm'
import StatCard from '../components/StatCard'
import { useModal } from '../hooks/useModal'
import { useFirestore } from '../hooks/useFirestore'
import { toast } from '../components/shared/Toast'
import { arrayUnion, Timestamp } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import {
  puedeGestionarContratistasUI, puedeHabilitarContratistas,
  puedeInscribirContratistas, esTitularHabilitacion,
} from '../types/sigp/permisos'
import Modal from '../components/shared/Modal'
import { resolverCedula, leerPrivado, guardarCedulaPrivada } from '../utils/contratistasPrivado'
import { entradaCambioEstado } from '../utils/contratistasTraza'

export default function Contratistas() {
  const [contratistas, setContratistas] = useState<Contratista[]>([])
  const [tecnicos, setTecnicos] = useState<{ id: string; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Contratista | null>(null)
  const modal = useModal()
  const { add, update, getAllOrdered } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarContratistasUI(user?.rol)
  const puedeInscribir = puedeInscribirContratistas(user?.rol)
  const puedeHabilitar = puedeHabilitarContratistas(user?.rol)
  // Modelo del aval (22-sep): titular (GI) habilita sin salvedad; respaldo
  // (GG/gerencia_administrativa/admin) SIEMPRE con salvedad escrita.
  const esTitular = esTitularHabilitacion(user?.rol)
  const [salvedadTarget, setSalvedadTarget] = useState<Contratista | null>(null)
  const [salvedadTexto, setSalvedadTexto] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('contratistas', 'nombre', 'asc') as Contratista[]
      // C2.1 (H-001): la cédula vive en privado/datos — lectura tolerante con
      // respaldo al campo legado del padre durante la transición.
      const privados = await Promise.all(data.map(c => leerPrivado(c.id)))
      setContratistas(data.map((c, i) => ({ ...c, cedula: resolverCedula(c, privados[i]) })))
      // Bloque 3+5 — técnicos activos para el vínculo contratista ↔ usuario
      const users = await getDocs(query(collection(db, 'users'), where('rol', '==', 'tecnico')))
      setTecnicos(users.docs
        .map(d => ({ id: d.id, nombre: (d.data().nombre as string) ?? d.id, estado: d.data().estado as string }))
        .filter(t => t.estado !== 'pendiente')
        .map(({ id, nombre }) => ({ id, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)))
    } catch {
      toast('Error al cargar contratistas', 'error')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditTarget(null); modal.open() }
  const openEdit = (c: Contratista) => { setEditTarget(c); modal.open() }

  const handleSave = async (data: ContratistaFormData) => {
    try {
      // C2.1 (H-001): la cédula JAMÁS va al doc padre (público, read: if true)
      // — se escribe en el sub-doc privado/datos. El NIT sí queda en el padre
      // (registro mercantil público; la app lo lee).
      const { cedula, ...padre } = data
      if (editTarget) {
        await update('contratistas', editTarget.id, padre)
        await guardarCedulaPrivada(editTarget.id, cedula)
        toast('Contratista actualizado')
      } else {
        const nuevoId = await add('contratistas', padre)
        await guardarCedulaPrivada(nuevoId, cedula)
        toast('Contratista creado')
      }
      await load()
    } catch {
      toast('Error al guardar el contratista', 'error')
      throw new Error('save failed')
    }
  }

  const stats = useMemo(() => {
    const activos = contratistas.filter(c => c.estado === 'activo').length
    const juridicas = contratistas.filter(c => c.tipo === 'juridica').length
    return {
      activos,
      inactivos: contratistas.length - activos,
      juridicas,
      naturales: contratistas.length - juridicas,
    }
  }, [contratistas])

  // 21-sep: la habilitación es el control de calificación de proveedores —
  // cada cambio deja quién/cuándo (y la salvedad, si es de respaldo) en el
  // historial, en el MISMO write del estado (append-only).
  const escribirToggle = async (c: Contratista, salvedad?: string) => {
    const nuevoEstado = c.estado === 'activo' ? 'inactivo' : 'activo'
    try {
      await update('contratistas', c.id, {
        estado: nuevoEstado,
        historial: arrayUnion(entradaCambioEstado(
          c.estado, nuevoEstado,
          { uid: user?.uid ?? '', nombre: user?.nombre, rol: user?.rol },
          Timestamp.now(),
          salvedad,
        )),
      })
      toast(`Contratista ${nuevoEstado === 'activo' ? 'activado' : 'desactivado'}${salvedad ? ' (aval de respaldo)' : ''}`)
      await load()
    } catch {
      toast('Error al actualizar el estado', 'error')
    }
  }

  const handleToggle = async (c: Contratista) => {
    const nuevoEstado = c.estado === 'activo' ? 'inactivo' : 'activo'
    const accion = nuevoEstado === 'inactivo' ? 'desactivar' : 'activar'
    if (esTitular) {
      if (!window.confirm(`¿Seguro que deseas ${accion} a "${c.nombre}"?`)) return
      await escribirToggle(c)
    } else {
      // Respaldo: el aval no es suyo — salvedad obligatoria antes de escribir.
      setSalvedadTexto('')
      setSalvedadTarget(c)
    }
  }

  const confirmarRespaldo = async () => {
    if (!salvedadTarget || !salvedadTexto.trim()) return
    const c = salvedadTarget
    setSalvedadTarget(null)
    await escribirToggle(c, salvedadTexto)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Contratistas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Personas jurídicas y naturales</p>
        </div>
        {puedeInscribir && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo contratista
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Activos"
          value={loading ? '…' : stats.activos}
          loading={loading}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Inactivos"
          value={loading ? '…' : stats.inactivos}
          loading={loading}
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <StatCard
          title="Personas jurídicas"
          value={loading ? '…' : stats.juridicas}
          loading={loading}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          title="Personas naturales"
          value={loading ? '…' : stats.naturales}
          loading={loading}
          color="brand"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">
            Listado de contratistas
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">({contratistas.length})</span>
            )}
          </h2>
        </div>
        <ContratistasTable
          contratistas={contratistas}
          loading={loading}
          onEdit={openEdit}
          onToggleEstado={handleToggle}
          puedeGestionar={puedeGestionar}
          puedeHabilitar={puedeHabilitar}
        />
      </div>

      {/* Aval de RESPALDO (22-sep): quien no es titular del proceso puede
          actuar, pero deja dicho por qué — la salvedad viaja en la misma
          entrada del historial y la regla la exige. */}
      <Modal
        isOpen={salvedadTarget != null}
        title={`Aval de respaldo — ${salvedadTarget?.estado === 'activo' ? 'desactivar' : 'activar'} a ${salvedadTarget?.nombre ?? ''}`}
        onClose={() => setSalvedadTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setSalvedadTarget(null), variant: 'secondary' },
          {
            label: 'Confirmar con salvedad',
            onClick: confirmarRespaldo,
            variant: 'primary',
            disabled: !salvedadTexto.trim(),
          },
        ]}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            La habilitación de contratistas es responsabilidad de <b>Gestión Integral</b> (titular del aval).
            Como respaldo puedes actuar, pero la salvedad es obligatoria: escribe por qué no lo hace el titular.
            Queda registrada junto a tu nombre y la fecha en el historial del contratista.
          </p>
          <textarea
            value={salvedadTexto}
            onChange={e => setSalvedadTexto(e.target.value)}
            rows={3}
            placeholder="Ej.: Ingrid está de vacaciones hasta el 30-sep y el contratista se necesita para la asignación de PRY-2026-050."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </Modal>

      <ContratistasForm
        isOpen={modal.isOpen}
        onClose={modal.close}
        onSave={handleSave}
        tecnicos={tecnicos}
        initial={editTarget ? {
          nombre: editTarget.nombre,
          tipo: editTarget.tipo,
          nit: editTarget.nit ?? '',
          cedula: editTarget.cedula ?? '',
          estado: editTarget.estado,
          usuario_tecnico_id: editTarget.usuario_tecnico_id ?? '',
        } : null}
        editId={editTarget?.id}
      />
    </div>
  )
}
