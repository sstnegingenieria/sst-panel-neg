import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ObjetoObra, { objetoDeObra } from '../ObjetoObra'

describe('objetoDeObra', () => {
  it('recorta y colapsa espacios', () => {
    expect(objetoDeObra('  Mantenimiento\n  de   torre  ')).toBe('Mantenimiento de torre')
  })
  it('vacío, solo espacios o no-string → null', () => {
    expect(objetoDeObra('')).toBeNull()
    expect(objetoDeObra('   \n\t ')).toBeNull()
    expect(objetoDeObra(undefined)).toBeNull()
    expect(objetoDeObra(null)).toBeNull()
    expect(objetoDeObra(42)).toBeNull()
  })
})

describe('<ObjetoObra />', () => {
  it('muestra el alcance en letra pequeña y tenue, con tooltip', () => {
    const { container } = render(<ObjetoObra alcance="Suministro e instalación de línea de vida" />)
    const p = container.querySelector('p')!
    expect(p.textContent).toBe('Suministro e instalación de línea de vida')
    expect(p.getAttribute('title')).toBe('Suministro e instalación de línea de vida')
    expect(p.className).toContain('text-[11px]')
    expect(p.className).toContain('text-gray-500')
  })

  it('texto largo: se trunca a 2 líneas por CSS y el texto completo queda en el tooltip', () => {
    const largo = 'Cambio de candado y suministro e instalación de línea de vida vertical '.repeat(12).trim()
    const { container } = render(<ObjetoObra alcance={largo} />)
    const p = container.querySelector('p')!
    expect(p.className).toContain('line-clamp-2')
    expect(p.getAttribute('title')).toBe(largo)
    expect(p.textContent).toBe(largo)
  })

  it.each([[''], ['   '], ['\n\t'], [undefined], [null]])('vacío (%j): no renderiza nada, sin placeholder', v => {
    const { container } = render(<ObjetoObra alcance={v} />)
    expect(container.innerHTML).toBe('')
  })

  it('acepta una clase extra y no usa azul', () => {
    const { container } = render(<ObjetoObra alcance="Algo" className="mb-1" />)
    const cls = container.querySelector('p')!.className
    expect(cls).toContain('mb-1')
    expect(cls).not.toMatch(/blue|sky|indigo|cyan/)
  })
})
