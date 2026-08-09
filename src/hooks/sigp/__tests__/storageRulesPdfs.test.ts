// @vitest-environment node
//
// Tests de las reglas de Firebase Storage (`storage.rules`) contra el emulador.
//
// Foco: el gate de dueño del bloque `pdfs/{obraId}/{userId}/{formId}/{fileName}`
// (solo request.auth.uid == {userId} del path lee/escribe) + regresión de
// comportamiento de los 8 bloques restantes, que deben quedar byte-idénticos:
// auth-only (lpus, solicitudes, visitas, cotizaciones, proyectos) y los tres
// con constraints de tipoDoc/tamaño/contentType (proveedores, ausentismos,
// ordenes_compra).
//
// NO forman parte del `npm test` por defecto. Se corren con:
//   npx firebase emulators:exec --project demo-neg --only storage,auth \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/storageRulesPdfs.test.ts"
// (el script compartido `test:emulator` no levanta el emulador de storage;
// no se toca para no afectar a los demás tests).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { ref, uploadString, uploadBytes, getBytes } from 'firebase/storage'

const TIMEOUT = 30_000

// Actores y rutas representativas (las formas de path salen de cada `match`
// real de storage.rules — ver comentarios de cada bloque).
const UID_A = 'tecnico_a'
const UID_B = 'tecnico_b'
const PDF_A = `pdfs/obra_001/${UID_A}/form_001/preoperacional_1723180000.pdf`

const META_PDF = { contentType: 'application/pdf' }
const META_IMG = { contentType: 'image/png' }

let env: RulesTestEnvironment

/** Storage del actor autenticado `uid`. */
const storageDe = (uid: string) => env.authenticatedContext(uid).storage()
/** Storage anónimo. */
const storageAnon = () => env.unauthenticatedContext().storage()

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
      // El test vive en src/hooks/sigp/__tests__/ → la raíz está 4 niveles arriba.
      rules: readFileSync(resolve(__dirname, '../../../../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
}, TIMEOUT)

afterAll(async () => {
  await env.cleanup()
})

// ───────────────────────── pdfs/** — gate de dueño ─────────────────────────

describe('pdfs/{obraId}/{userId}/{formId}/{fileName} — gate de dueño', () => {
  it('1. el dueño escribe en su propio path → permitido', async () => {
    await assertSucceeds(
      uploadString(ref(storageDe(UID_A), PDF_A), 'pdf', 'raw', META_PDF),
    )
  }, TIMEOUT)

  it('2. el dueño lee su propio path → permitido', async () => {
    const path = `pdfs/obra_001/${UID_A}/form_002/ats_1723180001.pdf`
    await sembrar(path)
    await assertSucceeds(getBytes(ref(storageDe(UID_A), path)))
  }, TIMEOUT)

  it('3. otro usuario autenticado (B) escribe en el path de A → denegado', async () => {
    await assertFails(
      uploadString(ref(storageDe(UID_B), PDF_A), 'pdf', 'raw', META_PDF),
    )
  }, TIMEOUT)

  it('4. otro usuario autenticado (B) lee el path de A → denegado', async () => {
    const path = `pdfs/obra_001/${UID_A}/form_003/charla_1723180002.pdf`
    await sembrar(path)
    await assertFails(getBytes(ref(storageDe(UID_B), path)))
  }, TIMEOUT)

  it('5. escritura anónima a un path pdfs → denegada', async () => {
    await assertFails(
      uploadString(ref(storageAnon(), PDF_A), 'pdf', 'raw', META_PDF),
    )
  }, TIMEOUT)

  it('6. lectura anónima de un path pdfs → denegada', async () => {
    const path = `pdfs/obra_001/${UID_A}/form_004/emergencia_1723180003.pdf`
    await sembrar(path)
    await assertFails(getBytes(ref(storageAnon(), path)))
  }, TIMEOUT)

  it('7. A escribe en un path cuyo segmento {userId} es B (suplantación) → denegado', async () => {
    // Prueba que el gate compara contra la VARIABLE DE PATH, no contra nada
    // que el escritor pueda afirmar sobre el archivo.
    const pathDeB = `pdfs/obra_001/${UID_B}/form_005/preoperacional_1723180004.pdf`
    await assertFails(
      uploadString(ref(storageDe(UID_A), pathDeB), 'pdf', 'raw', META_PDF),
    )
  }, TIMEOUT)

  it('8. path pdfs fuera de la forma de 4 segmentos (antes cubierto por {allPaths=**}) → denegado', async () => {
    // Cambio de superficie: el match viejo `pdfs/{allPaths=**}` aceptaba
    // cualquier profundidad; el nuevo solo la forma real de la app Flutter.
    await assertFails(
      uploadString(ref(storageDe(UID_A), 'pdfs/suelto.pdf'), 'pdf', 'raw', META_PDF),
    )
  }, TIMEOUT)
})

// ───────────────── regresión: bloques auth-only sin constraints ─────────────────

describe('regresión — bloques auth-only intactos', () => {
  const casos: Array<[nombre: string, path: string]> = [
    ['lpus/{clienteId}/{lpuId}/{fileName}', 'lpus/cliente_001/lpu_001/original.xlsx'],
    ['solicitudes/{solicitudId}/{fileName}', 'solicitudes/sol_001/adjunto.pdf'],
    ['visitas/{visitaId}/**', 'visitas/vis_001/fotos/hallazgo_1.png'],
    ['cotizaciones/{cotizacionId}/**', 'cotizaciones/cot_001/evidencia/aprobacion.pdf'],
    ['proyectos/{proyectoId}/**', 'proyectos/pry_001/permisos/permiso.pdf'],
  ]

  for (const [nombre, path] of casos) {
    it(`${nombre}: autenticado escribe y lee → permitido`, async () => {
      const s = storageDe(UID_A)
      await assertSucceeds(uploadString(ref(s, path), 'x', 'raw', META_PDF))
      // La lectura no exige ser quien escribió: cualquier autenticado.
      await assertSucceeds(getBytes(ref(storageDe(UID_B), path)))
    }, TIMEOUT)

    it(`${nombre}: anónimo escribe → denegado`, async () => {
      await assertFails(uploadString(ref(storageAnon(), path), 'x', 'raw', META_PDF))
    }, TIMEOUT)
  }
})

// ─────────── regresión: bloques con tipoDoc + tamaño + contentType ───────────

describe('regresión — proveedores/{proveedorId}/{tipoDoc}/{fileName}', () => {
  it('write válido (rut, PDF, <10MB) → permitido; lectura de otro autenticado → permitida', async () => {
    const path = 'proveedores/900123456/rut/uuid-0001.pdf'
    await assertSucceeds(
      uploadString(ref(storageDe(UID_A), path), 'pdf', 'raw', META_PDF),
    )
    await assertSucceeds(getBytes(ref(storageDe(UID_B), path)))
  }, TIMEOUT)

  it('tipoDoc fuera de [rut, certificacion_bancaria] → denegado', async () => {
    await assertFails(
      uploadString(
        ref(storageDe(UID_A), 'proveedores/900123456/cedula/uuid-0002.pdf'),
        'pdf', 'raw', META_PDF,
      ),
    )
  }, TIMEOUT)

  it('archivo de 11MB (supera el tope de 10MB) → denegado', async () => {
    await assertFails(
      uploadBytes(
        ref(storageDe(UID_A), 'proveedores/900123456/rut/uuid-0003.pdf'),
        new Uint8Array(11 * 1024 * 1024),
        META_PDF,
      ),
    )
  }, TIMEOUT)

  it('escritura anónima → denegada', async () => {
    await assertFails(
      uploadString(
        ref(storageAnon(), 'proveedores/900123456/rut/uuid-0004.pdf'),
        'pdf', 'raw', META_PDF,
      ),
    )
  }, TIMEOUT)
})

describe('regresión — ausentismos/{ausentismoId}/{tipoDoc}/{fileName}', () => {
  it('write válido (soporte, imagen, <10MB) → permitido; lectura autenticada → permitida', async () => {
    const path = 'ausentismos/aus_001/soporte/uuid-1001.png'
    await assertSucceeds(
      uploadString(ref(storageDe(UID_A), path), 'img', 'raw', META_IMG),
    )
    await assertSucceeds(getBytes(ref(storageDe(UID_B), path)))
  }, TIMEOUT)

  it("tipoDoc fuera de ['soporte'] → denegado", async () => {
    await assertFails(
      uploadString(
        ref(storageDe(UID_A), 'ausentismos/aus_001/evidencia/uuid-1002.png'),
        'img', 'raw', META_IMG,
      ),
    )
  }, TIMEOUT)

  it('contentType que no es PDF ni imagen (text/plain) → denegado', async () => {
    await assertFails(
      uploadString(
        ref(storageDe(UID_A), 'ausentismos/aus_001/soporte/uuid-1003.txt'),
        'texto', 'raw', { contentType: 'text/plain' },
      ),
    )
  }, TIMEOUT)

  it('escritura anónima → denegada', async () => {
    await assertFails(
      uploadString(
        ref(storageAnon(), 'ausentismos/aus_001/soporte/uuid-1004.png'),
        'img', 'raw', META_IMG,
      ),
    )
  }, TIMEOUT)
})

describe('regresión — ordenes_compra/{ocId}/{tipoDoc}/{fileName}', () => {
  it('writes válidos (cotizacion PDF y soporte imagen) → permitidos; lectura autenticada → permitida', async () => {
    const pathCot = 'ordenes_compra/oc_001/cotizacion/uuid-2001.pdf'
    await assertSucceeds(
      uploadString(ref(storageDe(UID_A), pathCot), 'pdf', 'raw', META_PDF),
    )
    await assertSucceeds(
      uploadString(
        ref(storageDe(UID_A), 'ordenes_compra/oc_001/soporte/uuid-2002.png'),
        'img', 'raw', META_IMG,
      ),
    )
    await assertSucceeds(getBytes(ref(storageDe(UID_B), pathCot)))
  }, TIMEOUT)

  it('tipoDoc fuera de [cotizacion, soporte] → denegado', async () => {
    await assertFails(
      uploadString(
        ref(storageDe(UID_A), 'ordenes_compra/oc_001/factura/uuid-2003.pdf'),
        'pdf', 'raw', META_PDF,
      ),
    )
  }, TIMEOUT)

  it('contentType que no es PDF ni imagen (application/zip) → denegado', async () => {
    await assertFails(
      uploadString(
        ref(storageDe(UID_A), 'ordenes_compra/oc_001/soporte/uuid-2004.zip'),
        'zip', 'raw', { contentType: 'application/zip' },
      ),
    )
  }, TIMEOUT)

  it('escritura anónima → denegada', async () => {
    await assertFails(
      uploadString(
        ref(storageAnon(), 'ordenes_compra/oc_001/cotizacion/uuid-2005.pdf'),
        'pdf', 'raw', META_PDF,
      ),
    )
  }, TIMEOUT)
})
