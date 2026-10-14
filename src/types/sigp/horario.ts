// Validador de horario / asistencia (#3) — tipos y helper puro de apareo.
//
// `registros_horario` son EVENTOS PLANOS escritos SOLO por la CF
// registrarEventoHorario (timestamp/IP/dispositivo server-side). El par
// ingreso↔salida y los "sin salida" son INTERPRETACIÓN de lectura: se
// derivan aquí (puro, testeable) — la CF es stateless a propósito.

import type { Timestamp } from 'firebase/firestore'

// ── Registros de reloj ────────────────────────────────────────────────────────

export type TipoEventoHorario = 'ingreso' | 'salida'
export type DispositivoHorario = 'escritorio' | 'movil' | 'desconocido'

export interface RegistroHorario {
  id: string
  uid: string
  nombre: string
  rol: string
  tipo: TipoEventoHorario
  fecha: Timestamp
  ip: string
  /** true/false = juzgado contra configuracion/horario.ips_oficina;
   *  null = sin config o sin IP determinable — la UI muestra "—". */
  en_oficina: boolean | null
  /** SOLO LECTURA — existe únicamente en 7 documentos del 01–06 oct-2026.
   *  Origen: ETB reasignó la IP pública de la oficina el 01-oct y la config
   *  tenía la vieja hasta el 07-oct, así que esas marcaciones (hechas DESDE
   *  la oficina, IP 186.28.10.84) quedaron etiquetadas en_oficina=false por
   *  artefacto de la config. Se corrigieron por ACTO DE DATOS autorizado
   *  nominalmente (dry-run → autorización de Giovanny → commit atómico →
   *  post-verificación; bitácora v2.5.71), dejando esta traza en el doc.
   *  NO EXISTE NI DEBE EXISTIR camino en el panel para producir este campo:
   *  `registros_horario` es inmutable desde el cliente (regla
   *  `create/update/delete: if false` — nadie corrige el reloj) y eso se
   *  REAFIRMÓ al cierre del incidente. Fue un acto irrepetible con fricción
   *  deliberada (instrucción explícita + autorización nominal + traza), no
   *  una funcionalidad. */
  correccion_en_oficina?: { fecha: Timestamp; motivo: string }
  dispositivo: DispositivoHorario
  user_agent?: string
}

/** Jornada derivada: un ingreso con (o sin) su salida del MISMO día local,
 *  o una salida huérfana (sin ingreso previo ese día). */
export interface JornadaDia {
  uid: string
  nombre: string
  rol: string
  /** Clave de día local YYYY-MM-DD (del primer evento de la jornada). */
  dia: string
  ingreso?: RegistroHorario
  salida?: RegistroHorario
  /** Solo cuando hay ingreso Y salida. */
  duracionMs?: number
  /** Ingreso sin salida. La UI decide el matiz: día pasado = "sin salida"
   *  (anomalía); día de hoy = "en jornada" (normal). */
  abierta: boolean
}

/** Clave de día LOCAL del navegador (la operación de NEG es un solo huso,
 *  America/Bogota; el dato crudo sigue siendo el Timestamp server). */
export function claveDia(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`
}

// ── (Retirado oct-2026) Marca de ingreso una-vez-por-día ─────────────────────
// El guard de localStorage del fix 10-ago (claveIngresoLS/evaluarMarcaIngreso/
// esClaveIngresoObsoleta) se RETIRÓ con el rebuild de jornada por PRESENCIA:
// la marca de arranque ya no existe — el primer latido del día la reemplaza
// (types/sigp/jornada.ts + hooks/usePresencia.ts). `registros_horario` queda
// congelado como histórico, inmutable como siempre.

/**
 * Aparea eventos planos en jornadas por persona + día local.
 * Reglas: cada `ingreso` abre una jornada; una `salida` cierra la última
 * jornada abierta de esa persona/día; salida sin ingreso previo = jornada
 * huérfana (solo salida); doble ingreso = dos jornadas (la primera queda
 * abierta). Devuelve las jornadas ordenadas por fecha DESC (recientes arriba).
 */
export function aparearJornadas(eventos: RegistroHorario[]): JornadaDia[] {
  const ordenados = [...eventos].sort((a, b) => a.fecha.toMillis() - b.fecha.toMillis())
  const abiertas = new Map<string, JornadaDia>()   // clave uid|dia → jornada abierta
  const jornadas: JornadaDia[] = []

  for (const ev of ordenados) {
    const dia = claveDia(ev.fecha.toDate())
    const clave = `${ev.uid}|${dia}`
    const base = { uid: ev.uid, nombre: ev.nombre, rol: ev.rol, dia }
    if (ev.tipo === 'ingreso') {
      const previa = abiertas.get(clave)
      if (previa) jornadas.push(previa)            // doble ingreso: la anterior queda abierta
      abiertas.set(clave, { ...base, ingreso: ev, abierta: true })
    } else {
      const abierta = abiertas.get(clave)
      if (abierta) {
        abierta.salida = ev
        abierta.abierta = false
        abierta.duracionMs = ev.fecha.toMillis() - (abierta.ingreso?.fecha.toMillis() ?? ev.fecha.toMillis())
        jornadas.push(abierta)
        abiertas.delete(clave)
      } else {
        jornadas.push({ ...base, salida: ev, abierta: false })   // salida huérfana
      }
    }
  }
  jornadas.push(...abiertas.values())

  // Ancla = el evento MÁS RECIENTE de la jornada (salida si existe) —
  // "recientes arriba" según la última actividad, no el ingreso.
  const ancla = (j: JornadaDia) => (j.salida ?? j.ingreso)!.fecha.toMillis()
  return jornadas.sort((a, b) => ancla(b) - ancla(a))
}

/** "7 h 35 min" — para la columna Duración. */
export function fmtDuracion(ms: number): string {
  const min = Math.round(ms / 60_000)
  const h = Math.floor(min / 60)
  return h > 0 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`
}

// ── Ausentismos ───────────────────────────────────────────────────────────────

export type TipoAusentismo = 'incapacidad' | 'permiso' | 'justificacion' | 'vacaciones' | 'otro'

/**
 * Origen de la incapacidad (24-sep, pedido de Ingrid/GI) — eje ORTOGONAL a
 * `tipo`, no un sub-tipo: `tipo` dice qué clase de ausencia es (flujo de
 * captura); `origen` dice por qué, para el reporte legal ATEL vs EL. Solo
 * aplica cuando `tipo === 'incapacidad'`; administrativo, nunca diagnóstico.
 * El indicador SG-SST (SST-IND-26) cuenta AMBOS orígenes — su CF filtra
 * únicamente por `tipo`, no lee este campo.
 */
export type OrigenIncapacidad = 'laboral' | 'comun'

export const ORIGEN_INCAPACIDAD_LABEL: Record<OrigenIncapacidad, string> = {
  laboral: 'Laboral (AT/EL)',
  comun: 'Común (enfermedad general)',
}

export interface Ausentismo {
  id: string
  /** Vínculo al maestro `empleados_directos` — fuente para el indicador SG-SST
   *  de Ausentismo (SST-IND-26, auto-alimentado por CF). Los registros nuevos
   *  siempre lo traen; los históricos pre-maestro no. */
  empleado_id?: string
  /** Cuenta del panel (`users/{uid}`) de la persona. Historia doble: en los
   *  registros pre-maestro era el identificador principal (legacy); desde
   *  13-oct el form lo DENORMALIZA de nuevo al crear (del `user_uid` del
   *  maestro) porque es la llave del CRUCE con `jornadas` (salida anticipada
   *  con respaldo) — GG y director_proyectos ven ese cruce pero no leen
   *  `empleados_directos`, así que el uid tiene que viajar en este doc.
   *  Campo ADITIVO que la CF del frente SGI/SST no lee (filtra solo por
   *  `tipo`); avisado por cortesía. Ausente si la persona no tiene cuenta. */
  empleado_uid?: string
  empleado_nombre: string
  tipo: TipoAusentismo
  /** Obligatorio cuando tipo==='incapacidad' — exigido por la UI (el form no
   *  guarda una incapacidad sin origen) y, desde el 14-oct-2026, por REGLA
   *  (origenAtelValido() en firestore.rules: el create lo exige y el update
   *  que toque tipo/origen re-valida — un doc 'incapacidad' sin origen válido
   *  no puede existir ni entrar a ese estado por ninguna vía). Los HISTÓRICOS
   *  pre-24-sep-2026 pueden no traerlo y siguen anulables/editables mientras
   *  no toquen tipo/origen. Ausente en los demás tipos, donde no aplica.
   *  (Antes este comentario decía "UI + regla" cuando la regla NO lo exigía —
   *  corregido 14-oct: un comentario que afirma un control inexistente es
   *  peor que no tener comentario.) */
  origen?: OrigenIncapacidad
  fecha_inicio: Timestamp
  fecha_fin: Timestamp
  descripcion?: string
  soporte_url: string          // OBLIGATORIO al crear (regla + UI)
  estado: 'activo' | 'anulado' // sin delete — anulación soft con motivo
  motivo_anulacion?: string
  registrado_por: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

/** Detalle médico (sub-doc privado/detalle) — dato de SALUD, solo
 *  gerencia_administrativa + admin (línea dura, decisión 07-ago). */
export interface AusentismoDetallePrivado {
  diagnostico?: string
  observaciones_medicas?: string
}

export const TIPOS_AUSENTISMO: TipoAusentismo[] = [
  'incapacidad', 'permiso', 'justificacion', 'vacaciones', 'otro',
]

// ── Salida anticipada con respaldo (13-oct, diseño aprobado) ─────────────────
// La persona declara la salida (cierre manual antes de SU hora — lo marca la
// CF en cierre.anticipada); la autoridad la respalda (el permiso que registra
// gerencia en Ausentismos). Nadie justifica su propia ausencia: no hay campo
// de motivo en el logout — el motivo es un hecho que ya vive donde corresponde.
//
// 🔒 PRIVACIDAD DEL RÓTULO: en la fila de marcación el respaldo se muestra
// SIEMPRE GENÉRICO ("permiso registrado"), sin el tipo — nombrar los tipos
// "seguros" (vacaciones) y callar los demás volvería revelador al genérico
// por eliminación. Un solo rótulo para todos, sin excepciones (decisión de
// Giovanny). Quien necesita el tipo lo tiene en la pestaña Ausentismos, con
// los mismos permisos de siempre.

/** ¿El ausentismo (ACTIVO) cubre este día local 'YYYY-MM-DD'? */
export function ausentismoCubreDia(a: Pick<Ausentismo, 'estado' | 'fecha_inicio' | 'fecha_fin'>, dia: string): boolean {
  if (a.estado !== 'activo') return false
  if (!a.fecha_inicio?.toDate || !a.fecha_fin?.toDate) return false
  return claveDia(a.fecha_inicio.toDate()) <= dia && dia <= claveDia(a.fecha_fin.toDate())
}

/** ¿Hay respaldo (permiso registrado) para la salida anticipada de `uid` el
 *  día `dia`? Cruce por `empleado_uid` del ausentismo — el único identificador
 *  que TODOS los lectores de esta pantalla pueden ver (GG/GP no leen el
 *  maestro). Un ausentismo sin `empleado_uid` (persona sin cuenta, o registro
 *  viejo sin denormalizar) no respalda a nadie aquí: ausencia honesta. */
export function tieneRespaldo(uid: string, dia: string, ausentismos: Pick<Ausentismo, 'estado' | 'fecha_inicio' | 'fecha_fin' | 'empleado_uid'>[]): boolean {
  return ausentismos.some(a => a.empleado_uid === uid && ausentismoCubreDia(a, dia))
}

/** Umbral de la cola "salidas anticipadas sin respaldo" — supuesto NOMBRADO
 *  sin calibrar (una semana: normalmente es que gerencia aún no registró el
 *  permiso, no que alguien se fue sin él; el encuadre es pendiente de
 *  registro, no infracción). Se ajusta con el uso real. */
export const UMBRAL_SALIDA_SIN_RESPALDO_DIAS = 7

/** Días del rango que mira la cola de salidas sin respaldo (consulta
 *  dedicada, independiente del rango visible del tablero). */
export const RANGO_COLA_SIN_RESPALDO_DIAS = 45

export const TIPO_AUSENTISMO_LABEL: Record<TipoAusentismo, string> = {
  incapacidad: 'Incapacidad médica',
  permiso: 'Permiso',
  justificacion: 'Justificación',
  vacaciones: 'Vacaciones',
  otro: 'Otro',
}

export const TIPO_AUSENTISMO_COLOR: Record<TipoAusentismo, string> = {
  incapacidad: 'bg-rose-100 text-rose-800',
  permiso: 'bg-amber-100 text-amber-800',
  justificacion: 'bg-gray-100 text-gray-600',
  vacaciones: 'bg-emerald-100 text-emerald-800',
  otro: 'bg-gray-100 text-gray-600',
}

// ── Configuración (doc configuracion/horario) ────────────────────────────────

export interface ConfigHorario {
  /** IPs exactas o CIDRs IPv4 de la oficina (una entrada por línea en la UI). */
  ips_oficina?: string[]
  /** 'HH:mm' — hora de fin de jornada (hora local): dispara el aviso y el
   *  cierre AUTOMÁTICO de sesión del rebuild de marcación (13-oct).
   *  ⚠ SUPUESTO NOMBRADO, no verdad permanente (precisión 2 de Giovanny):
   *  es UNA SOLA hora para todo el equipo — hoy son 8 personas con el mismo
   *  horario y está bien; el día que alguien tenga jornada distinta, esto
   *  se revisa (horario por persona es otro diseño, no un parche aquí). */
  hora_fin_jornada?: string
  // Rebuild presencia (oct-2026) — supuestos nombrados, ajustables sin deploy:
  /** Ventana del latido en minutos (default 10). */
  latido_min?: number
  /** Gracia del cierre automático derivado en minutos (default 30). */
  gracia_cierre_min?: number
  /** Ventana de "Presente ahora" en minutos (default 15). */
  ventana_presente_min?: number
  // Rebuild marcación (13-oct):
  /** Countdown del aviso antes del cierre automático de sesión (default 10). */
  aviso_cierre_min?: number
  /** Cuánto pospone "Seguir trabajando" (default 60). */
  posponer_min?: number
}

/** ¿'HH:mm' válida? (para la edición inline). */
export function esHoraValida(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim())
}

// ── Horario POR PERSONA (rebuild 13-oct — doc configuracion/horarios_personales) ──
//
// Hora de CIERRE de jornada individual, administrada por gerencia_administrativa
// (+admin, helper de reglas gestionaHorario()). Quien no tenga hora propia usa
// la GENERAL de configuracion/horario — nadie queda sin hora de cierre. Vive en
// `configuracion/` (es configuración del módulo de horario, hermana de la hora
// general) y NO en `users` (colección compartida con la app, con denylist de
// self-update que no se engorda por un dato operativo) ni en
// `empleados_directos` (maestro del frente SGI/SST — no escribimos ahí).
//
// ⚠ LÍNEA DURA 1 — el horario personal es FIJO, IGUAL TODOS LOS DÍAS. No hay
// variación por día de la semana y NO debe agregarse un array/mapa por día
// aquí: si algún día la hay, es un REDISEÑO con su propio diseño aprobado,
// no un campo nuevo.
//
// ⚠ LÍNEA DURA 2 — este doc guarda SOLO la hora de CIERRE. No agregar hora de
// entrada esperada, marca de llegada tarde ni cálculo de cumplimiento:
// convertir esto en un control de puntualidad es una decisión de Giovanny
// sobre su gente, que se diseña aparte y con los ojos abiertos — jamás como
// efecto secundario de un campo nuevo.

export interface HorariosPersonales {
  /** uid → 'HH:mm' (hora de cierre). Clave ausente = usa la hora general. */
  horarios?: Record<string, string>
  actualizado_por?: string
  fecha_actualizacion?: Timestamp
}

/** Hora de cierre EFECTIVA de una persona: la personal si existe y es válida,
 *  si no la general; null = sin hora de cierre configurada (sin banner, como
 *  cuando la general no existe). */
export function horaFinDe(
  uid: string,
  personales: Record<string, string> | undefined,
  general: string | undefined,
): string | null {
  const propia = personales?.[uid]
  if (propia && esHoraValida(propia)) return propia.trim()
  if (general && esHoraValida(general)) return general.trim()
  return null
}
