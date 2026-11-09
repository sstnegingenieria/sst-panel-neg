// EDICIÓN DEL CRONOGRAMA (08-nov-2026) — operaciones PURAS del editor de
// rejilla (C2). Principio de Giovanny: si armar el cronograma cuesta más que
// hacerlo en Excel, nadie lo va a usar — por eso el editor no es un
// formulario fila a fila sino una rejilla donde la barra se PINTA, y las
// fases se programan DE CORRIDO (30 actividades del alcance no se agendan
// una por una).
//
// Todas las operaciones devuelven estructuras NUEVAS (el estado del editor
// es inmutable) y jamás dejan un día fuera de [1..plazo].
import type { ActividadCronograma, FaseCronograma, FilaCronograma } from './cronograma'
import { festivosSetDe, sumarDias, diaSemanaDe } from '../../utils/sigp/calendarioColombia'

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/** Reemplaza una fila por id dentro de las fases (helper interno). */
function mapFila(
  fases: FaseCronograma[], filaId: string,
  fn: (fila: FilaCronograma) => FilaCronograma,
): FaseCronograma[] {
  return fases.map(f => ({
    ...f,
    filas: f.filas.map(fila => (fila.id === filaId ? fn(fila) : fila)),
  }))
}

/** PINTAR la barra de una actividad: el gesto del editor (arrastrar sobre la
 *  rejilla). El anclaje y el día actual pueden venir en cualquier orden;
 *  se normaliza y se recorta al plazo. Pintar REEMPLAZA la barra. */
export function pintarBarra(
  fases: FaseCronograma[], actividadId: string, diaA: number, diaB: number, plazo: number,
): FaseCronograma[] {
  const d1 = clamp(Math.min(diaA, diaB), 1, plazo)
  const d2 = clamp(Math.max(diaA, diaB), 1, plazo)
  return mapFila(fases, actividadId, fila =>
    fila.tipo === 'actividad' ? { ...fila, dia_inicio: d1, dia_fin: d2 } : fila)
}

/** Mover el rombo de un hito a un día (clic sobre la rejilla). */
export function moverHito(
  fases: FaseCronograma[], hitoId: string, dia: number, plazo: number,
): FaseCronograma[] {
  const d = clamp(dia, 1, plazo)
  return mapFila(fases, hitoId, fila =>
    fila.tipo === 'hito' ? { ...fila, dia: d } : fila)
}

/** ¿El día (offset 1-based) se trabaja? Para PROGRAMAR: lunes a sábado
 *  cuentan (el sábado es media jornada pero se trabaja); domingo y festivo
 *  no. */
export function esDiaProgramable(fechaInicio: string, dia: number, festivos: Set<string>): boolean {
  const iso = sumarDias(fechaInicio, dia - 1)
  const dow = diaSemanaDe(iso)
  return dow !== 0 && !festivos.has(iso)
}

export interface ResultadoCadena {
  fases: FaseCronograma[]
  /** true si el plan no cupo y las últimas barras quedaron RECORTADAS al
   *  final del plazo (el editor lo avisa — jamás silencioso). */
  desbordo: boolean
  /** Último día ocupado por la cadena (para encadenar la fase siguiente). */
  ultimoDia: number
}

/** PROGRAMAR UNA FASE DE CORRIDO: las actividades de la fase quedan en
 *  cadena — cada una arranca donde terminó la anterior — con `duracion`
 *  días LABORABLES por actividad (domingos y festivos no cuentan ni como
 *  arranque ni como duración; el sábado sí se trabaja). Los hitos de la
 *  fase no se tocan. Si la cadena se sale del plazo, las barras restantes
 *  se recortan al último día y se reporta `desbordo`. */
export function programarFaseEnCadena(
  fases: FaseCronograma[], faseId: string,
  params: { desde: number; duracion: number; fechaInicio: string; plazo: number },
): ResultadoCadena {
  const { fechaInicio, plazo } = params
  const desde = clamp(Math.trunc(params.desde) || 1, 1, plazo)
  const duracion = Math.max(1, Math.trunc(params.duracion) || 1)
  const festivos = festivosSetDe(fechaInicio, plazo)
  const programable = (d: number) => esDiaProgramable(fechaInicio, d, festivos)

  let cursor = desde
  let desbordo = false
  let ultimoDia = desde

  const siguienteProgramable = (d: number): number => {
    let x = d
    while (x <= plazo && !programable(x)) x++
    return x
  }

  const nuevas = fases.map(fase => {
    if (fase.id !== faseId) return fase
    const filas = fase.filas.map(fila => {
      if (fila.tipo !== 'actividad') return fila
      let inicio = siguienteProgramable(cursor)
      if (inicio > plazo) { desbordo = true; inicio = plazo }
      // la barra cubre `duracion` días laborables desde `inicio`
      let cubiertos = programable(inicio) ? 1 : 0
      let fin = inicio
      while (cubiertos < duracion) {
        if (fin + 1 > plazo) { desbordo = true; break }
        fin++
        if (programable(fin)) cubiertos++
      }
      cursor = fin + 1
      ultimoDia = Math.max(ultimoDia, fin)
      return { ...fila, dia_inicio: inicio, dia_fin: fin } as ActividadCronograma
    })
    return { ...fase, filas }
  })
  return { fases: nuevas, desbordo, ultimoDia }
}

/** DESPLAZAR una fase completa ±delta días (barras e hitos juntos). Si algún
 *  día quedaría fuera del plazo, NO se aplica nada y se devuelve null — un
 *  desplazamiento a medias desarma el plan. */
export function moverFase(
  fases: FaseCronograma[], faseId: string, delta: number, plazo: number,
): FaseCronograma[] | null {
  const fase = fases.find(f => f.id === faseId)
  if (!fase || delta === 0) return fases
  for (const fila of fase.filas) {
    if (fila.tipo === 'actividad') {
      if (fila.dia_inicio + delta < 1 || fila.dia_fin + delta > plazo) return null
    } else if (fila.dia + delta < 1 || fila.dia + delta > plazo) return null
  }
  return fases.map(f => f.id !== faseId ? f : {
    ...f,
    filas: f.filas.map(fila => fila.tipo === 'actividad'
      ? { ...fila, dia_inicio: fila.dia_inicio + delta, dia_fin: fila.dia_fin + delta }
      : { ...fila, dia: fila.dia + delta }),
  })
}

/** Una actividad enganchada vuelve TEXTO LIBRE conservando su descripción
 *  congelada (la salida que ofrece el mensaje de huérfanos). */
export function volverTextoLibre(fases: FaseCronograma[], actividadId: string): FaseCronograma[] {
  return mapFila(fases, actividadId, fila => {
    if (fila.tipo !== 'actividad') return fila
    const { item_clave: _c, item_codigo: _k, ...resto } = fila
    return resto
  })
}

/** Marca/desmarca la actividad dentro de la ventana de corte. */
export function toggleEnVentana(fases: FaseCronograma[], actividadId: string): FaseCronograma[] {
  return mapFila(fases, actividadId, fila => {
    if (fila.tipo !== 'actividad') return fila
    if (fila.en_ventana) { const { en_ventana: _v, ...resto } = fila; return resto }
    return { ...fila, en_ventana: true }
  })
}

/** Elimina una fila (actividad o hito) por id. */
export function quitarFila(fases: FaseCronograma[], filaId: string): FaseCronograma[] {
  return fases.map(f => ({ ...f, filas: f.filas.filter(fila => fila.id !== filaId) }))
}

/** Mueve una fila un puesto arriba/abajo dentro de su fase. */
export function moverFila(fases: FaseCronograma[], filaId: string, dir: -1 | 1): FaseCronograma[] {
  return fases.map(f => {
    const i = f.filas.findIndex(fila => fila.id === filaId)
    if (i < 0) return f
    const j = i + dir
    if (j < 0 || j >= f.filas.length) return f
    const filas = [...f.filas]
    ;[filas[i], filas[j]] = [filas[j], filas[i]]
    return { ...f, filas }
  })
}

/** Mueve una fase un puesto arriba/abajo. */
export function moverFaseOrden(fases: FaseCronograma[], faseId: string, dir: -1 | 1): FaseCronograma[] {
  const i = fases.findIndex(f => f.id === faseId)
  if (i < 0) return fases
  const j = i + dir
  if (j < 0 || j >= fases.length) return fases
  const out = [...fases]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** Claves del alcance aún NO referenciadas por ninguna actividad (lo que el
 *  picker de "agregar del alcance" ofrece). */
export function clavesSinReferenciar(
  fases: FaseCronograma[], clavesAlcance: string[],
): string[] {
  const usadas = new Set(
    fases.flatMap(f => f.filas)
      .filter((fl): fl is ActividadCronograma => fl.tipo === 'actividad' && !!fl.item_clave)
      .map(fl => fl.item_clave as string),
  )
  return clavesAlcance.filter(c => !usadas.has(c))
}
