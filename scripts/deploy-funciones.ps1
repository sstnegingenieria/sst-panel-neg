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
  Abortar ("la sesion activa es la CUENTA COMPARTIDA ($quien).`n" +
    "El acuerdo de los tres frentes es sesion de persona: login -> deploy -> logout.`n" +
    "QUE HACER:`n" +
    "    npx firebase logout`n" +
    "    npx firebase login        (con TU cuenta)`n" +
    'y vuelve a correr el script.')
}
Write-Host "Sesion de Firebase: $quien" -ForegroundColor Green

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
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'neg-sst-app'
const m = require(entry)
const nombres = []
const sinEndpoint = []
for (const k of Object.keys(m)) {
  const v = m[k]
  if (v && v.__endpoint) { nombres.push(k); continue }
  if (typeof v === 'function' || (v && typeof v === 'object')) sinEndpoint.push(k)
}
console.log(JSON.stringify({ nombres, sinEndpoint }))
'@ | Set-Content -Path $lectorExports -Encoding UTF8

$declaradasJson = & node $lectorExports $entryAbs
if ($LASTEXITCODE -ne 0) { Remove-Item $tmp -Recurse -Force; Abortar "no pude leer los exports de $carpeta/$entry." }
$lectura = ($declaradasJson | Out-String | ConvertFrom-Json)
$declaradas = @($lectura.nombres)
$sinEndpoint = @($lectura.sinEndpoint)
if ($sinEndpoint.Count -gt 0) {
  Write-Host ("Exports que NO son funciones desplegables (se ignoran): " + ($sinEndpoint -join ', ')) -ForegroundColor Yellow
}
if ($declaradas.Count -eq 0) { Remove-Item $tmp -Recurse -Force; Abortar "$carpeta/$entry no exporta ninguna funcion. Un deploy asi BORRARIA todo el codebase." }
Write-Host ("Declaradas por el codigo ({0}): {1}" -f $declaradas.Count, ($declaradas -join ', '))

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
    'Resuelve primero que main declare lo que esta vivo (o retira esas funciones a proposito, en un PR) y vuelve a correr.')
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
