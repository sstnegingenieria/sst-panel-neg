// Edición del cronograma (08-nov, C2) — las operaciones del editor de
// rejilla. Oráculo del calendario: arranque 19/10/2026 (lunes), plazo 30 —
// domingos en los días 7/14/21/28 y festivos en el 15 (2-nov) y 29 (16-nov),
// como el modelo del SENA.
import { describe, it, expect } from 'vitest'
import {
  pintarBarra, moverHito, programarFaseEnCadena, moverFase, volverTextoLibre,
  toggleEnVentana, quitarFila, moverFila, moverFaseOrden, clavesSinReferenciar,
  esDiaProgramable,
} from '../cronogramaEdicion'
import { festivosSetDe } from '../../../utils/sigp/calendarioColombia'
import type { ActividadCronograma, FaseCronograma, HitoCronograma } from '../cronograma'

const INICIO = '2026-10-19'
const PLAZO = 30

let n = 0
const act = (over: Partial<ActividadCronograma> = {}): ActividadCronograma =>
  ({ id: over.id ?? `a${++n}`, tipo: 'actividad', descripcion: `Actividad ${n}`, dia_inicio: 1, dia_fin: 1, ...over })
const hito = (over: Partial<HitoCronograma> = {}): HitoCronograma =>
  ({ id: over.id ?? `h${++n}`, tipo: 'hito', nombre: 'Hito', dia: 1, ...over })
const fase = (id: string, filas: FaseCronograma['filas']): FaseCronograma =>
  ({ id, nombre: id.toUpperCase(), filas })

const actsDe = (fases: FaseCronograma[], faseId: string) =>
  fases.find(f => f.id === faseId)!.filas.filter((f): f is ActividadCronograma => f.tipo === 'actividad')

describe('pintarBarra — el gesto del editor', () => {
  it('normaliza el orden del arrastre y recorta al plazo', () => {
    const fases = [fase('f1', [act({ id: 'a1' })])]
    const r1 = pintarBarra(fases, 'a1', 9, 5, PLAZO)
    expect(actsDe(r1, 'f1')[0]).toMatchObject({ dia_inicio: 5, dia_fin: 9 })
    const r2 = pintarBarra(fases, 'a1', -3, 99, PLAZO)
    expect(actsDe(r2, 'f1')[0]).toMatchObject({ dia_inicio: 1, dia_fin: 30 })
  })
  it('no toca hitos ni otras filas; es inmutable', () => {
    const fases = [fase('f1', [hito({ id: 'h1', dia: 4 }), act({ id: 'a1' })])]
    const r = pintarBarra(fases, 'h1', 2, 3, PLAZO)
    expect((r[0].filas[0] as HitoCronograma).dia).toBe(4)
    expect(r).not.toBe(fases)
    expect(fases[0].filas[1]).toMatchObject({ dia_inicio: 1 })
  })
})

describe('moverHito', () => {
  it('clic en la rejilla, con recorte', () => {
    const fases = [fase('f1', [hito({ id: 'h1' })])]
    expect((moverHito(fases, 'h1', 12, PLAZO)[0].filas[0] as HitoCronograma).dia).toBe(12)
    expect((moverHito(fases, 'h1', 99, PLAZO)[0].filas[0] as HitoCronograma).dia).toBe(30)
  })
})

describe('programarFaseEnCadena — 30 actividades sin agendarlas una por una', () => {
  it('encadena con duración en días LABORABLES (sábado trabaja)', () => {
    const fases = [fase('f1', [act({ id: 'a1' }), act({ id: 'a2' }), act({ id: 'a3' })])]
    const r = programarFaseEnCadena(fases, 'f1', { desde: 1, duracion: 2, fechaInicio: INICIO, plazo: PLAZO })
    expect(r.desbordo).toBe(false)
    expect(actsDe(r.fases, 'f1').map(a => [a.dia_inicio, a.dia_fin])).toEqual([[1, 2], [3, 4], [5, 6]])
    expect(r.ultimoDia).toBe(6)
  })
  it('la barra CRUZA el domingo sin contarlo como trabajo', () => {
    const fases = [fase('f1', [act({ id: 'a1' })])]
    const r = programarFaseEnCadena(fases, 'f1', { desde: 6, duracion: 2, fechaInicio: INICIO, plazo: PLAZO })
    // día 6 = sábado 24-oct (trabaja) · día 7 = domingo (no) · día 8 = lunes
    expect(actsDe(r.fases, 'f1')[0]).toMatchObject({ dia_inicio: 6, dia_fin: 8 })
  })
  it('el arranque SALTA domingo y festivo (el 2-nov es el día 15)', () => {
    const fases = [fase('f1', [act({ id: 'a1' })])]
    const r = programarFaseEnCadena(fases, 'f1', { desde: 14, duracion: 2, fechaInicio: INICIO, plazo: PLAZO })
    // día 14 = domingo 1-nov · día 15 = festivo 2-nov → arranca el 16 (martes 3-nov)
    expect(actsDe(r.fases, 'f1')[0]).toMatchObject({ dia_inicio: 16, dia_fin: 17 })
  })
  it('los hitos de la fase no se tocan; otras fases tampoco', () => {
    const fases = [
      fase('f1', [hito({ id: 'h1', dia: 1 }), act({ id: 'a1' })]),
      fase('f2', [act({ id: 'b1', dia_inicio: 9, dia_fin: 9 })]),
    ]
    const r = programarFaseEnCadena(fases, 'f1', { desde: 3, duracion: 1, fechaInicio: INICIO, plazo: PLAZO })
    expect((r.fases[0].filas[0] as HitoCronograma).dia).toBe(1)
    expect(actsDe(r.fases, 'f2')[0]).toMatchObject({ dia_inicio: 9 })
  })
  it('si no cabe, recorta al final del plazo y lo DICE (desbordo)', () => {
    const fases = [fase('f1', [act({ id: 'a1' }), act({ id: 'a2' })])]
    const r = programarFaseEnCadena(fases, 'f1', { desde: 29, duracion: 3, fechaInicio: INICIO, plazo: PLAZO })
    // día 29 = festivo 16-nov → arranca el 30 (último), no hay más campo
    expect(r.desbordo).toBe(true)
    const [a1, a2] = actsDe(r.fases, 'f1')
    expect(a1.dia_fin).toBeLessThanOrEqual(PLAZO)
    expect(a2.dia_fin).toBeLessThanOrEqual(PLAZO)
  })
})

describe('moverFase — todo junto o nada', () => {
  const armada = () => [fase('f1', [act({ id: 'a1', dia_inicio: 3, dia_fin: 5 }), hito({ id: 'h1', dia: 6 })])]
  it('desplaza barras e hitos', () => {
    const r = moverFase(armada(), 'f1', 4, PLAZO)!
    expect(actsDe(r, 'f1')[0]).toMatchObject({ dia_inicio: 7, dia_fin: 9 })
    expect((r[0].filas[1] as HitoCronograma).dia).toBe(10)
  })
  it('si algo quedaría fuera del plazo, NO aplica nada (null)', () => {
    expect(moverFase(armada(), 'f1', -3, PLAZO)).toBeNull()
    expect(moverFase(armada(), 'f1', 25, PLAZO)).toBeNull()
  })
})

describe('filas: texto libre, ventana, quitar, reordenar', () => {
  it('volverTextoLibre suelta la clave y conserva la descripción congelada', () => {
    const fases = [fase('f1', [act({ id: 'a1', item_clave: 'k1', item_codigo: '1,01', descripcion: 'Diagnóstico integral' })])]
    const a = actsDe(volverTextoLibre(fases, 'a1'), 'f1')[0]
    expect(a.item_clave).toBeUndefined()
    expect(a.item_codigo).toBeUndefined()
    expect(a.descripcion).toBe('Diagnóstico integral')
  })
  it('toggleEnVentana ida y vuelta (sin dejar false colgado)', () => {
    const fases = [fase('f1', [act({ id: 'a1' })])]
    const on = toggleEnVentana(fases, 'a1')
    expect(actsDe(on, 'f1')[0].en_ventana).toBe(true)
    const off = toggleEnVentana(on, 'a1')
    expect('en_ventana' in actsDe(off, 'f1')[0]).toBe(false)
  })
  it('quitarFila y reordenar con topes', () => {
    const fases = [fase('f1', [act({ id: 'a1' }), act({ id: 'a2' }), hito({ id: 'h1' })])]
    expect(quitarFila(fases, 'a2')[0].filas.map(f => f.id)).toEqual(['a1', 'h1'])
    expect(moverFila(fases, 'a2', -1)[0].filas.map(f => f.id)).toEqual(['a2', 'a1', 'h1'])
    expect(moverFila(fases, 'a1', -1)[0].filas.map(f => f.id)).toEqual(['a1', 'a2', 'h1'])
    const dos = [fase('f1', []), fase('f2', [])]
    expect(moverFaseOrden(dos, 'f2', -1).map(f => f.id)).toEqual(['f2', 'f1'])
    expect(moverFaseOrden(dos, 'f1', -1).map(f => f.id)).toEqual(['f1', 'f2'])
  })
  it('clavesSinReferenciar alimenta el picker', () => {
    const fases = [fase('f1', [act({ id: 'a1', item_clave: 'k1' })])]
    expect(clavesSinReferenciar(fases, ['k1', 'k2', 'k3'])).toEqual(['k2', 'k3'])
  })
})

describe('esDiaProgramable', () => {
  it('sábado sí; domingo y festivo no', () => {
    const festivos = festivosSetDe(INICIO, PLAZO)
    expect(esDiaProgramable(INICIO, 6, festivos)).toBe(true)    // sábado 24-oct
    expect(esDiaProgramable(INICIO, 7, festivos)).toBe(false)   // domingo 25-oct
    expect(esDiaProgramable(INICIO, 15, festivos)).toBe(false)  // festivo 2-nov
  })
})
