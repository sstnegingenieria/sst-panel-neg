// @vitest-environment node
//
// Batería de las reglas de Storage del MÓDULO LICITACIONES (1.2):
//   licitaciones/{licitacionId}/{tipoDoc}/{fileName}   → esInterno(), tipoDoc != 'economia'
//   licitaciones/{licitacionId}/economia/{fileName}    → esGerenciaOProyectosPorClaim()
//
// En Storage el rol NO se puede leer de Firestore (H-008): el vehículo es el
// custom claim {perfil, rol} que deriva la CF `sincronizarClaims`. Acá los
// claims se inyectan por `authenticatedContext(uid, tokenOptions)`.
//
// ⚠ El caso que más importa de este archivo es el nº 6: un INTERNO cualquiera
// no puede leer los PDFs de economía. Sin la exclusión `tipoDoc != 'economia'`
// en el match genérico, ese test falla — en Storage basta que UN match solape
// para conceder, y el bloque dedicado de economía no serviría de nada.
//
// Gotcha heredado (módulo #3 / C2.1): el POST REST crudo produce un falso 403
// contra el emulador de Storage. Se usa `uploadBytes`/`uploadString` reales.
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only storage \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/licitacionesStorageRules.test.ts"

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { ref, uploadString, getBytes, deleteObject } from 'firebase/storage'

const TIMEOUT = 30_000

const LIC = 'lic_0001'
const META_PDF = { contentType: 'application/pdf' }
const META_IMG = { contentType: 'image/png' }
const META_ZIP = { contentType: 'application/zip' }

let env: RulesTestEnvironment

/** Claims que deriva `sincronizarClaims` para un interno de rol `rol`. */
const interno = (uid: string, rol: string) =>
  env.authenticatedContext(uid, { perfil: 'interno', rol }).storage()

/** Claims de un residente de obra (perfil distinto de 'interno'). */
const residente = (uid: string, clienteId: string) =>
  env.authenticatedContext(uid, { perfil: 'residente_obra', rol: 'residente_obra', cliente_id: clienteId }).storage()

/** Autenticado SIN claims — el estado de un token viejo pre-backfill. */
const sinClaims = (uid: string) => env.authenticatedContext(uid).storage()

const anon = () => env.unauthenticatedContext().storage()

/** Siembra un objeto saltándose las reglas (para probar lecturas). */
const sembrar = async (path: string) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadString(ref(ctx.storage(), path), 'contenido', 'raw', META_PDF)
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

afterAll(async () => {
  await env.cleanup()
})

// ─────────────── documentos del proceso — solo interno ───────────────

describe('licitaciones/{id}/{tipoDoc}/{file} — documentos del proceso', () => {
  const TIPOS = ['pliego', 'propuesta', 'evidencia', 'subsanacion']

  for (const tipo of TIPOS) {
    it(`1. interno sube un ${tipo} en PDF → permitido`, async () => {
      const p = `licitaciones/${LIC}/${tipo}/${tipo}_uuid.pdf`
      await assertSucceeds(
        uploadString(ref(interno('karen', 'operacion_comercial'), p), 'x', 'raw', META_PDF),
      )
    }, TIMEOUT)
  }

  it('2. interno sube una imagen (foto de un anexo) → permitido', async () => {
    const p = `licitaciones/${LIC}/evidencia/anexo_uuid.png`
    await assertSucceeds(
      uploadString(ref(interno('karen', 'operacion_comercial'), p), 'x', 'raw', META_IMG),
    )
  }, TIMEOUT)

  it('3. interno LEE un documento del proceso → permitido', async () => {
    const p = `licitaciones/${LIC}/pliego/pliego_uuid.pdf`
    await sembrar(p)
    await assertSucceeds(getBytes(ref(interno('diego', 'director_proyectos'), p)))
  }, TIMEOUT)

  it('4. RECHAZO: tipoDoc fuera de la whitelist (actor: interno con acceso pleno)', async () => {
    const p = `licitaciones/${LIC}/borradores/nota_uuid.pdf`
    await assertFails(
      uploadString(ref(interno('karen', 'operacion_comercial'), p), 'x', 'raw', META_PDF),
    )
  }, TIMEOUT)

  it('5. RECHAZO: contentType no permitido (zip) en un tipoDoc válido', async () => {
    const p = `licitaciones/${LIC}/propuesta/paquete_uuid.zip`
    await assertFails(
      uploadString(ref(interno('karen', 'operacion_comercial'), p), 'x', 'raw', META_ZIP),
    )
  }, TIMEOUT)

  it('6. RECHAZO: residente_obra no toca documentos de licitación', async () => {
    const p = `licitaciones/${LIC}/pliego/pliego_uuid.pdf`
    await sembrar(p)
    await assertFails(getBytes(ref(residente('cesar', 'cliente_claro'), p)))
    await assertFails(uploadString(ref(residente('cesar', 'cliente_claro'), p), 'x', 'raw', META_PDF))
  }, TIMEOUT)

  it('7. RECHAZO: autenticado SIN claims (token viejo pre-backfill)', async () => {
    const p = `licitaciones/${LIC}/pliego/pliego_uuid.pdf`
    await sembrar(p)
    await assertFails(getBytes(ref(sinClaims('karen'), p)))
    await assertFails(uploadString(ref(sinClaims('karen'), p), 'x', 'raw', META_PDF))
  }, TIMEOUT)

  it('8. RECHAZO: anónimo (control del deny-by-default)', async () => {
    const p = `licitaciones/${LIC}/pliego/pliego_uuid.pdf`
    await sembrar(p)
    await assertFails(getBytes(ref(anon(), p)))
  }, TIMEOUT)
})

// ─────────────── economía — el test que sostiene el diseño ───────────────

describe('licitaciones/{id}/economia/{file} — espejo de veEconomiaLicitacion()', () => {
  const ECO = `licitaciones/${LIC}/economia/analisis_uuid.pdf`

  it('9. CLAVE: un INTERNO cualquiera NO lee la economía, aunque sí lea el pliego', async () => {
    // La primera mitad es lo que hace válida la segunda: el mismo actor tiene
    // acceso pleno a los documentos del proceso y 403 en economía. Si el match
    // genérico no excluyera tipoDoc == 'economia', esta segunda aserción
    // pasaría a 200 y el bloque dedicado sería decorativo.
    const pliego = `licitaciones/${LIC}/pliego/pliego_uuid.pdf`
    await sembrar(pliego)
    await sembrar(ECO)
    await assertSucceeds(getBytes(ref(interno('karen', 'operacion_comercial'), pliego)))
    await assertFails(getBytes(ref(interno('karen', 'operacion_comercial'), ECO)))
  }, TIMEOUT)

  it('10. CLAVE: director_proyectos y gerencia_general SÍ leen la economía', async () => {
    // 1.2b: la asimetría con Firestore se cerró — el helper nuevo
    // esGerenciaOProyectosPorClaim() espeja EXACTAMENTE a
    // veEconomiaLicitacion(). Antes ambos recibían 403 acá pese a leer el doc.
    await sembrar(ECO)
    await assertSucceeds(getBytes(ref(interno('diego', 'director_proyectos'), ECO)))
    await assertSucceeds(getBytes(ref(interno('giovanny', 'gerencia_general'), ECO)))
  }, TIMEOUT)

  it('10b. los cuatro roles del helper escriben la economía', async () => {
    for (const [uid, rol] of [
      ['giovanny', 'gerencia_general'], ['marcela', 'gerencia_administrativa'],
      ['diego', 'director_proyectos'], ['root', 'admin'],
    ] as const) {
      await assertSucceeds(
        uploadString(ref(interno(uid, rol), ECO), 'x', 'raw', META_PDF),
      )
    }
  }, TIMEOUT)

  it('10c. SOFT-DELETE: el delete se deniega hasta al actor de MÁXIMO privilegio', async () => {
    await sembrar(ECO)
    await assertFails(deleteObject(ref(interno('root', 'admin'), ECO)))
    await assertFails(deleteObject(ref(interno('marcela', 'gerencia_administrativa'), ECO)))
  }, TIMEOUT)

  it('10d. el update SÍ se conserva — reintento sobre ruta determinística', async () => {
    // El patrón de emisión de la casa sube el PDF antes del batch; si el batch
    // falla, el reintento tiene que poder sobreescribir el huérfano.
    await assertSucceeds(
      uploadString(ref(interno('marcela', 'gerencia_administrativa'), ECO), 'v1', 'raw', META_PDF),
    )
    await assertSucceeds(
      uploadString(ref(interno('marcela', 'gerencia_administrativa'), ECO), 'v2', 'raw', META_PDF),
    )
  }, TIMEOUT)

  it('11. gerencia_administrativa lee y escribe la economía → permitido', async () => {
    await assertSucceeds(
      uploadString(ref(interno('marcela', 'gerencia_administrativa'), ECO), 'x', 'raw', META_PDF),
    )
    await assertSucceeds(getBytes(ref(interno('marcela', 'gerencia_administrativa'), ECO)))
  }, TIMEOUT)

  it('12. admin lee y escribe la economía → permitido', async () => {
    await assertSucceeds(
      uploadString(ref(interno('root', 'admin'), ECO), 'x', 'raw', META_PDF),
    )
    await assertSucceeds(getBytes(ref(interno('root', 'admin'), ECO)))
  }, TIMEOUT)

  it('13. RECHAZO: comercial tampoco ESCRIBE en economia por el match genérico', async () => {
    // La whitelist de tipoDoc del match genérico ya excluye 'economia'; este
    // test lo fija por si alguien la amplía sin pensar.
    await assertFails(
      uploadString(ref(interno('karen', 'operacion_comercial'), ECO), 'x', 'raw', META_PDF),
    )
  }, TIMEOUT)

  it('14. RECHAZO: economia no admite imagen — solo PDF', async () => {
    const img = `licitaciones/${LIC}/economia/captura_uuid.png`
    await assertFails(
      uploadString(ref(interno('marcela', 'gerencia_administrativa'), img), 'x', 'raw', META_IMG),
    )
  }, TIMEOUT)
})

// ─────────────── regresión: bloques preexistentes intactos ───────────────

describe('REGRESIÓN — los bloques que ya existían no cambiaron', () => {
  it('15. cotizaciones/** sigue siendo solo-interno', async () => {
    const p = 'cotizaciones/cot_1/v1.pdf'
    await sembrar(p)
    await assertSucceeds(getBytes(ref(interno('karen', 'operacion_comercial'), p)))
    await assertFails(getBytes(ref(residente('cesar', 'cliente_claro'), p)))
  }, TIMEOUT)

  it('16. proveedores/{id}/certificacion_bancaria sigue en gerencia_administrativa + admin', async () => {
    const p = 'proveedores/prov_1/certificacion_bancaria/uuid.pdf'
    await sembrar(p)
    await assertSucceeds(getBytes(ref(interno('marcela', 'gerencia_administrativa'), p)))
    await assertFails(getBytes(ref(interno('karen', 'operacion_comercial'), p)))
  }, TIMEOUT)

  it('16b. CLAVE: el helper nuevo NO se filtró a certificacion_bancaria ni a ausentismos', async () => {
    // 1.2b introdujo esGerenciaOProyectosPorClaim() SOLO para economía de
    // licitaciones. Si alguien lo hubiera aplicado por descuido a estos dos
    // bloques, director_proyectos y gerencia_general ganarían acceso a datos
    // bancarios y médicos. Actor: los dos roles que el helper nuevo agrega.
    const banco = 'proveedores/prov_1/certificacion_bancaria/uuid.pdf'
    const medico = 'ausentismos/aus_1/soporte/uuid.pdf'
    await sembrar(banco)
    await sembrar(medico)
    for (const [uid, rol] of [
      ['diego', 'director_proyectos'], ['giovanny', 'gerencia_general'],
    ] as const) {
      await assertFails(getBytes(ref(interno(uid, rol), banco)))
      await assertFails(getBytes(ref(interno(uid, rol), medico)))
    }
    // Y quien SÍ debe, sigue pudiendo.
    await assertSucceeds(getBytes(ref(interno('marcela', 'gerencia_administrativa'), banco)))
    await assertSucceeds(getBytes(ref(interno('marcela', 'gerencia_administrativa'), medico)))
  }, TIMEOUT)

  it('17. proveedores/{id}/rut sigue auth-only', async () => {
    const p = 'proveedores/prov_1/rut/uuid.pdf'
    await sembrar(p)
    await assertSucceeds(getBytes(ref(sinClaims('cualquiera'), p)))
  }, TIMEOUT)

  it('18. propuestas_actividad sigue admitiendo al residente de SU cliente', async () => {
    const p = 'propuestas_actividad/cliente_claro/pea-2026-0001_v1/documento.pdf'
    await sembrar(p)
    await assertSucceeds(getBytes(ref(residente('cesar', 'cliente_claro'), p)))
    await assertFails(getBytes(ref(residente('cesar', 'otro_cliente'), p)))
  }, TIMEOUT)

  it('19. lpus/** sigue auth-only', async () => {
    const p = 'lpus/cliente_1/lpu_1/original.xlsx'
    await sembrar(p)
    await assertSucceeds(getBytes(ref(sinClaims('cualquiera'), p)))
  }, TIMEOUT)
})
