// Corrección de clasificación de preventivos (07-nov) — oráculo: los ONCE de
// Vertis (PRY-2026-080..090) corregidos por script el 07-nov. El plan del
// panel debe producir EXACTAMENTE los mismos números que aquel acto de datos.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { impedimentosCorreccion, planCorreccionPreventivo } from '../correccionPreventivo'
import type { ClasificacionSitio } from '../sitioPreventivo'
import {
  normalizarCodigoSitio, contradiccionesConMaestro, construirSitioDesdeSolicitud,
  patchMaestroPorCorreccion, resumenClasificacion, type SitioPreventivo,
} from '../sitioPreventivo'

const ts = Timestamp.fromDate(new Date('2026-11-07T12:00:00Z'))

// ── Réplica del 080: SIMITI Z2/GF/pesado, registrado NO-jungle ──────────────
const solicitud080 = () => ({
  estado: 'aceptada' as const,
  historial: [{ de: null, a: 'recibida' as const, por: 'paula', fecha: ts }],
  preventivo: {
    sitio_id: 'COBOL7049', sitio_nombre: 'SIMITI',
    tipo_sitio: 'greenfield' as const, intensidad: 'pesado' as const, es_jungle: false,
    departamento: 'Bolívar', zona: 'Z2' as const, es_sai: false,
  },
})
const proyecto080 = () => ({
  origen: 'preventivo' as const, estado: 'permisos_en_tramite' as const,
  valor_venta_inicial: 1_280_269,
  historial: [],
  snapshot: {
    cliente: 'VERTIS TORRES', asunto: 'Mantenimiento preventivo pesado — SIMITI (Greenfield · Z2)',
    nombre_sitio: 'SIMITI', codigo_sitio_cliente: 'COBOL7049',
    valor_venta: 1_280_269, esquema_tributario: 'iva_pleno' as const,
    alcance: [{ grupo: 'Mantenimiento preventivo pesado — SIMITI', items: 1, subtotal: 1_280_269 }],
    items_alcance: [{ clave: 'prev:1', descripcion: 'Mantenimiento preventivo pesado — SIMITI', unidad: 'glb', cantidad: 1, valor_total: 1_280_269, grupo: 'Mantenimiento preventivo pesado — SIMITI' }],
    total_items: 1,
  },
})
const asigDefinida = () => ({
  id: 'a1', contratista_nombre: 'David Bernal', estado: 'preliquidacion_definida' as const,
  historial: [],
  preliquidacion: { valor_alcance: 1_280_269, valor_contratista: 614_147, anticipo_pct: 65, definida_por: 'paula', fecha_definicion: ts },
})
const JUNGLE: ClasificacionSitio = { tipo_sitio: 'greenfield', intensidad: 'pesado', es_jungle: true }

describe('impedimentosCorreccion — nombre propio, no "no se puede"', () => {
  it('proyecto limpio (el caso de los once) → corregible', () => {
    expect(impedimentosCorreccion(proyecto080(), [asigDefinida()], [])).toEqual([])
  })
  it('preliquidación APROBADA → dice quién y cuándo', () => {
    const a = asigDefinida()
    const pre = { ...a.preliquidacion, aprobada_por: 'uid-marcela', fecha_aprobacion: ts }
    const imp = impedimentosCorreccion(proyecto080(), [{ ...a, preliquidacion: pre }], [], uid => uid === 'uid-marcela' ? 'Marcela' : undefined)
    expect(imp).toHaveLength(1)
    expect(imp[0]).toContain('David Bernal')
    expect(imp[0]).toContain('APROBADA por Marcela')
  })
  it('anticipo girado → dice la Σ y el conteo de giros vivos', () => {
    const a = asigDefinida()
    const pre = { ...a.preliquidacion, giros: [{ valor: 125_000, fecha: ts, registrado_por: 'x' }] }
    const imp = impedimentosCorreccion(proyecto080(), [{ ...a, preliquidacion: pre }], [])
    expect(imp[0]).toContain('$ 125.000')
    expect(imp[0]).toContain('1 giro(s) vivo(s)')
  })
  it('factura, pago y OC → cada uno con su identidad', () => {
    const p = { ...proyecto080(), facturacion: { numero: 'FV-1830', fecha: ts, valor: 2_680_336 } } as never
    const imp = impedimentosCorreccion(p, [], [{ consecutivo: 'OC-2026-009', estado: 'aprobada' }])
    expect(imp.find(x => x.includes('FV-1830'))).toBeTruthy()
    expect(imp.find(x => x.includes('OC-2026-009'))).toBeTruthy()
  })
  it('asignación CANCELADA no impide; OC ANULADA no impide', () => {
    const a = { ...asigDefinida(), estado: 'cancelada' as const, preliquidacion: { ...asigDefinida().preliquidacion, aprobada_por: 'x' } }
    expect(impedimentosCorreccion(proyecto080(), [a], [{ consecutivo: 'OC-1', estado: 'anulada' }])).toEqual([])
  })
  it('cerrado / cancelado / no-preventivo → inmutables con nombre', () => {
    expect(impedimentosCorreccion({ ...proyecto080(), estado: 'cerrado' }, [], [])[0]).toContain('CERRADO')
    expect(impedimentosCorreccion({ ...proyecto080(), origen: 'cotizacion' }, [], [])[0]).toContain('preventivo')
  })
})

describe('planCorreccionPreventivo — los números exactos del acto del 07-nov', () => {
  const plan = () => {
    const r = planCorreccionPreventivo({
      solicitud: solicitud080(), proyecto: proyecto080(), asignaciones: [asigDefinida()],
      nueva: JUNGLE, motivo: 'El cliente confirmó que son sitios jungle',
      uid: 'g1', nombreUsuario: 'Marcela', rol: 'gerencia_administrativa', fecha: ts,
    })
    if (!r.ok) throw new Error(r.error)
    return r.plan
  }
  it('venta 1.280.269 → 2.680.336 (jungle 1.600.336 + transporte 1.080.000)', () => {
    const p = plan()
    expect(p.ventaAntes).toBe(1_280_269)
    expect(p.ventaNueva).toBe(2_680_336)
    expect(p.precio).toEqual({ base: 1_600_336, transporte: 1_080_000, total: 2_680_336 })
  })
  it('snapshot coherente: venta = alcance = ítem, y el asunto gana "· jungle"', () => {
    const { patchProyecto } = plan()
    expect(patchProyecto.valor_venta_inicial).toBe(2_680_336)
    expect(patchProyecto.snapshot.valor_venta).toBe(2_680_336)
    expect(patchProyecto.snapshot.alcance[0].subtotal).toBe(2_680_336)
    expect(patchProyecto.snapshot.items_alcance![0].valor_total).toBe(2_680_336)
    expect(patchProyecto.snapshot.asunto).toBe('Mantenimiento preventivo pesado — SIMITI (Greenfield · jungle · Z2)')
  })
  it('el margen se muestra ANTES: 52,0% → 77,1% con la señal de implausible', () => {
    const [m] = plan().margenes
    expect(m.valor_contratista).toBe(614_147)
    expect(m.antes.margen_pct!).toBeCloseTo(52.03, 1)
    expect(m.despues.margen_pct!).toBeCloseTo(77.08, 1)
    expect(m.despues.implausible).toBe(true)
    expect(m.despues.negativo).toBe(false)
  })
  it('valor_contratista INTACTO en el patch de la asignación; valor_alcance a la venta nueva', () => {
    const [pa] = plan().patchesAsignacion
    expect(pa.preliquidacion.valor_contratista).toBe(614_147)
    expect(pa.preliquidacion.valor_alcance).toBe(2_680_336)
  })
  it('historial en los TRES lados, estado sin moverse, motivo con autoría', () => {
    const p = plan()
    const s = p.patchSolicitud.historial[p.patchSolicitud.historial.length - 1]
    expect(s.de).toBe('aceptada'); expect(s.a).toBe('aceptada')
    expect(s.motivo).toContain('Autorizó: Marcela (gerencia_administrativa)')
    expect(p.patchProyecto.historial[p.patchProyecto.historial.length - 1].motivo).toContain('valor del contratista NO se toca')
    expect(p.patchesAsignacion[0].historial[p.patchesAsignacion[0].historial.length - 1].motivo).toContain('1280269 → 2680336')
  })
  it('sin preliquidación (el 086): patch de asignación vacío, el resto corre', () => {
    const r = planCorreccionPreventivo({
      solicitud: solicitud080(), proyecto: proyecto080(), asignaciones: [{ id: 'a1', contratista_nombre: 'David Bernal', estado: 'asignada', historial: [] }],
      nueva: JUNGLE, motivo: 'm', uid: 'g1', rol: 'admin', fecha: ts,
    })
    expect(r.ok && r.plan.patchesAsignacion).toEqual([])
    expect(r.ok && r.plan.margenes).toEqual([])
  })
  it('misma clasificación → error "nada que corregir"; rooftop liviano → combinación; sin motivo → error', () => {
    const base = { solicitud: solicitud080(), proyecto: proyecto080(), asignaciones: [], uid: 'g', rol: 'admin', fecha: ts }
    const igual = planCorreccionPreventivo({ ...base, nueva: { tipo_sitio: 'greenfield', intensidad: 'pesado', es_jungle: false }, motivo: 'm' })
    expect(!igual.ok && igual.error).toContain('nada que corregir')
    const combo = planCorreccionPreventivo({ ...base, nueva: { tipo_sitio: 'rooftop', intensidad: 'liviano', es_jungle: true }, motivo: 'm' })
    expect(!combo.ok && combo.error).toContain('no disponible')
    const sinMotivo = planCorreccionPreventivo({ ...base, nueva: JUNGLE, motivo: '  ' })
    expect(!sinMotivo.ok && sinMotivo.error).toContain('obligatorio')
  })
})

describe('maestro de sitios — helpers', () => {
  it('normalizarCodigoSitio: mayúsculas, sin espacios ni caracteres de ruta', () => {
    expect(normalizarCodigoSitio(' cobol 7049 ')).toBe('COBOL7049')
    expect(normalizarCodigoSitio('CO/BOL#7049')).toBe('COBOL7049')
    expect(normalizarCodigoSitio('')).toBe('')
  })
  it('contradiccionesConMaestro: coincide → []; jungle difiere → lo dice', () => {
    const maestro = { clasificacion: JUNGLE }
    expect(contradiccionesConMaestro(maestro, JUNGLE)).toEqual([])
    const c = contradiccionesConMaestro(maestro, { ...JUNGLE, es_jungle: false })
    expect(c).toHaveLength(1)
    expect(c[0]).toContain('SÍ es jungle')
  })
  it('alta desde solicitud + corrección con historial append-only', () => {
    const sitio = construirSitioDesdeSolicitud({
      codigo: 'cobol7049', nombre: ' SIMITI ', departamento: 'Bolívar', zona: 'Z2',
      clasificacion: { ...JUNGLE, es_jungle: false }, uid: 'paula', nombreUsuario: 'Paula',
      solicitudConsecutivo: 'SOL-2026-110', fecha: ts,
    })
    expect(sitio.codigo).toBe('COBOL7049')
    expect(sitio.nombre).toBe('SIMITI')
    expect(sitio.origen).toBe('solicitud')
    const patch = patchMaestroPorCorreccion(sitio as SitioPreventivo, JUNGLE, 'g1', 'Marcela', 'cliente confirmó jungle', ts)
    expect(patch.clasificacion.es_jungle).toBe(true)
    expect(patch.origen).toBe('correccion')
    expect(patch.historial).toHaveLength(1)
    expect(patch.historial[0].antes.es_jungle).toBe(false)
    expect(resumenClasificacion(patch.clasificacion)).toBe('Greenfield · Pesado · Jungle')
  })
})
