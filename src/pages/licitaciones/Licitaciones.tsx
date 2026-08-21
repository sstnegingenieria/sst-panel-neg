// Bandeja de Licitaciones (1.4) — tres secciones con estado en la URL
// (?seccion=, patrón de Tareas.tsx).
//
// La bandeja de Activas es una COLA CON TOPE: `configuracion/licitaciones
// .capacidad_semanal` (default 5). Lo que excede el tope se muestra abajo y
// atenuado — esconderlo daría la impresión de que no existe, y el trabajo que
// no cabe sigue existiendo. Para subir una hay que bajar otra, y el
// intercambio queda escrito en los DOS documentos.
//
// Todo lo que decide se calcula con los helpers PUROS de
// `utils/sigp/bandejaLicitaciones.ts` y `utils/sigp/ventanaLicitacion.ts`.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Timestamp, doc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import Modal from '../../components/shared/Modal'
import SelectField from '../../components/shared/SelectField'
import { useLicitaciones, useConfigLicitaciones } from '../../hooks/sigp/useLicitaciones'
import { gestionaLicitacionesUI } from '../../types/sigp/permisos'
import {
  MODALIDAD_LICITACION_LABEL, ESTADO_LICITACION_LABEL,
  MOTIVO_DESCARTE_LABEL, MOTIVOS_DESCARTE,
} from '../../types/sigp/licitacion'
import { probabilidadSorteo } from '../../utils/sigp/semaforo'
import type { MotivoDescarte } from '../../types/sigp/licitacion'
import {
  SECCIONES_BANDEJA, SECCION_LABEL, SEMAFORO_CHIP,
  seccionDe, ordenarPorCierre, repartirPorCapacidad, coincideBusqueda,
  contarSecciones, planIntercambioCupo, patchLiberarCupo,
} from '../../utils/sigp/bandejaLicitaciones'
import type { LicitacionConId, SeccionBandeja } from '../../utils/sigp/bandejaLicitaciones'
import { evaluarVentana, isoLocal, frasesSorteo } from '../../utils/sigp/ventanaLicitacion'
import { fmtMoney } from '../../utils/sigp/formato'

const fFecha = (ts: { toDate?: () => Date } | null | undefined): string => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
const isoDe = (ts: { toDate?: () => Date } | null | undefined): string | null => {
  const d = ts?.toDate?.()
  return d ? isoLocal(d) : null
}

export default function Licitaciones() {
  const { user } = useAuth()
  const puedeGestionar = gestionaLicitacionesUI(user?.rol)

  const [searchParams, setSearchParams] = useSearchParams()
  const [seccion, setSeccion] = useState<SeccionBandeja>(() => {
    const s = searchParams.get('seccion')
    return SECCIONES_BANDEJA.includes(s as SeccionBandeja) ? (s as SeccionBandeja) : 'activas'
  })
  const cambiarSeccion = (s: SeccionBandeja) => {
    setSeccion(s)
    const next = new URLSearchParams()
    if (s !== 'activas') next.set('seccion', s)
    setSearchParams(next, { replace: true })
  }

  const { licitaciones, cargando, error, recargar } = useLicitaciones(true)
  const { capacidad, horasUtilesDia } = useConfigLicitaciones(true)

  const [busqueda, setBusqueda] = useState('')
  const [filtroMotivo, setFiltroMotivo] = useState('')

  const hoy = useMemo(() => isoLocal(new Date()), [])
  const conteos = useMemo(() => contarSecciones(licitaciones), [licitaciones])

  const filtradas = useMemo(
    () => licitaciones.filter(l => seccionDe(l) === seccion && coincideBusqueda(l, busqueda)),
    [licitaciones, seccion, busqueda],
  )

  const reparto = useMemo(
    () => repartirPorCapacidad(seccion === 'activas' ? filtradas : [], capacidad),
    [filtradas, capacidad, seccion],
  )

  const descartadas = useMemo(() => {
    const base = seccion === 'descartadas' ? filtradas : []
    const f = filtroMotivo
      ? base.filter(l => l.motivo_descarte === filtroMotivo)
      : base
    return [...f].sort(ordenarPorCierre)
  }, [filtradas, seccion, filtroMotivo])

  const cerradas = useMemo(
    () => (seccion === 'cerradas' ? [...filtradas].sort(ordenarPorCierre) : []),
    [filtradas, seccion],
  )

  // ── Intercambio de cupo ──
  const [intercambio, setIntercambio] = useState<LicitacionConId | null>(null)
  const [saleId, setSaleId] = useState('')
  const [motivoInt, setMotivoInt] = useState('')
  const [guardando, setGuardando] = useState(false)

  const abrirIntercambio = (entra: LicitacionConId) => {
    setIntercambio(entra); setSaleId(''); setMotivoInt('')
  }

  const confirmarIntercambio = async () => {
    if (!intercambio || !user?.uid) return
    const sale = reparto.dentro.find(l => l.id === saleId)
    if (!sale) { toast('Elige cuál baja', 'error'); return }
    const plan = planIntercambioCupo(intercambio, sale, { uid: user.uid }, Timestamp.now(), motivoInt)
    if (!plan) { toast('El intercambio no es válido — revisa el motivo', 'error'); return }
    setGuardando(true)
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'licitaciones', plan.entra.id), plan.entra.patch)
      batch.update(doc(db, 'licitaciones', plan.sale.id), plan.sale.patch)
      await batch.commit()
      toast(`${intercambio.numero_proceso} entra en capacidad · ${sale.numero_proceso} sale`)
      setIntercambio(null)
      await recargar()
    } catch {
      toast('No se pudo registrar el intercambio', 'error')
    } finally { setGuardando(false) }
  }

  const liberar = async (l: LicitacionConId) => {
    if (!user?.uid) return
    const patch = patchLiberarCupo({ uid: user.uid }, Timestamp.now())
    if (!patch) return
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'licitaciones', l.id), patch)
      await batch.commit()
      toast('Cupo liberado — vuelve al orden por fecha de cierre')
      await recargar()
    } catch { toast('No se pudo liberar el cupo', 'error') }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-gray-900">Licitaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Procesos de contratación pública seguidos por NEG.
          </p>
        </div>
        {puedeGestionar && (
          <Link
            to="/licitaciones/nueva"
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold"
          >
            + Registrar proceso
          </Link>
        )}
      </header>

      {/* ── Pills de sección ── */}
      <div className="flex flex-wrap items-center gap-2">
        {SECCIONES_BANDEJA.map(s => (
          <button
            key={s}
            onClick={() => cambiarSeccion(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              seccion === s
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'bg-white border-gray-300 text-gray-600 hover:border-brand-600'
            }`}
          >
            {SECCION_LABEL[s]}
            <span className={`ml-1.5 ${seccion === s ? 'text-white/80' : 'text-gray-400'}`}>
              {conteos[s]}
            </span>
          </button>
        ))}
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por número, objeto o entidad…"
          className="ml-auto w-full sm:w-72 px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
        />
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}
      {cargando && <p className="text-sm text-gray-500">Cargando…</p>}

      {/* ══════════════════ ACTIVAS ══════════════════ */}
      {seccion === 'activas' && !cargando && (
        <div className="space-y-6">
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                En capacidad de la semana
                <span className="ml-2 font-normal text-gray-500">
                  {reparto.dentro.length} de {reparto.capacidad}
                </span>
              </h2>
              {reparto.dentro.length > reparto.capacidad && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                  Por encima del tope: hay {reparto.dentro.length - reparto.capacidad} fijada(s) a mano
                </span>
              )}
            </div>
            {reparto.dentro.length === 0
              ? <Vacio texto="Nada en capacidad esta semana." />
              : reparto.dentro.map(l => (
                  <Fila
                    key={l.id} l={l} hoy={hoy} horasUtilesDia={horasUtilesDia} enCapacidad
                    puedeGestionar={puedeGestionar}
                    onLiberar={l.capacidad_manual ? () => liberar(l) : undefined}
                  />
                ))}
          </section>

          {reparto.fuera.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-500">
                Fuera de capacidad
                <span className="ml-2 font-normal text-gray-400">{reparto.fuera.length}</span>
              </h2>
              <p className="text-xs text-gray-500">
                Siguen vivas. Para trabajar una hay que sacar otra de la capacidad —
                el intercambio queda registrado en los dos procesos.
              </p>
              {reparto.fuera.map(l => (
                <Fila
                  key={l.id} l={l} hoy={hoy} horasUtilesDia={horasUtilesDia} atenuada
                  puedeGestionar={puedeGestionar}
                  onSubir={puedeGestionar ? () => abrirIntercambio(l) : undefined}
                  onLiberar={l.capacidad_manual ? () => liberar(l) : undefined}
                />
              ))}
            </section>
          )}

          {reparto.frenadas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-500">
                Frenadas por el semáforo
                <span className="ml-2 font-normal text-gray-400">{reparto.frenadas.length}</span>
              </h2>
              <p className="text-xs text-gray-500">
                En rojo. No ocupan cupo — se abren para leer por qué, y desde ahí
                se puede decidir trabajarlas de todos modos.
              </p>
              {reparto.frenadas.map(l => (
                <Fila key={l.id} l={l} hoy={hoy} horasUtilesDia={horasUtilesDia} atenuada puedeGestionar={puedeGestionar} />
              ))}
            </section>
          )}
        </div>
      )}

      {/* ══════════════════ DESCARTADAS ══════════════════ */}
      {seccion === 'descartadas' && !cargando && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">Motivo:</span>
            <button
              onClick={() => setFiltroMotivo('')}
              className={`px-2.5 py-1 rounded-full text-xs border ${
                filtroMotivo === '' ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-300 text-gray-600'
              }`}
            >Todos</button>
            {MOTIVOS_DESCARTE.map(m => {
              const n = licitaciones.filter(l => seccionDe(l) === 'descartadas' && l.motivo_descarte === m).length
              if (n === 0) return null
              return (
                <button
                  key={m}
                  onClick={() => setFiltroMotivo(filtroMotivo === m ? '' : m)}
                  className={`px-2.5 py-1 rounded-full text-xs border ${
                    filtroMotivo === m ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-300 text-gray-600'
                  }`}
                >{MOTIVO_DESCARTE_LABEL[m]} <span className="opacity-60">{n}</span></button>
              )
            })}
          </div>
          {descartadas.length === 0
            ? <Vacio texto="Sin descartadas con ese filtro." />
            : descartadas.map(l => <Fila key={l.id} l={l} hoy={hoy} horasUtilesDia={horasUtilesDia} puedeGestionar={puedeGestionar} />)}
        </div>
      )}

      {/* ══════════════════ CERRADAS ══════════════════ */}
      {seccion === 'cerradas' && !cargando && (
        <div className="space-y-2">
          {cerradas.length === 0
            ? <Vacio texto="Sin procesos cerrados." />
            : cerradas.map(l => <Fila key={l.id} l={l} hoy={hoy} horasUtilesDia={horasUtilesDia} puedeGestionar={puedeGestionar} />)}
        </div>
      )}

      {/* ── Modal de intercambio ── */}
      <Modal
        isOpen={!!intercambio}
        title="Subir a la capacidad de la semana"
        onClose={() => setIntercambio(null)}
        size="md"
        actions={[
          { label: 'Cancelar', onClick: () => setIntercambio(null), variant: 'secondary' },
          {
            label: guardando ? 'Registrando…' : 'Intercambiar',
            onClick: confirmarIntercambio,
            variant: 'primary',
            disabled: guardando || !saleId || !motivoInt.trim(),
          },
        ]}
      >
        {intercambio && (
          <div className="space-y-4 text-sm">
            <p className="text-gray-700">
              Entra <strong>{intercambio.numero_proceso}</strong>. La capacidad es de{' '}
              <strong>{reparto.capacidad}</strong> a la semana, así que alguna tiene que salir.
            </p>
            <SelectField
              label="¿Cuál baja?"
              value={saleId}
              onChange={setSaleId}
              options={[
                { value: '', label: 'Elegir…' },
                ...reparto.dentro.map(l => ({
                  value: l.id,
                  label: `${l.numero_proceso} — cierra ${fFecha(l.cronograma.cierre)}`,
                })),
              ]}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ¿Por qué este cambio? <span className="text-red-600">*</span>
              </label>
              <textarea
                value={motivoInt}
                onChange={e => setMotivoInt(e.target.value)}
                rows={3}
                placeholder="Ej.: cierra antes y el pliego ya está leído"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Queda escrito en los dos procesos. Sin motivo no se puede intercambiar.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="p-6 text-center text-sm text-gray-500 bg-white border border-gray-200 rounded-lg">
      {texto}
    </div>
  )
}

interface FilaProps {
  l: LicitacionConId
  hoy: string
  /** Viene de `configuracion/licitaciones` — el reloj de ventana lo necesita. */
  horasUtilesDia: number
  enCapacidad?: boolean
  atenuada?: boolean
  puedeGestionar: boolean
  onSubir?: () => void
  onLiberar?: () => void
}

function Fila({ l, hoy, horasUtilesDia, enCapacidad, atenuada, onSubir, onLiberar }: FilaProps) {
  const ventana = evaluarVentana(isoDe(l.cronograma.cierre), l.modalidad, hoy, horasUtilesDia)
  const haySorteo = l.cronograma.sorteo !== null
  const sorteo = haySorteo ? frasesSorteo(l.manifestaciones, probabilidadSorteo(l.manifestaciones)) : null

  return (
    <div className={`bg-white border rounded-lg p-3 ${atenuada ? 'border-gray-200 opacity-70' : 'border-gray-300'}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <Link
          to={`/licitaciones/${l.id}`}
          className="font-mono text-sm font-semibold text-brand-700 hover:underline"
        >
          {l.consecutivo || l.numero_proceso}
        </Link>
        {l.consecutivo && (
          <span className="font-mono text-xs text-gray-500">{l.numero_proceso}</span>
        )}
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${SEMAFORO_CHIP[l.semaforo]}`}>
          {l.semaforo}
        </span>
        <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700">
          {ESTADO_LICITACION_LABEL[l.estado]}
        </span>
        <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600">
          {MODALIDAD_LICITACION_LABEL[l.modalidad]}
        </span>
        {l.migrado && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-500" title="Registro histórico importado: sin consecutivo de la serie LIC">
            histórico
          </span>
        )}
        {l.override_manual && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-orange-100 text-orange-800"
            title={`${l.override_manual.motivo}`}>
            trabajada con override
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onLiberar && (
            <button onClick={onLiberar}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
              title="Quitar la fijación manual y volver al orden por fecha de cierre">
              liberar cupo
            </button>
          )}
          {onSubir && (
            <button onClick={onSubir}
              className="px-2.5 py-1 rounded border border-brand-600 text-brand-700 text-xs font-medium hover:bg-brand-50">
              Subir a capacidad
            </button>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-sm text-gray-800 line-clamp-2">{l.objeto || '—'}</p>
      <p className="text-xs text-gray-500">
        {l.entidad.nombre ?? 'Entidad sin registrar'}
        {l.entidad.ciudad ? ` · ${l.entidad.ciudad}` : ''}
        {l.presupuesto_oficial > 0 ? ` · ${fmtMoney(l.presupuesto_oficial)}` : ''}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-gray-500">Cierra {fFecha(l.cronograma.cierre)}</span>
        {enCapacidad && (
          <span className={`px-2 py-0.5 rounded font-medium ${
            ventana.insuficiente ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {ventana.insuficiente ? '⏱ ' : ''}{ventana.etiqueta}
          </span>
        )}
        {sorteo && (
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
            🎲 {sorteo}
          </span>
        )}
        {l.estado === 'descartada' && l.motivo_descarte && (
          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
            {MOTIVO_DESCARTE_LABEL[l.motivo_descarte as MotivoDescarte]}
          </span>
        )}
        {l.capacidad_manual && (
          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600"
            title={l.capacidad_manual.motivo}>
            {l.capacidad_manual.en_capacidad ? 'subida a mano' : 'bajada a mano'}
          </span>
        )}
      </div>
    </div>
  )
}
