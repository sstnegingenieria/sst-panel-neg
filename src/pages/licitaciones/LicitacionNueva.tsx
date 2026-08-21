// Alta manual de una licitación (1.4).
//
// Dos cosas que este formulario hace y conviene no perder de vista:
//
//  · El SEMÁFORO se calcula al guardar con `calcularSemaforo()` y se estampa
//    junto con `SEMAFORO_VERSION`. No se teclea: si alguien pudiera elegirlo,
//    el criterio dejaría de ser un criterio.
//  · NO se pide consecutivo. El proceso nace en `detectada` con
//    `consecutivo: ''` — el LIC se quema al entrar en `en_preparacion`, que es
//    donde NEG se compromete con horas (contigüidad ISO, invariante 6).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timestamp, addDoc, collection } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import TextField from '../../components/shared/TextField'
import SelectField from '../../components/shared/SelectField'
import {
  MODALIDADES_LICITACION, MODALIDAD_LICITACION_LABEL,
  ORIGENES_LICITACION,
} from '../../types/sigp/licitacion'
import type { ModalidadLicitacion, OrigenLicitacion } from '../../types/sigp/licitacion'
import { calcularSemaforo } from '../../utils/sigp/semaforo'
import { SEMAFORO_CHIP } from '../../utils/sigp/bandejaLicitaciones'
import { evaluarVentana, isoLocal } from '../../utils/sigp/ventanaLicitacion'
import { useConfigLicitaciones } from '../../hooks/sigp/useLicitaciones'
import { MOTIVO_SEMAFORO_LABEL } from '../../types/sigp/licitacion'

/** 'YYYY-MM-DD' → Timestamp al mediodía UTC (evita el corrimiento de día). */
const aTs = (iso: string): Timestamp | null =>
  iso ? Timestamp.fromDate(new Date(`${iso}T12:00:00Z`)) : null

const num = (s: string): number => {
  const t = s.replace(/[.\s$]/g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export default function LicitacionNueva() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { horasUtilesDia } = useConfigLicitaciones(true)
  const [guardando, setGuardando] = useState(false)

  const [f, setF] = useState({
    numero_proceso: '', id_secop: '', url_proceso: '', objeto: '',
    modalidad: 'minima_cuantia' as ModalidadLicitacion,
    origen: 'secop_ii' as OrigenLicitacion,
    presupuesto_oficial: '', lotes: '1', categoria_unspsc: '',
    entidad_nombre: '', entidad_nit: '', entidad_orden: '',
    entidad_departamento: '', entidad_ciudad: '',
    publicacion: '', manifestacion: '', sorteo: '', cierre: '',
    requiere_lectura: false, limitacion_mipyme: false,
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF(prev => ({ ...prev, [k]: v }))

  // Semáforo EN VIVO: se ve la consecuencia de la modalidad y del sorteo
  // mientras se escribe, no después de guardar.
  const preview = useMemo(() => calcularSemaforo({
    modalidad: f.modalidad,
    tiene_sorteo: f.sorteo !== '',
    limitacion_mipyme: f.limitacion_mipyme,
    departamento: f.entidad_departamento,
    requiere_lectura: f.requiere_lectura,
  }), [f.modalidad, f.sorteo, f.limitacion_mipyme, f.entidad_departamento, f.requiere_lectura])

  const ventana = useMemo(
    () => evaluarVentana(f.cierre || null, f.modalidad, isoLocal(new Date()), horasUtilesDia),
    [f.cierre, f.modalidad, horasUtilesDia],
  )

  const valido = f.numero_proceso.trim() !== '' && f.objeto.trim() !== ''

  const guardar = async () => {
    if (!user?.uid || !valido) return
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      const s = calcularSemaforo({
        modalidad: f.modalidad,
        tiene_sorteo: f.sorteo !== '',
        limitacion_mipyme: f.limitacion_mipyme,
        departamento: f.entidad_departamento,
        requiere_lectura: f.requiere_lectura,
      })
      const ref = await addDoc(collection(db, 'licitaciones'), {
        // Nace SIN número: el LIC se quema al materializar (invariante 6).
        consecutivo: '',
        numero_proceso: f.numero_proceso.trim(),
        id_secop: f.id_secop.trim() || null,
        origen: f.origen,
        url_proceso: f.url_proceso.trim(),
        entidad: {
          nombre: f.entidad_nombre.trim() || null,
          nit: f.entidad_nit.trim(),
          orden: f.entidad_orden.trim(),
          departamento: f.entidad_departamento.trim(),
          ciudad: f.entidad_ciudad.trim(),
        },
        objeto: f.objeto.trim(),
        categoria_unspsc: f.categoria_unspsc.trim() || null,
        modalidad: f.modalidad,
        presupuesto_oficial: num(f.presupuesto_oficial),
        lotes: Math.max(1, Math.floor(num(f.lotes) || 1)),
        cronograma: {
          publicacion: aTs(f.publicacion),
          manifestacion: aTs(f.manifestacion),
          sorteo: aTs(f.sorteo),
          cierre: aTs(f.cierre),
          adjudicacion: null,
        },
        semaforo: s.semaforo,
        semaforo_motivos: s.motivos,
        semaforo_version: s.version,
        semaforo_calculado_en: ahora,
        override_manual: null,
        estado: 'detectada',
        motivo_descarte: null,
        oferta_neg: null,
        oferta_ganador: null,
        ganador: null,
        manifestaciones: null,
        ofertas_recibidas: null,
        migrado: false,
        capacidad_manual: null,
        responsable_uid: user.uid,
        creado_por: user.uid,
        creado_en: ahora,
        actualizado_por: user.uid,
        actualizado_en: ahora,
        activa: true,
      })
      toast(`Proceso registrado — semáforo ${s.semaforo}`)
      navigate(`/licitaciones/${ref.id}`)
    } catch {
      toast('No se pudo registrar el proceso', 'error')
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-2xl font-display font-semibold text-gray-900">Registrar proceso</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Nace en <strong>detectada</strong> y sin consecutivo: el número LIC se asigna
          al entrar en preparación.
        </p>
      </header>

      <section className="bg-white border border-gray-300 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Proceso</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Número del proceso" value={f.numero_proceso} required
            onChange={v => set('numero_proceso', v)} placeholder="Ej.: MC-DNP-004-2026" />
          <TextField label="ID SECOP" value={f.id_secop}
            onChange={v => set('id_secop', v)} placeholder="Opcional" />
          <SelectField label="Modalidad" value={f.modalidad}
            onChange={v => set('modalidad', v as ModalidadLicitacion)}
            options={MODALIDADES_LICITACION.map(m => ({ value: m, label: MODALIDAD_LICITACION_LABEL[m] }))} />
          <SelectField label="Origen" value={f.origen}
            onChange={v => set('origen', v as OrigenLicitacion)}
            options={ORIGENES_LICITACION.map(o => ({ value: o, label: o }))} />
          <TextField label="Presupuesto oficial" value={f.presupuesto_oficial}
            onChange={v => set('presupuesto_oficial', v)} inputMode="decimal" placeholder="Ej.: 75.000.000" />
          <TextField label="Lotes" value={f.lotes} onChange={v => set('lotes', v)} inputMode="numeric" />
          <TextField label="Categoría UNSPSC" value={f.categoria_unspsc}
            onChange={v => set('categoria_unspsc', v)} placeholder="Opcional" />
          <TextField label="Enlace del proceso" value={f.url_proceso}
            onChange={v => set('url_proceso', v)} placeholder="https://…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Objeto <span className="text-red-500">*</span>
          </label>
          <textarea value={f.objeto} onChange={e => set('objeto', e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600" />
        </div>
      </section>

      <section className="bg-white border border-gray-300 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Entidad</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Nombre" value={f.entidad_nombre} onChange={v => set('entidad_nombre', v)} />
          <TextField label="NIT" value={f.entidad_nit} onChange={v => set('entidad_nit', v)} />
          <TextField label="Orden" value={f.entidad_orden} onChange={v => set('entidad_orden', v)}
            placeholder="Nacional / Territorial" />
          <TextField label="Departamento" value={f.entidad_departamento}
            onChange={v => set('entidad_departamento', v)}
            hint="Cuenta para la limitación MiPyme del criterio." />
          <TextField label="Ciudad" value={f.entidad_ciudad} onChange={v => set('entidad_ciudad', v)} />
        </div>
      </section>

      <section className="bg-white border border-gray-300 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Cronograma</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Publicación" value={f.publicacion} onChange={v => set('publicacion', v)} type="date" />
          <TextField label="Manifestación" value={f.manifestacion} onChange={v => set('manifestacion', v)} type="date" />
          <TextField label="Sorteo" value={f.sorteo} onChange={v => set('sorteo', v)} type="date"
            hint="Dejar vacío si el proceso no tiene sorteo." />
          <TextField label="Cierre" value={f.cierre} onChange={v => set('cierre', v)} type="date" />
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={f.limitacion_mipyme}
              onChange={e => set('limitacion_mipyme', e.target.checked)}
              className="w-4 h-4 accent-brand-700" />
            Limitado a MiPyme territorial
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={f.requiere_lectura}
              onChange={e => set('requiere_lectura', e.target.checked)}
              className="w-4 h-4 accent-brand-700" />
            El pliego exige lectura antes de decidir
          </label>
        </div>
      </section>

      {/* ── Semáforo en vivo ── */}
      <section className="bg-gray-50 border border-gray-300 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Cómo va a quedar</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded font-semibold ${SEMAFORO_CHIP[preview.semaforo]}`}>
            {preview.semaforo} · {preview.version}
          </span>
          {preview.motivos.map(m => (
            <span key={m} className="px-2 py-0.5 rounded bg-white border border-gray-300 text-gray-700">
              {MOTIVO_SEMAFORO_LABEL[m]}
            </span>
          ))}
          {preview.motivos.length === 0 && <span className="text-gray-500">sin banderas</span>}
          {f.cierre && (
            <span className={`px-2 py-0.5 rounded ${
              ventana.insuficiente ? 'bg-red-100 text-red-700 font-medium' : 'bg-white border border-gray-300 text-gray-600'
            }`}>
              {ventana.etiqueta}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          El semáforo lo calcula el criterio, no se elige. Un rojo no impide registrar
          el proceso: impide avanzarlo sin dejar escrito por qué.
        </p>
      </section>

      <div className="flex gap-2">
        <button onClick={guardar} disabled={!valido || guardando}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50">
          {guardando ? 'Registrando…' : 'Registrar proceso'}
        </button>
        <button onClick={() => navigate('/licitaciones')}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  )
}
