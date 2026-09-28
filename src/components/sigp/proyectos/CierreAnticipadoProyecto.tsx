// Cierre anticipado del proyecto (bloque 28-sep) — el caso general con ceros.
//
// Botón + modal en la ficha: motivo TIPIFICADO (duplicado exige la referencia
// al proyecto que sobrevive — selector, jamás texto libre), incurrido
// calculado EN VIVO y mostrado ANTES de confirmar (anticipos + reembolsos de
// las asignaciones + compras de la CF), cascada por asignación y anotación en
// la cotización — todo en un writeBatch (utils/sigp/asignaciones.ts). La obra
// espejo se inactiva después, no-fatal (el botón de re-sync es el reintento).
import { useState } from 'react'
import { collection, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { fmtMoney } from '../../../utils/sigp/formato'
import { sincronizarObraEspejo } from '../../../utils/sigp/obraEspejo'
import { cargarAsignaciones, asegurarMigrado, ejecutarCierreAnticipado } from '../../../utils/sigp/asignaciones'
import { proyectoCancelable, patchCancelarProyecto } from '../../../types/sigp/asignacion'
import { TIPOS_CIERRE_ANTICIPADO, TIPO_CIERRE_LABEL } from '../../../types/sigp/proyecto'
import type { AsignacionContratista, DatosCierreAnticipado } from '../../../types/sigp/asignacion'
import type { Proyecto, TipoCierreAnticipado } from '../../../types/sigp/proyecto'

interface Props {
  proyecto: Proyecto
  /** compras_proyecto (CF de C3) — la ficha ya lo carga para la tarjeta PRC. */
  comprasEjecutadas: number
  reload: () => Promise<void>
}

export default function CierreAnticipadoProyecto({ proyecto, comprasEjecutadas, reload }: Props) {
  const { user } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [asigs, setAsigs] = useState<AsignacionContratista[]>([])
  const [tipo, setTipo] = useState<TipoCierreAnticipado>('fuerza_mayor')
  const [motivo, setMotivo] = useState('')
  const [supervivientes, setSupervivientes] = useState<Pick<Proyecto, 'id' | 'consecutivo' | 'snapshot' | 'estado'>[]>([])
  const [supervivienteId, setSupervivienteId] = useState('')

  if (!proyectoCancelable(proyecto.estado)) return null

  const abrir = async () => {
    setAbierto(true)
    setCargando(true)
    setTipo('fuerza_mayor'); setMotivo(''); setSupervivienteId('')
    try {
      // Asignaciones migradas (la cancelación es un write económico) + la
      // lista de posibles supervivientes para el motivo `duplicado`.
      const sub = await cargarAsignaciones(proyecto.id)
      setAsigs(await asegurarMigrado(proyecto, sub))
      const snap = await getDocs(collection(db, 'proyectos'))
      setSupervivientes(snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Proyecto)
        .filter(x => x.id !== proyecto.id && x.estado !== 'cancelado')
        .sort((a, b) => (a.consecutivo < b.consecutivo ? 1 : -1)))
    } catch {
      toast('Error al preparar el cierre', 'error')
      setAbierto(false)
    } finally { setCargando(false) }
  }

  const superviviente = supervivientes.find(x => x.id === supervivienteId)
  const datos: DatosCierreAnticipado = {
    tipo,
    ...(motivo.trim() ? { motivo_texto: motivo.trim() } : {}),
    ...(tipo === 'duplicado' && superviviente
      ? { proyecto_superviviente: { id: superviviente.id, consecutivo: superviviente.consecutivo } }
      : {}),
  }
  // El MISMO builder valida el botón y ejecuta — la vista previa del incurrido
  // sale de él (transparencia: se ve lo que se va a congelar antes del clic).
  const previa = !cargando
    ? patchCancelarProyecto(proyecto, asigs, comprasEjecutadas, datos, user?.uid ?? '', Timestamp.now())
    : null

  const confirmar = async () => {
    if (!previa) return
    if (!window.confirm(`¿Cerrar anticipadamente ${proyecto.consecutivo}? El estado pasa a CANCELADO (terminal, sin borrado) y quedará fuera de los indicadores.`)) return
    setAplicando(true)
    try {
      const incurrido = await ejecutarCierreAnticipado(proyecto, asigs, comprasEjecutadas, datos, user?.uid ?? '')
      if (incurrido == null) { toast('El cierre fue rehusado por el guard', 'error'); return }
      const okObra = await sincronizarObraEspejo({ ...proyecto, estado: 'cancelado' })
      toast(`${proyecto.consecutivo} cancelado — incurrido ${fmtMoney(incurrido.total)}${okObra ? '' : ' · la obra SST no se pudo inactivar (reintenta con 🏗)'}`)
      setAbierto(false)
      await reload()
    } catch {
      toast('Error al cerrar el proyecto', 'error')
    } finally { setAplicando(false) }
  }

  return (
    <>
      <button onClick={abrir}
        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-rose-300 text-rose-700 hover:bg-rose-50">
        ⛔ Cerrar anticipadamente
      </button>

      <Modal isOpen={abierto} title={`Cierre anticipado — ${proyecto.consecutivo}`}
        onClose={() => !aplicando && setAbierto(false)}
        actions={[
          { label: 'Cancelar', onClick: () => setAbierto(false), variant: 'secondary' },
          {
            label: aplicando ? 'Cerrando…' : 'Cerrar el proyecto',
            onClick: confirmar, variant: 'primary',
            loading: aplicando, disabled: cargando || !previa,
          },
        ]}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Estado terminal <b>Cancelado</b> — sin borrado, con motivo tipificado y lo incurrido
            registrado. Queda fuera de los indicadores.
          </p>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Motivo <span className="text-red-500">*</span></span>
            <select value={tipo} onChange={e => setTipo(e.target.value as TipoCierreAnticipado)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
              {TIPOS_CIERRE_ANTICIPADO.map(t => <option key={t} value={t}>{TIPO_CIERRE_LABEL[t]}</option>)}
            </select>
          </label>
          {tipo === 'duplicado' && (
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Proyecto que sobrevive <span className="text-red-500">*</span></span>
              <select value={supervivienteId} onChange={e => setSupervivienteId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                <option value="">— Elegir el proyecto del que este es duplicado —</option>
                {supervivientes.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.consecutivo} · {x.snapshot?.nombre_sitio || x.snapshot?.asunto || ''} · {x.snapshot?.cliente ?? ''}
                  </option>
                ))}
              </select>
              <span className="block mt-1 text-[11px] text-gray-400">
                La referencia es obligatoria — un duplicado sin decir de qué es duplicado no le sirve a nadie en seis meses.
              </span>
            </label>
          )}
          <label className="block text-sm">
            <span className="font-medium text-gray-700">
              Detalle {tipo === 'otro' ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(opcional)</span>}
            </span>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {cargando ? 'Calculando lo incurrido…' : previa ? (
              <>
                <p className="font-semibold text-gray-700">Incurrido que se congela con el cierre:</p>
                <p>Anticipos girados: <span className="font-mono">{fmtMoney(previa.incurrido.anticipos)}</span> ·
                  {' '}Reembolsos: <span className="font-mono">{fmtMoney(previa.incurrido.reembolsos)}</span> ·
                  {' '}Compras NEG: <span className="font-mono">{fmtMoney(previa.incurrido.compras_cf)}</span></p>
                <p className="mt-0.5">Total: <b className="font-mono">{fmtMoney(previa.incurrido.total)}</b>
                  {previa.incurrido.total > 0
                    ? ' — las asignaciones quedan canceladas ESPERANDO su liquidación (Gestión Administrativa las concilia desde la ficha).'
                    : ' — cierre limpio: terminal y listo.'}</p>
              </>
            ) : (
              <p className="text-amber-700">
                {tipo === 'duplicado' && !superviviente ? 'Falta elegir el proyecto que sobrevive.'
                  : tipo === 'otro' && !motivo.trim() ? 'El motivo escrito es obligatorio en «Otro».'
                  : 'El cierre no aplica en este estado.'}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
