// AVANCE DE OBRA + CORTES (07-nov-2026). El avance se captura POR ÍTEM
// cuando OCURRE (gestores, con autor siempre); el CORTE lo emite GERENCIA
// (consecutivo CRT + PDF + hash, congelado — un corte entregado es un hecho).
// El total del corte es lo que sustenta la factura parcial (B1).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, arrayUnion, query, orderBy, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import Modal from '../../shared/Modal'
import { toast } from '../../shared/Toast'
import { useAuth } from '../../../contexts/AuthContext'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import InputExpresion from '../cotizaciones/InputExpresion'
import { fmtMoney, fmtNum } from '../../../utils/sigp/formato'
import { generarPdfCorte, cargarAssetsPdf } from '../../../utils/sigp/cortePdf'
import { sha256Hex } from '../../../utils/sigp/cotizacionPdf'
import { puedeCapturarAvanceUI, puedeEmitirCorteUI } from '../../../types/sigp/permisos'
import type { Proyecto } from '../../../types/sigp/proyecto'
import { idxRiel, ESTADOS_PROYECTO, facturasVivasDe } from '../../../types/sigp/proyecto'
import {
  avanceDe, pctItem, estadoItemAvance, ESTADO_ITEM_LABEL, patchRegistrarAvance,
  construirCorte, entradaHistorialCorte, plantillaObservacionesCorte,
  esCorteFacturable, aritmeticaFacturasCorte, type CorteObra, type TipoCorte,
  baseCortadaDe, errorBajoBase, valorEjecutadoItem,
} from '../../../types/sigp/corteObra'
import { autorDe } from '../../../utils/sigp/autoria'
import type { ConfigAIU, EsquemaTributario } from '../../../types/sigp/cotizacion'

interface Props {
  proyecto: Proyecto
  reload: () => Promise<void>
  nombres: Record<string, string>
}

const COLOR_ESTADO: Record<string, string> = {
  sin_avance: 'bg-gray-100 text-gray-500',
  en_ejecucion: 'bg-amber-50 text-amber-800',
  ejecutado: 'bg-emerald-50 text-emerald-700',
}

export default function AvanceObra({ proyecto, reload, nombres }: Props) {
  const { user } = useAuth()
  const { obtener } = useConsecutivo()
  const puedeCapturar = puedeCapturarAvanceUI(user?.rol)
    && proyecto.estado !== 'cerrado' && proyecto.estado !== 'cancelado'
  const puedeEmitir = puedeEmitirCorteUI(user?.rol)
    && proyecto.estado !== 'cerrado' && proyecto.estado !== 'cancelado'
  const [aplicando, setAplicando] = useState(false)
  const [cortes, setCortes] = useState<(CorteObra & { id: string })[]>([])
  const [emitirOpen, setEmitirOpen] = useState(false)
  // Tipo del corte (08-nov): facturable mueve la base de cobro; informativo
  // congela y documenta sin moverla.
  const [tipoCorte, setTipoCorte] = useState<TipoCorte>('facturable')
  // Desplegable (08-nov): arranca CERRADA; se abre sola si ya hay avance
  // capturado o cortes emitidos. El clic del usuario manda sobre el auto.
  const [abiertaManual, setAbiertaManual] = useState<boolean | null>(null)
  const [observaciones, setObservaciones] = useState('')
  const [esquema, setEsquema] = useState<EsquemaTributario>('iva_pleno')
  const [aiu, setAiu] = useState<ConfigAIU | undefined>(undefined)
  // Forma SENA (08-nov): referencias de contrato del cliente + firma del
  // emisor (correo del perfil; celular si existe — campo OC1).
  const [contratoRefs, setContratoRefs] = useState<string[]>([])
  const [celularEmisor, setCelularEmisor] = useState<string | undefined>(undefined)

  const items = proyecto.snapshot.items_alcance ?? []
  const enEjecucionOMas = idxRiel(proyecto.estado) >= ESTADOS_PROYECTO.indexOf('en_ejecucion')
    || proyecto.estado === 'enviado_a_facturacion' || proyecto.estado === 'facturado'

  const cargarCortes = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'proyectos', proyecto.id, 'cortes'), orderBy('numero_corte', 'asc')))
      setCortes(snap.docs.map(d => ({ id: d.id, ...d.data() } as CorteObra & { id: string })))
    } catch { /* lectores sin permiso: la sección degrada sin cortes */ }
  }, [proyecto.id])
  useEffect(() => { cargarCortes() }, [cargarCortes])

  // AIU del CONTRATO: congelado en la versión aprobada de la cotización —
  // la única fuente (el snapshot no guarda los %). Preventivos: iva_pleno.
  useEffect(() => {
    (async () => {
      if (proyecto.origen !== 'cotizacion' || !proyecto.cotizacion_version) {
        setEsquema(proyecto.snapshot.esquema_tributario ?? 'iva_pleno'); return
      }
      try {
        const v = await getDoc(doc(db, 'cotizaciones', proyecto.cotizacion_id ?? proyecto.id, 'versiones', String(proyecto.cotizacion_version)))
        const d = v.data() as { esquema_tributario?: EsquemaTributario; aiu?: ConfigAIU } | undefined
        setEsquema(d?.esquema_tributario ?? proyecto.snapshot.esquema_tributario ?? 'iva_pleno')
        setAiu(d?.aiu)
      } catch { setEsquema(proyecto.snapshot.esquema_tributario ?? 'iva_pleno') }
    })()
  }, [proyecto])

  if (items.length === 0 || !enEjecucionOMas) return null

  // Resumen de la cabecera (visible también con la sección cerrada)
  const hayContenido = (proyecto.avance_items?.length ?? 0) > 0 || cortes.length > 0
  const abierta = abiertaManual ?? hayContenido
  const cdContratado = items.reduce((s, it) => s + it.valor_total, 0)
  const cdEjecutado = items.reduce((s, it) => {
    const cant = avanceDe(proyecto, it.clave)?.cantidad ?? 0
    return s + (it.cantidad > 0 ? Math.round(it.valor_total * (cant / it.cantidad)) : 0)
  }, 0)
  const pctGlobal = cdContratado > 0 ? (cdEjecutado / cdContratado) * 100 : 0
  const facturasVivas = facturasVivasDe(proyecto)

  // 13-nov (caso 01.01.01 del 058): la BASE del último corte FACTURABLE, por
  // clave — la columna «Cortado» contra la que se mide lo nuevo, y el piso
  // que el registro no puede contradecir. La pantalla pedía un número sin
  // decir contra qué; ahora las tres columnas van juntas.
  const base = useMemo(() => baseCortadaDe(cortes), [cortes])
  // Delta EN VIVO tecla a tecla (onVivo de InputExpresion): borrador por
  // clave del acumulado total y de «lo nuevo» (null = texto aún no evalúa).
  const [vivoAcum, setVivoAcum] = useState<Record<string, number | null>>({})
  const [vivoNuevo, setVivoNuevo] = useState<Record<string, number | null>>({})
  const [corteDetalle, setCorteDetalle] = useState<Record<string, boolean>>({})

  const guardarAvance = async (clave: string, cantidad: number) => {
    // BLOQUEO DURO bajo lo congelado (decisión 13-nov): al emitir ya se
    // rechaza el delta negativo — el mismo criterio, en el momento del tecleo.
    const piso = base.porClave.get(clave) ?? 0
    if (cantidad < piso) { toast(errorBajoBase(cantidad, piso, base.consecutivo), 'error'); return }
    const r = patchRegistrarAvance(proyecto, clave, cantidad, user?.uid ?? '', Timestamp.now(), user?.nombre, undefined, piso)
    if (!r) { toast('Ítem fuera del alcance vigente', 'error'); return }
    setAplicando(true)
    try {
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        avance_items: r.avance_items, fecha_actualizacion: Timestamp.now(),
      })
      if (r.sobreEjecutado) toast(`⚠ ${fmtNum(cantidad)} supera la cantidad contratada (${fmtNum(r.item.cantidad)}) — registrado igual, a la vista (+${fmtNum(cantidad - r.item.cantidad)} ${r.item.unidad} sobre lo contratado)`, 'error')
      else toast('Avance registrado')
      setVivoAcum(v => ({ ...v, [clave]: null }))
      setVivoNuevo(v => ({ ...v, [clave]: null }))
      await reload()
    } catch { toast('Error al registrar el avance (verifica tu rol)', 'error') } finally { setAplicando(false) }
  }

  const preview = construirCorte({ proyecto, cortesPrevios: cortes, esquema, aiu, tipo: tipoCorte, observaciones, contratoReferencias: contratoRefs })

  const abrirEmitir = async () => {
    setTipoCorte('facturable')
    setEmitirOpen(true)
    // Contratos del cliente + celular del emisor (best-effort — sin ellos el
    // corte sale con '—' y sin teléfono, no se bloquea nada).
    try {
      if (proyecto.cliente_id) {
        const c = await getDoc(doc(db, 'clientes', proyecto.cliente_id))
        setContratoRefs((c.data()?.contratos as string[] | undefined) ?? [])
      }
    } catch { setContratoRefs([]) }
    try {
      if (user?.uid) {
        const u = await getDoc(doc(db, 'users', user.uid))
        setCelularEmisor(u.data()?.celular as string | undefined)
      }
    } catch { /* sin celular */ }
    // La plantilla INVITA en vez de quedar vacía (forma SENA): avance global,
    // ítems fuera de lo típico y la nota de adicionales — editable.
    if (!observaciones.trim()) {
      // La plantilla se arma con tipo 'informativo' (acepta delta 0 — superset
      // del facturable): así la guía sale también cuando el único corte
      // posible es uno informativo sin avance nuevo. El tipo real lo decide
      // el radio del modal.
      const pre = construirCorte({ proyecto, cortesPrevios: cortes, esquema, aiu, tipo: 'informativo' })
      if (pre.ok) setObservaciones(plantillaObservacionesCorte(pre.corte))
    }
  }

  const emitir = async () => {
    if (!preview.ok) return
    setAplicando(true)
    try {
      const consecutivo = await obtener('CRT')
      const ahora = Timestamp.now()
      const corte: CorteObra = {
        ...preview.corte, consecutivo,
        fecha_emision: ahora, emitido_por: user?.uid ?? '',
        ...(user?.nombre ? { emitido_por_nombre: user.nombre } : {}),
        emisor: {
          nombre: user?.nombre ?? user?.email ?? '—',
          area: 'GESTIÓN ADMINISTRATIVA',
          ...(user?.email ? { correo: user.email } : {}),
          ...(celularEmisor ? { telefono: celularEmisor } : {}),
        },
        fecha_creacion: ahora,
      }
      // PDF generado + hash (regla 8) + Storage — el documento ES el corte
      const assets = await cargarAssetsPdf()
      const bytes = await generarPdfCorte({ ...corte, fechaJs: ahora.toDate() }, assets)
      const hash = await sha256Hex(bytes)
      const nombrePdf = `${consecutivo}.pdf`
      const up = await uploadBytes(ref(storage, `proyectos/${proyecto.id}/cortes/${nombrePdf}`), bytes, { contentType: 'application/pdf' })
      const url = await getDownloadURL(up.ref)
      await setDoc(doc(collection(db, 'proyectos', proyecto.id, 'cortes')), {
        ...corte, pdf_url: url, pdf_nombre: nombrePdf, pdf_hash: hash,
      })
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        historial: arrayUnion(entradaHistorialCorte(proyecto.estado, consecutivo, corte.numero_corte, corte.resumen.total, user?.uid ?? '', ahora, user?.nombre, corte.tipo)),
        fecha_actualizacion: ahora,
      })
      toast(corte.tipo === 'informativo'
        ? `${consecutivo} emitido — INFORMATIVO, no facturable (delta ${fmtMoney(corte.resumen.total)}; la base de cobro no se mueve)`
        : `${consecutivo} emitido — facturable del corte ${fmtMoney(corte.resumen.total)}`)
      setEmitirOpen(false); setObservaciones('')
      await cargarCortes(); await reload()
    } catch (e) {
      console.error('Error emitiendo corte:', e)
      toast('Error al emitir el corte (verifica tu rol y el consecutivo)', 'error')
    } finally { setAplicando(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={() => setAbiertaManual(!abierta)}
          className="flex items-center gap-2 text-left group" aria-expanded={abierta}>
          <span className="text-gray-400 text-xs">{abierta ? '▾' : '▸'}</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide group-hover:text-gray-600 transition">
            Avance de obra
          </span>
          <span className="text-[11px] text-gray-400 normal-case">
            {hayContenido
              ? <>· {fmtNum(pctGlobal)}% del CD{cortes.length > 0 ? ` · ${cortes.length} corte${cortes.length === 1 ? '' : 's'}` : ''}</>
              : '· sin avance capturado'}
          </span>
        </button>
        {abierta && puedeEmitir && (
          <button onClick={abrirEmitir}
            className="px-3 py-1.5 rounded-lg border border-brand-300 bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 transition">
            📄 Emitir corte de obra
          </button>
        )}
      </div>

      {abierta && <>
      <p className="text-[11px] text-gray-400 -mt-1">
        Por ítem del alcance — se captura cuando ocurre; capturan los gestores, el corte lo emite gerencia.
      </p>

      {/* 13-nov: los cortes emitidos ARRIBA de la captura — se miran antes de
          teclear, no después. Cada uno expandible con su congelado ítem por
          ítem (antes ese detalle solo vivía en el PDF). */}
      {cortes.length > 0 && (
        <div className="space-y-1.5 pb-2 border-b border-gray-100">
          <p className="text-[11px] font-semibold text-gray-500">
            Cortes emitidos — la base contra la que se mide lo nuevo (congelados con hash; el avance posterior solo afecta los siguientes)
          </p>
          {cortes.map(c => {
            const informativo = !esCorteFacturable(c)
            const arit = informativo ? null : aritmeticaFacturasCorte(c.id, c.resumen.total, facturasVivas)
            const abiertoDet = !!corteDetalle[c.id]
            return (
              <div key={c.id} className="text-xs text-gray-700">
                <p>
                  <span className="font-mono font-semibold">{c.consecutivo}</span>
                  <span className="text-gray-400"> · corte {c.numero_corte} · {c.fecha_emision.toDate().toLocaleDateString('es-CO')} · </span>
                  {informativo ? (
                    <>
                      <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold align-middle">INFORMATIVO</span>
                      <span className="text-gray-400"> delta </span>
                      <span className="font-mono">{fmtMoney(c.resumen.total)}</span>
                      <span className="text-gray-400"> — no facturable</span>
                    </>
                  ) : (
                    <>
                      <span className="text-gray-400">facturable </span>
                      <span className="font-mono">{fmtMoney(c.resumen.total)}</span>
                    </>
                  )}
                  {c.pdf_url && <a href={c.pdf_url} target="_blank" rel="noreferrer" className="ml-1.5 text-brand-700 underline underline-offset-2">PDF</a>}
                  <button onClick={() => setCorteDetalle(d => ({ ...d, [c.id]: !abiertoDet }))}
                    className="ml-1.5 text-gray-500 underline underline-offset-2 decoration-dotted">
                    {abiertoDet ? 'ocultar ítems ▴' : 'ítems ▾'}
                  </button>
                </p>
                {arit && arit.facturado > 0 && (
                  <p className={`ml-4 text-[11px] ${arit.sobrepasa ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
                    {arit.sobrepasa
                      ? <>⚠ facturado {fmtMoney(arit.facturado)} — SUPERA el facturable del corte ({fmtMoney(c.resumen.total)})</>
                      : arit.falta > 0
                        ? <>facturado {fmtMoney(arit.facturado)} · falta {fmtMoney(arit.falta)}</>
                        : <>facturado completo ({fmtMoney(arit.facturado)})</>}
                    <span className="font-mono"> · {arit.numeros.join(', ')}</span>
                  </p>
                )}
                {arit && arit.facturado === 0 && (
                  <p className="ml-4 text-[11px] text-amber-700">sin factura registrada contra este corte</p>
                )}
                {abiertoDet && (
                  <div className="ml-4 mt-1 overflow-x-auto">
                    <table className="text-[11px]">
                      <thead>
                        <tr className="text-left text-[10px] uppercase text-gray-400">
                          <th className="pr-2">Cód.</th><th className="pr-2">Ítem</th>
                          <th className="pr-2 text-right">Contratado</th>
                          <th className="pr-2 text-right">Acum. congelado</th>
                          <th className="pr-2 text-right">%</th>
                          <th className="text-right">Valor acum.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.items.map(it => (
                          <tr key={it.clave} className="border-b border-gray-50">
                            <td className="pr-2 font-mono text-gray-500">{it.codigo ?? '—'}</td>
                            <td className="pr-2 max-w-[18rem] truncate text-gray-700" title={it.descripcion}>{it.descripcion}</td>
                            <td className="pr-2 text-right font-mono">{fmtNum(it.cantidad_contratada)} {it.unidad}</td>
                            <td className="pr-2 text-right font-mono font-semibold">{fmtNum(it.cantidad_acum)}</td>
                            <td className="pr-2 text-right font-mono">{fmtNum(it.pct)}%</td>
                            <td className="text-right font-mono">{fmtMoney(it.valor_acum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
              <th className="py-1.5 pr-2">Cód.</th>
              <th className="py-1.5 pr-2">Ítem</th>
              <th className="py-1.5 pr-2 text-right">Contratado</th>
              <th className="py-1.5 pr-2 text-right" title="Acumulado congelado en el último corte FACTURABLE — la base contra la que se mide este corte">
                Cortado{base.consecutivo ? <span className="block normal-case text-gray-300">{base.consecutivo}</span> : null}
              </th>
              <th className="py-1.5 pr-2 text-right" title="La cantidad TOTAL ejecutada medida en campo — no lo nuevo">Acumulado total</th>
              {puedeCapturar && <th className="py-1.5 pr-2 text-right" title="Lo NUEVO de este corte — el panel lo suma al acumulado">＋ Nuevo</th>}
              <th className="py-1.5 pr-2 text-right" title="Lo que se facturaría en este corte: acumulado − cortado">Delta corte</th>
              <th className="py-1.5 pr-2 text-right">Falta</th>
              <th className="py-1.5 pr-2">Estado</th>
              <th className="py-1.5">Último registro</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const av = avanceDe(proyecto, it.clave)
              const pct = pctItem(it, av)
              const estado = estadoItemAvance(pct)
              const ultimo = av?.registros[av.registros.length - 1]
              const baseCant = base.porClave.get(it.clave) ?? 0
              // efectivo EN VIVO: lo tecleado (acumulado directo, o acumulado
              // vigente + lo nuevo) antes de confirmar; en reposo, el vigente.
              const efectivo = vivoAcum[it.clave] ?? ((av?.cantidad ?? 0) + (vivoNuevo[it.clave] ?? 0))
              const deltaCant = efectivo - baseCant
              const deltaValor = valorEjecutadoItem(it, efectivo) - valorEjecutadoItem(it, baseCant)
              const falta = it.cantidad - efectivo
              const bajoBase = efectivo < baseCant
              return (
                <tr key={it.clave} className={`border-b border-gray-50 ${bajoBase ? 'bg-red-50' : ''}`}>
                  <td className="py-1.5 pr-2 font-mono text-[11px] text-gray-500 whitespace-nowrap align-top">{it.codigo ?? '—'}</td>
                  <td className="py-1.5 pr-2 max-w-[13rem]">
                    <span className="text-gray-800">{it.descripcion}</span>
                    <span className="block text-[10px] text-gray-400">{it.grupo}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-gray-600 whitespace-nowrap">{fmtNum(it.cantidad)} {it.unidad}</td>
                  <td className="py-1.5 pr-2 text-right font-mono text-gray-600">{baseCant > 0 ? fmtNum(baseCant) : '—'}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {puedeCapturar ? (
                      <InputExpresion valor={av?.cantidad} onValor={n => guardarAvance(it.clave, n)}
                        onVivo={n => setVivoAcum(v => ({ ...v, [it.clave]: n }))}
                        placeholder="0" titulo="Acumulado TOTAL medido (no lo nuevo)"
                        className={`w-24 px-2 py-1 border rounded text-right font-mono text-xs focus:outline-none focus:ring-2 ${bajoBase ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-brand-300'}`} />
                    ) : <span className="font-mono">{fmtNum(av?.cantidad ?? 0)}</span>}
                  </td>
                  {puedeCapturar && (
                    <td className="py-1.5 pr-2 text-right">
                      {/* key con el acumulado: al confirmar, el campo «nuevo»
                          se remonta vacío — lo suyo ya quedó sumado. */}
                      <InputExpresion key={`${it.clave}-${av?.cantidad ?? 0}`} valor={undefined}
                        onValor={n => guardarAvance(it.clave, (av?.cantidad ?? 0) + n)}
                        onVivo={n => setVivoNuevo(v => ({ ...v, [it.clave]: n }))}
                        placeholder="+" titulo="Lo NUEVO de este corte — se suma al acumulado y se ve el resultado"
                        className="w-16 px-2 py-1 border border-gray-200 rounded text-right font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    </td>
                  )}
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                    {bajoBase ? (
                      <span className="font-mono text-red-700 font-semibold" title={errorBajoBase(efectivo, baseCant, base.consecutivo)}>
                        ⚠ bajo lo congelado
                      </span>
                    ) : (
                      <>
                        <span className={`font-mono ${deltaCant > 0 ? 'text-brand-700 font-semibold' : 'text-gray-400'}`}>{fmtNum(deltaCant)}</span>
                        <span className="block text-[10px] text-gray-400 font-mono">{fmtMoney(deltaValor)}</span>
                      </>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                    {falta >= 0
                      ? <span className="font-mono text-gray-600">{fmtNum(falta)}</span>
                      : <span className="font-mono text-red-700 font-semibold" title="Ejecutado por encima de lo contratado — pasa, pero no pasa desapercibido">+{fmtNum(-falta)} sobre</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${COLOR_ESTADO[estado]}`}>
                      {ESTADO_ITEM_LABEL[estado]}
                    </span>
                    {pct > 100 && <span className="ml-1 text-[10px] text-red-600 font-semibold">sobre-ejecutado</span>}
                  </td>
                  <td className="py-1.5 text-[10px] text-gray-400">
                    {ultimo ? `${autorDe(ultimo, nombres)} · ${ultimo.fecha.toDate().toLocaleDateString('es-CO')}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* El facturable estimado del corte en preparación, EN VIVO (solo CD —
          AIU/IVA salen al emitir, del esquema del contrato). */}
      {(() => {
        const sumDelta = items.reduce((s, it) => {
          const efectivo = vivoAcum[it.clave] ?? ((avanceDe(proyecto, it.clave)?.cantidad ?? 0) + (vivoNuevo[it.clave] ?? 0))
          return s + (valorEjecutadoItem(it, efectivo) - valorEjecutadoItem(it, base.porClave.get(it.clave) ?? 0))
        }, 0)
        return (
          <p className="text-[11px] text-gray-500">
            Delta CD del corte en preparación{base.consecutivo ? ` (desde ${base.consecutivo})` : ''}:{' '}
            <span className={`font-mono font-semibold ${sumDelta < 0 ? 'text-red-700' : 'text-brand-700'}`}>{fmtMoney(sumDelta)}</span>
            <span className="text-gray-400"> — el total facturable sale al emitir (AIU/IVA del contrato)</span>
          </p>
        )
      })()}

      </>}

      <Modal isOpen={emitirOpen} onClose={() => setEmitirOpen(false)} size="lg"
        title={`Emitir corte de obra — ${proyecto.consecutivo}`}
        actions={[
          { label: 'Cancelar', onClick: () => setEmitirOpen(false), variant: 'secondary' },
          { label: aplicando ? 'Emitiendo…' : 'Emitir y congelar', onClick: emitir, variant: 'primary', loading: aplicando, disabled: !preview.ok },
        ]}>
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            El corte se GENERA del avance capturado (no se arma a mano), queda numerado (CRT), congelado con
            hash y es el soporte de la factura parcial. Corregir el avance después NO cambia este corte.
          </p>
          {/* Tipo del corte (08-nov): el facturable mueve la base de cobro; el
              informativo congela y documenta SIN moverla — el siguiente
              facturable mide contra el último facturable. */}
          <div className="rounded-lg border border-gray-200 px-3 py-2 space-y-1.5">
            <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="radio" name="tipo-corte" checked={tipoCorte === 'facturable'}
                onChange={() => setTipoCorte('facturable')} className="mt-0.5 accent-brand-600" />
              <span><b>Facturable</b> — sustenta una factura; su delta mueve la base de cobro (exige avance nuevo).</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="radio" name="tipo-corte" checked={tipoCorte === 'informativo'}
                onChange={() => setTipoCorte('informativo')} className="mt-0.5 accent-brand-600" />
              <span><b>Informativo</b> — congela el acumulado y genera el PDF como constancia fechada, pero
                NO mueve la base de cobro: el siguiente corte facturable mide contra el último facturable.
                Su delta se rotula «informativo, no facturable» y no admite factura que lo referencie.</span>
            </label>
          </div>
          {!preview.ok ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">{preview.error}</p>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 space-y-1">
              <p>Corte <b>N° {preview.corte.numero_corte}</b> · mide contra {preview.corte.cotizacion_version_medida != null ? `v${preview.corte.cotizacion_version_medida}` : 'el alcance del snapshot'} · CD ejecutado acumulado <span className="font-mono">{fmtMoney(preview.corte.cd_acum)}</span> de <span className="font-mono">{fmtMoney(preview.corte.cd_contratado)}</span> ({fmtNum(preview.corte.pct_global)}%)</p>
              {preview.corte.nota_version_cambio && <p className="text-amber-800 font-medium">(!) {preview.corte.nota_version_cambio}</p>}
              {preview.corte.items_fuera_de_alcance && (
                <p className="text-amber-800">(!) {preview.corte.items_fuera_de_alcance.length} avance(s) de ítems fuera del alcance vigente — se listan en el PDF, no se facturan.</p>
              )}
              <p>Avance del corte (delta contra el último corte FACTURABLE — base <span className="font-mono">{fmtMoney(preview.corte.cd_acum_anterior)}</span>): <span className="font-mono">{fmtMoney(preview.corte.resumen.delta_cd)}</span>
                {preview.corte.resumen.esquema === 'aiu'
                  ? ` + A ${fmtNum(preview.corte.resumen.aiu_pct?.admin ?? 0)}% + I ${fmtNum(preview.corte.resumen.aiu_pct?.imprevistos ?? 0)}% + U ${fmtNum(preview.corte.resumen.aiu_pct?.utilidad ?? 0)}% + IVA/U`
                  : ' + IVA 19%'}
              </p>
              {tipoCorte === 'informativo' ? (
                <p className="font-semibold text-sm text-gray-600">DELTA DEL CORTE: <span className="font-mono">{fmtMoney(preview.corte.resumen.total)}</span> — INFORMATIVO, NO FACTURABLE (la base de cobro no se mueve)</p>
              ) : (
                <p className="font-semibold text-sm">FACTURABLE DEL CORTE: <span className="font-mono">{fmtMoney(preview.corte.resumen.total)}</span></p>
              )}
            </div>
          )}
          <label className="block text-xs text-gray-500">
            Observaciones (texto libre — salen en el PDF; la guía sugerida es editable)
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={6}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <p className="text-[11px] text-gray-400">
            El PDF sale con el código ISO ROTULADO «pendiente de ratificación SGI» hasta que Ingrid lo ratifique
            — jamás con el de cotización.
          </p>
        </div>
      </Modal>
    </div>
  )
}
