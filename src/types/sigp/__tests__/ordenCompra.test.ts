// Módulo Compras C2/OC1 — helpers puros y máquina de estados de la OC.
import { describe, it, expect } from 'vitest'
import {
  valorLineaDe, totalDe, subtotalDe, ivaLineaDe, ivaTotalDe, totalConIvaDe,
  discriminaIva, tarifaIvaUniforme, IVA_PCT_OPCIONES, IVA_PCT_DEFAULT,
  construirSnapshotProveedor,
  validarOcParaEmitir, requiereSalvedadAprobacion,
  validarOcParaComprar, TRANSICIONES_OC, ESTADOS_OC,
} from '../ordenCompra'
import type { LineaOrdenCompra, DespachoOC, CondicionesOC } from '../ordenCompra'
import { faltantesConfigEmpresa } from '../configEmpresa'

const linea = (parcial: Partial<LineaOrdenCompra> = {}): LineaOrdenCompra => ({
  descripcion: 'Cemento gris 50kg', unidad: 'Und', iva_pct: 19,
  cantidad: 10, valor_unitario: 32_000, valor: 320_000,
  ...parcial,
})

const despachoOk: DespachoOC = { direccion: 'Cra 1 # 2-3', contacto: 'Juan', telefono: '3001112233' }
const condicionesOk: CondicionesOC = { forma_pago: 'Crédito 30 días' }

describe('valorLineaDe / totalDe (subtotal)', () => {
  it('valor = cantidad × unitario, redondeado a peso', () => {
    expect(valorLineaDe(10, 32_000)).toBe(320_000)
    expect(valorLineaDe(2.5, 1_333.33)).toBe(3333)   // 3333.325 → 3333
    expect(valorLineaDe(0, 5000)).toBe(0)
  })
  it('total = Σ líneas (sin IVA — subtotalDe es alias)', () => {
    expect(totalDe([linea(), linea({ valor: 80_000 })])).toBe(400_000)
    expect(subtotalDe([linea()])).toBe(320_000)
    expect(totalDe([])).toBe(0)
  })
})

describe('OC1 — IVA por línea (jamás tarifa sobre el subtotal)', () => {
  it('ivaLineaDe: pct de la línea sobre su valor, redondeado a peso; sin pct (legacy) → 0', () => {
    expect(ivaLineaDe({ valor: 100_000, iva_pct: 19 })).toBe(19_000)
    expect(ivaLineaDe({ valor: 100_000, iva_pct: 5 })).toBe(5_000)
    expect(ivaLineaDe({ valor: 100_000, iva_pct: 0 })).toBe(0)
    expect(ivaLineaDe({ valor: 100_000 })).toBe(0)
  })

  it('CASO MIXTO (fijado por decisión): con tarifas 19/0, Σ por línea ≠ 19% del subtotal', () => {
    const mixtas = [
      linea({ valor: 100_000, iva_pct: 19 }),
      linea({ valor: 50_000, iva_pct: 0 }),
    ]
    const porLinea = ivaTotalDe(mixtas)                       // 19.000 + 0
    const sobreSubtotal = Math.round(subtotalDe(mixtas) * 0.19) // 150.000 × 19%
    expect(porLinea).toBe(19_000)
    expect(sobreSubtotal).toBe(28_500)
    expect(porLinea).not.toBe(sobreSubtotal)
    expect(totalConIvaDe(mixtas)).toBe(150_000 + 19_000)
  })

  it('incluso con tarifa uniforme, el redondeo es POR LÍNEA (Σ de redondeos, no redondeo del Σ)', () => {
    const l = [
      linea({ valor: 333, iva_pct: 19 }),   // 63,27 → 63
      linea({ valor: 333, iva_pct: 19 }),   // 63,27 → 63
    ]
    expect(ivaTotalDe(l)).toBe(126)
    expect(Math.round(subtotalDe(l) * 0.19)).toBe(127)   // el método prohibido daría 127
  })

  it('tarifaIvaUniforme: pct común → rótulo "IVA 19%"; mixtas o legacy → null', () => {
    expect(tarifaIvaUniforme([linea(), linea({ iva_pct: 19 })])).toBe(19)
    expect(tarifaIvaUniforme([linea({ iva_pct: 5 }), linea({ iva_pct: 5 })])).toBe(5)
    expect(tarifaIvaUniforme([linea(), linea({ iva_pct: 0 })])).toBeNull()
    expect(tarifaIvaUniforme([linea({ iva_pct: undefined })])).toBeNull()
  })

  it('discriminaIva — degradación honesta de la OC legacy (OC-2026-001: líneas sin iva_pct)', () => {
    expect(discriminaIva([linea(), linea()])).toBe(true)
    expect(discriminaIva([linea(), linea({ iva_pct: undefined })])).toBe(false)
    expect(discriminaIva([])).toBe(false)
  })

  it('tarifas admitidas: 19 (default), 5 y 0', () => {
    expect(IVA_PCT_DEFAULT).toBe(19)
    expect([...IVA_PCT_OPCIONES]).toEqual([19, 5, 0])
  })
})

describe('OC1 — construirSnapshotProveedor: whitelist por construcción', () => {
  it('copia identidad + contacto y NADA más', () => {
    expect(construirSnapshotProveedor({
      identificacion: '900.111.222-3',
      razon_social: 'FERRETERÍA X S.A.S.',
      contacto: { nombre: 'Ana', telefono: '3010000000', correo: 'ana@x.co' },
    })).toEqual({
      identificacion: '900.111.222-3',
      razon_social: 'FERRETERÍA X S.A.S.',
      contacto_nombre: 'Ana',
      contacto_telefono: '3010000000',
      contacto_correo: 'ana@x.co',
    })
  })
  it('sin contacto → snapshot mínimo (sin claves vacías)', () => {
    const s = construirSnapshotProveedor({ identificacion: '123', razon_social: 'Y' })
    expect(s).toEqual({ identificacion: '123', razon_social: 'Y' })
  })
  it('REGLA DURA: los datos bancarios jamás entran al snapshot, ni colados en el objeto', () => {
    const conBancarios = {
      identificacion: '123', razon_social: 'Z',
      contacto: { nombre: 'Ana' },
      // claves que un doc mal armado podría traer — se ignoran por construcción
      banco: 'Bancolombia', tipo_cuenta: 'ahorros', numero_cuenta: '999-1',
      certificacion_bancaria_url: 'https://x/cert.pdf',
    }
    const s = construirSnapshotProveedor(conBancarios) as unknown as Record<string, unknown>
    expect(Object.keys(s).sort()).toEqual(['contacto_nombre', 'identificacion', 'razon_social'])
    expect(JSON.stringify(s)).not.toMatch(/banco|cuenta|certificacion/i)
  })
})

describe('validarOcParaEmitir — validación dura del EMITIR (OC1)', () => {
  const ocOk = {
    lineas: [linea()],
    valor_total: totalConIvaDe([linea()]),   // 320.000 + 60.800 = 380.800
    cotizacion_proveedor_url: 'https://x/uuid.pdf',
    despacho: despachoOk,
    condiciones: condicionesOk,
  }

  it('OC completa → sin errores (valor_total = TOTAL CON IVA)', () => {
    expect(ocOk.valor_total).toBe(380_800)
    expect(validarOcParaEmitir(ocOk)).toEqual({})
  })
  it('sin líneas → error', () => {
    expect(validarOcParaEmitir({ ...ocOk, lineas: [], valor_total: 0 }).lineas).toBeTruthy()
  })
  it('línea sin descripción / sin unidad / cantidad 0 / unitario 0 / IVA inválido → error por línea', () => {
    const malas = [
      linea({ descripcion: '  ' }),
      linea({ unidad: '' }),
      linea({ cantidad: 0 }),
      linea({ valor_unitario: 0 }),
      linea({ iva_pct: 7 }),
      linea({ iva_pct: undefined }),
    ]
    const e = validarOcParaEmitir({ ...ocOk, lineas: malas, valor_total: totalConIvaDe(malas) })
    expect(e.linea_0_descripcion).toBeTruthy()
    expect(e.linea_1_unidad).toBeTruthy()
    expect(e.linea_2_cantidad).toBeTruthy()
    expect(e.linea_3_valor).toBeTruthy()
    expect(e.linea_4_iva).toBeTruthy()
    expect(e.linea_5_iva).toBeTruthy()
  })
  it('total que no cuadra con subtotal + IVA → error (el Σ por línea es la fuente de verdad)', () => {
    expect(validarOcParaEmitir({ ...ocOk, valor_total: 320_000 }).valor_total).toBeTruthy()
  })
  it('sin cotización del proveedor → error (requisito duro del emitir)', () => {
    expect(validarOcParaEmitir({ ...ocOk, cotizacion_proveedor_url: '' }).cotizacion).toBeTruthy()
  })
  it('despacho incompleto → error por campo (ENTREGAR EN es de la orden)', () => {
    const e = validarOcParaEmitir({ ...ocOk, despacho: { direccion: '', contacto: '', telefono: '' } })
    expect(e.despacho_direccion).toBeTruthy()
    expect(e.despacho_contacto).toBeTruthy()
    expect(e.despacho_telefono).toBeTruthy()
    expect(validarOcParaEmitir({ ...ocOk, despacho: undefined }).despacho_direccion).toBeTruthy()
  })
  it('sin forma de pago → error', () => {
    expect(validarOcParaEmitir({ ...ocOk, condiciones: undefined }).forma_pago).toBeTruthy()
    expect(validarOcParaEmitir({ ...ocOk, condiciones: { forma_pago: ' ' } }).forma_pago).toBeTruthy()
  })
})

describe('faltantesConfigEmpresa — bloque RADICACIÓN del PDF', () => {
  const completa = {
    razon_social: 'NEG INGENIERÍA S.A.S., BIC', nit: '900.975.870-1',
    contacto_radicacion: 'X', movil_radicacion: 'Y',
    direccion_factura: 'facturacion@negingenieria.com', ciudad: 'Bogotá D.C.',
    pie_direccion: '', pie_correo: '', pie_web: '', pie_ciudad: '',
  }
  it('config completa → sin faltantes (el pie es opcional)', () => {
    expect(faltantesConfigEmpresa(completa)).toEqual([])
  })
  it('sin doc → todos los requeridos faltan', () => {
    expect(faltantesConfigEmpresa(null).length).toBe(6)
    expect(faltantesConfigEmpresa(undefined).length).toBe(6)
  })
  it('campo requerido vacío → aparece en la lista', () => {
    expect(faltantesConfigEmpresa({ ...completa, nit: '  ' })).toEqual(['nit'])
  })
})

describe('requiereSalvedadAprobacion — escape aprobador == creador', () => {
  it('mismo uid → salvedad obligatoria; distinto → no', () => {
    expect(requiereSalvedadAprobacion('uidGG', 'uidGG')).toBe(true)
    expect(requiereSalvedadAprobacion('uidGP', 'uidAux')).toBe(false)
  })
})

describe('TRANSICIONES_OC — máquina de estados', () => {
  it('borrador → emitida|anulada; emitida → aprobada|anulada', () => {
    expect(TRANSICIONES_OC.borrador).toEqual(['emitida', 'anulada'])
    expect(TRANSICIONES_OC.emitida).toEqual(['aprobada', 'anulada'])
  })
  it('aprobada → comprada (solo Marcela) o anulada; comprada y anulada terminales', () => {
    // C3: 'comprada' se sumó a la máquina (antes aprobada solo se anulaba)
    expect(TRANSICIONES_OC.aprobada).toEqual(['comprada', 'anulada'])
    expect(TRANSICIONES_OC.comprada).toEqual([])   // recepción = v2
    expect(TRANSICIONES_OC.anulada).toEqual([])
  })
  it('todo estado está en la máquina (exhaustividad)', () => {
    for (const e of ESTADOS_OC) expect(TRANSICIONES_OC[e]).toBeDefined()
  })
})

describe('validarOcParaComprar — la compra de Marcela (C3)', () => {
  it('valor real > 0 + soporte → sin errores', () => {
    expect(validarOcParaComprar({ valorReal: 315_000, tieneSoporte: true })).toEqual({})
  })
  it('sin valor real / valor 0 / sin soporte → error por campo', () => {
    expect(validarOcParaComprar({ tieneSoporte: true }).valor_real).toBeTruthy()
    expect(validarOcParaComprar({ valorReal: 0, tieneSoporte: true }).valor_real).toBeTruthy()
    expect(validarOcParaComprar({ valorReal: 100, tieneSoporte: false }).soporte).toBeTruthy()
  })
})
