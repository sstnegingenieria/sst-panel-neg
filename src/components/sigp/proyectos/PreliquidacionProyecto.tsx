// Bloque "Preliquidación" de la ficha de Proyecto (F2.1.c).
//
// SEGREGACIÓN DE FUNCIONES: el área de proyectos DEFINE (margen tipo APU +
// % anticipo); gerencia_administrativa APRUEBA y registra el ANTICIPO girado.
// El valor de venta viene del snapshot (solo lectura, con el desglose del
// esquema aprobado); la palanca es el MARGEN % (misma convención del APU del
// cotizador) que deriva el valor del contratista — bidireccional. Derivados
// con precisión completa; el render recorta a 2 decimales.
import { Fragment, useState, useEffect, useMemo } from 'react'
import { doc, updateDoc, arrayUnion, getDoc, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import InputExpresion from '../cotizaciones/InputExpresion'
import { fmtMoney, fmtNum } from '../../../utils/sigp/formato'
import {
  ANTICIPO_PCT_DEFAULT, utilidadDe, margenPctDe, anticipoValorDe, saldoValorDe,
  cambiosPreliquidacion, correccionRevierteAprobacion, saldoRealDe,
  contratistaDesdeMargen, claveItemAlcance,
  puedeCorregirPreliquidacionEn, correccionEsAjusteEnEjecucion,
  ESTADO_PRY_LABEL,
} from '../../../types/sigp/proyecto'
import { aprobacionRequiereSalvedad } from '../../../types/sigp/permisos'
import { modoAgrupacionDe, actividadesDe, subtotalesPorGrupo, GRUPO_OTROS_ID } from '../../../types/sigp/cotizacion'
import type { VersionCotizacion, ItemCotizacion } from '../../../types/sigp/cotizacion'
import type { Proyecto } from '../../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean       // área de proyectos — define
  puedeAprobar: boolean         // gerencia_administrativa — aprueba y gira
  reload: () => Promise<void>
}

export default function PreliquidacionProyecto({ proyecto, puedeGestionar, puedeAprobar, reload }: Props) {
  const { user } = useAuth()
  const pre = proyecto.preliquidacion
  // Palanca de margen (convención APU) ↔ valor contratista (bidireccional)
  const [margen, setMargen] = useState('')
  const [valorContratista, setValorContratista] = useState<number | undefined>(undefined)
  const [pct, setPct] = useState(String(ANTICIPO_PCT_DEFAULT))
  const [aplicando, setAplicando] = useState(false)
  // anticipo girado
  const [antFecha, setAntFecha] = useState('')
  const [antValor, setAntValor] = useState<number | undefined>(undefined)
  const [antEvidencia, setAntEvidencia] = useState<File | null>(null)
  const [antForm, setAntForm] = useState(false)
  // respaldo de aprobación: salvedad obligatoria (aprobador ≠ titular)
  const [salvedadForm, setSalvedadForm] = useState(false)
  const [salvedad, setSalvedad] = useState('')
  // Bloque 4 — corrección con trazabilidad (ISO 7.5)
  const [corrForm, setCorrForm] = useState(false)
  const [corrMargen, setCorrMargen] = useState('')
  const [corrValor, setCorrValor] = useState<number | undefined>(undefined)
  const [corrPct, setCorrPct] = useState('')
  const [corrMotivo, setCorrMotivo] = useState('')
  // versión aprobada (desglose del valor de venta + alcance con valores)
  const [version, setVersion] = useState<VersionCotizacion | null>(null)
  const [verAlcance, setVerAlcance] = useState(false)
  // observaciones por ítem del alcance (salen en el documento del contratista)
  const [obs, setObs] = useState<Record<string, string>>(() => proyecto.preliquidacion?.observaciones ?? {})

  const valorVenta = proyecto.snapshot.valor_venta
  const pctNum = Number(pct.replace(',', '.'))
  const pctValido = Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100
  const margenNum = Number(margen.replace(',', '.'))
  const margenValido = margen.trim() !== '' && Number.isFinite(margenNum) && margenNum >= 0 && margenNum < 100
  const puedeDefinir = puedeGestionar && proyecto.estado === 'permisos_en_tramite' && !pre
  const preview = valorContratista !== undefined && pctValido
    ? { valor_venta: valorVenta, valor_contratista: valorContratista, anticipo_pct: pctNum }
    : null
  const bloqueActivo = puedeDefinir || !!pre

  // La versión aprobada alimenta el desglose del esquema y el alcance interno.
  // Los proyectos PREVENTIVOS (F2.2) no tienen cotización: su precio es de
  // matriz y el alcance vive en el snapshot.
  useEffect(() => {
    if (!bloqueActivo || version || !proyecto.cotizacion_id) return
    getDoc(doc(db, 'cotizaciones', proyecto.cotizacion_id, 'versiones', String(proyecto.cotizacion_version ?? 1)))
      .then(s => { if (s.exists()) setVersion(s.data() as VersionCotizacion) })
      .catch(() => {})
  }, [bloqueActivo, version, proyecto.cotizacion_id, proyecto.cotizacion_version])

  // margen → contratista (palanca APU)
  const cambiarMargen = (texto: string) => {
    setMargen(texto)
    const m = Number(texto.replace(',', '.'))
    if (texto.trim() !== '' && Number.isFinite(m) && m >= 0 && m < 100)
      setValorContratista(contratistaDesdeMargen(valorVenta, m))
  }
  // contratista → margen (bidireccional, como el goal-seek del APU)
  const cambiarContratista = (v: number) => {
    setValorContratista(v)
    setMargen(fmtNum(margenPctDe({ valor_venta: valorVenta, valor_contratista: v })))
  }

  // Alcance aprobado agrupado (misma fuente que el PDF), CON valores — interno.
  // Cada ítem lleva su índice absoluto en el snapshot → clave estable de obs.
  const alcance = useMemo(() => {
    if (!version) return null
    const modo = modoAgrupacionDe(version)
    const actividades = actividadesDe(version)
    const grupos = subtotalesPorGrupo(version.items, modo, actividades)
    const buckets = new Map<string, { nombre: string; subtotal: number; items: { it: ItemCotizacion; clave: string }[] }>(
      grupos.map(g => [g.grupo_id, { nombre: g.grupo_nombre, subtotal: g.subtotal, items: [] }]))
    version.items.forEach((it, idx) => {
      const id = modo === 'actividad'
        ? (it.actividad_id && buckets.has(it.actividad_id) ? it.actividad_id : GRUPO_OTROS_ID)
        : (it.capitulo?.trim() || GRUPO_OTROS_ID)
      buckets.get(id)?.items.push({ it, clave: claveItemAlcance(it, idx) })
    })
    return [...buckets.values()].filter(g => g.items.length > 0)
  }, [version])

  /** Observaciones limpias (sin vacíos) para persistir. */
  const obsLimpias = (fuente: Record<string, string>) =>
    Object.fromEntries(Object.entries(fuente).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))

  /** Persiste al salir del campo (si la preliquidación ya existe; antes de
   *  definir, viajan dentro del payload de "Definir"). */
  const guardarObs = async () => {
    if (!pre) return
    try {
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        'preliquidacion.observaciones': obsLimpias(obs),
        fecha_actualizacion: Timestamp.now(),
      })
    } catch { toast('No se pudieron guardar las observaciones', 'error') }
  }

  const entrada = (de: string, a: string, motivo: string) => ({
    de, a, por: user?.uid ?? '', fecha: Timestamp.now(), motivo,
  })

  const definir = async () => {
    if (!preview || valorContratista === undefined) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      const observaciones = obsLimpias(obs)
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        preliquidacion: {
          valor_venta: valorVenta,
          valor_contratista: valorContratista,
          anticipo_pct: pctNum,
          ...(Object.keys(observaciones).length ? { observaciones } : {}),
          definida_por: user?.uid ?? '',
          fecha_definicion: ahora,
        },
        estado: 'preliquidacion_definida',
        fecha_actualizacion: ahora,
        historial: arrayUnion(entrada('permisos_en_tramite', 'preliquidacion_definida',
          `Preliquidación definida — contratista ${fmtMoney(valorContratista)}, anticipo ${fmtNum(pctNum)}%`)),
      })
      toast('Preliquidación definida — pendiente de aprobación de Gerencia Administrativa')
      await reload()
    } catch { toast('Error al definir la preliquidación', 'error') } finally { setAplicando(false) }
  }

  // Respaldo controlado (23-jul): si aprueba alguien distinto de la titular
  // (gerencia_administrativa), la SALVEDAD es obligatoria — aplica también a
  // la re-aprobación tras corrección (Hotfix B). La regla la exige igual.
  const esRespaldo = aprobacionRequiereSalvedad(user?.rol)

  const aprobar = async () => {
    if (!pre) return
    if (esRespaldo) { setSalvedad(''); setSalvedadForm(true); return }
    await ejecutarAprobacion()
  }

  const ejecutarAprobacion = async (salvedadTexto?: string) => {
    if (!pre) return
    // Re-aprobación tras una corrección con anticipo YA girado: el giro es un
    // hecho consumado — el proyecto vuelve directo a anticipo_girado y el
    // saldo se calcula contra el valor girado (saldoRealDe).
    const conGiro = !!pre.anticipo
    const destino = conGiro ? 'anticipo_girado' : 'preliquidacion_aprobada'
    const resumen = conGiro
      ? `Contratista ${fmtMoney(pre.valor_contratista)} · anticipo YA girado ${fmtMoney(pre.anticipo!.valor)} · saldo ${fmtMoney(saldoRealDe(pre))}.`
      : `Contratista ${fmtMoney(pre.valor_contratista)} · anticipo ${fmtNum(pre.anticipo_pct)}% (${fmtMoney(anticipoValorDe(pre))}).`
    if (!window.confirm(`¿Aprobar la preliquidación? ${resumen}` +
      (salvedadTexto ? `\n\nAPROBACIÓN DE RESPALDO — salvedad: ${salvedadTexto}` : ''))) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      // La titular aprueba SIN salvedad y limpia cualquier salvedad previa;
      // el respaldo la escribe (obligatoria — la regla la exige).
      const { salvedad: _salvedadVieja, ...base } = pre
      const quien = salvedadTexto
        ? `RESPALDO (${user?.rol ?? '?'}) — SALVEDAD: ${salvedadTexto}`
        : 'Gerencia Administrativa'
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        preliquidacion: {
          ...base, aprobada_por: user?.uid ?? '', fecha_aprobacion: ahora,
          ...(salvedadTexto ? { salvedad: salvedadTexto } : {}),
        },
        estado: destino,
        fecha_actualizacion: ahora,
        historial: arrayUnion(entrada(proyecto.estado, destino,
          conGiro
            ? `Preliquidación re-aprobada por ${quien} — el anticipo girado (${fmtMoney(pre.anticipo!.valor)}) se mantiene; saldo ${fmtMoney(saldoRealDe(pre))}`
            : `Preliquidación aprobada por ${quien}`)),
      })
      toast('Preliquidación aprobada')
      setSalvedadForm(false)
      setSalvedad('')
      await reload()
    } catch { toast('Error al aprobar (verifica tu rol)', 'error') } finally { setAplicando(false) }
  }

  // ── Bloque 4 + Hotfix 23-jul — corrección con trazabilidad (ISO 7.5) ──
  // Proyectos define/corrige DESDE definida HASTA el handoff (el caso real:
  // el error se descubre al digitar el costo real, al cierre de la
  // ejecución). Aprobada/girado → revierte a definida; en ejecución o
  // después → el proyecto NO regresa: re-aprobación in situ. Nunca un
  // cambio silencioso.
  const puedeCorregir = puedeGestionar && !!pre && puedeCorregirPreliquidacionEn(proyecto.estado)

  const abrirCorreccion = () => {
    if (!pre) return
    setCorrValor(pre.valor_contratista)
    setCorrMargen(fmtNum(margenPctDe(pre)))
    setCorrPct(String(pre.anticipo_pct))
    setCorrMotivo('')
    setCorrForm(true)
  }
  const corrPctNum = Number(corrPct.replace(',', '.'))
  const corrPctValido = Number.isFinite(corrPctNum) && corrPctNum >= 0 && corrPctNum <= 100
  const corrCambios = pre && corrValor !== undefined && corrPctValido
    ? cambiosPreliquidacion(pre, { valor_contratista: corrValor, anticipo_pct: corrPctNum })
    : []
  const cambiarCorrMargen = (texto: string) => {
    setCorrMargen(texto)
    const m = Number(texto.replace(',', '.'))
    if (texto.trim() !== '' && Number.isFinite(m) && m >= 0 && m < 100)
      setCorrValor(contratistaDesdeMargen(valorVenta, m))
  }
  const cambiarCorrValor = (v: number) => {
    setCorrValor(v)
    setCorrMargen(fmtNum(margenPctDe({ valor_venta: valorVenta, valor_contratista: v })))
  }

  const ETIQUETA_CAMPO: Record<string, string> = {
    valor_contratista: 'valor contratista', anticipo_pct: '% de anticipo',
  }
  const corregir = async () => {
    if (!pre || corrValor === undefined || !corrPctValido || !corrMotivo.trim() || corrCambios.length === 0) return
    const revierte = correccionRevierteAprobacion(proyecto.estado)   // aprobada/girado → vuelve a definida (Bloque 4)
    const ajuste = correccionEsAjusteEnEjecucion(proyecto.estado)    // en ejecución+ → SOLO traza + flag, sin frenar nada
    const detalle = corrCambios.map(c =>
      `${ETIQUETA_CAMPO[c.campo]}: ${c.campo === 'anticipo_pct' ? `${fmtNum(c.antes)}% → ${fmtNum(c.despues)}%` : `${fmtMoney(c.antes)} → ${fmtMoney(c.despues)}`}`).join(' · ')
    if (revierte && !window.confirm(
      `La preliquidación ya fue aprobada: corregirla la devuelve a "Definida" y EXIGE re-aprobación de Gerencia Administrativa.\n\n${detalle}\n\n¿Continuar?`)) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      // Solo la reversión pre-ejecución retira la aprobación del dato vivo
      // (queda en el historial). El AJUSTE en ejecución la CONSERVA: siguió
      // siendo válida para el anticipo — la reconciliación es de la liquidación.
      const { aprobada_por: _ap, fecha_aprobacion: _fa, ...base } = pre
      const nueva = revierte
        ? { ...base, valor_contratista: corrValor, anticipo_pct: corrPctNum }
        : {
            ...pre, valor_contratista: corrValor, anticipo_pct: corrPctNum,
            ...(ajuste ? { ajuste_pendiente_liquidacion: true } : {}),
          }
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        preliquidacion: nueva,
        ...(revierte ? { estado: 'preliquidacion_definida' } : {}),
        fecha_actualizacion: ahora,
        historial: arrayUnion(entrada(proyecto.estado, revierte ? 'preliquidacion_definida' : proyecto.estado,
          `Corrección de preliquidación — ${detalle} — Motivo: ${corrMotivo.trim()}` +
          (revierte ? ' · REVIERTE la aprobación: requiere re-aprobación de Gerencia Administrativa' : '') +
          (ajuste ? ` · AJUSTE en ejecución (el proyecto continúa en «${ESTADO_PRY_LABEL[proyecto.estado]}») — pendiente de reconocer en la LIQUIDACIÓN por Gerencia Administrativa` : '') +
          (pre.anticipo ? ` · anticipo ya girado ${fmtMoney(pre.anticipo.valor)} se mantiene (saldo recalculado contra el giro)` : ''))),
      })
      toast(revierte
        ? 'Corregida — vuelve a "Definida", pendiente de re-aprobación'
        : ajuste
          ? 'Ajuste registrado con traza — se reconciliará en la liquidación'
          : 'Preliquidación corregida con traza')
      setCorrForm(false)
      await reload()
    } catch { toast('Error al corregir la preliquidación', 'error') } finally { setAplicando(false) }
  }

  const registrarAnticipo = async () => {
    if (!pre || antValor === undefined || !antFecha) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      let evidencia = {}
      if (antEvidencia) {
        const nombre = `${Date.now()}_${antEvidencia.name}`
        const snap = await uploadBytes(ref(storage, `proyectos/${proyecto.id}/anticipo/${nombre}`), antEvidencia)
        evidencia = { evidencia_url: await getDownloadURL(snap.ref), evidencia_nombre: antEvidencia.name }
      }
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        preliquidacion: {
          ...pre,
          anticipo: {
            fecha: Timestamp.fromDate(new Date(antFecha + 'T12:00:00')),
            valor: antValor, registrado_por: user?.uid ?? '', ...evidencia,
          },
        },
        estado: 'anticipo_girado',
        fecha_actualizacion: ahora,
        historial: arrayUnion(entrada('preliquidacion_aprobada', 'anticipo_girado',
          `Anticipo girado al contratista — ${fmtMoney(antValor)}`)),
      })
      toast('Anticipo registrado')
      setAntForm(false)
      await reload()
    } catch { toast('Error al registrar el anticipo (verifica tu rol)', 'error') } finally { setAplicando(false) }
  }

  /** ISO ind. 3 — persiste el costo ejecutado real (proyectado = valor venta). */
  const guardarCostoEjecutado = async (v: number) => {
    try {
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        'preliquidacion.costo_ejecutado': v,
        fecha_actualizacion: Timestamp.now(),
      })
      await reload()
    } catch { toast('Error al guardar el costo ejecutado', 'error') }
  }

  /** Documento del contratista: alcance sin valores + total pactado + anticipo. */
  const generarDocContratista = async () => {
    if (!pre) return
    setAplicando(true)
    try {
      const { cargarAssetsPdf, generarPdfPreliquidacion } = await import('../../../utils/sigp/preliquidacionPdf')
      const observaciones = obsLimpias(obs)
      const buckets = new Map<string, { nombre: string; items: { codigo?: string; descripcion: string; cantidad: number; unidad: string; observacion?: string }[] }>()

      if (proyecto.cotizacion_id) {
        // Origen cotización: el alcance sale de la versión aprobada.
        const vSnap = await getDoc(doc(db, 'cotizaciones', proyecto.cotizacion_id, 'versiones', String(proyecto.cotizacion_version ?? 1)))
        if (!vSnap.exists()) throw new Error('versión de origen no encontrada')
        const version = vSnap.data() as VersionCotizacion
        const modo = modoAgrupacionDe(version)
        const actividades = actividadesDe(version)
        const nombres = new Map(subtotalesPorGrupo(version.items, modo, actividades).map(g => [g.grupo_id, g.grupo_nombre]))
        version.items.forEach((it, idx) => {
          const id = modo === 'actividad'
            ? (it.actividad_id && nombres.has(it.actividad_id) ? it.actividad_id : GRUPO_OTROS_ID)
            : (it.capitulo?.trim() || GRUPO_OTROS_ID)
          if (!buckets.has(id)) buckets.set(id, { nombre: nombres.get(id) ?? 'Otros', items: [] })
          // SIN valores: solo alcance físico (descripción + cantidad + unidad + observación)
          const observacion = observaciones[claveItemAlcance(it, idx)]
          buckets.get(id)!.items.push({
            ...(it.codigo ? { codigo: it.codigo } : {}),
            descripcion: it.descripcion, cantidad: it.cantidad, unidad: it.unidad,
            ...(observacion ? { observacion } : {}),
          })
        })
      } else {
        // Origen preventivo (F2.2): el alcance vive en el snapshot (1 renglón).
        proyecto.snapshot.alcance.forEach((g, idx) => {
          const observacion = observaciones[`idx:${idx}`]
          buckets.set(String(idx), {
            nombre: 'Alcance',
            items: [{ descripcion: g.grupo, cantidad: 1, unidad: 'glb', ...(observacion ? { observacion } : {}) }],
          })
        })
      }

      const pdf = await generarPdfPreliquidacion({
        proyectoConsecutivo: proyecto.consecutivo,
        contratistaNombre: proyecto.asignacion?.contratista_nombre ?? '—',
        clienteNombre: proyecto.snapshot.cliente,
        asunto: proyecto.snapshot.asunto,
        fecha: new Date(),
        grupos: [...buckets.values()].filter(g => g.items.length > 0),
        valorContratista: pre.valor_contratista,
        anticipoPct: pre.anticipo_pct,
        anticipoValor: pre.anticipo?.valor ?? anticipoValorDe(pre),
        saldoValor: saldoRealDe(pre),
      }, await cargarAssetsPdf())
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${proyecto.consecutivo} - Preliquidación ${proyecto.asignacion?.contratista_nombre ?? 'contratista'}.pdf`.replace(/[\\/:*?"<>|]/g, '')
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (e) {
      console.error('Error generando la preliquidación del contratista:', e)
      toast('No se pudo generar el documento', 'error')
    } finally { setAplicando(false) }
  }

  // ── Sin llegar aún al paso ──
  if (!pre && !puedeDefinir) {
    return (
      <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-400">Preliquidación</p>
        <p className="text-xs text-gray-400 mt-1">
          {proyecto.estado === 'creado' || proyecto.estado === 'contratista_asignado'
            ? 'Disponible al registrar los permisos de ingreso.'
            : 'Sin definir.'}
        </p>
      </div>
    )
  }

  const filaDeriv = (etiqueta: string, valor: string, destacada = false) => (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{etiqueta}</span>
      <span className={`font-mono ${destacada ? 'font-bold text-gray-800' : 'text-gray-700'}`}>{valor}</span>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preliquidación</p>
        {pre?.anticipo && <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">Anticipo girado</span>}
        {pre && !pre.anticipo && pre.aprobada_por && <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-lime-100 text-lime-800">Aprobada</span>}
        {pre && !pre.aprobada_por && <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-100 text-yellow-800">Definida · pendiente de aprobación</span>}
        {/* Ajuste hecho durante la ejecución: pura trazabilidad — lo reconcilia
            Gerencia Administrativa en la LIQUIDACIÓN (no frena el proyecto) */}
        {pre?.ajuste_pendiente_liquidacion && (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800"
            title="Se corrigió la preliquidación durante la ejecución. El ajuste (con su motivo en el historial) se reconoce en la liquidación por Gerencia Administrativa. No frena el avance.">
            Ajuste pendiente de reconocer en liquidación
          </span>
        )}
        {/* Hotfix B — la corrección es una acción de primer nivel de la sección
            (antes vivía como botón pequeño al fondo y costaba encontrarla) */}
        {puedeCorregir && !corrForm && (
          <button onClick={abrirCorreccion} disabled={aplicando}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg font-semibold border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            title={correccionRevierteAprobacion(proyecto.estado)
              ? 'Corregir valores con motivo y traza (ISO 7.5) — revierte la aprobación y exige re-aprobación de Gerencia Administrativa'
              : correccionEsAjusteEnEjecucion(proyecto.estado)
                ? 'Ajuste con motivo y traza (ISO 7.5) — no frena el proyecto; se reconoce en la liquidación por Gerencia Administrativa'
                : 'Corregir valores con motivo y traza en el historial (ISO 7.5)'}>
            ✎ Corregir preliquidación
          </button>
        )}
      </div>

      {/* ── Valor de venta aprobado — desglose según el esquema tributario ── */}
      {puedeDefinir && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Valor de venta aprobado · {proyecto.snapshot.esquema_tributario === 'aiu' ? 'AIU' : 'IVA pleno'}
          </p>
          {version?.totales ? (
            proyecto.snapshot.esquema_tributario === 'aiu' ? (
              <>
                {filaDeriv('Valor de la obra (costo directo)', fmtMoney(version.totales.costos_directos))}
                {filaDeriv(`Administración (${version.aiu?.admin ?? 0}%)`, fmtMoney(version.totales.admin ?? 0))}
                {filaDeriv(`Imprevistos (${version.aiu?.imprevistos ?? 0}%)`, fmtMoney(version.totales.imprevistos ?? 0))}
                {filaDeriv(`Utilidad (${version.aiu?.utilidad ?? 0}%)`, fmtMoney(version.totales.utilidad ?? 0))}
                {filaDeriv('IVA sobre la Utilidad', fmtMoney(version.totales.iva))}
              </>
            ) : (
              filaDeriv('Subtotal (costos directos)', fmtMoney(version.totales.costos_directos))
            )
          ) : proyecto.origen === 'preventivo' ? (
            <p className="text-[11px] text-gray-400">Precio de matriz IHS — el IVA se aplica en la facturación (Administrativa, futuro).</p>
          ) : (
            <p className="text-[11px] text-gray-400">Cargando desglose…</p>
          )}
          {filaDeriv('Total venta', fmtMoney(valorVenta), true)}
        </div>
      )}

      {/* ── DEFINIR (área de proyectos): palanca de margen tipo APU ── */}
      {puedeDefinir && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="text-xs text-gray-500">
              Margen % (convención APU)
              <input value={margen} onChange={e => cambiarMargen(e.target.value)} placeholder="Ej: 30"
                className={`mt-1 w-full text-sm px-3 py-1.5 border rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 ${margen.trim() === '' || margenValido ? 'border-gray-300' : 'border-red-400'}`} />
            </label>
            <label className="text-xs text-gray-500">
              Valor contratista (derivado · editable)
              <InputExpresion valor={valorContratista} onValor={cambiarContratista}
                placeholder="Se deriva del margen"
                className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-xs text-gray-500">
              Anticipo %
              <input value={pct} onChange={e => setPct(e.target.value)}
                className={`mt-1 w-full text-sm px-3 py-1.5 border rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 ${pctValido ? 'border-gray-300' : 'border-red-400'}`} />
            </label>
          </div>
          {preview && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              {filaDeriv('Valor contratista (NEG paga)', fmtMoney(preview.valor_contratista), true)}
              {filaDeriv('Utilidad esperada', `${fmtMoney(utilidadDe(preview))} (${fmtNum(margenPctDe(preview))}%)`)}
              {filaDeriv(`Anticipo (${fmtNum(pctNum)}%)`, fmtMoney(anticipoValorDe(preview)))}
              {filaDeriv('Saldo contra entrega', fmtMoney(saldoValorDe(preview)))}
              {utilidadDe(preview) < 0 && (
                <p className="text-xs text-red-600 font-medium">⚠ El valor del contratista supera el valor de venta — utilidad negativa.</p>
              )}
            </div>
          )}
          <button onClick={definir} disabled={!preview || aplicando}
            className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
            {aplicando ? 'Definiendo…' : 'Definir preliquidación'}
          </button>
          <p className="text-[11px] text-gray-400">La aprobación y el giro del anticipo son de Gerencia Administrativa (segregación de funciones).</p>
        </div>
      )}

      {/* ── Alcance aprobado CON valores (interno — para decidir el margen) ── */}
      {alcance && (
        <div className="border border-gray-100 rounded-lg">
          <button onClick={() => setVerAlcance(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-semibold text-gray-500 hover:bg-gray-50">
            <span>{verAlcance ? '▾' : '▸'} Alcance aprobado con valores (interno)</span>
            <span className="font-normal text-gray-400">{version?.items.length ?? 0} ítems</span>
          </button>
          {verAlcance && (
            <div className="px-3 pb-3 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="py-1 pr-2 font-medium">Código</th>
                    <th className="py-1 pr-2 font-medium">Descripción</th>
                    <th className="py-1 pr-2 font-medium text-center">Cant</th>
                    <th className="py-1 pr-2 font-medium text-center">Und</th>
                    <th className="py-1 pr-2 font-medium text-right">Vr. unitario</th>
                    <th className="py-1 pr-2 font-medium text-right">Vr. total</th>
                    <th className="py-1 font-medium">Observaciones <span className="normal-case font-normal">(salen al contratista)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {alcance.map(g => (
                    <Fragment key={g.nombre}>
                      <tr className="bg-gray-50">
                        <td colSpan={5} className="py-1.5 pr-2 font-semibold text-gray-600">{g.nombre}</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-gray-600">{fmtMoney(g.subtotal)}</td>
                        <td />
                      </tr>
                      {g.items.map(({ it, clave }) => (
                        <tr key={clave} className="border-b border-gray-50">
                          <td className="py-1 pr-2 font-mono text-gray-400">{it.codigo || '—'}</td>
                          <td className="py-1 pr-2 text-gray-700 max-w-xs truncate" title={it.descripcion}>{it.descripcion}</td>
                          <td className="py-1 pr-2 text-center text-gray-500">{fmtNum(it.cantidad)}</td>
                          <td className="py-1 pr-2 text-center text-gray-500">{it.unidad || '—'}</td>
                          <td className="py-1 pr-2 text-right font-mono text-gray-600">{fmtMoney(it.valor_unitario)}</td>
                          <td className="py-1 pr-2 text-right font-mono text-gray-700">{fmtMoney(it.valor_total)}</td>
                          <td className="py-1 min-w-[180px]">
                            {puedeGestionar ? (
                              <input value={obs[clave] ?? ''} onChange={e => setObs(p => ({ ...p, [clave]: e.target.value }))}
                                onBlur={guardarObs} placeholder="Ej: fachada norte, piso 15…"
                                className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-300" />
                            ) : (
                              <span className="text-gray-600">{obs[clave] || '—'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[11px] text-gray-400">Vista interna — los valores NO salen en el documento del contratista; las observaciones SÍ.</p>
            </div>
          )}
        </div>
      )}

      {/* ── DEFINIDA: resumen (interno) ── */}
      {pre && (
        <div className="space-y-1.5">
          {filaDeriv('Valor de venta', fmtMoney(pre.valor_venta))}
          {filaDeriv('Valor contratista', fmtMoney(pre.valor_contratista), true)}
          {filaDeriv('Utilidad esperada', `${fmtMoney(utilidadDe(pre))} (${fmtNum(margenPctDe(pre))}%)`)}
          {pre.anticipo
            ? filaDeriv('Anticipo (girado)', fmtMoney(pre.anticipo.valor))
            : filaDeriv(`Anticipo (${fmtNum(pre.anticipo_pct)}%)`, fmtMoney(anticipoValorDe(pre)))}
          {filaDeriv(pre.anticipo ? 'Saldo contra entrega (contra el giro real)' : 'Saldo contra entrega',
            fmtMoney(saldoRealDe(pre)))}
          {pre.anticipo && saldoRealDe(pre) < 0 && (
            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              🚨 <strong>Sobre-giro:</strong> el anticipo girado ({fmtMoney(pre.anticipo.valor)}) supera el
              valor del contratista — pagado de más por <strong>{fmtMoney(-saldoRealDe(pre))}</strong>.
              Gestionar la devolución o compensación con Gerencia Administrativa.
            </p>
          )}
          <p className="text-[11px] text-gray-400">
            Definida el {fFecha(pre.fecha_definicion)}
            {pre.fecha_aprobacion && <> · aprobada el {fFecha(pre.fecha_aprobacion)}</>}
            {pre.anticipo && <> · anticipo girado el {fFecha(pre.anticipo.fecha)} ({fmtMoney(pre.anticipo.valor)})</>}
          </p>
          {pre.salvedad && (
            <p className="text-[11px] w-fit rounded px-2 py-1 bg-amber-50 text-amber-800"
              title="Aprobó un rol de respaldo, no la titular (gerencia administrativa)">
              ⚠ Aprobación de respaldo — salvedad: {pre.salvedad}
            </p>
          )}

          {/* ISO ind. 3 — costo ejecutado real (proyectado = valor de venta) */}
          {puedeGestionar && (
            <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
              <span className="text-xs text-gray-500">
                Costo ejecutado real <span className="text-[10px] text-gray-400">(indicador ISO presupuestal)</span>
              </span>
              <InputExpresion valor={pre.costo_ejecutado} onValor={guardarCostoEjecutado}
                placeholder="Al cierre de la ejecución"
                className="w-44 text-sm px-3 py-1 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
              {(pre.costo_ejecutado ?? 0) > 0 && pre.valor_venta > 0 && (
                <span className="text-xs font-mono text-gray-500">
                  = {fmtNum((pre.costo_ejecutado! / pre.valor_venta) * 100)}% del proyectado
                </span>
              )}
            </div>
          )}
          {pre.anticipo?.evidencia_url && (
            <a href={pre.anticipo.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline underline-offset-2">
              📎 {pre.anticipo.evidencia_nombre ?? 'Evidencia del giro'}
            </a>
          )}
        </div>
      )}

      {/* ── Acciones ── */}
      <div className="flex flex-wrap items-center gap-2">
        {pre && !pre.aprobada_por && puedeAprobar && proyecto.estado === 'preliquidacion_definida' && (
          <button onClick={aprobar} disabled={aplicando}
            title={esRespaldo ? 'Aprobación de RESPALDO: exige salvedad (por qué no aprueba la gerente administrativa)' : undefined}
            className="text-sm px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            {esRespaldo ? '✓ Aprobar como respaldo (con salvedad)' : '✓ Aprobar (Gerencia Adm.)'}
          </button>
        )}
        {pre && !pre.aprobada_por && !puedeAprobar && (
          <span className="text-[11px] text-gray-400">Pendiente de aprobación por Gerencia Administrativa.</span>
        )}
        {pre?.aprobada_por && !pre.anticipo && puedeAprobar && proyecto.estado === 'preliquidacion_aprobada' && !antForm && (
          <button onClick={() => { setAntForm(true); setAntValor(anticipoValorDe(pre)) }}
            className="text-sm px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
            💸 Registrar anticipo girado
          </button>
        )}
        {pre && (
          <button onClick={generarDocContratista} disabled={aplicando}
            className="text-sm px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Documento para el contratista: alcance sin valores por actividad + total pactado + anticipo">
            📄 Preliquidación del contratista
          </button>
        )}
      </div>

      {/* ── Respaldo de aprobación — SALVEDAD obligatoria (aprobador ≠ titular) ── */}
      {salvedadForm && pre && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-semibold text-amber-800">
            Aprobación de respaldo — la titular es Gerencia Administrativa. Justifica por qué
            apruebas tú (queda en la preliquidación y en el historial).
          </p>
          <label className="block text-xs text-gray-500">
            Salvedad <span className="text-red-500">*</span>
            <textarea value={salvedad} onChange={e => setSalvedad(e.target.value)} rows={2}
              placeholder="Ej: la gerente administrativa está en licencia hasta el 30-jul; aprueba gerencia general para no frenar el anticipo…"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          {!salvedad.trim() && <p className="text-xs text-red-600">La salvedad es obligatoria para aprobar como respaldo.</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setSalvedadForm(false); setSalvedad('') }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => { if (salvedad.trim()) ejecutarAprobacion(salvedad.trim()) }}
              disabled={aplicando || !salvedad.trim()}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">
              {aplicando ? 'Aprobando…' : 'Aprobar con salvedad'}
            </button>
          </div>
        </div>
      )}

      {/* ── Bloque 4 — form de corrección (motivo OBLIGATORIO, ISO 7.5) ── */}
      {corrForm && pre && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-semibold text-amber-800">
            Corrección de preliquidación
            {correccionRevierteAprobacion(proyecto.estado) &&
              <span className="font-normal"> — al guardar, vuelve a «Definida» y exige re-aprobación de Gerencia Administrativa</span>}
            {correccionEsAjusteEnEjecucion(proyecto.estado) &&
              <span className="font-normal"> — ajuste en ejecución: no frena el proyecto; se reconoce en la LIQUIDACIÓN por Gerencia Administrativa</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="text-xs text-gray-500">
              Margen (%)
              <input value={corrMargen} onChange={e => cambiarCorrMargen(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-xs text-gray-500">
              Valor contratista
              <InputExpresion valor={corrValor} onValor={cambiarCorrValor}
                className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-xs text-gray-500">
              Anticipo (%)
              <input value={corrPct} onChange={e => setCorrPct(e.target.value)}
                className={`mt-1 w-full text-sm px-3 py-1.5 border rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 ${corrPctValido ? 'border-gray-300' : 'border-red-400'}`} />
            </label>
          </div>
          {corrCambios.length > 0 && (
            <p className="text-xs text-gray-600">
              {corrCambios.map(c =>
                `${c.campo === 'anticipo_pct' ? '% de anticipo' : 'Valor contratista'}: ${c.campo === 'anticipo_pct' ? `${fmtNum(c.antes)}% → ${fmtNum(c.despues)}%` : `${fmtMoney(c.antes)} → ${fmtMoney(c.despues)}`}`).join(' · ')}
            </p>
          )}
          {pre.anticipo && corrValor !== undefined && corrValor !== pre.valor_contratista && (
            corrValor - pre.anticipo.valor >= 0 ? (
              <p className="text-xs text-amber-800 bg-amber-100 rounded px-2 py-1.5">
                ⚠ Ya se giró un anticipo de <strong>{fmtMoney(pre.anticipo.valor)}</strong> — el giro no se toca.
                Con el nuevo valor, el saldo contra entrega queda en <strong>{fmtMoney(corrValor - pre.anticipo.valor)}</strong>.
              </p>
            ) : (
              <p className="text-xs text-red-800 bg-red-100 rounded px-2 py-1.5">
                🚨 <strong>SOBRE-GIRO:</strong> el nuevo valor queda POR DEBAJO del anticipo ya girado
                ({fmtMoney(pre.anticipo.valor)}) — el contratista quedaría pagado de más por{' '}
                <strong>{fmtMoney(pre.anticipo.valor - corrValor)}</strong> (saldo {fmtMoney(corrValor - pre.anticipo.valor)}).
              </p>
            )
          )}
          <label className="block text-xs text-gray-500">
            Motivo de la corrección <span className="text-red-500">*</span>
            <textarea value={corrMotivo} onChange={e => setCorrMotivo(e.target.value)} rows={2}
              placeholder="Por qué se corrige (queda en el historial — ISO 7.5)…"
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <div className="flex gap-2">
            <button onClick={corregir}
              disabled={aplicando || corrValor === undefined || !corrPctValido || !corrMotivo.trim() || corrCambios.length === 0}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">
              {aplicando ? 'Guardando…' : 'Guardar corrección'}
            </button>
            <button onClick={() => setCorrForm(false)} disabled={aplicando}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            {corrCambios.length === 0 && <span className="text-[11px] text-gray-400 self-center">Sin cambios aún.</span>}
          </div>
        </div>
      )}

      {/* ── Form anticipo (gerencia administrativa) ── */}
      {antForm && pre && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="text-xs text-gray-500">
              Fecha del giro
              <input type="date" value={antFecha} onChange={e => setAntFecha(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-xs text-gray-500">
              Valor girado
              <InputExpresion valor={antValor} onValor={setAntValor}
                className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
          <label className="block text-xs text-gray-500">
            Evidencia del giro (comprobante)
            <input type="file" onChange={e => setAntEvidencia(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          </label>
          <div className="flex gap-2">
            <button onClick={registrarAnticipo} disabled={!antFecha || antValor === undefined || aplicando}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
              {aplicando ? 'Registrando…' : 'Registrar'}
            </button>
            <button onClick={() => setAntForm(false)} disabled={aplicando}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
