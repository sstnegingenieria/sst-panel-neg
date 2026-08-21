// Pestaña de ECONOMÍA de una licitación (1.4).
//
// ⚠ Este componente NO se monta si el rol no la puede ver. El gate está en el
// llamador (`veEconomiaLicitacionUI`), no acá dentro: para
// `operacion_comercial` la pestaña sencillamente no existe — ni deshabilitada,
// ni con un cartel de "sin acceso". Un placeholder ya revelaría que el
// análisis existe y que alguien lo mira, que es lo que la segregación evita.
//
// El backstop real son las reglas: `licitaciones/{id}/economia` con
// `veEconomiaLicitacion()`, sin delete (soft-delete, restricción 5.1).
import { useCallback, useEffect, useState } from 'react'
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import TextField from '../../shared/TextField'
import { fmtMoney } from '../../../utils/sigp/formato'

/** Doc fijo de la subcolección: un análisis por licitación. */
const DOC_ANALISIS = 'analisis'

interface Analisis {
  costo_estimado?: number
  margen_objetivo_pct?: number
  techo_oferta?: number
  notas?: string
  actualizado_por?: string
  actualizado_en?: Timestamp
}

const num = (s: string): number | undefined => {
  const t = s.replace(/[.\s$%]/g, '').replace(',', '.')
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export default function EconomiaLicitacion({
  licitacionId, puedeEditar,
}: { licitacionId: string; puedeEditar: boolean }) {
  const { user } = useAuth()
  const [datos, setDatos] = useState<Analisis | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [costo, setCosto] = useState('')
  const [margen, setMargen] = useState('')
  const [techo, setTecho] = useState('')
  const [notas, setNotas] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const s = await getDoc(doc(db, 'licitaciones', licitacionId, 'economia', DOC_ANALISIS))
      const d = s.exists() ? (s.data() as Analisis) : null
      setDatos(d)
      setCosto(d?.costo_estimado != null ? String(d.costo_estimado) : '')
      setMargen(d?.margen_objetivo_pct != null ? String(d.margen_objetivo_pct) : '')
      setTecho(d?.techo_oferta != null ? String(d.techo_oferta) : '')
      setNotas(d?.notas ?? '')
    } catch {
      // Un 403 acá no debería pasar (el gate de UI ya filtró), pero si pasa
      // se degrada sin filtrar información: no se dice qué había.
      setDatos(null)
    } finally { setCargando(false) }
  }, [licitacionId])

  useEffect(() => { void cargar() }, [cargar])

  const guardar = async () => {
    if (!user?.uid) return
    setGuardando(true)
    try {
      const payload: Analisis = {
        ...(num(costo) !== undefined ? { costo_estimado: num(costo) } : {}),
        ...(num(margen) !== undefined ? { margen_objetivo_pct: num(margen) } : {}),
        ...(num(techo) !== undefined ? { techo_oferta: num(techo) } : {}),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
        actualizado_por: user.uid,
        actualizado_en: Timestamp.now(),
      }
      // `setDoc` con merge: la subcolección admite create y update, no delete.
      await setDoc(doc(db, 'licitaciones', licitacionId, 'economia', DOC_ANALISIS), payload, { merge: true })
      toast('Análisis económico guardado')
      await cargar()
    } catch {
      toast('No se pudo guardar el análisis', 'error')
    } finally { setGuardando(false) }
  }

  if (cargando) return <p className="text-sm text-gray-500">Cargando análisis…</p>

  return (
    <section className="bg-white border border-gray-300 rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Análisis económico</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Reservado a dirección y proyectos. No es visible para quien arma la propuesta.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TextField label="Costo estimado" value={costo} onChange={setCosto}
          inputMode="decimal" disabled={!puedeEditar} placeholder="—" />
        <TextField label="Margen objetivo (%)" value={margen} onChange={setMargen}
          inputMode="decimal" disabled={!puedeEditar} placeholder="—" />
        <TextField label="Techo de oferta" value={techo} onChange={setTecho}
          inputMode="decimal" disabled={!puedeEditar}
          placeholder="—" hint="Por debajo de esto no se baja." />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
        <textarea
          value={notas} onChange={e => setNotas(e.target.value)} rows={3}
          disabled={!puedeEditar}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50
                     focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
        />
      </div>

      {datos?.techo_oferta != null && (
        <p className="text-xs text-gray-600">
          Techo vigente: <strong>{fmtMoney(datos.techo_oferta)}</strong>
          {datos.actualizado_por ? ` · última edición por ${datos.actualizado_por}` : ''}
        </p>
      )}

      {puedeEditar && (
        <button
          onClick={guardar} disabled={guardando}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar análisis'}
        </button>
      )}
    </section>
  )
}
