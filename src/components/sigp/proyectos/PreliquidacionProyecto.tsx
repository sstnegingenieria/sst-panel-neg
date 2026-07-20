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
  contratistaDesdeMargen, claveItemAlcance,
} from '../../../types/sigp/proyecto'
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

  const aprobar = async () => {
    if (!pre) return
    if (!window.confirm(`¿Aprobar la preliquidación? Contratista ${fmtMoney(pre.valor_contratista)} · anticipo ${fmtNum(pre.anticipo_pct)}% (${fmtMoney(anticipoValorDe(pre))}).`)) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        preliquidacion: { ...pre, aprobada_por: user?.uid ?? '', fecha_aprobacion: ahora },
        estado: 'preliquidacion_aprobada',
        fecha_actualizacion: ahora,
        historial: arrayUnion(entrada('preliquidacion_definida', 'preliquidacion_aprobada',
          'Preliquidación aprobada por Gerencia Administrativa')),
      })
      toast('Preliquidación aprobada')
      await reload()
    } catch { toast('Error al aprobar (verifica tu rol)', 'error') } finally { setAplicando(false) }
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
        anticipoValor: anticipoValorDe(pre),
        saldoValor: saldoValorDe(pre),
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
          {filaDeriv(`Anticipo (${fmtNum(pre.anticipo_pct)}%)`, fmtMoney(anticipoValorDe(pre)))}
          {filaDeriv('Saldo contra entrega', fmtMoney(saldoValorDe(pre)))}
          <p className="text-[11px] text-gray-400">
            Definida el {fFecha(pre.fecha_definicion)}
            {pre.fecha_aprobacion && <> · aprobada el {fFecha(pre.fecha_aprobacion)}</>}
            {pre.anticipo && <> · anticipo girado el {fFecha(pre.anticipo.fecha)} ({fmtMoney(pre.anticipo.valor)})</>}
          </p>
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
            className="text-sm px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            ✓ Aprobar (Gerencia Adm.)
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
