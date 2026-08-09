// Mantenimiento de precios del catálogo NEG (#2b) — ajuste masivo por % sobre
// N ítems (selección o "todo el catálogo activo", resuelto por la página
// llamante). Preview antes de aplicar; ajustes grandes (|%| > UMBRAL) exigen
// una confirmación extra. Escribe en lotes ≤500 (writeBatch secuencial) —
// misma disciplina que el importador de LPU.
import { useMemo, useState } from 'react'
import { doc, writeBatch, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { fmtMoney } from '../../../utils/sigp/formato'
import { validarPorcentaje, previsualizarAjuste, trocear, UMBRAL_CONFIRMACION_PCT } from '../../../utils/sigp/catalogoAjuste'
import type { CatalogoItem } from '../../../types/sigp/catalogo'

interface AjusteMasivoModalProps {
  items: CatalogoItem[]
  isOpen: boolean
  onClose: () => void
  onDone: () => void
}

export default function AjusteMasivoModal({ items, isOpen, onClose, onDone }: AjusteMasivoModalProps) {
  const { user } = useAuth()
  const [pctTexto, setPctTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [confirmoExtra, setConfirmoExtra] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const pct = pctTexto.trim() === '' ? NaN : Number(pctTexto.replace(',', '.'))
  const validacion = validarPorcentaje(pct)

  const preview = useMemo(() => {
    if (!validacion.valido) return []
    return previsualizarAjuste(
      items.map(it => ({ id: it.id, codigo: it.codigo, descripcion: it.descripcion, valor_unitario: it.valor_unitario ?? 0 })),
      pct,
    )
  }, [items, pct, validacion.valido])

  const cerrar = () => {
    setPctTexto('')
    setMotivo('')
    setConfirmoExtra(false)
    onClose()
  }

  const puedeAplicar =
    items.length > 0 &&
    validacion.valido &&
    (!validacion.requiereConfirmacionExtra || confirmoExtra) &&
    motivo.trim() !== ''

  const aplicar = async () => {
    if (!puedeAplicar || !user) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      const motivoFinal = motivo.trim()
      const lotes = trocear(preview, 450)
      for (const lote of lotes) {
        const batch = writeBatch(db)
        for (const r of lote) {
          batch.update(doc(db, 'catalogo_items', r.id), {
            valor_unitario: r.valor_nuevo,
            historial_precios: arrayUnion({
              valor_unitario: r.valor_nuevo,
              vigente_desde: ahora,
              actualizado_por: user.uid,
              motivo: motivoFinal,
            }),
          })
        }
        await batch.commit()
      }
      toast(`${preview.length} precios ajustados`)
      cerrar()
      onDone()
    } catch {
      toast('Error al aplicar el ajuste masivo (verifica tu rol)', 'error')
    } finally {
      setAplicando(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Ajuste masivo por %"
      onClose={cerrar}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: cerrar, variant: 'secondary' },
        {
          label: aplicando ? 'Aplicando…' : 'Aplicar',
          onClick: aplicar,
          variant: 'primary',
          loading: aplicando,
          disabled: !puedeAplicar,
        },
      ]}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <b>{items.length}</b> ítem{items.length === 1 ? '' : 's'} seleccionado{items.length === 1 ? '' : 's'}.
        </p>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Porcentaje de ajuste <span className="text-red-500">*</span></span>
          <input
            type="text"
            inputMode="decimal"
            value={pctTexto}
            onChange={e => { setPctTexto(e.target.value); setConfirmoExtra(false) }}
            placeholder="Ej: 8 o -5"
            className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 ${
              pctTexto.trim() !== '' && !validacion.valido ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
          />
          {pctTexto.trim() !== '' && validacion.error && (
            <span className="mt-1 block text-xs text-red-600">{validacion.error}</span>
          )}
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Motivo <span className="text-red-500">*</span></span>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            placeholder="Por qué se ajustan estos precios…"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>

        {validacion.valido && preview.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vista previa</p>
            <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 px-3 font-semibold">Código</th>
                    <th className="py-2 px-3 font-semibold text-right">Actual</th>
                    <th className="py-2 px-3 font-semibold text-right">Nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(r => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="py-1.5 px-3 font-mono text-gray-700" title={r.descripcion}>{r.codigo}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-gray-500">{fmtMoney(r.valor_actual)}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-gray-800">{fmtMoney(r.valor_nuevo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {validacion.valido && validacion.requiereConfirmacionExtra && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 space-y-2">
            <p className="text-sm text-amber-900">
              ⚠ Ajuste de <b>{pct}%</b> sobre <b>{items.length}</b> ítem{items.length === 1 ? '' : 's'} — supera el {UMBRAL_CONFIRMACION_PCT}%.
            </p>
            <label className="flex items-center gap-2 text-sm text-amber-900">
              <input type="checkbox" checked={confirmoExtra} onChange={e => setConfirmoExtra(e.target.checked)} />
              Confirmo el ajuste
            </label>
          </div>
        )}
      </div>
    </Modal>
  )
}
