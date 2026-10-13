// Cierre AUTOMÁTICO de jornada (rebuild marcación 13-oct) — reemplaza el
// recordatorio pasivo del módulo #3.
//
// Al llegar `hora_fin_jornada` (hora LOCAL; ⚠ UNA sola para todo el equipo —
// supuesto nombrado en ConfigHorario): banner de ESQUINA, no-modal, sin
// robar el foco ni interrumpir nada a medio escribir, con countdown de
// `aviso_cierre_min` (default 10): [Seguir trabajando] pospone
// `posponer_min` (default 60, repetible — quien trabaja hasta tarde pospone
// las veces que necesite, incluso cruzando la medianoche: el timer no
// depende del día); [Salir ahora] = salida MANUAL; countdown vencido =
// logout(auto) → salida AUTOMÁTICA, distinguible.
//
// El LATIDO alimenta la decisión: si a la hora de cierre la persona está
// AUSENTE (sin latido local hace más de la gracia), se cierra directo sin
// teatro — no hay nadie para ver el aviso.
//
// Solo roles que marcan (internos + sst); residentes y técnicos fuera.
import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { claveDia, horaFinDe } from '../../../types/sigp/horario'
import type { ConfigHorario, HorariosPersonales } from '../../../types/sigp/horario'
import {
  CLAVE_MARCA_LS, parseMarcaLocal, debeCerrarAlVencer,
  AVISO_CIERRE_MIN_DEFAULT, POSPONER_MIN_DEFAULT, GRACIA_CIERRE_MIN_DEFAULT,
} from '../../../types/sigp/jornada'
import { getUltimaInteraccionMs } from '../../../hooks/usePresencia'
import { accesoResidente, type Rol } from '../../../types/sigp/roles'

const CHEQUEO_MS = 30_000

export default function RecordatorioCierreSesion() {
  const { user, logout, cerrandoSesion } = useAuth()
  const [cfg, setCfg] = useState<{ horaFin: string; aviso: number; posponer: number } | null>(null)
  const [venceMs, setVenceMs] = useState<number | null>(null)   // countdown activo
  const [restante, setRestante] = useState('')
  // Posponer corre el próximo disparo (sobrevive dentro de la pestaña viva;
  // no persiste — un arranque nuevo recalcula desde la hora de config).
  const pospuestoHasta = useRef<number | null>(null)
  const cerrando = useRef(false)

  const marca = !!user && !accesoResidente((user.rol ?? '') as Rol) && user.rol !== 'tecnico'

  useEffect(() => {
    if (!marca || !user) return
    // Config general + horarios por persona: la hora de cierre EFECTIVA es
    // la personal si existe (horaFinDe) — el punto del rebuild por persona.
    Promise.all([
      getDoc(doc(db, 'configuracion', 'horario')),
      getDoc(doc(db, 'configuracion', 'horarios_personales')).catch(() => null),
    ])
      .then(([s, sp]) => {
        const d = s.exists() ? (s.data() as ConfigHorario) : {}
        const personales = sp?.exists() ? (sp.data() as HorariosPersonales).horarios : undefined
        const h = horaFinDe(user.uid, personales, d.hora_fin_jornada)
        if (!h) { setCfg(null); return }
        const num = (v: unknown, def: number, min: number, max: number) =>
          typeof v === 'number' && v >= min && v <= max ? v : def
        setCfg({
          horaFin: h,
          aviso: num(d.aviso_cierre_min, AVISO_CIERRE_MIN_DEFAULT, 1, 60),
          posponer: num(d.posponer_min, POSPONER_MIN_DEFAULT, 5, 480),
        })
      })
      .catch(() => setCfg(null))
  }, [marca, user?.uid])  // eslint-disable-line react-hooks/exhaustive-deps

  // Disparador: pasada la hora de fin (y cualquier posposición), decide —
  // presente → countdown visible · ausente → cierre directo.
  useEffect(() => {
    if (!marca || !cfg || !user) return
    const chequear = () => {
      if (venceMs !== null || cerrando.current || cerrandoSesion) return
      const ahora = Date.now()
      if (pospuestoHasta.current && ahora < pospuestoHasta.current) return
      const [h, m] = cfg.horaFin.split(':').map(Number)
      const hoy = new Date()
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), h, m, 0, 0).getTime()
      // Tras medianoche con posposiciones vivas, `fin` de HOY queda en la
      // tarde de hoy — todavía futuro: no re-dispara hasta la tarde. Bien.
      if (ahora < fin) return
      let marcaLocal = null
      try { marcaLocal = parseMarcaLocal(localStorage.getItem(CLAVE_MARCA_LS(user.uid))) } catch { /* sin LS */ }
      const presente = marcaLocal != null && ahora - marcaLocal.ts < GRACIA_CIERRE_MIN_DEFAULT * 60_000
      if (presente) {
        setVenceMs(ahora + cfg.aviso * 60_000)
      } else {
        // Nadie está para ver el aviso — cierre directo, salida automática.
        cerrando.current = true
        void logout(true)
      }
    }
    chequear()
    const t = setInterval(chequear, CHEQUEO_MS)
    return () => clearInterval(t)
  }, [marca, cfg, user, venceMs, cerrandoSesion, logout])

  // Countdown del banner. Al llegar a 0 decide (ajuste SGI/SST 13-oct):
  // interacción DESPUÉS de aparecer el aviso = la persona sigue trabajando →
  // NO se cierra; se pospone sola y se vuelve a avisar. El cierre automático
  // es para quien ya no está — nadie pierde un formulario a medio escribir.
  useEffect(() => {
    if (venceMs === null || !cfg) return
    const inicioAviso = venceMs - cfg.aviso * 60_000
    const tick = () => {
      const falta = venceMs - Date.now()
      if (falta <= 0) {
        setVenceMs(null)
        if (debeCerrarAlVencer(getUltimaInteraccionMs(), inicioAviso)) {
          if (!cerrando.current) { cerrando.current = true; void logout(true) }
        } else {
          pospuestoHasta.current = Date.now() + cfg.posponer * 60_000
        }
        return
      }
      const min = Math.floor(falta / 60_000)
      const seg = Math.floor((falta % 60_000) / 1000)
      setRestante(`${min}:${String(seg).padStart(2, '0')}`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [venceMs, cfg, logout])

  if (!marca || venceMs === null) return null

  const posponer = () => {
    pospuestoHasta.current = Date.now() + (cfg?.posponer ?? POSPONER_MIN_DEFAULT) * 60_000
    setVenceMs(null)
  }

  return (
    // No-modal, esquina, sin autofocus ni backdrop: no roba el foco ni
    // interrumpe nada a medio escribir.
    <div className="fixed bottom-4 right-4 z-[60] max-w-sm bg-white border border-amber-300 rounded-xl shadow-lg p-4"
      role="status" aria-live="polite">
      <p className="text-sm font-semibold text-gray-800">🕔 Fin de la jornada ({cfg?.horaFin})</p>
      <p className="text-xs text-gray-600 mt-1">
        La sesión se cerrará en <b className="font-mono">{restante}</b> y quedará registrada tu
        salida (automática). Si sigues trabajando, pospón el cierre.
      </p>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={posponer}
          className="text-xs px-3 py-1 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
          Seguir trabajando (+{cfg?.posponer ?? POSPONER_MIN_DEFAULT} min)
        </button>
        <button onClick={() => { setVenceMs(null); if (!cerrando.current) { cerrando.current = true; void logout(false) } }}
          disabled={cerrandoSesion}
          className="text-xs px-3 py-1 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-60 disabled:cursor-wait">
          {cerrandoSesion ? 'Cerrando…' : 'Salir ahora'}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        día local {claveDia(new Date())} · la salida manual queda registrada distinto de la automática
      </p>
    </div>
  )
}
