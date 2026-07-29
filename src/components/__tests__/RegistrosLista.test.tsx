import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RegistrosLista from '../RegistrosLista'
import type { ObraConStats } from '../../hooks/useObrasConRegistros'

function renderConRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

function obra(overrides: Partial<ObraConStats>): ObraConStats {
  return {
    id: 'obra-1',
    nombre_sitio: 'Obra Ejemplo',
    codigo: 'OBR-001',
    cliente: 'Cliente SAS',
    estado: 'activa',
    totalRegistros: 4,
    pendientes: 2,
    ultimoTimestamp: '2026-07-20T10:00:00.000Z',
    ultimoResponsable: 'Juan Carlos',
    ...overrides,
  }
}

describe('RegistrosLista — render de columnas', () => {
  it('muestra nombre, código, cliente, registros, pendientes y link Gestionar', () => {
    renderConRouter(
      <RegistrosLista obras={[obra({})]} sortBy="recientes" onSort={vi.fn()} />
    )
    expect(screen.getByText('Obra Ejemplo')).toBeInTheDocument()
    expect(screen.getByText('OBR-001')).toBeInTheDocument()
    expect(screen.getByText('Cliente SAS')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /gestionar/i })).toHaveAttribute('href', '/registros/obra-1')
  })

  it('obra sin cliente muestra — ; obra sin actividad muestra "Sin actividad"', () => {
    renderConRouter(
      <RegistrosLista
        obras={[obra({ id: 'obra-2', cliente: '', ultimoTimestamp: '' })]}
        sortBy="recientes"
        onSort={vi.fn()}
      />
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Sin actividad')).toBeInTheDocument()
  })

  it('obra inactiva muestra el tag "Inactiva"', () => {
    renderConRouter(
      <RegistrosLista obras={[obra({ estado: 'inactiva' })]} sortBy="recientes" onSort={vi.fn()} />
    )
    expect(screen.getByText('Inactiva')).toBeInTheDocument()
  })
})

describe('RegistrosLista — encabezados ordenables', () => {
  it('clic en "Cliente" llama a onSort con "cliente"', () => {
    const onSort = vi.fn()
    renderConRouter(<RegistrosLista obras={[obra({})]} sortBy="recientes" onSort={onSort} />)
    fireEvent.click(screen.getByRole('button', { name: /cliente/i }))
    expect(onSort).toHaveBeenCalledWith('cliente')
  })

  it('clic en "Pendientes SST" llama a onSort con "pendientes"', () => {
    const onSort = vi.fn()
    renderConRouter(<RegistrosLista obras={[obra({})]} sortBy="recientes" onSort={onSort} />)
    fireEvent.click(screen.getByRole('button', { name: /pendientes/i }))
    expect(onSort).toHaveBeenCalledWith('pendientes')
  })

  it('clic en "Última actividad" llama a onSort con "recientes"', () => {
    const onSort = vi.fn()
    renderConRouter(<RegistrosLista obras={[obra({})]} sortBy="cliente" onSort={onSort} />)
    fireEvent.click(screen.getByRole('button', { name: /última actividad/i }))
    expect(onSort).toHaveBeenCalledWith('recientes')
  })

  it('aria-sort refleja el criterio y dirección activos', () => {
    renderConRouter(<RegistrosLista obras={[obra({})]} sortBy="pendientes" onSort={vi.fn()} />)
    const thPendientes = screen.getByRole('columnheader', { name: /pendientes/i })
    const thCliente = screen.getByRole('columnheader', { name: /cliente/i })
    expect(thPendientes).toHaveAttribute('aria-sort', 'descending')
    expect(thCliente).toHaveAttribute('aria-sort', 'none')
  })
})
