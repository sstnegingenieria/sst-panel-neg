// CRONOGRAMA DE OBRA — EDITOR DE REJILLA (08-nov-2026, C2 de 3).
// La vista previa ES donde se arma el plan (decisión de Giovanny): la barra
// se PINTA arrastrando sobre la rejilla y el cambio se ve al instante; las
// fases se programan DE CORRIDO para que 30 actividades del alcance no se
// agenden una por una — si esto cuesta más que Excel, nadie lo usa.
// El BORRADOR vive en proyecto.cronograma_borrador (los gestores ya escriben
// el doc: sin regla nueva). La emisión (CRN + PDF + hash) llega en C3.
import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react'
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteField,
  arrayUnion, query, orderBy, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { toast } from '../../shared/Toast'
import { useAuth } from '../../../contexts/AuthContext'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import { generarPdfCronograma, cargarAssetsPdf } from '../../../utils/sigp/cronogramaPdf'
import { sha256Hex } from '../../../utils/sigp/cotizacionPdf'
import { puedeEmitirCronogramaUI } from '../../../types/sigp/permisos'
import type { Proyecto } from '../../../types/sigp/proyecto'
import type {
  ActividadCronograma, BorradorCronograma, FaseCronograma, HitoCronograma,
  CronogramaObra as CronogramaEmitido,
} from '../../../types/sigp/cronograma'
import {
  construirCronograma, actividadesHuerfanas, plantillaFases,
  entradaHistorialCronograma,
} from '../../../types/sigp/cronograma'
import {
  pintarBarra, moverHito, programarFaseEnCadena, moverFase, volverTextoLibre,
  toggleEnVentana, quitarFila, moverFila, moverFaseOrden, clavesSinReferenciar,
} from '../../../types/sigp/cronogramaEdicion'
import {
  festivosSetDe, festivosEnRango, diasHabilesEfectivos, sumarDias,
  diaSemanaDe, tipoDia, LETRA_DIA, nombrarFechas, fmtDiasHabiles, fechaIsoAUtc,
  type TipoDia,
} from '../../../utils/sigp/calendarioColombia'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

const uuid = () => crypto.randomUUID()
const hoyIso = () => new Date().toISOString().slice(0, 10)

/** Fondo por tipo de día (columna). El sábado va rayado (media jornada). */
const FONDO_DIA: Record<TipoDia, string> = {
  habil: '',
  sabado: 'bg-[repeating-linear-gradient(135deg,#f3f4f6_0px,#f3f4f6_3px,transparent_3px,transparent_6px)]',
  domingo: 'bg-gray-200/70',
  festivo: 'bg-gray-200/70',
}

type Paint = { actividadId: string; ancla: number; hasta: number }

export default function CronogramaObra({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const { obtener } = useConsecutivo()
  const guardado = proyecto.cronograma_borrador
  const editable = puedeGestionar && proyecto.estado !== 'cerrado' && proyecto.estado !== 'cancelado'
  const puedeEmitir = puedeEmitirCronogramaUI(user?.rol) && editable

  // Borrador LOCAL del editor; se persiste con "Guardar borrador".
  const [plan, setPlan] = useState<BorradorCronograma | null>(guardado ?? null)
  const [dirty, setDirty] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [abiertaManual, setAbiertaManual] = useState<boolean | null>(null)
  const [paint, setPaint] = useState<Paint | null>(null)
  const [cadenaFase, setCadenaFase] = useState<string | null>(null)
  const [cadenaDesde, setCadenaDesde] = useState('1')
  const [cadenaDur, setCadenaDur] = useState('1')
  const [addFase, setAddFase] = useState<string | null>(null)
  const [addClave, setAddClave] = useState('')
  const [addLibre, setAddLibre] = useState('')
  const [addHito, setAddHito] = useState('')
  // Cronogramas EMITIDOS (subcolección — congelados con CRN + hash)
  const [emitidos, setEmitidos] = useState<(CronogramaEmitido & { id: string })[]>([])
  const [emitiendo, setEmitiendo] = useState(false)

  const cargarEmitidos = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'proyectos', proyecto.id, 'cronogramas'), orderBy('numero_cronograma', 'asc')))
      setEmitidos(snap.docs.map(d => ({ id: d.id, ...(d.data() as CronogramaEmitido) })))
    } catch (e) { console.error('Error cargando cronogramas emitidos:', e) }
  }, [proyecto.id])
  useEffect(() => { void cargarEmitidos() }, [cargarEmitidos])

  // El doc recargado pisa el estado local SOLO si no hay edición en curso.
  useEffect(() => { if (!dirty) setPlan(proyecto.cronograma_borrador ?? null) }, [proyecto, dirty])

  const abierta = abiertaManual ?? !!plan
  const edita = useCallback((fn: (p: BorradorCronograma) => BorradorCronograma) => {
    setPlan(p => (p ? fn(p) : p)); setDirty(true)
  }, [])

  const items = proyecto.snapshot?.items_alcance ?? []
  const plazo = plan?.plazo_dias ?? 30
  const fechaInicio = plan?.fecha_inicio ?? hoyIso()
  const fechaValida = fechaIsoAUtc(fechaInicio) !== null && Number.isInteger(plazo) && plazo >= 1 && plazo <= 730

  const festivos = useMemo(() => (fechaValida ? festivosSetDe(fechaInicio, plazo) : new Set<string>()), [fechaInicio, plazo, fechaValida])
  const dias = useMemo(() => {
    if (!fechaValida) return []
    return Array.from({ length: plazo }, (_, i) => {
      const iso = sumarDias(fechaInicio, i)
      const t = tipoDia(iso, festivos)
      return { dia: i + 1, iso, letra: LETRA_DIA[diaSemanaDe(iso)], numero: Number(iso.slice(8, 10)), tipo: t }
    })
  }, [fechaInicio, plazo, festivos, fechaValida])
  const semanas = useMemo(() => {
    const out: { n: number; span: number }[] = []
    for (let d = 1; d <= plazo; d += 7) out.push({ n: out.length + 1, span: Math.min(7, plazo - d + 1) })
    return out
  }, [plazo])

  const habiles = fechaValida ? diasHabilesEfectivos(fechaInicio, plazo) : 0
  const festivosRango = useMemo(() => (fechaValida ? festivosEnRango(fechaInicio, plazo) : []), [fechaInicio, plazo, fechaValida])
  const huerfanas = useMemo(() => (plan ? actividadesHuerfanas(plan.fases, proyecto.snapshot) : []), [plan, proyecto.snapshot])
  const validacion = useMemo(() => {
    if (!plan || !fechaValida) return null
    return construirCronograma({
      proyecto, fecha_inicio: plan.fecha_inicio, plazo_dias: plan.plazo_dias,
      fases: plan.fases, ventana_corte: plan.ventana_corte,
      observaciones: plan.observaciones, cronogramasPrevios: emitidos,
    })
  }, [plan, proyecto, fechaValida, emitidos])

  const sinReferenciar = useMemo(() => {
    if (!plan) return []
    const libres = new Set(clavesSinReferenciar(plan.fases, items.map(i => i.clave)))
    return items.filter(i => libres.has(i.clave))
  }, [plan, items])

  // ── Pintado de barras (pointer) ────────────────────────────────────────────
  useEffect(() => {
    if (!paint) return
    const up = () => {
      edita(p => ({ ...p, fases: pintarBarra(p.fases, paint.actividadId, paint.ancla, paint.hasta, p.plazo_dias) }))
      setPaint(null)
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [paint, edita])

  // ── Acciones ───────────────────────────────────────────────────────────────
  const armarPlantilla = () => {
    const fases = plantillaFases(proyecto.snapshot, 30)
    setPlan({
      fecha_inicio: hoyIso(), plazo_dias: 30, fases,
      fecha_actualizacion: Timestamp.now(), actualizado_por: user?.uid ?? '',
    })
    setDirty(true); setAbiertaManual(true)
    toast('Plantilla armada: el alcance aprobado cargado + las fases típicas. Programa las fases de corrido (⇢) y ajusta pintando las barras.')
  }

  const guardar = async () => {
    if (!plan) return
    setGuardando(true)
    try {
      const limpio: BorradorCronograma = {
        ...plan,
        fecha_actualizacion: Timestamp.now(),
        actualizado_por: user?.uid ?? '',
        ...(user?.nombre ? { actualizado_por_nombre: user.nombre } : {}),
      }
      if (!limpio.ventana_corte) delete limpio.ventana_corte
      if (!limpio.observaciones?.trim()) delete limpio.observaciones
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        cronograma_borrador: limpio, fecha_actualizacion: Timestamp.now(),
      })
      setDirty(false)
      toast('Borrador del cronograma guardado')
      await reload()
    } catch (e) {
      console.error('Error guardando cronograma:', e)
      toast('Error al guardar el borrador (verifica tu rol)', 'error')
    } finally { setGuardando(false) }
  }

  const eliminarBorrador = async () => {
    if (!confirm('¿Eliminar el borrador del cronograma? Esto no toca nada emitido.')) return
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        cronograma_borrador: deleteField(), fecha_actualizacion: Timestamp.now(),
      })
      setPlan(null); setDirty(false)
      toast('Borrador eliminado')
      await reload()
    } catch (e) {
      console.error(e); toast('Error al eliminar el borrador', 'error')
    } finally { setGuardando(false) }
  }

  // ── Emisión (C3): el documento congelado — CRN + PDF + hash ────────────────
  const emitir = async () => {
    if (!plan || dirty || !validacion?.ok) return
    const r = construirCronograma({
      proyecto, fecha_inicio: plan.fecha_inicio, plazo_dias: plan.plazo_dias,
      fases: plan.fases, ventana_corte: plan.ventana_corte,
      observaciones: plan.observaciones, cronogramasPrevios: emitidos,
    })
    if (!r.ok) { toast(r.error, 'error'); return }
    if (!confirm(`¿Emitir el cronograma (emisión N° ${r.cronograma.numero_cronograma}, del ${r.cronograma.fecha_inicio} al ${r.cronograma.fecha_fin})? Queda CONGELADO con consecutivo CRN, PDF y hash — una modificación posterior se emite como cronograma nuevo.`)) return
    setEmitiendo(true)
    try {
      const consecutivo = await obtener('CRN')
      const ahora = Timestamp.now()
      // Firma del emisor: correo del perfil + celular si existe (patrón corte)
      let celular: string | undefined
      try {
        if (user?.uid) celular = (await getDoc(doc(db, 'users', user.uid))).data()?.celular as string | undefined
      } catch { /* el celular es opcional */ }
      const cr: CronogramaEmitido = {
        ...r.cronograma, consecutivo,
        fecha_emision: ahora, emitido_por: user?.uid ?? '',
        ...(user?.nombre ? { emitido_por_nombre: user.nombre } : {}),
        emisor: {
          nombre: user?.nombre ?? user?.email ?? '—',
          area: 'GESTIÓN DE PROYECTOS',
          ...(user?.email ? { correo: user.email } : {}),
          ...(celular ? { telefono: celular } : {}),
        },
        fecha_creacion: ahora,
      }
      const assets = await cargarAssetsPdf()
      const bytes = await generarPdfCronograma(cr, assets)
      const hash = await sha256Hex(bytes)
      const nombrePdf = `${consecutivo}.pdf`
      const up = await uploadBytes(ref(storage, `proyectos/${proyecto.id}/cronogramas/${nombrePdf}`), bytes, { contentType: 'application/pdf' })
      const url = await getDownloadURL(up.ref)
      await setDoc(doc(collection(db, 'proyectos', proyecto.id, 'cronogramas')), {
        ...cr, pdf_url: url, pdf_nombre: nombrePdf, pdf_hash: hash,
      })
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        historial: arrayUnion(entradaHistorialCronograma(proyecto.estado, consecutivo, cr.numero_cronograma, cr.fecha_inicio, cr.fecha_fin, user?.uid ?? '', ahora, user?.nombre)),
        fecha_actualizacion: ahora,
      })
      toast(`${consecutivo} emitido — cronograma congelado con PDF y hash`)
      await cargarEmitidos(); await reload()
    } catch (e) {
      console.error('Error emitiendo cronograma:', e)
      toast('Error al emitir el cronograma (verifica tu rol y el consecutivo)', 'error')
    } finally { setEmitiendo(false) }
  }

  const aplicarCadena = (faseId: string) => {
    const desde = parseInt(cadenaDesde, 10) || 1
    const dur = parseInt(cadenaDur, 10) || 1
    let desbordo = false
    edita(p => {
      const r = programarFaseEnCadena(p.fases, faseId, { desde, duracion: dur, fechaInicio: p.fecha_inicio, plazo: p.plazo_dias })
      desbordo = r.desbordo
      return { ...p, fases: r.fases }
    })
    setCadenaFase(null)
    if (desbordo) toast('La cadena no cupo completa: las últimas barras quedaron recortadas al final del plazo — amplía el plazo o reparte', 'error')
  }

  const desplazarFase = (faseId: string, delta: number) => {
    edita(p => {
      const r = moverFase(p.fases, faseId, delta, p.plazo_dias)
      if (!r) { toast('La fase no cabe desplazada: algo quedaría fuera del plazo', 'error'); return p }
      return { ...p, fases: r }
    })
  }

  const agregarActividad = (faseId: string) => {
    const item = items.find(i => i.clave === addClave)
    const descripcion = item ? item.descripcion : addLibre.trim()
    if (!descripcion) { toast('Elige un ítem del alcance o escribe la actividad', 'error'); return }
    const nueva: ActividadCronograma = {
      id: uuid(), tipo: 'actividad', descripcion, dia_inicio: 1, dia_fin: 1,
      ...(item ? { item_clave: item.clave, ...(item.codigo ? { item_codigo: item.codigo } : {}) } : {}),
    }
    edita(p => ({ ...p, fases: p.fases.map(f => f.id === faseId ? { ...f, filas: [...f.filas, nueva] } : f) }))
    setAddClave(''); setAddLibre('')
  }

  const agregarHito = (faseId: string) => {
    const nombre = addHito.trim()
    if (!nombre) { toast('El hito necesita nombre', 'error'); return }
    const nuevo: HitoCronograma = { id: uuid(), tipo: 'hito', nombre, dia: 1 }
    edita(p => ({ ...p, fases: p.fases.map(f => f.id === faseId ? { ...f, filas: [...f.filas, nuevo] } : f) }))
    setAddHito('')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (items.length === 0) return null

  const COL = plazo > 60 ? 14 : plazo > 40 ? 18 : 22
  const gridCols = `250px 44px repeat(${plazo}, ${COL}px)`
  const enVentanaCol = (d: number) => !!plan?.ventana_corte && d >= plan.ventana_corte.dia_inicio && d <= plan.ventana_corte.dia_fin

  const celdasDia = (fila: ActividadCronograma | HitoCronograma) => dias.map(d => {
    const esActividad = fila.tipo === 'actividad'
    let dentro = false
    if (esActividad) {
      const a = fila as ActividadCronograma
      const [ini, fin] = paint && paint.actividadId === a.id
        ? [Math.min(paint.ancla, paint.hasta), Math.max(paint.ancla, paint.hasta)]
        : [a.dia_inicio, a.dia_fin]
      dentro = d.dia >= ini && d.dia <= fin
    }
    const noLaborable = d.tipo === 'domingo' || d.tipo === 'festivo'
    const lima = esActividad && (fila as ActividadCronograma).en_ventana
    return (
      <div
        key={`${fila.id}-${d.dia}`}
        className={`h-7 border-r border-b border-gray-100 relative ${FONDO_DIA[d.tipo]} ${enVentanaCol(d.dia) ? 'bg-lime-50/60' : ''} ${editable ? 'cursor-pointer' : ''}`}
        title={`Día ${d.dia} · ${d.iso}${d.tipo === 'festivo' ? ' · festivo' : d.tipo === 'domingo' ? ' · domingo' : d.tipo === 'sabado' ? ' · sábado (½ jornada)' : ''}`}
        onPointerDown={editable && esActividad ? (e) => { e.preventDefault(); setPaint({ actividadId: fila.id, ancla: d.dia, hasta: d.dia }) } : undefined}
        onPointerEnter={editable && esActividad && paint?.actividadId === fila.id ? () => setPaint(p => p && { ...p, hasta: d.dia }) : undefined}
        onClick={editable && !esActividad ? () => edita(p => ({ ...p, fases: moverHito(p.fases, fila.id, d.dia, p.plazo_dias) })) : undefined}
      >
        {esActividad && dentro && (noLaborable
          ? <div className="absolute inset-x-0 top-1/2 border-t-2 border-dotted border-brand-600/60" />
          : <div className={`absolute inset-x-0 top-1 bottom-1 ${lima ? 'bg-accent' : 'bg-brand-600'} ${d.dia === (fila as ActividadCronograma).dia_inicio ? 'rounded-l' : ''} ${d.dia === (fila as ActividadCronograma).dia_fin ? 'rounded-r' : ''}`} />)}
        {!esActividad && (fila as HitoCronograma).dia === d.dia && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-brand-700 rotate-45" />
        )}
      </div>
    )
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={() => setAbiertaManual(!abierta)} className="flex items-center gap-2 text-left group" aria-expanded={abierta}>
          <span className="text-gray-400 text-xs">{abierta ? '▾' : '▸'}</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide group-hover:text-gray-600 transition">
            Cronograma de obra
          </span>
          {!abierta && (
            <span className="text-[11px] text-gray-400">
              {plan ? `· ${plan.plazo_dias} días desde ${plan.fecha_inicio}${dirty ? ' · sin guardar' : ''}` : '· sin armar'}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-600 font-medium">● cambios sin guardar</span>}
          {plan && editable && (
            <>
              <button onClick={guardar} disabled={guardando || !dirty}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition">
                💾 Guardar borrador
              </button>
              {puedeEmitir && (
                <button onClick={emitir} disabled={emitiendo || dirty || !validacion?.ok}
                  title={dirty ? 'Guarda el borrador antes de emitir' : !validacion?.ok ? 'El plan tiene pendientes (ver el aviso abajo)' : 'Congela el plan con consecutivo CRN, PDF y hash'}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand-700 text-white hover:bg-brand-600 disabled:opacity-40 transition">
                  {emitiendo ? 'Emitiendo…' : '📄 Emitir cronograma'}
                </button>
              )}
              <button onClick={eliminarBorrador} disabled={guardando}
                className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 transition"
                title="Eliminar el borrador completo">🗑</button>
            </>
          )}
        </div>
      </div>

      {abierta && !plan && (
        <div className="text-center py-6 space-y-2">
          <p className="text-sm text-gray-500">El cronograma se entrega al cliente antes de iniciar. Nadie arranca de una hoja en blanco:</p>
          {editable ? (
            <button onClick={armarPlantilla} className="text-sm px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition">
              📋 Armar desde el alcance aprobado ({items.length} ítem{items.length === 1 ? '' : 's'} + fases típicas)
            </button>
          ) : <p className="text-xs text-gray-400">Un gestor del proyecto lo arma desde la plantilla.</p>}
        </div>
      )}

      {abierta && plan && (
        <div className="space-y-3">
          {/* Parámetros del plan */}
          <div className="flex items-end gap-3 flex-wrap text-xs">
            <label className="space-y-0.5">
              <span className="block text-gray-500">Inicio</span>
              <input type="date" value={plan.fecha_inicio} disabled={!editable}
                onChange={e => edita(p => ({ ...p, fecha_inicio: e.target.value }))}
                className="border border-gray-200 rounded-lg px-2 py-1.5" />
            </label>
            <label className="space-y-0.5">
              <span className="block text-gray-500">Plazo (días calendario)</span>
              <input type="number" min={1} max={730} value={plan.plazo_dias} disabled={!editable}
                onChange={e => edita(p => ({ ...p, plazo_dias: parseInt(e.target.value, 10) || 1 }))}
                className="border border-gray-200 rounded-lg px-2 py-1.5 w-24" />
            </label>
            {fechaValida && (
              <div className="text-gray-500 pb-1.5">
                Del <b className="text-gray-700">{fechaInicio}</b> al <b className="text-gray-700">{sumarDias(fechaInicio, plazo - 1)}</b>
                {' · '}<b className="text-gray-700">{fmtDiasHabiles(habiles)}</b> días hábiles efectivos
                {' · '}festivos: {festivosRango.length > 0 ? nombrarFechas(festivosRango.map(f => f.fecha)) : 'ninguno en el plazo'}
              </div>
            )}
          </div>

          {/* Huérfanas de un cambio de alcance (patrón 058: listar, ofrecer salida) */}
          {huerfanas.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1.5">
              <p className="font-semibold text-amber-800">
                ⚠ {huerfanas.length} actividad(es) referencian ítems que ya no están en el alcance vigente (entró un cambio de alcance posterior):
              </p>
              {huerfanas.map(h => (
                <div key={h.actividad.id} className="flex items-center justify-between gap-2">
                  <span className="text-amber-900 truncate">«{h.actividad.descripcion}» — fase {h.fase}</span>
                  {editable && (
                    <span className="shrink-0 space-x-2">
                      <button className="text-brand-700 hover:underline"
                        onClick={() => edita(p => ({ ...p, fases: volverTextoLibre(p.fases, h.actividad.id) }))}>volver texto libre</button>
                      <button className="text-red-600 hover:underline"
                        onClick={() => edita(p => ({ ...p, fases: quitarFila(p.fases, h.actividad.id) }))}>quitar</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Ventana de corte programado */}
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!plan.ventana_corte} disabled={!editable}
                onChange={e => edita(p => e.target.checked
                  ? { ...p, ventana_corte: { dia_inicio: 1, dia_fin: Math.min(2, p.plazo_dias), nota: 'Las actividades que requieren desenergizar se agrupan en una sola ventana de corte programado.' } }
                  : (() => { const { ventana_corte: _v, ...resto } = p; return resto as BorradorCronograma })())} />
              <span className="text-gray-600 font-medium">Ventana de corte programado</span>
            </label>
            {plan.ventana_corte && (
              <>
                <label className="flex items-center gap-1 text-gray-500">día
                  <input type="number" min={1} max={plazo} value={plan.ventana_corte.dia_inicio} disabled={!editable}
                    onChange={e => edita(p => ({ ...p, ventana_corte: { ...p.ventana_corte!, dia_inicio: parseInt(e.target.value, 10) || 1 } }))}
                    className="border border-gray-200 rounded px-1.5 py-1 w-16" />
                </label>
                <label className="flex items-center gap-1 text-gray-500">al
                  <input type="number" min={1} max={plazo} value={plan.ventana_corte.dia_fin} disabled={!editable}
                    onChange={e => edita(p => ({ ...p, ventana_corte: { ...p.ventana_corte!, dia_fin: parseInt(e.target.value, 10) || 1 } }))}
                    className="border border-gray-200 rounded px-1.5 py-1 w-16" />
                </label>
                <input type="text" value={plan.ventana_corte.nota} disabled={!editable} placeholder="Nota al pie: por qué se agrupan"
                  onChange={e => edita(p => ({ ...p, ventana_corte: { ...p.ventana_corte!, nota: e.target.value } }))}
                  className="border border-gray-200 rounded px-2 py-1 flex-1 min-w-[260px]" />
                <span className="text-gray-400">marca cada actividad con ⚡ para meterla en la ventana</span>
              </>
            )}
          </div>

          {/* LA REJILLA — la vista previa es el editor */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg select-none">
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: 'max-content' }} className="text-[10px]">
              {/* banda de semanas */}
              <div className="sticky left-0 z-10 bg-brand-600 text-white font-semibold px-2 py-1 text-[11px]" style={{ gridColumn: 'span 2' }}>ACTIVIDAD</div>
              {semanas.map(s => (
                <div key={s.n} style={{ gridColumn: `span ${s.span}` }}
                  className="bg-brand-600 text-white text-center font-semibold py-1 border-l border-white/30">
                  {s.span >= 3 ? `SEMANA ${s.n}` : `S${s.n}`}
                </div>
              ))}
              {/* número y letra del día */}
              <div className="sticky left-0 z-10 bg-white border-b border-gray-200" style={{ gridColumn: 'span 2' }} />
              {dias.map(d => (
                <div key={`n${d.dia}`} className={`text-center border-r border-b border-gray-100 py-0.5 font-medium text-gray-600 ${FONDO_DIA[d.tipo]}`}
                  title={d.iso}>{d.numero}<br /><span className="text-gray-400">{d.letra}</span></div>
              ))}

              {plan.fases.map((f, fi) => (
                <FaseFilas key={f.id} fase={f} fi={fi} total={plan.fases.length} editable={editable}
                  celdasDia={celdasDia} hayVentana={!!plan.ventana_corte}
                  cadenaFase={cadenaFase} setCadenaFase={setCadenaFase}
                  cadenaDesde={cadenaDesde} setCadenaDesde={setCadenaDesde}
                  cadenaDur={cadenaDur} setCadenaDur={setCadenaDur} aplicarCadena={aplicarCadena}
                  desplazarFase={desplazarFase}
                  addFase={addFase} setAddFase={setAddFase}
                  addClave={addClave} setAddClave={setAddClave}
                  addLibre={addLibre} setAddLibre={setAddLibre}
                  addHito={addHito} setAddHito={setAddHito}
                  agregarActividad={agregarActividad} agregarHito={agregarHito}
                  sinReferenciar={sinReferenciar}
                  edita={edita}
                />
              ))}
            </div>
          </div>

          {editable && (
            <button className="text-xs text-brand-700 hover:underline"
              onClick={() => edita(p => ({ ...p, fases: [...p.fases, { id: uuid(), nombre: 'NUEVA FASE', filas: [] }] }))}>
              ＋ Agregar fase
            </button>
          )}

          {/* Leyenda + pie */}
          <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-2.5 bg-brand-600 rounded-sm" /> Actividad</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-2.5 bg-accent rounded-sm" /> En ventana de corte</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-brand-700 rotate-45" /> Hito</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-2.5 bg-gray-200" /> Domingo / festivo</span>
            <span className="flex items-center gap-1"><span className={`inline-block w-5 h-2.5 ${FONDO_DIA.sabado}`} /> Sábado (½ jornada)</span>
          </div>
          {validacion && (validacion.ok
            ? <p className="text-[11px] text-gray-500 italic">{validacion.cronograma.nota_jornada}</p>
            : <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠ {validacion.error}</p>)}

          <label className="block text-xs text-gray-500">
            Observaciones del documento
            <textarea value={plan.observaciones ?? ''} disabled={!editable} rows={2}
              onChange={e => edita(p => ({ ...p, observaciones: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </label>
        </div>
      )}

      {/* Cronogramas EMITIDOS (congelados — el vigente es el último) */}
      {abierta && emitidos.length > 0 && (
        <div className="border-t border-gray-100 pt-2 space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Cronogramas emitidos</p>
          {emitidos.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 text-xs flex-wrap">
              <span className="font-semibold text-brand-700">{c.consecutivo}</span>
              <span className="text-gray-500">emisión {c.numero_cronograma} · del {c.fecha_inicio} al {c.fecha_fin} · {c.plazo_dias} días</span>
              {i === emitidos.length - 1 && (
                <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] font-semibold">VIGENTE</span>
              )}
              {c.emitido_por_nombre && <span className="text-gray-400">por {c.emitido_por_nombre}</span>}
              {c.pdf_url && <a href={c.pdf_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">📄 PDF</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Filas de una fase (banda + filas con celdas) ─────────────────────────────

interface FaseFilasProps {
  fase: FaseCronograma
  fi: number
  total: number
  editable: boolean
  celdasDia: (fila: ActividadCronograma | HitoCronograma) => ReactNode
  hayVentana: boolean
  cadenaFase: string | null
  setCadenaFase: (v: string | null) => void
  cadenaDesde: string
  setCadenaDesde: (v: string) => void
  cadenaDur: string
  setCadenaDur: (v: string) => void
  aplicarCadena: (faseId: string) => void
  desplazarFase: (faseId: string, delta: number) => void
  addFase: string | null
  setAddFase: (v: string | null) => void
  addClave: string
  setAddClave: (v: string) => void
  addLibre: string
  setAddLibre: (v: string) => void
  addHito: string
  setAddHito: (v: string) => void
  agregarActividad: (faseId: string) => void
  agregarHito: (faseId: string) => void
  sinReferenciar: { clave: string; codigo?: string; descripcion: string }[]
  edita: (fn: (p: BorradorCronograma) => BorradorCronograma) => void
}

function FaseFilas(p: FaseFilasProps) {
  const { fase, fi, total, editable, edita } = p
  return (
    <>
      {/* banda de la fase (ocupa todo el ancho; el contenido queda pegado a
          la izquierda aunque la rejilla esté scrolleada) */}
      <div style={{ gridColumn: '1 / -1' }} className="bg-brand-50/70 border-b border-gray-200">
      <div className="sticky left-0 w-fit max-w-[calc(100vw-80px)] px-2 py-1 flex items-center gap-2">
        {editable ? (
          <input value={fase.nombre}
            onChange={e => edita(pl => ({ ...pl, fases: pl.fases.map(f => f.id === fase.id ? { ...f, nombre: e.target.value } : f) }))}
            className="bg-transparent font-semibold text-brand-700 text-[11px] uppercase tracking-wide outline-none min-w-[160px] flex-1" />
        ) : <span className="font-semibold text-brand-700 text-[11px] uppercase tracking-wide">{fase.nombre}</span>}
        {editable && (
          <span className="flex items-center gap-1.5 text-[11px] shrink-0">
            <button title="Programar la fase de corrido" className="text-brand-700 hover:bg-brand-100 rounded px-1"
              onClick={() => p.setCadenaFase(p.cadenaFase === fase.id ? null : fase.id)}>⇢ de corrido</button>
            <button title="Desplazar fase −1 día" className="text-gray-500 hover:bg-gray-100 rounded px-1" onClick={() => p.desplazarFase(fase.id, -1)}>◀</button>
            <button title="Desplazar fase +1 día" className="text-gray-500 hover:bg-gray-100 rounded px-1" onClick={() => p.desplazarFase(fase.id, 1)}>▶</button>
            <button title="Agregar actividad o hito" className="text-brand-700 hover:bg-brand-100 rounded px-1"
              onClick={() => p.setAddFase(p.addFase === fase.id ? null : fase.id)}>＋</button>
            <button title="Subir fase" disabled={fi === 0} className="text-gray-400 hover:bg-gray-100 rounded px-1 disabled:opacity-30"
              onClick={() => edita(pl => ({ ...pl, fases: moverFaseOrden(pl.fases, fase.id, -1) }))}>↑</button>
            <button title="Bajar fase" disabled={fi === total - 1} className="text-gray-400 hover:bg-gray-100 rounded px-1 disabled:opacity-30"
              onClick={() => edita(pl => ({ ...pl, fases: moverFaseOrden(pl.fases, fase.id, 1) }))}>↓</button>
            <button title="Eliminar fase" className="text-gray-400 hover:text-red-600 rounded px-1"
              onClick={() => { if (confirm(`¿Eliminar la fase «${fase.nombre}» con sus ${fase.filas.length} fila(s)?`)) edita(pl => ({ ...pl, fases: pl.fases.filter(f => f.id !== fase.id) })) }}>✕</button>
          </span>
        )}
      </div>
      </div>

      {/* programar de corrido */}
      {p.cadenaFase === fase.id && (
        <div style={{ gridColumn: '1 / -1' }} className="bg-brand-50/40 border-b border-gray-200 text-[11px]">
        <div className="sticky left-0 w-fit max-w-[calc(100vw-80px)] px-2 py-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-gray-600">Encadenar las actividades de «{fase.nombre}»:</span>
          <label className="flex items-center gap-1">desde el día
            <input type="number" min={1} value={p.cadenaDesde} onChange={e => p.setCadenaDesde(e.target.value)}
              className="border border-gray-200 rounded px-1.5 py-0.5 w-14" />
          </label>
          <label className="flex items-center gap-1">· días laborables por actividad
            <input type="number" min={1} value={p.cadenaDur} onChange={e => p.setCadenaDur(e.target.value)}
              className="border border-gray-200 rounded px-1.5 py-0.5 w-14" />
          </label>
          <span className="text-gray-400">(salta domingos y festivos; el sábado trabaja)</span>
          <button className="px-2 py-0.5 rounded bg-brand-600 text-white hover:bg-brand-700" onClick={() => p.aplicarCadena(fase.id)}>Aplicar</button>
          <button className="text-gray-400 hover:underline" onClick={() => p.setCadenaFase(null)}>cancelar</button>
        </div>
        </div>
      )}

      {/* agregar actividad / hito */}
      {p.addFase === fase.id && editable && (
        <div style={{ gridColumn: '1 / -1' }} className="bg-gray-50 border-b border-gray-200 text-[11px]">
        <div className="sticky left-0 w-fit max-w-[calc(100vw-80px)] px-2 py-1.5 flex items-center gap-2 flex-wrap">
          <select value={p.addClave} onChange={e => { p.setAddClave(e.target.value); p.setAddLibre('') }}
            className="border border-gray-200 rounded px-1.5 py-1 max-w-[320px]">
            <option value="">— ítem del alcance aún sin programar —</option>
            {p.sinReferenciar.map(i => (
              <option key={i.clave} value={i.clave}>{i.codigo ? `${i.codigo} — ` : ''}{i.descripcion.slice(0, 80)}</option>
            ))}
          </select>
          <span className="text-gray-400">o texto libre:</span>
          <input type="text" value={p.addLibre} placeholder="Actividad que no se cobra por separado"
            onChange={e => { p.setAddLibre(e.target.value); p.setAddClave('') }}
            className="border border-gray-200 rounded px-2 py-1 min-w-[220px]" />
          <button className="px-2 py-0.5 rounded bg-brand-600 text-white hover:bg-brand-700" onClick={() => p.agregarActividad(fase.id)}>＋ Actividad</button>
          <span className="text-gray-300">|</span>
          <input type="text" value={p.addHito} placeholder="Nombre del hito (rombo con fecha)"
            onChange={e => p.setAddHito(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 min-w-[200px]" />
          <button className="px-2 py-0.5 rounded bg-brand-700 text-white hover:bg-brand-600" onClick={() => p.agregarHito(fase.id)}>◆ Hito</button>
        </div>
        </div>
      )}

      {fase.filas.map(fila => (
        <FilaRow key={fila.id} fila={fila} editable={editable} hayVentana={p.hayVentana}
          celdasDia={p.celdasDia} edita={edita} />
      ))}
    </>
  )
}

function FilaRow({ fila, editable, hayVentana, celdasDia, edita }: {
  fila: ActividadCronograma | HitoCronograma
  editable: boolean
  hayVentana: boolean
  celdasDia: FaseFilasProps['celdasDia']
  edita: FaseFilasProps['edita']
}) {
  const esAct = fila.tipo === 'actividad'
  const a = esAct ? (fila as ActividadCronograma) : null
  return (
    <>
      <div className={`sticky left-0 z-10 bg-white border-r border-b border-gray-100 px-2 py-0.5 flex items-center gap-1 group ${esAct ? '' : 'italic'}`}>
        <span className="truncate flex-1 text-[11px] text-gray-700" title={esAct ? a!.descripcion : (fila as HitoCronograma).nombre}>
          {esAct ? a!.descripcion : (fila as HitoCronograma).nombre}
        </span>
        {editable && (
          <span className="hidden group-hover:flex items-center gap-0.5 shrink-0 text-[10px]">
            {esAct && hayVentana && (
              <button title={a!.en_ventana ? 'Sacar de la ventana de corte' : 'Meter en la ventana de corte'}
                className={`rounded px-0.5 ${a!.en_ventana ? 'text-lime-600' : 'text-gray-300 hover:text-lime-600'}`}
                onClick={() => edita(p => ({ ...p, fases: toggleEnVentana(p.fases, fila.id) }))}>⚡</button>
            )}
            {esAct && a!.item_clave && (
              <button title="Soltar el enlace al alcance (volver texto libre)" className="text-gray-300 hover:text-brand-700 rounded px-0.5"
                onClick={() => edita(p => ({ ...p, fases: volverTextoLibre(p.fases, fila.id) }))}>🔗</button>
            )}
            <button title="Subir" className="text-gray-300 hover:text-gray-600 rounded px-0.5"
              onClick={() => edita(p => ({ ...p, fases: moverFila(p.fases, fila.id, -1) }))}>↑</button>
            <button title="Bajar" className="text-gray-300 hover:text-gray-600 rounded px-0.5"
              onClick={() => edita(p => ({ ...p, fases: moverFila(p.fases, fila.id, 1) }))}>↓</button>
            <button title="Quitar fila" className="text-gray-300 hover:text-red-600 rounded px-0.5"
              onClick={() => edita(p => ({ ...p, fases: quitarFila(p.fases, fila.id) }))}>✕</button>
          </span>
        )}
      </div>
      <div className="sticky left-[250px] z-10 bg-white border-r border-b border-gray-100 px-1 py-0.5 text-center text-[10px] text-gray-400">
        {esAct ? (a!.item_codigo ?? '') : ''}
      </div>
      {celdasDia(fila)}
    </>
  )
}
