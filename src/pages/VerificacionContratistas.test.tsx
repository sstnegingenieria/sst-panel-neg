// Pantalla de Ingrid (Verificación de contratistas) — fix del 08-nov.
//
// El bug: la fila se armaba con `{ proyecto_id: d.id, ...d.data() }` y los docs
// NUEVOS (`{pid}__{cid}`) traen su propio campo `proyecto_id` (= id del PROYECTO),
// que pisaba el id del documento: "Al día" escribía en el doc VIEJO `{pid}` (la
// regla lo permitía) y no autorizaba nada — la regla de liquidación lee el nuevo.
//
// Aquí: Firestore va mockeado (la regla A4 se prueba aparte en el emulador:
// verificacionesMigradasFirestoreRules.test.ts). Se verifica que
//   · con docs viejos y nuevos mezclados la lista muestra SOLO los nuevos vivos;
//   · marcar escribe en `{pid}__{cid}` (jamás en `{pid}`);
//   · cada fila muestra el contratista y la clave de fila es el docId.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

type Fila = { id: string; data: Record<string, unknown> }
const estado = vi.hoisted(() => ({ filas: [] as Fila[], escrituras: [] as { path: string; payload: any }[], toasts: [] as string[] }))

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __col: path }),
  getDocs: async (ref: { __col: string }) => ({
    docs: ref.__col === 'verificaciones_sst'
      ? estado.filas.map(f => ({ id: f.id, data: () => f.data }))
      : [],
  }),
  getCountFromServer: async () => ({ data: () => ({ count: 3 }) }),
  query: (ref: unknown) => ref,
  where: () => ({}),
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  updateDoc: async (ref: { path: string }, payload: unknown) => { estado.escrituras.push({ path: ref.path, payload }) },
  arrayUnion: (...x: unknown[]) => ({ __union: x }),
  Timestamp: { now: () => ({ toDate: () => new Date('2026-11-08T12:00:00Z') }) },
}))
vi.mock('../firebase/config', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'sofia', rol: 'sst' } }) }))
vi.mock('../components/shared/Toast', () => ({ toast: (m: string) => { estado.toasts.push(m) } }))

import VerificacionContratistas from './VerificacionContratistas'

const base = (extra: Record<string, unknown>) => ({
  consecutivo: 'PRY-2026-009', nombre_sitio: 'BECERRILL IV', codigo_sitio_cliente: 'X1',
  cliente_nombre: 'Cliente', estado: 'facturado', obra_id: 'pry_p1',
  ...extra,
})

/** Estado real de prod tras la migración del 31-oct: cada proyecto tiene su doc
 *  VIEJO (`{pid}`, con `migrada_a`) y el NUEVO (`{pid}__{cid}`) — ambos con el
 *  campo `proyecto_id` = id del proyecto. Más un contratista huérfano (activa: false). */
const docsMezclados = (): Fila[] => [
  { id: 'p1', data: base({ proyecto_id: 'p1', contratista_id: 'c1', contratista_nombre: 'David Bernal', migrada_a: ['p1__c1'] }) },
  { id: 'p1__c1', data: base({ proyecto_id: 'p1', contratista_id: 'c1', contratista_nombre: 'David Bernal', migrada_desde: 'p1', activa: true }) },
  { id: 'p1__c2', data: base({ proyecto_id: 'p1', contratista_id: 'c2', contratista_nombre: 'Huérfano SAS', activa: false }) },
  { id: 'p2', data: base({ proyecto_id: 'p2', consecutivo: 'PRY-2026-010', contratista_id: 'c9', contratista_nombre: 'Jersson Montes', migrada_a: ['p2__c9'] }) },
  { id: 'p2__c9', data: base({ proyecto_id: 'p2', consecutivo: 'PRY-2026-010', contratista_id: 'c9', contratista_nombre: 'Jersson Montes', migrada_desde: 'p2', activa: true }) },
]

const renderizar = async () => {
  const r = render(<MemoryRouter><VerificacionContratistas /></MemoryRouter>)
  await waitFor(() => expect(document.querySelector('tr[data-doc-id]')).not.toBeNull())
  return r
}
const filas = () => [...document.querySelectorAll('tr[data-doc-id]')] as HTMLElement[]

describe('Verificación de contratistas — docs viejos y nuevos mezclados', () => {
  beforeEach(() => {
    estado.filas = docsMezclados()
    estado.escrituras = []
    estado.toasts = []
  })

  it('la lista muestra SOLO los docs nuevos vivos (sin legacy `migrada_a`, sin `activa: false`)', async () => {
    await renderizar()
    expect(filas().map(f => f.getAttribute('data-doc-id'))).toEqual(['p1__c1', 'p2__c9'])
    expect(screen.queryByText('Huérfano SAS')).toBeNull()
    expect(screen.getByText(/En cola \(2\)/)).toBeInTheDocument()
  })

  it('cada fila muestra el contratista del doc', async () => {
    await renderizar()
    const [f1, f2] = filas()
    expect(within(f1).getByText('David Bernal')).toBeInTheDocument()
    expect(within(f2).getByText('Jersson Montes')).toBeInTheDocument()
  })

  it('"Al día" escribe en {pid}__{cid} — jamás en el doc viejo {pid}', async () => {
    await renderizar()
    const fila = filas().find(f => f.getAttribute('data-doc-id') === 'p1__c1')!
    fireEvent.click(within(fila).getByText(/Al día/))
    await waitFor(() => expect(estado.escrituras.length).toBe(1))
    expect(estado.escrituras[0].path).toBe('verificaciones_sst/p1__c1')
    expect(estado.escrituras.some(e => e.path === 'verificaciones_sst/p1')).toBe(false)
    expect(estado.escrituras[0].payload.sst_gate.estado).toBe('al_dia')
    expect(estado.escrituras[0].payload.sst_gate.verificado_por).toBe('sofia')
  })

  it('marcar en el SEGUNDO proyecto escribe en su propio doc por contratista', async () => {
    await renderizar()
    const fila = filas().find(f => f.getAttribute('data-doc-id') === 'p2__c9')!
    fireEvent.click(within(fila).getByText(/Al día/))
    await waitFor(() => expect(estado.escrituras.length).toBe(1))
    expect(estado.escrituras[0].path).toBe('verificaciones_sst/p2__c9')
  })

  it('el aviso ya no promete la liquidación: "Contratista al día en este proyecto"', async () => {
    await renderizar()
    fireEvent.click(within(filas()[0]).getByText(/Al día/))
    await waitFor(() => expect(estado.toasts.length).toBeGreaterThan(0))
    expect(estado.toasts[0]).toBe('Contratista al día en este proyecto')
    expect(estado.toasts.join(' ')).not.toMatch(/liquidaci[oó]n habilitada/i)
  })

  it('un doc SIN campo proyecto_id propio igual escribe en su docId', async () => {
    estado.filas = [{ id: 'p5__c5', data: base({ contratista_id: 'c5', contratista_nombre: 'Sin Campo', activa: true }) }]
    await renderizar()
    fireEvent.click(within(filas()[0]).getByText(/Al día/))
    await waitFor(() => expect(estado.escrituras.length).toBe(1))
    expect(estado.escrituras[0].path).toBe('verificaciones_sst/p5__c5')
  })
})
