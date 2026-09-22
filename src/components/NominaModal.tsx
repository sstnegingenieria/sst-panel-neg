// Nómina precargada del contratista (PR A del diseño 22-sep) — carga por
// PEGADO desde el portapapeles con vista previa (no un formulario de a uno
// ni un asistente): la persona copia las columnas del archivo del
// contratista, pega, y VE qué se interpretó antes de confirmar. Las filas
// advertidas van excluidas por defecto e incluibles a conciencia.
import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import Modal from './shared/Modal'
import { toast } from './shared/Toast'
import { useAuth } from '../contexts/AuthContext'
import {
  parsearPegado, clasificarFilas, patchCargarNomina, patchRetiro,
  ETIQUETA_FILA,
} from '../utils/contratistasNomina'
import type { FilaParseada, NominaContratista, TrabajadorNomina } from '../utils/contratistasNomina'

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

export default function NominaModal({ isOpen, onClose, contratista, nominasOtros }: NominaModalProps) {
  const { user } = useAuth()
  const [nomina, setNomina] = useState<NominaContratista | null>(null)
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<FilaParseada[] | null>(null)
  const [guardando, setGuardando] = useState(false)

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
    if (isOpen) { setTexto(''); setFilas(null); cargar() }
  }, [isOpen, cargar])

  const previsualizar = () => {
    setFilas(clasificarFilas(parsearPegado(texto), nomina, nominasOtros))
  }

  const confirmar = async () => {
    if (!contratista || !filas) return
    const patch = patchCargarNomina(filas, { uid: user?.uid ?? '', nombre: user?.nombre }, Timestamp.now())
    if (!patch) { toast('No hay filas incluidas para cargar', 'error'); return }
    setGuardando(true)
    try {
      const ref = doc(db, 'contratistas', contratista.id, 'privado', 'nomina')
      // El doc puede no existir aún — nace con merge y el patch va por
      // dot-paths (updateDoc exige doc existente).
      if (!nomina) await setDoc(ref, { trabajadores: {} }, { merge: true })
      await updateDoc(ref, patch)
      toast(`Nómina actualizada (${Object.keys(patch).length - 1} trabajadores)`)
      setTexto(''); setFilas(null)
      await cargar()
    } catch {
      toast('Error al guardar la nómina', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const retirar = async (cedulaNorm: string, retirarFlag: boolean) => {
    if (!contratista) return
    try {
      await updateDoc(
        doc(db, 'contratistas', contratista.id, 'privado', 'nomina'),
        patchRetiro(cedulaNorm, retirarFlag, Timestamp.now()),
      )
      await cargar()
    } catch {
      toast('Error al actualizar el trabajador', 'error')
    }
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
          El contratista entrega su listado; aquí se precarga la <b>nómina autorizada</b>. Cuando un
          trabajador se registre en la app, el sistema lo empareja por cédula y lo vincula a este
          contratista — el empleador pasa de declaración libre a dato verificado. Quien no esté acá
          <b> no se bloquea</b>: queda marcado "sin verificar" para revisión.
        </p>

        {/* ── Carga por pegado ── */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700">
            Pegar desde el archivo del contratista
          </label>
          <textarea
            value={texto}
            onChange={e => { setTexto(e.target.value); setFilas(null) }}
            rows={4}
            placeholder={'Copia las columnas (nombre y cédula, en cualquier orden) y pégalas aquí.\nEj.:\nJuan Pérez Gómez\t1.020.345.678\nMaría Ruiz\t52123456'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {filas == null ? (
            <button
              onClick={previsualizar}
              disabled={!texto.trim()}
              className="text-sm px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-medium disabled:opacity-50"
            >
              Ver qué se interpretó
            </button>
          ) : (
            <div className="space-y-2">
              <table className="min-w-full text-xs border border-gray-200 rounded">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 px-2">Incluir</th>
                    <th className="py-1.5 px-2">Nombre</th>
                    <th className="py-1.5 px-2">Cédula</th>
                    <th className="py-1.5 px-2">Normalizada</th>
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
                      <td className="py-1 px-2 font-mono text-gray-500">{f.cedula_norm ?? '—'}</td>
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
                Las filas advertidas van excluidas — márcalas solo a conciencia (p. ej. alguien que
                cambió de contratista). Documentos con letras (pasaporte, PPT) no se interpretan
                como cédula: pendiente de definición para trabajadores extranjeros.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={confirmar}
                  disabled={guardando || !filas.some(f => f.incluir)}
                  className="text-sm px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-medium disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : `Confirmar carga (${filas.filter(f => f.incluir).length})`}
                </button>
                <button
                  onClick={() => setFilas(null)}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  Volver a editar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Nómina vigente ── */}
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
                  <tr key={ced} className={`border-b border-gray-100 ${t.retirado ? 'opacity-50' : ''}`}>
                    <td className="py-1.5 pr-2 text-gray-800">{t.nombre}</td>
                    <td className="py-1.5 pr-2 font-mono text-gray-500">{t.cedula_original}</td>
                    <td className="py-1.5 pr-2 text-gray-400" title={`Cargado por ${t.cargado_por_nombre}`}>
                      {t.fecha_carga?.toDate?.().toLocaleDateString('es-CO') ?? ''}
                    </td>
                    <td className="py-1.5 text-right">
                      {t.retirado ? (
                        <button onClick={() => retirar(ced, false)}
                          className="text-[11px] px-2 py-0.5 rounded border border-green-200 text-green-600 hover:bg-green-50">
                          Reincorporar
                        </button>
                      ) : (
                        <button onClick={() => retirar(ced, true)}
                          className="text-[11px] px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50">
                          Retirar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  )
}
