import { useState, useEffect, useMemo, Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  doc, getDoc, getDocs, setDoc, collection, query, where, updateDoc, deleteField, Timestamp,
} from 'firebase/firestore'
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { generarPdfCotizacion, cargarAssetsPdf, sha256Hex } from '../../utils/sigp/cotizacionPdf'
import type { VersionCotizacion } from '../../types/sigp/cotizacion'
import { useCotizacionDetalle } from '../../hooks/sigp/useCotizacionDetalle'
import { useAuth } from '../../contexts/AuthContext'
import { useConsecutivo } from '../../hooks/sigp/useConsecutivo'
import { toast } from '../../components/shared/Toast'
import { puedeGestionarCotizacionesUI } from '../../types/sigp/permisos'
import {
  calcularTotales, valorTotalItem, estadoEfectivo,
  ESTADO_COT_LABEL, ESTADO_COT_COLOR, ESQUEMA_LABEL, ESQUEMAS,
  precioDesdeCosto, margenDesdePrecio, asignarCodigosINP,
  AGRUPADORES, AGRUPADOR_LABEL, AGRUPADOR_SINGULAR,
  TIPOS_INVERSION, TIPO_INVERSION_LABEL, TIPO_INVERSION_COLOR,
} from '../../types/sigp/cotizacion'
import type { AgrupadorItems, TipoInversion } from '../../types/sigp/cotizacion'
import type { CatalogoItem } from '../../types/sigp/catalogo'
import type { ItemCotizacion, EsquemaTributario, ConfigAIU, CondicionesCotizacion, APU } from '../../types/sigp/cotizacion'
import ApuModal from '../../components/sigp/cotizaciones/ApuModal'
import type { ItemLPU } from '../../types/sigp/lpu'
import type { CantidadPreliminar } from '../../types/sigp/visita'
import CotizacionAcciones from '../../components/sigp/cotizaciones/CotizacionAcciones'
import VersionesCotizacion from '../../components/sigp/cotizaciones/VersionesCotizacion'

const fMoneda = (n: number) => '$ ' + Math.round(n || 0).toLocaleString('es-CO')

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d
    ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '—'
}

export default function CotizacionDetalleSigp() {
  const { cotizacionId } = useParams<{ cotizacionId: string }>()
  const { cotizacion, version, cliente, loading, noEncontrada, reload } = useCotizacionDetalle(cotizacionId)
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarCotizacionesUI(user?.rol)

  // Estado editable (se inicializa desde la versión activa)
  const [items, setItems] = useState<ItemCotizacion[]>([])
  const [esquema, setEsquema] = useState<EsquemaTributario>('iva_pleno')
  const [aiuAdmin, setAiuAdmin] = useState('9')
  const [aiuImprev, setAiuImprev] = useState('5')
  const [aiuUtil, setAiuUtil] = useState('4')
  const [ivaPct, setIvaPct] = useState('19')
  const [cond, setCond] = useState<CondicionesCotizacion>({ forma_pago: '', validez_dias: 30, tiempo_ejecucion: '', garantia: '', moneda: 'COP' })
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Filas con descripción expandida (por índice del ítem)
  const [expandidos, setExpandidos] = useState<Record<number, boolean>>({})
  const [asunto, setAsunto] = useState('')
  // 1.4B.b — análisis económico interno (toggle apagado por defecto) + modal APU
  const [analisis, setAnalisis] = useState(false)
  const [apuIdx, setApuIdx] = useState<number | null>(null)
  // 1.4B.d — agrupador de la VERSIÓN (capitulos default) y tipo de inversión del padre
  const [agrupador, setAgrupador] = useState<AgrupadorItems>('capitulos')
  const [tipoInversion, setTipoInversion] = useState<TipoInversion | ''>('')

  // Datos auxiliares
  const [lpuItems, setLpuItems] = useState<ItemLPU[]>([])
  const [lpuNombre, setLpuNombre] = useState<string | null>(null)
  const [lpuVigenteId, setLpuVigenteId] = useState<string | null>(null)
  const [catItems, setCatItems] = useState<CatalogoItem[]>([])
  const [visitaCant, setVisitaCant] = useState<CantidadPreliminar[]>([])
  const [visitaCons, setVisitaCons] = useState<string | null>(null)
  const { obtener } = useConsecutivo()

  useEffect(() => {
    setAsunto(cotizacion?.asunto ?? '')
    setTipoInversion(cotizacion?.tipo_inversion ?? '')
  }, [cotizacion?.id, cotizacion?.asunto, cotizacion?.tipo_inversion]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!version) return
    setItems(version.items ?? [])
    setEsquema(version.esquema)
    setAiuAdmin(String(version.aiu?.admin ?? 9))
    setAiuImprev(String(version.aiu?.imprevistos ?? 5))
    setAiuUtil(String(version.aiu?.utilidad ?? 4))
    setIvaPct(String(version.iva_pct))
    setCond(version.condiciones)
    setAgrupador(version.agrupador ?? 'capitulos') // versiones pre-1.4B → capitulos
  }, [version?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar LPU vigente del cliente (para el buscador) y visita realizada vinculada.
  useEffect(() => {
    if (!cotizacion) return
    ;(async () => {
      if (cotizacion.cliente_id) {
        try {
          const lpus = await getDocs(query(collection(db, 'lpus'), where('cliente_id', '==', cotizacion.cliente_id)))
          const vig = lpus.docs.map(d => ({ id: d.id, ...d.data() })).find((l: any) => l.estado === 'vigente') as any
          if (vig) {
            setLpuNombre(vig.nombre)
            setLpuVigenteId(vig.id)
            const its = await getDocs(collection(db, 'lpus', vig.id, 'items'))
            setLpuItems(its.docs.map(d => ({ id: d.id, ...d.data() }) as ItemLPU))
          }
        } catch { /* LPU opcional */ }
      }
      if (cotizacion.solicitud_id) {
        try {
          const vis = await getDocs(query(collection(db, 'visitas'), where('solicitud_id', '==', cotizacion.solicitud_id)))
          const real = vis.docs.map(d => ({ id: d.id, ...d.data() })).find((v: any) => v.estado === 'realizada') as any
          if (real?.cantidades?.length) { setVisitaCant(real.cantidades); setVisitaCons(real.consecutivo) }
        } catch { /* opcional */ }
      }
      // Catálogo NEG (activos) para el buscador dual — independiente del cliente.
      try {
        const cat = await getDocs(query(collection(db, 'catalogo_items'), where('estado', '==', 'activo')))
        setCatItems(cat.docs.map(d => ({ id: d.id, ...d.data() }) as CatalogoItem))
      } catch { /* catálogo opcional */ }
    })()
  }, [cotizacion?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const aiuConfig = (): ConfigAIU | undefined =>
    esquema === 'aiu' ? { admin: Number(aiuAdmin), imprevistos: Number(aiuImprev), utilidad: Number(aiuUtil) } : undefined

  const totales = useMemo(
    () => calcularTotales(items, esquema, aiuConfig(), Number(ivaPct) || 0),
    [items, esquema, aiuAdmin, aiuImprev, aiuUtil, ivaPct], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const editable = cotizacion?.estado === 'borrador' && puedeGestionar
  const capitulos = useMemo(() => [...new Set(items.map(i => i.capitulo?.trim()).filter(Boolean))] as string[], [items])
  const itemsCero = items.filter(i => (i.valor_unitario || 0) <= 0).length

  const grupos = useMemo(() => {
    const sinGrupo = `Sin ${AGRUPADOR_SINGULAR[agrupador].toLowerCase()}`
    const m = new Map<string, { it: ItemCotizacion; idx: number }[]>()
    items.forEach((it, idx) => {
      const cap = it.capitulo?.trim() || sinGrupo
      if (!m.has(cap)) m.set(cap, [])
      m.get(cap)!.push({ it, idx })
    })
    return [...m.entries()]
  }, [items, agrupador])

  const lpuFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return lpuItems.filter(i => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q)).slice(0, 10)
  }, [busqueda, lpuItems])

  // Buscador dual (1.4B.c): también busca en el catálogo NEG.
  const catFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return catItems.filter(i => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q)).slice(0, 8)
  }, [busqueda, catItems])

  // 1.4B.b — resumen del análisis económico (réplica de la tabla paralela de
  // DC-FT-CT-24). Solo ítems CON costo; los que no lo tienen se excluyen y se
  // advierten (evita utilidades infladas tratando costo ausente como $0).
  const resumenEconomico = useMemo(() => {
    const conCosto = items.filter(it => it.costo_directo !== undefined)
    const todoCosto = conCosto.reduce((s, it) => s + (it.costo_directo ?? 0) * (it.cantidad || 0), 0)
    const venta = conCosto.reduce((s, it) => s + (it.valor_total || 0), 0)
    const utilidad = venta - todoCosto
    return {
      todoCosto, utilidad,
      pctUtilidad: venta > 0 ? (utilidad / venta) * 100 : null,
      sinCosto: items.length - conCosto.length,
    }
  }, [items])

  // Columnas de la tabla de ítems: base + 3 internas cuando el análisis está activo.
  const nCols = (editable ? 7 : 6) + (analisis ? 3 : 0)

  if (loading) return <div className="max-w-5xl mx-auto p-8 text-sm text-gray-400">Cargando…</div>
  if (noEncontrada || !cotizacion) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <p className="text-gray-500">La cotización no existe o fue eliminada.</p>
        <Link to="/sigp/cotizaciones" className="text-brand-700 text-sm hover:underline mt-2 inline-block">← Volver a cotizaciones</Link>
      </div>
    )
  }

  const setItem = (i: number, patch: Partial<ItemCotizacion>) => setItems(prev => prev.map((it, j) => {
    if (j !== i) return it
    const m = { ...it, ...patch }
    // Goal-seek del análisis económico (1.4B.b):
    // - teclear margen válido → recalcula el precio desde el costo
    // - teclear precio o costo → re-deriva el margen mostrado
    // - limpiar el costo → el margen pierde su base y se limpia
    if ('margen' in patch && m.margen !== undefined && m.costo_directo !== undefined) {
      const p = precioDesdeCosto(m.costo_directo, m.margen)
      if (p !== null) m.valor_unitario = Math.round(p)
    } else if (('valor_unitario' in patch || 'costo_directo' in patch) && !('margen' in patch)) {
      if (m.costo_directo === undefined) {
        delete m.margen
      } else {
        const mg = margenDesdePrecio(m.costo_directo, m.valor_unitario)
        if (mg !== null) m.margen = Math.round(mg * 10) / 10
      }
    }
    m.valor_total = valorTotalItem(m.valor_unitario, m.cantidad)
    return m
  }))
  const quitarItem = (i: number) => setItems(prev => prev.filter((_, j) => j !== i))

  // ── APU (1.4B.b) ──
  const aplicarApu = (i: number, r: { apu: APU; costo_directo: number; margen: number; valor_unitario: number }) =>
    setItem(i, { apu: r.apu, costo_directo: r.costo_directo, margen: r.margen, valor_unitario: r.valor_unitario, origen: 'apu' })

  const quitarApu = (i: number) => setItems(prev => prev.map((it, j) => {
    if (j !== i) return it
    const { apu: _apu, ...resto } = it
    return { ...resto, origen: 'manual' as const }
  }))

  const agregarLpu = (li: ItemLPU) => setItems(prev => [...prev, {
    origen: 'lpu', codigo: li.codigo, descripcion: li.descripcion, unidad: li.unidad,
    valor_unitario: li.valor_unitario, cantidad: 1, valor_total: valorTotalItem(li.valor_unitario, 1),
    ...(li.capitulo ? { capitulo: li.capitulo } : {}),
    ...(lpuVigenteId ? { lpu_id: lpuVigenteId } : {}), lpu_item_id: li.id,
  }])

  /** Agregar del catálogo NEG: snapshot completo + catalogo_id (trazabilidad). */
  const agregarCatalogo = (c: CatalogoItem) => setItems(prev => [...prev, {
    origen: c.apu ? 'apu' as const : 'manual' as const,
    codigo: c.codigo, descripcion: c.descripcion, unidad: c.unidad,
    valor_unitario: c.valor_unitario, cantidad: 1, valor_total: valorTotalItem(c.valor_unitario, 1),
    ...(c.costo_directo !== undefined ? { costo_directo: c.costo_directo } : {}),
    ...(c.margen !== undefined ? { margen: c.margen } : {}),
    ...(c.apu ? { apu: c.apu } : {}),
    catalogo_id: c.id,
  }])

  const agregarManual = () => setItems(prev => [...prev, { origen: 'manual', codigo: '', descripcion: '', unidad: '', valor_unitario: 0, cantidad: 1, valor_total: 0 }])

  const prellenarVisita = () => setItems(prev => [...prev, ...visitaCant.map(c => ({
    origen: 'manual' as const, codigo: '', descripcion: c.descripcion, unidad: c.unidad,
    valor_unitario: 0, cantidad: c.cantidad, valor_total: 0,
  }))])

  /** Persiste un array de ítems concreto (validaciones incluidas). */
  const persistir = async (its: ItemCotizacion[], silencioso: boolean): Promise<boolean> => {
    const margenesInvalidos = its.filter(it => it.margen !== undefined && (it.margen < 0 || it.margen >= 100)).length
    if (margenesInvalidos > 0) {
      toast(`${margenesInvalidos} ítem(s) con margen fuera de [0, 100). Corrígelos antes de guardar.`, 'error')
      return false
    }
    const ceros = its.filter(i => (i.valor_unitario || 0) <= 0).length
    if (ceros > 0 && !window.confirm(`Hay ${ceros} ítem(s) en $0 sin precio. ¿Guardar de todos modos?`)) return false
    setGuardando(true)
    try {
      const aiu = aiuConfig()
      const tot = calcularTotales(its, esquema, aiu, Number(ivaPct) || 0)
      // JSON round-trip: elimina claves undefined (Firestore las rechaza).
      const itemsLimpios = JSON.parse(JSON.stringify(its)) as ItemCotizacion[]
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(cotizacion.version_activa)), {
        items: itemsLimpios, esquema, aiu: aiu ?? deleteField(), iva_pct: Number(ivaPct) || 0, condiciones: { ...cond, validez_dias: Number(cond.validez_dias) || 0 }, totales: tot,
        agrupador,
      })
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
        total: tot.total, validez_dias: Number(cond.validez_dias) || 0,
        asunto: asunto.trim(), tipo_inversion: tipoInversion || deleteField(),
        fecha_actualizacion: Timestamp.now(),
      })
      if (!silencioso) { toast('Cotización guardada'); await reload() }
      return true
    } catch { toast('Error al guardar', 'error'); return false } finally { setGuardando(false) }
  }

  /** Guardar: asigna códigos INP locales de la versión y persiste. */
  const guardar = async (silencioso = false): Promise<boolean> => {
    const its = asignarCodigosINP(items)
    setItems(its)
    return persistir(its, silencioso)
  }

  /** Doc de catálogo desde un ítem (sin claves undefined; Timestamp intacto). */
  const datosCatalogo = (it: ItemCotizacion, codigo: string): Record<string, unknown> => ({
    codigo, descripcion: it.descripcion, unidad: it.unidad,
    valor_unitario: it.valor_unitario,
    ...(it.costo_directo !== undefined ? { costo_directo: it.costo_directo } : {}),
    ...(it.margen !== undefined ? { margen: it.margen } : {}),
    ...(it.apu ? { apu: it.apu } : {}),
    creado_por: user?.uid ?? '', fecha_creacion: Timestamp.now(), estado: 'activo',
  })

  /** Quema un CAT-NNNN y crea el doc de catálogo para UN ítem. */
  const crearEnCatalogo = async (it: ItemCotizacion): Promise<{ codigo: string; catalogo_id: string }> => {
    const codigo = await obtener('CAT')
    const ref = doc(collection(db, 'catalogo_items'))
    await setDoc(ref, datosCatalogo(it, codigo))
    return { codigo, catalogo_id: ref.id }
  }

  /**
   * Incorporación al catálogo NEG (1.4B.c): pregunta por cada ítem con código
   * INP-* sin catalogo_id. Solo un "sí" quema un CAT-NNNN (transaccional,
   * server-side). Idempotente: los ítems con catalogo_id no vuelven a preguntar.
   */
  const incorporarAlCatalogo = async (its: ItemCotizacion[]): Promise<{ items: ItemCotizacion[]; cambio: boolean }> => {
    const nuevos = [...its]
    let cambio = false
    for (let i = 0; i < nuevos.length; i++) {
      const it = nuevos[i]
      if (it.origen === 'lpu' || it.catalogo_id || !/^INP-\d+$/.test(it.codigo)) continue
      if (!window.confirm(`¿Incorporar "${it.descripcion}" al catálogo NEG?`)) continue
      try {
        const r = await crearEnCatalogo(it)
        nuevos[i] = { ...it, ...r }
        cambio = true
        toast(`"${it.descripcion.slice(0, 30)}" → catálogo NEG (${r.codigo})`)
      } catch {
        toast(`No se pudo incorporar "${it.descripcion.slice(0, 30)}" — queda con su código temporal`, 'error')
      }
    }
    return { items: nuevos, cambio }
  }

  /** Preparación del envío: INP + persistir + prompt de incorporación al catálogo. */
  const prepararEnvio = async (): Promise<boolean> => {
    const its = asignarCodigosINP(items)
    setItems(its)
    if (!(await persistir(its, true))) return false
    const res = await incorporarAlCatalogo(its)
    if (res.cambio) {
      setItems(res.items)
      return persistir(res.items, true)
    }
    return true
  }

  /**
   * Genera el PDF del envío (1.4B.e). Lee la versión RECIÉN PERSISTIDA de
   * Firestore (no el estado de React) — el PDF es fiel al snapshot congelado.
   * Sube a Storage y devuelve url + hash SHA-256. Si falla, el envío se aborta.
   */
  const generarPdfEnvio = async (fechaEmision: Date): Promise<{ url: string; hash: string } | null> => {
    try {
      const n = cotizacion.version_activa
      const vSnap = await getDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(n)))
      if (!vSnap.exists()) throw new Error('versión no encontrada')
      const v = vSnap.data() as VersionCotizacion

      // Firmante: perfil + celular (si el perfil lo tiene registrado)
      let celular: string | undefined
      try {
        const u = await getDoc(doc(db, 'users', user?.uid ?? ''))
        celular = (u.data()?.celular ?? u.data()?.telefono) || undefined
      } catch { /* opcional */ }

      // Contacto del cliente: primer contacto registrado en su ficha
      const c0 = cliente?.contactos?.[0]
      const contacto = c0 ? [c0.nombre, c0.email, c0.telefono].filter(Boolean).join(' · ') : undefined

      const assets = await cargarAssetsPdf()
      const bytes = await generarPdfCotizacion({
        consecutivo: cotizacion.consecutivo,
        versionNum: n,
        asunto: asunto.trim() || cotizacion.asunto || '',
        clienteNombre: cliente?.nombre ?? cotizacion.prospecto_nombre ?? '—',
        clienteNit: cliente?.nit,
        contacto,
        fechaEmision,
        validezDias: v.condiciones?.validez_dias ?? 30,
        esquema: v.esquema,
        aiu: v.aiu,
        ivaPct: v.iva_pct,
        items: v.items ?? [],
        totales: v.totales,
        agrupador: v.agrupador ?? 'capitulos',
        condiciones: v.condiciones,
        observaciones: v.condiciones?.observaciones,
        firmante: { nombre: user?.nombre ?? user?.email ?? '—', correo: user?.email ?? undefined, celular },
      }, assets)

      const hash = await sha256Hex(bytes)
      const archivo = sRef(storage, `cotizaciones/${cotizacion.id}/v${n}.pdf`)
      await uploadBytes(archivo, bytes, { contentType: 'application/pdf' })
      const url = await getDownloadURL(archivo)
      return { url, hash }
    } catch (e) {
      console.error('Error generando el PDF de la cotización:', e)
      toast('No se pudo generar el PDF — el envío no se completó. Reintenta.', 'error')
      return null
    }
  }

  /** Botón explícito "Guardar al catálogo" de un ítem individual. */
  const guardarAlCatalogoItem = async (idx: number) => {
    const its = asignarCodigosINP(items)
    setItems(its)
    const it = its[idx]
    if (it.origen === 'lpu' || it.catalogo_id) return
    if (!window.confirm(`¿Incorporar "${it.descripcion}" al catálogo NEG?`)) return
    try {
      const r = await crearEnCatalogo(it)
      const finales = its.map((x, j) => (j === idx ? { ...x, ...r } : x))
      setItems(finales)
      toast(`"${it.descripcion.slice(0, 30)}" → catálogo NEG (${r.codigo})`)
      // Persistir ya: el doc de catálogo existe; el vínculo no debe quedar solo en memoria.
      await persistir(finales, true)
      setCatItems(prev => [...prev, { id: r.catalogo_id, ...(datosCatalogo(it, r.codigo) as object) } as CatalogoItem])
    } catch {
      toast('No se pudo incorporar al catálogo', 'error')
    }
  }

  const est = estadoEfectivo(cotizacion)
  const origen = cliente?.nombre ?? cotizacion.prospecto_nombre ?? '—'

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24">
      <Link to="/sigp/cotizaciones" className="text-sm text-gray-500 hover:text-brand-700 inline-flex items-center gap-1">← Cotizaciones</Link>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800 font-mono">{cotizacion.consecutivo}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${ESTADO_COT_COLOR[est]}`}>{ESTADO_COT_LABEL[est]}</span>
        <span className="text-sm text-gray-400">v{cotizacion.version_activa}</span>
        <span className="text-sm text-gray-600">· {origen}{cotizacion.es_licitacion && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-semibold">LICITACIÓN</span>}</span>
        {cotizacion.tipo_inversion && !editable && (
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold ${TIPO_INVERSION_COLOR[cotizacion.tipo_inversion]}`}>
            {TIPO_INVERSION_LABEL[cotizacion.tipo_inversion]}
          </span>
        )}
        {version?.pdf_url && (
          <a href={version.pdf_url} target="_blank" rel="noreferrer" title={version.pdf_hash ? `SHA-256: ${version.pdf_hash.slice(0, 16)}…` : undefined}
            className="text-xs px-2.5 py-1 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium">
            📄 PDF v{cotizacion.version_activa}
          </a>
        )}
      </div>

      {/* Asunto (CM-FT-CT-19): editable solo en borrador */}
      {editable ? (
        <div className="flex items-center gap-2 max-w-xl">
          <label className="text-xs text-gray-500 flex-shrink-0">Asunto</label>
          <input value={asunto} onChange={e => setAsunto(e.target.value)}
            placeholder="Ej: Adecuaciones estación Ráquira"
            className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 ${asunto.trim() ? 'border-gray-300' : 'border-amber-300'}`} />
        </div>
      ) : (
        <p className="text-sm text-gray-700"><span className="text-xs text-gray-400 mr-2">Asunto</span>{cotizacion.asunto || '—'}</p>
      )}

      {/* Acciones de estado */}
      <CotizacionAcciones
        cotizacion={cotizacion}
        efectivo={est}
        puedeGestionar={puedeGestionar}
        guardarBorrador={prepararEnvio}
        generarPdf={generarPdfEnvio}
        reload={reload}
      />

      {!editable && (
        <div className="rounded-lg bg-gray-100 border border-gray-200 px-4 py-2 text-xs text-gray-600">
          Versión v{cotizacion.version_activa} en estado «{ESTADO_COT_LABEL[est]}» — solo lectura.
        </div>
      )}

      {cotizacion.motivo_rechazo && est === 'rechazada' && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-xs text-rose-700">
          <span className="font-semibold">Motivo del rechazo:</span> {cotizacion.motivo_rechazo}
        </div>
      )}

      {cotizacion.evidencia_aprobacion && est === 'aprobada' && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs text-emerald-800">
          <span className="font-semibold">Evidencia de aprobación:</span>{' '}
          <a href={cotizacion.evidencia_aprobacion.url} target="_blank" rel="noreferrer" className="underline hover:text-emerald-900">
            📎 {cotizacion.evidencia_aprobacion.nombre}
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Constructor de ítems */}
        <div className="lg:col-span-2 space-y-3">
          {editable && (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <button onClick={agregarManual} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">+ Ítem manual</button>
                {visitaCant.length > 0 && (
                  <button onClick={prellenarVisita} className="text-xs px-3 py-1.5 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium">
                    Prellenar desde {visitaCons} ({visitaCant.length})
                  </button>
                )}
              </div>
              {/* Buscador dual: LPU del cliente + catálogo NEG (1.4B.c) */}
              {(lpuItems.length > 0 || catItems.length > 0) ? (
                <div className="relative">
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder={'Buscar en ' + [
                      lpuItems.length > 0 ? `LPU ${lpuNombre ?? 'vigente'}` : null,
                      catItems.length > 0 ? 'catálogo NEG' : null,
                    ].filter(Boolean).join(' y ') + ' por código o descripción…'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                  {(lpuFiltrado.length > 0 || catFiltrado.length > 0) && (
                    <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {lpuFiltrado.map(li => (
                        <button key={`lpu-${li.id}`} onClick={() => { agregarLpu(li); setBusqueda('') }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 border-b border-gray-50">
                          <span className="flex justify-between gap-2 items-center">
                            <span>
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 mr-1.5">LPU</span>
                              <span className="font-mono text-gray-400">{li.codigo || '—'}</span>
                            </span>
                            <span className="text-gray-500 flex-shrink-0">{li.unidad ? `${li.unidad} · ` : ''}{fMoneda(li.valor_unitario)}</span>
                          </span>
                          <span className="block text-gray-800 mt-0.5 whitespace-normal">{li.descripcion}</span>
                        </button>
                      ))}
                      {catFiltrado.map(c => (
                        <button key={`cat-${c.id}`} onClick={() => { agregarCatalogo(c); setBusqueda('') }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 border-b border-gray-50">
                          <span className="flex justify-between gap-2 items-center">
                            <span>
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-600 text-white mr-1.5">NEG</span>
                              <span className="font-mono text-gray-400">{c.codigo}</span>
                              {c.apu && <span className="ml-1 text-[10px] text-brand-700 font-semibold">APU</span>}
                            </span>
                            <span className="text-gray-500 flex-shrink-0">{c.unidad ? `${c.unidad} · ` : ''}{fMoneda(c.valor_unitario)}</span>
                          </span>
                          <span className="block text-gray-800 mt-0.5 whitespace-normal">{c.descripcion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : cotizacion.cliente_id ? (
                <p className="text-xs text-gray-400">El cliente no tiene LPU vigente y el catálogo NEG está vacío; usa ítems manuales.</p>
              ) : (
                <p className="text-xs text-gray-400">Cotización sin cliente (prospecto) y catálogo NEG vacío: solo ítems manuales.</p>
              )}
            </div>
          )}

          {/* Barra: agrupador + tipo de inversión (editable) · toggle análisis */}
          {(puedeGestionar || editable) && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {editable && <>
                  <label className="text-xs text-gray-500">Agrupar por</label>
                  <select value={agrupador} onChange={e => setAgrupador(e.target.value as AgrupadorItems)}
                    className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white">
                    {AGRUPADORES.map(a => <option key={a} value={a}>{AGRUPADOR_LABEL[a]}</option>)}
                  </select>
                  <label className="text-xs text-gray-500 ml-2">Inversión</label>
                  <select value={tipoInversion} onChange={e => setTipoInversion(e.target.value as TipoInversion | '')}
                    className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white">
                    <option value="">— Sin clasificar —</option>
                    {TIPOS_INVERSION.map(t => <option key={t} value={t}>{TIPO_INVERSION_LABEL[t]}</option>)}
                  </select>
                </>}
              </div>
              {puedeGestionar && <button onClick={() => setAnalisis(a => !a)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                  analisis ? 'border-gray-400 bg-gray-100 text-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}>
                📊 Análisis económico {analisis ? '· interno — no sale al cliente' : ''}
              </button>}
            </div>
          )}

          {/* Lista de ítems */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <datalist id="capitulos">{capitulos.map(c => <option key={c} value={c} />)}</datalist>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-2 py-2 font-semibold">Código</th>
                  <th className="px-2 py-2 font-semibold">Descripción</th>
                  <th className="px-2 py-2 font-semibold">Und</th>
                  <th className="px-2 py-2 font-semibold text-right">V. Unit</th>
                  <th className="px-2 py-2 font-semibold text-right">Cant</th>
                  <th className="px-2 py-2 font-semibold text-right">V. Total</th>
                  {analisis && <>
                    <th className="px-2 py-2 font-semibold text-right bg-gray-100" title="Interno — no sale al cliente">Costo unit</th>
                    <th className="px-2 py-2 font-semibold text-right bg-gray-100" title="Interno — % de utilidad sobre el precio">Margen %</th>
                    <th className="px-2 py-2 font-semibold text-right bg-gray-100" title="Interno — % sobre costos directos">Peso %</th>
                  </>}
                  {editable && <th className="px-2 py-2"></th>}
                </tr>
              </thead>
              {items.length === 0 && <tbody><tr><td colSpan={nCols} className="px-2 py-6 text-center text-gray-400">Sin ítems. Agrega desde el LPU o manuales.</td></tr></tbody>}
              {grupos.map(([cap, filas]) => {
                  const sub = filas.reduce((s, f) => s + (f.it.valor_total || 0), 0)
                  return (
                    <tbody key={cap}>
                      <tr className="bg-gray-50"><td colSpan={nCols} className="px-2 py-1.5 text-[11px] font-semibold text-gray-600 uppercase">{cap} <span className="text-gray-400 normal-case">· {fMoneda(sub)}</span></td></tr>
                      {filas.map(({ it, idx }) => {
                        const cero = (it.valor_unitario || 0) <= 0
                        const exp = !!expandidos[idx]
                        const toggleExp = () => setExpandidos(p => ({ ...p, [idx]: !p[idx] }))
                        return (
                          <Fragment key={idx}>
                          <tr className={`${exp ? '' : 'border-b border-gray-50'} ${cero ? 'bg-amber-50' : ''}`}>
                            <td className="px-2 py-1 whitespace-nowrap">{editable ? <input value={it.codigo} onChange={e => setItem(idx, { codigo: e.target.value })} className="w-16 px-1 py-1 border border-gray-200 rounded" /> : <>
                              <span className="font-mono text-gray-500">{it.codigo || '—'}</span>
                              {it.apu && <button onClick={() => setApuIdx(idx)} title="Ver desglose APU (solo lectura)" className="ml-1 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-brand-600 text-white">APU</button>}
                            </>}</td>
                            <td className="px-2 py-1 max-w-md">
                              <div className="flex items-start gap-1">
                                {editable
                                  ? <input value={it.descripcion} onChange={e => setItem(idx, { descripcion: e.target.value })} className="w-full min-w-[10rem] px-1 py-1 border border-gray-200 rounded" />
                                  : <span onClick={toggleExp} title="Clic para expandir / contraer" className="block w-full text-gray-800 cursor-pointer truncate">{it.descripcion}</span>}
                                <button onClick={toggleExp} title={exp ? 'Contraer' : 'Ver descripción completa'} className="text-gray-400 hover:text-gray-600 mt-1 flex-shrink-0">{exp ? '▴' : '▾'}</button>
                              </div>
                              {editable && <input list="capitulos" value={it.capitulo ?? ''} onChange={e => setItem(idx, { capitulo: e.target.value })} placeholder={AGRUPADOR_SINGULAR[agrupador].toLowerCase()} className="mt-1 w-full px-1 py-0.5 border border-gray-100 rounded text-[11px] text-gray-500" />}</td>
                            <td className="px-2 py-1">
                              {/* Unidad: heredada del LPU = solo lectura. Editable solo en ítems
                                  manuales — o si la LPU importada no traía unidad (dato legacy). */}
                              {editable && (it.origen !== 'lpu' || !it.unidad)
                                ? <input value={it.unidad} onChange={e => setItem(idx, { unidad: e.target.value })} className="w-12 px-1 py-1 border border-gray-200 rounded" />
                                : <span title={it.origen === 'lpu' ? 'Heredada del LPU (solo lectura)' : undefined}>{it.unidad || '—'}</span>}
                            </td>
                            <td className="px-2 py-1 text-right">{editable ? <input inputMode="numeric" value={it.valor_unitario ? '$ ' + it.valor_unitario.toLocaleString('es-CO') : ''}
                                onChange={e => {
                                  // es-CO: punto = miles (se descarta), coma = decimal. Preserva
                                  // precios LPU con decimales reales (ej. 16031,954) sin corromperlos.
                                  const crudo = e.target.value.replace(/[^\d,]/g, '').replace(',', '.')
                                  setItem(idx, { valor_unitario: Number(crudo) || 0 })
                                }}
                                placeholder="$ 0" className={`w-28 px-1 py-1 border rounded text-right ${cero ? 'border-amber-300' : 'border-gray-200'}`} /> : fMoneda(it.valor_unitario)}</td>
                            <td className="px-2 py-1 text-right">{editable ? <input type="number" value={it.cantidad || ''} onChange={e => setItem(idx, { cantidad: Number(e.target.value) })} className="w-16 px-1 py-1 border border-gray-200 rounded text-right" /> : it.cantidad}</td>
                            <td className="px-2 py-1 text-right font-mono text-gray-700">{fMoneda(it.valor_total)}</td>
                            {analisis && <>
                              {/* Columnas internas (análisis económico) — jamás salen al PDF */}
                              <td className="px-2 py-1 text-right bg-gray-100/80">
                                {editable && it.origen !== 'apu'
                                  ? <input inputMode="numeric" value={it.costo_directo !== undefined ? '$ ' + it.costo_directo.toLocaleString('es-CO') : ''}
                                      onChange={e => {
                                        const crudo = e.target.value.replace(/[^\d,]/g, '').replace(',', '.')
                                        setItem(idx, { costo_directo: crudo === '' ? undefined : Number(crudo) || 0 })
                                      }}
                                      placeholder="$ —" className="w-28 px-1 py-1 border border-gray-300 rounded text-right bg-white" />
                                  : <span className="font-mono text-gray-600" title={it.origen === 'apu' ? 'Del desglose APU — edítalo en el modal' : undefined}>
                                      {it.costo_directo !== undefined ? '$ ' + it.costo_directo.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : '—'}
                                    </span>}
                              </td>
                              <td className="px-2 py-1 text-right bg-gray-100/80">
                                {editable && it.costo_directo !== undefined
                                  ? <input type="number" step="0.1" value={it.margen ?? ''}
                                      onChange={e => setItem(idx, { margen: e.target.value === '' ? undefined : Number(e.target.value) })}
                                      className={`w-16 px-1 py-1 border rounded text-right bg-white ${it.margen !== undefined && (it.margen < 0 || it.margen >= 100) ? 'border-red-400' : 'border-gray-300'}`} />
                                  : <span className={`font-mono ${it.margen !== undefined && it.margen < 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                      {it.margen !== undefined ? `${it.margen.toLocaleString('es-CO', { maximumFractionDigits: 1 })}${it.margen < 0 ? ' ⚠' : ''}` : '—'}
                                    </span>}
                              </td>
                              <td className="px-2 py-1 text-right bg-gray-100/80 font-mono text-gray-600">
                                {totales.costos_directos > 0 ? ((it.valor_total / totales.costos_directos) * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 }) : '—'}
                              </td>
                            </>}
                            {editable && <td className="px-2 py-1 text-right whitespace-nowrap">
                              {it.origen !== 'lpu' && (
                                <button onClick={() => setApuIdx(idx)} title={it.apu ? 'Ver / editar desglose APU' : 'Construir APU'}
                                  className={`mr-1 text-[10px] px-1.5 py-0.5 rounded font-semibold ${it.apu ? 'bg-brand-600 text-white' : 'border border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                                  APU
                                </button>
                              )}
                              {it.origen !== 'lpu' && !it.catalogo_id && (
                                <button onClick={() => guardarAlCatalogoItem(idx)} title="Guardar al catálogo NEG"
                                  className="mr-1 text-[11px] px-1 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">📚</button>
                              )}
                              <button onClick={() => quitarItem(idx)} className="text-red-400 hover:text-red-600">✕</button>
                            </td>}
                          </tr>
                          {/* Descripción expandida: fila propia a todo el ancho de la tabla */}
                          {exp && (
                            <tr className={`border-b border-gray-50 ${cero ? 'bg-amber-50' : ''}`}>
                              <td colSpan={nCols} className="px-2 pb-2 pt-0">
                                {editable
                                  ? <textarea value={it.descripcion} onChange={e => setItem(idx, { descripcion: e.target.value })} rows={3} autoFocus
                                      className="w-full px-2 py-1.5 border border-gray-200 rounded resize-y text-xs focus:outline-none focus:ring-2 focus:ring-brand-300" />
                                  : <p className="w-full text-gray-700 whitespace-pre-wrap bg-gray-50 rounded px-2 py-1.5">{it.descripcion}</p>}
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  )
                })}
            </table>
          </div>
          {editable && itemsCero > 0 && <p className="text-xs text-amber-700">⚠ {itemsCero} ítem(s) en $0 (resaltados). Se puede guardar, pero completa los precios antes de enviar.</p>}
        </div>

        {/* Totales */}
        <div className="space-y-3">
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 lg:sticky lg:top-4">
            <h2 className="font-semibold text-gray-800 text-sm">Totales</h2>
            {editable && (
              <div className="space-y-2">
                <select value={esquema} onChange={e => setEsquema(e.target.value as EsquemaTributario)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {ESQUEMAS.map(e => <option key={e} value={e}>{ESQUEMA_LABEL[e]}</option>)}
                </select>
                {esquema === 'aiu' && (
                  <div className="grid grid-cols-3 gap-1">
                    <input type="number" value={aiuAdmin} onChange={e => setAiuAdmin(e.target.value)} placeholder="A%" className="px-1 py-1 border border-gray-200 rounded text-xs text-center" />
                    <input type="number" value={aiuImprev} onChange={e => setAiuImprev(e.target.value)} placeholder="I%" className="px-1 py-1 border border-gray-200 rounded text-xs text-center" />
                    <input type="number" value={aiuUtil} onChange={e => setAiuUtil(e.target.value)} placeholder="U%" className="px-1 py-1 border border-gray-200 rounded text-xs text-center" />
                  </div>
                )}
                <div className="flex items-center gap-2"><span className="text-xs text-gray-500 flex-1">IVA %</span><input type="number" value={ivaPct} onChange={e => setIvaPct(e.target.value)} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-right" /></div>
              </div>
            )}
            <div className="text-sm space-y-1 pt-2 border-t border-gray-100">
              <Fila k="Costos directos" v={fMoneda(totales.costos_directos)} />
              {esquema === 'aiu' && <>
                <Fila k={`Admin (${aiuAdmin}%)`} v={fMoneda(totales.admin ?? 0)} />
                <Fila k={`Imprevistos (${aiuImprev}%)`} v={fMoneda(totales.imprevistos ?? 0)} />
                <Fila k={`Utilidad (${aiuUtil}%)`} v={fMoneda(totales.utilidad ?? 0)} />
              </>}
              <Fila k={`IVA (${ivaPct}%${esquema === 'aiu' ? ' s/U' : ''})`} v={fMoneda(totales.iva)} />
              <div className="flex justify-between pt-2 border-t border-gray-100 font-bold text-gray-900"><span>Total</span><span>{fMoneda(totales.total)}</span></div>
            </div>
          </div>

          {/* Resumen del análisis económico (interno — réplica de DC-FT-CT-24) */}
          {analisis && (
            <div className="bg-gray-100 rounded-lg border border-gray-300 p-4 space-y-2">
              <h2 className="font-semibold text-gray-800 text-sm flex items-center justify-between">
                Análisis económico
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">interno</span>
              </h2>
              <div className="text-sm space-y-1">
                <Fila k="Todo Costo" v={fMoneda(resumenEconomico.todoCosto)} />
                <Fila k="Utilidad $" v={fMoneda(resumenEconomico.utilidad)} />
                <div className={`flex justify-between font-semibold ${resumenEconomico.utilidad < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                  <span>% Utilidad</span>
                  <span className="font-mono">
                    {resumenEconomico.pctUtilidad !== null
                      ? resumenEconomico.pctUtilidad.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' %'
                      : '—'}
                  </span>
                </div>
              </div>
              {resumenEconomico.sinCosto > 0 && (
                <p className="text-xs text-amber-700 pt-1 border-t border-gray-200">
                  ⚠ {resumenEconomico.sinCosto} ítem(s) sin costo — excluidos del análisis.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Condiciones */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800 text-sm">Condiciones comerciales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Campo label="Validez (días)" tipo="number" v={String(cond.validez_dias)} on={v => setCond(c => ({ ...c, validez_dias: Number(v) }))} editable={editable} />
          <Campo label="Forma de pago" v={cond.forma_pago} on={v => setCond(c => ({ ...c, forma_pago: v }))} editable={editable} />
          <Campo label="Tiempo de ejecución" v={cond.tiempo_ejecucion} on={v => setCond(c => ({ ...c, tiempo_ejecucion: v }))} editable={editable} />
          <Campo label="Garantía" v={cond.garantia} on={v => setCond(c => ({ ...c, garantia: v }))} editable={editable} />
        </div>
        <div>
          <label className="text-xs text-gray-500">Observaciones / exclusiones</label>
          {editable
            ? <textarea value={cond.observaciones ?? ''} onChange={e => setCond(c => ({ ...c, observaciones: e.target.value }))} rows={2} className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            : <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{cond.observaciones || '—'}</p>}
        </div>
      </div>

      {/* Comparación de versiones (solo si hay >1) */}
      <VersionesCotizacion cotizacionId={cotizacion.id} versionActiva={cotizacion.version_activa} />

      {/* Timeline del historial */}
      {cotizacion.historial?.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">Historial</h2>
          <ol className="space-y-2">
            {[...cotizacion.historial].reverse().map((h, i) => (
              <li key={i} className="flex items-start gap-3 text-xs">
                <span className="mt-1 h-2 w-2 rounded-full bg-brand-600 flex-shrink-0" />
                <div>
                  <span className="text-gray-800 font-medium">
                    {h.de ? `${ESTADO_COT_LABEL[h.de]} → ` : ''}{ESTADO_COT_LABEL[h.a]}
                  </span>
                  {h.version !== undefined && <span className="ml-1 text-gray-400">(v{h.version})</span>}
                  <span className="ml-2 text-gray-400">{fFecha(h.fecha)}</span>
                  {h.motivo && <p className="text-gray-500 mt-0.5">{h.motivo}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Modal APU (editable en borrador; solo lectura en versiones enviadas) */}
      {apuIdx !== null && items[apuIdx] && (
        <ApuModal
          isOpen
          onClose={() => setApuIdx(null)}
          editable={editable}
          codigoItem={items[apuIdx].codigo}
          descripcionItem={items[apuIdx].descripcion}
          apu={items[apuIdx].apu}
          margenActual={items[apuIdx].margen}
          onAplicar={r => aplicarApu(apuIdx, r)}
          onQuitar={() => quitarApu(apuIdx)}
        />
      )}

      {/* Barra guardar */}
      {editable && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-end gap-3">
            <span className="text-sm text-gray-500 mr-auto">Total: <span className="font-bold text-gray-800">{fMoneda(totales.total)}</span></span>
            <button onClick={() => guardar()} disabled={guardando} className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Fila({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between text-gray-600"><span>{k}</span><span className="font-mono text-gray-800">{v}</span></div>
}

function Campo({ label, v, on, editable, tipo }: { label: string; v: string; on: (v: string) => void; editable?: boolean; tipo?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      {editable
        ? <input type={tipo} value={v} onChange={e => on(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        : <p className="text-gray-800">{v || '—'}</p>}
    </div>
  )
}
