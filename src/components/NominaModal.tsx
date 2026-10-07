// Nómina del contratista (PR A 22-sep + Paquete GI · C5a oct-2026).
//
// DOS CAMINOS de carga para dos situaciones distintas (ninguno reemplaza al
// otro): "＋ Agregar persona" de a una (llegaron dos nombres por WhatsApp —
// nombre y cédula, guardar, listo) y el PEGADO masivo para listas largas,
// ahora con VISTA PREVIA AUTOMÁTICA al pegar (el clic intermedio era donde
// se perdía la gente — lección: construir la capacidad no es crear el
// camino hacia ella).
//
// FICHA DOCUMENTAL por persona (C3a-mínimo adelantado): EPS/ARL/pensión/
// alturas con vencimiento (REUSO de utils/vencimiento.ts — un solo sistema
// de vencimientos) + exámenes médicos de ingreso/egreso como HECHO
// documental (fecha + archivo en ruta RESTRINGIDA de Storage: solo GI y
// admin). Sin texto libre clínico POR TIPO.
import { useState, useEffect, useCallback } from 'react'
import type { ChangeEvent } from 'react'
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase/config'
import Modal from './shared/Modal'
import { toast } from './shared/Toast'
import { useAuth } from '../contexts/AuthContext'
import { getDocEstado, estadoLabel, estadoClasses, formatFechaVenc } from '../utils/vencimiento'
import {
  parsearPegado, clasificarFilas, patchCargarNomina, patchRetiro,
  patchAgregarPersona, patchDocumentoPersona,
  CAMPOS_DOC_PERSONA, ETIQUETA_DOC_PERSONA, ES_EXAMEN_MEDICO,
  ETIQUETA_FILA,
} from '../utils/contratistasNomina'
import type {
  FilaParseada, NominaContratista, TrabajadorNomina, CampoDocPersona,
} from '../utils/contratistasNomina'

interface NominaModalProps {
  isOpen: boolean
  onClose: () => void
  contratista: { id: string; nombre: string } | null
  /** Nóminas VIVAS de los demás contratistas (guard "en otra nómina"). */
  nominasOtros: Record<string, Set<string>>
}

const CHIP_FILA: Record<string, string> = {
  nueva: 'bg-emerald-50 text-emerald-700',
  reincorporar: 'bg-brand-50 text-brand-700',
  ya_en_nomina: 'bg-gray-100 text-gray-500',
  duplicada_pegado: 'bg-amber-50 text-amber-700',
  sin_cedula: 'bg-amber-50 text-amber-700',
  sin_nombre: 'bg-amber-50 text-amber-700',
  en_otra_nomina: 'bg-amber-50 text-amber-700',
}

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024

function archivoValido(file: File): boolean {
  const esPdfOImagen = file.type === 'application/pdf' || file.type.startsWith('image/')
  if (!esPdfOImagen) { toast('El archivo debe ser un PDF o una imagen', 'error'); return false }
  if (file.size > MAX_ARCHIVO_BYTES) { toast('El archivo no puede superar 10MB', 'error'); return false }
  return true
}

const extensionDe = (file: File): string => {
  const partes = file.name.split('.')
  return partes.length > 1 ? partes[partes.length - 1] : 'dat'
}

export default function NominaModal({ isOpen, onClose, contratista, nominasOtros }: NominaModalProps) {
  const { user } = useAuth()
  const [nomina, setNomina] = useState<NominaContratista | null>(null)
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<FilaParseada[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  // C5a — agregar de a una
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaCedula, setNuevaCedula] = useState('')
  // C5a — ficha documental expandida (cédula normalizada o null)
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)   // `${ced}.${campo}`

  const refNomina = useCallback(() =>
    doc(db, 'contratistas', contratista!.id, 'privado', 'nomina'), [contratista])

  const cargar = useCallback(async () => {
    if (!contratista) return
    try {
      const s = await getDoc(doc(db, 'contratistas', contratista.id, 'privado', 'nomina'))
      setNomina(s.exists() ? (s.data() as NominaContratista) : null)
    } catch {
      toast('No se pudo leer la nómina', 'error')
    }
  }, [contratista])

  useEffect(() => {
    if (isOpen) {
      setTexto(''); setFilas(null); setNuevoNombre(''); setNuevaCedula(''); setFichaAbierta(null)
      cargar()
    }
  }, [isOpen, cargar])

  // ── Vista previa AUTOMÁTICA (OK 08-oct): se interpreta al pegar/teclear,
  //    con un debounce corto — desapareció el clic intermedio. ──
  useEffect(() => {
    if (!texto.trim()) { setFilas(null); return }
    const t = setTimeout(() => {
      setFilas(clasificarFilas(parsearPegado(texto), nomina, nominasOtros))
    }, 250)
    return () => clearTimeout(t)
  }, [texto, nomina, nominasOtros])

  /** El doc puede no existir aún — nace con merge (updateDoc exige existente). */
  const escribir = async (patch: Record<string, unknown>) => {
    if (!nomina) await setDoc(refNomina(), { trabajadores: {} }, { merge: true })
    await updateDoc(refNomina(), patch)
  }

  const confirmar = async () => {
    if (!contratista || !filas) return
    const patch = patchCargarNomina(filas, { uid: user?.uid ?? '', nombre: user?.nombre }, Timestamp.now())
    if (!patch) { toast('No hay filas incluidas para cargar', 'error'); return }
    setGuardando(true)
    try {
      await escribir(patch)
      toast('Nómina actualizada')
      setTexto(''); setFilas(null)
      await cargar()
    } catch {
      toast('Error al guardar la nómina', 'error')
    } finally { setGuardando(false) }
  }

  const agregarUna = async () => {
    if (!contratista) return
    const r = patchAgregarPersona(nomina, nuevoNombre, nuevaCedula, nominasOtros,
      { uid: user?.uid ?? '', nombre: user?.nombre }, Timestamp.now())
    if (!r.ok) { toast(r.motivo, 'error'); return }
    setGuardando(true)
    try {
      await escribir(r.patch)
      toast(r.tipo === 'reincorporada' ? 'Persona reincorporada a la nómina' : 'Persona agregada a la nómina')
      setNuevoNombre(''); setNuevaCedula('')
      await cargar()
    } catch {
      toast('Error al agregar la persona', 'error')
    } finally { setGuardando(false) }
  }

  const retirar = async (cedulaNorm: string, retirarFlag: boolean) => {
    if (!contratista) return
    try {
      await updateDoc(refNomina(), patchRetiro(cedulaNorm, retirarFlag, Timestamp.now()))
      await cargar()
    } catch {
      toast('Error al actualizar el trabajador', 'error')
    }
  }

  // ── Ficha documental: guardar fecha y/o archivo de UN documento ──
  const guardarDoc = async (ced: string, campo: CampoDocPersona, fecha?: string, archivo?: File) => {
    if (!contratista) return
    const actual = (nomina?.trabajadores?.[ced]?.[campo] ?? {}) as { vencimiento?: string; fecha?: string; archivo_url?: string }
    setSubiendo(`${ced}.${campo}`)
    try {
      let archivo_url = actual.archivo_url
      if (archivo) {
        const carpeta = ES_EXAMEN_MEDICO(campo) ? 'examenes' : 'documentos'
        const path = `contratistas/${contratista.id}/nomina/${ced}/${carpeta}/${crypto.randomUUID()}.${extensionDe(archivo)}`
        const snap = await uploadBytes(ref(storage, path), archivo)
        archivo_url = await getDownloadURL(snap.ref)
      }
      const claveFecha = ES_EXAMEN_MEDICO(campo) ? 'fecha' : 'vencimiento'
      const valor = {
        ...(fecha ? { [claveFecha]: fecha } : (actual.vencimiento || actual.fecha) ? { [claveFecha]: actual.vencimiento ?? actual.fecha } : {}),
        ...(archivo_url ? { archivo_url } : {}),
      }
      await escribir(patchDocumentoPersona(ced, campo, valor, Timestamp.now()))
      toast(`${ETIQUETA_DOC_PERSONA[campo]} guardado`)
      await cargar()
    } catch {
      toast(`Error al guardar ${ETIQUETA_DOC_PERSONA[campo]} (verifica tu rol)`, 'error')
    } finally { setSubiendo(null) }
  }

  const trabajadores = Object.entries(nomina?.trabajadores ?? {})
    .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, 'es')) as [string, TrabajadorNomina][]
  const vivos = trabajadores.filter(([, t]) => !t.retirado).length

  return (
    <Modal
      isOpen={isOpen}
      title={`Nómina autorizada — ${contratista?.nombre ?? ''}`}
      onClose={onClose}
      size="xl"
      actions={[{ label: 'Cerrar', onClick: onClose, variant: 'secondary' }]}
    >
      <div className="space-y-5">
        <p className="text-xs text-gray-500">
          El contratista entrega su gente; aquí se precarga la <b>nómina autorizada</b> y la carpeta
          documental de cada persona. Cuando un trabajador se registre en la app, el sistema lo
          empareja por cédula — el empleador pasa de declaración libre a dato verificado. Quien no
          esté acá <b>no se bloquea</b>: queda "sin verificar" para revisión.
        </p>

        {/* ── C5a: agregar DE A UNA (el camino del WhatsApp) ── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-700">＋ Agregar persona</p>
          <div className="flex gap-2 flex-wrap items-end">
            <label className="block text-xs text-gray-600 flex-1 min-w-[180px]">
              Nombre completo
              <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="block text-xs text-gray-600 w-40">
              Cédula
              <input value={nuevaCedula} onChange={e => setNuevaCedula(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <button onClick={agregarUna} disabled={guardando || !nuevoNombre.trim() || !nuevaCedula.trim()}
              className="text-sm px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-medium disabled:opacity-50">
              Guardar
            </button>
          </div>
        </div>

        {/* ── Pegado masivo (para listas largas) — vista previa AUTOMÁTICA ── */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700">
            O pegar una lista desde el archivo del contratista
          </label>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={3}
            placeholder={'Copia las columnas (nombre y cédula, en cualquier orden) y pégalas aquí — la vista previa aparece sola.\nEj.:\nJuan Pérez Gómez\t1.020.345.678'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {filas != null && (
            <div className="space-y-2">
              <table className="min-w-full text-xs border border-gray-200 rounded">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 px-2">Incluir</th>
                    <th className="py-1.5 px-2">Nombre</th>
                    <th className="py-1.5 px-2">Cédula</th>
                    <th className="py-1.5 px-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 px-2">
                        <input
                          type="checkbox"
                          checked={f.incluir}
                          disabled={f.cedula_norm == null || f.estado === 'sin_nombre' || f.estado === 'duplicada_pegado'}
                          onChange={e => setFilas(fs => fs!.map((x, j) => j === i ? { ...x, incluir: e.target.checked } : x))}
                        />
                      </td>
                      <td className="py-1 px-2 text-gray-800">{f.nombre || <span className="text-gray-400">—</span>}</td>
                      <td className="py-1 px-2 font-mono">{f.cedula_original || <span className="text-gray-400" title={f.linea}>{f.linea.slice(0, 30)}</span>}</td>
                      <td className="py-1 px-2">
                        <span className={`inline-flex px-1.5 py-px rounded font-medium ${CHIP_FILA[f.estado]}`}>
                          {ETIQUETA_FILA[f.estado]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400">
                Las filas advertidas van excluidas — márcalas solo a conciencia. Documentos con
                letras (pasaporte, PPT) no se interpretan como cédula: pendiente de definición.
              </p>
              <button
                onClick={confirmar}
                disabled={guardando || !filas.some(f => f.incluir)}
                className="text-sm px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-medium disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : `Confirmar carga (${filas.filter(f => f.incluir).length})`}
              </button>
            </div>
          )}
        </div>

        {/* ── Nómina vigente + ficha documental ── */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1.5">
            Nómina vigente <span className="font-normal text-gray-400">({vivos} activos{trabajadores.length > vivos ? ` · ${trabajadores.length - vivos} retirados` : ''})</span>
          </h3>
          {trabajadores.length === 0 ? (
            <p className="text-xs text-gray-400">Sin trabajadores precargados todavía.</p>
          ) : (
            <table className="min-w-full text-xs">
              <tbody>
                {trabajadores.map(([ced, t]) => (
                  <Fila key={ced} ced={ced} t={t}
                    abierta={fichaAbierta === ced}
                    onToggle={() => setFichaAbierta(fichaAbierta === ced ? null : ced)}
                    onRetirar={retirar}
                    onGuardarDoc={guardarDoc}
                    subiendo={subiendo}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Fila de persona + su ficha documental expandible ────────────────────────

function Fila({ ced, t, abierta, onToggle, onRetirar, onGuardarDoc, subiendo }: {
  ced: string
  t: TrabajadorNomina
  abierta: boolean
  onToggle: () => void
  onRetirar: (ced: string, retirar: boolean) => void
  onGuardarDoc: (ced: string, campo: CampoDocPersona, fecha?: string, archivo?: File) => Promise<void>
  subiendo: string | null
}) {
  // El peor estado de los 4 documentales con vencimiento (semáforo mínimo —
  // el semáforo completo y la completitud llegan con el resto del C3).
  const estados = (['eps', 'arl', 'pension', 'alturas'] as const).map(c => getDocEstado(t[c]?.vencimiento))
  const peor = estados.includes('vencido') ? 'vencido' : estados.includes('proximo') ? 'proximo'
    : estados.every(e => e === 'ok') ? 'ok' : 'sin_fecha'
  return (
    <>
      <tr className={`border-b border-gray-100 ${t.retirado ? 'opacity-50' : ''}`}>
        <td className="py-1.5 pr-2 text-gray-800 cursor-pointer" onClick={onToggle}>
          <span className={`mr-1 inline-block text-gray-300 transition-transform ${abierta ? 'rotate-90' : ''}`}>▸</span>
          {t.nombre}
        </td>
        <td className="py-1.5 pr-2 font-mono text-gray-500">{t.cedula_original}</td>
        <td className="py-1.5 pr-2">
          <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-medium ${estadoClasses[peor]}`}
            title="Documentos con vencimiento (EPS/ARL/pensión/alturas) — el peor estado gana">
            {peor === 'sin_fecha' ? 'Docs sin cargar' : estadoLabel(peor)}
          </span>
        </td>
        <td className="py-1.5 pr-2 text-gray-400" title={`Cargado por ${t.cargado_por_nombre}`}>
          {t.fecha_carga?.toDate?.().toLocaleDateString('es-CO') ?? ''}
        </td>
        <td className="py-1.5 text-right">
          {t.retirado ? (
            <button onClick={() => onRetirar(ced, false)}
              className="text-[11px] px-2 py-0.5 rounded border border-green-200 text-green-600 hover:bg-green-50">
              Reincorporar
            </button>
          ) : (
            <button onClick={() => onRetirar(ced, true)}
              className="text-[11px] px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50">
              Retirar
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-gray-100 bg-gray-50/60">
          <td colSpan={5} className="px-6 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAMPOS_DOC_PERSONA.map(campo => (
                <DocCampo key={campo} ced={ced} campo={campo}
                  valor={t[campo]}
                  ocupado={subiendo === `${ced}.${campo}`}
                  onGuardar={onGuardarDoc} />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              Los exámenes médicos guardan SOLO el hecho (fecha y archivo) y su archivo queda en ruta
              restringida a Gestión Integral y admin — ningún contenido clínico entra al sistema.
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

function DocCampo({ ced, campo, valor, ocupado, onGuardar }: {
  ced: string
  campo: CampoDocPersona
  valor?: { vencimiento?: string; fecha?: string; archivo_url?: string }
  ocupado: boolean
  onGuardar: (ced: string, campo: CampoDocPersona, fecha?: string, archivo?: File) => Promise<void>
}) {
  const esExamen = ES_EXAMEN_MEDICO(campo)
  const fechaActual = esExamen ? valor?.fecha : valor?.vencimiento
  const [fecha, setFecha] = useState(fechaActual ?? '')
  const estado = esExamen ? null : getDocEstado(valor?.vencimiento)
  const onArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!archivoValido(f)) { e.target.value = ''; return }
    void onGuardar(ced, campo, fecha || undefined, f)
    e.target.value = ''
  }
  return (
    <div className="rounded border border-gray-200 bg-white px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-700">
          {ETIQUETA_DOC_PERSONA[campo]}
          {esExamen && <span className="ml-1.5 text-[9px] font-medium text-rose-600" title="Archivo en ruta restringida — solo Gestión Integral y admin">🔒 restringido</span>}
        </span>
        {estado && fechaActual && (
          <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-medium ${estadoClasses[estado]}`}>
            {estadoLabel(estado)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] text-gray-500">
          {esExamen ? 'Fecha' : 'Vence'}
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            onBlur={() => { if (fecha && fecha !== fechaActual) void onGuardar(ced, campo, fecha) }}
            className="ml-1.5 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-300" />
        </label>
        {fechaActual && !esExamen && <span className="text-[10px] text-gray-400">({formatFechaVenc(fechaActual)})</span>}
        <label className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer ${ocupado ? 'opacity-50' : 'border-brand-300 text-brand-700 hover:bg-brand-50'}`}>
          {ocupado ? 'Subiendo…' : valor?.archivo_url ? 'Reemplazar archivo' : '📎 Adjuntar'}
          <input type="file" accept=".pdf,image/*" className="hidden" onChange={onArchivo} disabled={ocupado} />
        </label>
        {valor?.archivo_url && (
          <a href={valor.archivo_url} target="_blank" rel="noreferrer"
            className="text-[10px] text-brand-700 underline underline-offset-2 font-medium">ver</a>
        )}
      </div>
    </div>
  )
}
