// Bloque B — asunto enlazado solicitud ↔ cotización.
// El planificador es puro: decide qué cotizaciones se actualizan y cuáles
// quedan con el PDF marcado como desactualizado, sin tocar Firestore.
import { describe, it, expect } from 'vitest'
import { planPropagacionAsunto } from '../asunto'

describe('planPropagacionAsunto', () => {
  it('actualiza el espejo de una cotización en borrador SIN marcar el PDF (aún no existe)', () => {
    const plan = planPropagacionAsunto('Asunto nuevo', [
      { id: 'c1', estado: 'borrador', asunto: 'Asunto viejo' },
    ])
    expect(plan).toEqual([
      { cotizacion_id: 'c1', actualizar: true, marcar_pdf_desactualizado: false },
    ])
  })

  it('marca pdf_desactualizado SOLO en cotizaciones enviadas cuyo asunto cambió', () => {
    const plan = planPropagacionAsunto('Asunto nuevo', [
      { id: 'enviada', estado: 'enviada', asunto: 'Asunto viejo' },
      { id: 'borrador', estado: 'borrador', asunto: 'Asunto viejo' },
      { id: 'aprobada', estado: 'aprobada', asunto: 'Asunto viejo' },
      { id: 'rechazada', estado: 'rechazada', asunto: 'Asunto viejo' },
    ])
    expect(plan.map(p => [p.cotizacion_id, p.marcar_pdf_desactualizado])).toEqual([
      ['enviada', true],       // PDF vigente frente al cliente → marcar
      ['borrador', false],     // sin PDF todavía
      ['aprobada', false],     // PDF = evidencia de cierre, no se marca
      ['rechazada', false],    // el reenvío pasa por nueva versión
    ])
    expect(plan.every(p => p.actualizar)).toBe(true)   // el espejo se actualiza en todas
  })

  it('no escribe nada cuando el asunto es idéntico (idempotencia, con trim)', () => {
    const plan = planPropagacionAsunto('  Mismo asunto  ', [
      { id: 'c1', estado: 'enviada', asunto: 'Mismo asunto' },
    ])
    expect(plan).toEqual([
      { cotizacion_id: 'c1', actualizar: false, marcar_pdf_desactualizado: false },
    ])
  })

  it('cotización sin asunto previo (undefined) cuenta como cambio', () => {
    const plan = planPropagacionAsunto('Primer asunto', [
      { id: 'c1', estado: 'borrador' },
    ])
    expect(plan[0].actualizar).toBe(true)
  })

  it('solicitud sin cotizaciones → plan vacío (solo se escribe la solicitud)', () => {
    expect(planPropagacionAsunto('Lo que sea', [])).toEqual([])
  })
})
