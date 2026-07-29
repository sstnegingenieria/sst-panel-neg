import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ObrasHub from './ObrasHub'

vi.mock('../firebase/config', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => name),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
}))

beforeEach(() => {
  localStorage.clear()
})

describe('ObrasHub — toggle de vista Tarjetas/Lista', () => {
  it('sin preferencia guardada en localStorage, arranca en vista Lista', async () => {
    render(<MemoryRouter><ObrasHub /></MemoryRouter>)
    const botonLista = await screen.findByRole('button', { name: /^lista$/i })
    expect(botonLista).toHaveAttribute('aria-pressed', 'true')
  })

  it('clic en Tarjetas cambia la vista y persiste en localStorage', async () => {
    render(<MemoryRouter><ObrasHub /></MemoryRouter>)
    const botonTarjetas = await screen.findByRole('button', { name: /^tarjetas$/i })
    fireEvent.click(botonTarjetas)
    expect(botonTarjetas).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('sst_registros_vista')).toBe('tarjetas')
  })

  it('con "tarjetas" guardado en localStorage, arranca en vista Tarjetas', async () => {
    localStorage.setItem('sst_registros_vista', 'tarjetas')
    render(<MemoryRouter><ObrasHub /></MemoryRouter>)
    const botonTarjetas = await screen.findByRole('button', { name: /^tarjetas$/i })
    expect(botonTarjetas).toHaveAttribute('aria-pressed', 'true')
  })
})
