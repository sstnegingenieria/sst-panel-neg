// Módulo Tareas (SB2, 14-ago-2026) — UI sobre el motor SB1 (types/sigp/tarea.ts
// + utils/sigp/tareas.ts, NO se tocan). La página persiste EXACTAMENTE lo que
// devuelven los patch builders puros — nunca improvisa writes de transición.
//
// Tres pestañas con estado en la URL (?tab=):
//  - "Mis tareas" (default): asignada_a == uid, no terminales.
//  - "Balón en mi cancha" (?tab=balon, o deep-link ?balon=1): balon_en.uid == uid.
//  - "Equipo" (?tab=equipo, solo asignadores): TODAS las tareas.
// ?pendientes=1 (deep-link del badge) equivale al tab default "Mis tareas".
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  addDoc, collection, deleteField, doc, getDocs, query, Timestamp, updateDoc, where,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import Modal from '../../components/shared/Modal'
import TextField from '../../components/shared/TextField'
import SelectField from '../../components/shared/SelectField'
import { useTareasPendientes } from '../../hooks/sigp/useTareasPendientes'
import { listarAsignables } from '../../utils/sigp/tareas'
import type { PersonaAsignable } from '../../utils/sigp/tareas'
import { compararTareas, tareasActivasOrdenadas } from '../../utils/sigp/tareasUi'
import { puedeAsignarTareasUI } from '../../types/sigp/permisos'
import {
  ESTADOS_TAREA, ESTADO_TAREA_LABEL, ESTADO_TAREA_COLOR,
  PRIORIDADES_TAREA, PRIORIDAD_TAREA_LABEL, PRIORIDAD_TAREA_COLOR,
  esTareaTerminal,
  patchIniciarTarea, patchPasarBalon, patchDevolverBalon, patchCerrarTarea,
  patchAnularTarea, patchReasignarTarea,
} from '../../types/sigp/tarea'
import type {
  TareaConId, EstadoTarea, PrioridadTarea, ContextoTarea,
} from '../../types/sigp/tarea'

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024

function archivoValido(file: File): boolean {
  const esPdfOImagen = file.type === 'application/pdf' || file.type.startsWith('image/')
  if (!esPdfOImagen) { toast('El archivo debe ser un PDF o una imagen', 'error'); return false }
  if (file.size > MAX_ARCHIVO_BYTES) { toast('El archivo no puede superar 10MB', 'error'); return false }
  return true
}

function extensionDe(file: File): string {
  const partes = file.name.split('.')
  return partes.length > 1 ? partes[partes.length - 1] : 'dat'
}

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date } | undefined)?.toDate?.()
  return d
    ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '—'
}

function fFechaCorta(ts: unknown): string | null {
  const d = (ts as { toDate?: () => Date } | undefined)?.toDate?.()
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : null
}

function fechaVencida(ts: unknown): boolean {
  const d = (ts as { toDate?: () => Date } | undefined)?.toDate?.()
  if (!d) return false
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return d.getTime() < hoy.getTime()
}

/** Fecha de un input type="date" (YYYY-MM-DD) a las 12:00 local — evita
 *  corrimientos de un día por huso horario (patrón PermisosIngreso). */
function timestampDeInputFecha(v: string): Timestamp {
  return Timestamp.fromDate(new Date(v + 'T12:00:00'))
}

function fechaInputDe(ts: unknown): string {
  const d = (ts as { toDate?: () => Date } | undefined)?.toDate?.()
  return d ? d.toISOString().slice(0, 10) : ''
}

/** Ruta navegable del contexto. Resuelve con `ruta_id ?? id` (SB2.2):
 *  `id` es siempre el documento ORIGEN; `ruta_id` es el override de
 *  navegación para entidades sin ficha propia — una OC se navega por la
 *  ficha de su proyecto (`ruta_id` = proyecto_id), que es donde vive su
 *  sección (C2: surfacear, no reinventar). */
function rutaContexto(c: ContextoTarea): string | null {
  const destino = c.ruta_id ?? c.id
  switch (c.tipo) {
    case 'solicitud': return `/sigp/solicitudes/${destino}`
    case 'cotizacion': return `/sigp/cotizaciones/${destino}`
    case 'proyecto': return `/sigp/proyectos/${destino}`
    case 'cliente': return `/sigp/clientes/${destino}`
    case 'orden_compra': return `/sigp/proyectos/${destino}`
    default: return null
  }
}

/** Orden de la pestaña Equipo: activas primero (orden de trabajo), luego
 *  terminales por actividad más reciente. */
function compararEquipo(a: TareaConId, b: TareaConId): number {
  const ta = esTareaTerminal(a.estado) ? 1 : 0
  const tb = esTareaTerminal(b.estado) ? 1 : 0
  if (ta !== tb) return ta - tb
  if (!ta) return compararTareas(a, b)
  const ma = a.fecha_actualizacion?.toMillis?.() ?? a.fecha_creacion?.toMillis?.() ?? 0
  const mb = b.fecha_actualizacion?.toMillis?.() ?? b.fecha_creacion?.toMillis?.() ?? 0
  return mb - ma
}

type Tab = 'mis' | 'balon' | 'equipo'

export default function Tareas() {
  const { user } = useAuth()
  const puedeAsignar = puedeAsignarTareasUI(user?.rol)

  // ── Estado en la URL: ?tab=balon|equipo, deep-links ?pendientes=1 / ?balon=1
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    if (t === 'equipo') return 'equipo'
    if (t === 'balon' || searchParams.get('balon')) return 'balon'
    return 'mis'
  })
  const cambiarTab = (t: Tab) => {
    setTab(t)
    const next = new URLSearchParams()
    if (t !== 'mis') next.set('tab', t)
    setSearchParams(next, { replace: true })
  }

  // ── Datos vivos: "Mis tareas" + "Balón" (mismo hook que el badge del Sidebar)
  const { tareasAsignadas, balonesTareas } = useTareasPendientes(!!user?.uid, user?.uid)
  const misTareasOrdenadas = useMemo(() => tareasActivasOrdenadas(tareasAsignadas), [tareasAsignadas])
  const balonesOrdenados = useMemo(() => [...balonesTareas].sort(compararTareas), [balonesTareas])

  // ── Personas asignables (selector de balón / reasignar / nueva tarea)
  const [personas, setPersonas] = useState<PersonaAsignable[]>([])
  useEffect(() => { listarAsignables().then(setPersonas).catch(() => setPersonas([])) }, [])

  // ── "Equipo" (solo asignadores). SB2.2: por defecto SOLO activas — el
  //    histórico (hecha/anulada) se descarga BAJO DEMANDA, no siempre.
  const [equipoTareas, setEquipoTareas] = useState<TareaConId[]>([])
  const [equipoLoading, setEquipoLoading] = useState(false)
  // null = histórico aún no pedido; [] = pedido y vacío.
  const [historico, setHistorico] = useState<TareaConId[] | null>(null)
  const cargarEquipo = useCallback(async () => {
    setEquipoLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'tareas'), where('activa', '==', true)))
      setEquipoTareas(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TareaConId))
    } catch {
      toast('Error al cargar las tareas del equipo', 'error')
      setEquipoTareas([])
    } finally { setEquipoLoading(false) }
  }, [])
  const cargarHistorico = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'tareas'), where('activa', '==', false)))
      setHistorico(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TareaConId))
    } catch { toast('Error al cargar el histórico', 'error') }
  }, [])
  useEffect(() => { if (tab === 'equipo' && puedeAsignar) cargarEquipo() }, [tab, puedeAsignar, cargarEquipo])
  const [filtroEstadoEquipo, setFiltroEstadoEquipo] = useState('')
  const [busquedaEquipo, setBusquedaEquipo] = useState('')
  // Un filtro de estado terminal exige el histórico cargado.
  const elegirFiltroEstado = (e: string) => {
    setFiltroEstadoEquipo(e)
    if ((e === 'hecha' || e === 'anulada') && historico === null) cargarHistorico()
  }
  const equipoVisibles = useMemo(
    () => [...equipoTareas, ...(historico ?? [])],
    [equipoTareas, historico],
  )
  const equipoFiltrado = useMemo(() => {
    const q = busquedaEquipo.trim().toLowerCase()
    return equipoVisibles
      .filter(t =>
        (!filtroEstadoEquipo || t.estado === filtroEstadoEquipo) &&
        (!q ||
          (t.titulo ?? '').toLowerCase().includes(q) ||
          (t.asignada_a_nombre ?? '').toLowerCase().includes(q)))
      .sort(compararEquipo)
  }, [equipoVisibles, filtroEstadoEquipo, busquedaEquipo])
  const contadorPorEstado = useMemo(() => {
    const m = new Map<EstadoTarea, number>()
    for (const t of equipoVisibles) m.set(t.estado, (m.get(t.estado) ?? 0) + 1)
    return m
  }, [equipoVisibles])

  const recargarEquipoSiAplica = useCallback(async () => {
    if (tab === 'equipo') {
      await cargarEquipo()
      if (historico !== null) await cargarHistorico()   // cerrar/anular mueve docs allá
    }
  }, [tab, cargarEquipo, cargarHistorico, historico])

  // ── Fila expandida (detalle)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const toggleExpand = (id: string) => setExpandedId(cur => cur === id ? null : id)

  const actor = () => ({ uid: user?.uid ?? '', nombre: user?.nombre })
  const [aplicandoId, setAplicandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // ═══════════════════════════════════════════════════════════════════════
  // Acciones simples (sin modal): Iniciar / Retirar balón
  // ═══════════════════════════════════════════════════════════════════════
  const iniciar = async (t: TareaConId) => {
    const patch = patchIniciarTarea(t, actor(), Timestamp.now())
    if (!patch) { toast('No se puede iniciar esta tarea', 'error'); return }
    setAplicandoId(t.id)
    try {
      await updateDoc(doc(db, 'tareas', t.id), patch)
      toast('Tarea iniciada')
      await recargarEquipoSiAplica()
    } catch { toast('Error al iniciar la tarea', 'error') } finally { setAplicandoId(null) }
  }

  const retirarBalon = async (t: TareaConId) => {
    const patch = patchDevolverBalon(t, actor(), Timestamp.now())
    if (!patch) { toast('No se puede retirar el balón de esta tarea', 'error'); return }
    setAplicandoId(t.id)
    try {
      await updateDoc(doc(db, 'tareas', t.id), patch)
      toast('Balón retirado')
      await recargarEquipoSiAplica()
    } catch { toast('Error al retirar el balón', 'error') } finally { setAplicandoId(null) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Pasar balón (selector de persona, excluye a quien lo pasa + motivo obligatorio)
  // ═══════════════════════════════════════════════════════════════════════
  const [balonTarget, setBalonTarget] = useState<TareaConId | null>(null)
  const [balonDestinoUid, setBalonDestinoUid] = useState('')
  const [balonMotivo, setBalonMotivo] = useState('')
  const abrirPasarBalon = (t: TareaConId) => { setBalonTarget(t); setBalonDestinoUid(''); setBalonMotivo('') }
  const cerrarPasarBalon = () => { setBalonTarget(null); setBalonDestinoUid(''); setBalonMotivo('') }
  const personasParaBalon = personas.filter(p => p.uid !== user?.uid)

  const confirmarPasarBalon = async () => {
    if (!balonTarget) return
    const destino = personasParaBalon.find(p => p.uid === balonDestinoUid)
    if (!destino || !balonMotivo.trim()) return
    const patch = patchPasarBalon(balonTarget, actor(), Timestamp.now(), { uid: destino.uid, nombre: destino.nombre }, balonMotivo)
    if (!patch) { toast('No se puede pasar el balón de esta tarea', 'error'); return }
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'tareas', balonTarget.id), patch)
      toast(`Balón pasado a ${destino.nombre}`)
      cerrarPasarBalon()
      await recargarEquipoSiAplica()
    } catch { toast('Error al pasar el balón', 'error') } finally { setGuardando(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Cerrar (comentario obligatorio + evidencia si la tarea la exige)
  // ═══════════════════════════════════════════════════════════════════════
  const [cerrarTarget, setCerrarTarget] = useState<TareaConId | null>(null)
  const [cerrarComentario, setCerrarComentario] = useState('')
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null)
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false)
  const abrirCerrar = (t: TareaConId) => { setCerrarTarget(t); setCerrarComentario(''); setEvidenciaFile(null) }
  const cerrarModalCerrar = () => { setCerrarTarget(null); setCerrarComentario(''); setEvidenciaFile(null) }

  const onArchivoEvidencia = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { setEvidenciaFile(null); return }
    if (archivoValido(f)) setEvidenciaFile(f)
    else { setEvidenciaFile(null); e.target.value = '' }
  }

  const puedeConfirmarCierre = !!cerrarTarget && cerrarComentario.trim() !== '' &&
    (!cerrarTarget.requiere_evidencia || !!evidenciaFile)

  const confirmarCerrar = async () => {
    if (!cerrarTarget || !puedeConfirmarCierre) return
    setGuardando(true)
    setSubiendoEvidencia(!!evidenciaFile)
    try {
      let evidenciaUrl: string | undefined
      if (evidenciaFile) {
        const path = `tareas/${cerrarTarget.id}/evidencia/${crypto.randomUUID()}.${extensionDe(evidenciaFile)}`
        const snap = await uploadBytes(ref(storage, path), evidenciaFile)
        evidenciaUrl = await getDownloadURL(snap.ref)
      }
      const patch = patchCerrarTarea(cerrarTarget, actor(), Timestamp.now(), cerrarComentario, evidenciaUrl)
      if (!patch) { toast('No se puede cerrar esta tarea', 'error'); return }
      await updateDoc(doc(db, 'tareas', cerrarTarget.id), patch)
      toast('Tarea cerrada')
      cerrarModalCerrar()
      await recargarEquipoSiAplica()
    } catch {
      toast('Error al cerrar la tarea', 'error')
    } finally { setGuardando(false); setSubiendoEvidencia(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Devolver balón (pestaña Balón — nota opcional)
  // ═══════════════════════════════════════════════════════════════════════
  const [devolverTarget, setDevolverTarget] = useState<TareaConId | null>(null)
  const [devolverNota, setDevolverNota] = useState('')
  const abrirDevolver = (t: TareaConId) => { setDevolverTarget(t); setDevolverNota('') }

  const confirmarDevolver = async () => {
    if (!devolverTarget) return
    const patch = patchDevolverBalon(devolverTarget, actor(), Timestamp.now(), devolverNota)
    if (!patch) { toast('No se puede devolver el balón de esta tarea', 'error'); return }
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'tareas', devolverTarget.id), patch)
      toast('Balón devuelto')
      setDevolverTarget(null); setDevolverNota('')
    } catch { toast('Error al devolver el balón', 'error') } finally { setGuardando(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Editar (asignador — título/descripción/prioridad/fecha límite/evidencia)
  // ═══════════════════════════════════════════════════════════════════════
  const [editarTarget, setEditarTarget] = useState<TareaConId | null>(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editPrioridad, setEditPrioridad] = useState<PrioridadTarea>('media')
  const [editFechaLimite, setEditFechaLimite] = useState('')
  const [editRequiereEvidencia, setEditRequiereEvidencia] = useState(false)

  const abrirEditar = (t: TareaConId) => {
    setEditarTarget(t)
    setEditTitulo(t.titulo ?? '')
    setEditDescripcion(t.descripcion ?? '')
    setEditPrioridad(t.prioridad ?? 'media')
    setEditFechaLimite(fechaInputDe(t.fecha_limite))
    setEditRequiereEvidencia(!!t.requiere_evidencia)
  }

  const confirmarEditar = async () => {
    if (!editarTarget || !editTitulo.trim()) return
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'tareas', editarTarget.id), {
        titulo: editTitulo.trim(),
        descripcion: editDescripcion.trim(),
        prioridad: editPrioridad,
        fecha_limite: editFechaLimite ? timestampDeInputFecha(editFechaLimite) : deleteField(),
        requiere_evidencia: editRequiereEvidencia,
        fecha_actualizacion: Timestamp.now(),
      })
      toast('Tarea actualizada')
      setEditarTarget(null)
      await recargarEquipoSiAplica()
    } catch { toast('Error al editar la tarea (verifica tu rol)', 'error') } finally { setGuardando(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Reasignar (asignador — persona + nota)
  // ═══════════════════════════════════════════════════════════════════════
  const [reasignarTarget, setReasignarTarget] = useState<TareaConId | null>(null)
  const [reasignarUid, setReasignarUid] = useState('')
  const [reasignarNota, setReasignarNota] = useState('')
  const abrirReasignar = (t: TareaConId) => { setReasignarTarget(t); setReasignarUid(''); setReasignarNota('') }

  const confirmarReasignar = async () => {
    if (!reasignarTarget) return
    const nuevo = personas.find(p => p.uid === reasignarUid)
    if (!nuevo) return
    const patch = patchReasignarTarea(reasignarTarget, actor(), Timestamp.now(), { uid: nuevo.uid, nombre: nuevo.nombre }, reasignarNota)
    if (!patch) { toast('No se puede reasignar esta tarea', 'error'); return }
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'tareas', reasignarTarget.id), patch)
      toast(`Reasignada a ${nuevo.nombre}`)
      setReasignarTarget(null); setReasignarUid(''); setReasignarNota('')
      await recargarEquipoSiAplica()
    } catch { toast('Error al reasignar la tarea (verifica tu rol)', 'error') } finally { setGuardando(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Anular (asignador — motivo obligatorio)
  // ═══════════════════════════════════════════════════════════════════════
  const [anularTarget, setAnularTarget] = useState<TareaConId | null>(null)
  const [anularMotivo, setAnularMotivo] = useState('')
  const abrirAnular = (t: TareaConId) => { setAnularTarget(t); setAnularMotivo('') }

  const confirmarAnular = async () => {
    if (!anularTarget || !anularMotivo.trim()) return
    const patch = patchAnularTarea(anularTarget, actor(), Timestamp.now(), anularMotivo)
    if (!patch) { toast('No se puede anular esta tarea', 'error'); return }
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'tareas', anularTarget.id), patch)
      toast('Tarea anulada')
      setAnularTarget(null); setAnularMotivo('')
      await recargarEquipoSiAplica()
    } catch { toast('Error al anular la tarea (verifica tu rol)', 'error') } finally { setGuardando(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Nueva tarea
  // ═══════════════════════════════════════════════════════════════════════
  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [nvTitulo, setNvTitulo] = useState('')
  const [nvDescripcion, setNvDescripcion] = useState('')
  const [nvPrioridad, setNvPrioridad] = useState<PrioridadTarea>('media')
  const [nvFechaLimite, setNvFechaLimite] = useState('')
  const [nvRequiereEvidencia, setNvRequiereEvidencia] = useState(false)
  const [nvAsignadoUid, setNvAsignadoUid] = useState('')

  const abrirNueva = () => {
    setNvTitulo(''); setNvDescripcion(''); setNvPrioridad('media'); setNvFechaLimite('')
    setNvRequiereEvidencia(false); setNvAsignadoUid(user?.uid ?? '')
    setNuevaOpen(true)
  }

  const crearTarea = async () => {
    if (!nvTitulo.trim() || !user) return
    const asignado = puedeAsignar ? personas.find(p => p.uid === nvAsignadoUid) : null
    const asignadoUid = puedeAsignar ? (asignado?.uid ?? user.uid) : user.uid
    const asignadoNombre = puedeAsignar ? (asignado?.nombre ?? user.nombre) : user.nombre
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      await addDoc(collection(db, 'tareas'), {
        titulo: nvTitulo.trim(),
        ...(nvDescripcion.trim() ? { descripcion: nvDescripcion.trim() } : {}),
        asignada_a: asignadoUid,
        asignada_a_nombre: asignadoNombre,
        asignada_por: user.uid,
        asignada_por_nombre: user.nombre,
        creada_por: user.uid,
        estado: 'pendiente',
        activa: true,          // SB2.2: la regla de create lo exige
        prioridad: nvPrioridad,
        ...(nvFechaLimite ? { fecha_limite: timestampDeInputFecha(nvFechaLimite) } : {}),
        ...(nvRequiereEvidencia ? { requiere_evidencia: true } : {}),
        historial: [{ fecha: ahora, por: user.uid, por_nombre: user.nombre, a: 'pendiente', nota: 'Tarea creada' }],
        fecha_creacion: ahora,
      })
      toast('Tarea creada')
      setNuevaOpen(false)
      await recargarEquipoSiAplica()
    } catch { toast('Error al crear la tarea', 'error') } finally { setGuardando(false) }
  }

  if (!user) return null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">SIGP</div>
          <h1 className="text-2xl font-bold text-gray-800">Tareas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Asignación, balón en cancha y seguimiento</p>
        </div>
        <button onClick={abrirNueva}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva tarea
        </button>
      </div>

      {/* Segmented */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm font-medium">
        <button onClick={() => cambiarTab('mis')}
          className={`px-4 py-1.5 rounded-md transition ${tab === 'mis' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Mis tareas{misTareasOrdenadas.length > 0 && <span className="ml-1.5 text-xs text-gray-400">({misTareasOrdenadas.length})</span>}
        </button>
        <button onClick={() => cambiarTab('balon')}
          className={`px-4 py-1.5 rounded-md transition ${tab === 'balon' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          🏈 Balón en mi cancha{balonesOrdenados.length > 0 && <span className="ml-1.5 text-xs text-gray-400">({balonesOrdenados.length})</span>}
        </button>
        {puedeAsignar && (
          <button onClick={() => cambiarTab('equipo')}
            className={`px-4 py-1.5 rounded-md transition ${tab === 'equipo' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Equipo
          </button>
        )}
      </div>

      {/* ── Mis tareas ─────────────────────────────────────────────────── */}
      {tab === 'mis' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {misTareasOrdenadas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No tienes tareas pendientes 🎉</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {misTareasOrdenadas.map(t => (
                <FilaTarea key={t.id} t={t} variant="mis" uid={user.uid} puedeAsignar={puedeAsignar}
                  expanded={expandedId === t.id} onToggle={() => toggleExpand(t.id)}
                  aplicando={aplicandoId === t.id}
                  onIniciar={() => iniciar(t)}
                  onPasarBalon={() => abrirPasarBalon(t)}
                  onCerrar={() => abrirCerrar(t)}
                  onRetirarBalon={() => retirarBalon(t)}
                  onEditar={() => abrirEditar(t)}
                  onReasignar={() => abrirReasignar(t)}
                  onAnular={() => abrirAnular(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Balón en mi cancha ─────────────────────────────────────────── */}
      {tab === 'balon' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {balonesOrdenados.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No tienes balones pendientes.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {balonesOrdenados.map(t => (
                <FilaTarea key={t.id} t={t} variant="balon" uid={user.uid} puedeAsignar={puedeAsignar}
                  expanded={expandedId === t.id} onToggle={() => toggleExpand(t.id)}
                  aplicando={aplicandoId === t.id}
                  onDevolverBalon={() => abrirDevolver(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Equipo ─────────────────────────────────────────────────────── */}
      {tab === 'equipo' && puedeAsignar && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setFiltroEstadoEquipo('')}
              className={`text-xs px-2.5 py-1 rounded-full font-medium border ${filtroEstadoEquipo === '' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              Todas ({equipoVisibles.length})
            </button>
            {ESTADOS_TAREA.map(e => (
              <button key={e} onClick={() => elegirFiltroEstado(e)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium border ${filtroEstadoEquipo === e ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {ESTADO_TAREA_LABEL[e]}{(e === 'hecha' || e === 'anulada') && historico === null
                  ? '' : ` (${contadorPorEstado.get(e) ?? 0})`}
              </button>
            ))}
            {historico === null && (
              <button onClick={cargarHistorico}
                title="Las cerradas y anuladas no se descargan por defecto"
                className="text-xs px-2.5 py-1 rounded-full font-medium border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50">
                ⏳ Cargar histórico
              </button>
            )}
            <input value={busquedaEquipo} onChange={e => setBusquedaEquipo(e.target.value)}
              placeholder="Buscar por título o asignado…"
              className="ml-auto px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-64 max-w-full focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            {equipoLoading ? (
              <p className="text-sm text-gray-400 text-center py-10">Cargando…</p>
            ) : equipoFiltrado.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No hay tareas que coincidan.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {equipoFiltrado.map(t => (
                  <FilaTarea key={t.id} t={t} variant="equipo" uid={user.uid} puedeAsignar={puedeAsignar}
                    expanded={expandedId === t.id} onToggle={() => toggleExpand(t.id)}
                    aplicando={aplicandoId === t.id}
                    onEditar={() => abrirEditar(t)}
                    onReasignar={() => abrirReasignar(t)}
                    onAnular={() => abrirAnular(t)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Pasar balón ─────────────────────────────────────────── */}
      <Modal isOpen={balonTarget !== null} title={`Pasar balón — ${balonTarget?.titulo ?? ''}`}
        onClose={cerrarPasarBalon}
        actions={[
          { label: 'Cancelar', onClick: cerrarPasarBalon, variant: 'secondary' },
          { label: guardando ? 'Pasando…' : 'Pasar balón', onClick: confirmarPasarBalon, variant: 'primary',
            loading: guardando, disabled: !balonDestinoUid || !balonMotivo.trim() },
        ]}>
        <div className="space-y-3">
          <SelectField label="Pasar a" value={balonDestinoUid} onChange={setBalonDestinoUid} required
            placeholder="Selecciona una persona"
            options={personasParaBalon.map(p => ({ value: p.uid, label: `${p.nombre} (${p.email})` }))} />
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Motivo <span className="text-red-500">*</span></span>
            <textarea value={balonMotivo} onChange={e => setBalonMotivo(e.target.value)} rows={3} autoFocus
              placeholder="Qué se espera de esa persona…"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
        </div>
      </Modal>

      {/* ── Modal: Cerrar tarea ────────────────────────────────────────── */}
      <Modal isOpen={cerrarTarget !== null} title={`Cerrar tarea — ${cerrarTarget?.titulo ?? ''}`}
        onClose={cerrarModalCerrar}
        actions={[
          { label: 'Cancelar', onClick: cerrarModalCerrar, variant: 'secondary' },
          { label: guardando ? (subiendoEvidencia ? 'Subiendo evidencia…' : 'Cerrando…') : 'Cerrar tarea',
            onClick: confirmarCerrar, variant: 'primary', loading: guardando, disabled: !puedeConfirmarCierre },
        ]}>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Comentario de cierre <span className="text-red-500">*</span></span>
            <textarea value={cerrarComentario} onChange={e => setCerrarComentario(e.target.value)} rows={3} autoFocus
              placeholder="Qué se hizo / resultado…"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          {cerrarTarget?.requiere_evidencia && (
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Evidencia (PDF o imagen) <span className="text-red-500">*</span></span>
              <input type="file" accept=".pdf,image/*" onChange={onArchivoEvidencia}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
            </label>
          )}
        </div>
      </Modal>

      {/* ── Modal: Devolver balón ──────────────────────────────────────── */}
      <Modal isOpen={devolverTarget !== null} title={`Devolver balón — ${devolverTarget?.titulo ?? ''}`}
        onClose={() => setDevolverTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setDevolverTarget(null), variant: 'secondary' },
          { label: guardando ? 'Devolviendo…' : 'Devolver balón', onClick: confirmarDevolver, variant: 'primary', loading: guardando },
        ]}>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Nota (opcional)</span>
          <textarea value={devolverNota} onChange={e => setDevolverNota(e.target.value)} rows={3} autoFocus
            placeholder="Respuesta o resultado para quien pasó el balón…"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </label>
      </Modal>

      {/* ── Modal: Editar (asignador) ──────────────────────────────────── */}
      <Modal isOpen={editarTarget !== null} title="Editar tarea" onClose={() => setEditarTarget(null)} size="lg"
        actions={[
          { label: 'Cancelar', onClick: () => setEditarTarget(null), variant: 'secondary' },
          { label: guardando ? 'Guardando…' : 'Guardar cambios', onClick: confirmarEditar, variant: 'primary',
            loading: guardando, disabled: !editTitulo.trim() },
        ]}>
        <div className="space-y-3">
          <TextField label="Título" value={editTitulo} onChange={setEditTitulo} required />
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Descripción</span>
            <textarea value={editDescripcion} onChange={e => setEditDescripcion(e.target.value)} rows={3}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Prioridad" value={editPrioridad} onChange={v => setEditPrioridad(v as PrioridadTarea)}
              options={PRIORIDADES_TAREA.map(p => ({ value: p, label: PRIORIDAD_TAREA_LABEL[p] }))} />
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Fecha límite</span>
              <input type="date" value={editFechaLimite} onChange={e => setEditFechaLimite(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={editRequiereEvidencia} onChange={e => setEditRequiereEvidencia(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
            Requiere evidencia al cerrar
          </label>
        </div>
      </Modal>

      {/* ── Modal: Reasignar ───────────────────────────────────────────── */}
      <Modal isOpen={reasignarTarget !== null} title={`Reasignar — ${reasignarTarget?.titulo ?? ''}`}
        onClose={() => setReasignarTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setReasignarTarget(null), variant: 'secondary' },
          { label: guardando ? 'Reasignando…' : 'Reasignar', onClick: confirmarReasignar, variant: 'primary',
            loading: guardando, disabled: !reasignarUid },
        ]}>
        <div className="space-y-3">
          <SelectField label="Nuevo responsable" value={reasignarUid} onChange={setReasignarUid} required
            placeholder="Selecciona una persona"
            options={personas.map(p => ({ value: p.uid, label: `${p.nombre} (${p.email})` }))} />
          <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
            La tarea vuelve a «Pendiente» para el nuevo responsable y se limpia el balón si lo había.
          </p>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Nota (opcional)</span>
            <textarea value={reasignarNota} onChange={e => setReasignarNota(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
        </div>
      </Modal>

      {/* ── Modal: Anular ──────────────────────────────────────────────── */}
      <Modal isOpen={anularTarget !== null} title={`Anular — ${anularTarget?.titulo ?? ''}`}
        onClose={() => setAnularTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setAnularTarget(null), variant: 'secondary' },
          { label: guardando ? 'Anulando…' : 'Anular', onClick: confirmarAnular, variant: 'danger',
            loading: guardando, disabled: !anularMotivo.trim() },
        ]}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Estado terminal — no se puede reabrir. Si hace falta corregir, se crea una tarea nueva.</p>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Motivo <span className="text-red-500">*</span></span>
            <textarea value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} rows={3} autoFocus
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
        </div>
      </Modal>

      {/* ── Modal: Nueva tarea ─────────────────────────────────────────── */}
      <Modal isOpen={nuevaOpen} title="Nueva tarea" onClose={() => setNuevaOpen(false)} size="lg"
        actions={[
          { label: 'Cancelar', onClick: () => setNuevaOpen(false), variant: 'secondary' },
          { label: guardando ? 'Creando…' : 'Crear tarea', onClick: crearTarea, variant: 'primary',
            loading: guardando, disabled: !nvTitulo.trim() },
        ]}>
        <div className="space-y-3">
          <TextField label="Título" value={nvTitulo} onChange={setNvTitulo} required autoFocus />
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Descripción</span>
            <textarea value={nvDescripcion} onChange={e => setNvDescripcion(e.target.value)} rows={3}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Prioridad" value={nvPrioridad} onChange={v => setNvPrioridad(v as PrioridadTarea)}
              options={PRIORIDADES_TAREA.map(p => ({ value: p, label: PRIORIDAD_TAREA_LABEL[p] }))} />
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Fecha límite</span>
              <input type="date" value={nvFechaLimite} onChange={e => setNvFechaLimite(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={nvRequiereEvidencia} onChange={e => setNvRequiereEvidencia(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
            Requiere evidencia al cerrar
          </label>
          {puedeAsignar ? (
            <SelectField label="Asignar a" value={nvAsignadoUid} onChange={setNvAsignadoUid} required
              placeholder="Selecciona una persona"
              options={personas.map(p => ({ value: p.uid, label: p.uid === user.uid ? `${p.nombre} (yo)` : `${p.nombre} (${p.email})` }))} />
          ) : (
            <div>
              <span className="text-sm font-medium text-gray-700">Asignar a</span>
              <p className="mt-1 px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600">
                Ti mismo — tu rol solo puede crear tareas para ti
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Fila de tarea (lista + detalle expandible) — render DEFENSIVO ante
// documentos malformados: campos faltantes no revientan la página.
// ═══════════════════════════════════════════════════════════════════════
interface FilaTareaProps {
  t: TareaConId
  variant: 'mis' | 'balon' | 'equipo'
  uid: string
  puedeAsignar: boolean
  expanded: boolean
  onToggle: () => void
  aplicando?: boolean
  onIniciar?: () => void
  onPasarBalon?: () => void
  onCerrar?: () => void
  onRetirarBalon?: () => void
  onDevolverBalon?: () => void
  onEditar?: () => void
  onReasignar?: () => void
  onAnular?: () => void
}

function FilaTarea({
  t, variant, uid, puedeAsignar, expanded, onToggle, aplicando,
  onIniciar, onPasarBalon, onCerrar, onRetirarBalon, onDevolverBalon, onEditar, onReasignar, onAnular,
}: FilaTareaProps) {
  const estado: EstadoTarea = t.estado ?? 'pendiente'
  const prioridad: PrioridadTarea = t.prioridad ?? 'media'
  const esAutoTarea = !!t.creada_por && !!t.asignada_a && t.creada_por === uid && t.asignada_a === uid
  const puedeAccionesAsignador = variant === 'equipo' ? puedeAsignar : (puedeAsignar || esAutoTarea)
  const vencida = fechaVencida(t.fecha_limite) && !esTareaTerminal(estado)
  const historial = Array.isArray(t.historial) ? t.historial : []

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-2 cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-800 text-sm">{t.titulo || '(sin título)'}</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ESTADO_TAREA_COLOR[estado] ?? 'bg-gray-100 text-gray-600'}`}>
              {ESTADO_TAREA_LABEL[estado] ?? estado}
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORIDAD_TAREA_COLOR[prioridad] ?? 'bg-gray-100 text-gray-600'}`}>
              {PRIORIDAD_TAREA_LABEL[prioridad] ?? prioridad}
            </span>
            {estado === 'en_espera' && t.balon_en && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800">
                🏈 En cancha de {t.balon_en.nombre || '—'}
              </span>
            )}
            {vencida && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">⚠ Vencida</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-400">
            {variant === 'equipo' && <span>Asignada a {t.asignada_a_nombre || '—'}</span>}
            {variant !== 'equipo' && t.asignada_por_nombre && <span>Asignada por {t.asignada_por_nombre}</span>}
            {fFechaCorta(t.fecha_limite) && <span>Vence {fFechaCorta(t.fecha_limite)}</span>}
            {t.contexto?.label && <span>· {t.contexto.label}</span>}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
          {variant === 'mis' && estado === 'pendiente' && onIniciar && (
            <button onClick={onIniciar} disabled={aplicando}
              className="text-xs px-2.5 py-1 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-50">
              ▶ Iniciar
            </button>
          )}
          {variant === 'mis' && (estado === 'pendiente' || estado === 'en_curso') && onPasarBalon && (
            <button onClick={onPasarBalon} disabled={aplicando}
              className="text-xs px-2.5 py-1 rounded-lg font-medium border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50">
              🏈 Pasar balón
            </button>
          )}
          {variant === 'mis' && (estado === 'pendiente' || estado === 'en_curso') && onCerrar && (
            <button onClick={onCerrar} disabled={aplicando}
              className="text-xs px-2.5 py-1 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              ✔ Cerrar
            </button>
          )}
          {variant === 'mis' && estado === 'en_espera' && onRetirarBalon && (
            <button onClick={onRetirarBalon} disabled={aplicando}
              className="text-xs px-2.5 py-1 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              ↩ Retirar balón
            </button>
          )}
          {variant === 'balon' && onDevolverBalon && (
            <button onClick={onDevolverBalon} disabled={aplicando}
              className="text-xs px-2.5 py-1 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              ↩ Devolver balón
            </button>
          )}
          {puedeAccionesAsignador && !esTareaTerminal(estado) && (
            <>
              {onEditar && (
                <button onClick={onEditar} disabled={aplicando}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  ✎ Editar
                </button>
              )}
              {onReasignar && (
                <button onClick={onReasignar} disabled={aplicando}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  ⇄ Reasignar
                </button>
              )}
              {onAnular && (
                <button onClick={onAnular} disabled={aplicando}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                  ✖ Anular
                </button>
              )}
            </>
          )}
          <button onClick={onToggle} title="Ver detalle"
            className="text-xs px-2 py-1 rounded-lg text-gray-400 hover:bg-gray-50">
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pl-1 space-y-3 border-t border-gray-100 pt-3">
          {t.descripcion && <p className="text-sm text-gray-600 whitespace-pre-wrap">{t.descripcion}</p>}

          {t.contexto?.label && (
            rutaContexto(t.contexto) ? (
              <Link to={rutaContexto(t.contexto)!}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2.5 py-1 hover:bg-brand-100">
                {t.contexto.label} →
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
                {t.contexto.label}
              </span>
            )
          )}

          {estado === 'hecha' && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm">
              <p className="font-medium text-emerald-800">Comentario de cierre</p>
              <p className="text-emerald-700 mt-0.5">{t.comentario_cierre || '—'}</p>
              {t.evidencia_url && (
                <a href={t.evidencia_url} target="_blank" rel="noreferrer"
                  className="inline-block mt-1 text-emerald-700 underline underline-offset-2 text-xs font-medium">
                  Ver evidencia
                </a>
              )}
            </div>
          )}

          {historial.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Historial</p>
              <ol className="space-y-3">
                {historial.map((h, i) => (
                  <li key={i} className="relative pl-5">
                    <span className="absolute left-0 top-1 w-2 h-2 rounded-full bg-brand-600" />
                    {i < historial.length - 1 && (
                      <span className="absolute left-[3px] top-3 bottom-[-12px] w-px bg-gray-200" />
                    )}
                    <p className="text-sm text-gray-800">
                      {h.a ? (ESTADO_TAREA_LABEL[h.a as EstadoTarea] ?? h.a) : '—'}
                      {h.por_nombre && <span className="text-gray-400 font-normal"> · {h.por_nombre}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">{fFecha(h.fecha)}</p>
                    {h.nota && <p className="text-xs text-gray-500 mt-0.5">{h.nota}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
