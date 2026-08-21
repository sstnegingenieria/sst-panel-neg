// Detalle de una licitación (1.4).
//
// Lo que este archivo tiene que hacer bien, por orden de importancia:
//
//  1. EL ROJO INFORMADO. Cuando el semáforo frena por MODALIDAD_SIN_HISTORIAL,
//     el usuario ve el texto de `limitaciones` del registro de versiones
//     LEÍDO DE FIRESTORE — que dice, entre otras cosas, que en 2023 la menor
//     cuantía produjo tres adjudicaciones. Un rojo sin ese contexto es una
//     orden; con él, es un dato para decidir.
//  2. LA CAPTURA AL PRESENTAR. Los tres datos (oferta, manifestaciones,
//     ofertas recibidas) solo existen en ese momento. Sin ellos no hay
//     `pctNeg`, ni `probabilidadSorteo`, ni con qué calibrar una v1.1.
//  3. LA CONFIDENCIALIDAD. Para `operacion_comercial` la pestaña de economía
//     NO EXISTE — ni deshabilitada, ni con un cartel de "sin acceso".
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import { gestionaLicitacionesUI, veEconomiaLicitacionUI } from '../../types/sigp/permisos'
import {
  ESTADO_LICITACION_LABEL, MODALIDAD_LICITACION_LABEL,
  MOTIVO_DESCARTE_LABEL, MOTIVO_SEMAFORO_LABEL,
  TRANSICIONES_LICITACION,
  patchAvanzarLicitacion, patchDescartarLicitacion, patchReabrirLicitacion,
  patchOverrideSemaforo, patchPresentarLicitacion, patchCerrarConResultado,
  exigeConsecutivo, pctNeg, pctGanador,
} from '../../types/sigp/licitacion'
import type { EstadoLicitacion, Licitacion } from '../../types/sigp/licitacion'
import { probabilidadSorteo } from '../../utils/sigp/semaforo'
import { SEMAFORO_CHIP } from '../../utils/sigp/bandejaLicitaciones'
import {
  evaluarVentana, isoLocal, frasesSorteo, REFERENCIA_OFERTA, fueraDeBanda,
} from '../../utils/sigp/ventanaLicitacion'
import { useCriterioSemaforo, useConfigLicitaciones } from '../../hooks/sigp/useLicitaciones'
import { useConsecutivo } from '../../hooks/sigp/useConsecutivo'
import { fmtMoney, fmtNum } from '../../utils/sigp/formato'
import EconomiaLicitacion from '../../components/sigp/licitaciones/EconomiaLicitacion'
import AdjuntosLicitacion from '../../components/sigp/licitaciones/AdjuntosLicitacion'
import ModalPresentar from '../../components/sigp/licitaciones/ModalPresentar'
import ModalResultado from '../../components/sigp/licitaciones/ModalResultado'
import ModalOverride from '../../components/sigp/licitaciones/ModalOverride'
import ModalDescartar from '../../components/sigp/licitaciones/ModalDescartar'

type LicDoc = Licitacion & { id: string }

const fFecha = (ts: { toDate?: () => Date } | null | undefined): string => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
}
const isoDe = (ts: { toDate?: () => Date } | null | undefined): string | null => {
  const d = ts?.toDate?.()
  return d ? isoLocal(d) : null
}

export default function LicitacionDetalle() {
  const { licitacionId } = useParams<{ licitacionId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { obtener } = useConsecutivo()
  const { horasUtilesDia } = useConfigLicitaciones(true)

  const puedeGestionar = gestionaLicitacionesUI(user?.rol)
  const veEconomia = veEconomiaLicitacionUI(user?.rol)

  const [lic, setLic] = useState<LicDoc | null>(null)
  const [cargando, setCargando] = useState(true)
  const [aplicando, setAplicando] = useState(false)
  const [tab, setTab] = useState<'proceso' | 'economia'>('proceso')

  const cargar = async () => {
    if (!licitacionId) return
    setCargando(true)
    try {
      const s = await getDoc(doc(db, 'licitaciones', licitacionId))
      setLic(s.exists() ? ({ id: s.id, ...s.data() } as LicDoc) : null)
    } catch {
      toast('No se pudo cargar la licitación', 'error')
      setLic(null)
    } finally { setCargando(false) }
  }
  useEffect(() => { void cargar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [licitacionId])

  // El texto del criterio se lee del REGISTRO, no del bundle.
  const { limitaciones, definicion } = useCriterioSemaforo(!!lic, lic?.semaforo_version ?? null)

  const [modal, setModal] = useState<'presentar' | 'resultado' | 'override' | 'descartar' | null>(null)
  const [destinoResultado, setDestinoResultado] = useState<'adjudicada' | 'perdida'>('adjudicada')

  const hoy = useMemo(() => isoLocal(new Date()), [])

  if (cargando) return <p className="text-sm text-gray-500">Cargando…</p>
  if (!lic) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">No se encontró la licitación.</p>
        <Link to="/licitaciones" className="text-sm text-brand-700 hover:underline">← Volver a la bandeja</Link>
      </div>
    )
  }

  const ventana = evaluarVentana(isoDe(lic.cronograma.cierre), lic.modalidad, hoy, horasUtilesDia)
  const haySorteo = lic.cronograma.sorteo !== null
  const rojoPorModalidad = lic.semaforo === 'rojo'
    && lic.semaforo_motivos.includes('MODALIDAD_SIN_HISTORIAL')
  const salidas = TRANSICIONES_LICITACION[lic.estado] ?? []

  const persistir = async (patch: Record<string, unknown> | null, ok: string) => {
    if (!patch) { toast('El movimiento no es válido desde este estado', 'error'); return false }
    setAplicando(true)
    try {
      await updateDoc(doc(db, 'licitaciones', lic.id), patch)
      toast(ok)
      await cargar()
      return true
    } catch {
      toast('No se pudo guardar', 'error')
      return false
    } finally { setAplicando(false) }
  }

  /** Avance simple. A `en_preparacion` quema el LIC en el MISMO patch. */
  const avanzar = async (destino: EstadoLicitacion) => {
    if (!user?.uid) return
    const ahora = Timestamp.now()
    let consecutivo: string | undefined
    if (exigeConsecutivo(destino, lic.migrado) && lic.consecutivo === '') {
      try {
        consecutivo = await obtener('LIC')
      } catch {
        toast('No se pudo generar el consecutivo — reintenta', 'error')
        return
      }
    }
    const patch = patchAvanzarLicitacion(
      lic, destino, { uid: user.uid }, ahora,
      consecutivo ? { consecutivo } : undefined,
    )
    await persistir(patch, consecutivo
      ? `${consecutivo} · ${ESTADO_LICITACION_LABEL[destino]}`
      : ESTADO_LICITACION_LABEL[destino])
  }

  return (
    <div className="space-y-5">
      <Link to="/licitaciones" className="text-sm text-brand-700 hover:underline">← Bandeja</Link>

      {/* ── Encabezado ── */}
      <header className="bg-white border border-gray-300 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-semibold text-gray-900">
            {lic.consecutivo || lic.numero_proceso}
          </h1>
          {lic.consecutivo && (
            <span className="font-mono text-sm text-gray-500">{lic.numero_proceso}</span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${SEMAFORO_CHIP[lic.semaforo]}`}>
            {lic.semaforo}
          </span>
          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
            {ESTADO_LICITACION_LABEL[lic.estado]}
          </span>
          {lic.migrado && (
            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500"
              title="Histórico importado del registro CM-FT-CPG-26 — sin consecutivo de la serie LIC">
              histórico
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-800">{lic.objeto || '—'}</p>
        <p className="text-xs text-gray-500 mt-1">
          {lic.entidad.nombre ?? 'Entidad sin registrar'}
          {lic.entidad.orden ? ` · ${lic.entidad.orden}` : ''}
          {lic.entidad.ciudad ? ` · ${lic.entidad.ciudad}` : ''}
        </p>
        {lic.url_proceso && (
          <a href={lic.url_proceso} target="_blank" rel="noreferrer"
            className="text-xs text-brand-700 hover:underline">Ver en SECOP ↗</a>
        )}
      </header>

      {/* ── Pestañas: economía SOLO si la puede ver (ni placeholder si no) ── */}
      {veEconomia && (
        <div className="flex gap-1 border-b border-gray-200">
          {(['proceso', 'economia'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t === 'proceso' ? 'Proceso' : 'Economía'}
            </button>
          ))}
        </div>
      )}

      {veEconomia && tab === 'economia' ? (
        <EconomiaLicitacion licitacionId={lic.id} puedeEditar={puedeGestionar} />
      ) : (
        <div className="space-y-5">
          {/* ══ EL ROJO INFORMADO ══ */}
          {rojoPorModalidad && (
            <section className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-red-800">
                El criterio {lic.semaforo_version} frena este proceso
              </h2>
              <p className="text-sm text-red-900">
                Motivo: <strong>{MOTIVO_SEMAFORO_LABEL.MODALIDAD_SIN_HISTORIAL}</strong>
                {' — '}es {MODALIDAD_LICITACION_LABEL[lic.modalidad].toLowerCase()}.
              </p>
              {definicion && (
                <p className="text-xs text-red-800/90">
                  <span className="font-medium">Qué dice el criterio:</span> {definicion}
                </p>
              )}
              {/* Leído de `configuracion/semaforo_versiones`, no del bundle. */}
              {limitaciones ? (
                <div className="bg-white/70 border border-red-200 rounded p-3">
                  <p className="text-xs font-semibold text-red-800 mb-1">
                    Antes de decidir, lo que el criterio NO cubre:
                  </p>
                  <p className="text-xs text-red-900 leading-relaxed">{limitaciones}</p>
                </div>
              ) : (
                <p className="text-xs text-red-700/80">
                  No se pudo leer el registro del criterio ({lic.semaforo_version}).
                  El rojo se sostiene, pero sin sus límites a la vista.
                </p>
              )}
              {puedeGestionar && !lic.override_manual && (
                <button
                  onClick={() => setModal('override')}
                  className="px-3 py-1.5 rounded border border-red-400 text-red-800 text-sm font-medium hover:bg-red-100"
                >
                  Trabajar de todos modos
                </button>
              )}
            </section>
          )}

          {lic.override_manual && (
            <section className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-orange-900">Decisión manual registrada</h2>
              <p className="text-sm text-orange-900 mt-1">{lic.override_manual.motivo}</p>
              <p className="text-xs text-orange-800/80 mt-1">
                Semáforo anterior: {lic.override_manual.semaforo_anterior} · por {lic.override_manual.por} ·{' '}
                {fFecha(lic.override_manual.en)}
              </p>
            </section>
          )}

          {/* ── Semáforo y ventana ── */}
          <section className="bg-white border border-gray-300 rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">Semáforo y ventana</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded font-semibold ${SEMAFORO_CHIP[lic.semaforo]}`}>
                {lic.semaforo} · {lic.semaforo_version}
              </span>
              {lic.semaforo_motivos.map(m => (
                <span key={m} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {MOTIVO_SEMAFORO_LABEL[m]}
                </span>
              ))}
              {lic.semaforo_motivos.length === 0 && (
                <span className="text-gray-500">sin banderas</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs pt-1">
              <span className={`px-2 py-0.5 rounded ${
                ventana.insuficiente ? 'bg-red-100 text-red-700 font-medium' : 'bg-gray-100 text-gray-600'
              }`}>
                {ventana.insuficiente ? '⏱ ' : ''}{ventana.etiqueta}
              </span>
              {haySorteo && (
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  🎲 {frasesSorteo(lic.manifestaciones, probabilidadSorteo(lic.manifestaciones))}
                </span>
              )}
            </div>
            {ventana.insuficiente && !ventana.vencida && (
              <p className="text-xs text-gray-500">
                Es una advertencia, no un bloqueo: el sistema no sabe cómo está tu semana.
              </p>
            )}
          </section>

          {/* ── Datos del proceso ── */}
          <section className="bg-white border border-gray-300 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Datos del proceso</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Dato k="Modalidad" v={MODALIDAD_LICITACION_LABEL[lic.modalidad]} />
              <Dato k="Presupuesto oficial" v={lic.presupuesto_oficial > 0 ? fmtMoney(lic.presupuesto_oficial) : '—'} />
              <Dato k="Lotes" v={String(lic.lotes)} />
              <Dato k="Origen" v={lic.origen} />
              <Dato k="ID SECOP" v={lic.id_secop ?? '—'} />
              <Dato k="UNSPSC" v={lic.categoria_unspsc ?? '—'} />
              <Dato k="Departamento" v={lic.entidad.departamento || '—'} />
              <Dato k="NIT entidad" v={lic.entidad.nit || '—'} />
            </dl>
          </section>

          {/* ── Cronograma ── */}
          <section className="bg-white border border-gray-300 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Cronograma</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Dato k="Publicación" v={fFecha(lic.cronograma.publicacion)} />
              <Dato k="Manifestación" v={fFecha(lic.cronograma.manifestacion)} />
              <Dato k="Sorteo" v={lic.cronograma.sorteo ? fFecha(lic.cronograma.sorteo) : 'sin sorteo'} />
              <Dato k="Cierre" v={fFecha(lic.cronograma.cierre)} />
              <Dato k="Adjudicación" v={fFecha(lic.cronograma.adjudicacion)} />
            </dl>
          </section>

          {/* ── Resultado ── */}
          {(lic.oferta_neg !== null || lic.oferta_ganador !== null || lic.manifestaciones !== null) && (
            <section className="bg-white border border-gray-300 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Oferta y resultado</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Dato k="Oferta NEG" v={lic.oferta_neg !== null ? fmtMoney(lic.oferta_neg) : '—'} />
                <Dato k="% del oficial (NEG)" v={pctNeg(lic) !== null ? `${fmtNum(pctNeg(lic)!)} %` : '—'} />
                <Dato k="Oferta ganadora" v={lic.oferta_ganador !== null ? fmtMoney(lic.oferta_ganador) : '—'} />
                <Dato k="% del oficial (ganador)" v={pctGanador(lic) !== null ? `${fmtNum(pctGanador(lic)!)} %` : '—'} />
                <Dato k="Ganador" v={lic.ganador?.nombre ?? '—'} />
                <Dato k="Manifestaciones" v={lic.manifestaciones !== null ? String(lic.manifestaciones) : '—'} />
                <Dato k="Ofertas recibidas" v={lic.ofertas_recibidas !== null ? String(lic.ofertas_recibidas) : '—'} />
              </dl>
            </section>
          )}

          {lic.estado === 'descartada' && lic.motivo_descarte && (
            <section className="bg-gray-50 border border-gray-300 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-800">Descartada</h2>
              <p className="text-sm text-gray-700 mt-1">
                {MOTIVO_DESCARTE_LABEL[lic.motivo_descarte]}
              </p>
              {lic.consecutivo && (
                <p className="text-xs text-gray-500 mt-1">
                  Conserva su consecutivo {lic.consecutivo}: el número ya se había quemado.
                </p>
              )}
            </section>
          )}

          {/* ── Adjuntos ── */}
          <AdjuntosLicitacion licitacionId={lic.id} puedeSubir={puedeGestionar} />

          {/* ── Acciones ── */}
          {puedeGestionar && salidas.length > 0 && (
            <section className="bg-white border border-gray-300 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">¿Qué sigue?</h2>
              <div className="flex flex-wrap gap-2">
                {salidas.map(destino => {
                  if (destino === 'descartada') {
                    return (
                      <button key={destino} disabled={aplicando}
                        onClick={() => setModal('descartar')}
                        className="px-3 py-1.5 rounded border border-gray-400 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50">
                        Descartar
                      </button>
                    )
                  }
                  if (destino === 'presentada') {
                    return (
                      <button key={destino} disabled={aplicando}
                        onClick={() => setModal('presentar')}
                        className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
                        Marcar presentada
                      </button>
                    )
                  }
                  if (destino === 'adjudicada' || destino === 'perdida') {
                    return (
                      <button key={destino} disabled={aplicando}
                        onClick={() => { setDestinoResultado(destino); setModal('resultado') }}
                        className="px-3 py-1.5 rounded border border-gray-400 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50">
                        {ESTADO_LICITACION_LABEL[destino]}
                      </button>
                    )
                  }
                  return (
                    <button key={destino} disabled={aplicando}
                      onClick={() => avanzar(destino)}
                      className="px-3 py-1.5 rounded border border-gray-400 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50">
                      {lic.estado === 'descartada' ? 'Reabrir' : ESTADO_LICITACION_LABEL[destino]}
                    </button>
                  )
                })}
              </div>
              {lic.semaforo === 'rojo' && !lic.override_manual
                && (salidas.includes('en_preparacion') || salidas.includes('presentada')) && (
                <p className="text-xs text-red-700 mt-2">
                  En rojo, avanzar a preparación/presentación está frenado hasta que
                  quede escrito por qué se trabaja igual.
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {/* ── Modales ── */}
      <ModalPresentar
        abierto={modal === 'presentar'} lic={lic}
        onCerrar={() => setModal(null)}
        onConfirmar={async datos => {
          if (!user?.uid) return
          const ok = await persistir(
            patchPresentarLicitacion(lic, { uid: user.uid }, Timestamp.now(), datos),
            'Presentada — datos de competencia registrados',
          )
          if (ok) setModal(null)
        }}
      />
      <ModalResultado
        abierto={modal === 'resultado'} lic={lic} destino={destinoResultado}
        onCerrar={() => setModal(null)}
        onConfirmar={async datos => {
          if (!user?.uid) return
          const ok = await persistir(
            patchCerrarConResultado(lic, destinoResultado, { uid: user.uid }, Timestamp.now(), datos),
            ESTADO_LICITACION_LABEL[destinoResultado],
          )
          if (ok) setModal(null)
        }}
      />
      <ModalOverride
        abierto={modal === 'override'} lic={lic} limitaciones={limitaciones}
        onCerrar={() => setModal(null)}
        onConfirmar={async motivo => {
          if (!user?.uid) return
          const ok = await persistir(
            // El semáforo SIGUE en rojo: el override no lo blanquea, autoriza
            // avanzar con el rojo puesto (invariante 3 del 1.1).
            patchOverrideSemaforo(lic, { uid: user.uid }, Timestamp.now(), {
              semaforo: 'rojo', motivo,
            }),
            'Queda registrado por qué se trabaja en rojo',
          )
          if (ok) setModal(null)
        }}
      />
      <ModalDescartar
        abierto={modal === 'descartar'}
        onCerrar={() => setModal(null)}
        onConfirmar={async motivo => {
          if (!user?.uid) return
          const ok = await persistir(
            patchDescartarLicitacion(lic, { uid: user.uid }, Timestamp.now(), motivo),
            'Descartada',
          )
          if (ok) { setModal(null); navigate('/licitaciones?seccion=descartadas') }
        }}
      />
      {/* Reabrir no tiene modal: es la única marcha atrás y no pide nada. */}
      {puedeGestionar && lic.estado === 'descartada' && (
        <button
          disabled={aplicando}
          onClick={() => user?.uid && persistir(
            patchReabrirLicitacion(lic, { uid: user.uid }, Timestamp.now()),
            'Reabierta en evaluación',
          )}
          className="px-3 py-1.5 rounded border border-gray-400 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Reabrir en evaluación
        </button>
      )}
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{k}</dt>
      <dd className="text-gray-900">{v}</dd>
    </div>
  )
}

export { REFERENCIA_OFERTA, fueraDeBanda }
