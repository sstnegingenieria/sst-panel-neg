// Cierre anticipado del proyecto + corrección de anticipo (bloque 28-sep).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  proyectoCancelable, patchCancelarProyecto, patchCorregirAnticipo,
} from '../asignacion'
import type { AsignacionContratista } from '../asignacion'
import { ESTADOS_PROYECTO } from '../proyecto'
import type { Proyecto, EstadoProyecto } from '../proyecto'

const ahora = Timestamp.fromMillis(1_790_000_000_000)

const asig = (over: Partial<AsignacionContratista>): AsignacionContratista => ({
  id: 'a1', estado: 'anticipo_girado', contratista_id: 'c1', contratista_nombre: 'Lozano',
  contratista_documento: '123', atomos: ['G1'], fecha: ahora, fecha_creacion: ahora,
  asignado_por: 'u1', modalidad: 'todo_costo', compras_reembolsos: [],
  habilitacion_snapshot: { estado: 'activo', fecha_consulta: ahora, fuente: 'test' },
  preliquidacion: {
    valor_alcance: 1000, valor_contratista: 400, anticipo_pct: 50,
    definida_por: 'u1', fecha_definicion: ahora, aprobada_por: 'u2', fecha_aprobacion: ahora,
    anticipo: { valor: 125_000, fecha: ahora, registrado_por: 'u2' },
  },
  ...over,
} as AsignacionContratista)

const proyecto = (estado: EstadoProyecto): Pick<Proyecto, 'id' | 'estado' | 'snapshot'> =>
  ({ id: 'p1', estado, snapshot: { alcance: [{ grupo: 'G1', items: 1, subtotal: 1000 }] } }) as never

describe('proyectoCancelable — cualquier estado antes de facturado', () => {
  it('pre-facturado sí; facturado en adelante y terminales no', () => {
    const corte = ESTADOS_PROYECTO.indexOf('facturado')
    for (const e of ESTADOS_PROYECTO) {
      expect(proyectoCancelable(e), e).toBe(ESTADOS_PROYECTO.indexOf(e) < corte)
    }
    expect(proyectoCancelable('cancelado')).toBe(false)
  })
})

describe('patchCancelarProyecto — el caso general con ceros', () => {
  const datos = { tipo: 'fuerza_mayor' as const, motivo_texto: 'lluvias' }

  it('duplicado SIN referencia al superviviente → null; consigo mismo → null', () => {
    expect(patchCancelarProyecto(proyecto('creado'), [], 0, { tipo: 'duplicado' }, 'u', ahora)).toBeNull()
    expect(patchCancelarProyecto(proyecto('creado'), [], 0,
      { tipo: 'duplicado', proyecto_superviviente: { id: 'p1', consecutivo: 'PRY-X' } }, 'u', ahora)).toBeNull()
    expect(patchCancelarProyecto(proyecto('creado'), [], 0,
      { tipo: 'duplicado', proyecto_superviviente: { id: 'p2', consecutivo: 'PRY-2026-025' } }, 'u', ahora)).not.toBeNull()
  })

  it("'otro' exige texto; estados no cancelables rehúsan", () => {
    expect(patchCancelarProyecto(proyecto('creado'), [], 0, { tipo: 'otro' }, 'u', ahora)).toBeNull()
    expect(patchCancelarProyecto(proyecto('facturado'), [], 0, datos, 'u', ahora)).toBeNull()
    expect(patchCancelarProyecto(proyecto('cerrado'), [], 0, datos, 'u', ahora)).toBeNull()
    expect(patchCancelarProyecto(proyecto('cancelado'), [], 0, datos, 'u', ahora)).toBeNull()
  })

  it('incurrido = anticipos + reembolsos (no liquidadas) + compras_cf', () => {
    const asigs = [
      asig({}),                                                    // anticipo 125.000
      asig({ id: 'a2', estado: 'liquidada' }),                     // liquidada: fuera
      asig({ id: 'a3', estado: 'preliquidacion_definida',
        preliquidacion: { valor_alcance: 1, valor_contratista: 1, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ahora } as never,
        compras_reembolsos: [{ concepto: 'tornillos', valor: 30_000, fecha: ahora, registrado_por: 'u' }] as never }),
    ]
    const r = patchCancelarProyecto(proyecto('en_ejecucion'), asigs, 200_000, datos, 'u', ahora)!
    expect(r.incurrido).toEqual({ anticipos: 125_000, reembolsos: 30_000, compras_cf: 200_000, total: 355_000 })
    expect(r.padre.estado).toBe('cancelado')
    expect(r.padre.cierre_anticipado?.incurrido.total).toBe(355_000)
  })

  it('cascada: cancela las no conciliadas, respeta liquidadas y ya-canceladas', () => {
    const asigs = [asig({}), asig({ id: 'a2', estado: 'liquidada' }),
      asig({ id: 'a3', estado: 'cancelada' })]
    const r = patchCancelarProyecto(proyecto('anticipo_girado'), asigs, 0, datos, 'u', ahora)!
    expect(r.cancelaciones.map(c => c.id)).toEqual(['a1'])
    expect(r.cancelaciones[0].sub.estado).toBe('cancelada')
    expect((r.cancelaciones[0].sub.cancelacion as { incurrido: { total: number } }).incurrido.total).toBe(125_000)
    expect(r.resumen.por_estado.cancelada).toBe(2)
  })

  it('sin plata afuera → incurrido en ceros (terminal y listo)', () => {
    const r = patchCancelarProyecto(proyecto('creado'), [], 0, datos, 'u', ahora)!
    expect(r.incurrido.total).toBe(0)
    expect(r.cancelaciones).toEqual([])
  })
})

describe('patchCorregirAnticipo — la pieza que faltaba (caso 056)', () => {
  it('corrige el valor con traza; fecha y registrado_por se conservan', () => {
    const r = patchCorregirAnticipo(asig({}), { valor: 100_000 }, 'giro real de agosto', 'g', ahora)!
    expect(r.anula).toBe(false)
    expect(r.sub.preliquidacion?.anticipo?.valor).toBe(100_000)
    expect(r.sub.preliquidacion?.anticipo?.registrado_por).toBe('u2')
    expect(r.sub.estado).toBeUndefined()   // el estado no cambia al corregir
    expect(r.entradaHistorial.motivo).toContain('125000 → 100000')
  })

  it('ANULA: retira el objeto y revierte a preliquidacion_aprobada', () => {
    const r = patchCorregirAnticipo(asig({}), { anular: true }, 'el giro nunca salió', 'g', ahora)!
    expect(r.anula).toBe(true)
    expect(r.sub.estado).toBe('preliquidacion_aprobada')
    expect(r.sub.preliquidacion && 'anticipo' in r.sub.preliquidacion
      ? r.sub.preliquidacion.anticipo : undefined).toBeUndefined()
    expect(r.entradaHistorial.motivo).toContain('ANULACIÓN')
  })

  it('rehúsa: sin motivo, mismo valor, valor ≤ 0, o estado no girado', () => {
    expect(patchCorregirAnticipo(asig({}), { valor: 100 }, '  ', 'g', ahora)).toBeNull()
    expect(patchCorregirAnticipo(asig({}), { valor: 125_000 }, 'igual', 'g', ahora)).toBeNull()
    expect(patchCorregirAnticipo(asig({}), { valor: 0 }, 'cero', 'g', ahora)).toBeNull()
    expect(patchCorregirAnticipo(asig({ estado: 'liquidada' }), { anular: true }, 'x', 'g', ahora)).toBeNull()
    expect(patchCorregirAnticipo(asig({ estado: 'cancelada' }), { anular: true }, 'x', 'g', ahora)).toBeNull()
  })

  it('el flujo del 056: anular el giro falso → cancelar como duplicado → incurrido 0', () => {
    const a = asig({})
    const anulada = patchCorregirAnticipo(a, { anular: true }, 'nunca salió', 'g', ahora)!
    const tras = { ...a, ...anulada.sub } as AsignacionContratista
    const r = patchCancelarProyecto(proyecto('permisos_en_tramite'), [tras], 0,
      { tipo: 'duplicado', proyecto_superviviente: { id: 'p-025', consecutivo: 'PRY-2026-025' } }, 'u', ahora)!
    expect(r.incurrido.total).toBe(0)
    expect(r.padre.cierre_anticipado?.proyecto_superviviente?.consecutivo).toBe('PRY-2026-025')
  })
})
