// Jornada por PRESENCIA (rebuild oct-2026, diseño aprobado por Giovanny) —
// reemplaza el modelo de ARRANQUES del módulo #3.
//
// QUÉ MIDE: presencia — panel vivo Y en uso (interacción real). NO mide
// arranques de la app (el modelo anterior: una pestaña abierta días enteros
// no "arrancaba" y la persona figuraba ausente trabajando — caso Paula,
// 09-oct) y NO mide actividad fina (decisión explícita: vigilar qué hace la
// gente cuesta más confianza de la que da).
//
// MECÁNICA: el panel LATE — la CF `latidoJornada` upserta UN doc por persona
// por día local de Bogotá (`jornadas/{uid}_{YYYY-MM-DD}`, clave calculada
// SERVER-SIDE). El latido se dispara desde la interacción real (puntero/
// tecla/scroll), la PRIMERA del día de inmediato (agregado 2 de Giovanny: la
// hora de inicio no espera el reloj) y después a ventana de LATIDO_MIN. Una
// pestaña abandonada no recibe interacción → no late → no genera jornada:
// uso vs abandono queda resuelto por construcción, sin heurística.
//
// 🔒 PRIVACIDAD — LÍNEA DURA (si el modelo permite guardar más, el modelo
// está mal): este tipo es CERRADO. No existe ni debe agregarse campo alguno
// de páginas visitadas, clics, rutas ni tiempo por pantalla. La CF recibe
// solo {accion}; lo que el cliente no puede mandar, el servidor no puede
// guardar. El dato más fino que existe es `latidos` — densidad agregada del
// día en bloques de LATIDO_MIN, no una traza.
//
// HISTORIA: `registros_horario` (eventos ingreso/salida) queda CONGELADO
// como histórico — inmutable como siempre, sin backfill; el panel deja de
// emitir esos eventos. El corte de fechas es visible en el tablero.

import type { Timestamp } from 'firebase/firestore'
import type { DispositivoHorario } from './horario'

/** Cierre PERSISTIDO: solo el manual (botón Salir / pop-up de fin de
 *  jornada). El cierre AUTOMÁTICO no se escribe: se DERIVA en lectura
 *  (cierreEfectivo) — cero schedulers, y el almuerzo largo se resuelve solo
 *  (si la persona vuelve, el latido corre el cierre derivado; un cierre
 *  escrito habría sido falso). Un latido posterior a un cierre manual del
 *  mismo día lo RETIRA (la presencia real gana — la CF borra el campo). */
export interface CierreJornada {
  fecha: Timestamp
  tipo: 'manual'
}

export interface Jornada {
  id: string
  uid: string
  nombre: string
  rol: string
  /** Día local de Bogotá YYYY-MM-DD — lo calcula la CF (server-side, inmune
   *  al reloj del navegador). La medianoche parte jornadas por construcción:
   *  el latido de las 00:01 cae en el doc del día nuevo. */
  dia: string
  /** Primer latido del día (= primera interacción, no primer arranque). */
  inicio: Timestamp
  ultimo_latido: Timestamp
  /** Conteo de latidos del día — densidad de presencia agregada. */
  latidos: number
  en_oficina_inicio: boolean | null
  en_oficina_ultimo: boolean | null
  dispositivo: DispositivoHorario
  cierre?: CierreJornada
}

// ── Parámetros (defaults; configurables en configuracion/horario sin deploy) ──
// Supuestos NOMBRADOS, no verdades — se ajustan con el uso real.

/** Ventana del latido: con uso continuo, un latido cada N minutos. */
export const LATIDO_MIN_DEFAULT = 10
/** Gracia del cierre derivado: sin latido hace más de esto = jornada
 *  cerrada automáticamente en su último latido (3 latidos perdidos). */
export const GRACIA_CIERRE_MIN_DEFAULT = 30
/** "Presente ahora" = latido hace menos de esto. */
export const VENTANA_PRESENTE_MIN_DEFAULT = 15

/** Roles cuya operación vive en la APP MÓVIL / en obra, no en el panel
 *  (agregado 1 de Giovanny — el hueco de Juan Carlos): este módulo mide
 *  presencia EN EL PANEL, así que para estos roles un cero NO es ausencia
 *  — pueden estar trabajando todo el día en obra sin tocar el panel, y un
 *  técnico en obra no tiene cómo defenderse mostrando una pantalla. El
 *  tablero los muestra en sección APARTE que lo dice (si usan el panel, su
 *  presencia igualmente se registra y se ve). `tecnico` no aparece porque
 *  no entra al panel; los residentes de cliente no marcan por diseño C2.1. */
export const ROLES_OPERAN_EN_APP = ['sst', 'residente_sst'] as const
export const operaEnApp = (rol: string | undefined): boolean =>
  ROLES_OPERAN_EN_APP.includes((rol ?? '') as (typeof ROLES_OPERAN_EN_APP)[number])

// ── Decisión de latir (puro — la usa el hook de presencia) ───────────────────

/** ¿Debe latir AHORA? `msUltimoLatido` = epoch del último latido exitoso de
 *  ESTE día local, o null si aún no hay (primera interacción del día → late
 *  DE INMEDIATO, la hora de inicio no espera el tick); después, solo cuando
 *  la ventana venció. Se llama desde el handler de interacción — sin
 *  interacción nadie llama, así que el abandono no late por construcción. */
export function debeLatir(msUltimoLatido: number | null, ahoraMs: number, latidoMin: number): boolean {
  if (msUltimoLatido == null) return true
  return ahoraMs - msUltimoLatido >= latidoMin * 60_000
}

// ── Cierre efectivo (derivado en lectura) ────────────────────────────────────

export type CierreEfectivo =
  | { estado: 'presente' }                                  // latido fresco, sin cierre
  | { estado: 'manual'; fecha: Timestamp }                  // la persona salió
  | { estado: 'automatico'; fecha: Timestamp }              // el latido se detuvo

/** Interpreta la jornada SIN escribir nada: cierre manual persiste y gana;
 *  sin cierre, latido más viejo que la gracia = cierre AUTOMÁTICO en el
 *  último latido (derivado — distinguible del manual en todo rótulo);
 *  latido dentro de la gracia = sigue presente. */
export function cierreEfectivo(j: Pick<Jornada, 'ultimo_latido' | 'cierre'>, ahoraMs: number, graciaMin: number): CierreEfectivo {
  if (j.cierre) return { estado: 'manual', fecha: j.cierre.fecha }
  const msDesde = ahoraMs - j.ultimo_latido.toMillis()
  if (msDesde > graciaMin * 60_000) return { estado: 'automatico', fecha: j.ultimo_latido }
  return { estado: 'presente' }
}

/** "Presente ahora": latido dentro de la ventana y sin salida manual. */
export function presenteAhora(j: Pick<Jornada, 'ultimo_latido' | 'cierre'>, ahoraMs: number, ventanaMin: number): boolean {
  if (j.cierre) return false
  return ahoraMs - j.ultimo_latido.toMillis() < ventanaMin * 60_000
}

/** Normaliza un doc crudo de `jornadas` (defensivo — un doc malformado no
 *  tumba la bandeja; null = descartarlo). */
export function normalizarJornada(id: string, data: Record<string, unknown>): Jornada | null {
  const inicio = data.inicio as Timestamp | undefined
  const ultimo = data.ultimo_latido as Timestamp | undefined
  if (typeof data.uid !== 'string' || typeof data.dia !== 'string' || !inicio?.toDate || !ultimo?.toDate) return null
  const cierreRaw = data.cierre as { fecha?: Timestamp; tipo?: string } | undefined
  return {
    id,
    uid: data.uid,
    nombre: typeof data.nombre === 'string' ? data.nombre : 'Sin nombre',
    rol: typeof data.rol === 'string' ? data.rol : '',
    dia: data.dia,
    inicio,
    ultimo_latido: ultimo,
    latidos: typeof data.latidos === 'number' ? data.latidos : 0,
    en_oficina_inicio: typeof data.en_oficina_inicio === 'boolean' ? data.en_oficina_inicio : null,
    en_oficina_ultimo: typeof data.en_oficina_ultimo === 'boolean' ? data.en_oficina_ultimo : null,
    dispositivo: data.dispositivo === 'escritorio' || data.dispositivo === 'movil' ? data.dispositivo : 'desconocido',
    ...(cierreRaw?.fecha?.toDate && cierreRaw.tipo === 'manual'
      ? { cierre: { fecha: cierreRaw.fecha, tipo: 'manual' as const } }
      : {}),
  }
}
