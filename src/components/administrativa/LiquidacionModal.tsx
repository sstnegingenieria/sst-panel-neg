// Liquidación del contratista (Administrativa · Bloque 3b) — la acción de
// cierre de Gerencia Administrativa: concilia lo pactado (mano de obra) con
// la realidad (compras/reembolsos + ajustes de ejecución) y registra la
// liquidación. Solo para proyectos en `pagado_cliente` CON gate SST 'al_dia'
// (la regla de Firestore lo exige vía get(verificaciones_sst) — aquí además
// se muestra y se deshabilita). El SIGP registra — no ejecuta dinero.
import { useState, useMemo } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../shared/Toast'
import Modal from '../shared/Modal'
import InputExpresion from '../sigp/cotizaciones/InputExpresion'
import { fmtMoney } from '../../utils/sigp/formato'
import {
  anticipoValorDe, totalComprasReembolsos, totalContratistaFinal,
  saldoFinalLiquidacion, totalRetenciones, esAjusteEnEjecucion,
  origenDiferenciaLiquidacion,
  estadoSstGate, sstGateAlDia, SST_GATE_LABEL, SST_GATE_COLOR,
} from '../../types/sigp/proyecto'
import type { Proyecto, RetencionLiquidacion, LiquidacionProyecto } from '../../types/sigp/proyecto'
import type { VerificacionSst } from '../../types/sigp/verificacionSst'

interface Props {
  proyecto: Proyecto
  /** Proyección del gate SST (puede no existir aún). */
  verificacion?: VerificacionSst
  onClose: () => void
  /** Recarga de la bandeja tras liquidar. */
  onDone: () => Promise<void> | void
}

export default function LiquidacionModal({ proyecto, verificacion, onClose, onDone }: Props) {
  const { user } = useAuth()
  const pre = proyecto.preliquidacion
  const compras = proyecto.compras_reembolsos ?? []
  const [retenciones, setRetenciones] = useState<RetencionLiquidacion[]>([])
  const [retConcepto, setRetConcepto] = useState('')
  const [retValor, setRetValor] = useState<number | undefined>(undefined)
  const [observaciones, setObservaciones] = useState('')
  const [aplicando, setAplicando] = useState(false)

  const gate = estadoSstGate(verificacion ?? {})
  const gateOk = sstGateAlDia(verificacion ?? {})

  const manoObra = pre?.valor_contratista ?? 0
  const anticipoGirado = pre ? (pre.anticipo?.valor ?? anticipoValorDe(pre)) : 0
  const totalFinal = totalContratistaFinal(manoObra, compras)
  const diferencia = totalComprasReembolsos(compras)
  const saldoFinal = saldoFinalLiquidacion(totalFinal, anticipoGirado, retenciones)
  // Ajustes de ejecución pendientes de reconocer (motivos, del historial)
  const ajustes = useMemo(
    () => (pre?.ajuste_pendiente_liquidacion
      ? (proyecto.historial ?? []).map(h => h.motivo ?? '').filter(esAjusteEnEjecucion)
      : []),
    [proyecto.historial, pre?.ajuste_pendiente_liquidacion],
  )
  const esIgual = diferencia === 0 && !pre?.ajuste_pendiente_liquidacion

  const agregarRetencion = () => {
    if (!retConcepto.trim() || !retValor || retValor <= 0) return
    setRetenciones(r => [...r, { concepto: retConcepto.trim(), valor: retValor }])
    setRetConcepto(''); setRetValor(undefined)
  }

  const liquidar = async () => {
    if (!pre || !gateOk) return
    if (!window.confirm(
      `Liquidar al contratista por ${fmtMoney(totalFinal)} (saldo a pagar: ${fmtMoney(saldoFinal)}).\n\n` +
      (esIgual ? 'Liquidación IGUAL a la preliquidación.' : `Diferencia vs. preliquidación: ${fmtMoney(diferencia)} (compras/reembolsos).`) +
      '\n\n¿Confirmar? El proyecto pasa a "Liquidado con el contratista".')) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      const liquidacion: LiquidacionProyecto = {
        mano_obra: manoObra,
        compras_reembolsos: compras,
        ajustes_reconocidos: ajustes,
        retenciones,
        total_final: totalFinal,
        diferencia,
        es_igual: esIgual,
        anticipo_girado: anticipoGirado,
        saldo_final: saldoFinal,
        liquidada_por: user?.uid ?? '',
        fecha: ahora,
        ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
      }
      // Reconciliación: el flag "pendiente de reconocer" se retira — los
      // ajustes quedan RECONOCIDOS dentro de la liquidación (snapshot arriba).
      const { ajuste_pendiente_liquidacion: _flag, ...preReconciliada } = pre
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        liquidacion,
        preliquidacion: preReconciliada,
        estado: 'liquidado_contratista',
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: 'pagado_cliente', a: 'liquidado_contratista', por: user?.uid ?? '', fecha: ahora,
          motivo: `Liquidación del contratista — mano de obra ${fmtMoney(manoObra)} + compras/reembolsos ${fmtMoney(diferencia)} = total ${fmtMoney(totalFinal)} · anticipo girado ${fmtMoney(anticipoGirado)}` +
            (retenciones.length ? ` · retenciones ${fmtMoney(totalRetenciones(retenciones))}` : '') +
            ` · SALDO ${fmtMoney(saldoFinal)} · ` +
            (esIgual ? 'IGUAL a la preliquidación' : `diferencia ${fmtMoney(diferencia)} por compras/reembolsos`) +
            (ajustes.length ? ` · reconcilia ${ajustes.length} ajuste(s) de ejecución (flag retirado)` : '') +
            ' · gate SST al día',
        }),
      })
      toast('Liquidación registrada — proyecto liquidado con el contratista')
      onClose()
      await onDone()
    } catch {
      toast('Error al liquidar (verifica el gate SST y tu rol)', 'error')
    } finally { setAplicando(false) }
  }

  const filaNum = (k: string, v: string, cls = 'text-gray-700') => (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-gray-500">{k}</span>
      <span className={`font-mono font-semibold ${cls}`}>{v}</span>
    </div>
  )

  return (
    <Modal isOpen title={`Liquidación — ${proyecto.consecutivo}`} onClose={onClose} size="lg"
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        {
          label: aplicando ? 'Liquidando…' : gateOk ? `Liquidar (saldo ${fmtMoney(saldoFinal)})` : 'Bloqueada por el gate SST',
          onClick: liquidar, variant: 'primary', loading: aplicando,
        },
      ]}>
      <div className="space-y-4">
        {/* Gate SST */}
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${gateOk ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${SST_GATE_COLOR[gate]}`}
            title={verificacion?.sst_gate?.observacion}>
            {SST_GATE_LABEL[gate]}
          </span>
          <span className={gateOk ? 'text-emerald-800' : 'text-red-700'}>
            {gateOk
              ? 'SST verificó al contratista — liquidación habilitada.'
              : 'Sin el aval de SST no se puede liquidar (la regla también lo impide).'}
          </span>
        </div>
        {!gateOk && verificacion?.sst_gate?.observacion && (
          <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">Novedad SST: {verificacion.sst_gate.observacion}</p>
        )}

        {/* Conciliación */}
        <div className="border border-gray-200 rounded-lg px-3 py-2">
          {filaNum('Mano de obra (preliquidación)', fmtMoney(manoObra))}
          {compras.map((c, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1">
              <span className="text-gray-500 truncate pr-2">Compra/reembolso — {c.concepto}</span>
              <span className="font-mono font-semibold text-gray-700 shrink-0">{fmtMoney(c.valor)}</span>
            </div>
          ))}
          <div className="border-t border-gray-200 mt-1 pt-1">
            {filaNum('TOTAL CONTRATISTA FINAL', fmtMoney(totalFinal), 'text-gray-900')}
          </div>
          {filaNum('Anticipo girado', `− ${fmtMoney(anticipoGirado)}`)}
          {retenciones.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1">
              <span className="text-gray-500">Retención — {r.concepto}
                <button onClick={() => setRetenciones(rs => rs.filter((_, j) => j !== i))}
                  className="ml-2 text-red-500 hover:underline text-xs">quitar</button>
              </span>
              <span className="font-mono font-semibold text-gray-700">− {fmtMoney(r.valor)}</span>
            </div>
          ))}
          <div className="border-t border-gray-200 mt-1 pt-1">
            {filaNum('SALDO A PAGAR', fmtMoney(saldoFinal), saldoFinal < 0 ? 'text-red-600' : 'text-brand-700')}
          </div>
          {saldoFinal < 0 && (
            <p className="text-xs text-red-600 mt-1">⚠ Sobre-giro: el anticipo supera el total final — se pagó de más {fmtMoney(Math.abs(saldoFinal))}.</p>
          )}
        </div>

        {/* Sello / diferencia — atribuye el origen (compras, ajustes o ambos) */}
        <p className={`text-xs rounded px-2 py-1.5 ${esIgual ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          {(() => {
            switch (origenDiferenciaLiquidacion(diferencia, ajustes.length)) {
              case 'igual': return '✓ Liquidación IGUAL a la preliquidación (sin compras ni ajustes).'
              case 'compras': return `Δ Diferencia vs. la preliquidación: +${fmtMoney(diferencia)} por compras/reembolsos.`
              case 'ajustes': return 'Δ Mano de obra ajustada en ejecución (detalle abajo) — sin compras/reembolsos.'
              case 'compras_y_ajustes': return `Δ Diferencia: +${fmtMoney(diferencia)} por compras/reembolsos · además mano de obra ajustada en ejecución (detalle abajo).`
            }
          })()}
        </p>

        {/* Ajustes de ejecución a reconciliar */}
        {ajustes.length > 0 && (
          <div className="text-xs bg-amber-50 rounded px-2 py-1.5 space-y-1">
            <p className="font-semibold text-amber-800">Ajustes de ejecución pendientes de reconocer (quedan reconciliados al liquidar):</p>
            {ajustes.map((a, i) => <p key={i} className="text-amber-800/90">• {a}</p>)}
          </div>
        )}

        {/* Costo ejecutado (informativo) */}
        {pre?.costo_ejecutado !== undefined && (
          <p className="text-xs text-gray-500">Costo ejecutado real (informativo): <span className="font-mono">{fmtMoney(pre.costo_ejecutado)}</span></p>
        )}

        {/* Retenciones — estructura moldeable (tipos por definir con el área) */}
        <div className="border border-gray-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Retenciones (opcional — los tipos se definen con el área; por ahora concepto libre)</p>
          <div className="flex gap-2">
            <input value={retConcepto} onChange={e => setRetConcepto(e.target.value)} placeholder="Concepto"
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            <InputExpresion valor={retValor} onValor={setRetValor}
              className="w-32 px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-brand-300" />
            <button onClick={agregarRetencion} disabled={!retConcepto.trim() || !retValor || retValor <= 0}
              className="text-xs px-3 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">＋</button>
          </div>
        </div>

        <label className="block text-xs text-gray-500">
          Observaciones (salen en el documento)
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </label>
      </div>
    </Modal>
  )
}
