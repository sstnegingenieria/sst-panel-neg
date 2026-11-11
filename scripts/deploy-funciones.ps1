<#
.SYNOPSIS
  UNICO camino para desplegar Cloud Functions a produccion (neg-sst-app).

.DESCRIPTION
  Hermano de deploy-reglas.ps1, con el mismo patron: verificacion en el MISMO
  acto que el deploy, prompt del PR, palabra de confirmacion, post-verificacion
  y fila en la bitacora commiteada por el propio script.

  POR QUE EXISTE. Un deploy de funciones no reemplaza un archivo: reemplaza el
  conjunto de funciones DE UN CODEBASE. Si el codigo local no declara una
  funcion que esta viva en prod, el CLI ofrece BORRARLA — y con --force la
  borra sin preguntar. Es el mismo filo del deploy de reglas ("si el archivo
  local no contiene lo que ya esta vivo, el deploy no queda incompleto,
  BORRA"), aplicado a funciones.

  Y hay un filo mas, propio de esto: `firebase deploy --only functions` SIN
  nombre de codebase despliega TODOS los codebases. Este script EXIGE el
  codebase (-Codebase) y nunca corre el comando pelado.

  Pasos (cualquier fallo aborta SIN desplegar):
    1. Sesion de PERSONA (no llave de servicio, no cuenta compartida), rama
       main, arbol limpio, HEAD == origin/main tras git fetch, y bitacora de
       funciones sin lineas pendientes de un deploy anterior.
    2. -Codebase existe en firebase.json (y no es el comando pelado).
    3. Lee de PROD las funciones vivas de ESE codebase (API de Cloud Functions
       v2 y v1, con la sesion de firebase-tools). Si no se puede leer, ABORTA:
       un "no pude leer prod" jamas se interpreta como "no hay nada que
       borrar".
    4. Lee lo que el CODIGO DECLARA (los exports del entry del codebase, tras
       su build si tiene) y compara:
         · en prod y NO declarada  -> ABORTA (el deploy la borraria)
         · declarada y no en prod  -> funcion NUEVA (se lista)
         · en las dos              -> actualizacion (se lista)
       Lista ademas los commits que tocaron la carpeta del codebase desde el
       ultimo deploy registrado en la bitacora.
    5. Exige el numero del PR (vacio = ABORTA) y la palabra DESPLEGAR, y
       reconfirma que prod no cambio durante la espera.
    6. firebase deploy --only functions:<codebase> --project neg-sst-app
    7. Post-verificacion: re-lee prod y exige que TODAS las declaradas esten
       ACTIVE y que no quede ninguna de mas en el codebase.
    8. Fila en docs/bitacora-deploys-funciones.md, commiteada y empujada por
       el script.
  -Simulacro hace 1 a 4 y se detiene (solo lectura).

  LA ETIQUETA. Para saber que funcion es de que codebase se usa la etiqueta
  `firebase-functions-codebase`, que es la que pone firebase-tools
  (lib/functions/constants.js). Una funcion SIN etiqueta cuenta como del
  codebase `default`, igual que hace el CLI
  (lib/gcp/cloudfunctionsv2.js: `labels?.[CODEBASE_LABEL] || DEFAULT_CODEBASE`).

.PARAMETER Codebase
  OBLIGATORIO. Nombre del codebase de firebase.json (`default`, `radar`, ...).

.PARAMETER Simulacro
  Hace los pasos 1 a 4 y se detiene. No despliega ni escribe nada en el repo.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Codebase,
  [switch]$Simulacro
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Proyecto = 'neg-sst-app'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

# Cuentas que NO pueden desplegar: el acuerdo de los tres frentes (09-nov-2026)
# es que cada persona despliega con SU cuenta y la cierra al terminar. Una
# bitacora que dice "sstnegingenieria" no responde quien desplego, que es su
# unica razon de existir.
#
# EL VETO ES ABSOLUTO — no hay bandera, firma ni escotilla que lo abra.
#
# Hubo una: mientras el dominio no tuvo Cloud Identity, los correos de la
# empresa eran buzones y no identidades de Google, asi que NINGUNA cuenta
# nominal podia recibir roles y la unica que podia desplegar era la
# compartida. La excepcion existio con firma, motivo y fecha de vencimiento.
#
# El 09-nov-2026 el nudo se resolvio por la salida correcta: Cloud Identity
# quedo activo y la cuenta nominal funciona. Desaparecida la causa, la
# escotilla se BORRA en vez de esperar a que venza — una excepcion que ya no
# habilita nada solo deja el agujero abierto.
$CuentasCompartidas = @('sstnegingenieria@gmail.com')

function Abortar([string]$msg) {
  Write-Host ''
  Write-Host "ABORTADO: $msg" -ForegroundColor Red
  Write-Host 'No se desplego nada.' -ForegroundColor Red
  exit 1
}
function Paso([string]$n, [string]$t) { Write-Host ''; Write-Host "[$n] $t" -ForegroundColor Cyan }
function Git-Salida([string[]]$argumentos) {
  $r = & git @argumentos
  if ($LASTEXITCODE -ne 0) { Abortar "git $($argumentos -join ' ') fallo (codigo $LASTEXITCODE)." }
  return $r
}

Write-Host '=== deploy-funciones.ps1 ===' -ForegroundColor White
if ($Simulacro) { Write-Host 'MODO SIMULACRO: solo lectura, no se despliega.' -ForegroundColor Yellow }
Write-Host "Repo: $RepoRoot"
Write-Host "Codebase: $Codebase"

# ═══ 1. Sesion de persona + estado de git ═══════════════════════════════════
Paso '1/8' 'Sesion de persona, rama main, arbol limpio y HEAD == origin/main'

if ($env:GOOGLE_APPLICATION_CREDENTIALS) {
  Abortar ("GOOGLE_APPLICATION_CREDENTIALS esta definida ($env:GOOGLE_APPLICATION_CREDENTIALS).`n" +
    "Los deploys salen de la sesion de una persona, nunca de una llave de servicio.`n" +
    "QUE HACER:`n" +
    '    $env:GOOGLE_APPLICATION_CREDENTIALS = $null' + "`n" +
    "    npx firebase login`n" +
    'y vuelve a correr el script.')
}

$loginList = (& npx firebase login:list 2>$null | Out-String)
$quien = ''
if ($loginList -match 'Logged in as\s+(\S+)') { $quien = $Matches[1] }
if (-not $quien) {
  Abortar 'no pude determinar la sesion de Firebase (npx firebase login:list). Inicia sesion con TU cuenta (npx firebase login).'
}
if ($CuentasCompartidas -contains $quien) {
  Abortar (@(
    "la sesion activa es la CUENTA COMPARTIDA ($quien).",
    'El acuerdo de los tres frentes es sesion de persona: login -> deploy -> logout,',
    'y una bitacora que dice "sstnegingenieria" no responde QUIEN desplego.',
    '',
    'NO hay excepcion. La hubo mientras el dominio no tenia Cloud Identity y',
    'ninguna cuenta nominal podia recibir roles; eso se resolvio el 09-nov-2026',
    'y la escotilla se borro con su causa.',
    '',
    'QUE HACER:',
    '    npx firebase logout',
    '    npx firebase login',
    'y vuelve a correr el script con TU cuenta de la empresa.',
    'Si te falta un rol, el chequeo que sigue te dice cual y con que comando.'
  ) -join [Environment]::NewLine)
}
Write-Host "Sesion de Firebase: $quien" -ForegroundColor Green

# ── 1-bis. ¿La persona PUEDE desplegar funciones? ───────────────────────────
# Hallazgo del frente SIGP (09-nov-2026) al revisar este script: la cuenta
# compartida esta vetada por diseno (guarda de arriba) y la unica cuenta
# nominal con roles tenia solo `firebaserules.admin` + `firebase.viewer`. O
# sea: se podia pasar la guarda 1 y fallar DESPUES, en medio del deploy, tras
# haber tecleado el numero del PR y la palabra DESPLEGAR.
#
# Este chequeo le pregunta a Resource Manager que permisos tiene LA SESION
# ACTIVA (testIamPermissions responde sobre el llamador) ANTES de pedir nada.
# NO es exhaustivo: un deploy de 2a generacion toca varias APIs (Cloud Run,
# Artifact Registry, Cloud Build). Y hay un permiso que desde aqui NO SE PUEDE
# ver: el `actAs` sobre la cuenta de servicio de runtime, que se evalua sobre
# OTRO recurso —la cuenta— y no sobre el proyecto. Ese tiene su propio
# chequeo (paso 2-bis), despues del build, porque antes del build no se sabe
# con que cuenta va a correr el codebase.
#
# El prologo que cambia el refresh token de la sesion de firebase-tools por un
# access token vive en UNA sola variable porque lo usan LOS DOS chequeos de
# IAM. Duplicar el client_id en dos heredocs seria pedir que uno envejezca.
$PreludioToken = @'
const fs = require('fs'), os = require('os'), path = require('path')
async function accessToken() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  let rt
  try { rt = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).tokens.refresh_token } catch (e) { rt = null }
  if (!rt) throw new Error('sin sesion de firebase-tools')
  const tok = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi' }),
  })).json()
  if (!tok.access_token) throw new Error('la sesion no refresca')
  return tok.access_token
}
'@

$verificador = Join-Path $env:TEMP ("permisos-" + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.js')
($PreludioToken + @'
const PERMISOS = [
  'cloudfunctions.functions.list',
  'cloudfunctions.functions.create',
  'cloudfunctions.functions.update',
  'run.services.update',
]
;(async () => {
  const token = await accessToken()
  const r = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects/neg-sst-app:testIamPermissions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: PERMISOS }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('testIamPermissions: ' + JSON.stringify(j).slice(0, 200))
  const tiene = j.permissions || []
  console.log(JSON.stringify({ tiene, faltan: PERMISOS.filter(p => !tiene.includes(p)) }))
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1) })
'@) | Set-Content -Path $verificador -Encoding UTF8

$permJson = & node $verificador
if ($LASTEXITCODE -ne 0) {
  Remove-Item $verificador -Force
  Abortar 'no pude comprobar tus permisos de despliegue con tu sesion de firebase-tools.'
}
Remove-Item $verificador -Force
$perm = ($permJson | Out-String | ConvertFrom-Json)
$permFaltan = @($perm.faltan)
if ($permFaltan.Count -gt 0) {
  $rolFn = 'roles/cloudfunctions.developer'
  Abortar ("la cuenta $quien NO tiene permisos para desplegar funciones.`n" +
    'Permisos que faltan: ' + ($permFaltan -join ', ') + "`n`n" +
    "QUE HACER (acto de IAM; lo ejecuta alguien con propiedad del proyecto):`n" +
    "    gcloud projects add-iam-policy-binding neg-sst-app --member=user:$quien --role=$rolFn`n`n" +
    "(El actAs sobre la cuenta de runtime es OTRO permiso, sobre OTRO recurso;`n" +
    " si tambien falta, el paso 2-bis te lo dira con su propio comando.)`n`n" +
    'Sin eso el deploy fallaria DESPUES de pedirte el PR y la confirmacion, a mitad de camino.')
}
Write-Host ('OK: la sesion tiene los permisos de proyecto para desplegar (' + ($perm.tiene -join ', ') + ').') -ForegroundColor Green
Write-Host '   (el actAs va en el paso 2-bis: es otro recurso; el horario, en el 2-ter)' -ForegroundColor DarkGray

$bitacora = Join-Path $RepoRoot 'docs\bitacora-deploys-funciones.md'
$bitacoraRel = 'docs/bitacora-deploys-funciones.md'
$bitacoraSucia = Git-Salida @('status', '--porcelain', '--', $bitacoraRel)
if ($bitacoraSucia) {
  Abortar ("$bitacoraRel tiene cambios SIN COMMITEAR de un deploy anterior.`n" +
    "Commitea y empuja esa linea y vuelve a correr.")
}

$rama = (Git-Salida @('branch', '--show-current') | Out-String).Trim()
if ($rama -ne 'main') { Abortar "la rama actual es '$rama'; solo se despliega desde main." }
$sucios = Git-Salida @('status', '--porcelain', '--untracked-files=no')
if ($sucios) { Abortar ("hay cambios sin commit:`n" + ($sucios -join "`n")) }

Write-Host 'git fetch origin ...'
& git fetch origin --quiet
if ($LASTEXITCODE -ne 0) { Abortar 'git fetch origin fallo.' }
$head = (Git-Salida @('rev-parse', 'HEAD') | Out-String).Trim()
$remoto = (Git-Salida @('rev-parse', 'origin/main') | Out-String).Trim()
if ($head -ne $remoto) {
  Abortar "HEAD ($($head.Substring(0,7))) != origin/main ($($remoto.Substring(0,7))). Actualiza main (git pull --ff-only) y vuelve a correr."
}
$commitCorto = $head.Substring(0, 7)
Write-Host "OK: rama main, arbol limpio, HEAD == origin/main ($commitCorto)." -ForegroundColor Green

# ═══ 2. El codebase existe ══════════════════════════════════════════════════
Paso '2/8' 'El codebase existe en firebase.json'

$fbJson = Join-Path $RepoRoot 'firebase.json'
if (-not (Test-Path $fbJson)) { Abortar 'no existe firebase.json en la raiz del repo.' }
$fb = Get-Content $fbJson -Raw | ConvertFrom-Json
$entradas = @($fb.functions)
if ($entradas.Count -eq 0) { Abortar 'firebase.json no declara ningun codebase de functions.' }
$nombres = @()
foreach ($e in $entradas) {
  $n = 'default'
  if ($e.PSObject.Properties.Name -contains 'codebase' -and $e.codebase) { $n = [string]$e.codebase }
  $nombres += $n
}
Write-Host ("Codebases declarados: " + ($nombres -join ', '))
if ($nombres -notcontains $Codebase) {
  Abortar "'$Codebase' no esta en firebase.json. Codebases: $($nombres -join ', ')."
}
$idx = [array]::IndexOf($nombres, $Codebase)
$entrada = $entradas[$idx]
$carpeta = [string]$entrada.source
$carpetaAbs = Join-Path $RepoRoot $carpeta
if (-not (Test-Path $carpetaAbs)) { Abortar "la carpeta del codebase no existe: $carpeta" }
Write-Host "OK: codebase '$Codebase' -> carpeta '$carpeta'." -ForegroundColor Green

# ═══ 3. Funciones VIVAS de ese codebase en prod ═════════════════════════════
Paso '3/8' "Funciones vivas en prod del codebase '$Codebase'"

$tmp = Join-Path $env:TEMP ("deploy-funciones-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$lector = Join-Path $tmp 'leer-funciones.js'

# Lector SIN LLAVE: usa la sesion de firebase-tools de la persona, igual que
# deploy-reglas.ps1. (El client_id/secret son los PUBLICOS del CLI, embebidos
# en su codigo abierto; la credencial real es el refresh_token local.)
@'
const fs = require('fs'), os = require('os'), path = require('path')
const [, , salida] = process.argv
const P = 'neg-sst-app'
const ETIQUETA = 'firebase-functions-codebase'
;(async () => {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  let rt
  try { rt = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).tokens.refresh_token } catch (e) { rt = null }
  if (!rt) throw new Error('sin sesion de firebase-tools — corre: npx firebase login')
  const tok = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi' }),
  })).json()
  if (!tok.access_token) throw new Error('la sesion de firebase-tools no refresca — corre: npx firebase login')
  const h = { Authorization: 'Bearer ' + tok.access_token }

  async function paginar(url, campo) {
    const salida = []
    let pageToken = ''
    for (let i = 0; i < 20; i++) {
      const u = url + (url.includes('?') ? '&' : '?') + 'pageSize=200' + (pageToken ? '&pageToken=' + pageToken : '')
      const r = await fetch(u, { headers: h })
      const j = await r.json()
      if (!r.ok) throw new Error(url.includes('/v2/') ? ('v2: ' + JSON.stringify(j).slice(0, 300)) : ('v1: ' + JSON.stringify(j).slice(0, 300)))
      for (const f of (j[campo] || [])) salida.push(f)
      pageToken = j.nextPageToken || ''
      if (!pageToken) break
    }
    return salida
  }

  // 2a generacion (lo que usa este proyecto) y 1a generacion, por si queda algo.
  const v2 = await paginar('https://cloudfunctions.googleapis.com/v2/projects/' + P + '/locations/-/functions', 'functions')
  let v1 = []
  let v1Error = null
  try {
    v1 = await paginar('https://cloudfunctions.googleapis.com/v1/projects/' + P + '/locations/-/functions', 'functions')
  } catch (e) { v1Error = e.message }

  const norm = (f, gen) => ({
    nombre: String(f.name || '').split('/').pop(),
    gen,
    estado: f.state || f.status || '(sin estado)',
    actualizada: f.updateTime || '(sin fecha)',
    codebase: (f.labels && f.labels[ETIQUETA]) ? f.labels[ETIQUETA] : 'default',
  })
  const todas = [...v2.map(f => norm(f, 2)), ...v1.map(f => norm(f, 1))]
  // Una funcion puede aparecer en las dos APIs: se conserva la de 2a gen.
  const porNombre = new Map()
  for (const f of todas) if (!porNombre.has(f.nombre) || f.gen === 2) porNombre.set(f.nombre, f)
  fs.writeFileSync(salida, JSON.stringify({
    total: porNombre.size, v1Error, funciones: [...porNombre.values()],
  }, null, 1), 'utf8')
  console.log('ok')
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1) })
'@ | Set-Content -Path $lector -Encoding UTF8

function Leer-Prod() {
  $archivo = Join-Path $tmp ("prod-" + [Guid]::NewGuid().ToString('N').Substring(0, 6) + '.json')
  & node $lector $archivo | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Remove-Item $tmp -Recurse -Force
    # FALLA CERRADA: no poder leer prod NO es "prod esta vacio".
    Abortar ("no pude leer las funciones vivas de prod con tu sesion de firebase-tools.`n" +
      'Sin esa lectura no se puede saber si el deploy BORRARIA una funcion. Resuelve la sesion (npx firebase login) y vuelve a correr.')
  }
  return (Get-Content $archivo -Raw | ConvertFrom-Json)
}

$prod = Leer-Prod
if ($prod.v1Error) { Write-Host ("Nota: la API v1 no respondio ({0}). Se sigue con 2a generacion." -f $prod.v1Error) -ForegroundColor Yellow }
$vivasCodebase = @($prod.funciones | Where-Object { $_.codebase -eq $Codebase })
Write-Host ("Funciones en el proyecto: {0}  ·  de este codebase: {1}" -f $prod.total, $vivasCodebase.Count)
foreach ($f in $vivasCodebase) {
  Write-Host ("  {0}  (gen {1}, {2}, actualizada {3})" -f $f.nombre, $f.gen, $f.estado, $f.actualizada)
}

# ═══ 4. Lo que el codigo DECLARA, y la comparacion ══════════════════════════
Paso '4/8' 'Lo que declara el codigo, y que haria el deploy'

# Si el codebase tiene build, se corre ANTES de leer sus exports: lo que se
# despliega es el artefacto, no el fuente.
$tienePredeploy = ($entrada.PSObject.Properties.Name -contains 'predeploy' -and $entrada.predeploy)
if ($tienePredeploy) {
  Write-Host "El codebase tiene predeploy; se corre su build para leer el artefacto real..."
  Push-Location $carpetaAbs
  & npm run build
  $okBuild = ($LASTEXITCODE -eq 0)
  Pop-Location
  if (-not $okBuild) { Remove-Item $tmp -Recurse -Force; Abortar "el build del codebase '$Codebase' fallo. No se despliega un artefacto que no compila." }
}

$pkgPath = Join-Path $carpetaAbs 'package.json'
$entry = 'index.js'
if (Test-Path $pkgPath) {
  $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
  if ($pkg.PSObject.Properties.Name -contains 'main' -and $pkg.main) { $entry = [string]$pkg.main }
}
$entryAbs = Join-Path $carpetaAbs $entry
if (-not (Test-Path $entryAbs)) { Remove-Item $tmp -Recurse -Force; Abortar "no existe el entry del codebase: $carpeta/$entry" }

$lectorExports = Join-Path $tmp 'leer-exports.js'
# Un export cuenta como funcion DESPLEGABLE solo si firebase-functions le puso
# `__endpoint` (es la marca que el propio SDK usa para construir el manifiesto
# del deploy). Aceptar "cualquier objeto" convertiria un export decorativo en
# una funcion que la post-verificacion exigiria en prod para siempre: una falsa
# alarma permanente. Medido el 09-nov-2026: los 16 exports del codebase
# `default` traen `__endpoint.platform = 'gcfv2'`.
@'
const [, , entry] = process.argv
const PROYECTO = 'neg-sst-app'
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || PROYECTO
const { createRequire } = require('module')
// El SDK se resuelve DESDE EL ENTRY, no desde este script: cada codebase trae
// su propio node_modules. Con las CLASES REALES la clasificacion es exacta y
// no depende de `typeof` ni de nombres de constructor.
const reqEntry = createRequire(entry)
let Expression = null
let RESET_VALUE = null
try {
  Expression = reqEntry('firebase-functions/params').Expression
  RESET_VALUE = reqEntry('firebase-functions').RESET_VALUE
} catch (e) { /* sin clases: todo objeto cae en `desconocidas` y el script aborta */ }
const m = require(entry)
const nombres = []
const sinEndpoint = []
const cuentas = new Set()
const porParametro = []
const desconocidas = []
const conHorario = []
const conInvoker = []
// LA CUENTA DE RUNTIME se deriva del endpoint igual que la lista de funciones:
// firebase-functions copia la opcion `serviceAccount` a
// `__endpoint.serviceAccountEmail`. Pero ese campo tiene CUATRO formas, y
// medirlas costo dos errores que vale la pena no repetir:
//
//  1. Ausente            -> corre con la cuenta de computo por defecto.
//  2. `RESET_VALUE`      -> el centinela del SDK para "vuelve al default".
//     Es un OBJETO TRUTHY cuyo `toJSON()` devuelve null, asi que parece null
//     al imprimirlo y no lo es. Los 16 exports del codebase `default` lo
//     traen: una guarda por `typeof` los reporto a TODOS como cuenta
//     dedicada. Se compara por IDENTIDAD contra el valor del SDK.
//  3. Cadena             -> el correo, o la forma corta 'nombre@' que el
//     propio SDK expande con el proyecto.
//  4. `Expression`       -> definido por PARAMETRO (`defineString` y cia.,
//     hallazgo del frente SIGP). Se resuelve al desplegar, asi que leyendo el
//     artefacto NO se sabe cual es. Descartarlo en silencio seria el mismo
//     pecado que este chequeo vino a corregir: diria "cero cuentas
//     dedicadas" sobre un codebase que si corre con cuenta propia.
//
// Cualquier otra forma va a `desconocidas` y ABORTA el deploy: ante un campo
// que no sabemos leer, callar es peor que parar.
for (const k of Object.keys(m)) {
  const v = m[k]
  if (!(v && v.__endpoint)) {
    if (typeof v === 'function' || (v && typeof v === 'object')) sinEndpoint.push(k)
    continue
  }
  nombres.push(k)
  const e = v.__endpoint
  // El horario tambien se DERIVA: `scheduleTrigger` lo pone el propio SDK
  // al declarar `onSchedule`. De aqui sale la condicion del paso 2-ter.
  if (e.scheduleTrigger) conHorario.push(k)
  // LAS RAMAS DEL INVOKER, copiadas de `createV2Function` de firebase-tools:
  // el CLI llama a `setInvokerCreate` SOBRE EL SERVICIO para https, callable,
  // programadas, blocking de auth, y taskQueue solo si declara invoker. Para
  // las de EVENTO no lo llama. De aqui sale si el deploy va a escribir una
  // politica de IAM de Cloud Run, que es un permiso que no todos tienen.
  if (e.httpsTrigger || e.callableTrigger || e.scheduleTrigger || e.blockingTrigger ||
      (e.taskQueueTrigger && e.taskQueueTrigger.invoker)) conInvoker.push(k)
  const sa = e.serviceAccountEmail !== undefined ? e.serviceAccountEmail : e.serviceAccount
  if (!sa) continue
  if (RESET_VALUE !== null && sa === RESET_VALUE) continue
  if (typeof sa === 'string') {
    const email = sa.endsWith('@') ? sa + PROYECTO + '.iam.gserviceaccount.com' : sa
    if (email.includes('@')) cuentas.add(email)
    else desconocidas.push(k + ': cadena sin arroba (' + sa + ')')
    continue
  }
  if (Expression !== null && sa instanceof Expression) { porParametro.push(k); continue }
  const clase = (sa.constructor && sa.constructor.name) || typeof sa
  desconocidas.push(k + ': forma no reconocida (' + clase + ')')
}
console.log(JSON.stringify({
  nombres, sinEndpoint, cuentas: [...cuentas], porParametro, desconocidas, conHorario, conInvoker,
}))
'@ | Set-Content -Path $lectorExports -Encoding UTF8

$declaradasJson = & node $lectorExports $entryAbs
if ($LASTEXITCODE -ne 0) { Remove-Item $tmp -Recurse -Force; Abortar "no pude leer los exports de $carpeta/$entry." }
$lectura = ($declaradasJson | Out-String | ConvertFrom-Json)
$declaradas = @($lectura.nombres)
$sinEndpoint = @($lectura.sinEndpoint)
# LA LISTA ESPERADA SE DERIVA, NO SE CABLEA. Sale de los exports del entry del
# codebase EN EL COMMIT QUE SE ESTA DESPLEGANDO — el paso 1 ya exigio arbol
# limpio y HEAD == origin/main, asi que el archivo que se acaba de leer es
# exactamente el del commit. Una lista escrita a mano envejeceria en silencio:
# el dia que alguien agregue una funcion, la post-verificacion exigiria la
# lista vieja y diria "sobra en prod" sobre algo correcto.
Write-Host ("Lista derivada de $carpeta/$entry en el commit $commitCorto (no hay lista fija en este script).") -ForegroundColor DarkGray
if ($sinEndpoint.Count -gt 0) {
  Write-Host ("Exports que NO son funciones desplegables (se ignoran): " + ($sinEndpoint -join ', ')) -ForegroundColor Yellow
}
if ($declaradas.Count -eq 0) { Remove-Item $tmp -Recurse -Force; Abortar "$carpeta/$entry no exporta ninguna funcion. Un deploy asi BORRARIA todo el codebase." }
Write-Host ("Declaradas por el codigo ({0}): {1}" -f $declaradas.Count, ($declaradas -join ', '))

# ── 2-bis. ¿Puedes desplegar CON LA CUENTA DE RUNTIME que declara el codigo? ─
# POR QUE ESTE CHEQUEO EXISTE APARTE DEL DE ARRIBA: el permiso que habilita
# adjuntar una cuenta de servicio a una funcion es `iam.serviceAccounts.actAs`
# (lo trae `roles/iam.serviceAccountUser`), y NO se evalua sobre el proyecto
# sino SOBRE LA CUENTA DE SERVICIO, que es otro recurso. La herencia de IAM
# solo baja de ancestro a descendiente, y dos cuentas de servicio son
# HERMANAS: un `serviceAccountUser` concedido sobre la cuenta de computo por
# defecto NO alcanza a una cuenta dedicada. Sin este chequeo, la guarda del
# paso 1-bis deja pasar un deploy que falla A MITAD DE CAMINO, despues de
# haber pedido el numero del PR y la palabra DESPLEGAR — exactamente lo que
# esa guarda existe para evitar.
#
# La cuenta tampoco se cablea: sale del MISMO `__endpoint` del commit que se
# esta desplegando, igual que la lista de funciones. Si el codebase declara
# varias, se comprueban todas.
$cuentasRuntime = @($lectura.cuentas)
$cuentasPorParametro = @($lectura.porParametro)
$cuentasDesconocidas = @($lectura.desconocidas)

# ANTE UN CAMPO QUE NO SABEMOS LEER, PARAR. Si el `serviceAccountEmail` de un
# endpoint tiene una forma que esta lectura no reconoce, no se puede afirmar ni
# que hay cuenta dedicada ni que no la hay — y seguir seria desplegar con un
# chequeo que mira para otro lado.
if ($cuentasDesconocidas.Count -gt 0) {
  Remove-Item $tmp -Recurse -Force
  Abortar ("no se pudo leer la cuenta de runtime de estas funciones:`n" +
    '    ' + ($cuentasDesconocidas -join "`n    ") + "`n`n" +
    "Puede ser un cambio de forma del SDK (firebase-functions). Hasta que esta`n" +
    "lectura sepa clasificarlo, el chequeo del actAs no puede responder, y un`n" +
    "chequeo que no responde no debe dejar pasar un deploy.`n`n" +
    'QUE HACER: revisa el paso 2-bis de este script contra la version del SDK.')
}

# Lo que NO se puede verificar se DICE, no se omite: un chequeo que calla
# cuando no sabe da confianza falsa, que es peor que no tenerlo.
if ($cuentasPorParametro.Count -gt 0) {
  Write-Host ''
  Write-Host '*** CUENTA DE RUNTIME DEFINIDA POR PARAMETRO: NO VERIFICABLE AQUI ***' -ForegroundColor Red
  Write-Host ('    Funciones: ' + ($cuentasPorParametro -join ', ')) -ForegroundColor Yellow
  Write-Host '    Su serviceAccount es una Expression (defineString y cia.), no un correo:' -ForegroundColor Yellow
  Write-Host '    se resuelve al desplegar, asi que leyendo el artefacto no se sabe cual es.' -ForegroundColor Yellow
  Write-Host '    VERIFICA A MANO, con el correo real de esa cuenta:' -ForegroundColor Yellow
  Write-Host '        gcloud iam service-accounts get-iam-policy <SA> --project=neg-sst-app' -ForegroundColor Yellow
  Write-Host ("          (busca a $quien con roles/iam.serviceAccountUser)") -ForegroundColor Yellow
  Write-Host '        gcloud run services get-iam-policy <servicio> --region=<region> --project=neg-sst-app' -ForegroundColor Yellow
  Write-Host '          (si la funcion es programada, busca a la SA con roles/run.invoker)' -ForegroundColor Yellow
  Write-Host ''
}

if ($cuentasRuntime.Count -eq 0 -and $cuentasPorParametro.Count -eq 0) {
  Write-Host 'Cuenta de runtime: la de computo por defecto (el codigo no declara otra).' -ForegroundColor DarkGray
} elseif ($cuentasRuntime.Count -gt 0) {
  $verifActAs = Join-Path $tmp 'permisos-actas.js'
  ($PreludioToken + @'
const [, , ...cuentas] = process.argv
;(async () => {
  const token = await accessToken()
  const salida = []
  for (const sa of cuentas) {
    const url = 'https://iam.googleapis.com/v1/projects/-/serviceAccounts/' +
      encodeURIComponent(sa) + ':testIamPermissions'
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: ['iam.serviceAccounts.actAs'] }),
    })
    const j = await r.json()
    if (!r.ok) {
      salida.push({ sa, error: (j.error && j.error.status) || ('HTTP ' + r.status) })
      continue
    }
    salida.push({ sa, puede: (j.permissions || []).includes('iam.serviceAccounts.actAs') })
  }
  console.log(JSON.stringify(salida))
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1) })
'@) | Set-Content -Path $verifActAs -Encoding UTF8

  $actAsJson = & node $verifActAs $cuentasRuntime
  if ($LASTEXITCODE -ne 0) {
    Remove-Item $tmp -Recurse -Force
    Abortar ("no pude comprobar el actAs sobre la(s) cuenta(s) de runtime que declara el codigo: " +
      ($cuentasRuntime -join ', '))
  }
  foreach ($c in @($actAsJson | Out-String | ConvertFrom-Json)) {
    if ($c.error) {
      $pista = ''
      if ($c.error -eq 'NOT_FOUND') {
        $pista = "`nLa cuenta NO EXISTE todavia en el proyecto. Creala ANTES de desplegar este codebase:`n" +
          ("    gcloud iam service-accounts create {0} --project=neg-sst-app" -f ($c.sa -split '@')[0])
      }
      Remove-Item $tmp -Recurse -Force
      Abortar ("no pude leer los permisos sobre la cuenta de runtime $($c.sa): $($c.error).$pista")
    }
    if (-not $c.puede) {
      Remove-Item $tmp -Recurse -Force
      Abortar ("la cuenta $quien NO puede desplegar CON la cuenta de runtime $($c.sa).`n" +
        "Falta: iam.serviceAccounts.actAs SOBRE ESA CUENTA (no sobre el proyecto, no sobre otra cuenta).`n`n" +
        "QUE HACER (acto de IAM; lo ejecuta alguien con propiedad del proyecto):`n" +
        "    gcloud iam service-accounts add-iam-policy-binding $($c.sa) --member=user:$quien --role=roles/iam.serviceAccountUser --project=neg-sst-app`n`n" +
        'Sin eso el deploy fallaria DESPUES de pedirte el PR y la confirmacion, a mitad de camino.')
    }
    Write-Host ("OK: puedes desplegar con la cuenta de runtime $($c.sa).") -ForegroundColor Green
  }
}


# -- 2-ter. Permisos DE PROYECTO que dependen de lo que declara el codigo -----
# Dos permisos que el deploy usa, que NO estan en el chequeo base del paso
# 1-bis, y que solo se pueden pedir DESPUES del build porque dependen de lo que
# el codebase declara. Los dos se midieron contra la API de IAM, y los dos los
# tiene en su lista de ausencias `roles/cloudfunctions.developer`:
#
#  (a) `cloudscheduler.jobs.{get,create,update}` -- el job del horario NO lo crea
#      la funcion ni un agente de servicio: lo crea firebase-tools CON TU SESION
#      (`createOrReplaceJob` = un get, y luego create o update). Y `setTrigger`
#      corre en CREATE **y en UPDATE** (fabricator.js), asi que lo necesita todo
#      deploy de un codebase con horario, no solo el primero.
#      `cloudfunctions.developer` trae 226 permisos y NINGUNO de
#      `cloudscheduler.*`; `firebase.viewer` (298) tampoco.
#
#  (b) `run.services.setIamPolicy` -- el CLI concede el `run.invoker` SOBRE EL
#      SERVICIO a la cuenta de servicio que declara el codigo (rama
#      `isScheduleTriggered` de `createV2Function`, y la misma en
#      `updateV2Function`). Es decir: ese invoker NO hay que darlo a mano. Pero
#      para que el CLI pueda darlo, QUIEN DESPLIEGA tiene que poder ESCRIBIR la
#      politica del servicio, y `cloudfunctions.developer` solo trae
#      `run.services.get` y `run.services.getIamPolicy` -- leerla, no escribirla.
#      Sin ese permiso el deploy crea la funcion, revienta en `set invoker` (el
#      fallo se propaga, no se traga) y `setTrigger` nunca llega a crear el job:
#      queda funcion viva, sin invoker y sin horario.
#
# NINGUNO SE CABLEA: las dos condiciones salen del `__endpoint` del commit que se
# esta desplegando -- `scheduleTrigger` para (a), y para (b) las mismas ramas del
# invoker que usa el CLI. Un codebase de puras funciones de evento no paga ninguno.
$permisosDerivados = [ordered]@{}
if ($conHorario.Count -gt 0) {
  Write-Host ("Funciones PROGRAMADAS en este codebase: " + ($conHorario -join ', ')) -ForegroundColor DarkGray
  foreach ($p in @('cloudscheduler.jobs.get', 'cloudscheduler.jobs.create', 'cloudscheduler.jobs.update')) {
    $permisosDerivados[$p] = 'crear el horario de: ' + ($conHorario -join ', ')
  }
}
$conInvoker = @($lectura.conInvoker)
if ($conInvoker.Count -gt 0) {
  Write-Host ("Funciones a las que el CLI les pone invoker: " + ($conInvoker -join ', ')) -ForegroundColor DarkGray
  $permisosDerivados['run.services.setIamPolicy'] = 'que el CLI conceda el invoker de: ' + ($conInvoker -join ', ')
}

if ($permisosDerivados.Count -gt 0) {
  $verifDeriv = Join-Path $tmp 'permisos-derivados.js'
  ($PreludioToken + @'
const PERMISOS = process.argv.slice(2)
;(async () => {
  const token = await accessToken()
  const r = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects/neg-sst-app:testIamPermissions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: PERMISOS }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('testIamPermissions: ' + JSON.stringify(j).slice(0, 200))
  const tiene = j.permissions || []
  console.log(JSON.stringify({ faltan: PERMISOS.filter(p => !tiene.includes(p)) }))
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1) })
'@) | Set-Content -Path $verifDeriv -Encoding UTF8

  $derivJson = & node $verifDeriv @($permisosDerivados.Keys)
  if ($LASTEXITCODE -ne 0) {
    Remove-Item $tmp -Recurse -Force
    Abortar 'no pude comprobar los permisos que este codebase necesita por lo que declara (scheduler / invoker).'
  }
  $derivFaltan = @(($derivJson | Out-String | ConvertFrom-Json).faltan)
  if ($derivFaltan.Count -gt 0) {
    $rolDe = [ordered]@{}
    $detalle = ''
    foreach ($p in $derivFaltan) {
      $detalle += "    $p  ->  $($permisosDerivados[$p])`n"
      if ($p -like 'cloudscheduler.*') { $rolDe['roles/cloudscheduler.admin'] = $true }
      if ($p -eq 'run.services.setIamPolicy') { $rolDe['roles/run.admin'] = $true }
    }
    $comandos = ''
    foreach ($r in $rolDe.Keys) {
      $comandos += "    gcloud projects add-iam-policy-binding neg-sst-app --member=user:$quien --role=$r`n"
    }
    Remove-Item $tmp -Recurse -Force
    Abortar ("la cuenta $quien NO tiene todo lo que este codebase necesita para desplegarse.`n`n" +
      "PERMISOS QUE FALTAN, y para que los usa el deploy:`n" + $detalle + "`n" +
      "QUE HACER (acto de IAM; lo ejecuta alguien con propiedad del proyecto):`n" + $comandos + "`n" +
      "Sin esto el deploy NO se cae al principio: crea la funcion y revienta`n" +
      'despues, dejandola viva, sin invoker y sin horario.')
  }
  Write-Host 'OK: tienes los permisos de scheduler/invoker que este codebase necesita.' -ForegroundColor Green
}

# El PREFIJO del codebase (firebase.json) cambia el nombre DESPLEGADO:
# firebase-tools renombra cada endpoint a `<prefijo>-<export>` (applyPrefix).
# Sin esto, la comparacion contra prod veria "sobra lic-x / falta x" en cada
# corrida de un codebase con prefijo.
$prefijo = ''
if ($entrada.PSObject.Properties.Name -contains 'prefix' -and $entrada.prefix) { $prefijo = [string]$entrada.prefix }
if ($prefijo) {
  Write-Host ("Prefijo del codebase: '$prefijo' -> los nombres desplegados son '$prefijo-<export>'.") -ForegroundColor DarkGray
  $declaradas = @($declaradas | ForEach-Object { "$prefijo-$_" })
  Write-Host ("Declaradas con prefijo: " + ($declaradas -join ', '))
}

$nombresVivas = @($vivasCodebase | ForEach-Object { $_.nombre })
$soloProd = @($nombresVivas | Where-Object { $declaradas -notcontains $_ })
$nuevas = @($declaradas | Where-Object { $nombresVivas -notcontains $_ })
$actualizadas = @($declaradas | Where-Object { $nombresVivas -contains $_ })

Write-Host ''
Write-Host ("NUEVAS ({0}): {1}" -f $nuevas.Count, (($nuevas -join ', '))) -ForegroundColor Green
Write-Host ("ACTUALIZADAS ({0}): {1}" -f $actualizadas.Count, (($actualizadas -join ', ')))
if ($soloProd.Count -gt 0) {
  Write-Host ''
  Write-Host ("*** EN PROD Y NO DECLARADAS ({0}): {1}" -f $soloProd.Count, ($soloProd -join ', ')) -ForegroundColor Red
  Remove-Item $tmp -Recurse -Force
  Abortar ("el deploy de '$Codebase' BORRARIA esas funciones.`n" +
    "Esto pasa cuando main esta atras de lo desplegado, o cuando otro frente desplego algo que no esta en main.`n" +
    "QUE HACER: resuelve que main declare lo que esta vivo, y vuelve a correr.`n`n" +
    "RETIRAR UNA FUNCION A PROPOSITO NO SE HACE CON ESTE SCRIPT. Quitarla del`n" +
    "codigo y volver a correr tampoco sirve: la guarda vuelve a verla viva en`n" +
    "prod y sin declarar, y aborta igual. Es deliberado: un borrado es un acto`n" +
    "distinto de un despliegue, y este script nunca borra.`n`n" +
    "Por eso el paso 2-ter NO exige cloudscheduler.jobs.delete: ese permiso lo`n" +
    "necesitaria el camino de RETIRO (deleteScheduleV2 de firebase-tools propaga`n" +
    "el fallo), y quien construya ese camino tiene que traer su propio chequeo.`n" +
    '(Borde reportado por el frente SIGP sobre el commit 98dedbf.)')
}

# Commits que tocaron la carpeta del codebase desde el ultimo deploy registrado.
$ultimoCommitBitacora = ''
if (Test-Path $bitacora) {
  $lineas = Get-Content $bitacora
  for ($i = $lineas.Count - 1; $i -ge 0; $i--) {
    $l = $lineas[$i]
    if ($l -match ("^\|\s*[0-9]{4}-.*\|\s*" + [regex]::Escape($Codebase) + "\s*\|\s*([0-9a-f]{7,40})\s*\|")) {
      $ultimoCommitBitacora = $Matches[1]
      break
    }
  }
}
if ($ultimoCommitBitacora) {
  $existe = & git cat-file -e ("$ultimoCommitBitacora^{commit}") 2>$null
  if ($LASTEXITCODE -ne 0) { $ultimoCommitBitacora = '' }
}
if ($ultimoCommitBitacora) {
  $rango = "$ultimoCommitBitacora..HEAD"
  $pendientes = @(Git-Salida @('log', '--format=%h %cI %an %s', $rango, '--', $carpeta))
  Write-Host ''
  Write-Host ("Commits que tocaron '$carpeta' desde el ultimo deploy registrado ($ultimoCommitBitacora): {0}" -f $pendientes.Count) -ForegroundColor Yellow
  $pendientes | ForEach-Object { Write-Host "  $_" }
  if ($pendientes.Count -gt 1) {
    Write-Host 'ATENCION: hay MAS de un cambio pendiente — alguien mergeo y no desplego.' -ForegroundColor Red
    Write-Host 'Si alguno no es tuyo, cancela y coordina con ese frente antes de desplegar.' -ForegroundColor Red
  }
} else {
  Write-Host ''
  Write-Host "Sin deploy anterior registrado para '$Codebase' en la bitacora: este seria el primero." -ForegroundColor Yellow
}

if ($Simulacro) {
  Write-Host ''
  Write-Host 'SIMULACRO TERMINADO (pasos 1 a 4). No se desplego nada.' -ForegroundColor Yellow
  Write-Host '(en un deploy real aqui se pide el numero del PR — vacio aborta — y la palabra DESPLEGAR)' -ForegroundColor Yellow
  Remove-Item $tmp -Recurse -Force
  exit 0
}

# ═══ 5. PR, confirmacion y re-chequeo ══════════════════════════════════════
Paso '5/8' 'PR, confirmacion y re-chequeo de prod'

Write-Host ''
$prDeploy = (Read-Host 'PR(s) que se despliegan — numero(s), ej. 239 o "239, 241" (vacio ABORTA)').Trim()
if (-not $prDeploy) { Remove-Item $tmp -Recurse -Force; Abortar 'deploy sin PR declarado. Indica que PR(s) traen estas funciones y vuelve a correr.' }
if ($prDeploy -notmatch '^[#0-9,\s]+$') { Remove-Item $tmp -Recurse -Force; Abortar "'$prDeploy' no parece una lista de numeros de PR." }
$prDeploy = (($prDeploy -split '[,\s]+' | Where-Object { $_ } | ForEach-Object { '#' + ($_ -replace '^#', '') }) -join ' ')

Write-Host ''
Write-Host ("Se van a desplegar {0} funciones del codebase '{1}' desde main {2} ({3}) en {4}." -f $declaradas.Count, $Codebase, $commitCorto, $prDeploy, $Proyecto) -ForegroundColor Yellow
Write-Host ("  nuevas: {0}   actualizadas: {1}   borradas: 0" -f $nuevas.Count, $actualizadas.Count) -ForegroundColor Yellow
$resp = Read-Host 'Escribe DESPLEGAR para continuar (cualquier otra cosa cancela)'
if ($resp -cne 'DESPLEGAR') { Remove-Item $tmp -Recurse -Force; Abortar 'cancelado por el usuario.' }

# La verificacion y el deploy van en el MISMO acto (enmienda del 26-oct).
$prodRecheck = Leer-Prod
$vivasRecheck = @($prodRecheck.funciones | Where-Object { $_.codebase -eq $Codebase } | ForEach-Object { $_.nombre })
$cambio = @(Compare-Object -ReferenceObject @($nombresVivas) -DifferenceObject @($vivasRecheck))
if ($cambio.Count -gt 0) {
  Remove-Item $tmp -Recurse -Force
  Abortar "las funciones vivas del codebase CAMBIARON mientras esperabas la confirmacion. Vuelve a correr desde el paso 1."
}

# ═══ 6. Deploy ══════════════════════════════════════════════════════════════
Paso '6/8' "firebase deploy --only functions:$Codebase --project $Proyecto"
# NUNCA `--only functions` a secas: eso despliega todos los codebases.
& npx firebase deploy --only ("functions:" + $Codebase) --project $Proyecto
if ($LASTEXITCODE -ne 0) { Remove-Item $tmp -Recurse -Force; Abortar "firebase deploy fallo (codigo $LASTEXITCODE). Revisa el estado con -Simulacro." }

# ═══ 7. Post-verificacion ═══════════════════════════════════════════════════
Paso '7/8' 'Post-verificacion: todas las declaradas vivas y ACTIVE, ninguna de mas'
$prodPost = Leer-Prod
$postCodebase = @($prodPost.funciones | Where-Object { $_.codebase -eq $Codebase })
$postNombres = @($postCodebase | ForEach-Object { $_.nombre })
$faltan = @($declaradas | Where-Object { $postNombres -notcontains $_ })
$sobran = @($postNombres | Where-Object { $declaradas -notcontains $_ })
$noActivas = @($postCodebase | Where-Object { $_.estado -ne 'ACTIVE' })

$verificado = ($faltan.Count -eq 0 -and $sobran.Count -eq 0 -and $noActivas.Count -eq 0)
foreach ($f in $postCodebase) {
  Write-Host ("  {0}  (gen {1}, {2}, actualizada {3})" -f $f.nombre, $f.gen, $f.estado, $f.actualizada)
}
if ($verificado) {
  Write-Host ("OK: las {0} funciones declaradas estan vivas y ACTIVE, y no hay ninguna de mas." -f $declaradas.Count) -ForegroundColor Green
} else {
  Write-Host '*** POST-VERIFICACION FALLIDA ***' -ForegroundColor Red
  if ($faltan.Count -gt 0) { Write-Host ("    faltan en prod: " + ($faltan -join ', ')) -ForegroundColor Red }
  if ($sobran.Count -gt 0) { Write-Host ("    sobran en prod: " + ($sobran -join ', ')) -ForegroundColor Red }
  if ($noActivas.Count -gt 0) { Write-Host ("    no ACTIVE: " + (($noActivas | ForEach-Object { $_.nombre + '=' + $_.estado }) -join ', ')) -ForegroundColor Red }
  Write-Host '    Revisa de inmediato: puede que el deploy quedara a medias.' -ForegroundColor Red
}

# ═══ 8. Bitacora ════════════════════════════════════════════════════════════
Paso '8/8' "Bitacora $bitacoraRel"
if (-not (Test-Path $bitacora)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $bitacora) | Out-Null
  $enc = "# Bitacora de despliegues de Cloud Functions`n`nUna linea por deploy, escrita por scripts/deploy-funciones.ps1.`nEl deploy de reglas tiene su propia bitacora (docs/bitacora-deploys.md): son dos`nartefactos distintos y mezclarlos haria mentir a las dos tablas.`n`n| Fecha (UTC) | Codebase | Commit | PR(s) | Funciones | Nuevas | Quien | Post-verificacion |`n|---|---|---|---|---|---|---|---|`n"
  [System.IO.File]::WriteAllText($bitacora, $enc, (New-Object System.Text.UTF8Encoding($false)))
}
$fechaUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$estado = if ($verificado) { 'OK' } else { 'FALLIDA' }
$listaNuevas = if ($nuevas.Count -gt 0) { ($nuevas -join ' ') } else { '-' }
# La cuenta es siempre nominal: el veto de arriba no deja llegar aqui de otro
# modo, asi que la columna responde QUIEN desplego sin salvedades.
$fila = "| $fechaUtc | $Codebase | $commitCorto | $prDeploy | $($declaradas.Count) | $listaNuevas | $quien | $estado |"
[System.IO.File]::AppendAllText($bitacora, $fila + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host $fila

$msgCommit = "docs: bitacora deploy de funciones $Codebase $commitCorto ($prDeploy)"
& git add -- $bitacoraRel
$okBitacora = ($LASTEXITCODE -eq 0)
if ($okBitacora) { & git commit --quiet -m $msgCommit; $okBitacora = ($LASTEXITCODE -eq 0) }
if ($okBitacora) { & git push --quiet origin main; $okBitacora = ($LASTEXITCODE -eq 0) }
if ($okBitacora) {
  Write-Host "Bitacora commiteada y empujada a origin/main: $msgCommit" -ForegroundColor Green
} else {
  Write-Host '*** LA BITACORA NO QUEDO COMMITEADA/EMPUJADA. ***' -ForegroundColor Red
  Write-Host "    El deploy SI se hizo. Empuja la linea a mano:" -ForegroundColor Red
  Write-Host "      git add $bitacoraRel && git commit && git push" -ForegroundColor Red
  Write-Host '    El proximo deploy ABORTARA en el arranque hasta resolverlo.' -ForegroundColor Red
}

Remove-Item $tmp -Recurse -Force
if (-not $verificado) { exit 2 }
if (-not $okBitacora) { exit 3 }
Write-Host ''
Write-Host "Deploy de funciones ($Codebase) completo, verificado y registrado." -ForegroundColor Green
exit 0
