// VERIFICADOR SIN DESPLEGAR — ¿esta sesión tiene lo que ESTE SCRIPT CONOCE
// que un despliegue exige?
//
// QUÉ CUBRE Y DE DÓNDE SALE: los permisos de abajo se derivaron el
// 10/11-nov-2026 leyendo el código de firebase-tools 15.22.4 (la versión del
// repo) — requirePermissions del comando deploy, prepare.js (APIs +
// generateServiceIdentity), fabricator.js (gcfV2 create/update, invokers de
// Cloud Run, job de Cloud Scheduler), release/index.js (política de limpieza
// de Artifact Registry) — más los huecos encontrados en DESPLIEGUES REALES
// (el quota project del 11-nov). Cubre los dos codebases: `default` (triggers
// Firestore + callables + censoConsecutivos programada) y `radar` (2
// programadas con cuenta dedicada).
//
// ⚠ LA FUENTE ES INCOMPLETA POR NATURALEZA — esta lista NO puede declararse
// completa, solo puede declarar qué cubre. El propio CLI declara 6 permisos
// (TARGET_PERMISSIONS de commands/deploy.js) y usa al menos cuatro familias
// que nunca declara (actAs, cloudscheduler.*, run.services.setIamPolicy,
// serviceusage.*): dos derivaciones independientes del mismo código perdieron
// el mismo permiso — no fue coincidencia, fue la fuente. Un resultado limpio
// de este script prueba LO QUE EL SCRIPT CONOCE, no más: si un deploy real
// falla por un permiso que no está abajo, el remedio incluye AGREGARLO aquí
// con su porqué.
//
// USO (con TU sesión — la misma con la que desplegarías):
//   npx firebase login     (si no hay sesión)
//   node scripts/verifica-permisos-despliegue.mjs
//
// Sin llaves: usa el refresh token local del configstore de firebase-tools
// (el client_id/secret de abajo son los PÚBLICOS del CLI, código abierto —
// la credencial real es el token local de cada persona).
//
// El modelo vigente (10-nov-2026) concede estos permisos vía el GRUPO
// desplegadores@negingenieria.com; si algo falta, el remedio es la
// MEMBRESÍA del grupo (admin.google.com → Grupos), no un binding directo.
import { readFileSync } from 'node:fs'

const PROYECTO = 'neg-sst-app'
const SAS = [
  ['777787585167-compute@developer.gserviceaccount.com', 'runtime de las 16 de default'],
  ['radar-secop@neg-sst-app.iam.gserviceaccount.com', 'runtime de las 2 del radar'],
]
// permiso → [de dónde sale la exigencia, rol del modelo que lo trae]
const REQUERIDOS = {
  'firebase.projects.get': ['preflight del CLI (requirePermissions)', 'firebase.viewer'],
  'cloudfunctions.functions.list': ['preflight del CLI', 'cloudfunctions.developer'],
  'cloudfunctions.functions.create': ['preflight del CLI + alta de funciones', 'cloudfunctions.developer'],
  'cloudfunctions.functions.get': ['preflight del CLI', 'cloudfunctions.developer'],
  'cloudfunctions.functions.update': ['preflight del CLI + todo re-deploy', 'cloudfunctions.developer'],
  'cloudfunctions.functions.delete': ['preflight del CLI (aunque nuestros scripts nunca borran)', 'cloudfunctions.developer'],
  'cloudfunctions.operations.get': ['preflight del CLI + polling del deploy', 'cloudfunctions.developer'],
  'cloudfunctions.functions.sourceCodeSet': ['subida del código fuente (generateUploadUrl)', 'cloudfunctions.developer'],
  'serviceusage.services.get': ['verificación de APIs habilitadas (prepare)', 'firebase.viewer'],
  'run.services.getIamPolicy': ['invoker v2: lectura previa en cada update', 'cloudfunctions.developer'],
  'run.services.setIamPolicy': ['invoker v2: callables public + SA de la programada (LA pieza que solo run.admin trae)', 'run.admin'],
  'cloudscheduler.jobs.get': ['job del horario (createOrReplaceJob)', 'cloudscheduler.admin'],
  'cloudscheduler.jobs.create': ['job del horario, primer deploy', 'cloudscheduler.admin'],
  'cloudscheduler.jobs.update': ['job del horario, TODO re-deploy (setTrigger corre en update)', 'cloudscheduler.admin'],
  'cloudscheduler.locations.list': ['resolución de la región del job', 'cloudscheduler.admin'],
  'artifactregistry.repositories.get': ['chequeo de política de limpieza de imágenes (no-fatal, pero evita el warning)', 'cloudfunctions.developer'],
  // El 6º permiso (hallazgo Licitaciones 11-nov, dos deploys abortados): con
  // UNA función de 2ª gen, prepare.js genera las identidades de pubsub y
  // eventarc con la cabecera x-goog-user-project — a un principal de PERSONA
  // esa cabecera le exige `use` (el método en sí no pide permiso elevado:
  // con cuenta de servicio del proyecto devuelve 200 — medido).
  'serviceusage.services.use': ['quota project de generateServiceIdentity (pubsub/eventarc), todo deploy con 2ª gen', 'serviceusage.serviceUsageConsumer'],
  'firebaserules.rulesets.create': ['deploy de reglas (scripts/deploy-reglas.ps1)', 'firebaserules.admin'],
  'firebaserules.releases.update': ['deploy de reglas', 'firebaserules.admin'],
  'firebaserules.releases.get': ['deploy de reglas (pre/post-verificación)', 'firebaserules.admin'],
}

const cfgPath = `${(process.env.HOME || process.env.USERPROFILE || '').replace(/\\/g, '/')}/.config/configstore/firebase-tools.json`
let cfg
try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) } catch { cfg = {} }
if (!cfg.tokens?.refresh_token) {
  console.error('Sin sesión de firebase-tools. Corre primero: npx firebase login')
  process.exit(1)
}
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.tokens.refresh_token,
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi' }),
})).json()
if (!tok.access_token) { console.error('No pude refrescar la sesión:', JSON.stringify(tok).slice(0, 200)); process.exit(1) }
const info = await (await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + tok.access_token)).json()
console.log('Verificando la sesión de:', info.email, '\n')
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' }

// ── Proyecto: los 19 de una vez ──
const permisos = Object.keys(REQUERIDOS)
const r = await (await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROYECTO}:testIamPermissions`, {
  method: 'POST', headers: H, body: JSON.stringify({ permissions: permisos }),
})).json()
const tiene = new Set(r.permissions || [])
const faltan = permisos.filter((p) => !tiene.has(p))
for (const p of permisos) console.log(` ${tiene.has(p) ? 'OK ' : '✗✗ '} ${p}`)

// ── Las dos SAs: actuar-como (nivel SA, no proyecto) ──
let faltanActAs = []
for (const [sa, quees] of SAS) {
  const rs = await (await fetch(`https://iam.googleapis.com/v1/projects/${PROYECTO}/serviceAccounts/${sa}:testIamPermissions`, {
    method: 'POST', headers: H, body: JSON.stringify({ permissions: ['iam.serviceAccounts.actAs'] }),
  })).json()
  const ok = (rs.permissions || []).includes('iam.serviceAccounts.actAs')
  console.log(` ${ok ? 'OK ' : '✗✗ '} actuar-como ${sa} (${quees})`)
  if (!ok) faltanActAs.push(sa)
}

if (!faltan.length && !faltanActAs.length) {
  console.log('\nCOBERTURA LIMPIA: la sesión tiene todo lo que este script conoce (derivado de')
  console.log('firebase-tools 15.22.4 + huecos de despliegues reales). La fuente es incompleta')
  console.log('por naturaleza: esto prueba lo conocido, no más — ver el encabezado del script.')
  process.exit(0)
}
console.log('\nFALTA:')
for (const p of faltan) console.log(`  ${p} — ${REQUERIDOS[p][0]} — lo trae ${REQUERIDOS[p][1]}`)
for (const sa of faltanActAs) console.log(`  iam.serviceAccounts.actAs sobre ${sa} — binding serviceAccountUser a nivel de ESA cuenta`)
console.log('\nREMEDIO (modelo vigente): membresía en el grupo desplegadores@negingenieria.com')
console.log('(admin.google.com → Grupos). Si acabas de entrar al grupo, la propagación tarda ~2 min.')
process.exit(2)
