// Paquete GI · C5a — cargue manual de a una + ficha documental mínima.
import { describe, it, expect } from 'vitest'
import { Timestamp, deleteField } from 'firebase/firestore'
import {
  patchAgregarPersona, patchDocumentoPersona, patchCargarNomina,
  CAMPOS_DOC_PERSONA, ES_EXAMEN_MEDICO, parsearPegado, clasificarFilas,
} from '../contratistasNomina'
import type { NominaContratista } from '../contratistasNomina'

const ahora = Timestamp.fromMillis(1_760_000_000_000)
const yo = { uid: 'uid-ingrid', nombre: 'Ingrid GI' }

const nominaCon = (trabajadores: NominaContratista['trabajadores']): NominaContratista => ({ trabajadores })

describe('patchAgregarPersona — el camino del WhatsApp', () => {
  it('nueva: escribe identidad por dot-paths y limpia retirado', () => {
    const r = patchAgregarPersona(null, '  Juan   Pérez ', '79.456.123', {}, yo, ahora)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tipo).toBe('nueva')
    expect(r.patch['trabajadores.79456123.nombre']).toBe('Juan Pérez')
    expect(r.patch['trabajadores.79456123.cedula_original']).toBe('79.456.123')
    expect(r.patch['trabajadores.79456123.retirado']).toEqual(deleteField())
  })
  it('cédula ilegible (letras) → error honesto, jamás dígitos sueltos', () => {
    const r = patchAgregarPersona(null, 'Ana', 'AB123456', {}, yo, ahora)
    expect(r.ok).toBe(false)
  })
  it('viva duplicada en ESTA nómina → error con el nombre', () => {
    const n = nominaCon({ '79456123': { nombre: 'Juan Pérez', cedula_original: '79456123', cargado_por: 'x', cargado_por_nombre: '', fecha_carga: ahora } })
    const r = patchAgregarPersona(n, 'Juan P.', '79456123', {}, yo, ahora)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('Juan Pérez')
  })
  it('retirada → reincorpora (y PRESERVA su carpeta: dot-paths, no nodo)', () => {
    const n = nominaCon({ '79456123': { nombre: 'Juan', cedula_original: '79456123', cargado_por: 'x', cargado_por_nombre: '', fecha_carga: ahora, retirado: true, eps: { vencimiento: '2027-01-01' } } })
    const r = patchAgregarPersona(n, 'Juan Pérez', '79456123', {}, yo, ahora)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tipo).toBe('reincorporada')
    // ningún dot-path toca eps/arl/… — la ficha queda intacta
    expect(Object.keys(r.patch).some(k => k.includes('.eps'))).toBe(false)
  })
  it('viva en OTRA nómina → guard (retirarlo allá primero)', () => {
    const r = patchAgregarPersona(null, 'Juan', '79456123', { otro: new Set(['79456123']) }, yo, ahora)
    expect(r.ok).toBe(false)
  })
})

describe('patchCargarNomina — el masivo ya NO borra la carpeta documental', () => {
  it('escribe por CAMPO (dot-paths), nunca el nodo completo', () => {
    const filas = clasificarFilas(parsearPegado('Juan Pérez\t79456123'), null, {})
    const p = patchCargarNomina(filas, yo, ahora)!
    expect(p['trabajadores.79456123.nombre']).toBe('Juan Pérez')
    expect(p['trabajadores.79456123']).toBeUndefined()   // el nodo entero JAMÁS
    expect(p['trabajadores.79456123.retirado']).toEqual(deleteField())
    expect(Object.keys(p).some(k => k.includes('.eps'))).toBe(false)
  })
})

describe('patchDocumentoPersona + la línea de privacidad', () => {
  it('dot-path al campo exacto, el resto de la persona intacto', () => {
    const p = patchDocumentoPersona('79456123', 'eps', { vencimiento: '2027-03-01', archivo_url: 'https://x/e.pdf' }, ahora)
    expect(p['trabajadores.79456123.eps']).toEqual({ vencimiento: '2027-03-01', archivo_url: 'https://x/e.pdf' })
    expect(Object.keys(p)).toHaveLength(2)   // el campo + fecha_actualizacion
  })
  it('los exámenes son MÉDICOS (ruta restringida); los demás no', () => {
    expect(CAMPOS_DOC_PERSONA).toEqual(['eps', 'arl', 'pension', 'alturas', 'examen_ingreso', 'examen_egreso'])
    expect(ES_EXAMEN_MEDICO('examen_ingreso')).toBe(true)
    expect(ES_EXAMEN_MEDICO('examen_egreso')).toBe(true)
    expect(ES_EXAMEN_MEDICO('eps')).toBe(false)
    expect(ES_EXAMEN_MEDICO('alturas')).toBe(false)
  })
})
