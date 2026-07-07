import { useState, useEffect, useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import type { Cliente } from '../../../types/sigp/cliente'
import type { MapeoColumnas, MapeoHoja } from '../../../types/sigp/importacion'
import type { LPU } from '../../../types/sigp/lpu'
import { leerLibro, pareceListaDePrecios, type HojaCruda } from '../../../utils/sigp/lpuExcel'
import {
  detectarFilaEncabezado, sugerirMapeoColumnas, sugerirOrigenCapitulo,
  procesarHoja, consolidar, letraColumna,
} from '../../../utils/sigp/lpuMapeo'
import { useAuth } from '../../../contexts/AuthContext'
import { useImportarLpu } from '../../../hooks/sigp/useImportarLpu'
import { toast } from '../../shared/Toast'

interface ImportarLpuWizardProps {
  isOpen: boolean
  onClose: () => void
  clientes: Cliente[]
  lpus: LPU[]
  onImportado: () => void
  /** Si se pasa, el wizard arranca con ese cliente fijo (p. ej. «Nueva versión»). */
  clienteIdInicial?: string
}

const PASOS = ['Cliente y archivo', 'Hojas', 'Mapeo', 'Vista previa', 'Confirmar']

const CAMPOS: { key: keyof MapeoColumnas; label: string; requerido?: boolean }[] = [
  { key: 'codigo', label: 'Código' },
  { key: 'descripcion', label: 'Descripción', requerido: true },
  { key: 'unidad', label: 'Unidad' },
  { key: 'valor_unitario', label: 'Valor unitario', requerido: true },
  { key: 'capitulo', label: 'Capítulo' },
]

const estadoInicial = {
  paso: 1,
  clienteId: '',
  file: null as File | null,
  parseando: false,
  errorParseo: null as string | null,
  hojas: [] as HojaCruda[],
  seleccion: {} as Record<string, boolean>,
  mapeos: {} as Record<string, MapeoHoja>,
  hojaActiva: '',
  // Metadatos de la LPU (paso 5)
  nombre: '',
  vigenciaDesde: '',
  vigenciaHasta: '',
  moneda: 'COP',
  importando: false,
}

/** Construye los mapeos iniciales por hoja: reutiliza mapeo guardado del cliente
 *  si coincide el nombre de hoja, si no aplica heurísticas. */
function inicializarMapeos(
  hojasSel: HojaCruda[],
  cliente: Cliente | null,
  previos: Record<string, MapeoHoja>,
): Record<string, MapeoHoja> {
  const guardadas = (cliente?.mapeos_lpu_guardados ?? []).flatMap(m => m.hojas)
  const out: Record<string, MapeoHoja> = {}
  for (const h of hojasSel) {
    if (previos[h.nombre]) { out[h.nombre] = previos[h.nombre]; continue }
    const guardada = guardadas.find(g => g.nombre_hoja === h.nombre)
    if (guardada) { out[h.nombre] = { ...guardada, es_lpu: true }; continue }
    const fila = detectarFilaEncabezado(h)
    const columnas = sugerirMapeoColumnas(h, fila)
    out[h.nombre] = {
      nombre_hoja: h.nombre,
      es_lpu: true,
      fila_encabezado: fila,
      categoria: h.nombre,
      columnas,
      origen_capitulo: sugerirOrigenCapitulo(h, columnas, fila),
    }
  }
  return out
}

function fmt(n: number): string {
  return n.toLocaleString('es-CO')
}

export default function ImportarLpuWizard({ isOpen, onClose, clientes, lpus, onImportado, clienteIdInicial }: ImportarLpuWizardProps) {
  const [st, setSt] = useState(estadoInicial)
  const { user } = useAuth()
  const { importar, progreso } = useImportarLpu()

  useEffect(() => {
    if (isOpen) setSt({ ...estadoInicial, clienteId: clienteIdInicial ?? '' })
  }, [isOpen, clienteIdInicial])

  const cliente = clientes.find(c => c.id === st.clienteId) || null
  const lpuVigente = st.clienteId
    ? lpus.find(l => l.cliente_id === st.clienteId && l.estado === 'vigente') || null
    : null
  const hojasSel = useMemo(
    () => st.hojas.filter(h => st.seleccion[h.nombre]),
    [st.hojas, st.seleccion],
  )
  const hojaActivaObj = st.hojas.find(h => h.nombre === st.hojaActiva) || null

  // Resultado por hoja activa (paso 3) y consolidado (paso 4).
  const resultadoActiva = useMemo(() => {
    if (!hojaActivaObj || !st.mapeos[st.hojaActiva]) return null
    return procesarHoja(hojaActivaObj, st.mapeos[st.hojaActiva])
  }, [hojaActivaObj, st.hojaActiva, st.mapeos])

  const consolidado = useMemo(() => {
    if (st.paso < 4) return null
    return consolidar(hojasSel.map(h => procesarHoja(h, st.mapeos[h.nombre])))
  }, [st.paso, hojasSel, st.mapeos])

  if (!isOpen) return null

  const cargarArchivo = async (file: File) => {
    setSt(s => ({ ...s, file, parseando: true, errorParseo: null, hojas: [], seleccion: {}, mapeos: {} }))
    try {
      const hojas = await leerLibro(file)
      if (hojas.length === 0) {
        setSt(s => ({ ...s, parseando: false, errorParseo: 'El archivo no tiene hojas legibles.' }))
        return
      }
      const seleccion: Record<string, boolean> = {}
      for (const h of hojas) seleccion[h.nombre] = pareceListaDePrecios(h)
      setSt(s => ({ ...s, parseando: false, hojas, seleccion }))
    } catch {
      setSt(s => ({ ...s, parseando: false, errorParseo: 'No se pudo leer el archivo. ¿Es un Excel (.xlsx/.xls) válido?' }))
    }
  }

  const toggleHoja = (nombre: string) =>
    setSt(s => ({ ...s, seleccion: { ...s.seleccion, [nombre]: !s.seleccion[nombre] } }))

  const setMapeo = (hoja: string, patch: Partial<MapeoHoja>) =>
    setSt(s => ({ ...s, mapeos: { ...s.mapeos, [hoja]: { ...s.mapeos[hoja], ...patch } } }))

  const setColumna = (hoja: string, campo: keyof MapeoColumnas, idx: number | null) =>
    setSt(s => ({
      ...s,
      mapeos: { ...s.mapeos, [hoja]: { ...s.mapeos[hoja], columnas: { ...s.mapeos[hoja].columnas, [campo]: idx } } },
    }))

  const mapeoOk = (m: MapeoHoja | undefined) =>
    !!m && m.columnas.descripcion != null && m.columnas.valor_unitario != null

  const puedeAvanzar =
    st.paso === 1 ? !!st.clienteId && st.hojas.length > 0 && !st.parseando :
    st.paso === 2 ? hojasSel.length > 0 :
    st.paso === 3 ? hojasSel.every(h => mapeoOk(st.mapeos[h.nombre])) :
    st.paso === 4 ? !!consolidado && consolidado.totalItems > 0 :
    false

  const avanzar = () => setSt(s => {
    const next = Math.min(s.paso + 1, PASOS.length)
    if (s.paso === 2 && next === 3) {
      const sel = s.hojas.filter(h => s.seleccion[h.nombre])
      return { ...s, paso: next, mapeos: inicializarMapeos(sel, cliente, s.mapeos), hojaActiva: sel[0]?.nombre ?? '' }
    }
    if (s.paso === 4 && next === 5 && !s.nombre.trim()) {
      return { ...s, paso: next, nombre: `LPU ${cliente?.nombre ?? ''}`.trim() }
    }
    return { ...s, paso: next }
  })
  const retroceder = () => setSt(s => ({ ...s, paso: Math.max(s.paso - 1, 1) }))

  const handleImportar = async () => {
    if (!cliente || !st.file || !consolidado || !st.nombre.trim()) return

    // Fechas de vigencia: un Timestamp de Firestore admite años 1..9999. Validar
    // para evitar un `invalid-argument` opaco al escribir (ej. un año mal tecleado).
    const toTs = (s: string): Timestamp | null | false => {
      if (!s) return null
      const d = new Date(s)
      const y = d.getFullYear()
      if (Number.isNaN(d.getTime()) || y < 1900 || y > 9999) return false
      return Timestamp.fromDate(d)
    }
    const tsDesde = toTs(st.vigenciaDesde)
    const tsHasta = toTs(st.vigenciaHasta)
    if (tsDesde === false || tsHasta === false) {
      toast('Revisa las fechas de vigencia: el año debe estar entre 1900 y 9999.', 'error')
      return
    }
    const vigencia = (tsDesde || tsHasta) ? { desde: tsDesde, hasta: tsHasta } : undefined

    setSt(s => ({ ...s, importando: true }))
    try {
      await importar({
        cliente,
        file: st.file,
        nombre: st.nombre.trim(),
        vigencia,
        moneda: st.moneda,
        items: consolidado.items,
        categorias: consolidado.categorias,
        mapeos: st.mapeos,
        uid: user?.uid,
      })
      toast('LPU importada correctamente')
      onImportado()
      onClose()
    } catch (e) {
      console.error('Error importando LPU:', e)
      toast('Error al importar la LPU', 'error')
      setSt(s => ({ ...s, importando: false }))
    }
  }

  const mapeoActivo = st.mapeos[st.hojaActiva]
  const headerActiva = hojaActivaObj && mapeoActivo ? (hojaActivaObj.filas[mapeoActivo.fila_encabezado] ?? []) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        {/* Header + stepper */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Importar lista de precios (LPU)</h2>
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition" aria-label="Cerrar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ol className="flex items-center gap-2 mt-4 text-xs flex-wrap">
            {PASOS.map((label, i) => {
              const n = i + 1
              const activo = n === st.paso
              const hecho = n < st.paso
              return (
                <li key={label} className="flex items-center gap-2">
                  <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
                    activo ? 'bg-brand-700 text-white' : hecho ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
                  }`}>{n}</span>
                  <span className={activo ? 'text-gray-800 font-medium' : 'text-gray-400'}>{label}</span>
                  {n < PASOS.length && <span className="text-gray-300 mx-1">›</span>}
                </li>
              )
            })}
          </ol>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* PASO 1 */}
          {st.paso === 1 && (
            <div className="space-y-5">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Cliente <span className="text-red-500">*</span></label>
                <select
                  value={st.clienteId}
                  onChange={e => setSt(s => ({ ...s, clienteId: e.target.value }))}
                  disabled={!!clienteIdInicial}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="" disabled>Selecciona un cliente…</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Archivo Excel <span className="text-red-500">*</span></label>
                <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand-400 transition">
                  <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-sm text-gray-600">{st.file ? st.file.name : 'Haz clic para elegir un archivo .xlsx / .xls'}</span>
                  <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) cargarArchivo(f) }} />
                </label>
                {st.parseando && <p className="text-xs text-gray-500">Leyendo archivo…</p>}
                {st.errorParseo && <p className="text-xs text-red-600">{st.errorParseo}</p>}
                {st.hojas.length > 0 && !st.parseando && (
                  <p className="text-xs text-brand-700">{st.hojas.length} hoja(s) detectada(s).</p>
                )}
              </div>

              {cliente && cliente.mapeos_lpu_guardados.length > 0 && (
                <div className="rounded-lg bg-brand-50 border border-brand-100 px-4 py-3 text-xs text-brand-800">
                  Este cliente tiene {cliente.mapeos_lpu_guardados.length} mapeo(s) guardado(s); se aplicarán automáticamente a las hojas que coincidan.
                </div>
              )}
            </div>
          )}

          {/* PASO 2 */}
          {st.paso === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Marca las hojas que son <span className="font-medium">listas de precios</span>. Las demás se ignoran.</p>
              <div className="space-y-2">
                {st.hojas.map(h => {
                  const marcada = !!st.seleccion[h.nombre]
                  const sugerida = pareceListaDePrecios(h)
                  return (
                    <label key={h.nombre} className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition ${marcada ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={marcada} onChange={() => toggleHoja(h.nombre)} className="w-4 h-4 accent-brand-700" />
                      <span className="flex-1 text-sm font-medium text-gray-800">{h.nombre}</span>
                      <span className="text-xs text-gray-400">{h.filas.length} fila(s)</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sugerida ? 'bg-lime-100 text-lime-800' : 'bg-gray-100 text-gray-500'}`}>
                        {sugerida ? 'parece LPU' : 'no parece LPU'}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* PASO 3 — Mapeo por hoja */}
          {st.paso === 3 && mapeoActivo && hojaActivaObj && (
            <div className="space-y-4">
              {/* Tabs de hojas */}
              <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
                {hojasSel.map(h => (
                  <button key={h.nombre} onClick={() => setSt(s => ({ ...s, hojaActiva: h.nombre }))}
                    className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
                      h.nombre === st.hojaActiva ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {h.nombre}
                  </button>
                ))}
              </div>

              {/* Selector de fila de encabezado */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Fila de encabezado</p>
                <p className="text-xs text-gray-500 mb-2">Haz clic en la fila que contiene los títulos de columna.</p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {hojaActivaObj.filas.slice(0, 8).map((fila, i) => (
                    <button key={i} onClick={() => setMapeo(st.hojaActiva, { fila_encabezado: i })}
                      className={`w-full text-left px-3 py-1.5 text-xs flex gap-2 transition ${
                        i === mapeoActivo.fila_encabezado ? 'bg-brand-50 text-brand-800' : 'hover:bg-gray-50 text-gray-600'
                      }`}>
                      <span className="text-gray-400 flex-shrink-0 w-6">{i + 1}</span>
                      <span className="truncate">{fila.filter(c => c !== null && c !== '').map(c => String(c)).join(' | ') || '(vacía)'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mapeo de columnas */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Columnas</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CAMPOS.map(campo => (
                    <div key={campo.key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600">
                        {campo.label}{campo.requerido && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      <select
                        value={mapeoActivo.columnas[campo.key] ?? ''}
                        onChange={e => setColumna(st.hojaActiva, campo.key, e.target.value === '' ? null : Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                      >
                        {!campo.requerido && <option value="">(ninguna)</option>}
                        {Array.from({ length: hojaActivaObj.numColumnas }).map((_, c) => (
                          <option key={c} value={c}>
                            {letraColumna(c)} · {String(headerActiva[c] ?? '').trim() || '—'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Categoría + origen de capítulo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Categoría (agrupador)</label>
                  <input value={mapeoActivo.categoria} onChange={e => setMapeo(st.hojaActiva, { categoria: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Origen del capítulo</label>
                  <select value={mapeoActivo.origen_capitulo}
                    onChange={e => setMapeo(st.hojaActiva, { origen_capitulo: e.target.value as MapeoHoja['origen_capitulo'] })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                    <option value="ninguno">Sin capítulos</option>
                    <option value="filas_sin_precio">Filas de título sin precio</option>
                    <option value="columna">Columna de capítulo</option>
                  </select>
                </div>
              </div>

              {/* Mini preview de la hoja activa */}
              {resultadoActiva && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs">
                  <p className="text-gray-700 mb-2">
                    <span className="font-semibold text-brand-700">{resultadoActiva.items.length}</span> ítem(s) ·{' '}
                    <span className="font-semibold text-amber-700">{resultadoActiva.descartadas.length}</span> descartada(s) ·{' '}
                    <span className="font-semibold text-gray-600">{resultadoActiva.capitulos.length}</span> capítulo(s)
                  </p>
                  {resultadoActiva.items.slice(0, 3).map((it, i) => (
                    <div key={i} className="text-gray-600 truncate">
                      {it.codigo && <span className="font-mono text-gray-400 mr-1">{it.codigo}</span>}
                      {it.descripcion} · <span className="text-gray-500">{it.unidad}</span> · ${fmt(it.valor_unitario)}
                      {it.capitulo && <span className="text-gray-400"> — {it.capitulo}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PASO 4 — Vista previa consolidada */}
          {st.paso === 4 && consolidado && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 p-3 text-center">
                  <p className="text-2xl font-bold text-brand-700">{fmt(consolidado.totalItems)}</p>
                  <p className="text-xs text-gray-500">ítems válidos</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{fmt(consolidado.totalDescartadas)}</p>
                  <p className="text-xs text-gray-500">filas descartadas</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-600">{fmt(consolidado.totalCapitulos)}</p>
                  <p className="text-xs text-gray-500">capítulos</p>
                </div>
              </div>

              {(consolidado.descartadasPorMotivo.precio_invalido > 0 || consolidado.descartadasPorMotivo.sin_descripcion > 0) && (
                <p className="text-xs text-gray-500">
                  Descartes: {consolidado.descartadasPorMotivo.precio_invalido} por precio inválido, {consolidado.descartadasPorMotivo.sin_descripcion} sin descripción.
                </p>
              )}

              {consolidado.codigosDuplicados.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  ⚠ {consolidado.codigosDuplicados.length} código(s) duplicado(s): {consolidado.codigosDuplicados.slice(0, 8).join(', ')}
                  {consolidado.codigosDuplicados.length > 8 && '…'}
                </div>
              )}

              {/* Tabla de ítems (primeros 50) */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-gray-500">
                        <th className="px-3 py-2 font-semibold">Código</th>
                        <th className="px-3 py-2 font-semibold">Descripción</th>
                        <th className="px-3 py-2 font-semibold">Und</th>
                        <th className="px-3 py-2 font-semibold text-right">Valor</th>
                        <th className="px-3 py-2 font-semibold">Categoría / Capítulo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consolidado.items.slice(0, 50).map((it, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 font-mono text-gray-500">{it.codigo || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-800">{it.descripcion}</td>
                          <td className="px-3 py-1.5 text-gray-500">{it.unidad || '—'}</td>
                          <td className="px-3 py-1.5 text-right text-gray-700">${fmt(it.valor_unitario)}</td>
                          <td className="px-3 py-1.5 text-gray-400">{it.categoria}{it.capitulo ? ` · ${it.capitulo}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {consolidado.totalItems > 50 && (
                  <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
                    Mostrando 50 de {fmt(consolidado.totalItems)} ítems.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PASO 5 — Confirmar y escribir */}
          {st.paso === 5 && consolidado && (
            <div className="space-y-4">
              {st.importando ? (
                <div className="py-10 text-center space-y-3">
                  <p className="text-sm font-medium text-gray-700">{progreso?.fase ?? 'Importando'}…</p>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-600 transition-all" style={{ width: `${progreso?.pct ?? 0}%` }} />
                  </div>
                  <p className="text-xs text-gray-400">No cierres esta ventana.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg bg-brand-50 border border-brand-100 px-4 py-3 text-sm text-brand-800">
                    Se importarán <span className="font-semibold">{fmt(consolidado.totalItems)}</span> ítems
                    para <span className="font-semibold">{cliente?.nombre}</span>.
                  </div>

                  {lpuVigente && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                      ⚠ Este cliente ya tiene una LPU vigente («{lpuVigente.nombre}», v{lpuVigente.version}).
                      Al importar, esa pasará a <span className="font-semibold">histórica</span> y esta será la v{lpuVigente.version + 1}.
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Nombre de la LPU <span className="text-red-500">*</span></label>
                    <input value={st.nombre} onChange={e => setSt(s => ({ ...s, nombre: e.target.value }))}
                      placeholder="Ej: LPU 2026"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600">Vigencia desde</label>
                      <input type="date" value={st.vigenciaDesde} onChange={e => setSt(s => ({ ...s, vigenciaDesde: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600">Vigencia hasta</label>
                      <input type="date" value={st.vigenciaHasta} onChange={e => setSt(s => ({ ...s, vigenciaHasta: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600">Moneda</label>
                      <input value={st.moneda} onChange={e => setSt(s => ({ ...s, moneda: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    Se guardará el Excel original y el mapeo de columnas usado (para reutilizarlo en futuras importaciones de este cliente).
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} disabled={st.importando}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition disabled:opacity-40">Cancelar</button>
          <div className="flex gap-3">
            <button onClick={retroceder} disabled={st.paso === 1 || st.importando}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-40">Atrás</button>
            {st.paso < 5 ? (
              <button onClick={avanzar} disabled={!puedeAvanzar}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white transition disabled:opacity-40">Siguiente</button>
            ) : (
              <button onClick={handleImportar} disabled={st.importando || !st.nombre.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white transition disabled:opacity-40">
                {st.importando ? 'Importando…' : 'Importar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
