// VERIFICA LA MARCA DEL RADAR — solo lectura. No escribe nada, nunca.
//
// ── POR QUÉ ESTE SCRIPT EXISTE, Y POR QUÉ SOLO LEE ──────────────────────────
// La marca se escribe A MANO en la consola de Firebase (dos campos en un
// documento). Se descartó hacerlo con un script y una llave de ESCRITURA: el
// modelo de tres llaves nació porque apareció una llave olvidada desde julio,
// y crear una llave descargable para escribir dos campos reintroduce ese mismo
// riesgo — alguien tiene que colocarla, usarla y acordarse de borrarla.
//
// Lo que NO se puede perder al escribir a mano son las guardas. Entonces no se
// pierden: se mueven acá. Este script corre DESPUÉS del acto, con la llave de
// solo LECTURA que ya existe y ya se usa para los censos, y revisa lo que una
// persona puede equivocar en un formulario.
//
// ── LO QUE REVISA, Y POR QUÉ CADA COSA ──────────────────────────────────────
// EL TIPO, no solo el valor. `marca` tiene que ser CADENA. Si se guarda como
// Timestamp, `ventanaIngesta` cae en su rama de "marca corrupta" y devuelve una
// ventana SIN INICIO, que la guarda de volumen detiene: el radar no se rompe,
// pero se queda callado, y desde afuera eso es idéntico a "el acto nunca se
// hizo". Ese es el fallo silencioso que este script existe para que no ocurra.
//
// ── CÓMO SE CORRE ───────────────────────────────────────────────────────────
//   node scripts/sigp/verifica-marca-radar.mjs --llave <ruta de la llave de LECTURA>
//   node scripts/sigp/verifica-marca-radar.mjs --emulador      (ensayo local)
// Sin --llave toma `GOOGLE_APPLICATION_CREDENTIALS`, como el resto de la casa.
//
// Sin dependencias y sin importar nada del árbol, a propósito: lo corre una
// persona después de un acto, y cada pieza que haya que instalar antes es una
// forma de fallar.
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'

// Los DOS literales de abajo los mandan `src/utils/sigp/radarRutas.ts`
// (`RUTA_ESTADO_RADAR`) y `src/utils/sigp/radarCorrida.ts`
// (`GUARDA_VOLUMEN.MAX_DIAS_VENTANA`). Se repiten acá porque este script no
// importa nada, y para que eso no sean dos fuentes de verdad hay un test que
// los compara contra las constantes reales:
// `src/utils/sigp/__tests__/verificaMarca.test.ts`.
const RUTA_ESTADO = 'configuracion/radar_secop'
const MAX_DIAS_VENTANA = 120
const PROYECTO = 'neg-sst-app'

// ── Argumentos ──────────────────────────────────────────────────────────────

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i === -1 ? null : process.argv[i + 1] ?? null
}
const EMULADOR = process.argv.includes('--emulador')
const LLAVE = arg('llave') ?? process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null

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

// ── Token de acceso a partir de la llave (solo lectura de Firestore) ────────

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

const r = await fetch(`${RAIZ}/${RUTA_ESTADO}`, { headers: { Authorization: `Bearer ${token}` } })

console.log('')
console.log('  VERIFICACIÓN DE LA MARCA DEL RADAR   (solo lectura)')
console.log('  ' + '─'.repeat(60))
console.log(`  documento  ${RUTA_ESTADO}${EMULADOR ? '   [EMULADOR LOCAL]' : ''}`)
console.log(`  leído por  ${cuenta}`)
console.log('')

if (r.status === 404) {
  abortar(
    'EL DOCUMENTO NO EXISTE. El acto de la marca no se hizo, o se guardó en '
    + `otra ruta. Tiene que ser exactamente ${RUTA_ESTADO}.`,
  )
}
if (!r.ok) {
  abortar(`No se pudo leer (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`)
}

const campos = (await r.json()).fields ?? {}
const problemas = []

function tipoDe(v) {
  if (v === undefined) return '(ausente)'
  const k = Object.keys(v)[0]
  return ({
    stringValue: 'cadena', integerValue: 'número entero', doubleValue: 'número con decimales',
    booleanValue: 'booleano', timestampValue: 'Timestamp', nullValue: 'null',
    mapValue: 'mapa', arrayValue: 'lista', referenceValue: 'referencia',
    geoPointValue: 'geopoint', bytesValue: 'bytes',
  })[k] ?? k
}

// ── 1. `marca`: tiene que ser CADENA con forma AAAA-MM-DD ──────────────────
const vMarca = campos.marca
const tipoMarca = tipoDe(vMarca)
const marca = vMarca && 'stringValue' in vMarca ? vMarca.stringValue : null

console.log(`  marca         ${marca === null ? '—' : `"${marca}"`}`)
console.log(`    tipo        ${tipoMarca}`)

if (vMarca === undefined) {
  problemas.push('`marca` NO EXISTE en el documento. El acto no se completó.')
} else if (!('stringValue' in vMarca)) {
  problemas.push(
    `\`marca\` quedó guardada como ${tipoMarca} y tiene que ser CADENA (string). `
    + 'Con otro tipo la corrida se detiene y el radar se queda callado, que desde '
    + 'afuera es idéntico a que el acto nunca se hizo. Hay que corregir el campo.',
  )
} else if (!/^\d{4}-\d{2}-\d{2}$/.test(marca)) {
  problemas.push(
    `\`marca\` es una cadena pero su forma no es AAAA-MM-DD: "${marca}". `
    + 'Hay que corregirla.',
  )
} else if (Number.isNaN(Date.parse(`${marca}T00:00:00Z`))) {
  problemas.push(`\`marca\` tiene la forma correcta pero no es una fecha real: "${marca}".`)
}

// ── 2. `solape_dias`: entero positivo ──────────────────────────────────────
const vSolape = campos.solape_dias
const tipoSolape = tipoDe(vSolape)
const solape = vSolape && 'integerValue' in vSolape ? Number(vSolape.integerValue) : null

console.log(`  solape_dias   ${solape === null ? '—' : solape}`)
console.log(`    tipo        ${tipoSolape}`)
console.log('')

if (vSolape === undefined) {
  problemas.push('`solape_dias` NO EXISTE en el documento. El acto no se completó.')
} else if (!('integerValue' in vSolape)) {
  problemas.push(
    `\`solape_dias\` quedó guardada como ${tipoSolape} y tiene que ser NÚMERO entero. `
    + 'Hay que corregir el campo.',
  )
} else if (!Number.isInteger(solape) || solape <= 0) {
  problemas.push(`\`solape_dias\` tiene que ser un entero positivo; quedó ${solape}.`)
}

// ── 3. La ventana que esto abre, contra el tope de la guarda ───────────────
if (marca !== null && solape !== null && !Number.isNaN(Date.parse(`${marca}T00:00:00Z`))) {
  const dias = Math.round((Date.now() - Date.parse(`${marca}T00:00:00Z`)) / 86_400_000) + solape
  console.log(`  La próxima corrida mirará ${dias} días hacia atrás (tope de la guarda: ${MAX_DIAS_VENTANA}).`)
  console.log('')
  if (dias > MAX_DIAS_VENTANA) {
    problemas.push(
      `La ventana que abre esta marca es de ${dias} días y el tope es ${MAX_DIAS_VENTANA}: `
      + 'la corrida se va a detener sola y no va a escribir nada. '
      + 'Hay que poner una marca más reciente, o un solape más corto.',
    )
  }
}

// ── 4. Lo que el acto NO debía tocar ───────────────────────────────────────
// El historial y el acumulado los escribe la función en cada corrida. Si el
// acto los borró, el radar no se rompe, pero la memoria de lo que vio se fue.
const extras = Object.keys(campos).filter(k => k !== 'marca' && k !== 'solape_dias')
console.log(`  Otros campos en el documento: ${extras.length === 0 ? 'ninguno' : extras.join(', ')}`)
if (extras.length === 0) {
  console.log('    (normal ANTES de la primera corrida: el historial lo escribe la función)')
}
console.log('')

// ── Veredicto ───────────────────────────────────────────────────────────────
console.log('  ' + '─'.repeat(60))
if (problemas.length > 0) {
  console.log('')
  for (const p of problemas) console.log(`  ✗ ${p}`)
  console.log('')
  console.log('  LA MARCA NO ESTÁ BIEN. No la des por hecha.')
  console.log('')
  process.exit(1)
}

console.log('')
console.log('  ✓ LA MARCA ESTÁ BIEN ESCRITA: los dos campos, con el tipo correcto,')
console.log('    y la ventana que abren cabe en la guarda.')
console.log('')
console.log('  Lo que sigue solo: la próxima corrida programada ya encuentra marca')
console.log('  y escribe. No hay que tocar nada más.')
console.log('')
