// Detalle del acta de EPP: vista imprimible + acciones. Borrador → editar / firmar (canvas) /
// anular. Firmada → imprimir / verificar integridad / anular (con motivo, SIN tocar el contenido
// firmado: la corrección es un acta nueva). Anulada → solo lectura.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useActasEpp } from '../../hooks/useEpp'
import { puedeGestionarEppUI } from '../../types/sigp/permisos'
import {
  ESTADO_ACTA_EPP_COLOR, ESTADO_ACTA_EPP_LABEL, puedeAnularActaEpp, puedeEditarActaEpp, puedeFirmarActaEpp,
  type ActaEppConId,
} from '../../types/sigp/epp'
import { CLAUSULAS_EPP, clausulasListas } from '../../utils/sigp/eppClausulas'
import { verificarIntegridadActa } from '../../utils/sigp/eppFirma'
import ActaEppImprimible from '../../components/sigp/epp/ActaEppImprimible'
import FirmaCanvas from '../../components/sigp/epp/FirmaCanvas'
import Modal from '../../components/shared/Modal'
import { toast } from '../../components/shared/Toast'

export default function ActaEppDetalle() {
  const { actaId } = useParams<{ actaId: string }>()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const puede = puedeGestionarEppUI(user?.rol)
  const { cargarUna, firmar, anular } = useActasEpp()

  const [acta, setActa] = useState<ActaEppConId | null>(null)
  const [loading, setLoading] = useState(true)
  const [firma, setFirma] = useState<string | null>(null)
  const [lienzo, setLienzo] = useState(0)   // cambia para limpiar el canvas tras recargar el acta
  const [firmando, setFirmando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [integridad, setIntegridad] = useState<'ok' | 'rota' | null>(null)
  const panelFirma = useRef<HTMLElement>(null)

  const load = useCallback(async () => {
    if (!actaId) return
    setLoading(true)
    try { setActa(await cargarUna(actaId)) } catch { toast('Error al cargar el acta', 'error') } finally { setLoading(false) }
  }, [actaId, cargarUna])
  useEffect(() => { load() }, [load])

  // ?firmar=1 (desde "Guardar y pasar a la firma"): llevar el panel de firma a la vista.
  useEffect(() => {
    if (acta?.estado === 'borrador' && params.get('firmar')) {
      setTimeout(() => panelFirma.current?.scrollIntoView({ block: 'center' }), 150)
    }
  }, [acta?.estado, params])

  const handleFirmar = async () => {
    if (!user || !acta || !firma) return
    setFirmando(true)
    try {
      const ok = await firmar(acta, firma, { uid: user.uid, nombre: user.nombre })
      if (!ok) { toast('No se pudo firmar el acta', 'error'); return }
      toast('Acta firmada — ya no se puede modificar')
      setFirma(null)
      await load()
    } catch (e) {
      if (e instanceof Error && e.message === 'ACTA_MODIFICADA') {
        toast('El acta cambió mientras se firmaba: se recargó. Revísala y vuelve a firmar.', 'error')
        setFirma(null)
        setLienzo(n => n + 1)
        await load()
      } else {
        toast('No se pudo guardar la firma (verifica tu rol)', 'error')
      }
    } finally {
      setFirmando(false)
    }
  }

  const handleAnular = async () => {
    if (!user || !acta) return
    setGuardando(true)
    try {
      const ok = await anular(acta, motivo, { uid: user.uid, nombre: user.nombre })
      if (!ok) { toast('Indica el motivo de la anulación', 'error'); return }
      toast('Acta anulada')
      setAnulando(false); setMotivo('')
      await load()
    } catch {
      toast('No se pudo anular (verifica tu rol)', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const verificar = async () => {
    if (!acta) return
    setIntegridad((await verificarIntegridadActa(acta)) ? 'ok' : 'rota')
  }

  if (!puede) return <p className="text-sm text-gray-500">Sin acceso.</p>
  if (loading) return <p className="text-sm text-gray-400">Cargando…</p>
  if (!acta) {
    return (
      <div className="flex flex-col gap-3">
        <Link to="/actas-epp" className="text-sm text-brand-700 hover:underline">← Actas de EPP</Link>
        <p className="text-sm text-gray-500">No se encontró el acta.</p>
      </div>
    )
  }

  const textoListo = clausulasListas()

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <Link to="/actas-epp" className="print:hidden text-sm text-brand-700 hover:underline">← Actas de EPP</Link>

      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_ACTA_EPP_COLOR[acta.estado]}`}>
          {ESTADO_ACTA_EPP_LABEL[acta.estado]}
        </span>
        <div className="flex gap-2">
          {puedeEditarActaEpp(acta.estado) && (
            <Link to={`/actas-epp/${acta.id}/editar`} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium">
              ✎ Editar
            </Link>
          )}
          <button type="button" onClick={() => window.print()}
            className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium">
            🖨 Imprimir
          </button>
          {acta.estado === 'firmada' && (
            <button type="button" onClick={verificar}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium">
              Verificar integridad
            </button>
          )}
          {puedeAnularActaEpp(acta.estado) && (
            <button type="button" onClick={() => setAnulando(true)}
              className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50 text-sm font-medium">
              Anular
            </button>
          )}
        </div>
      </div>

      {integridad && (
        <p className={`print:hidden text-sm rounded-lg p-3 border ${integridad === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {integridad === 'ok'
            ? '✓ Íntegra: el contenido y la firma coinciden con el hash registrado al firmar.'
            : '⚠ El contenido o la firma NO coinciden con el hash registrado al firmar. Avisa a un administrador.'}
        </p>
      )}

      <ActaEppImprimible acta={acta} />

      {puedeFirmarActaEpp(acta.estado) && (
        <section ref={panelFirma} className="print:hidden bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Firma del colaborador</h2>
          <p className="text-sm text-gray-600">
            Pasa el equipo a <b>{acta.colaborador.nombre}</b>: debe leer las cláusulas y firmar en el recuadro.
            Al guardar, el acta queda <b>firmada e inmutable</b>.
          </p>
          <ol className="list-decimal pl-5 text-sm text-gray-700 flex flex-col gap-1">
            {CLAUSULAS_EPP.map((c, i) => <li key={i} className="whitespace-pre-wrap">{c}</li>)}
          </ol>
          {!textoListo && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              No se puede firmar todavía: falta cargar el texto legal del formato (introducción y las 3 cláusulas).
            </p>
          )}
          <FirmaCanvas key={lienzo} onChange={setFirma} disabled={!textoListo || firmando} />
          <div>
            <button type="button" onClick={handleFirmar} disabled={!firma || !textoListo || firmando}
              className="px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              {firmando ? 'Guardando…' : 'Firmar y guardar'}
            </button>
          </div>
        </section>
      )}

      <section className="print:hidden bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Historial</h2>
        <ul className="flex flex-col gap-2">
          {[...acta.historial].reverse().map((h, i) => (
            <li key={i} className="text-sm border-l-2 border-gray-200 pl-3">
              <p className="text-gray-900">{h.nota ?? 'Movimiento'}</p>
              <p className="text-xs text-gray-400">
                {h.fecha?.toDate ? h.fecha.toDate().toLocaleString('es-CO') : '—'} · {h.por_nombre ?? h.por}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Modal
        isOpen={anulando}
        title="Anular acta"
        onClose={() => setAnulando(false)}
        actions={[
          { label: 'Volver', variant: 'secondary', onClick: () => setAnulando(false) },
          { label: 'Anular acta', variant: 'danger', onClick: handleAnular, loading: guardando, disabled: !motivo.trim() },
        ]}
      >
        <p className="text-sm text-gray-600 mb-3">
          La anulación deja una marca con su motivo y <b>conserva el contenido y la firma</b> como evidencia. No se puede deshacer;
          la corrección es un acta nueva.
        </p>
        <label className="text-sm font-medium text-gray-700">Motivo de la anulación <span className="text-red-500">*</span></label>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={2000}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
      </Modal>
    </div>
  )
}
