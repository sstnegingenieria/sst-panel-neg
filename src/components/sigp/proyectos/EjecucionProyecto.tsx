// Bloque "Ejecución → Entrega → Soporte del cliente → Facturación" (F2.1.d).
//
// Registro SIMPLE (MVP) de Gerencia de Proyectos hasta el HANDOFF a
// Administrativa: iniciar ejecución, marcar ejecutado con evidencia
// fotográfica, registrar la entrega, capturar el soporte que emite el
// cliente (con verificación de que concuerda con lo ejecutado) y enviar a
// facturación. De ahí en adelante sigue Gerencia Administrativa (módulo
// futuro): factura, pago del cliente y saldo del contratista.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import { TIPOS_SOPORTE, TIPO_SOPORTE_LABEL, entregablesIhsFaltantes } from '../../../types/sigp/proyecto'
import type { Proyecto, TipoSoporte, FotoEvidencia, EstadoProyecto } from '../../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

export default function EjecucionProyecto({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const [aplicando, setAplicando] = useState(false)
  // ejecutado
  const [notaEjec, setNotaEjec] = useState('')
  const [fotos, setFotos] = useState<FileList | null>(null)
  const [formEjec, setFormEjec] = useState(false)
  // entrega
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [notaEntrega, setNotaEntrega] = useState('')
  const [formEntrega, setFormEntrega] = useState(false)
  // soporte del cliente
  const [tipoSoporte, setTipoSoporte] = useState<TipoSoporte>('orden_compra')
  const [numeroSoporte, setNumeroSoporte] = useState('')
  const [fechaSoporte, setFechaSoporte] = useState('')
  const [adjuntoSoporte, setAdjuntoSoporte] = useState<File | null>(null)
  const [concuerda, setConcuerda] = useState(false)
  const [notaSoporte, setNotaSoporte] = useState('')
  const [formSoporte, setFormSoporte] = useState(false)

  const est = proyecto.estado
  const visible = proyecto.ejecucion || ['anticipo_girado', 'en_ejecucion', 'ejecutado', 'entregado_cliente', 'soporte_recibido', 'enviado_a_facturacion'].includes(est)

  const transicion = async (de: EstadoProyecto, a: EstadoProyecto, motivo: string, extra: Record<string, unknown> = {}) => {
    const ahora = Timestamp.now()
    await updateDoc(doc(db, 'proyectos', proyecto.id), {
      ...extra,
      estado: a,
      fecha_actualizacion: ahora,
      historial: arrayUnion({ de, a, por: user?.uid ?? '', fecha: ahora, motivo }),
    })
    await reload()
  }

  const iniciar = async () => {
    if (!window.confirm('¿Iniciar la ejecución del proyecto?')) return
    setAplicando(true)
    try {
      await transicion('anticipo_girado', 'en_ejecucion', 'Ejecución iniciada', {
        ejecucion: { fecha_inicio: Timestamp.now(), iniciada_por: user?.uid ?? '' },
      })
      toast('Ejecución iniciada')
    } catch { toast('Error al iniciar la ejecución', 'error') } finally { setAplicando(false) }
  }

  const marcarEjecutado = async () => {
    if (!fotos?.length) return   // evidencia fotográfica obligatoria
    setAplicando(true)
    try {
      const subidas: FotoEvidencia[] = []
      for (const f of Array.from(fotos)) {
        const nombre = `${Date.now()}_${f.name}`
        const snap = await uploadBytes(ref(storage, `proyectos/${proyecto.id}/ejecucion/${nombre}`), f)
        subidas.push({ url: await getDownloadURL(snap.ref), nombre: f.name })
      }
      await transicion('en_ejecucion', 'ejecutado', `Trabajos ejecutados — ${subidas.length} foto(s) de evidencia`, {
        ejecucion: {
          ...(proyecto.ejecucion ?? {}),
          fecha_ejecutado: Timestamp.now(), ejecutado_por: user?.uid ?? '',
          ...(notaEjec.trim() ? { nota: notaEjec.trim() } : {}),
          fotos: subidas,
        },
      })
      toast('Proyecto marcado como ejecutado')
      setFormEjec(false)
    } catch { toast('Error al registrar la ejecución', 'error') } finally { setAplicando(false) }
  }

  const registrarEntrega = async () => {
    if (!fechaEntrega) return
    setAplicando(true)
    try {
      await transicion('ejecutado', 'entregado_cliente', 'Trabajos entregados al cliente', {
        entrega: {
          fecha: Timestamp.fromDate(new Date(fechaEntrega + 'T12:00:00')),
          ...(notaEntrega.trim() ? { nota: notaEntrega.trim() } : {}),
          registrada_por: user?.uid ?? '',
        },
      })
      toast('Entrega registrada')
      setFormEntrega(false)
    } catch { toast('Error al registrar la entrega', 'error') } finally { setAplicando(false) }
  }

  const registrarSoporte = async () => {
    if (!numeroSoporte.trim() || !fechaSoporte || !concuerda) return
    setAplicando(true)
    try {
      let adjunto = {}
      if (adjuntoSoporte) {
        const nombre = `${Date.now()}_${adjuntoSoporte.name}`
        const snap = await uploadBytes(ref(storage, `proyectos/${proyecto.id}/soporte/${nombre}`), adjuntoSoporte)
        adjunto = { adjunto_url: await getDownloadURL(snap.ref), adjunto_nombre: adjuntoSoporte.name }
      }
      await transicion('entregado_cliente', 'soporte_recibido',
        `Soporte del cliente: ${TIPO_SOPORTE_LABEL[tipoSoporte]} ${numeroSoporte.trim()} — verificado contra lo ejecutado`, {
          soporte_cliente: {
            tipo: tipoSoporte, numero: numeroSoporte.trim(),
            fecha: Timestamp.fromDate(new Date(fechaSoporte + 'T12:00:00')),
            concuerda: true,
            ...(notaSoporte.trim() ? { nota: notaSoporte.trim() } : {}),
            ...adjunto,
            registrado_por: user?.uid ?? '',
          },
        })
      toast('Soporte del cliente registrado')
      setFormSoporte(false)
    } catch { toast('Error al registrar el soporte', 'error') } finally { setAplicando(false) }
  }

  const enviarAFacturacion = async () => {
    if (!window.confirm('¿Enviar a facturación? El proyecto pasa a manos de Gerencia Administrativa (factura, pago del cliente y saldo del contratista).')) return
    setAplicando(true)
    try {
      await transicion('soporte_recibido', 'enviado_a_facturacion', 'Enviado a facturación — handoff a Gerencia Administrativa')
      toast('Enviado a facturación')
    } catch { toast('Error al enviar a facturación', 'error') } finally { setAplicando(false) }
  }

  if (!visible) {
    return (
      <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-400">Ejecución</p>
        <p className="text-xs text-gray-400 mt-1">Disponible tras el giro del anticipo.</p>
      </div>
    )
  }

  const e = proyecto.ejecucion
  const paso = (titulo: string, hecho: boolean, contenido: ReactNode) => (
    <div className={`rounded-lg border p-3 ${hecho ? 'border-emerald-100 bg-emerald-50/40' : 'border-gray-100'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 text-gray-400">
        {hecho ? '✓ ' : ''}{titulo}
      </p>
      {contenido}
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ejecución y entrega</p>

      {/* 1 · Ejecución */}
      {paso('1 · Ejecución', !!e?.fecha_ejecutado, (
        <div className="space-y-2 text-xs text-gray-600">
          {!e && est === 'anticipo_girado' && puedeGestionar && (
            <button onClick={iniciar} disabled={aplicando}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
              ▶ Iniciar ejecución
            </button>
          )}
          {e && <p>Iniciada el {fFecha(e.fecha_inicio)}{e.fecha_ejecutado && <> · ejecutado el {fFecha(e.fecha_ejecutado)}</>}</p>}
          {e?.nota && <p className="bg-gray-50 rounded px-2 py-1.5">{e.nota}</p>}
          {!!e?.fotos?.length && (
            <div className="flex flex-wrap gap-1.5">
              {e.fotos.map(f => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer"
                  className="text-brand-700 underline underline-offset-2">📷 {f.nombre}</a>
              ))}
            </div>
          )}
          {est === 'en_ejecucion' && puedeGestionar && !formEjec && (
            <button onClick={() => setFormEjec(true)}
              className="text-sm px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
              ✓ Registrar ejecutado
            </button>
          )}
          {formEjec && (
            <div className="space-y-2 bg-gray-50 rounded-lg p-3">
              <label className="block text-xs text-gray-500">
                Evidencia fotográfica (obligatoria — puedes elegir varias)
                <input type="file" accept="image/*" multiple onChange={ev => setFotos(ev.target.files)}
                  className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
              </label>
              <textarea value={notaEjec} onChange={ev => setNotaEjec(ev.target.value)} rows={2}
                placeholder="Nota de la ejecución (opcional)"
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
              <div className="flex gap-2">
                <button onClick={marcarEjecutado} disabled={!fotos?.length || aplicando}
                  className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
                  {aplicando ? 'Registrando…' : 'Marcar ejecutado'}
                </button>
                <button onClick={() => setFormEjec(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-400">Registro simple — el avance por actividad y el informe fotográfico automático llegan en F2.3.</p>
        </div>
      ))}

      {/* 2 · Entrega al cliente — en preventivos exige los 3 entregables IHS */}
      {paso('2 · Entrega al cliente', !!proyecto.entrega, (
        <div className="space-y-2 text-xs text-gray-600">
          {proyecto.entrega && (
            <p>Entregado el {fFecha(proyecto.entrega.fecha)}{proyecto.entrega.nota && <> · {proyecto.entrega.nota}</>}</p>
          )}
          {est === 'ejecutado' && puedeGestionar && !formEntrega && (() => {
            const faltantes = entregablesIhsFaltantes(proyecto)
            return faltantes.length > 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
                <p className="font-semibold">Para registrar la entrega faltan los entregables IHS:</p>
                <ul className="list-disc pl-4 mt-0.5">{faltantes.map(f => <li key={f}>{f}</li>)}</ul>
                <p className="mt-1 text-[11px]">Adjúntalos en la sección "Entregables IHS" de esta ficha.</p>
              </div>
            ) : (
              <button onClick={() => setFormEntrega(true)}
                className="text-sm px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
                📦 Registrar entrega
              </button>
            )
          })()}
          {formEntrega && (
            <div className="space-y-2 bg-gray-50 rounded-lg p-3">
              <label className="block text-xs text-gray-500">
                Fecha de entrega
                <input type="date" value={fechaEntrega} onChange={ev => setFechaEntrega(ev.target.value)}
                  className="mt-1 w-full sm:w-56 text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </label>
              <textarea value={notaEntrega} onChange={ev => setNotaEntrega(ev.target.value)} rows={2}
                placeholder="Nota de la entrega (opcional)"
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
              <div className="flex gap-2">
                <button onClick={registrarEntrega} disabled={!fechaEntrega || aplicando}
                  className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
                  {aplicando ? 'Registrando…' : 'Registrar'}
                </button>
                <button onClick={() => setFormEntrega(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* 3 · Soporte del cliente */}
      {paso('3 · Soporte del cliente', !!proyecto.soporte_cliente, (
        <div className="space-y-2 text-xs text-gray-600">
          {proyecto.soporte_cliente && (
            <>
              <p>
                {TIPO_SOPORTE_LABEL[proyecto.soporte_cliente.tipo]} <span className="font-mono font-semibold">{proyecto.soporte_cliente.numero}</span> · {fFecha(proyecto.soporte_cliente.fecha)}
                <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">✓ Concuerda con lo ejecutado</span>
              </p>
              {proyecto.soporte_cliente.adjunto_url && (
                <a href={proyecto.soporte_cliente.adjunto_url} target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2">
                  📎 {proyecto.soporte_cliente.adjunto_nombre ?? 'Soporte'}
                </a>
              )}
              {proyecto.soporte_cliente.nota && <p className="bg-gray-50 rounded px-2 py-1.5">{proyecto.soporte_cliente.nota}</p>}
            </>
          )}
          {est === 'entregado_cliente' && puedeGestionar && !formSoporte && (
            <button onClick={() => setFormSoporte(true)}
              className="text-sm px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
              🧾 Registrar soporte del cliente
            </button>
          )}
          {formSoporte && (
            <div className="space-y-2 bg-gray-50 rounded-lg p-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="text-xs text-gray-500">
                  Tipo de soporte
                  <select value={tipoSoporte} onChange={ev => setTipoSoporte(ev.target.value as TipoSoporte)}
                    className="mt-1 w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300">
                    {TIPOS_SOPORTE.map(t => <option key={t} value={t}>{TIPO_SOPORTE_LABEL[t]}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  Número
                  <input value={numeroSoporte} onChange={ev => setNumeroSoporte(ev.target.value)} placeholder="Ej: OC-4512"
                    className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                </label>
                <label className="text-xs text-gray-500">
                  Fecha
                  <input type="date" value={fechaSoporte} onChange={ev => setFechaSoporte(ev.target.value)}
                    className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                </label>
              </div>
              <label className="block text-xs text-gray-500">
                Adjunto del soporte
                <input type="file" onChange={ev => setAdjuntoSoporte(ev.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
              </label>
              <textarea value={notaSoporte} onChange={ev => setNotaSoporte(ev.target.value)} rows={2} placeholder="Nota (opcional)"
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={concuerda} onChange={ev => setConcuerda(ev.target.checked)} className="mt-0.5" />
                <span>Verifiqué que el soporte <span className="font-semibold">concuerda con lo ejecutado</span> (alcance y valores).</span>
              </label>
              <div className="flex gap-2">
                <button onClick={registrarSoporte} disabled={!numeroSoporte.trim() || !fechaSoporte || !concuerda || aplicando}
                  className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
                  {aplicando ? 'Registrando…' : 'Registrar soporte'}
                </button>
                <button onClick={() => setFormSoporte(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* 4 · Handoff a facturación */}
      {paso('4 · Facturación (Gerencia Administrativa)', est === 'enviado_a_facturacion', (
        <div className="space-y-2 text-xs text-gray-600">
          {est === 'soporte_recibido' && puedeGestionar && (
            <button onClick={enviarAFacturacion} disabled={aplicando}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
              → Enviar a facturación
            </button>
          )}
          {est === 'enviado_a_facturacion' ? (
            <div className="bg-gray-100 rounded-lg px-3 py-2.5 text-gray-600">
              <p className="font-semibold">En manos de Gerencia Administrativa</p>
              <p className="mt-0.5">Factura, pago del cliente y saldo del contratista se gestionan en el módulo administrativo (futuro). Aquí termina el alcance de Gerencia de Proyectos.</p>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">
              Al enviar, el proyecto pasa a Gerencia Administrativa: factura → pago del cliente → saldo del contratista (módulo futuro; el saldo exige pago del cliente registrado).
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
