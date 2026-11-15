// CENSO DE LA VENTANA DEL RADAR — solo lectura. No escribe nada, nunca.
//
// ── QUÉ PREGUNTA CONTESTA ───────────────────────────────────────────────────
// Dos que el conjunto de datos abiertos NO puede contestar, porque son sobre
// lo que el radar trajo de verdad y sobre lo que la bandeja muestra hoy:
//
//   4. De los procesos que el radar creó, ¿cuántos tenían fecha de cierre
//      FUTURA el día que llegaron, y con cuántos días por delante?
//   5. De los que la bandeja está mostrando hoy, ¿cuántos ya tienen el plazo
//      pasado?
//
// Las dos salen de dos campos que ya están en cada documento —`creado_en` y
// `cronograma.cierre`— así que se calculan HACIA ATRÁS y sin contador que
// nadie tenga que acordarse de incrementar.
//
// ── POR QUÉ ESTE SCRIPT NO JUZGA, SOLO EXTRAE ───────────────────────────────
// La respuesta a la 5 depende de `seccionDe`, `repartirRadar` y
// `porQueNoAlcanza`, que viven en `src/utils/sigp/bandejaLicitaciones.ts` y
// conocen la puerta de la manifestación, el umbral de armado y los días
// hábiles con festivos. Reimplementar eso acá sería una SEGUNDA
// implementación del criterio — el defecto que A.2b vino a eliminar, y que ya
// nos costó un patch escrito a mano.
//
// Entonces este script hace lo único que no se puede hacer desde el árbol: la
// lectura autenticada de producción. Escribe un JSON crudo, campo por campo,
// y el veredicto lo calcula después el CÓDIGO REAL sobre ese JSON. Un dato sin
// juicio no puede divergir del juicio de la UI.
//
// ── CÓMO SE CORRE ───────────────────────────────────────────────────────────
//   node scripts/sigp/censo-ventana-radar.mjs --llave <ruta de la llave de LECTURA>
//   node scripts/sigp/censo-ventana-radar.mjs --emulador      (ensayo local)
//   ...--salida <ruta.json>   (por defecto: _datos/censo-ventana-radar.json)
//
// Sin dependencias y sin importar nada del árbol, igual que
// `verifica-marca-radar.mjs`: lo corre una persona, y cada pieza que haya que
// instalar antes es una forma de fallar.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createSign } from 'node:crypto'

const PROYECTO = 'neg-sst-app'
const COLECCION = 'licitaciones'

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i === -1 ? null : process.argv[i + 1] ?? null
}
const EMULADOR = process.argv.includes('--emulador')
const LLAVE = arg('llave') ?? process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null
const SALIDA = arg('salida') ?? '_datos/censo-ventana-radar.json'

function abortar(mensaje) {
  console.error(`\n  ✗ ${mensaje}\n`)
  process.exit(1)
}

if (!LLAVE && !EMULADOR) {
  abortar(
    'Falta la llave de LECTURA. Pasala con --llave <ruta del .json>, '
    + 'o dejala en GOOGLE_APPLICATION_CREDENTIALS.',
  )
}

// ── Token de acceso a partir de la llave (mismo patrón que verifica-marca) ──

function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function tokenDeLaLlave(ruta) {
  let llave
  try {
    llave = JSON.parse(readFileSync(ruta, 'utf8'))
  } catch (e) {
    abortar(`No se pudo leer la llave en "${ruta}": ${e.message}`)
  }
  if (!llave.client_email || !llave.private_key) {
    abortar(`El archivo "${ruta}" no parece una llave de cuenta de servicio.`)
  }
  const ahora = Math.floor(Date.now() / 1000)
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const cuerpo = b64url(JSON.stringify({
    iss: llave.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600,
  }))
  const firma = createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(llave.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecera}.${cuerpo}.${firma}`,
    }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) {
    abortar(`Google rechazó la llave (HTTP ${r.status}): ${JSON.stringify(j).slice(0, 300)}`)
  }
  return { token: j.access_token, cuenta: llave.client_email }
}

// ── Lectura ─────────────────────────────────────────────────────────────────

const BASE = EMULADOR ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com'
const RAIZ = `${BASE}/v1/projects/${PROYECTO}/databases/(default)/documents`

const { token, cuenta } = EMULADOR
  ? { token: 'owner', cuenta: '(emulador local — ninguna llave)' }
  : await tokenDeLaLlave(LLAVE)

/**
 * Valor de la REST de Firestore a JS plano. Los Timestamp quedan como ISO en
 * cadena: el análisis los rehidrata, y así el JSON se puede leer a ojo.
 *
 * `undefined` para un campo ausente y `null` para un `nullValue` explícito son
 * cosas distintas y se conservan distintas — `origen_fecha: null` no es lo
 * mismo que un documento que no tiene el campo.
 */
function plano(v) {
  if (v == null) return undefined
  if ('nullValue' in v) return null
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(plano)
  if ('mapValue' in v) {
    const o = {}
    for (const [k, w] of Object.entries(v.mapValue.fields ?? {})) o[k] = plano(w)
    return o
  }
  if ('referenceValue' in v) return v.referenceValue
  return `(tipo no soportado: ${Object.keys(v).join(',')})`
}

const docs = []
let token_pagina = null
let paginas = 0
do {
  const u = new URL(`${RAIZ}/${COLECCION}`)
  u.searchParams.set('pageSize', '300')
  if (token_pagina) u.searchParams.set('pageToken', token_pagina)
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } })
  const j = await r.json()
  if (!r.ok) abortar(`Firestore rechazó la lectura (HTTP ${r.status}): ${JSON.stringify(j).slice(0, 300)}`)
  for (const d of j.documents ?? []) {
    const f = d.fields ?? {}
    docs.push({
      id: d.name.split('/').pop(),
      // Lo que decide SECCIÓN y VEREDICTO. Crudo: acá no se juzga nada.
      estado: plano(f.estado),
      migrado: plano(f.migrado),
      modalidad: plano(f.modalidad),
      semaforo: plano(f.semaforo),
      override_manual: plano(f.override_manual),
      numero_proceso: plano(f.numero_proceso),
      entidad: plano(f.entidad)?.nombre,
      objeto: (plano(f.objeto) ?? '').slice(0, 120),
      creado_en: plano(f.creado_en),
      cronograma: plano(f.cronograma),
      radar: plano(f.radar),
      // Para cruzar con el dataset abierto si hace falta.
      id_secop: plano(f.id_secop),
    })
  }
  token_pagina = j.nextPageToken ?? null
  paginas += 1
} while (token_pagina)

mkdirSync(dirname(SALIDA), { recursive: true })
writeFileSync(SALIDA, JSON.stringify({
  cuenta,
  leido_en: new Date().toISOString(),
  proyecto: PROYECTO,
  coleccion: COLECCION,
  paginas,
  total: docs.length,
  docs,
}, null, 1), 'utf8')

const delRadar = docs.filter(d => d.radar != null).length
console.log('')
console.log(`  ✓ censo escrito en ${SALIDA}`)
console.log(`    cuenta ................. ${cuenta}`)
console.log(`    documentos leídos ...... ${docs.length}  (${paginas} página(s))`)
console.log(`    con bloque \`radar\` ..... ${delRadar}`)
console.log(`    sin bloque \`radar\` ..... ${docs.length - delRadar}  (tecleadas a mano o del registro anterior)`)
console.log('')
console.log('  El veredicto NO lo calcula este script: lo calcula el código real')
console.log('  (`bandejaLicitaciones.ts`) sobre este JSON. Pasalo a la sesión que')
console.log('  esté midiendo la ventana útil.')
console.log('')
