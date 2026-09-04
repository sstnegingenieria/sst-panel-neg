// P2-2 · SB3 — Asignaciones múltiples en la ficha del proyecto.
//
// Reemplaza a AsignacionContratista (singular). Muestra la subcolección con
// LECTURA DUAL (proyectos pre-migración se ven por síntesis en memoria), la
// COBERTURA del alcance (lo sin asignar SE VE, con su valor), el detector de
// DESINCRONIZACIÓN del resumen (condición 1: si el resumen del padre miente,
// se ve — jamás preferir una fuente en silencio) y el badge de REVISAR
// COBERTURA CON SU RAZÓN (condición de Giovanny: "margen implícito 94% —
// probablemente no cubre todo el alcance asignado"; un distintivo sin razón
// se ignora a la tercera vez).
//
// El selector de átomos muestra EL VALOR de cada actividad (condición: quien
// asigna ve cuánto CD pone en manos de cada contratista, no solo el nombre).
import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, where, getDocs, doc, updateDoc, arrayUnion, deleteField, Timestamp,
} from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { fmtMoney, fmtNum } from '../../../utils/sigp/formato'
import {
  asignacionesDe, coberturaDe, detectarDesincronizacion, resumenAsignacionesDe,
  construirAsignacionMulti, patchCancelarAsignacion, patchAjustarAtomos, patchResolverSenal,
  margenImplicitoDe, requiereRevisionCobertura, UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT,
  baseMargenDe, ETIQUETA_BASE_MARGEN, atomosTomados,
  ESTADO_ASIG_LABEL, ESTADO_ASIG_COLOR,
} from '../../../types/sigp/asignacion'
import type { AsignacionContratista } from '../../../types/sigp/asignacion'
import { cargarAsignaciones, asegurarMigrado, crearAsignacion, escribirAsignacion } from '../../../utils/sigp/asignaciones'
import { MODALIDAD_CONTRATISTA_LABEL, MODALIDADES_CONTRATISTA } from '../../../types/sigp/proyecto'
import type { Proyecto, ModalidadContratista } from '../../../types/sigp/proyecto'
import InputExpresion from '../cotizaciones/InputExpresion'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function AsignacionesProyecto({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const alcance = proyecto.snapshot.alcance ?? []
  const [subdocs, setSubdocs] = useState<AsignacionContratista[]>([])
  const [cargado, setCargado] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const load = useCallback(async () => {
    try { setSubdocs(await cargarAsignaciones(proyecto.id)) }
    catch { toast('Error al cargar las asignaciones', 'error') }
    finally { setCargado(true) }
  }, [proyecto.id])
  useEffect(() => { load() }, [load])

  // LECTURA DUAL — el único punto de consumo.
  const asigs = asignacionesDe(proyecto, subdocs)
  const cobertura = coberturaDe(alcance, asigs)
  // Condición 1: la subcolección es el detector natural del resumen.
  const desinc = subdocs.length > 0
    ? detectarDesincronizacion(proyecto.resumen_asignaciones, subdocs, alcance)
    : []

  const recargarTodo = async () => { await load(); await reload() }

  // ── Reparar resumen (cuando el detector encontró discrepancias) ──
  const repararResumen = async () => {
    setAplicando(true)
    try {
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        resumen_asignaciones: resumenAsignacionesDe(subdocs, alcance),
        fecha_actualizacion: Timestamp.now(),
      })
      toast('Resumen recalculado desde la subcolección')
      await recargarTodo()
    } catch { toast('Error al reparar el resumen', 'error') } finally { setAplicando(false) }
  }

  // ═══════════════════════════ Asignar (multi) ═══════════════════════════
  const [formOpen, setFormOpen] = useState(false)
  const [contratistas, setContratistas] = useState<{ id: string; nombre: string; nit?: string; cedula?: string; estado: string }[]>([])
  const [contratistaId, setContratistaId] = useState('')
  const [atomosSel, setAtomosSel] = useState<Set<string>>(new Set())
  const [modalidad, setModalidad] = useState<ModalidadContratista>('todo_costo')
  const [materiales, setMateriales] = useState<number | undefined>(undefined)
  const [nota, setNota] = useState('')

  const abrirAsignar = async () => {
    setContratistaId(''); setAtomosSel(new Set()); setModalidad('todo_costo'); setMateriales(undefined); setNota('')
    setFormOpen(true)
    try {
      const snap = await getDocs(query(collection(db, 'contratistas'), where('estado', '==', 'activo')))
      setContratistas(snap.docs.map(d => ({ id: d.id, ...d.data() }) as { id: string; nombre: string; estado: string }))
    } catch { toast('Error al cargar contratistas habilitados', 'error') }
  }

  const cdSeleccionado = alcance.filter(g => atomosSel.has(g.grupo)).reduce((s, g) => s + (g.subtotal || 0), 0)

  const asignar = async () => {
    const c = contratistas.find(x => x.id === contratistaId)
    if (!c) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      // Migración lazy (decisión 2): el primer write económico migra el proyecto.
      const vigentes = await asegurarMigrado(proyecto, subdocs)
      const nuevo = construirAsignacionMulti(
        c, [...atomosSel], modalidad, materiales, alcance, vigentes, user?.uid ?? '', ahora, nota)
      await crearAsignacion(proyecto.id, alcance, nuevo, vigentes)
      // Transición del proyecto (máquina actual, sin cambios hasta el switch):
      if (proyecto.estado === 'creado') {
        await updateDoc(doc(db, 'proyectos', proyecto.id), {
          estado: 'contratista_asignado',
          historial: arrayUnion({ de: 'creado', a: 'contratista_asignado', por: user?.uid ?? '', fecha: ahora, motivo: `Contratista asignado: ${c.nombre}` }),
        })
      }
      toast(`${c.nombre} asignado — ${atomosSel.size} actividad(es), CD ${fmtMoney(cdSeleccionado)}`)
      setFormOpen(false)
      await recargarTodo()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al asignar', 'error')
    } finally { setAplicando(false) }
  }

  // ═══════════════════════════ Cancelar ═══════════════════════════
  const [cancelarTarget, setCancelarTarget] = useState<AsignacionContratista | null>(null)
  const [cancelarMotivo, setCancelarMotivo] = useState('')

  const cancelar = async () => {
    if (!cancelarTarget) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      const vigentes = await asegurarMigrado(proyecto, subdocs)
      const target = vigentes.find(a => a.id === cancelarTarget.id) ?? cancelarTarget
      const r = patchCancelarAsignacion(target, cancelarMotivo, user?.uid ?? '', ahora)
      if (!r) { toast('No se puede cancelar esta asignación', 'error'); return }
      const trasPatch = vigentes.map(a => a.id === target.id
        ? { ...a, ...r.sub, historial: [...a.historial, r.entradaHistorial] } as AsignacionContratista : a)
      await escribirAsignacion(proyecto.id, alcance, target.id,
        { ...r.sub, historial: arrayUnion(r.entradaHistorial) }, trasPatch)
      toast(r.incurrido.total > 0
        ? `Cancelada — queda PENDIENTE de liquidar lo incurrido (${fmtMoney(r.incurrido.total)})`
        : 'Cancelada — sin plata afuera, sus actividades quedan libres')
      setCancelarTarget(null); setCancelarMotivo('')
      await recargarTodo()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cancelar', 'error')
    } finally { setAplicando(false) }
  }

  // ═══════════════════════════ Ajustar átomos ═══════════════════════════
  const [ajustarTarget, setAjustarTarget] = useState<AsignacionContratista | null>(null)
  const [ajustarSel, setAjustarSel] = useState<Set<string>>(new Set())
  const [ajustarMotivo, setAjustarMotivo] = useState('')

  const abrirAjustar = (a: AsignacionContratista) => {
    setAjustarTarget(a); setAjustarSel(new Set(a.atomos)); setAjustarMotivo('')
  }
  const ajustar = async () => {
    if (!ajustarTarget) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      const vigentes = await asegurarMigrado(proyecto, subdocs)
      const target = vigentes.find(a => a.id === ajustarTarget.id) ?? ajustarTarget
      const r = patchAjustarAtomos(target, [...ajustarSel], alcance, vigentes, ajustarMotivo, user?.uid ?? '', ahora)
      if (!r) { toast('Sin cambios que aplicar', 'error'); return }
      const trasPatch = vigentes.map(a => a.id === target.id
        ? { ...a, ...r.sub, historial: [...a.historial, r.entradaHistorial] } as AsignacionContratista : a)
      await escribirAsignacion(proyecto.id, alcance, target.id,
        { ...r.sub, historial: arrayUnion(r.entradaHistorial) }, trasPatch)
      toast('Átomos ajustados' + (target.preliquidacion ? ' — la preliquidación queda pendiente de revisar' : ''))
      setAjustarTarget(null)
      await recargarTodo()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al ajustar', 'error')
    } finally { setAplicando(false) }
  }

  // ═══════════════════════════ Resolver señal ═══════════════════════════
  const [senalMotivo, setSenalMotivo] = useState<Record<string, string>>({})
  const resolverSenal = async (a: AsignacionContratista) => {
    const motivo = senalMotivo[a.id] ?? ''
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      const vigentes = await asegurarMigrado(proyecto, subdocs)
      const target = vigentes.find(x => x.id === a.id) ?? a
      const r = patchResolverSenal(target, motivo, user?.uid ?? '', ahora)
      if (!r) return
      const trasPatch = vigentes.map(x => x.id === target.id
        ? { ...x, alcance_desactualizado: undefined, historial: [...x.historial, r.entradaHistorial] } as AsignacionContratista : x)
      await escribirAsignacion(proyecto.id, alcance, target.id,
        { alcance_desactualizado: deleteField(), historial: arrayUnion(r.entradaHistorial) }, trasPatch)
      toast('Señal resuelta — preliquidación confirmada sin cambios')
      await recargarTodo()
    } catch { toast('Error al resolver la señal', 'error') } finally { setAplicando(false) }
  }

  const selectorAtomos = (sel: Set<string>, setSel: (s: Set<string>) => void, exceptoId?: string) => {
    const tomadosPorOtras = atomosTomados(asigs.filter(a => a.id !== exceptoId))
    const duenoDe = (grupo: string) =>
      asigs.find(a => a.id !== exceptoId && a.estado !== 'cancelada' && a.atomos.includes(grupo))?.contratista_nombre
    return (
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {alcance.map(g => {
          const ocupado = tomadosPorOtras.has(g.grupo)
          return (
            <label key={g.grupo}
              className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${ocupado ? 'opacity-50' : 'hover:bg-gray-50 cursor-pointer'}`}>
              <span className="flex items-center gap-2.5 min-w-0">
                <input type="checkbox" className="accent-brand-700 flex-shrink-0" disabled={ocupado}
                  checked={sel.has(g.grupo)}
                  onChange={e => {
                    const s = new Set(sel)
                    if (e.target.checked) s.add(g.grupo); else s.delete(g.grupo)
                    setSel(s)
                  }} />
                <span className="text-gray-700 truncate">{g.grupo}</span>
                {ocupado && <span className="text-[11px] text-gray-400 flex-shrink-0">→ {duenoDe(g.grupo)}</span>}
              </span>
              {/* Condición: el VALOR de cada actividad al lado del nombre */}
              <span className="font-mono text-gray-600 flex-shrink-0">{fmtMoney(g.subtotal)}</span>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-800">Contratistas y cobertura del alcance</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cada actividad del alcance pertenece a UNA asignación — lo sin asignar se ve, con su valor.
          </p>
        </div>
        {puedeGestionar && (
          <button onClick={abrirAsignar}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 flex-shrink-0">
            ＋ Asignar contratista
          </button>
        )}
      </div>

      {/* Condición 1: si el resumen del padre miente, SE VE */}
      {desinc.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-300 px-3 py-2.5 text-sm text-red-800">
          <p className="font-semibold">⚠ El resumen del proyecto no coincide con sus asignaciones:</p>
          <ul className="list-disc ml-5 text-xs mt-1">{desinc.map((d, i) => <li key={i}>{d}</li>)}</ul>
          {puedeGestionar && (
            <button onClick={repararResumen} disabled={aplicando}
              className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 font-medium disabled:opacity-50">
              Recalcular resumen desde las asignaciones
            </button>
          )}
        </div>
      )}

      {!cargado ? (
        <p className="text-sm text-gray-400 text-center py-3">Cargando…</p>
      ) : asigs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-3">Sin contratistas asignados aún.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {asigs.map(a => {
            const margen = margenImplicitoDe(a, alcance)
            const revisar = requiereRevisionCobertura(a, alcance)
            return (
              <div key={a.id} className="px-3 py-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-gray-800">{a.contratista_nombre}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ESTADO_ASIG_COLOR[a.estado]}`}>
                    {ESTADO_ASIG_LABEL[a.estado]}
                  </span>
                  {a.legacy && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500"
                      title={`Asignación migrada del modelo anterior — su margen está calculado ${ETIQUETA_BASE_MARGEN[baseMargenDe(a)]}`}>
                      migrada
                    </span>
                  )}
                  {/* Condición: el badge DICE POR QUÉ — el número que lo disparó */}
                  {revisar && margen != null && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800"
                      title={`El costo pactado con este contratista deja un margen implícito del ${fmtNum(margen)}% sobre el CD de las actividades que tiene atribuidas (umbral: ${UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT}%). Revisa sus átomos con ✂ — no se excluye del indicador hasta que un humano decida.`}>
                      ⚠ Revisar cobertura — margen implícito {fmtNum(margen)}%: probablemente no cubre todo el alcance asignado
                    </span>
                  )}
                  {a.alcance_desactualizado && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800"
                      title={`El alcance cambió (${a.alcance_desactualizado.version === 0 ? 'ajuste manual de átomos' : `versión v${a.alcance_desactualizado.version}`}) — revisar la preliquidación`}>
                      ⚠ Preliquidación pendiente de revisar
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {a.atomos.length} actividad(es): {a.atomos.join(' · ')} ·{' '}
                  <span className="font-mono">CD {fmtMoney(alcance.length ? a.atomos.reduce((s, at) => s + (alcance.find(g => g.grupo === at)?.subtotal ?? 0), 0) : 0)}</span>
                </p>
                {a.preliquidacion && (
                  <p className="text-xs text-gray-500">
                    Contratista <span className="font-mono font-semibold">{fmtMoney(a.preliquidacion.valor_contratista)}</span>
                    {' · '}{MODALIDAD_CONTRATISTA_LABEL[a.modalidad]}
                    {a.preliquidacion.anticipo && <> · anticipo girado <span className="font-mono">{fmtMoney(a.preliquidacion.anticipo.valor)}</span></>}
                    {a.legacy && <span className="text-gray-400"> · margen {ETIQUETA_BASE_MARGEN[baseMargenDe(a)]}</span>}
                  </p>
                )}
                {a.cancelacion && (
                  <p className="text-xs text-rose-700">
                    Cancelada el {fFecha(a.cancelacion.fecha)} — {a.cancelacion.motivo} · incurrido {fmtMoney(a.cancelacion.incurrido.total)}
                    {a.cancelacion.incurrido.total > 0 && a.estado === 'cancelada' && ' (pendiente de liquidar)'}
                  </p>
                )}
                {a.alcance_desactualizado && puedeGestionar && a.estado !== 'cancelada' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={senalMotivo[a.id] ?? ''} onChange={e => setSenalMotivo(s => ({ ...s, [a.id]: e.target.value }))}
                      placeholder="Motivo para confirmar sin cambios…"
                      className="flex-1 min-w-[220px] px-2.5 py-1.5 border border-amber-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    <button onClick={() => resolverSenal(a)} disabled={aplicando || !(senalMotivo[a.id] ?? '').trim()}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-400 text-amber-800 hover:bg-amber-100 font-medium disabled:opacity-50">
                      Confirmar sin cambios
                    </button>
                  </div>
                )}
                {puedeGestionar && a.estado !== 'liquidada' && a.estado !== 'cancelada' && (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <button onClick={() => abrirAjustar(a)} disabled={aplicando}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium disabled:opacity-50">
                      ✂ Ajustar átomos
                    </button>
                    <button onClick={() => { setCancelarTarget(a); setCancelarMotivo('') }} disabled={aplicando}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium disabled:opacity-50">
                      Cancelar asignación
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Cobertura: lo sin asignar SE VE, con su valor (decisión 3) */}
      {cargado && alcance.length > 0 && (
        cobertura.completa ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-2.5 py-1.5">
            ✓ Cobertura completa — todas las actividades del alcance tienen contratista.
          </p>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2.5">
            <p className="text-sm font-semibold text-amber-800">
              Sin asignar: {cobertura.sin_asignar.length} actividad(es) · {fmtMoney(cobertura.valor_sin_costear)} sin costear
            </p>
            <ul className="mt-1 text-xs text-amber-800 space-y-0.5">
              {cobertura.sin_asignar.map(g => (
                <li key={g.grupo} className="flex justify-between gap-3">
                  <span>{g.grupo}</span><span className="font-mono">{fmtMoney(g.subtotal)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-amber-700">
              El proyecto queda FUERA del indicador presupuestal mientras el alcance no esté costeado completo.
            </p>
          </div>
        )
      )}

      {/* ── Modal: asignar ── */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Asignar contratista" size="lg"
        actions={[
          { label: 'Cancelar', onClick: () => setFormOpen(false), variant: 'secondary' },
          {
            label: aplicando ? 'Asignando…' : `Asignar (${atomosSel.size} · ${fmtMoney(cdSeleccionado)})`,
            onClick: asignar, variant: 'primary', loading: aplicando,
            disabled: !contratistaId || atomosSel.size === 0 || (modalidad === 'solo_mano_obra' && materiales === undefined),
          },
        ]}>
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Contratista (habilitados) <span className="text-red-500">*</span></span>
            <select value={contratistaId} onChange={e => setContratistaId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">Selecciona…</option>
              {contratistas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">
              Actividades que ejecuta <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-gray-400">CD seleccionado: <span className="font-mono">{fmtMoney(cdSeleccionado)}</span></span>
            </p>
            {selectorAtomos(atomosSel, setAtomosSel)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Modalidad</span>
              <select value={modalidad} onChange={e => setModalidad(e.target.value as ModalidadContratista)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                {MODALIDADES_CONTRATISTA.map(m => <option key={m} value={m}>{MODALIDAD_CONTRATISTA_LABEL[m]}</option>)}
              </select>
            </label>
            {modalidad === 'solo_mano_obra' && (
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Presupuesto materiales NEG <span className="text-red-500">*</span></span>
                <InputExpresion valor={materiales} onValor={setMateriales}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </label>
            )}
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Nota de criterio (opcional)</span>
            <input value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Por qué este contratista…"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
        </div>
      </Modal>

      {/* ── Modal: cancelar ── */}
      <Modal isOpen={cancelarTarget !== null} onClose={() => setCancelarTarget(null)}
        title={`Cancelar asignación — ${cancelarTarget?.contratista_nombre ?? ''}`}
        actions={[
          { label: 'Volver', onClick: () => setCancelarTarget(null), variant: 'secondary' },
          { label: aplicando ? 'Cancelando…' : 'Cancelar asignación', onClick: cancelar, variant: 'danger', loading: aplicando, disabled: !cancelarMotivo.trim() },
        ]}>
        <div className="space-y-3">
          {cancelarTarget && (() => {
            const anticipo = cancelarTarget.preliquidacion?.anticipo?.valor ?? 0
            const reemb = (cancelarTarget.compras_reembolsos ?? []).reduce((s, c) => s + (c.valor || 0), 0)
            const total = anticipo + reemb
            return (
              <p className="text-sm text-gray-600">
                Sus actividades quedan LIBRES (vuelven a "sin asignar").{' '}
                {total > 0
                  ? <>Ya hay plata afuera — anticipo {fmtMoney(anticipo)} + reembolsos {fmtMoney(reemb)} = <strong>{fmtMoney(total)}</strong>: la asignación quedará <strong>pendiente de liquidar lo incurrido</strong>.</>
                  : 'Sin plata afuera: la cancelación es terminal.'}
              </p>
            )
          })()}
          <textarea value={cancelarMotivo} onChange={e => setCancelarMotivo(e.target.value)} rows={3} autoFocus
            placeholder="Motivo de la cancelación (obligatorio)…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>
      </Modal>

      {/* ── Modal: ajustar átomos ── */}
      <Modal isOpen={ajustarTarget !== null} onClose={() => setAjustarTarget(null)}
        title={`Ajustar átomos — ${ajustarTarget?.contratista_nombre ?? ''}`} size="lg"
        actions={[
          { label: 'Volver', onClick: () => setAjustarTarget(null), variant: 'secondary' },
          { label: aplicando ? 'Aplicando…' : 'Aplicar ajuste', onClick: ajustar, variant: 'primary', loading: aplicando, disabled: ajustarSel.size === 0 || !ajustarMotivo.trim() },
        ]}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Qué actividades ejecuta REALMENTE este contratista. Si ya tiene preliquidación, quedará
            marcada como pendiente de revisar (el valor pactado es decisión humana).
          </p>
          {ajustarTarget && selectorAtomos(ajustarSel, setAjustarSel, ajustarTarget.id)}
          <input value={ajustarMotivo} onChange={e => setAjustarMotivo(e.target.value)}
            placeholder="Motivo del ajuste (obligatorio)…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>
      </Modal>
    </div>
  )
}
