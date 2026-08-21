/**
 * Reloj de ventana de una licitación (1.4) — ¿alcanza el tiempo para armar la
 * propuesta antes del cierre?
 *
 * PURO: sin Firestore, sin React. Trabaja con fechas ISO 'YYYY-MM-DD' para no
 * arrastrar `Timestamp` ni depender de la zona horaria del navegador (un
 * `new Date(iso)` sin hora se interpreta en UTC y en Colombia, UTC−5, puede
 * correr el día — por eso todo se calcula sobre componentes de fecha).
 *
 * NO BLOQUEA NADA: informa. Un chip rojo es una advertencia para que Karen
 * decida, no un gate — el sistema no sabe si esa semana está libre.
 */
import type { ModalidadLicitacion } from '../../types/sigp/licitacion'

/**
 * Horas de armado estimadas por modalidad. Dato del área comercial
 * (21-ago-2026): una mínima cuantía se arma en ~4 h y una menor en ~6 h.
 * Las demás modalidades no tienen estimado propio; se les aplica el de menor
 * cuantía como cota conservadora (nunca menos trabajo que una menor).
 */
export const HORAS_ARMADO: Record<ModalidadLicitacion, number> = {
  minima_cuantia: 4,
  menor_cuantia: 6,
  licitacion_publica: 6,
  seleccion_abreviada: 6,
  regimen_especial: 6,
  otra: 6,
}

/**
 * Horas ÚTILES que se pueden dedicar a UNA licitación en un día hábil.
 *
 * Este es el VALOR POR DEFECTO. El valor vivo se lee de
 * `configuracion/licitaciones.horas_utiles_dia` (1.5) — se ajusta desde
 * Firestore sin desplegar, junto a `capacidad_semanal`.
 *
 * No son 8: quien arma licitaciones atiende varias a la vez y además tiene el
 * resto de su frente. Con 4, una mínima cuantía necesita 1 día hábil y una
 * menor necesita 2 — que es lo que el área describe como realista.
 *
 * ⚠ ES UN SUPUESTO, no un dato medido. Subirlo hace la ventana más
 * permisiva; bajarlo, más alarmista. Ajustar con el área si el chip rojo
 * aparece demasiado o demasiado poco.
 *
 * ⚠ Tampoco contempla los festivos colombianos (ver `diasHabilesEntre`): el
 * conteo es de lunes a viernes, así que una semana con festivo se ve más
 * holgada de lo que es. SESGO PERMISIVO DECLARADO — el chip avisa de menos,
 * nunca de más.
 */
export const HORAS_UTILES_DIA_DEFAULT = 4

/**
 * Sanea el valor que venga de configuración.
 *
 * Un `0` o un negativo darían `Infinity` días necesarios y TODA ventana
 * quedaría insuficiente — un cero tecleado por error apagaría el reloj
 * entero. Cualquier cosa que no sea un número positivo finito cae al default.
 */
export function horasUtilesValidas(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
    ? v
    : HORAS_UTILES_DIA_DEFAULT
}

/** Días hábiles (lunes a viernes) que exige armar esta modalidad. */
export function diasHabilesNecesarios(
  modalidad: ModalidadLicitacion,
  horasUtilesDia: number = HORAS_UTILES_DIA_DEFAULT,
): number {
  return Math.ceil(HORAS_ARMADO[modalidad] / horasUtilesValidas(horasUtilesDia))
}

/**
 * Días hábiles ENTRE dos fechas ISO, sin contar el día de inicio y contando
 * el de cierre. `null` si alguna fecha falta o es inválida.
 *
 * No conoce festivos colombianos: cuenta lunes a viernes. Un festivo dentro
 * de la ventana la hace ver más holgada de lo que es — sesgo permisivo
 * declarado (el chip avisa de menos, nunca de más).
 */
export function diasHabilesEntre(desdeIso: string, hastaIso: string): number | null {
  const a = aUtc(desdeIso)
  const b = aUtc(hastaIso)
  if (a === null || b === null) return null
  if (b <= a) return 0

  let dias = 0
  const cursor = new Date(a)
  while (cursor.getTime() < b) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (cursor.getTime() > b) break
    const d = cursor.getUTCDay()
    if (d !== 0 && d !== 6) dias++
  }
  return dias
}

/** 'YYYY-MM-DD' → epoch UTC a medianoche, o `null` si no es una fecha válida. */
function aUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!m) return null
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null
  const t = Date.UTC(a, mes - 1, d)
  const chk = new Date(t)
  if (chk.getUTCMonth() !== mes - 1 || chk.getUTCDate() !== d) return null
  return t
}

/** Fecha ISO local (no UTC) de un Date — para el "hoy" del navegador. */
export function isoLocal(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

export interface Ventana {
  /** Días hábiles que quedan hasta el cierre. `null` si no hay fecha. */
  dias_habiles: number | null
  /** Días hábiles que exige la modalidad. */
  necesarios: number
  horas_estimadas: number
  /** `true` si NO alcanza. `false` si alcanza o si no hay con qué juzgar. */
  insuficiente: boolean
  /** `true` si el cierre ya pasó. */
  vencida: boolean
  /** Frase corta para el chip. */
  etiqueta: string
}

/**
 * Evalúa la ventana. Sin fecha de cierre no hay juicio: `insuficiente:false`
 * y la etiqueta lo dice — es distinto de "alcanza".
 */
export function evaluarVentana(
  cierreIso: string | null,
  modalidad: ModalidadLicitacion,
  hoyIso: string,
  horasUtilesDia: number = HORAS_UTILES_DIA_DEFAULT,
): Ventana {
  const necesarios = diasHabilesNecesarios(modalidad, horasUtilesDia)
  const horas = HORAS_ARMADO[modalidad]

  if (!cierreIso) {
    return {
      dias_habiles: null, necesarios, horas_estimadas: horas,
      insuficiente: false, vencida: false, etiqueta: 'sin fecha de cierre',
    }
  }

  const hoy = aUtc(hoyIso)
  const cierre = aUtc(cierreIso)
  if (hoy === null || cierre === null) {
    return {
      dias_habiles: null, necesarios, horas_estimadas: horas,
      insuficiente: false, vencida: false, etiqueta: 'fecha de cierre inválida',
    }
  }

  if (cierre < hoy) {
    return {
      dias_habiles: 0, necesarios, horas_estimadas: horas,
      insuficiente: true, vencida: true, etiqueta: 'cierre vencido',
    }
  }

  const dias = diasHabilesEntre(hoyIso, cierreIso) ?? 0
  const insuficiente = dias < necesarios
  return {
    dias_habiles: dias, necesarios, horas_estimadas: horas, insuficiente, vencida: false,
    etiqueta: insuficiente
      ? `ventana insuficiente · ${dias} día${dias === 1 ? '' : 's'} hábil${dias === 1 ? '' : 'es'} para ~${horas} h de armado`
      : `${dias} día${dias === 1 ? '' : 's'} hábil${dias === 1 ? '' : 'es'} · ~${horas} h de armado`,
  }
}

// ── Sorteo ───────────────────────────────────────────────────────────────────

/**
 * Frase LITERAL del sorteo, para que nadie tenga que interpretar un número
 * suelto: "22 manifestaciones → 45 % de que te evalúen".
 *
 * Con `manifestaciones` en `null` lo dice: el sorteo existe pero todavía no se
 * sabe contra cuántos. Ese "no se sabe" es información, no un hueco.
 */
export function frasesSorteo(
  manifestaciones: number | null,
  probabilidad: number | null,
): string {
  if (manifestaciones === null || probabilidad === null) {
    return 'sorteo, sin dato de manifestaciones'
  }
  const pct = Math.round(probabilidad * 100)
  return `${manifestaciones} manifestacion${manifestaciones === 1 ? '' : 'es'} → ${pct} % de que te evalúen`
}

// ── Referencia de oferta ─────────────────────────────────────────────────────

/**
 * Banda histórica de la oferta de NEG como % del presupuesto oficial.
 * Se muestra junto al campo al capturar la presentación — no valida ni
 * bloquea: es contexto para que quien digita note un valor fuera de rango.
 */
export const BANDA_OFERTA_PCT = { min: 74, max: 80 } as const

export const REFERENCIA_OFERTA =
  `NEG gana históricamente entre ${BANDA_OFERTA_PCT.min} % y ${BANDA_OFERTA_PCT.max} % `
  + 'del presupuesto oficial'

/** ¿El % de la oferta cae fuera de la banda histórica? `false` si no hay dato. */
export function fueraDeBanda(pct: number | null): boolean {
  if (pct === null) return false
  return pct < BANDA_OFERTA_PCT.min || pct > BANDA_OFERTA_PCT.max
}
