// Detalle de Cliente (SIGP · UX jul-2026) — la gestión de LPU vive AQUÍ como
// pestaña del cliente (antes era página propia en el sidebar). Solo cambia la
// navegación: el modelo de lpus, el wizard, el versionado y el buscador LPU
// del cotizador quedan intactos.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import LpusTable from '../../components/sigp/lpus/LpusTable'
import ImportarLpuWizard from '../../components/sigp/lpus/ImportarLpuWizard'
import ClientesForm, { ClienteFormData } from '../../components/sigp/clientes/ClientesForm'
import { useModal } from '../../hooks/useModal'
import { useLpus } from '../../hooks/sigp/useLpus'
import { useFirestore } from '../../hooks/useFirestore'
import { toast } from '../../components/shared/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { puedeGestionarClientesUI, puedeGestionarLpusUI } from '../../types/sigp/permisos'
import type { Cliente } from '../../types/sigp/cliente'

type Pestana = 'info' | 'lpu'

export default function ClienteDetalleSigp() {
  const { clienteId } = useParams<{ clienteId: string }>()
  const { user } = useAuth()
  const { update } = useFirestore()
  const { lpus, loading: loadingLpus, reload: reloadLpus } = useLpus()
  const modal = useModal()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [pestana, setPestana] = useState<Pestana>('info')
  const [wizardOpen, setWizardOpen] = useState(false)

  const puedeEditarCliente = puedeGestionarClientesUI(user?.rol)
  const puedeGestionarLpu = puedeGestionarLpusUI(user?.rol)

  const load = useCallback(async () => {
    if (!clienteId) return
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'clientes', clienteId))
      setCliente(snap.exists() ? ({ id: snap.id, ...snap.data() } as Cliente) : null)
    } catch {
      toast('Error al cargar el cliente', 'error')
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { load() }, [load])

  const lpusCliente = useMemo(
    () => lpus.filter(l => l.cliente_id === clienteId),
    [lpus, clienteId],
  )

  const handleSave = async (data: ClienteFormData) => {
    if (!cliente) return
    try {
      await update('clientes', cliente.id, data)
      toast('Cliente actualizado')
      await load()
    } catch {
      toast('Error al guardar el cliente', 'error')
      throw new Error('save failed')
    }
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto py-16 text-center text-sm text-gray-400">Cargando…</div>
  }
  if (!cliente) {
    return (
      <div className="max-w-6xl mx-auto py-16 text-center space-y-2">
        <p className="text-sm text-gray-500">Cliente no encontrado.</p>
        <Link to="/sigp/clientes" className="text-sm text-brand-700 hover:underline">← Volver a Clientes</Link>
      </div>
    )
  }

  const c = cliente
  const pestanaCls = (p: Pestana) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
      pestana === p
        ? 'border-brand-600 text-brand-700'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Link to="/sigp/clientes" className="text-sm text-gray-500 hover:text-brand-700 inline-flex items-center gap-1">← Clientes</Link>

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{c.nombre}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            NIT {c.nit}
            <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
              c.estado === 'activo' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {c.estado === 'activo' ? 'Activo' : 'Inactivo'}
            </span>
          </p>
        </div>
        {puedeEditarCliente && (
          <button onClick={modal.open}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium flex-shrink-0">
            ✎ Editar
          </button>
        )}
      </div>

      {/* Pestañas */}
      <div className="border-b border-gray-200 flex gap-1">
        <button onClick={() => setPestana('info')} className={pestanaCls('info')}>Información</button>
        <button onClick={() => setPestana('lpu')} className={pestanaCls('lpu')}>
          Listas de precios (LPU)
          <span className="ml-1.5 text-xs text-gray-400">({loadingLpus ? '…' : lpusCliente.length})</span>
        </button>
      </div>

      {/* ── Pestaña Información ── */}
      {pestana === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contactos</p>
            {(c.contactos ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">Sin contactos registrados.</p>
            ) : (
              <ul className="space-y-2.5">
                {c.contactos.map((ct, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-medium text-gray-800">
                      {ct.nombre}
                      {i === 0 && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold">Principal</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {[ct.cargo, ct.email, ct.telefono].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Condiciones comerciales</p>
            <p className="text-sm text-gray-700">
              Esquema tributario: <span className="font-semibold">{c.condiciones_comerciales?.esquema_impuestos === 'aiu' ? 'AIU' : 'IVA pleno'}</span>
            </p>
            {c.condiciones_comerciales?.esquema_impuestos === 'aiu' && c.condiciones_comerciales.aiu_defaults && (
              <p className="text-xs text-gray-500 mt-1">
                AIU por defecto: A {c.condiciones_comerciales.aiu_defaults.admin}% · I {c.condiciones_comerciales.aiu_defaults.imprevistos}% · U {c.condiciones_comerciales.aiu_defaults.utilidad}%
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Pestaña LPU (gestión completa, pre-scopeada al cliente) ── */}
      {pestana === 'lpu' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <h2 className="font-bold text-gray-800">
              Listas de precios de {c.nombre}
              {!loadingLpus && <span className="ml-2 text-xs font-normal text-gray-400">({lpusCliente.length})</span>}
            </h2>
            {puedeGestionarLpu && c.estado === 'activo' && (
              <button onClick={() => setWizardOpen(true)}
                className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Importar LPU
              </button>
            )}
          </div>
          <LpusTable lpus={lpusCliente} loading={loadingLpus} clienteNombres={{ [c.id]: c.nombre }} />
        </div>
      )}

      {/* Wizard pre-scopeado: selector de cliente bloqueado en ESTE cliente */}
      <ImportarLpuWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        clientes={[c]}
        clienteIdInicial={c.id}
        lpus={lpus}
        onImportado={reloadLpus}
      />

      <ClientesForm isOpen={modal.isOpen} onClose={modal.close} onSave={handleSave} initial={c} />
    </div>
  )
}
