import { useState, useEffect } from 'react'
import { collection, doc, getDoc, setDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import SelectField from '../../shared/SelectField'
import { toast } from '../../shared/Toast'
import { useAuth } from '../../../contexts/AuthContext'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import { useFeatureFlag } from '../../../hooks/useFeatureFlag'
import { fmtMoney } from '../../../utils/sigp/formato'
import CoordenadasSitioInput from '../shared/CoordenadasSitioInput'
import { esCoordenadaValida } from '../../../utils/geo'
import type { CoordenadasSitio } from '../../../utils/geo'
import { CANALES, CANAL_LABEL, historialRegistroCon } from '../../../types/sigp/solicitud'
import { crearBorradorVisita, crearBorradorCotizacion } from '../../../utils/sigp/pipeline'
import {
  normalizarCodigoSitio, contradiccionesConMaestro, construirSitioDesdeSolicitud,
  resumenClasificacion, type SitioPreventivo,
} from '../../../types/sigp/sitioPreventivo'
import {
  DEPARTAMENTOS_PREVENTIVO, zonaDeDepartamento, esSanAndres, precioPreventivo,
  TIPO_SITIO_LABEL, INTENSIDAD_LABEL,
} from '../../../types/sigp/preventivos'
import type { TipoSitio, IntensidadPreventivo } from '../../../types/sigp/preventivos'
import type { Canal, Adjunto, TipoSolicitud, DecisionRegistro, Solicitud } from '../../../types/sigp/solicitud'
import { clientePreventivosDe } from '../../../types/sigp/cliente'
import type { Cliente, Contacto } from '../../../types/sigp/cliente'

interface SolicitudFormProps {
  isOpen: boolean
  onClose: () => void
  onGuardado: () => void
  clientes: Cliente[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FormState {
  tipo: TipoSolicitud
  clienteId: string
  prospectoNombre: string
  contactoNombre: string
  contactoCargo: string
  contactoEmail: string
  contactoTelefono: string
  canal: Canal
  asunto: string
  descripcion: string
  sitio: string
  // Bloque 1 — identificación del sitio (las áreas se comunican por su nombre)
  nombreSitio: string
  codigoSitio: string
  fechaRecepcion: string
  // Comercial #1 — decisión de rumbo al registrar (solo tipo === 'comercial')
  decision: DecisionRegistro | ''
  // F2.2 — preventivo IHS. Rediseño 07-nov: lo que mueve el precio arranca
  // SIN valor ('' / null = no tocado) — la pantalla distingue elegido de
  // no tocado, que hoy producían el mismo dato.
  sitioId: string
  sitioNombre: string
  tipoSitio: TipoSitio | ''
  intensidad: IntensidadPreventivo | ''
  esJungle: boolean | null
  departamento: string
  fechaAsignacion: string
}

const inicial = (): FormState => ({
  tipo: 'comercial',
  clienteId: '', prospectoNombre: '',
  contactoNombre: '', contactoCargo: '', contactoEmail: '', contactoTelefono: '',
  canal: 'correo', asunto: '', descripcion: '', sitio: '', nombreSitio: '', codigoSitio: '', fechaRecepcion: hoyISO(),
  decision: '',
  sitioId: '', sitioNombre: '', tipoSitio: '', intensidad: '',
  esJungle: null, departamento: '', fechaAsignacion: hoyISO(),
})

/** Lo elegido en el preventivo anterior del MISMO lote (la forma real de uso:
 *  once seguidas del mismo formulario). Se MUESTRA, jamás se hereda en
 *  silencio — aplicarlo es un clic explícito. */
interface SeleccionPreventivo {
  tipoSitio: TipoSitio
  intensidad: IntensidadPreventivo
  esJungle: boolean
  departamento: string
}

const resumenSeleccion = (s: SeleccionPreventivo) =>
  `${TIPO_SITIO_LABEL[s.tipoSitio]} · ${INTENSIDAD_LABEL[s.intensidad]} · ${s.esJungle ? 'Jungle' : 'No jungle'} · ${s.departamento}`

/** Datos de un intento previo cuyo consecutivo ya se generó (para reintentar sin quemar otro). */
interface Pendiente {
  solicitudId: string
  consecutivo: string
  adjuntos: Adjunto[]
}

async function subirAdjuntos(solicitudId: string, archivos: File[]): Promise<Adjunto[]> {
  const out: Adjunto[] = []
  for (const f of archivos) {
    const nombre = f.name.replace(/[^\w.\-]/g, '_')
    const snap = await uploadBytes(ref(storage, `solicitudes/${solicitudId}/${nombre}`), f)
    const url = await getDownloadURL(snap.ref)
    const adj: Adjunto = { nombre: f.name, url, tamano: f.size, subido_en: Timestamp.now() }
    if (f.type) adj.content_type = f.type
    out.push(adj)
  }
  return out
}

const normalizarNombre = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function SolicitudForm({ isOpen, onClose, onGuardado, clientes }: SolicitudFormProps) {
  const { user } = useAuth()
  const { obtener } = useConsecutivo()
  const f2Enabled = useFeatureFlag('sigp_f2_enabled', false)
  const [form, setForm] = useState<FormState>(inicial)

  // Ruta B (11-ago): en preventivos el cliente es FIJO — el flaggeado
  // `usa_preventivos` activo (helper puro; reemplaza el hardcode "ihs").
  const clientePreventivos = clientePreventivosDe(clientes)
  const [archivos, setArchivos] = useState<File[]>([])
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  // Coordenadas del sitio (opcional) — un solo punto para comercial y preventivo.
  const [coordenadas, setCoordenadas] = useState<CoordenadasSitio | null>(null)

  useEffect(() => {
    if (isOpen) {
      setForm(inicial())
      setArchivos([])
      setErrores({})
      setPendiente(null)
      setCoordenadas(null)
    }
  }, [isOpen])

  // ── Historial de contactos del cliente (UX jul-2026) ──
  // Con cliente registrado, el contacto se ELIGE de clientes.contactos[]
  // (prefill: el principal, índice 0); "nuevo" abre los campos libres y al
  // guardar la solicitud el contacto se añade al cliente (sin duplicar).
  // Prospecto: texto libre como siempre.
  const [contactoSel, setContactoSel] = useState<string>('nuevo')
  const contactosCliente: Contacto[] =
    clientes.find(c => c.id === form.clienteId)?.contactos ?? []

  const aplicarContacto = (v: string, lista: Contacto[]) => {
    setContactoSel(v)
    const ct = v === 'nuevo' ? null : lista[Number(v)]
    setForm(f => ({
      ...f,
      contactoNombre: ct?.nombre ?? '',
      contactoCargo: ct?.cargo ?? '',
      contactoEmail: ct?.email ?? '',
      contactoTelefono: ct?.telefono ?? '',
    }))
  }

  useEffect(() => {
    const lista = clientes.find(c => c.id === form.clienteId)?.contactos ?? []
    if (form.clienteId && lista.length > 0) aplicarContacto('0', lista)   // prefill principal
    else setContactoSel('nuevo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.clienteId])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrores(e => ({ ...e, [k]: '' }))
  }

  // Derivados del preventivo (zona/SAI del departamento; precio de matriz en vivo)
  const esPreventivo = form.tipo === 'preventivo'

  // Cliente fijo: al entrar a preventivo se fuerza el flaggeado; al volver a
  // comercial se limpia para que el selector arranque neutro.
  useEffect(() => {
    if (esPreventivo) set('clienteId', clientePreventivos?.id ?? '')
    else set('clienteId', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esPreventivo, clientePreventivos?.id])
  const zona = esPreventivo && form.departamento ? zonaDeDepartamento(form.departamento) : null
  const esSai = esPreventivo && esSanAndres(form.departamento)
  // Lo que FALTA por elegir — el precio solo aparece con todo decidido, y el
  // desglose dice qué falta (un total solo siempre parece plausible).
  const faltantes: string[] = esPreventivo
    ? [
        ...(form.tipoSitio === '' ? ['tipo de sitio'] : []),
        ...(form.intensidad === '' ? ['intensidad'] : []),
        ...(form.esJungle === null ? ['jungle sí/no'] : []),
        ...(!zona ? ['departamento'] : []),
      ]
    : []
  const seleccionCompleta = esPreventivo && faltantes.length === 0
  const precio = seleccionCompleta && zona && form.tipoSitio !== '' && form.intensidad !== '' && form.esJungle !== null
    ? precioPreventivo({ zona, tipo: form.tipoSitio, intensidad: form.intensidad, es_jungle: form.esJungle, es_sai: esSai })
    : null

  // Maestro de sitios (07-nov): la condición jungle es del SITIO. Si el
  // código ya está en el maestro, la clasificación se HEREDA (prellenado con
  // chip visible, jamás en silencio) y elegir distinto se CONTRADICE en
  // pantalla — cambiar el hecho del maestro es de gerencia, no de la captura.
  const [maestro, setMaestro] = useState<SitioPreventivo | null>(null)
  useEffect(() => {
    const codigo = normalizarCodigoSitio(form.sitioId)
    if (!esPreventivo || codigo.length < 4) { setMaestro(null); return }
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'sitios_preventivos', codigo))
        if (!vivo) return
        const m = snap.exists() ? (snap.data() as SitioPreventivo) : null
        setMaestro(m)
        if (m) {
          // Herencia VISIBLE: solo rellena lo NO tocado (elegido ≠ heredado
          // queda distinguible por el chip; el usuario puede cambiar y verá
          // la contradicción).
          setForm(f => ({
            ...f,
            tipoSitio: f.tipoSitio === '' ? m.clasificacion.tipo_sitio : f.tipoSitio,
            intensidad: f.intensidad === '' ? m.clasificacion.intensidad : f.intensidad,
            esJungle: f.esJungle === null ? m.clasificacion.es_jungle : f.esJungle,
            departamento: f.departamento === '' ? m.departamento : f.departamento,
            sitioNombre: f.sitioNombre.trim() === '' ? m.nombre : f.sitioNombre,
          }))
        }
      } catch { if (vivo) setMaestro(null) }
    }, 400)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esPreventivo, form.sitioId])

  const contradicciones = maestro && form.tipoSitio !== '' && form.intensidad !== '' && form.esJungle !== null
    ? contradiccionesConMaestro(maestro, { tipo_sitio: form.tipoSitio, intensidad: form.intensidad, es_jungle: form.esJungle })
    : []

  // Lote: lo elegido en el preventivo anterior de ESTA sesión del panel.
  // Sobrevive al cierre del modal (el componente queda montado) y se ofrece
  // como chip con botón — mostrar, no heredar.
  const [anterior, setAnterior] = useState<SeleccionPreventivo | null>(null)
  const aplicarAnterior = () => {
    if (!anterior) return
    setForm(f => ({ ...f, tipoSitio: anterior.tipoSitio, intensidad: anterior.intensidad, esJungle: anterior.esJungle, departamento: anterior.departamento }))
    setErrores(e => ({ ...e, tipoSitio: '', intensidad: '', esJungle: '', departamento: '' }))
  }

  const validar = (): boolean => {
    const e: Record<string, string> = {}
    if (esPreventivo) {
      if (!form.clienteId) e.origen = 'No hay un cliente de preventivos activo — marcá el flag en Clientes'
      if (!form.sitioNombre.trim()) e.sitioNombre = 'Requerido'
      // Rediseño 07-nov: lo que mueve el precio se ELIGE — sin default, no se
      // puede continuar sin decidirlo (elegido ≠ no tocado).
      if (form.tipoSitio === '') e.tipoSitio = 'Elegí el tipo de sitio'
      if (form.intensidad === '') e.intensidad = 'Elegí la intensidad'
      if (form.esJungle === null) e.esJungle = 'Indicá si el sitio es jungle — cambia el valor y el transporte'
      if (!form.departamento) e.departamento = 'Requerido'
      else if (!zona) e.departamento = 'Departamento fuera de las zonas del contrato'
      if (seleccionCompleta && !precio) e.intensidad = 'Combinación no disponible en la matriz (rooftop solo pesado)'
    } else {
      if (!form.clienteId && !form.prospectoNombre.trim())
        e.origen = 'Indica un cliente o el nombre del prospecto'
      if (!form.descripcion.trim() || form.descripcion.trim().length < 5)
        e.descripcion = 'Describe la solicitud (mínimo 5 caracteres)'
      // Bloque 1 — el sitio se identifica por su NOMBRE + código del cliente
      if (!form.nombreSitio.trim()) e.nombreSitio = 'Requerido — nombre del sitio'
      if (!form.codigoSitio.trim()) e.codigoSitio = "Requerido — escribe 'N/A' si el cliente no asigna código"
      if (form.decision === '') e.decision = 'Elige el rumbo de la solicitud'
    }
    if (!form.contactoNombre.trim()) e.contactoNombre = 'Requerido'
    if (form.contactoEmail.trim() && !EMAIL_RE.test(form.contactoEmail.trim()))
      e.contactoEmail = 'Correo inválido'
    const y = new Date(form.fechaRecepcion).getFullYear()
    if (!form.fechaRecepcion || Number.isNaN(y) || y < 1900 || y > 9999)
      e.fechaRecepcion = 'Fecha inválida'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const construirDoc = (consecutivo: string, adjuntos: Adjunto[]) => {
    const ahora = Timestamp.now()
    const uid = user?.uid ?? ''
    // Comercial #1: los preventivos conservan el arranque de siempre
    // (recibida, sin decisión de rumbo — su flujo es aceptar/rechazar).
    // Los comerciales nacen en_estudio y, si hay decisión, transicionan en
    // el mismo acto (historial con los dos eslabones).
    const { estadoFinal, historial } = esPreventivo
      ? {
          estadoFinal: 'recibida' as const,
          historial: [{
            de: null, a: 'recibida' as const, por: uid, fecha: ahora,
            // Maestro (07-nov): registrar DISTINTO al maestro no se bloquea,
            // pero la contradicción queda ESCRITA — nada pasa en silencio.
            ...(contradicciones.length > 0 && maestro
              ? { motivo: `⚠ Registrada contradiciendo el maestro del sitio ${maestro.codigo} (${contradicciones.join('; ')})` }
              : {}),
          }],
        }
      : historialRegistroCon(form.decision as DecisionRegistro, uid, ahora)
    const doc_: Record<string, unknown> = {
      consecutivo,
      contacto: {
        nombre: form.contactoNombre.trim(),
        ...(form.contactoCargo.trim() ? { cargo: form.contactoCargo.trim() } : {}),
        ...(form.contactoEmail.trim() ? { email: form.contactoEmail.trim() } : {}),
        ...(form.contactoTelefono.trim() ? { telefono: form.contactoTelefono.trim() } : {}),
      },
      canal: form.canal,
      descripcion: form.descripcion.trim(),
      fecha_recepcion: Timestamp.fromDate(new Date(form.fechaRecepcion)),
      responsable: uid,
      estado: estadoFinal,
      historial,
      adjuntos,
      fecha_creacion: ahora,
    }
    if (form.clienteId) doc_.cliente_id = form.clienteId
    if (form.prospectoNombre.trim()) doc_.prospecto_nombre = form.prospectoNombre.trim()
    if (form.sitio.trim()) doc_.sitio = form.sitio.trim()
    // Bloque B — asunto canónico (opcional al registrar; la cotización lo hereda)
    if (form.asunto.trim()) doc_.asunto = form.asunto.trim()
    // Bloque 1 — identificación del sitio. En preventivos se autocompleta del
    // sitio IHS capturado (editable si el usuario escribió otra cosa).
    const nombreSitio = form.nombreSitio.trim() || (esPreventivo ? form.sitioNombre.trim() : '')
    const codigoSitio = form.codigoSitio.trim() || (esPreventivo ? (form.sitioId.trim() || 'N/A') : '')
    if (nombreSitio) doc_.nombre_sitio = nombreSitio
    if (codigoSitio) doc_.codigo_sitio_cliente = codigoSitio
    if (esCoordenadaValida(coordenadas)) doc_.coordenadas_sitio = coordenadas
    // F2.2 — preventivo: tipo + datos del sitio con zona/SAI denormalizados.
    // Ruta B: se denormaliza el NOMBRE del cliente resuelto — elimina el
    // fallback 'IHS' literal del builder del snapshot (§16 staging).
    if (esPreventivo && zona && form.tipoSitio !== '' && form.intensidad !== '' && form.esJungle !== null) {
      doc_.tipo = 'preventivo'
      if (clientePreventivos) doc_.cliente_nombre = clientePreventivos.nombre
      doc_.descripcion = form.descripcion.trim() ||
        `Mantenimiento preventivo ${INTENSIDAD_LABEL[form.intensidad].toLowerCase()} — ${form.sitioNombre.trim()}`
      doc_.preventivo = {
        ...(form.sitioId.trim() ? { sitio_id: form.sitioId.trim() } : {}),
        sitio_nombre: form.sitioNombre.trim(),
        tipo_sitio: form.tipoSitio,
        intensidad: form.intensidad,
        es_jungle: form.esJungle,
        departamento: form.departamento,
        zona,
        es_sai: esSai,
        ...(form.fechaAsignacion ? { fecha_asignacion: Timestamp.fromDate(new Date(form.fechaAsignacion + 'T12:00:00')) } : {}),
      }
    }
    return doc_
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setGuardando(true)

    // Reutilizar lo ya generado en un intento previo (evita quemar otro consecutivo).
    let solicitudId = pendiente?.solicitudId
    let consecutivo = pendiente?.consecutivo
    let adjuntos = pendiente?.adjuntos

    try {
      if (!solicitudId) solicitudId = doc(collection(db, 'solicitudes')).id
      if (!adjuntos) adjuntos = await subirAdjuntos(solicitudId, archivos)
      // A partir de aquí se quema el consecutivo: cualquier fallo posterior lo preserva.
      if (!consecutivo) consecutivo = await obtener('SOL')

      const docCreado = construirDoc(consecutivo, adjuntos)
      await setDoc(doc(db, 'solicitudes', solicitudId), docCreado)

      // Comercial #1: decisión de rumbo tomada al registrar → el pipeline
      // (§48) dispara igual que si viniera del detalle, con los MISMOS
      // toasts. No-fatal: la solicitud ya quedó guardada; un fallo del
      // borrador no la revierte.
      if (form.decision === 'requiere_visita' || form.decision === 'cotizable') {
        const solicitudParaPipeline = { id: solicitudId, ...docCreado } as Solicitud
        try {
          if (form.decision === 'requiere_visita') {
            const creada = await crearBorradorVisita(solicitudParaPipeline, user?.uid ?? '')
            if (creada) toast('Visita pendiente de agendar creada (sin código) — ver Visitas')
          } else {
            const creada = await crearBorradorCotizacion(solicitudParaPipeline, user?.uid ?? '')
            if (creada) toast('Cotización pendiente de diligenciar creada (sin código) — ver Cotizaciones')
          }
        } catch (errPipeline) {
          console.error('Error creando el borrador del pipeline al registrar:', errPipeline)
          toast('La solicitud se guardó, pero no se pudo crear el pendiente automático', 'error')
        }
      }

      // Historial de contactos: si el contacto es NUEVO y hay cliente
      // registrado, se añade a clientes.contactos[] para reutilizarlo
      // (sin duplicar por nombre). No-fatal: la solicitud ya quedó guardada.
      if (form.clienteId && contactoSel === 'nuevo') {
        const nombreNuevo = normalizarNombre(form.contactoNombre.trim())
        const yaExiste = contactosCliente.some(ct => normalizarNombre(ct.nombre) === nombreNuevo)
        if (!yaExiste) {
          try {
            await updateDoc(doc(db, 'clientes', form.clienteId), {
              contactos: arrayUnion({
                nombre: form.contactoNombre.trim(),
                ...(form.contactoCargo.trim() ? { cargo: form.contactoCargo.trim() } : {}),
                ...(form.contactoEmail.trim() ? { email: form.contactoEmail.trim() } : {}),
                ...(form.contactoTelefono.trim() ? { telefono: form.contactoTelefono.trim() } : {}),
              }),
              fecha_actualizacion: Timestamp.now(),
            })
          } catch {
            toast('La solicitud se guardó, pero el contacto no se pudo añadir al cliente', 'error')
          }
        }
      }

      setPendiente(null)
      // Lote de preventivos: lo elegido queda disponible para MOSTRARSE en
      // la siguiente (chip + botón) — jamás se precarga en silencio.
      if (esPreventivo && form.tipoSitio !== '' && form.intensidad !== '' && form.esJungle !== null) {
        setAnterior({ tipoSitio: form.tipoSitio, intensidad: form.intensidad, esJungle: form.esJungle, departamento: form.departamento })
        // Maestro (07-nov): código NUEVO → el primer hecho del sitio lo trae
        // la captura (alta best-effort; cambiar el hecho luego es de gerencia).
        const codigo = normalizarCodigoSitio(form.sitioId)
        if (!maestro && codigo.length >= 4 && zona) {
          try {
            await setDoc(doc(db, 'sitios_preventivos', codigo), construirSitioDesdeSolicitud({
              codigo, nombre: form.sitioNombre, departamento: form.departamento, zona,
              clasificacion: { tipo_sitio: form.tipoSitio, intensidad: form.intensidad, es_jungle: form.esJungle },
              uid: user?.uid ?? '', nombreUsuario: user?.nombre,
              solicitudConsecutivo: consecutivo, fecha: Timestamp.now(),
            }))
          } catch { /* best-effort: el maestro no frena el registro */ }
        }
      }
      toast(`Solicitud registrada — ${consecutivo}`)
      onGuardado()
      onClose()
    } catch (err) {
      console.error('Error registrando solicitud:', err)
      if (consecutivo && solicitudId) {
        // El consecutivo ya se generó: preservarlo para reintentar sin perder el número.
        setPendiente({ solicitudId, consecutivo, adjuntos: adjuntos ?? [] })
        toast(`Se generó ${consecutivo} pero falló el guardado. Reintenta para no perder el número.`, 'error')
      } else {
        toast('Error al registrar la solicitud', 'error')
      }
    } finally {
      setGuardando(false)
    }
  }

  // Cierre con aviso si hay un consecutivo pendiente sin guardar.
  const handleClose = () => {
    if (pendiente && !window.confirm(
      `Se generó el consecutivo ${pendiente.consecutivo} y no se ha guardado. Si cierras, ese número quedará sin usar. ¿Cerrar de todos modos?`
    )) return
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Nueva solicitud"
      onClose={handleClose}
      size="lg"
      actions={[
        { label: 'Cancelar', onClick: handleClose, variant: 'secondary' },
        {
          label: pendiente ? 'Reintentar guardado' : 'Registrar',
          onClick: handleGuardar,
          variant: 'primary',
          loading: guardando,
        },
      ]}
    >
      <div className="space-y-4">
        {pendiente && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
            El consecutivo <span className="font-semibold">{pendiente.consecutivo}</span> ya se generó
            pero el guardado falló. Al reintentar se reutiliza (no se genera otro número).
          </div>
        )}

        {/* Tipo (F2.2): el preventivo IHS solo aparece con sigp_f2_enabled */}
        {f2Enabled && (
          <SelectField
            label="Tipo de solicitud"
            value={form.tipo}
            onChange={v => set('tipo', v as TipoSolicitud)}
            options={[
              { value: 'comercial', label: 'Comercial (cotización)' },
              { value: 'preventivo', label: 'Preventivo (precio de matriz)' },
            ]}
          />
        )}

        {/* Origen: preventivo → cliente FIJO (el flaggeado, solo lectura); comercial → selector normal */}
        <div className="space-y-2">
          {esPreventivo ? (
            clientePreventivos ? (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Cliente <span className="text-gray-400 font-normal">(fijo para preventivos)</span></p>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-800">{clientePreventivos.nombre}</span>
                  {clientePreventivos.nit && <span className="text-xs text-gray-500">NIT {clientePreventivos.nit}</span>}
                  <span className="ml-auto inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700">🔒 Preventivos</span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                <span className="font-semibold">No hay un cliente de preventivos activo.</span> Marcá
                «Cliente de preventivos» en el registro del cliente (sección Clientes) para poder registrar preventivos.
              </div>
            )
          ) : (
            <SelectField
              label="Cliente"
              value={form.clienteId}
              onChange={v => set('clienteId', v)}
              options={[
                { value: '', label: '— Prospecto (sin registro) —' },
                ...clientes.map(c => ({ value: c.id, label: c.nombre })),
              ]}
            />
          )}
          {esPreventivo && errores.origen && <p className="text-xs text-red-600">{errores.origen}</p>}
          {!form.clienteId && !esPreventivo && (
            <TextField
              label="Nombre del prospecto"
              value={form.prospectoNombre}
              onChange={v => set('prospectoNombre', v)}
              error={errores.origen}
              placeholder="Empresa o persona que solicita"
              required
            />
          )}
        </div>

        {/* Contacto — con cliente registrado se elige del historial; prospecto: libre */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Contacto</p>

          {form.clienteId && contactosCliente.length > 0 && (
            <SelectField
              label="Contacto del cliente"
              value={contactoSel}
              onChange={v => aplicarContacto(v, contactosCliente)}
              options={[
                ...contactosCliente.map((ct, i) => ({
                  value: String(i),
                  label: `${ct.nombre}${ct.cargo ? ` — ${ct.cargo}` : ct.telefono ? ` · ${ct.telefono}` : ''}${i === 0 ? ' (principal)' : ''}`,
                })),
                { value: 'nuevo', label: '＋ Nuevo contacto…' },
              ]}
            />
          )}

          {form.clienteId && contactosCliente.length > 0 && contactoSel !== 'nuevo' ? (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
              <p className="font-medium text-gray-800">{form.contactoNombre}</p>
              <p className="text-xs text-gray-500">
                {[form.contactoCargo, form.contactoEmail, form.contactoTelefono].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Nombre" value={form.contactoNombre} onChange={v => set('contactoNombre', v)} error={errores.contactoNombre} required />
                <TextField label="Cargo" value={form.contactoCargo} onChange={v => set('contactoCargo', v)} />
                <TextField label="Correo" value={form.contactoEmail} onChange={v => set('contactoEmail', v)} error={errores.contactoEmail} />
                <TextField label="Teléfono" value={form.contactoTelefono} onChange={v => set('contactoTelefono', v)} />
              </div>
              {form.clienteId && (
                <p className="text-[11px] text-gray-400">
                  Este contacto se guardará en el cliente para reutilizarlo en próximas solicitudes.
                </p>
              )}
            </>
          )}
        </div>

        {/* Datos de la solicitud */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Canal"
            value={form.canal}
            onChange={v => set('canal', v as Canal)}
            options={CANALES.map(c => ({ value: c, label: CANAL_LABEL[c] }))}
            required
          />
          <TextField
            label="Fecha de recepción"
            type="date"
            value={form.fechaRecepcion}
            onChange={v => set('fechaRecepcion', v)}
            error={errores.fechaRecepcion}
            required
          />
        </div>

        {/* Comercial #1 (03-ago): decisión de rumbo al registrar — solo
            comercial (los preventivos aceptan/rechazan en el detalle). */}
        {!esPreventivo && (
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">¿Qué sigue con esta solicitud?</p>
            <div className="space-y-2">
              {([
                { valor: 'requiere_visita' as const, label: 'Requiere visita técnica' },
                { valor: 'cotizable' as const, label: 'Cotizable inmediata', sub: 'pasa a Lista para cotizar y se crea la cotización pendiente' },
                { valor: 'decidir_despues' as const, label: 'Decidir después', sub: 'queda en estudio; el rumbo se decide en el detalle' },
              ]).map(op => (
                <label key={op.valor} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decision-registro"
                    checked={form.decision === op.valor}
                    onChange={() => set('decision', op.valor as DecisionRegistro)}
                    className="accent-brand-700 mt-0.5"
                  />
                  <span className="text-sm text-gray-700">
                    {op.label}
                    {op.sub && <span className="block text-xs text-gray-400">{op.sub}</span>}
                  </span>
                </label>
              ))}
            </div>
            {errores.decision && <p className="text-xs text-red-600">{errores.decision}</p>}
          </div>
        )}

        {/* ── Preventivo IHS (F2.2) — rediseño 07-nov: lo que mueve el precio
            se ELIGE (sin defaults), jungle es una decisión de precio como las
            demás, y el precio se DESGLOSA (zona · renglón · jungle ·
            transporte como línea propia). La pantalla hace visible la
            diferencia entre elegido y no tocado. ── */}
        {esPreventivo && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-3">
            <p className="text-sm font-semibold text-brand-700">Sitio del preventivo</p>

            {/* Maestro del sitio: el código ya tiene clasificación conocida —
                se hereda A LA VISTA, y elegir distinto se contradice. */}
            {maestro && (
              <div className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs text-gray-700">
                📌 Maestro del sitio <span className="font-mono font-semibold">{maestro.codigo}</span> ({maestro.nombre}):{' '}
                <span className="font-medium">{resumenClasificacion(maestro.clasificacion)}</span> · {maestro.departamento} ({maestro.zona})
                <span className="block text-[11px] text-gray-400 mt-0.5">
                  Establecida por {maestro.establecida_por_nombre ?? 'el histórico'} — la clasificación se heredó; si este sitio cambió, la corrige gerencia.
                </span>
              </div>
            )}
            {contradicciones.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                ⚠ <b>Lo elegido contradice el maestro del sitio:</b> {contradicciones.join('; ')}.
                Podés registrar igual — la contradicción quedará escrita en el historial — pero si el sitio
                cambió de verdad, lo correcto es que gerencia corrija el maestro.
              </div>
            )}

            {/* Lote: lo elegido en la anterior se MUESTRA — aplicarlo es un
                clic explícito, nunca un arrastre silencioso. */}
            {anterior && (
              <div className="flex items-center gap-2 flex-wrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                <span>Anterior del lote: <span className="font-medium text-gray-800">{resumenSeleccion(anterior)}</span></span>
                <button type="button" onClick={aplicarAnterior}
                  className="ml-auto px-2 py-1 rounded border border-brand-300 text-brand-700 font-medium hover:bg-brand-50 transition">
                  Usar estos valores
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Nombre del sitio" value={form.sitioNombre} onChange={v => set('sitioNombre', v)}
                error={errores.sitioNombre} placeholder="Ej: EB La Ceja" required />
              <TextField label="ID del sitio (del cliente)" value={form.sitioId} onChange={v => set('sitioId', v)} placeholder="Opcional" />
              <SelectField label="Tipo de sitio" value={form.tipoSitio} onChange={v => set('tipoSitio', v as TipoSitio | '')}
                options={[{ value: '', label: '— Elegir —' }, ...(['greenfield', 'rooftop'] as TipoSitio[]).map(t => ({ value: t, label: TIPO_SITIO_LABEL[t] }))]}
                error={errores.tipoSitio} required />
              <SelectField label="Intensidad" value={form.intensidad} onChange={v => set('intensidad', v as IntensidadPreventivo | '')}
                options={[{ value: '', label: '— Elegir —' }, ...(['liviano', 'pesado'] as IntensidadPreventivo[]).map(i => ({ value: i, label: INTENSIDAD_LABEL[i] }))]}
                error={errores.intensidad} required />
              <SelectField label="Departamento" value={form.departamento} onChange={v => set('departamento', v)}
                options={[{ value: '', label: '— Elegir —' }, ...DEPARTAMENTOS_PREVENTIVO.map(d => ({ value: d, label: d }))]}
                error={errores.departamento} required />
              {/* Jungle: modificador de PRECIO (valor base + $1.080.000 de
                  transporte) — vive junto a las otras decisiones y exige
                  respuesta como ellas. */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">¿Sitio jungle? <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-4 px-3 py-2 border rounded-lg border-gray-300 bg-white">
                  {([['si', 'Sí', true], ['no', 'No', false]] as const).map(([k, lbl, val]) => (
                    <label key={k} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="es-jungle" className="accent-brand-700"
                        checked={form.esJungle === val} onChange={() => set('esJungle', val)} />
                      {lbl}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">Cambia el valor base y suma {fmtMoney(1_080_000)} de transporte</p>
                {errores.esJungle && <p className="text-xs text-red-600">{errores.esJungle}</p>}
              </div>
              <TextField label="Fecha de asignación" type="date" value={form.fechaAsignacion} onChange={v => set('fechaAsignacion', v)} />
            </div>

            {/* Desglose SIEMPRE visible: qué compone el precio y qué falta.
                Un número solo siempre parece plausible; el desglose no. */}
            <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Zona {zona ?? '—'}{esSai ? ' · San Andrés (transporte)' : ''}</span>
                <span>
                  {[
                    form.tipoSitio !== '' ? TIPO_SITIO_LABEL[form.tipoSitio] : null,
                    form.intensidad !== '' ? INTENSIDAD_LABEL[form.intensidad] : null,
                    form.esJungle === null ? null : form.esJungle ? 'Jungle' : 'No jungle',
                  ].filter(Boolean).join(' · ') || 'sin elegir'}
                </span>
              </div>
              {!seleccionCompleta ? (
                <p className="text-xs text-amber-700 font-medium">
                  El precio aparece cuando todo esté elegido — falta: {faltantes.join(', ')}.
                </p>
              ) : precio ? (
                <>
                  <div className="flex justify-between"><span className="text-gray-500">Valor de matriz ({form.esJungle ? 'jungle' : 'normal'})</span><span className="font-mono">{fmtMoney(precio.base)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Transporte {precio.transporte > 0 ? (esSai ? '(San Andrés)' : '(jungle)') : '(no aplica)'}</span><span className="font-mono">{fmtMoney(precio.transporte)}</span></div>
                  <div className="flex justify-between font-semibold border-t border-gray-100 pt-1"><span>Precio del preventivo</span><span className="font-mono">{fmtMoney(precio.total)}</span></div>
                </>
              ) : (
                <p className="text-xs text-red-600 font-medium">⚠ Combinación no disponible (rooftop solo pesado).</p>
              )}
            </div>
          </div>
        )}

        {!esPreventivo && (
          <TextField
            label="Asunto"
            value={form.asunto}
            onChange={v => set('asunto', v)}
            placeholder="Ej: Adecuaciones estación Ráquira"
            hint="Opcional — título comercial; la cotización lo hereda y queda enlazado (editar uno actualiza el otro)"
          />
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Descripción {esPreventivo ? <span className="text-gray-400 font-normal">(opcional — se genera del sitio)</span> : <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            rows={3}
            placeholder={esPreventivo ? 'Opcional — notas de la asignación…' : 'Qué solicita el cliente…'}
            className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 ${
              errores.descripcion ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {errores.descripcion && <p className="text-xs text-red-600">{errores.descripcion}</p>}
        </div>

        {/* Bloque 1 — identificación del sitio: nombre limpio + código del
            cliente. En preventivos se autocompletan del sitio IHS (editables). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Nombre del sitio"
            value={form.nombreSitio}
            onChange={v => set('nombreSitio', v)}
            error={errores.nombreSitio}
            required={!esPreventivo}
            placeholder={esPreventivo ? (form.sitioNombre.trim() || 'auto: nombre del sitio del preventivo') : 'Ej: ALKARAWI'}
            hint={esPreventivo ? 'Vacío → se toma del sitio del preventivo' : 'Con este nombre se identificará la obra'}
          />
          <TextField
            label="Código del sitio (cliente)"
            value={form.codigoSitio}
            onChange={v => set('codigoSitio', v)}
            error={errores.codigoSitio}
            required={!esPreventivo}
            placeholder={esPreventivo ? (form.sitioId.trim() || 'auto: id del sitio · N/A') : 'Ej: COCUN7002 — N/A si no asigna'}
            hint={esPreventivo ? 'Vacío → id del sitio del cliente o N/A' : "'N/A' si el cliente no asigna código"}
          />
        </div>

        <CoordenadasSitioInput
          value={coordenadas}
          onChange={setCoordenadas}
          direccionSugerida={form.nombreSitio || form.sitioNombre}
        />

        {!esPreventivo && (
          <TextField
            label="Sitio / ubicación"
            value={form.sitio}
            onChange={v => set('sitio', v)}
            hint="Opcional — ubicación/dirección donde se ejecutaría"
          />
        )}

        {/* Adjuntos */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Adjuntos</label>
          <input
            type="file"
            multiple
            onChange={e => setArchivos(Array.from(e.target.files ?? []))}
            className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100"
          />
          {archivos.length > 0 && (
            <p className="text-xs text-gray-500">{archivos.length} archivo(s) seleccionado(s)</p>
          )}
          <p className="text-xs text-gray-400">Opcional. Correos, planos, referencias.</p>
        </div>
      </div>
    </Modal>
  )
}
