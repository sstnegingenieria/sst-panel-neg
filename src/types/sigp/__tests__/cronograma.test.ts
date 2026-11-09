// Cronograma de obra (08-nov) — oráculo: el modelo del SENA (30 días desde
// el 19/10/2026, 22 hábiles efectivos, festivos 2 y 16 de noviembre, ventana
// de corte programado). Principios fijados por test: la actividad enganchada
// hereda la descripción del ítem (una sola verdad); los errores nombran la
// fila que falla y JAMÁS imprimen un uuid; los huérfanos de un cambio de
// alcance se listan por su nombre (lección del 058, de fábrica); la
// plantilla trae las típicas pre-escritas (requisito 3 de Giovanny).
import { describe, it, expect } from 'vitest'
import {
  construirCronograma, actividadesHuerfanas, plantillaFases,
  entradaHistorialCronograma, PLAZO_MAX_DIAS,
} from '../cronograma'
import type { ActividadCronograma, FaseCronograma, HitoCronograma } from '../cronograma'
import type { Proyecto } from '../proyecto'
import { Timestamp } from 'firebase/firestore'

const items_alcance = [
  { clave: 'k-diag', codigo: '1,01', descripcion: 'Diagnóstico técnico integral: pruebas, mediciones e informe', unidad: 'gl', cantidad: 1, valor_total: 8_000_000, grupo: 'DIAGNÓSTICO INICIAL' },
  { clave: 'k-limp', codigo: '2,01', descripcion: 'Limpieza general de áreas, postes, cerramientos y cárcamos', unidad: 'gl', cantidad: 1, valor_total: 3_000_000, grupo: 'TRANSFORMADOR Y ÁREAS' },
  { clave: 'k-celda', codigo: '6,01', descripcion: 'Limpieza de tablero y compartimientos MT y BT', unidad: 'un', cantidad: 2, valor_total: 4_000_000, grupo: 'CELDAS DE MEDIA TENSIÓN' },
]
const proyecto = () => ({
  id: 'p1', consecutivo: 'PRY-2026-070', cotizacion_version: 2, cotizacion_consecutivo: 'COT-2026-090',
  snapshot: { items_alcance, cliente: 'SENA REGIONAL BOYACÁ', cliente_nit: '899.999.034-1', asunto: 'Mantenimiento preventivo y correctivo de subestación eléctrica' } as never,
}) as Pick<Proyecto, 'id' | 'consecutivo' | 'snapshot' | 'cotizacion_version' | 'cotizacion_consecutivo'>

let n = 0
const act = (over: Partial<ActividadCronograma> = {}): ActividadCronograma =>
  ({ id: `a${++n}`, tipo: 'actividad', descripcion: 'Actividad libre', dia_inicio: 1, dia_fin: 2, ...over })
const hito = (over: Partial<HitoCronograma> = {}): HitoCronograma =>
  ({ id: `h${++n}`, tipo: 'hito', nombre: 'Firma del acta de inicio', dia: 1, ...over })
const fase = (nombre: string, filas: FaseCronograma['filas']): FaseCronograma =>
  ({ id: `f${++n}`, nombre, filas })

const base = (over: Partial<Parameters<typeof construirCronograma>[0]> = {}) => ({
  proyecto: proyecto(),
  fecha_inicio: '2026-10-19',
  plazo_dias: 30,
  fases: [fase('PRELIMINARES', [hito(), act()])],
  cronogramasPrevios: [],
  ...over,
})

describe('construirCronograma — el caso del modelo SENA', () => {
  it('congela fechas, hábiles efectivos, festivos nombrados y nota de jornada', () => {
    const r = construirCronograma(base())
    if (!r.ok) throw new Error(r.error)
    expect(r.cronograma.fecha_fin).toBe('2026-11-17')
    expect(r.cronograma.dias_habiles_efectivos).toBe(22)
    expect(r.cronograma.festivos_en_rango.map(f => f.fecha)).toEqual(['2026-11-02', '2026-11-16'])
    expect(r.cronograma.nota_jornada).toBe(
      'Jornada: lunes a viernes jornada completa; sábados hasta el mediodía; domingos y festivos (2 y 16 de noviembre) no se trabaja. Días hábiles efectivos en el plazo: 22.',
    )
    expect(r.cronograma.numero_cronograma).toBe(1)
    expect(r.cronograma.titulo).toBe('Mantenimiento preventivo y correctivo de subestación eléctrica')
    expect(r.cronograma.cliente).toBe('SENA REGIONAL BOYACÁ')
    expect(r.cronograma.contratista).toBe('NEG Ingeniería S.A.S. BIC')
    expect(r.cronograma.cotizacion_version_medida).toBe(2)
  })
  it('sin festivos en el rango la nota no inventa paréntesis', () => {
    const r = construirCronograma(base({ fecha_inicio: '2026-09-07', plazo_dias: 12 }))
    if (!r.ok) throw new Error(r.error)
    expect(r.cronograma.nota_jornada).toContain('domingos y festivos no se trabaja')
    expect(r.cronograma.nota_jornada).not.toContain('(')
  })
  it('la actividad enganchada HEREDA descripción y código del ítem (una sola verdad)', () => {
    const r = construirCronograma(base({
      fases: [fase('DIAGNÓSTICO', [act({ item_clave: 'k-diag', descripcion: 'texto viejo tecleado' })])],
    }))
    if (!r.ok) throw new Error(r.error)
    const a = r.cronograma.fases[0].filas[0] as ActividadCronograma
    expect(a.descripcion).toBe('Diagnóstico técnico integral: pruebas, mediciones e informe')
    expect(a.item_codigo).toBe('1,01')
  })
  it('cada emisión es un documento nuevo: numero correlativo sobre los previos', () => {
    const r = construirCronograma(base({ cronogramasPrevios: [{ numero_cronograma: 1 }, { numero_cronograma: 2 }] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.cronograma.numero_cronograma).toBe(3)
  })
})

describe('validaciones — nombran la fila, jamás un uuid', () => {
  const fail = (over: Partial<Parameters<typeof construirCronograma>[0]>): string => {
    const r = construirCronograma(base(over))
    if (r.ok) throw new Error('debía fallar')
    return r.error
  }
  it('plazo y fecha', () => {
    expect(fail({ plazo_dias: 0 })).toMatch(/entero de días calendario/)
    expect(fail({ plazo_dias: PLAZO_MAX_DIAS + 1 })).toMatch(/supera el máximo/)
    expect(fail({ fecha_inicio: '2026-02-31' })).toMatch(/fecha de inicio/)
    expect(fail({ fases: [] })).toMatch(/no tiene fases/)
  })
  it('fase vacía y filas incompletas, con nombre propio', () => {
    expect(fail({ fases: [fase('SUMINISTROS', [])] })).toContain('«SUMINISTROS»')
    expect(fail({ fases: [fase('PRELIMINARES', [act({ descripcion: '  ' })])] })).toMatch(/actividad sin descripción.*«PRELIMINARES»/)
    expect(fail({ fases: [fase('PRELIMINARES', [hito({ nombre: ' ' })])] })).toMatch(/hito sin nombre/)
  })
  it('días fuera del plazo nombran actividad y fase', () => {
    const e = fail({ fases: [fase('CIERRE', [act({ descripcion: 'Aseo general', dia_inicio: 28, dia_fin: 31 })])] })
    expect(e).toContain('«Aseo general»')
    expect(e).toContain('«CIERRE»')
    expect(e).toContain('28–31 de 30')
    expect(fail({ fases: [fase('F', [act({ dia_inicio: 5, dia_fin: 3 })])] })).toMatch(/termina antes de empezar/)
    expect(fail({ fases: [fase('F', [hito({ dia: 31 })])] })).toMatch(/fuera del plazo: día 31 de 30/)
  })
  it('ventana de corte: completa y bien parada, o no está', () => {
    const enVentana = act({ descripcion: 'Limpieza de celdas', dia_inicio: 15, dia_fin: 17, en_ventana: true })
    expect(fail({ fases: [fase('CELDAS', [enVentana])] })).toMatch(/no define la ventana/)
    expect(fail({
      fases: [fase('CELDAS', [enVentana])],
      ventana_corte: { dia_inicio: 15, dia_fin: 18, nota: '  ' },
    })).toMatch(/necesita su nota/)
    expect(fail({
      fases: [fase('CELDAS', [act()])],
      ventana_corte: { dia_inicio: 15, dia_fin: 18, nota: 'Requieren desenergizar.' },
    })).toMatch(/no agrupa ninguna actividad/)
    expect(fail({
      fases: [fase('CELDAS', [act({ descripcion: 'Torque de conexiones', dia_inicio: 14, dia_fin: 17, en_ventana: true })])],
      ventana_corte: { dia_inicio: 15, dia_fin: 18, nota: 'Requieren desenergizar.' },
    })).toMatch(/«Torque de conexiones».*se salen del marco/)
    expect(fail({
      fases: [fase('CELDAS', [enVentana])],
      ventana_corte: { dia_inicio: 15, dia_fin: 40, nota: 'x' },
    })).toMatch(/ventana de corte programado cae fuera del plazo/)
  })
  it('ventana válida queda congelada en el documento', () => {
    const r = construirCronograma(base({
      fases: [fase('CELDAS', [act({ descripcion: 'Limpieza de celdas', dia_inicio: 15, dia_fin: 17, en_ventana: true })])],
      ventana_corte: { dia_inicio: 15, dia_fin: 18, nota: ' Las actividades que requieren desenergizar se agrupan en una sola ventana. ' },
    }))
    if (!r.ok) throw new Error(r.error)
    expect(r.cronograma.ventana_corte).toEqual({ dia_inicio: 15, dia_fin: 18, nota: 'Las actividades que requieren desenergizar se agrupan en una sola ventana.' })
  })
})

describe('huérfanos de un cambio de alcance — lección del 058, de fábrica', () => {
  const conHuerfana = [
    fase('DIAGNÓSTICO', [act({ item_clave: 'k-diag', descripcion: 'Diagnóstico técnico integral: pruebas, mediciones e informe' })]),
    fase('OBRA VIEJA', [act({ item_clave: '34c702f8-aaaa-bbbb-cccc-000000000000', descripcion: 'Contratar la prestación del servicio global' })]),
  ]
  it('se listan por fase con su descripción congelada', () => {
    const h = actividadesHuerfanas(conHuerfana, proyecto().snapshot)
    expect(h).toHaveLength(1)
    expect(h[0].fase).toBe('OBRA VIEJA')
    expect(h[0].actividad.descripcion).toBe('Contratar la prestación del servicio global')
  })
  it('construir bloquea NOMBRANDO la actividad y diciendo qué hacer — sin uuid', () => {
    const r = construirCronograma(base({ fases: conHuerfana }))
    if (r.ok) throw new Error('debía fallar')
    expect(r.error).toContain('«Contratar la prestación del servicio global»')
    expect(r.error).toMatch(/ya no existen en el alcance vigente/)
    expect(r.error).toMatch(/texto libre|re-engánchalas/)
    expect(r.error).not.toContain('34c702f8')
  })
})

describe('plantilla — nunca una hoja en blanco (requisito 3)', () => {
  it('típicas pre-escritas + alcance enganchado por grupo + hitos de inicio y entrega', () => {
    const fases = plantillaFases(proyecto().snapshot, 30)
    const nombres = fases.map(f => f.nombre)
    expect(nombres[0]).toBe('PRELIMINARES')
    expect(nombres[1]).toBe('SUMINISTROS')
    expect(nombres).toContain('DIAGNÓSTICO INICIAL')
    expect(nombres).toContain('CELDAS DE MEDIA TENSIÓN')
    expect(nombres[nombres.length - 1]).toBe('PRUEBAS, ENTREGA Y CIERRE')
    const textos = fases.flatMap(f => f.filas).map(fl => fl.tipo === 'actividad' ? fl.descripcion : fl.nombre)
    expect(textos).toContain('Logística de inicio: plan de trabajo, permisos y coordinación')
    expect(textos).toContain('Compra y suministro de materiales y equipos')
    expect(textos).toContain('Aseo general y desmovilización')
    expect(textos).toContain('Entrega del informe final con registro fotográfico')
    expect(textos).toContain('Firma del acta de inicio')
    // el alcance entra enganchado, no re-tecleado
    const diag = fases.find(f => f.nombre === 'DIAGNÓSTICO INICIAL')!.filas[0] as ActividadCronograma
    expect(diag.item_clave).toBe('k-diag')
    expect(diag.item_codigo).toBe('1,01')
    expect(diag.descripcion).toBe('Diagnóstico técnico integral: pruebas, mediciones e informe')
    // el acta de entrega cierra el plazo
    const cierre = fases[fases.length - 1].filas.find(fl => fl.tipo === 'hito') as HitoCronograma
    expect(cierre.nombre).toBe('Acta de entrega y recibo final')
    expect(cierre.dia).toBe(30)
  })
  it('la plantilla construye válida tal cual sale (todo en día 1, acta al final)', () => {
    const r = construirCronograma(base({ fases: plantillaFases(proyecto().snapshot, 30) }))
    expect(r.ok).toBe(true)
  })
})

describe('historial al emitir', () => {
  it('constancia con consecutivo, emisión y regla de re-emisión', () => {
    const ts = Timestamp.fromDate(new Date('2026-11-08T12:00:00Z'))
    const e = entradaHistorialCronograma('en_ejecucion', 'CRN-2026-001', 1, '2026-10-19', '2026-11-17', 'uid1', ts, 'Giovanny')
    expect(e.motivo).toContain('CRN-2026-001')
    expect(e.motivo).toContain('emisión 1')
    expect(e.motivo).toMatch(/congelado con hash/)
    expect(e.motivo).toMatch(/se emite como cronograma nuevo/)
    expect(e.por_nombre).toBe('Giovanny')
  })
})
