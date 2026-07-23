// Compras/reembolsos del contratista (Administrativa · Bloque 3b).
//
// MODELO NEG: la preliquidación es MANO DE OBRA (NEG compra los materiales).
// Cuando el contratista compra algo y NEG se lo reconoce, va aquí — LÍNEA
// PROPIA, separada de la mano de obra. Las capturan los GESTORES durante el
// proyecto (con traza en historial); la LIQUIDACIÓN de Gerencia
// Administrativa las reconoce en el total final.
import { useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import InputExpresion from '../cotizaciones/InputExpresion'
import { fmtMoney } from '../../../utils/sigp/formato'
import { totalComprasReembolsos, ESTADOS_PROYECTO } from '../../../types/sigp/proyecto'
import type { Proyecto, CompraReembolso } from '../../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void> | void
}

export default function ComprasReembolsos({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const compras = proyecto.compras_reembolsos ?? []
  const [form, setForm] = useState(false)
  const [concepto, setConcepto] = useState('')
  const [valor, setValor] = useState<number | undefined>(undefined)
  const [soporte, setSoporte] = useState<File | null>(null)
  const [aplicando, setAplicando] = useState(false)

  // Se capturan durante el proyecto; tras liquidar, la lista queda congelada
  // (la liquidación tomó su snapshot).
  const cerrado = ESTADOS_PROYECTO.indexOf(proyecto.estado) >= ESTADOS_PROYECTO.indexOf('liquidado_contratista')
  // Sin compras y sin permiso de captura: la sección no aporta — no se pinta.
  if (compras.length === 0 && (!puedeGestionar || cerrado)) return null

  const agregar = async () => {
    if (!concepto.trim() || !valor || valor <= 0) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      let adjunto: Pick<CompraReembolso, 'soporte_url' | 'soporte_nombre'> = {}
      if (soporte) {
        const nombre = `${Date.now()}-${soporte.name}`.replace(/[^\w.\-]/g, '_')
        const snap = await uploadBytes(ref(storage, `proyectos/${proyecto.id}/compras/${nombre}`), soporte)
        adjunto = { soporte_url: await getDownloadURL(snap.ref), soporte_nombre: soporte.name }
      }
      const compra: CompraReembolso = {
        concepto: concepto.trim(), valor, registrado_por: user?.uid ?? '', fecha: ahora, ...adjunto,
      }
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        compras_reembolsos: arrayUnion(compra),
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: proyecto.estado, a: proyecto.estado, por: user?.uid ?? '', fecha: ahora,
          motivo: `Compra/reembolso del contratista registrada — ${compra.concepto}: ${fmtMoney(valor)} (línea separada de la mano de obra; se reconoce en la liquidación)`,
        }),
      })
      toast('Compra/reembolso registrada — se reconocerá en la liquidación')
      setForm(false); setConcepto(''); setValor(undefined); setSoporte(null)
      await reload()
    } catch {
      toast('Error al registrar la compra/reembolso', 'error')
    } finally { setAplicando(false) }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-800">Compras y reembolsos del contratista</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Línea separada de la mano de obra (NEG compra los materiales; lo que el contratista
            compra y se le reconoce va aquí). Se liquida junto con la mano de obra.
          </p>
        </div>
        {puedeGestionar && !cerrado && !form && (
          <button onClick={() => setForm(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
            ＋ Registrar compra/reembolso
          </button>
        )}
      </div>

      {compras.length > 0 && (
        <div className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {compras.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="text-gray-800">{c.concepto}</span>
                <span className="block text-[11px] text-gray-400">
                  {fFecha(c.fecha)}
                  {c.soporte_url && (
                    <> · <a href={c.soporte_url} target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2">📎 {c.soporte_nombre ?? 'soporte'}</a></>
                  )}
                </span>
              </div>
              <span className="font-mono font-semibold text-gray-800 shrink-0">{fmtMoney(c.valor)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 text-sm bg-gray-50 rounded-b-lg">
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Total compras/reembolsos</span>
            <span className="font-mono font-bold text-gray-900">{fmtMoney(totalComprasReembolsos(compras))}</span>
          </div>
        </div>
      )}

      {form && (
        <div className="mt-4 border border-brand-200 bg-brand-50/40 rounded-lg p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="font-medium text-gray-700">Concepto <span className="text-red-500">*</span></span>
              <input value={concepto} onChange={e => setConcepto(e.target.value)}
                placeholder="Ej: tornillería galvanizada para la torre"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">Valor <span className="text-red-500">*</span></span>
              <InputExpresion valor={valor} onValor={setValor}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
          <label className="text-sm block">
            <span className="font-medium text-gray-700">Soporte (factura/recibo, opcional)</span>
            <input type="file" accept=".pdf,image/*" onChange={e => setSoporte(e.target.files?.[0] ?? null)}
              className="mt-1 block text-xs text-gray-600" />
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setForm(false); setConcepto(''); setValor(undefined); setSoporte(null) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={agregar} disabled={aplicando || !concepto.trim() || !valor || valor <= 0}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50">
              {aplicando ? 'Registrando…' : 'Registrar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
