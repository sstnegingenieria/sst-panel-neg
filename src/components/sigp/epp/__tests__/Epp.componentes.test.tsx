import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import ActaEppImprimible from '../ActaEppImprimible'
import FirmaCanvas from '../FirmaCanvas'
import { construirAltaActa, type ActaEpp } from '../../../../types/sigp/epp'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const acta = (extra: Partial<ActaEpp> = {}): ActaEpp => ({
  ...construirAltaActa({
    colaborador: { fuente: 'contratista', ref_id: '1098', nombre: 'Ana Gómez', cedula: '1098765432', cargo: 'Auxiliar', contratista_nombre: 'Servicios SAS' },
    items: [
      { nombre: 'Casco blanco dieléctrico', especificacion: 'Humanpack Acrux tipo II', cantidad: 1, unidad: '1' },
      { nombre: 'Guantes G40', especificacion: 'poliuretano', cantidad: 2, unidad: '1 par' },
    ],
    fecha: '2026-10-19',
    firmantes_empresa: [{ nombre: 'Pedro Rodríguez', cargo: 'Director general' }, { nombre: 'Ingrid Laverde', cargo: 'Dir. GH/HSEQ' }],
  }, 'v1', { uid: 'u1', nombre: 'Ingrid' }, Timestamp.fromDate(new Date(2026, 9, 19)))!,
  ...extra,
})

describe('ActaEppImprimible', () => {
  it('pinta el encabezado oficial, el colaborador, la tabla de EPP y los firmantes', () => {
    render(<MemoryRouter><ActaEppImprimible acta={acta()} /></MemoryRouter>)
    expect(screen.getByText('SST-FT-AEP-18')).toBeTruthy()
    expect(screen.getByText('SG-SST')).toBeTruthy()
    expect(screen.getByText('FORMATO DE ACTA DE ENTREGA DE EPP')).toBeTruthy()
    expect(screen.getByText('Ana Gómez', { selector: 'td' })).toBeTruthy()
    expect(screen.getByText('Servicios SAS')).toBeTruthy()
    for (const col of ['Elemento', 'Cantidad', 'Unidad', 'Especificación']) expect(screen.getAllByText(col).length).toBeGreaterThan(0)
    expect(screen.getByText('Casco blanco dieléctrico')).toBeTruthy()
    expect(screen.getByText('Pedro Rodríguez')).toBeTruthy()
    expect(screen.getByText('Ingrid Laverde')).toBeTruthy()
  })
  it('una firmada muestra la imagen de la firma y el hash; una borrador no', () => {
    const { rerender } = render(<MemoryRouter><ActaEppImprimible acta={acta()} /></MemoryRouter>)
    expect(screen.queryByAltText('Firma de Ana Gómez')).toBeNull()
    rerender(<MemoryRouter><ActaEppImprimible acta={acta({
      estado: 'firmada', firmado: true, firma_colaborador: 'data:image/png;base64,AAAA', firma_hash: 'ab'.repeat(32),
      fecha_firma: Timestamp.fromDate(new Date(2026, 9, 19)),
    })} /></MemoryRouter>)
    expect(screen.getByAltText('Firma de Ana Gómez')).toBeTruthy()
    expect(screen.getByText(/integridad SHA-256/)).toBeTruthy()
  })
  it('una anulada muestra la marca, el motivo y conserva el contenido', () => {
    render(<MemoryRouter><ActaEppImprimible acta={acta({
      estado: 'anulada', anulacion: { fecha: Timestamp.fromDate(new Date(2026, 9, 20)), por: 'u1', motivo: 'Entrega duplicada' },
    })} /></MemoryRouter>)
    expect(screen.getByText(/ACTA ANULADA/)).toBeTruthy()
    expect(screen.getByText('Entrega duplicada')).toBeTruthy()
    expect(screen.getByText('Casco blanco dieléctrico')).toBeTruthy()
  })
  it('pinta el texto legal TEXTUAL (introducción, "El colaborador manifiesta que:" y las 3 cláusulas) y ya no avisa de pendiente', () => {
    render(<MemoryRouter><ActaEppImprimible acta={acta()} /></MemoryRouter>)
    expect(screen.getByText('Con la presente acta se hace entrega de los siguientes elementos de protección personal:')).toBeTruthy()
    expect(screen.getByText('El colaborador manifiesta que:')).toBeTruthy()
    expect(screen.getByText(/La dotación que aquí se entrega es y será de la empresa en todo momento/)).toBeTruthy()
    expect(screen.getByText('En caso de daño de la dotación o parte de ella, el trabajador debe devolver a la empresa.')).toBeTruthy()
    expect(screen.getByText(/Autorizo expresamente a la empresa mediante este documento a descontar de salarios/)).toBeTruthy()
    expect(screen.queryByText(/aún no está cargado/)).toBeNull()
    expect(screen.queryByText(/\[Pendiente/)).toBeNull()
  })
})

describe('FirmaCanvas', () => {
  const preparar = () => {
    const ctx = { fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '' }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,FIRMAFALSA')
    const onChange = vi.fn()
    render(<FirmaCanvas onChange={onChange} />)
    const canvas = screen.getByTestId('firma-canvas') as HTMLCanvasElement
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 480, height: 160, right: 480, bottom: 160, x: 0, y: 0, toJSON: () => ({}) })
    ;(canvas as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    return { canvas, onChange }
  }
  const trazar = (canvas: HTMLElement, puntos: [number, number][]) => {
    fireEvent.pointerDown(canvas, { clientX: puntos[0][0], clientY: puntos[0][1], pointerId: 1 })
    for (const [x, y] of puntos.slice(1)) fireEvent.pointerMove(canvas, { clientX: x, clientY: y, pointerId: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
  }

  it('un trazo suficiente entrega el PNG; un clic suelto no; Limpiar lo retira', () => {
    const { canvas, onChange } = preparar()
    // clic suelto
    trazar(canvas, [[10, 10], [11, 10]])
    expect(onChange).toHaveBeenLastCalledWith(null)
    // firma real
    trazar(canvas, Array.from({ length: 30 }, (_, i) => [10 + i * 5, 60 + (i % 4)] as [number, number]))
    expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,FIRMAFALSA')
    fireEvent.click(screen.getByText('Limpiar'))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('el lienzo desactiva el scroll táctil (touch-action: none) para que el dedo dibuje', () => {
    const { canvas } = preparar()
    expect(canvas.style.touchAction).toBe('none')
  })

  it('deshabilitado no dibuja ni entrega firma', () => {
    const ctx = { fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    const onChange = vi.fn()
    render(<FirmaCanvas onChange={onChange} disabled />)
    const canvas = screen.getByTestId('firma-canvas')
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })
})
