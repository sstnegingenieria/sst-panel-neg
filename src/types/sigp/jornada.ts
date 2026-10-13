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
 *  mismo día lo RETIRA (la presencia real gana — la CF borra el campo).
 *
 *  Rebuild MARCACIÓN (13-oct): 'automatica' se suma como salida PERSISTIDA
 *  — el cierre de jornada que venció sin respuesta ejecuta el logout y la
 *  escribe (distinguible de la manual). La pestaña CERRADA sin logout sigue
 *  sin escribir nada: su salida queda derivada en lectura, rotulada igual. */
export interface CierreJornada {
  fecha: Timestamp
  tipo: 'manual' | 'automatica'
}

/** ENTRADA = login explícito (regla de negocio 13-oct: "todos se loguean al
 *  llegar — el login es la marcación de entrada"). La primera del día gana;
 *  AUSENTE = el doc nació de un latido con sesión persistida (transición del
 *  arranque) — el tablero muestra "—", jamás se inventa. */
export interface EntradaJornada {
  fecha: Timestamp
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
  entrada?: EntradaJornada
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
/** Countdown del aviso de cierre de jornada antes del logout automático. */
export const AVISO_CIERRE_MIN_DEFAULT = 10
/** Cuánto pospone "Seguir trabajando" el cierre de jornada. */
export const POSPONER_MIN_DEFAULT = 60

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

/** Al VENCER el countdown del aviso de cierre (ajuste 13-oct, levantado por
 *  el frente SGI/SST): el cierre automático es para quien YA NO ESTÁ, no para
 *  quien sigue trabajando e ignoró un banner — alguien a mitad de un
 *  formulario no debe perder lo que escribe. Si hubo interacción DESPUÉS de
 *  que el aviso apareció, la sesión NO se cierra: se pospone sola y se vuelve
 *  a avisar más tarde. Diez minutos de aviso sin un solo input = ausente. */
export function debeCerrarAlVencer(ultimaInteraccionMs: number, inicioAvisoMs: number): boolean {
  return ultimaInteraccionMs <= inicioAvisoMs
}

// ── Guard de arranque: día nuevo exige LOGIN (la marcación de entrada) ───────
// La sesión persistida que despierta en un día nuevo recibe signOut → login →
// entrada. La decisión usa la MARCA LOCAL del último latido/entrada (clave
// por uid en localStorage, {dia, ts}) para NO expulsar a quien cruza la
// medianoche trabajando (precisión 1): una recarga a las 00:30 con marca de
// las 00:25 es continuación, no un día nuevo de verdad.

export const CLAVE_MARCA_LS = (uid: string) => `sigp.jornada.marca.${uid}`

export interface MarcaLocal { dia: string; ts: number }

export function parseMarcaLocal(valor: string | null): MarcaLocal | null {
  if (!valor) return null
  try {
    const m = JSON.parse(valor) as MarcaLocal
    return typeof m?.dia === 'string' && typeof m?.ts === 'number' ? m : null
  } catch { return null }
}

/** ¿Forzar logout al restaurar la sesión? true cuando la marca local es de
 *  OTRO día y además VIEJA (más que la gracia — una marca de hace minutos
 *  cruzando medianoche es trabajo en curso). Sin marca local (navegador
 *  nuevo, LS limpio) → forzar: mejor pedir un login de más que perder una
 *  entrada. El login explícito nunca pasa por aquí. */
export function debeForzarLogin(
  marca: MarcaLocal | null, diaHoy: string, ahoraMs: number, graciaMin: number,
): boolean {
  if (!marca) return true
  if (marca.dia === diaHoy) return false
  return ahoraMs - marca.ts > graciaMin * 60_000
}

// ── Cierre efectivo (derivado en lectura) ────────────────────────────────────

export type CierreEfectivo =
  | { estado: 'presente' }                                  // latido fresco, sin salida
  | { estado: 'manual'; fecha: Timestamp }                  // la persona cerró sesión
  | { estado: 'automatico'; fecha: Timestamp }              // vencido o pestaña muerta

/** Interpreta la jornada SIN escribir nada: la salida persistida gana
 *  (manual o automática); sin salida, latido más viejo que la gracia =
 *  salida AUTOMÁTICA derivada en el último latido (pestaña cerrada sin
 *  logout); latido dentro de la gracia = sigue en jornada. */
export function cierreEfectivo(j: Pick<Jornada, 'ultimo_latido' | 'cierre'>, ahoraMs: number, graciaMin: number): CierreEfectivo {
  if (j.cierre) {
    return { estado: j.cierre.tipo === 'manual' ? 'manual' : 'automatico', fecha: j.cierre.fecha }
  }
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
  const entradaRaw = data.entrada as { fecha?: Timestamp } | undefined
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
    ...(entradaRaw?.fecha?.toDate ? { entrada: { fecha: entradaRaw.fecha } } : {}),
    ...(cierreRaw?.fecha?.toDate && (cierreRaw.tipo === 'manual' || cierreRaw.tipo === 'automatica')
      ? { cierre: { fecha: cierreRaw.fecha, tipo: cierreRaw.tipo as 'manual' | 'automatica' } }
      : {}),
  }
}
