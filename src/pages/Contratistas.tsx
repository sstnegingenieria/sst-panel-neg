import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, getDocs, query, where, updateDoc, deleteField } from 'firebase/firestore'
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
  puedeInscribirContratistas, esTitularHabilitacion, puedeGestionarNominaUI,
  puedeGestionarTecnicosUI, puedeGestionarEmpleadosUI,
} from '../types/sigp/permisos'
import Modal from '../components/shared/Modal'
import NominaModal from '../components/NominaModal'
import { getDoc, doc as docRef } from 'firebase/firestore'
import type { NominaContratista } from '../utils/contratistasNomina'
import { normalizarCedula } from '../utils/contratistasNomina'
import { resolverCedula, leerPrivado, guardarCedulaPrivada } from '../utils/contratistasPrivado'
import { entradaCambioEstado } from '../utils/contratistasTraza'
// C5a-2 — una persona, una ficha: la cuenta de la app se gestiona DESDE la
// ficha del contratista; reuso de los modales reales de Usuarios (misma
// mecánica, mismos writes — las pantallas conviven hasta el C5b).
import { ChipVerificacionNomina } from '../components/UsuariosPendientes'
import type { Tecnico } from '../components/UsuariosPendientes'
import AsignarObrasModal from '../components/AsignarObrasModal'
import TecnicoPerfilModal from '../components/TecnicoPerfilModal'
import type { Obra } from '../components/ObrasTable'
import { useEmpleadosDirectos } from '../hooks/useEmpleadosDirectos'
import type { EmpleadoDirecto } from '../types/empleadoDirecto'
import { TIPO_CONTRATO_EMPLEADO_LABEL } from '../types/empleadoDirecto'

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
  // PR A nómina: contratista cuyo modal está abierto + cédulas VIVAS de los
  // DEMÁS (guard "ya en otra nómina" de la vista previa).
  const puedeNomina = puedeGestionarNominaUI(user?.rol)
  const [nominaTarget, setNominaTarget] = useState<Contratista | null>(null)
  const [nominasOtros, setNominasOtros] = useState<Record<string, Set<string>>>({})
  // C5a (OK 08-oct): el camino hacia la capacidad — contador VISIBLE de
  // contratistas activos sin nómina cargada (null = aún sin medir). La
  // lección de los módulos vacíos: un botón chiquito por fila no es un flujo.
  const [conNomina, setConNomina] = useState<Set<string> | null>(null)
  // C5a-2 — cuentas de la app (users rol tecnico, TODOS los estados) para el
  // bloque "Cuenta en la app" de las fichas y la cola de pendientes.
  const puedeGestionarTecnicos = puedeGestionarTecnicosUI(user?.rol)
  const [cuentas, setCuentas] = useState<Tecnico[]>([])
  const [obras, setObras] = useState<Obra[] | null>(null)   // lazy — solo si se necesita
  const [asignarTarget, setAsignarTarget] = useState<Tecnico | null>(null)
  const [perfilTarget, setPerfilTarget] = useState<Tecnico | null>(null)
  const [rechazoTarget, setRechazoTarget] = useState<Tecnico | null>(null)
  const [rechazoMotivo, setRechazoMotivo] = useState('')
  // C5a-2 — NEG · personal directo (lectura de empleados_directos; el
  // maestro lo mantiene el frente SGI/SST — cero escrituras desde aquí).
  const puedeVerEmpleados = puedeGestionarEmpleadosUI(user?.rol)
  const { cargar: cargarEmpleados } = useEmpleadosDirectos()
  const [empleados, setEmpleados] = useState<EmpleadoDirecto[] | null>(null)
  const [verEmpleados, setVerEmpleados] = useState(false)

  const cargarObras = useCallback(async () => {
    if (obras) return obras
    const data = await getAllOrdered('obras', 'nombre_sitio', 'asc') as Obra[]
    setObras(data)
    return data
  }, [obras]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirNomina = async (c: Contratista) => {
    try {
      const otros = contratistas.filter(x => x.id !== c.id)
      const lecturas = await Promise.all(otros.map(x =>
        getDoc(docRef(db, 'contratistas', x.id, 'privado', 'nomina')).catch(() => null)))
      const mapa: Record<string, Set<string>> = {}
      otros.forEach((x, i) => {
        const data = lecturas[i]?.exists() ? (lecturas[i]!.data() as NominaContratista) : null
        const vivas = Object.entries(data?.trabajadores ?? {})
          .filter(([, t]) => !t.retirado).map(([ced]) => ced)
        if (vivas.length) mapa[x.id] = new Set(vivas)
      })
      setNominasOtros(mapa)
    } catch {
      setNominasOtros({})
    }
    setNominaTarget(c)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('contratistas', 'nombre', 'asc') as Contratista[]
      // C2.1 (H-001): la cédula vive en privado/datos — lectura tolerante con
      // respaldo al campo legado del padre durante la transición.
      const privados = await Promise.all(data.map(c => leerPrivado(c.id)))
      setContratistas(data.map((c, i) => ({ ...c, cedula: resolverCedula(c, privados[i]) })))
      // Bloque 3+5 — técnicos activos para el vínculo contratista ↔ usuario.
      // C5a-2: la MISMA query alimenta las fichas y la cola de pendientes
      // (docs completos, todos los estados).
      const users = await getDocs(query(collection(db, 'users'), where('rol', '==', 'tecnico')))
      const todas = users.docs.map(d => ({ id: d.id, ...d.data() })) as Tecnico[]
      setCuentas(todas)
      setTecnicos(todas
        .filter(t => t.estado !== 'pendiente' && t.estado !== 'rechazado')
        .map(({ id, nombre }) => ({ id, nombre: nombre ?? id }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)))
      // C5a — contador de nóminas (solo quien gestiona nómina lee el privado).
      if (puedeGestionarNominaUI(user?.rol)) {
        try {
          const lecturas = await Promise.all(data.map(c =>
            getDoc(docRef(db, 'contratistas', c.id, 'privado', 'nomina')).catch(() => null)))
          const ids = new Set<string>()
          data.forEach((c, i) => {
            const n = lecturas[i]?.exists() ? (lecturas[i]!.data() as NominaContratista) : null
            if (Object.values(n?.trabajadores ?? {}).some(t => !t.retirado)) ids.add(c.id)
          })
          setConNomina(ids)
        } catch { setConNomina(null) }
      }
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

  // ── C5a-2: acciones sobre la CUENTA de la app desde la ficha ──────────────
  // MISMOS writes que la pantalla de Usuarios (conviven hasta el C5b — al
  // retirarla, estos quedan como única superficie).
  const recargarCuentas = async () => {
    const users = await getDocs(query(collection(db, 'users'), where('rol', '==', 'tecnico')))
    setCuentas(users.docs.map(d => ({ id: d.id, ...d.data() })) as Tecnico[])
  }

  const aprobarCuenta = async (t: Tecnico) => {
    if (!window.confirm(`¿Aprobar a ${t.nombre}? Se le dará acceso a la app.`)) return
    try {
      await updateDoc(docRef(db, 'users', t.id), { estado: 'activo', fecha_aprobacion: Timestamp.now() })
      toast(`${t.nombre} aprobado correctamente`)
      await recargarCuentas()
    } catch { toast('Error al aprobar el técnico', 'error') }
  }

  const confirmarRechazoCuenta = async () => {
    if (!rechazoTarget || !rechazoMotivo.trim()) return
    const t = rechazoTarget
    setRechazoTarget(null)
    try {
      await updateDoc(docRef(db, 'users', t.id), {
        estado: 'rechazado',
        rechazo: {
          motivo: rechazoMotivo.trim(),
          por: user?.uid ?? '', por_nombre: user?.nombre ?? '', por_rol: user?.rol ?? '',
          fecha: Timestamp.now(),
        },
      })
      toast(`${t.nombre} rechazado (queda en el registro)`, 'info')
      await recargarCuentas()
    } catch { toast('Error al rechazar el técnico', 'error') }
  }

  const restaurarCuenta = async (t: Tecnico) => {
    if (!window.confirm(`¿Restaurar a ${t.nombre} a la cola de pendientes?`)) return
    try {
      await updateDoc(docRef(db, 'users', t.id), {
        estado: 'pendiente',
        'rechazo.restaurado': { por: user?.uid ?? '', por_nombre: user?.nombre ?? '', fecha: Timestamp.now() },
      })
      toast(`${t.nombre} restaurado a pendientes`)
      await recargarCuentas()
    } catch { toast('Error al restaurar', 'error') }
  }

  const desactivarCuenta = async (t: Tecnico) => {
    if (!window.confirm(`¿Desactivar a ${t.nombre}? No podrá usar la app.`)) return
    try {
      await updateDoc(docRef(db, 'users', t.id), { estado: 'inactivo' })
      toast(`${t.nombre} desactivado`)
      await recargarCuentas()
    } catch { toast('Error al desactivar', 'error') }
  }

  const activarCuenta = async (t: Tecnico) => {
    try {
      await updateDoc(docRef(db, 'users', t.id), { estado: 'activo' })
      toast(`${t.nombre} activado`)
      await recargarCuentas()
    } catch { toast('Error al activar', 'error') }
  }

  const abrirAsignarObras = async (t: Tecnico) => {
    try { await cargarObras() } catch { toast('No se pudieron cargar las obras', 'error'); return }
    setAsignarTarget(t)
  }

  const abrirPerfil = async (t: Tecnico) => {
    try { await cargarObras() } catch { /* el perfil degrada sin nombres de obra */ }
    setPerfilTarget(t)
  }

  const guardarObrasCuenta = async (
    tecnicoId: string, obraIds: string[],
    contratista: { id: string; nombre: string } | null,
  ) => {
    try {
      await updateDoc(docRef(db, 'users', tecnicoId), {
        obras_asignadas: obraIds,
        contratista_id: contratista?.id ?? deleteField(),
        contratista_nombre: contratista?.nombre ?? deleteField(),
      })
      toast('Obras asignadas correctamente')
      await recargarCuentas()
    } catch {
      toast('Error al asignar obras', 'error')
      throw new Error('save failed')
    }
  }

  // Cola transversal: sin ella, encontrar un pendiente exigiría saber de
  // antemano su contratista. El salto abre el contratista si está declarado.
  const pendientesApp = useMemo(() =>
    puedeGestionarTecnicos ? cuentas.filter(t => t.estado === 'pendiente') : [],
  [cuentas, puedeGestionarTecnicos])

  const abrirContratistaDe = (t: Tecnico) => {
    const c = contratistas.find(x => x.id === t.contratista_id)
    if (c) void abrirNomina(c)
  }

  const toggleEmpleados = async () => {
    const abrir = !verEmpleados
    setVerEmpleados(abrir)
    if (abrir && empleados === null) {
      try { setEmpleados(await cargarEmpleados()) }
      catch { toast('No se pudo leer el personal directo', 'error'); setEmpleados(null); setVerEmpleados(false) }
    }
  }

  // Cruce personal directo ↔ cuentas de la app, por user_uid o cédula.
  const cuentaDeEmpleado = (e: EmpleadoDirecto): Tecnico | undefined =>
    cuentas.find(t => t.id === e.user_uid)
    ?? cuentas.find(t => normalizarCedula(t.cedula) != null && normalizarCedula(t.cedula) === normalizarCedula(e.cedula))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Contratistas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Personas jurídicas y naturales</p>
          {/* C5a — el camino hacia la nómina: el contador invita, el botón
              👥 de cada fila ejecuta. */}
          {puedeNomina && conNomina !== null && (() => {
            const activos = contratistas.filter(c => c.estado === 'activo')
            const sinNomina = activos.filter(c => !conNomina.has(c.id)).length
            return sinNomina > 0 ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                👥 <b>{sinNomina} de {activos.length}</b> contratistas activos sin nómina cargada — se carga con el botón "👥 Nómina" de cada fila
              </p>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                👥 Todos los contratistas activos tienen nómina cargada
              </p>
            )
          })()}
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

      {/* ── C5a-2: cola TRANSVERSAL de cuentas pendientes — sin ella, un
          pendiente exige saber su contratista de antemano. Mismas acciones
          que la ficha; "abrir contratista" aterriza en la ficha completa. ── */}
      {pendientesApp.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-sm font-bold text-amber-900">
              Técnicos pendientes de aprobación ({pendientesApp.length})
            </h2>
          </div>
          {pendientesApp.map(t => (
            <div key={t.id} className="flex items-center gap-2 flex-wrap bg-white rounded border border-amber-100 px-3 py-2">
              <span className="text-sm font-medium text-gray-800">{t.nombre}</span>
              <span className="text-xs font-mono text-gray-500">{t.cedula || 'sin cédula'}</span>
              <span className="text-xs text-gray-500">declara: {t.contratista_nombre || '—'}</span>
              <ChipVerificacionNomina t={t} />
              <span className="flex-1" />
              {t.contratista_id && contratistas.some(c => c.id === t.contratista_id) && puedeNomina && (
                <button onClick={() => abrirContratistaDe(t)}
                  className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Abrir contratista
                </button>
              )}
              <button onClick={() => abrirPerfil(t)}
                className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                Ver
              </button>
              <button onClick={() => aprobarCuenta(t)}
                className="text-[11px] px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                Aprobar
              </button>
              <button onClick={() => { setRechazoMotivo(''); setRechazoTarget(t) }}
                className="text-[11px] px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-semibold">
                Rechazar
              </button>
            </div>
          ))}
        </section>
      )}

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
          onNomina={abrirNomina}
          puedeGestionar={puedeGestionar}
          puedeHabilitar={puedeHabilitar}
          puedeNomina={puedeNomina}
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

      <NominaModal
        isOpen={nominaTarget != null}
        onClose={() => setNominaTarget(null)}
        contratista={nominaTarget}
        nominasOtros={nominasOtros}
        cuentas={cuentas}
        acciones={{
          puedeGestionarTecnicos,
          onAprobar: aprobarCuenta,
          onRechazar: (t) => { setRechazoMotivo(''); setRechazoTarget(t) },
          onRestaurar: restaurarCuenta,
          onDesactivar: desactivarCuenta,
          onActivar: activarCuenta,
          onAsignarObras: abrirAsignarObras,
          onVerPerfil: abrirPerfil,
        }}
      />

      {/* C5a-2 — motivo del rechazo (el registro es evidencia, no se borra) */}
      <Modal
        isOpen={rechazoTarget != null}
        title={`Rechazar registro — ${rechazoTarget?.nombre ?? ''}`}
        onClose={() => setRechazoTarget(null)}
        actions={[
          { label: 'Volver', onClick: () => setRechazoTarget(null), variant: 'secondary' },
          {
            label: 'Rechazar con motivo', onClick: confirmarRechazoCuenta,
            variant: 'danger', disabled: !rechazoMotivo.trim(),
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

      {/* C5a-2 — reuso de los modales reales de Usuarios */}
      <AsignarObrasModal
        isOpen={asignarTarget != null}
        onClose={() => setAsignarTarget(null)}
        tecnico={asignarTarget}
        obras={obras ?? []}
        contratistas={contratistas.filter(c => c.estado === 'activo').map(({ id, nombre }) => ({ id, nombre }))}
        onSave={guardarObrasCuenta}
      />
      <TecnicoPerfilModal
        isOpen={perfilTarget != null}
        onClose={() => setPerfilTarget(null)}
        tecnico={perfilTarget}
        obras={obras ?? []}
      />

      {/* ── C5a-2: NEG · personal directo — LECTURA de `empleados_directos`
          (el maestro lo mantiene el frente SGI/SST; cero escrituras desde
          este panel). El cruce con cuentas de la app es informativo. ── */}
      {puedeVerEmpleados && (
        <section className="bg-white rounded-lg border border-gray-200 shadow-sm px-6 py-4">
          <button onClick={toggleEmpleados} className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <span>{verEmpleados ? '▾' : '▸'}</span>
            🏢 NEG · personal directo
            {empleados !== null && <span className="text-xs font-normal text-gray-400">({empleados.length})</span>}
          </button>
          {verEmpleados && (
            empleados === null ? (
              <p className="mt-3 text-xs text-gray-400">Cargando…</p>
            ) : empleados.length === 0 ? (
              <p className="mt-3 text-xs text-gray-400">Sin personal directo registrado.</p>
            ) : (
              <>
                <p className="mt-2 text-[11px] text-gray-400">
                  Maestro mantenido por el frente SGI/SST (pantalla Personal directo) — aquí solo lectura,
                  para que la gente de NEG y la de contratistas se consulten en un mismo lugar.
                </p>
                <table className="min-w-full text-xs mt-2">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-200">
                      <th className="py-1.5 pr-3 font-medium">Nombre</th>
                      <th className="py-1.5 pr-3 font-medium">Cargo</th>
                      <th className="py-1.5 pr-3 font-medium">Área</th>
                      <th className="py-1.5 pr-3 font-medium">Contrato</th>
                      <th className="py-1.5 pr-3 font-medium">Ingreso</th>
                      <th className="py-1.5 pr-3 font-medium">Estado</th>
                      <th className="py-1.5 font-medium">Cuenta en la app</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empleados.map(e => {
                      const cta = cuentaDeEmpleado(e)
                      return (
                        <tr key={e.id} className={`border-b border-gray-100 ${e.activo ? '' : 'opacity-50'}`}>
                          <td className="py-1.5 pr-3 text-gray-800 font-medium">{e.nombre}</td>
                          <td className="py-1.5 pr-3 text-gray-600">{e.cargo}</td>
                          <td className="py-1.5 pr-3 text-gray-600">{e.area}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{TIPO_CONTRATO_EMPLEADO_LABEL[e.tipo_contrato] ?? e.tipo_contrato}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{e.fecha_ingreso?.toDate?.().toLocaleDateString('es-CO') ?? ''}</td>
                          <td className="py-1.5 pr-3">
                            <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-medium ${e.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                              {e.activo ? 'Vigente' : 'Retirado'}
                            </span>
                          </td>
                          <td className="py-1.5">
                            {cta
                              ? <span className="inline-flex px-1.5 py-px rounded text-[10px] font-medium bg-brand-50 text-brand-700" title={cta.email}>📱 {cta.estado}</span>
                              : <span className="text-[10px] text-gray-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )
          )}
        </section>
      )}

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
