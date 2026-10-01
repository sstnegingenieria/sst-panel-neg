// Cancelación del proyecto (bloque 28-sep; guarda 01-oct tras el incidente
// PRY-2026-057) — el caso general con ceros.
//
// GUARDA de vocabulario y confirmación (01-oct): el acto se llama CANCELAR en
// todas sus superficies (botón, modal, primario — coincide con el estado
// "Cancelado"; "cerrar" es del terminal normal 🏁 y "anular" es de documentos).
// El modal DESAMBIGUA con las OCs vivas del proyecto (el incidente: se quería
// anular una OC y se canceló el proyecto), nombra LO QUE SE PIERDE en términos
// del negocio —no del estado— y exige TECLEAR el consecutivo para confirmar
// (un checkbox se marca sin leer; escribir PRY-… obliga a mirar qué se
// cancela). El window.confirm desapareció. El componente renderiza su propia
// sección "danger zone" — vive al FONDO de la ficha, no en el encabezado,
// para no competir con actos rutinarios. Los campos del modelo
// (cierre_anticipado y compañía) NO cambian: el renombre es solo de textos.
//
// Mecánica intacta: motivo TIPIFICADO (duplicado exige la referencia al
// proyecto que sobrevive — selector, jamás texto libre), incurrido calculado
// EN VIVO antes de confirmar, cascada por asignación y anotación en la
// cotización — todo en un writeBatch (utils/sigp/asignaciones.ts). La obra
// espejo se inactiva después, no-fatal (el botón de re-sync es el reintento).
import { useState } from 'react'
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { fmtMoney } from '../../../utils/sigp/formato'
import { sincronizarObraEspejo } from '../../../utils/sigp/obraEspejo'
import { cargarAsignaciones, asegurarMigrado, ejecutarCierreAnticipado } from '../../../utils/sigp/asignaciones'
import { proyectoCancelable, patchCancelarProyecto } from '../../../types/sigp/asignacion'
import { TIPOS_CIERRE_ANTICIPADO, TIPO_CIERRE_LABEL, ESTADOS_PROYECTO, idxRiel } from '../../../types/sigp/proyecto'
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
  // Desambiguación: las OCs VIVAS del proyecto (todo estado salvo anulada).
  // null = no se pudieron cargar (no-fatal: el aviso simplemente no sale).
  const [ocsVivas, setOcsVivas] = useState<{ consecutivo: string }[] | null>(null)
  // Fricción proporcional: el consecutivo TECLEADO habilita el primario.
  const [confirmacion, setConfirmacion] = useState('')

  if (!proyectoCancelable(proyecto.estado)) return null

  const abrir = async () => {
    setAbierto(true)
    setCargando(true)
    setTipo('fuerza_mayor'); setMotivo(''); setSupervivienteId(''); setConfirmacion(''); setOcsVivas(null)
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
      toast('Error al preparar la cancelación', 'error')
      setAbierto(false)
    } finally { setCargando(false) }
    try {
      const ocs = await getDocs(query(collection(db, 'ordenes_compra'), where('proyecto_id', '==', proyecto.id)))
      setOcsVivas(ocs.docs
        .map(d => d.data() as { estado?: string; consecutivo?: string })
        .filter(o => o.estado !== 'anulada')
        .map(o => ({ consecutivo: o.consecutivo || '(borrador)' })))
    } catch { /* sin lectura de OCs el aviso no sale — el resto del modal no depende */ }
  }

  const irAOrdenes = () => {
    setAbierto(false)
    // Diferido e INSTANTÁNEO: el scroller real es el <main> del Layout y un
    // smooth en curso se cancela con el re-render del cierre del modal
    // (visto en E2E) — tras desmontar, el salto directo sí aterriza.
    setTimeout(() => {
      document.getElementById('seccion-ordenes-compra')?.scrollIntoView({ block: 'start' })
    }, 150)
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
  const asigsVivas = asigs.filter(a => a.estado !== 'cancelada' && a.estado !== 'liquidada')
  const obraSeInactiva = idxRiel(proyecto.estado) >= ESTADOS_PROYECTO.indexOf('en_ejecucion')
  const consecutivoOk = confirmacion.trim().toUpperCase() === proyecto.consecutivo.toUpperCase()

  const confirmar = async () => {
    if (!previa || !consecutivoOk) return
    setAplicando(true)
    try {
      const incurrido = await ejecutarCierreAnticipado(proyecto, asigs, comprasEjecutadas, datos, user?.uid ?? '')
      if (incurrido == null) { toast('La cancelación fue rehusada por el guard', 'error'); return }
      const okObra = await sincronizarObraEspejo({ ...proyecto, estado: 'cancelado' })
      toast(`${proyecto.consecutivo} cancelado — incurrido ${fmtMoney(incurrido.total)}${okObra ? '' : ' · la obra SST no se pudo inactivar (reintenta con 🏗)'}`)
      setAbierto(false)
      await reload()
    } catch {
      toast('Error al cancelar el proyecto', 'error')
    } finally { setAplicando(false) }
  }

  return (
    <div className="bg-white rounded-lg border border-rose-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Cancelación del proyecto</p>
          <p className="mt-1 text-xs text-gray-500 max-w-xl">
            Terminal y sin deshacer desde el panel. ¿Anular una <b>orden de compra</b>? Está en su
            sección, orden por orden. ¿Cerrar por ciclo completo? Lo hace Gestión Administrativa al liquidar.
          </p>
        </div>
        <button onClick={abrir}
          className="text-xs px-3 py-1.5 rounded-lg font-medium border border-rose-300 text-rose-700 hover:bg-rose-50 flex-shrink-0">
          ⛔ Cancelar proyecto
        </button>
      </div>

      <Modal isOpen={abierto} title={`Cancelar proyecto — ${proyecto.consecutivo}`}
        onClose={() => !aplicando && setAbierto(false)}
        actions={[
          { label: 'Volver', onClick: () => setAbierto(false), variant: 'secondary' },
          {
            label: aplicando ? 'Cancelando…' : 'Cancelar el proyecto',
            onClick: confirmar, variant: 'danger',
            loading: aplicando, disabled: cargando || !previa || !consecutivoOk,
          },
        ]}>
        <div className="space-y-3">
          {/* Desambiguación — la pieza que le faltó al incidente del 01-oct:
              quien viene por una OC se entera AQUÍ, en la primera pantalla */}
          {ocsVivas !== null && ocsVivas.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <p>
                Este proyecto tiene <b>{ocsVivas.length} orden(es) de compra</b> ({ocsVivas.map(o => o.consecutivo).join(', ')}).
                {' '}<b>Cancelar el proyecto NO anula órdenes de compra.</b>
              </p>
              <button onClick={irAOrdenes}
                className="mt-1.5 px-2.5 py-1 rounded-md border border-amber-400 bg-white font-medium text-amber-800 hover:bg-amber-100">
                ¿Buscabas anular una orden? Ir a Órdenes de compra →
              </button>
            </div>
          )}
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
          {/* Lo que se pierde — en términos del negocio y de ESTE proyecto,
              no del nombre del estado; cada línea sale del dato real */}
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-900">
            {cargando ? 'Calculando lo incurrido…' : previa ? (
              <>
                <p className="font-semibold">
                  Vas a cancelar el proyecto COMPLETO {proyecto.consecutivo} — {proyecto.snapshot?.cliente ?? 'cliente'} · {fmtMoney(proyecto.snapshot?.valor_venta ?? 0)}.
                </p>
                <ul className="mt-1 space-y-0.5 list-disc list-inside">
                  {asigsVivas.length > 0 && (
                    <li>
                      {asigsVivas.length === 1 ? 'La asignación viva queda cancelada' : `Las ${asigsVivas.length} asignaciones vivas quedan canceladas`}
                      {previa.incurrido.total > 0
                        ? <> — incurrido que se congela: anticipos <span className="font-mono">{fmtMoney(previa.incurrido.anticipos)}</span> · reembolsos <span className="font-mono">{fmtMoney(previa.incurrido.reembolsos)}</span> · compras NEG <span className="font-mono">{fmtMoney(previa.incurrido.compras_cf)}</span> = <b className="font-mono">{fmtMoney(previa.incurrido.total)}</b> (esperan su liquidación en Gestión Administrativa)</>
                        : ' — sin plata incurrida'}
                    </li>
                  )}
                  {asigsVivas.length === 0 && previa.incurrido.total > 0 && (
                    <li>Incurrido que se congela: <b className="font-mono">{fmtMoney(previa.incurrido.total)}</b></li>
                  )}
                  {obraSeInactiva && <li>La obra SST pasa a inactiva.</li>}
                  <li>El proyecto sale de los indicadores.</li>
                  <li><b>Terminal: no se puede deshacer desde el panel.</b></li>
                </ul>
              </>
            ) : (
              <p className="text-amber-700">
                {tipo === 'duplicado' && !superviviente ? 'Falta elegir el proyecto que sobrevive.'
                  : tipo === 'otro' && !motivo.trim() ? 'El motivo escrito es obligatorio en «Otro».'
                  : 'La cancelación no aplica en este estado.'}
              </p>
            )}
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">
              Para confirmar, escribí el consecutivo del proyecto: <span className="font-mono">{proyecto.consecutivo}</span>
            </span>
            <input value={confirmacion} onChange={e => setConfirmacion(e.target.value)}
              placeholder={proyecto.consecutivo} autoComplete="off"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-300" />
          </label>
        </div>
      </Modal>
    </div>
  )
}
