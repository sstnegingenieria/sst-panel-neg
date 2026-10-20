// Crear acta (/actas-epp/nueva) o editar un borrador (/actas-epp/:actaId/editar).
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useActasEpp, useCatalogoEpp, useColaboradoresEpp, type OpcionColaboradorEpp } from '../../hooks/useEpp'
import { puedeGestionarEppUI } from '../../types/sigp/permisos'
import {
  FORM_ACTA_VACIO, formDeActa, puedeEditarActaEpp,
  type ActaEppConId, type ActaFormData, type ItemCatalogoEppConId,
} from '../../types/sigp/epp'
import ActaEppForm from '../../components/sigp/epp/ActaEppForm'
import { toast } from '../../components/shared/Toast'

export default function ActaEppEditor() {
  const { actaId } = useParams<{ actaId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const puede = puedeGestionarEppUI(user?.rol)
  const { cargarUna, crear, editar } = useActasEpp()
  const { cargar: cargarCatalogo } = useCatalogoEpp()
  const { cargar: cargarColaboradores } = useColaboradoresEpp()

  const [acta, setActa] = useState<ActaEppConId | null>(null)
  const [catalogo, setCatalogo] = useState<ItemCatalogoEppConId[]>([])
  const [colaboradores, setColaboradores] = useState<OpcionColaboradorEpp[]>([])
  const [cargandoColab, setCargandoColab] = useState(true)
  const [listo, setListo] = useState(!actaId)
  const [guardando, setGuardando] = useState(false)

  const load = useCallback(async () => {
    try {
      const [cat, a] = await Promise.all([cargarCatalogo(), actaId ? cargarUna(actaId) : Promise.resolve(null)])
      setCatalogo(cat)
      setActa(a)
    } catch { toast('Error al cargar los datos del acta', 'error') } finally { setListo(true) }
    try { setColaboradores(await cargarColaboradores()) } catch { toast('No se pudo leer la lista de colaboradores', 'error') } finally { setCargandoColab(false) }
  }, [actaId, cargarCatalogo, cargarUna, cargarColaboradores])
  useEffect(() => { load() }, [load])

  const guardar = async (form: ActaFormData, irAFirmar: boolean) => {
    if (!user) return
    setGuardando(true)
    try {
      const actor = { uid: user.uid, nombre: user.nombre }
      let id = actaId ?? null
      if (acta) {
        if (!(await editar(acta, form, actor))) { toast('No se pudo guardar: revisa los datos', 'error'); return }
      } else {
        id = await crear(form, actor)
        if (!id) { toast('No se pudo crear: revisa los datos', 'error'); return }
      }
      toast('Acta guardada')
      navigate(`/actas-epp/${id}${irAFirmar ? '?firmar=1' : ''}`)
    } catch {
      toast('No se pudo guardar (verifica tu rol)', 'error')
    } finally {
      setGuardando(false)
    }
  }

  if (!puede) return <p className="text-sm text-gray-500">Sin acceso.</p>
  if (!listo) return <p className="text-sm text-gray-400">Cargando…</p>
  if (actaId && !acta) return <p className="text-sm text-gray-500">No se encontró el acta.</p>
  if (acta && !puedeEditarActaEpp(acta.estado)) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">Solo un borrador se puede editar: un acta firmada es inmutable. Si hay un error, anúlala y crea una nueva.</p>
        <Link to={`/actas-epp/${acta.id}`} className="text-sm text-brand-700 hover:underline">← Volver al acta</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <Link to={acta ? `/actas-epp/${acta.id}` : '/actas-epp'} className="text-sm text-brand-700 hover:underline">← Actas de EPP</Link>
      <h1 className="text-xl font-bold text-gray-900">{acta ? 'Editar acta (borrador)' : 'Nueva acta de entrega de EPP'}</h1>
      <ActaEppForm
        inicial={acta ? formDeActa(acta) : FORM_ACTA_VACIO()}
        catalogo={catalogo}
        colaboradores={colaboradores}
        cargandoColaboradores={cargandoColab}
        guardando={guardando}
        referencia={acta?.fecha_creacion?.toDate?.()}
        onGuardar={guardar}
        onCancelar={() => navigate(acta ? `/actas-epp/${acta.id}` : '/actas-epp')}
      />
    </div>
  )
}
