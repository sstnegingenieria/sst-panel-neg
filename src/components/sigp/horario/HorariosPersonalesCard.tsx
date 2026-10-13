// Horarios POR PERSONA (13-oct) — hora de CIERRE individual con fallback a la
// general. La administra gerencia_administrativa + admin (puedeGestionarHorarioUI,
// espejo de gestionaHorario() en reglas — el mismo dueño de ausentismos); los
// demás roles con acceso a la pestaña la ven en solo lectura.
//
// Campo VACÍO = la persona usa la hora general (borrar devuelve al horario de
// la empresa, sin estados raros). Solo lista a quienes MARCAN (internos + sst;
// técnicos y residentes fuera — no tienen reloj de panel).
//
// ⚠ Solo hora de CIERRE — las líneas duras (sin variación por día, sin control
// de puntualidad) viven en types/sigp/horario.ts junto al tipo.
import { useState } from 'react'
import { collection, deleteField, doc, getDoc, getDocs, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import { puedeGestionarHorarioUI } from '../../../types/sigp/permisos'
import { esHoraValida } from '../../../types/sigp/horario'
import type { HorariosPersonales } from '../../../types/sigp/horario'
import { accesoResidente, type Rol } from '../../../types/sigp/roles'

interface Persona { uid: string; nombre: string; rol: string }

export default function HorariosPersonalesCard({ horaGeneral }: { horaGeneral: string | null }) {
  const { user } = useAuth()
  const puedeEditar = puedeGestionarHorarioUI(user?.rol)

  const [abierto, setAbierto] = useState(false)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [horas, setHoras] = useState<Record<string, string>>({})
  const [cargado, setCargado] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    if (cargado) return
    try {
      const [usersSnap, horariosSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDoc(doc(db, 'configuracion', 'horarios_personales')).catch(() => null),
      ])
      const items: Persona[] = []
      usersSnap.docs.forEach(d => {
        const data = d.data() as Record<string, unknown>
        const rol = (data.rol as string) ?? ''
        if (data.estado === 'activo' && rol !== 'tecnico' && !accesoResidente(rol as Rol)) {
          items.push({ uid: d.id, nombre: (data.nombre as string) ?? d.id, rol })
        }
      })
      setPersonas(items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      const data = horariosSnap?.exists() ? (horariosSnap.data() as HorariosPersonales) : {}
      setHoras({ ...(data.horarios ?? {}) })
      setCargado(true)
    } catch {
      toast('No se pudieron cargar los horarios', 'error')
    }
  }

  const toggle = () => { const abrir = !abierto; setAbierto(abrir); if (abrir) void cargar() }

  const algunaInvalida = Object.values(horas).some(h => h.trim() !== '' && !esHoraValida(h))

  const guardar = async () => {
    if (algunaInvalida) return
    setGuardando(true)
    try {
      const ref = doc(db, 'configuracion', 'horarios_personales')
      // El doc puede no existir aún (updateDoc exige existente).
      await setDoc(ref, {}, { merge: true })
      const patch: Record<string, unknown> = {
        actualizado_por: user?.uid ?? '',
        fecha_actualizacion: Timestamp.now(),
      }
      for (const p of personas) {
        const v = (horas[p.uid] ?? '').trim()
        patch[`horarios.${p.uid}`] = v && esHoraValida(v) ? v : deleteField()
      }
      await updateDoc(ref, patch)
      toast('Horarios por persona guardados')
    } catch {
      toast('Error al guardar (verifica tu rol)', 'error')
    } finally { setGuardando(false) }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700">
        <span>🕔 Horarios por persona</span>
        <span className="text-gray-400 text-xs">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs text-gray-500">
            Hora de <b>cierre</b> individual (jornadas fijas, iguales todos los días). Campo vacío =
            usa la hora general{horaGeneral ? ` (${horaGeneral})` : ''}. Solo cambia a qué hora avisa
            y cierra la sesión — nada más.
          </p>
          {!cargado ? (
            <p className="text-xs text-gray-400">Cargando…</p>
          ) : (
            <div className="space-y-1.5 max-w-md">
              {personas.map(p => {
                const v = horas[p.uid] ?? ''
                const invalida = v.trim() !== '' && !esHoraValida(v)
                return (
                  <div key={p.uid} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-gray-800 truncate">
                      {p.nombre} <span className="text-xs text-gray-400">· {p.rol}</span>
                    </span>
                    {puedeEditar ? (
                      <input value={v} onChange={e => setHoras(h => ({ ...h, [p.uid]: e.target.value }))}
                        placeholder={horaGeneral ?? 'HH:mm'}
                        className={`w-24 text-sm px-2 py-1 border rounded-lg font-mono text-center focus:outline-none focus:ring-2 ${
                          invalida ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-brand-300'}`} />
                    ) : (
                      <span className="w-24 text-sm font-mono text-center text-gray-600">
                        {v.trim() || <span className="text-gray-300">general</span>}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {puedeEditar && cargado && (
            <div className="flex items-center justify-end gap-3">
              {algunaInvalida && <span className="text-xs text-red-600">Hay horas inválidas — usa HH:mm</span>}
              <button onClick={guardar} disabled={guardando || algunaInvalida}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
