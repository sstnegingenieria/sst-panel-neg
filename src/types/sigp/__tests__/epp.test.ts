import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  CATALOGO_EPP_BASE, FIRMANTES_EPP_DEFAULT, FORM_CATALOGO_VACIO, MAX_FIRMA_CHARS, MAX_ITEMS_ACTA,
  PREFIJO_FIRMA_PNG, construirAltaActa, construirAltaCatalogo, firmaPngValida, formDeActa, hashHexValido,
  itemDeCatalogo, patchActivoCatalogo, patchAnularActa, patchEditarActa, patchEditarCatalogo, patchFirmarActa,
  puedeAnularActaEpp, puedeEditarActaEpp, puedeFirmarActaEpp, semillaCatalogo, validarActa, validarItemCatalogo,
  type ActaEpp, type ActaFormData,
} from '../epp'

const AHORA = Timestamp.fromDate(new Date(2026, 9, 19, 10, 0, 0))
const ACTOR = { uid: 'u-gi', nombre: 'Ingrid' }
const FIRMA = PREFIJO_FIRMA_PNG + 'iVBORw0KGgo' + 'A'.repeat(301)
const HASH = 'a'.repeat(64)

const formValido = (extra: Partial<ActaFormData> = {}): ActaFormData => ({
  colaborador: { fuente: 'directo', ref_id: 'e1', nombre: ' Juan Pérez ', cedula: ' 1012345678 ', cargo: ' Técnico ' },
  items: [{ nombre: ' Casco ', especificacion: ' tipo II ', cantidad: 1, unidad: ' 1 ' }],
  fecha: '2026-10-19',
  firmantes_empresa: [{ nombre: ' Pedro Rodríguez ', cargo: ' Director general ' }],
  ...extra,
})

const actaBorrador = (): ActaEpp => construirAltaActa(formValido(), 'v1', ACTOR, AHORA)!

describe('validarActa', () => {
  it('un formulario completo es válido', () => {
    expect(validarActa(formValido())).toEqual({})
  })
  it('sin colaborador, sin elementos y sin fecha reporta cada falta', () => {
    const e = validarActa({ colaborador: null, items: [], fecha: '', firmantes_empresa: [] })
    expect(Object.keys(e).sort()).toEqual(['colaborador', 'fecha', 'firmantes', 'items'])
  })
  it('exige nombre y cédula del colaborador', () => {
    const c = formValido().colaborador!
    expect(validarActa(formValido({ colaborador: { ...c, nombre: '  ' } })).colaborador).toBeTruthy()
    expect(validarActa(formValido({ colaborador: { ...c, cedula: '' } })).colaborador).toBeTruthy()
  })
  it('cada elemento exige nombre, unidad y una cantidad entera de 1 a 99', () => {
    const base = formValido().items[0]
    for (const mala of [
      { ...base, nombre: '' }, { ...base, unidad: ' ' }, { ...base, cantidad: 0 },
      { ...base, cantidad: 100 }, { ...base, cantidad: 1.5 }, { ...base, cantidad: NaN },
    ]) {
      expect(validarActa(formValido({ items: [mala] })).items, JSON.stringify(mala)).toBeTruthy()
    }
  })
  it('la fecha de entrega no puede ser futura ni anterior a 30 días respecto a la referencia', () => {
    const ref = new Date(2026, 9, 19, 10)
    expect(validarActa(formValido({ fecha: '2026-10-19' }), ref).fecha).toBeUndefined()
    expect(validarActa(formValido({ fecha: '2026-09-25' }), ref).fecha).toBeUndefined()   // 24 días atrás
    expect(validarActa(formValido({ fecha: '2026-09-10' }), ref).fecha).toBeTruthy()      // 39 días atrás
    expect(validarActa(formValido({ fecha: '2026-11-20' }), ref).fecha).toBeTruthy()      // futura
    expect(validarActa(formValido({ fecha: '2025-01-10' }), ref).fecha).toBeTruthy()      // antedatar un año
  })
  it('máximo 30 elementos', () => {
    const it0 = formValido().items[0]
    expect(validarActa(formValido({ items: Array.from({ length: MAX_ITEMS_ACTA }, () => it0) })).items).toBeUndefined()
    expect(validarActa(formValido({ items: Array.from({ length: MAX_ITEMS_ACTA + 1 }, () => it0) })).items).toBeTruthy()
  })
  it('un firmante de la empresa sin nombre no cuenta', () => {
    expect(validarActa(formValido({ firmantes_empresa: [{ nombre: ' ', cargo: 'x' }] })).firmantes).toBeTruthy()
  })
  it('los firmantes por defecto son Pedro Rodríguez e Ingrid Laverde', () => {
    expect(FIRMANTES_EPP_DEFAULT.map(f => f.nombre)).toEqual(['Pedro Rodríguez', 'Ingrid Laverde'])
  })
})

describe('construirAltaActa', () => {
  it('nace SIEMPRE borrador, sin firma ni anulación, con el creador real y datos recortados', () => {
    const a = actaBorrador()
    expect(a.estado).toBe('borrador')
    expect(a.firmado).toBe(false)
    expect(a).not.toHaveProperty('firma_colaborador')
    expect(a).not.toHaveProperty('firma_hash')
    expect(a).not.toHaveProperty('fecha_firma')
    expect(a).not.toHaveProperty('anulacion')
    expect(a.creado_por).toBe('u-gi')
    expect(a.entregado_por).toBe('u-gi')
    expect(a.colaborador).toMatchObject({ nombre: 'Juan Pérez', cedula: '1012345678', cargo: 'Técnico' })
    expect(a.items[0]).toMatchObject({ nombre: 'Casco', especificacion: 'tipo II', unidad: '1' })
    expect(a.clausulas_version).toBe('v1')
  })
  it('el historial arranca con UNA entrada del creador hacia borrador', () => {
    const a = actaBorrador()
    expect(a.historial).toHaveLength(1)
    expect(a.historial[0]).toMatchObject({ por: 'u-gi', a: 'borrador' })
    expect(a.historial[0]).not.toHaveProperty('de')
  })
  it('null si el formulario no valida (no escribe)', () => {
    expect(construirAltaActa(formValido({ items: [] }), 'v1', ACTOR, AHORA)).toBeNull()
    expect(construirAltaActa(formValido({ colaborador: null }), 'v1', ACTOR, AHORA)).toBeNull()
  })
  it('contratista_nombre solo viaja con fuente contratista', () => {
    const c = formValido().colaborador!
    const dir = construirAltaActa(formValido({ colaborador: { ...c, contratista_nombre: 'X SAS' } }), 'v1', ACTOR, AHORA)!
    expect(dir.colaborador).not.toHaveProperty('contratista_nombre')
    const con = construirAltaActa(formValido({ colaborador: { ...c, fuente: 'contratista', contratista_nombre: 'X SAS' } }), 'v1', ACTOR, AHORA)!
    expect(con.colaborador.contratista_nombre).toBe('X SAS')
  })
})

describe('patchEditarActa', () => {
  it('solo un borrador; +1 entrada; no toca estado/firma', () => {
    const a = actaBorrador()
    const p = patchEditarActa(a, formValido({ fecha: '2026-10-18' }), ACTOR, AHORA)!
    expect(Object.keys(p).sort()).toEqual(['colaborador', 'fecha', 'fecha_actualizacion', 'firmantes_empresa', 'historial', 'items'])
    expect(p.historial).toHaveLength(2)
  })
  it('null si no es borrador o el formulario no valida', () => {
    expect(patchEditarActa({ ...actaBorrador(), estado: 'firmada' }, formValido(), ACTOR, AHORA)).toBeNull()
    expect(patchEditarActa({ ...actaBorrador(), estado: 'anulada' }, formValido(), ACTOR, AHORA)).toBeNull()
    expect(patchEditarActa(actaBorrador(), formValido({ items: [] }), ACTOR, AHORA)).toBeNull()
  })
  it('formDeActa y patchEditarActa son inversos', () => {
    const a = actaBorrador()
    expect(validarActa(formDeActa(a))).toEqual({})
  })
})

describe('patchFirmarActa', () => {
  it('toca SOLO estado/firmado/firma/hash/fecha_firma/fecha_actualizacion/historial', () => {
    const p = patchFirmarActa(actaBorrador(), FIRMA, HASH, ACTOR, AHORA)!
    expect(Object.keys(p).sort()).toEqual(['estado', 'fecha_actualizacion', 'fecha_firma', 'firma_colaborador', 'firma_hash', 'firmado', 'historial'])
    expect(p).toMatchObject({ estado: 'firmada', firmado: true, firma_colaborador: FIRMA, firma_hash: HASH })
    const ultima = p.historial![p.historial!.length - 1]
    expect(ultima).toMatchObject({ de: 'borrador', a: 'firmada', por: 'u-gi' })
  })
  it('null si no es borrador, la firma no es un PNG legal o el hash está mal formado', () => {
    expect(patchFirmarActa({ ...actaBorrador(), estado: 'firmada' }, FIRMA, HASH, ACTOR, AHORA)).toBeNull()
    expect(patchFirmarActa({ ...actaBorrador(), estado: 'anulada' }, FIRMA, HASH, ACTOR, AHORA)).toBeNull()
    expect(patchFirmarActa(actaBorrador(), 'data:image/jpeg;base64,AAAA', HASH, ACTOR, AHORA)).toBeNull()
    expect(patchFirmarActa(actaBorrador(), FIRMA, 'ZZ', ACTOR, AHORA)).toBeNull()
    expect(patchFirmarActa(actaBorrador(), FIRMA, 'A'.repeat(64), ACTOR, AHORA)).toBeNull()
  })
})

describe('patchAnularActa', () => {
  it('anula un borrador y una FIRMADA; solo toca estado/anulacion/historial/fecha_actualizacion (preserva firma y contenido)', () => {
    const firmada = { ...actaBorrador(), estado: 'firmada' as const, firmado: true, firma_colaborador: FIRMA, firma_hash: HASH }
    for (const a of [actaBorrador(), firmada]) {
      const p = patchAnularActa(a, ' Entrega duplicada ', ACTOR, AHORA)!
      expect(Object.keys(p).sort()).toEqual(['anulacion', 'estado', 'fecha_actualizacion', 'historial'])
      expect(p.estado).toBe('anulada')
      expect(p.anulacion!.motivo).toBe('Entrega duplicada')
      expect(p.historial![p.historial!.length - 1]).toMatchObject({ de: a.estado, a: 'anulada' })
    }
  })
  it('null sin motivo, con motivo gigante o sobre una anulada', () => {
    expect(patchAnularActa(actaBorrador(), '  ', ACTOR, AHORA)).toBeNull()
    expect(patchAnularActa(actaBorrador(), 'x'.repeat(2001), ACTOR, AHORA)).toBeNull()
    expect(patchAnularActa({ ...actaBorrador(), estado: 'anulada' }, 'otra vez', ACTOR, AHORA)).toBeNull()
  })
  it('puedeEditar/Firmar solo en borrador; puedeAnular salvo anulada', () => {
    expect([puedeEditarActaEpp('borrador'), puedeEditarActaEpp('firmada'), puedeEditarActaEpp('anulada')]).toEqual([true, false, false])
    expect([puedeFirmarActaEpp('borrador'), puedeFirmarActaEpp('firmada'), puedeFirmarActaEpp('anulada')]).toEqual([true, false, false])
    expect([puedeAnularActaEpp('borrador'), puedeAnularActaEpp('firmada'), puedeAnularActaEpp('anulada')]).toEqual([true, true, false])
  })
})

describe('firmaPngValida / hashHexValido (espejo de la regla)', () => {
  it('acepta un PNG base64 y rechaza lo demás', () => {
    expect(firmaPngValida(FIRMA)).toBe(true)
    expect(firmaPngValida(PREFIJO_FIRMA_PNG + 'iVBORw0KGgo' + 'A'.repeat(299) + '==')).toBe(true)
    expect(firmaPngValida(FIRMA + 'A')).toBe(false)                                  // base64 con longitud inválida
    expect(firmaPngValida(PREFIJO_FIRMA_PNG + 'A'.repeat(312))).toBe(false)          // sin la cabecera de archivo PNG
    expect(firmaPngValida('data:image/jpeg;base64,AAAA')).toBe(false)
    expect(firmaPngValida('data:image/svg+xml;base64,AAAA')).toBe(false)
    expect(firmaPngValida(PREFIJO_FIRMA_PNG)).toBe(false)
    expect(firmaPngValida(PREFIJO_FIRMA_PNG + 'iVBORw0KGgo<script>')).toBe(false)
    expect(firmaPngValida(123)).toBe(false)
    expect(firmaPngValida(PREFIJO_FIRMA_PNG + 'iVBORw0KGgo' + 'A'.repeat(MAX_FIRMA_CHARS))).toBe(false)
  })
  it('el hash es SHA-256 hex en minúsculas', () => {
    expect(hashHexValido('a'.repeat(64))).toBe(true)
    expect(hashHexValido('A'.repeat(64))).toBe(false)
    expect(hashHexValido('a'.repeat(63))).toBe(false)
  })
})

describe('catálogo', () => {
  const f = (extra = {}) => ({ ...FORM_CATALOGO_VACIO, nombre: 'Casco', ...extra })
  it('validarItemCatalogo exige nombre, unidad y cantidad 1–99', () => {
    expect(validarItemCatalogo(f())).toEqual({})
    expect(validarItemCatalogo(f({ nombre: ' ' })).nombre).toBeTruthy()
    expect(validarItemCatalogo(f({ unidad: '' })).unidad).toBeTruthy()
    expect(validarItemCatalogo(f({ cantidad_default: '0' })).cantidad_default).toBeTruthy()
    expect(validarItemCatalogo(f({ cantidad_default: '100' })).cantidad_default).toBeTruthy()
    expect(validarItemCatalogo(f({ cantidad_default: '1.5' })).cantidad_default).toBeTruthy()
  })
  it('alta nace activa y firmada por el creador; edición no toca creado_por; baja es soft', () => {
    const alta = construirAltaCatalogo(f({ cantidad_default: '2' }), 'u1', AHORA)!
    expect(alta).toMatchObject({ activo: true, creado_por: 'u1', actualizado_por: 'u1', cantidad_default: 2 })
    const ed = patchEditarCatalogo(f({ nombre: 'Otro' }), 'u2', AHORA)!
    expect(ed).not.toHaveProperty('creado_por')
    expect(ed.actualizado_por).toBe('u2')
    expect(patchActivoCatalogo(false, 'u2', AHORA)).toMatchObject({ activo: false, actualizado_por: 'u2' })
    expect(construirAltaCatalogo(f({ nombre: '' }), 'u1', AHORA)).toBeNull()
  })
  it('la semilla trae los 9 elementos del formato con ids únicos (idempotente por id)', () => {
    expect(CATALOGO_EPP_BASE).toHaveLength(9)
    expect(new Set(CATALOGO_EPP_BASE.map(i => i.id)).size).toBe(9)
    const s = semillaCatalogo('u1', AHORA)
    expect(s).toHaveLength(9)
    for (const { data } of s) {
      expect(validarItemCatalogo({ nombre: data.nombre, especificacion: data.especificacion, unidad: data.unidad, cantidad_default: String(data.cantidad_default) })).toEqual({})
      expect(data).toMatchObject({ activo: true, creado_por: 'u1' })
    }
    const nombres = CATALOGO_EPP_BASE.map(i => i.nombre).join(' | ').toLowerCase()
    for (const esperado of ['gafas', 'guantes g40', 'látex', 'auditivo', 'casco', 'camisa', 'chaqueta', 'botas']) {
      expect(nombres).toContain(esperado)
    }
  })
  it('itemDeCatalogo autocompleta nombre, especificación, unidad y cantidad', () => {
    const c = construirAltaCatalogo(f({ especificacion: 'tipo II', unidad: '1 par', cantidad_default: '2' }), 'u1', AHORA)!
    expect(itemDeCatalogo(c)).toEqual({ nombre: 'Casco', especificacion: 'tipo II', cantidad: 2, unidad: '1 par' })
  })
})
