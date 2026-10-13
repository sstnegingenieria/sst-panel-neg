// @vitest-environment node
//
// Batería de las reglas de Storage del AVAL SST POR FORMATOS FÍSICOS:
//   match /verificacion_sst/{proyectoId}/fisico/{fileName}
//
// Actores por CLAIM (esInterno + rol), como el resto de rutas de C2.1. Cada
// denegación de rol se prueba con quien casi puede: para ESCRIBIR, los que sí
// LEEN (sst, residente_sst, admin); para LEER, un interno de otra área
// (gerencia_administrativa, director_proyectos). Lo subido con
// `uploadBytes` real: el POST REST crudo da falsos 403 (documentado en #3).
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only storage,auth \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/avalFisicoStorageRules.test.ts"

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { ref, uploadBytes, getBytes, deleteObject, updateMetadata } from 'firebase/storage'

const TIMEOUT = 30_000
let env: RulesTestEnvironment

const interno = (uid: string, rol: string) =>
  env.authenticatedContext(uid, { perfil: 'interno', rol }).storage()

const ingrid = () => interno('ingrid', 'gestion_integral')

const PDF = { contentType: 'application/pdf' }
const PNG = { contentType: 'image/png' }
const bytes = (n = 8) => new Uint8Array(n).fill(1)

/** Nombre de archivo con la forma que genera la UI: UUID v4 + extensión. */
const uuid = () => crypto.randomUUID()
const ruta = (proyecto = 'pry_001', ext = 'pdf') => `verificacion_sst/${proyecto}/fisico/${uuid()}.${ext}`

/** Siembra un escaneo saltándose las reglas (para probar lecturas/overwrite). */
const sembrar = async (path: string) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), bytes(), PDF)
  })
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    storage: {
      rules: readFileSync(resolve(__dirname, '../../../../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
}, TIMEOUT)

afterAll(async () => { await env.cleanup() })

describe('verificacion_sst/{id}/fisico — SUBIR el escaneo (solo gestion_integral)', () => {
  it('1. CONTROL POSITIVO: gestion_integral sube un PDF → permitido', async () => {
    await assertSucceeds(uploadBytes(ref(ingrid(), ruta()), bytes(), PDF))
  }, TIMEOUT)

  it('2. gestion_integral sube una imagen → permitido', async () => {
    await assertSucceeds(uploadBytes(ref(ingrid(), ruta()), bytes(), PNG))
  }, TIMEOUT)

  it('3. RECHAZO: tipo de archivo no permitido (actor: ingrid)', async () => {
    await assertFails(uploadBytes(ref(ingrid(), ruta()), bytes(), { contentType: 'text/plain' }))
    await assertFails(uploadBytes(ref(ingrid(), ruta()), bytes(), { contentType: 'application/zip' }))
  }, TIMEOUT)

  it('4. RECHAZO: 10 MB o más (actor: ingrid)', async () => {
    await assertFails(uploadBytes(ref(ingrid(), ruta()), bytes(10 * 1024 * 1024), PDF))
  }, TIMEOUT)

  it('5. justo bajo el tope → permitido', async () => {
    await assertSucceeds(uploadBytes(ref(ingrid(), ruta()), bytes(10 * 1024 * 1024 - 1), PDF))
  }, TIMEOUT)

  // los que casi pueden: leen el escaneo, pero NO lo suben
  for (const [uid, rol] of [['sofia', 'sst'], ['ramiro', 'residente_sst'], ['root', 'admin']] as const) {
    it(`6. ${rol} NO sube el escaneo (lee, no avala físico) → denegado`, async () => {
      await assertFails(uploadBytes(ref(interno(uid, rol), ruta()), bytes(), PDF))
    }, TIMEOUT)
  }

  it('6b. RECHAZO: SVG (puede llevar script) y 0 bytes (actor: ingrid)', async () => {
    await assertFails(uploadBytes(ref(ingrid(), ruta()), bytes(), { contentType: 'image/svg+xml' }))
    await assertFails(uploadBytes(ref(ingrid(), ruta()), new Uint8Array(0), PDF))
  }, TIMEOUT)

  it('6c. imágenes raster permitidas (jpeg, webp, heic) → permitido', async () => {
    for (const ct of ['image/jpeg', 'image/webp', 'image/heic']) {
      await assertSucceeds(uploadBytes(ref(ingrid(), ruta()), bytes(), { contentType: ct }))
    }
  }, TIMEOUT)

  it('7. gerencias, director, comercial NO suben → denegado', async () => {
    for (const rol of ['gerencia_administrativa', 'gerencia_general', 'director_proyectos', 'operacion_comercial', 'auxiliar_proyectos']) {
      await assertFails(uploadBytes(ref(interno('x_' + rol, rol), ruta()), bytes(), PDF))
    }
  }, TIMEOUT)

  it('8. token SIN claims (sesión previa al backfill) NO sube, aunque sea "ingrid" → denegado', async () => {
    const sinClaims = env.authenticatedContext('ingrid').storage()
    await assertFails(uploadBytes(ref(sinClaims, ruta()), bytes(), PDF))
  }, TIMEOUT)

  it('9. perfil que no es interno (residente_obra) NO sube aunque su rol diga otra cosa → denegado', async () => {
    const res = env.authenticatedContext('cesar', { perfil: 'residente_obra', rol: 'gestion_integral', cliente_id: 'c1' }).storage()
    await assertFails(uploadBytes(ref(res, ruta()), bytes(), PDF))
  }, TIMEOUT)

  it('10. anónimo NO sube (control del catch-all)', async () => {
    await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), ruta()), bytes(), PDF))
  }, TIMEOUT)
})

describe('verificacion_sst/{id}/fisico — la evidencia es INMUTABLE', () => {
  it('11. RECHAZO: sobrescribir un escaneo ya subido (actor: ingrid, la misma que lo subió)', async () => {
    const path = ruta()
    await assertSucceeds(uploadBytes(ref(ingrid(), path), bytes(), PDF))
    await assertFails(uploadBytes(ref(ingrid(), path), bytes(16), PDF))
  }, TIMEOUT)

  it('12. RECHAZO: borrar un escaneo (actor: ingrid)', async () => {
    const path = ruta()
    await assertSucceeds(uploadBytes(ref(ingrid(), path), bytes(), PDF))
    await assertFails(deleteObject(ref(ingrid(), path)))
  }, TIMEOUT)

  it('12b. RECHAZO: cambiar los metadatos de un escaneo ya subido (updateMetadata)', async () => {
    const path = ruta()
    await assertSucceeds(uploadBytes(ref(ingrid(), path), bytes(), PDF))
    await assertFails(updateMetadata(ref(ingrid(), path), { contentType: 'image/png' }))
  }, TIMEOUT)

  it('13. RECHAZO: borrar con admin', async () => {
    const path = ruta()
    await sembrar(path)
    await assertFails(deleteObject(ref(interno('root', 'admin'), path)))
  }, TIMEOUT)
})

describe('verificacion_sst/{id}/fisico — LEER el escaneo (revisores SST + auditoría)', () => {
  const path = 'verificacion_sst/pry_lectura/fisico/3f2504e0-4f89-41d3-9a0c-0305e82c3301.pdf'

  for (const [uid, rol] of [
    ['ingrid', 'gestion_integral'], ['sofia', 'sst'], ['ramiro', 'residente_sst'], ['root', 'admin'],
  ] as const) {
    it(`14. ${rol} LEE → permitido`, async () => {
      await sembrar(path)
      await assertSucceeds(getBytes(ref(interno(uid, rol), path)))
    }, TIMEOUT)
  }

  for (const rol of ['gerencia_administrativa', 'gerencia_general', 'director_proyectos', 'operacion_comercial']) {
    it(`15. ${rol} (interno de otra área) NO lee → denegado`, async () => {
      await sembrar(path)
      await assertFails(getBytes(ref(interno('x_' + rol, rol), path)))
    }, TIMEOUT)
  }

  it('16. residente_obra, token sin claims y anónimo NO leen → denegado', async () => {
    await sembrar(path)
    const res = env.authenticatedContext('cesar', { perfil: 'residente_obra', rol: 'residente_obra', cliente_id: 'c1' }).storage()
    await assertFails(getBytes(ref(res, path)))
    await assertFails(getBytes(ref(env.authenticatedContext('sofia').storage(), path)))
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), path)))
  }, TIMEOUT)
})

describe('verificacion_sst/{id}/fisico — forma del archivo', () => {
  it('19. RECHAZO: nombre que no es un UUID (evil.html con image/png)', async () => {
    await assertFails(uploadBytes(ref(ingrid(), 'verificacion_sst/pry_001/fisico/evil.html'), bytes(), PNG))
    await assertFails(uploadBytes(ref(ingrid(), 'verificacion_sst/pry_001/fisico/escaneo_1.pdf'), bytes(), PDF))
  }, TIMEOUT)

  it('20. RECHAZO: contentType con sufijo (application/pdfx, image/pngx)', async () => {
    await assertFails(uploadBytes(ref(ingrid(), ruta()), bytes(), { contentType: 'application/pdfx' }))
    await assertFails(uploadBytes(ref(ingrid(), ruta('pry_001', 'png')), bytes(), { contentType: 'image/pngx' }))
  }, TIMEOUT)

  it('21. CONTROL: UUID + extensión alfanumérica de 1 a 5 caracteres → permitido', async () => {
    await assertSucceeds(uploadBytes(ref(ingrid(), ruta('pry_001', 'jpg')), bytes(), { contentType: 'image/jpeg' }))
    await assertFails(uploadBytes(ref(ingrid(), ruta('pry_001', 'abcdefg')), bytes(), PDF))
  }, TIMEOUT)
})

describe('rutas vecinas — sin cambio de superficie', () => {
  it('17. el match NO abre otras rutas bajo verificacion_sst/ (no hay concesión genérica)', async () => {
    await assertFails(uploadBytes(ref(ingrid(), 'verificacion_sst/pry_001/otro/x.pdf'), bytes(), PDF))
    await assertFails(uploadBytes(ref(ingrid(), 'verificacion_sst/x.pdf'), bytes(), PDF))
  }, TIMEOUT)

  it('18. ausentismos y certificación bancaria siguen cerrados a gestion_integral (no se tocó esGerenciaAdminPorClaim)', async () => {
    await assertFails(uploadBytes(ref(ingrid(), 'ausentismos/a1/soporte/x.pdf'), bytes(), PDF))
    await assertFails(uploadBytes(ref(ingrid(), 'proveedores/p1/certificacion_bancaria/x.pdf'), bytes(), PDF))
  }, TIMEOUT)
})
