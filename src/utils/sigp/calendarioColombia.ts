// CALENDARIO LABORAL COLOMBIANO (08-nov-2026) — para el cronograma de obra.
//
// Los festivos NO se tabulan por año: se CALCULAN por la Ley 51 de 1983
// (Ley Emiliani, vigente desde 1984) — un festivo hardcodeado se vence solo
// y nadie se entera hasta que el cronograma de enero sale mal (decisión de
// Giovanny, 08-nov-2026):
//   - 6 festivos FIJOS (no se trasladan): 1-ene, 1-may, 20-jul, 7-ago,
//     8-dic, 25-dic.
//   - Jueves y Viernes Santo: relativos a Pascua, NO se trasladan.
//   - 7 festivos TRASLADABLES al lunes siguiente cuando no caen lunes:
//     6-ene, 19-mar, 29-jun, 15-ago, 12-oct, 1-nov, 11-nov.
//   - 3 derivados de Pascua TRASLADABLES: Ascensión (Pascua+39), Corpus
//     Christi (Pascua+60), Sagrado Corazón (Pascua+68).
//   Pascua sale del cómputo de Meeus/Butcher (calendario gregoriano).
//
// JORNADA (modelo del cronograma SENA, validado contra su pie de página):
// lunes a viernes jornada completa (1), sábado media jornada (0.5),
// domingo y festivo no se trabaja (0).
//
// Todo opera sobre fechas 'YYYY-MM-DD' en UTC — sin objetos Date locales
// (la zona horaria del navegador no puede mover un día del plan).
//
// ⚠ DEUDA CONOCIDA EN OTRO MÓDULO: `diasHabilesEntre` de
// `utils/sigp/ventanaLicitacion.ts` cuenta L-V sin conocer festivos (sesgo
// permisivo declarado allá). Cuando se retome ese módulo, debería consumir
// este calendario en vez de mantener su conteo propio — tarea aparte, no
// se toca aquí.

export interface Festivo {
  fecha: string        // 'YYYY-MM-DD' (ya trasladado si aplica)
  nombre: string
  /** true si la Ley Emiliani lo corrió al lunes siguiente. */
  trasladado: boolean
}

// ── Fechas 'YYYY-MM-DD' en UTC ───────────────────────────────────────────────

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** 'YYYY-MM-DD' → epoch UTC a medianoche, o null si no es fecha válida. */
export function fechaIsoAUtc(iso: string): number | null {
  const m = RE_ISO.exec(iso ?? '')
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(t)
  // rechaza desbordes tipo 2026-02-31
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
  return t
}

const aIso = (t: number): string => new Date(t).toISOString().slice(0, 10)

/** Suma n días calendario a una fecha ISO (n puede ser 0 o negativo). */
export const sumarDias = (iso: string, n: number): string => {
  const t = fechaIsoAUtc(iso)
  if (t === null) throw new Error(`Fecha inválida: ${iso}`)
  return aIso(t + n * 86400000)
}

/** Día de la semana UTC: 0 = domingo … 6 = sábado. */
export const diaSemanaDe = (iso: string): number => {
  const t = fechaIsoAUtc(iso)
  if (t === null) throw new Error(`Fecha inválida: ${iso}`)
  return new Date(t).getUTCDay()
}

/** Letra del día como la usa el modelo del cronograma (X = miércoles). */
export const LETRA_DIA: readonly string[] = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

// ── Pascua (cómputo de Meeus/Butcher, calendario gregoriano) ─────────────────

/** Domingo de Pascua del año, como 'YYYY-MM-DD'. */
export function pascuaDe(anio: number): string {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// ── Festivos del año (Ley 51 de 1983) ────────────────────────────────────────

const FIJOS: [number, number, string][] = [
  [1, 1, 'Año Nuevo'],
  [5, 1, 'Día del Trabajo'],
  [7, 20, 'Día de la Independencia'],
  [8, 7, 'Batalla de Boyacá'],
  [12, 8, 'Inmaculada Concepción'],
  [12, 25, 'Navidad'],
]

const TRASLADABLES: [number, number, string][] = [
  [1, 6, 'Reyes Magos'],
  [3, 19, 'San José'],
  [6, 29, 'San Pedro y San Pablo'],
  [8, 15, 'Asunción de la Virgen'],
  [10, 12, 'Día de la Raza'],
  [11, 1, 'Todos los Santos'],
  [11, 11, 'Independencia de Cartagena'],
]

/** La fecha misma si cae lunes; si no, el lunes siguiente (Ley Emiliani). */
function alLunesSiguiente(iso: string): { fecha: string; trasladado: boolean } {
  const dow = diaSemanaDe(iso)
  if (dow === 1) return { fecha: iso, trasladado: false }
  return { fecha: sumarDias(iso, (8 - dow) % 7), trasladado: true }
}

/** Los 18 festivos del año, ordenados por fecha (ya trasladados). */
export function festivosDe(anio: number): Festivo[] {
  const iso = (m: number, d: number) => `${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const out: Festivo[] = FIJOS.map(([m, d, nombre]) => ({ fecha: iso(m, d), nombre, trasladado: false }))
  const pascua = pascuaDe(anio)
  out.push({ fecha: sumarDias(pascua, -3), nombre: 'Jueves Santo', trasladado: false })
  out.push({ fecha: sumarDias(pascua, -2), nombre: 'Viernes Santo', trasladado: false })
  for (const [m, d, nombre] of TRASLADABLES) {
    const t = alLunesSiguiente(iso(m, d))
    out.push({ fecha: t.fecha, nombre, trasladado: t.trasladado })
  }
  for (const [offset, nombre] of [[39, 'Ascensión del Señor'], [60, 'Corpus Christi'], [68, 'Sagrado Corazón de Jesús']] as [number, string][]) {
    const t = alLunesSiguiente(sumarDias(pascua, offset))
    // +39/+60 caen jueves y +68 viernes — el traslado al lunes siempre aplica
    out.push({ fecha: t.fecha, nombre, trasladado: t.trasladado })
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// ── Tipo de día y jornada ────────────────────────────────────────────────────

export type TipoDia = 'habil' | 'sabado' | 'domingo' | 'festivo'

/** Set de fechas festivas que cubre un rango (pide los años justos). */
export function festivosSetDe(inicioIso: string, dias: number): Set<string> {
  const finIso = sumarDias(inicioIso, Math.max(0, dias - 1))
  const a0 = Number(inicioIso.slice(0, 4))
  const a1 = Number(finIso.slice(0, 4))
  const set = new Set<string>()
  for (let a = a0; a <= a1; a++) for (const f of festivosDe(a)) set.add(f.fecha)
  return set
}

/** Clasifica un día. El DOMINGO gana sobre el festivo (un festivo que cae
 *  domingo ya era no laborable y se rotula por el ritmo semanal — como lo
 *  pinta el modelo); el festivo gana sobre el sábado (día completo no
 *  laborable, no media jornada). */
export function tipoDia(iso: string, festivos: Set<string>): TipoDia {
  const dow = diaSemanaDe(iso)
  if (dow === 0) return 'domingo'
  if (festivos.has(iso)) return 'festivo'
  if (dow === 6) return 'sabado'
  return 'habil'
}

/** Jornada que aporta cada tipo de día al conteo de hábiles efectivos. */
export const JORNADA: Record<TipoDia, number> = { habil: 1, sabado: 0.5, domingo: 0, festivo: 0 }

/** Días hábiles EFECTIVOS en un plazo de `dias` calendario desde `inicioIso`
 *  (L-V completos + sábados a media jornada, sin domingos ni festivos).
 *  Es el número del pie del cronograma ("días hábiles efectivos en el
 *  plazo: 22"). Puede traer .5 por los sábados. */
export function diasHabilesEfectivos(inicioIso: string, dias: number): number {
  if (fechaIsoAUtc(inicioIso) === null || !Number.isInteger(dias) || dias < 1) return 0
  const festivos = festivosSetDe(inicioIso, dias)
  let total = 0
  for (let i = 0; i < dias; i++) total += JORNADA[tipoDia(sumarDias(inicioIso, i), festivos)]
  return total
}

/** Festivos que caen DENTRO del plazo (para nombrarlos en el pie y
 *  sombrearlos en la rejilla), ordenados. */
export function festivosEnRango(inicioIso: string, dias: number): Festivo[] {
  if (fechaIsoAUtc(inicioIso) === null || !Number.isInteger(dias) || dias < 1) return []
  const ini = inicioIso
  const fin = sumarDias(inicioIso, dias - 1)
  const a0 = Number(ini.slice(0, 4))
  const a1 = Number(fin.slice(0, 4))
  const out: Festivo[] = []
  for (let a = a0; a <= a1; a++) {
    for (const f of festivosDe(a)) if (f.fecha >= ini && f.fecha <= fin) out.push(f)
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// ── Formato para el pie del cronograma ───────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Nombra fechas agrupando por mes, como el pie del modelo:
 *  ['2026-11-02','2026-11-16'] → "2 y 16 de noviembre";
 *  ['2026-03-28','2026-11-02'] → "28 de marzo y 2 de noviembre". */
export function nombrarFechas(fechas: string[]): string {
  if (fechas.length === 0) return ''
  const grupos: { mes: number; dias: number[] }[] = []
  for (const f of [...fechas].sort()) {
    const mes = Number(f.slice(5, 7)) - 1
    const dia = Number(f.slice(8, 10))
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.mes === mes) ultimo.dias.push(dia)
    else grupos.push({ mes, dias: [dia] })
  }
  const partes = grupos.map(g => {
    const dias = g.dias.length === 1 ? String(g.dias[0])
      : `${g.dias.slice(0, -1).join(', ')} y ${g.dias[g.dias.length - 1]}`
    return `${dias} de ${MESES[g.mes]}`
  })
  return partes.length === 1 ? partes[0]
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** "22" o "21,5" (es-CO) — los sábados pueden dejar medio día. */
export const fmtDiasHabiles = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
