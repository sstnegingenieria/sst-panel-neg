import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  CLAVES_PORQUE, FORM_ACCION_VACIO, FUENTES_ACCION, TIPOS_ACCION,
  construirAlta, formDeAccion, parsearNumerales, patchAnular, patchEditar,
  porquesDiligenciados, puedeAnularAccion, puedeEditarAccion, timestampDeFechaInput,
  fechaInputDeTimestamp, validarAccion,
  PREFIJO_POR_TIPO, actividadesAbiertas, consecutivoAcApValido, faltantesParaEmitir, patchEmitir, puedeEmitirAccion,
  type AccionFormData, type AccionMejora,
} from '../accionMejora'

const AHORA = Timestamp.fromDate(new Date(2026, 9, 14, 10, 0, 0))
const ACTOR = { uid: 'u-gi', nombre: 'Ingrid' }

const formValido = (extra: Partial<AccionFormData> = {}): AccionFormData => ({
  ...FORM_ACCION_VACIO,
  tipo: 'correctiva',
  fecha: '2026-10-14',
  descripcion_nc: 'Se entregó el informe sin la revisión del líder.',
  fuente: 'auditoria',
  ...extra,
})

describe('validarAccion — obligatorios del borrador', () => {
  it('el formulario vacío reporta los 4 obligatorios', () => {
    expect(Object.keys(validarAccion(FORM_ACCION_VACIO)).sort()).toEqual(['descripcion_nc', 'fecha', 'fuente', 'tipo'])
  })

  it('con tipo, fecha, descripción y fuente es válido aunque el resto (incl. los 5 por qués) esté vacío', () => {
    expect(validarAccion(formValido())).toEqual({})
  })

  it('una descripción solo de espacios no cuenta', () => {
    expect(validarAccion(formValido({ descripcion_nc: '   ' })).descripcion_nc).toBeTruthy()
  })

  it('un tipo o una fuente fuera del catálogo no valida', () => {
    expect(validarAccion(formValido({ tipo: 'otro' as never })).tipo).toBeTruthy()
    expect(validarAccion(formValido({ fuente: 'inventada' as never })).fuente).toBeTruthy()
  })

  it('el catálogo trae los 3 tipos y las 12 fuentes acordadas', () => {
    expect([...TIPOS_ACCION]).toEqual(['correctiva', 'preventiva', 'mejora'])
    expect(FUENTES_ACCION).toHaveLength(12)
    expect(FUENTES_ACCION).toContain('rechazo_sst')
  })
})

describe('construirAlta', () => {
  it('nace SIEMPRE borrador, sin consecutivo ni anulación, con origen_ref null y creador real', () => {
    const a = construirAlta(formValido(), ACTOR, AHORA)!
    expect(a.estado).toBe('borrador')
    expect(a.consecutivo).toBeNull()
    expect(a.origen_ref).toBeNull()
    expect(a.creado_por).toBe('u-gi')
    expect(a).not.toHaveProperty('anulacion')
    expect(a.fecha_creacion).toBe(AHORA)
  })

  it('el historial arranca con UNA entrada del creador', () => {
    const a = construirAlta(formValido(), ACTOR, AHORA)!
    expect(a.historial).toHaveLength(1)
    expect(a.historial[0]).toMatchObject({ por: 'u-gi', a: 'borrador' })
  })

  it('no construye nada si el formulario no valida', () => {
    expect(construirAlta(FORM_ACCION_VACIO, ACTOR, AHORA)).toBeNull()
  })

  it('normaliza los numerales de la norma y recorta los por qués', () => {
    const a = construirAlta(formValido({
      numeral_texto: '9001:2015 10.2, 45001:2018 10.2; 9001:2015 10.2',
      porques: ['  uno ', '', '', '', ''],
    }), ACTOR, AHORA)!
    expect(a.numeral_norma).toEqual(['9001:2015 10.2', '45001:2018 10.2'])
    expect(a.causa_raiz.porque_1).toBe('uno')
    expect(CLAVES_PORQUE.every(k => k in a.causa_raiz)).toBe(true)
  })
})

describe('parsearNumerales / fechas', () => {
  it('separa por coma, punto y coma o salto de línea, sin vacíos ni repetidos', () => {
    expect(parsearNumerales('a, b;\nc,,  ,a')).toEqual(['a', 'b', 'c'])
    expect(parsearNumerales('')).toEqual([])
  })

  it('la fecha del input viaja a mediodía local: ida y vuelta sin correrse un día', () => {
    const ts = timestampDeFechaInput('2026-10-14')!
    expect(ts.toDate().getHours()).toBe(12)
    expect(fechaInputDeTimestamp(ts)).toBe('2026-10-14')
    expect(timestampDeFechaInput('14/10/2026')).toBeNull()
    expect(fechaInputDeTimestamp(undefined)).toBe('')
  })
})

describe('patchEditar — solo un borrador', () => {
  const borrador = construirAlta(formValido(), ACTOR, AHORA)!

  it('edita un borrador: agrega UNA entrada al historial conservando las anteriores y no toca estado ni creador', () => {
    const p = patchEditar(borrador, formValido({ descripcion_nc: 'Texto corregido' }), ACTOR, AHORA)!
    expect(p.descripcion_nc).toBe('Texto corregido')
    expect(p.historial).toHaveLength(2)
    expect(p.historial![0]).toEqual(borrador.historial[0])
    expect(p).not.toHaveProperty('estado')
    expect(p).not.toHaveProperty('creado_por')
    expect(p).not.toHaveProperty('consecutivo')
  })

  it('una abierta o una anulada NO se edita', () => {
    expect(patchEditar({ ...borrador, estado: 'abierta' }, formValido(), ACTOR, AHORA)).toBeNull()
    expect(patchEditar({ ...borrador, estado: 'anulada' }, formValido(), ACTOR, AHORA)).toBeNull()
  })

  it('un formulario inválido no edita', () => {
    expect(patchEditar(borrador, formValido({ fuente: '' }), ACTOR, AHORA)).toBeNull()
  })
})

describe('patchAnular — baja soft con motivo, terminal', () => {
  const borrador = construirAlta(formValido(), ACTOR, AHORA)!

  it('exige motivo', () => {
    expect(patchAnular(borrador, '', ACTOR, AHORA)).toBeNull()
    expect(patchAnular(borrador, '   ', ACTOR, AHORA)).toBeNull()
  })

  it('anula: estado, registro de anulación (quién, cuándo, motivo) y entrada de historial; el resto intacto', () => {
    const p = patchAnular(borrador, ' Duplicada de la AC anterior ', ACTOR, AHORA)!
    expect(p.estado).toBe('anulada')
    expect(p.anulacion).toMatchObject({ por: 'u-gi', motivo: 'Duplicada de la AC anterior' })
    expect(p.historial).toHaveLength(2)
    expect(p.historial![1]).toMatchObject({ de: 'borrador', a: 'anulada', nota: 'Duplicada de la AC anterior' })
    expect(Object.keys(p).sort()).toEqual(['anulacion', 'estado', 'fecha_actualizacion', 'historial'])
  })

  it('una anulada es terminal: no se vuelve a anular', () => {
    expect(patchAnular({ ...borrador, estado: 'anulada' }, 'otra vez', ACTOR, AHORA)).toBeNull()
  })

  it('también se puede anular una abierta (F2)', () => {
    expect(patchAnular({ ...borrador, estado: 'abierta' }, 'error de captura', ACTOR, AHORA)?.estado).toBe('anulada')
  })

  it('helpers de estado: editar solo borrador; anular todo menos anulada', () => {
    expect(puedeEditarAccion('borrador')).toBe(true)
    expect(puedeEditarAccion('abierta')).toBe(false)
    expect(puedeAnularAccion('anulada')).toBe(false)
    expect(puedeAnularAccion('borrador')).toBe(true)
  })
})

describe('porquesDiligenciados / formDeAccion', () => {
  it('cuenta solo los por qués con texto', () => {
    expect(porquesDiligenciados(undefined)).toBe(0)
    expect(porquesDiligenciados({ porque_1: 'a', porque_2: '  ', porque_3: 'c' })).toBe(2)
  })

  it('formDeAccion ↔ construirAlta es un viaje de ida y vuelta', () => {
    const f = formValido({
      cliente_proceso: 'Claro · Mantenimiento', lider_proceso: 'Pedro', observaciones: 'obs',
      numeral_texto: '9001 10.2, 14001 10.2', porques: ['a', 'b', 'c', 'd', 'e'],
    })
    const a: AccionMejora = construirAlta(f, ACTOR, AHORA)!
    expect(formDeAccion(a)).toEqual({ ...f, numeral_texto: '9001 10.2, 14001 10.2' })
  })
})


// ════════════════════ F2a — EMITIR (borrador → abierta) ════════════════════
describe('consecutivoAcApValido — espejo de la regla', () => {
  it('prefijo según el tipo, año en curso y ≥3 dígitos', () => {
    expect(consecutivoAcApValido('AC-2026-001', 'correctiva', 2026)).toBe(true)
    expect(consecutivoAcApValido('AP-2026-012', 'preventiva', 2026)).toBe(true)
    expect(consecutivoAcApValido('MEJ-2026-100', 'mejora', 2026)).toBe(true)
    expect(consecutivoAcApValido('AC-2026-1000', 'correctiva', 2026)).toBe(true)
  })

  it('rechaza prefijo de otro tipo, otro año, formato roto, cero y no-string', () => {
    expect(consecutivoAcApValido('AP-2026-001', 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido('MEJ-2026-001', 'preventiva', 2026)).toBe(false)
    expect(consecutivoAcApValido('AC-2025-001', 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido('AC-2026-01', 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido('AC-2026-000', 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido('AC-2026-0001', 'correctiva', 2026)).toBe(false)   // sin ceros a la izquierda: lo que la CF nunca produce
    expect(consecutivoAcApValido('AC-2026-01000', 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido('ac-2026-001', 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido('AC-2026-001x', 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido('ACAP-2026-001', 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido(null, 'correctiva', 2026)).toBe(false)
    expect(consecutivoAcApValido(undefined, 'correctiva', 2026)).toBe(false)
  })

  it('PREFIJO_POR_TIPO: correctiva→AC, preventiva→AP, mejora→MEJ', () => {
    expect(PREFIJO_POR_TIPO).toEqual({ correctiva: 'AC', preventiva: 'AP', mejora: 'MEJ' })
  })
})

describe('faltantesParaEmitir / patchEmitir', () => {
  const CINCO = { porque_1: 'a', porque_2: 'b', porque_3: 'c', porque_4: 'd', porque_5: 'e' }
  const borrador = (extra: Partial<AccionMejora> = {}): AccionMejora =>
    ({ ...construirAlta(formValido({ porques: ['a', 'b', 'c', 'd', 'e'] }), ACTOR, AHORA)!, ...extra })

  it('un borrador con los 5 por qués no tiene faltantes', () => {
    expect(faltantesParaEmitir(borrador())).toEqual([])
  })

  it('lista cada por qué vacío (o solo espacios) y la descripción', () => {
    const f = faltantesParaEmitir(borrador({ causa_raiz: { ...CINCO, porque_2: '', porque_5: '   ' }, descripcion_nc: ' ' }))
    expect(f).toHaveLength(3)
    expect(f.join(' ')).toContain('¿Por qué? 2')
    expect(f.join(' ')).toContain('¿Por qué? 5')
    expect(f.join(' ')).toContain('descripción')
  })

  it('un borrador recién creado con 0 por qués no es emitible', () => {
    expect(faltantesParaEmitir(construirAlta(formValido(), ACTOR, AHORA)!)).toHaveLength(5)
  })

  it('solo un borrador se emite', () => {
    expect(faltantesParaEmitir(borrador({ estado: 'abierta' }))).toContain('Solo un borrador se puede emitir')
    expect(faltantesParaEmitir(borrador({ estado: 'anulada' }))).toContain('Solo un borrador se puede emitir')
  })

  it('patchEmitir: toca SOLO estado/consecutivo/historial/fecha_actualizacion, +1 entrada borrador→abierta', () => {
    const a = borrador()
    const p = patchEmitir(a, 'AC-2026-007', ACTOR, AHORA)!
    expect(Object.keys(p).sort()).toEqual(['consecutivo', 'estado', 'fecha_actualizacion', 'historial'])
    expect(p.estado).toBe('abierta')
    expect(p.consecutivo).toBe('AC-2026-007')
    expect(p.fecha_actualizacion).toBe(AHORA)
    expect(p.historial).toHaveLength(a.historial.length + 1)
    expect(p.historial!.slice(0, a.historial.length)).toEqual(a.historial)
    const ultima = p.historial![p.historial!.length - 1]
    expect(ultima).toMatchObject({ de: 'borrador', a: 'abierta', por: 'u-gi' })
    expect(ultima.nota).toContain('AC-2026-007')
  })

  it('patchEmitir: null con causa raíz incompleta, estado ilegal, prefijo de otro tipo o año distinto', () => {
    expect(patchEmitir(borrador({ causa_raiz: { ...CINCO, porque_5: '' } }), 'AC-2026-001', ACTOR, AHORA)).toBeNull()
    expect(patchEmitir(borrador({ estado: 'abierta' }), 'AC-2026-001', ACTOR, AHORA)).toBeNull()
    expect(patchEmitir(borrador(), 'AP-2026-001', ACTOR, AHORA)).toBeNull()
    expect(patchEmitir(borrador(), 'AC-2025-001', ACTOR, AHORA)).toBeNull()
    expect(patchEmitir(borrador(), 'AC-2026-1', ACTOR, AHORA)).toBeNull()
  })

  it('patchEmitir usa el prefijo del tipo (preventiva→AP, mejora→MEJ)', () => {
    const prev = borrador({ tipo: 'preventiva' })
    expect(patchEmitir(prev, 'AP-2026-001', ACTOR, AHORA)).not.toBeNull()
    expect(patchEmitir(prev, 'AC-2026-001', ACTOR, AHORA)).toBeNull()
    const mej = borrador({ tipo: 'mejora' })
    expect(patchEmitir(mej, 'MEJ-2026-001', ACTOR, AHORA)).not.toBeNull()
  })

  it('puedeEmitirAccion: solo borrador', () => {
    expect(puedeEmitirAccion('borrador')).toBe(true)
    expect(puedeEmitirAccion('abierta')).toBe(false)
    expect(puedeEmitirAccion('anulada')).toBe(false)
  })
})

describe('actividadesAbiertas — el aviso al anular', () => {
  const t = (id: string, estado: string) => ({ id, titulo: id, estado })
  it('cuenta las que no están hechas ni anuladas (pendiente, en curso, en espera)', () => {
    const abiertas = actividadesAbiertas([
      t('a', 'pendiente'), t('b', 'en_curso'), t('c', 'en_espera'), t('d', 'hecha'), t('e', 'anulada'),
    ])
    expect(abiertas.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('sin actividades → vacío', () => {
    expect(actividadesAbiertas([])).toEqual([])
  })
})
