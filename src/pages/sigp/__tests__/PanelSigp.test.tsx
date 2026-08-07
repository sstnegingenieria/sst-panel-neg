// §16 (ii) — degradación del Panel para comercial: NI SE INTENTA leer
// `proyectos` (gate por veProyectosUI) y las tarjetas dependientes degradan
// con nota honesta, conservando el embudo comercial. Los 6 roles: sin cambio.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

let rolActual = 'operacion_comercial'
const getAll = vi.fn(async (_col: string) => [])

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'x@neg.co', nombre: 'Test', rol: rolActual } }),
}))
vi.mock('../../../hooks/useFirestore', () => ({ useFirestore: () => ({ getAll }) }))
vi.mock('../../../firebase/config', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  setDoc: vi.fn(async () => undefined),
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}))
vi.mock('../../../components/shared/Toast', () => ({ toast: vi.fn() }))
vi.mock('../../../components/sigp/cotizaciones/InputExpresion', () => ({ default: () => null }))

import PanelSigp from '../PanelSigp'

describe('PanelSigp — degradación §16 (ii) para comercial', () => {
  beforeEach(() => { cleanup(); getAll.mockClear() })

  it('comercial: NO consulta proyectos; inds 1/2/4, dona y tiles degradan con nota; embudo vivo', async () => {
    rolActual = 'operacion_comercial'
    render(<PanelSigp />)
    await waitFor(() => expect(screen.queryByText('Cargando indicadores…')).toBeNull())

    // Ni un getAll('proyectos') — la regla ni se toca.
    expect(getAll.mock.calls.map(c => c[0])).not.toContain('proyectos')
    expect(getAll.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['solicitudes', 'visitas', 'cotizaciones']))

    // Nota honesta en 1/2/4 (tarjetas) + dona + tiles = 5 apariciones
    // (con punto final en dona/tiles; las tarjetas sin punto).
    const notas = screen.getAllByText(/Requiere acceso a proyectos/)
    expect(notas.length).toBeGreaterThanOrEqual(5)

    // Embudo comercial CONSERVADO con el tramo de proyectos degradado.
    expect(screen.getByText(/Embudo comercial/)).toBeTruthy()
    expect(screen.getByText('El tramo de proyectos requiere acceso a proyectos.')).toBeTruthy()

    // Ind. 5: sin botón de registro manual (puedeGestionarProyectosUI ya
    // no incluye comercial — decisión §16, 07-ago).
    expect(screen.queryByText('Registrar manual')).toBeNull()
  })

  it('director_proyectos: consulta proyectos y NO muestra notas de degradación', async () => {
    rolActual = 'director_proyectos'
    render(<PanelSigp />)
    await waitFor(() => expect(screen.queryByText('Cargando indicadores…')).toBeNull())

    expect(getAll.mock.calls.map(c => c[0])).toContain('proyectos')
    expect(screen.queryByText(/Requiere acceso a proyectos/)).toBeNull()
    expect(screen.getByText('Registrar manual')).toBeTruthy()
  })
})
