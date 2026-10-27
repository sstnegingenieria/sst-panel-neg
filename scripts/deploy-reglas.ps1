<#
.SYNOPSIS
  UNICO camino para desplegar firestore.rules a produccion (neg-sst-app).

.DESCRIPTION
  Existe por el incidente del 26-oct-2026: un deploy desde una rama con base
  vieja PISO el gate SST de asignaciones que llevaba 24 minutos en produccion.
  Un deploy de reglas reemplaza el ruleset COMPLETO: si el archivo local no
  contiene lo que ya esta vivo, el deploy no queda incompleto, BORRA.

  Pasos (cualquier fallo aborta SIN desplegar):
    1. Rama = main, sin cambios sin commit, HEAD == origin/main tras git fetch.
    2. Baja el ruleset vigente de prod (cloud.firestore) por la API de reglas.
    3. Normaliza CRLF/LF y compara. Si prod contiene algo que main NUNCA tuvo
       (prod "va adelante"), ABORTA y muestra las lineas.
    4. Muestra el diff local vs prod y exige escribir DESPLEGAR.
    5. firebase deploy --only firestore:rules --project neg-sst-app
    6. Vuelve a bajar prod y verifica byte-identico (normalizado) al local.
    7. Escribe una linea en docs/bitacora-deploys.md.
  -Simulacro hace 1 a 4 y se detiene (solo lectura).

  Regla del paso 3: prod debe ser una VERSION ANTERIOR de main (el ruleset
  vigente coincide con firestore.rules en algun commit del historial de HEAD).
  Un diff de lineas "solo en prod" no sirve por si solo: un cambio legitimo de
  una lista de roles tambien deja una linea vieja que main ya no tiene.

.PARAMETER Simulacro
  Hace los pasos 1 a 4 y se detiene. No despliega ni escribe nada en el repo.

.PARAMETER ProdDesde
  SOLO PRUEBAS, y SOLO con -Simulacro: usa este archivo como si fuera el
  ruleset vigente de prod (en vez de bajarlo). Con esto se reproduce, por
  ejemplo, el incidente del 26-oct sin tocar produccion.
#>
[CmdletBinding()]
param(
  [switch]$Simulacro,
  [string]$ProdDesde
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Proyecto = 'neg-sst-app'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

function Abortar([string]$msg) {
  Write-Host ''
  Write-Host "ABORTADO: $msg" -ForegroundColor Red
  Write-Host 'No se desplego nada.' -ForegroundColor Red
  exit 1
}
function Paso([string]$n, [string]$t) { Write-Host ''; Write-Host "[$n] $t" -ForegroundColor Cyan }

# ── utilidades de normalizacion / hash ──────────────────────────────────────
function Normalizar([string]$texto) { return ($texto -replace "`r`n", "`n") }
function Leer-Normalizado([string]$ruta) {
  return Normalizar ([System.IO.File]::ReadAllText($ruta, [System.Text.Encoding]::UTF8))
}
function Hash-Texto([string]$texto) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($texto)
  return ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLower()
}
function Git-Salida([string[]]$argumentos) {
  $r = & git @argumentos
  if ($LASTEXITCODE -ne 0) { Abortar "git $($argumentos -join ' ') fallo (codigo $LASTEXITCODE)." }
  return $r
}

if ($ProdDesde -and -not $Simulacro) { Abortar '-ProdDesde solo se admite junto con -Simulacro (es una semilla de pruebas).' }

Write-Host '=== deploy-reglas.ps1 ===' -ForegroundColor White
if ($Simulacro) { Write-Host 'MODO SIMULACRO: solo lectura, no se despliega.' -ForegroundColor Yellow }
Write-Host "Repo: $RepoRoot"

# ═══ 1. Estado de git ═══════════════════════════════════════════════════════
Paso '1/8' 'Rama, cambios sin commit y HEAD == origin/main'
$rama = (Git-Salida @('branch', '--show-current') | Out-String).Trim()
if ($rama -ne 'main') { Abortar "la rama actual es '$rama'; solo se despliega desde main." }

# Solo archivos RASTREADOS (un archivo sin rastrear no cambia firestore.rules).
# docs/bitacora-deploys.md se exime: el propio script lo modifica tras cada deploy.
$sucios = Git-Salida @('status', '--porcelain', '--untracked-files=no', '--', '.', ':(exclude)docs/bitacora-deploys.md')
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

$archivoLocal = Join-Path $RepoRoot 'firestore.rules'
if (-not (Test-Path $archivoLocal)) { Abortar 'no existe firestore.rules en la raiz del repo.' }
$localNorm = Leer-Normalizado $archivoLocal
$hashLocal = Hash-Texto $localNorm

# ═══ 2. Ruleset vigente de prod ═════════════════════════════════════════════
$tmp = Join-Path $env:TEMP ("deploy-reglas-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$lector = Join-Path $tmp 'leer-ruleset.js'

# Lector de la API de reglas (firebase-admin ya instalado en functions/; sin dependencias nuevas).
@'
const fs = require('fs')
const [, , adminPath, credPath, salida] = process.argv
const a = require(adminPath)
const cred = a.credential.cert(JSON.parse(fs.readFileSync(credPath, 'utf8')))
const P = 'projects/neg-sst-app'
;(async () => {
  const { access_token } = await cred.getAccessToken()
  const h = { Authorization: 'Bearer ' + access_token }
  const rel = await (await fetch('https://firebaserules.googleapis.com/v1/' + P + '/releases/cloud.firestore', { headers: h })).json()
  if (!rel.rulesetName) throw new Error('sin release cloud.firestore: ' + JSON.stringify(rel).slice(0, 300))
  const rs = await (await fetch('https://firebaserules.googleapis.com/v1/' + rel.rulesetName, { headers: h })).json()
  const f = ((rs.source || {}).files || []).find(x => x.name === 'firestore.rules')
  if (!f) throw new Error('el ruleset vigente no trae firestore.rules')
  fs.writeFileSync(salida, f.content, 'utf8')
  console.log(JSON.stringify({ id: rel.rulesetName.split('/').pop(), liberado: rel.updateTime, creado: rs.createTime }))
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1) })
'@ | Set-Content -Path $lector -Encoding UTF8

function Resolver-Admin {
  $c = @(
    (Join-Path $RepoRoot 'functions\node_modules\firebase-admin'),
    (Join-Path (Split-Path $RepoRoot -Parent) 'sst-panel-web\functions\node_modules\firebase-admin')
  )
  foreach ($x in $c) { if (Test-Path $x) { return $x } }
  Abortar 'no encuentro firebase-admin (npm install en functions/).'
}
function Resolver-Credencial {
  if ($env:GOOGLE_APPLICATION_CREDENTIALS -and (Test-Path $env:GOOGLE_APPLICATION_CREDENTIALS)) { return $env:GOOGLE_APPLICATION_CREDENTIALS }
  $c = Join-Path (Split-Path $RepoRoot -Parent) '_credenciales\neg-sst-app-adminsdk.json'
  if (Test-Path $c) { return $c }
  Abortar 'no encuentro la credencial de lectura (GOOGLE_APPLICATION_CREDENTIALS o ..\_credenciales\neg-sst-app-adminsdk.json).'
}
function Bajar-Prod([string]$destino) {
  $json = & node $lector (Resolver-Admin) (Resolver-Credencial) $destino
  if ($LASTEXITCODE -ne 0) { Abortar 'no pude leer el ruleset vigente de prod por la API de reglas.' }
  return ($json | Out-String | ConvertFrom-Json)
}

Paso '2/8' 'Ruleset vigente de prod (cloud.firestore)'
$archivoProd = Join-Path $tmp 'prod.rules'
if ($ProdDesde) {
  if (-not (Test-Path $ProdDesde)) { Abortar "-ProdDesde: no existe $ProdDesde" }
  Copy-Item $ProdDesde $archivoProd
  $prodAntes = [pscustomobject]@{ id = '(semilla -ProdDesde)'; liberado = '-'; creado = '-' }
  Write-Host "SEMILLA DE PRUEBA: se usa $ProdDesde como si fuera prod." -ForegroundColor Yellow
} else {
  $prodAntes = Bajar-Prod $archivoProd
}
$prodNorm = Leer-Normalizado $archivoProd
$hashProd = Hash-Texto $prodNorm
Write-Host ("Ruleset vigente: {0}  (liberado {1})" -f $prodAntes.id, $prodAntes.liberado)
Write-Host ("sha256 prod  (normalizado): {0}  [{1:N0} bytes]" -f $hashProd.Substring(0, 16), [Text.Encoding]::UTF8.GetByteCount($prodNorm))
Write-Host ("sha256 local (normalizado): {0}  [{1:N0} bytes]" -f $hashLocal.Substring(0, 16), [Text.Encoding]::UTF8.GetByteCount($localNorm))

# ═══ 3. ¿Prod va adelante? ══════════════════════════════════════════════════
Paso '3/8' 'Comparacion: prod debe ser una version ANTERIOR de main'
if ($hashProd -eq $hashLocal) {
  Write-Host 'Prod ya es byte-identico (normalizado) al firestore.rules local. No hay nada que desplegar.' -ForegroundColor Green
  Remove-Item $tmp -Recurse -Force
  exit 0
}

# ¿Algun commit del historial de HEAD tuvo exactamente el archivo que esta vivo?
$coincide = $null
foreach ($c in (Git-Salida @('rev-list', 'HEAD', '--', 'firestore.rules'))) {
  $contenido = & git show "${c}:firestore.rules"
  if ($LASTEXITCODE -ne 0) { continue }
  if ((Hash-Texto (Normalizar (($contenido -join "`n") + "`n"))) -eq $hashProd) { $coincide = $c; break }
}
if (-not $coincide) {
  # Variante: el archivo termina sin salto final
  foreach ($c in (Git-Salida @('rev-list', 'HEAD', '--', 'firestore.rules'))) {
    $contenido = & git show "${c}:firestore.rules"
    if ($LASTEXITCODE -ne 0) { continue }
    if ((Hash-Texto (Normalizar ($contenido -join "`n"))) -eq $hashProd) { $coincide = $c; break }
  }
}

if (-not $coincide) {
  Write-Host ''
  Write-Host 'PROD CONTIENE ALGO QUE MAIN NUNCA TUVO (prod va adelante / divergente).' -ForegroundColor Red
  Write-Host 'Este es el caso del incidente del 26-oct: desplegar ahora BORRARIA lo que esta vivo.' -ForegroundColor Red
  # Lineas (no vacias) que estan en prod y en NINGUNA parte del archivo local
  $enLocal = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($l in ($localNorm -split "`n")) { [void]$enLocal.Add($l.Trim()) }
  $soloProd = New-Object System.Collections.Generic.List[string]
  $n = 0
  foreach ($l in ($prodNorm -split "`n")) {
    $n++
    $t = $l.Trim()
    if ($t -ne '' -and -not $enLocal.Contains($t)) { $soloProd.Add(("{0,5}: {1}" -f $n, $l)) }
  }
  Write-Host ''
  Write-Host ("Lineas presentes en prod y ausentes del archivo local: {0}" -f $soloProd.Count) -ForegroundColor Red
  $soloProd | Select-Object -First 80 | ForEach-Object { Write-Host "  prod> $_" -ForegroundColor Red }
  if ($soloProd.Count -gt 80) { Write-Host "  ... y $($soloProd.Count - 80) lineas mas." -ForegroundColor Red }
  Write-Host ''
  Write-Host 'Diff completo (- = solo prod, + = solo local):' -ForegroundColor Yellow
  $pn = Join-Path $tmp 'prod.norm.rules'; $ln = Join-Path $tmp 'local.norm.rules'
  [System.IO.File]::WriteAllText($pn, $prodNorm, (New-Object System.Text.UTF8Encoding($false)))
  [System.IO.File]::WriteAllText($ln, $localNorm, (New-Object System.Text.UTF8Encoding($false)))
  & git --no-pager diff --no-index --no-color --stat -- $pn $ln
  Remove-Item $tmp -Recurse -Force
  Abortar 'prod no es una version anterior de main. Resuelve primero que bloques son de quien (reunificar en main) y vuelve a correr.'
}
$infoCommit = (Git-Salida @('log', '-1', '--format=%h %cI %s', $coincide) | Out-String).Trim()
Write-Host "OK: el ruleset vigente es el firestore.rules de main en el commit: $infoCommit" -ForegroundColor Green
Write-Host '(prod esta ATRAS de main; desplegar solo agrega lo que main ya tiene)' -ForegroundColor Green

# ═══ 4. Diff y confirmacion ═════════════════════════════════════════════════
Paso '4/8' 'Diff local (main) vs prod'
$pn = Join-Path $tmp 'prod.norm.rules'; $ln = Join-Path $tmp 'local.norm.rules'
[System.IO.File]::WriteAllText($pn, $prodNorm, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($ln, $localNorm, (New-Object System.Text.UTF8Encoding($false)))
& git --no-pager diff --no-index --no-color --stat -- $pn $ln
Write-Host ''
$diff = & git --no-pager diff --no-index --no-color -U3 -- $pn $ln
foreach ($linea in $diff) {
  if ($linea.StartsWith('+') -and -not $linea.StartsWith('+++')) { Write-Host $linea -ForegroundColor Green }
  elseif ($linea.StartsWith('-') -and -not $linea.StartsWith('---')) { Write-Host $linea -ForegroundColor Red }
  else { Write-Host $linea }
}

if ($Simulacro) {
  Write-Host ''
  Write-Host 'SIMULACRO TERMINADO (pasos 1 a 4). No se desplego nada.' -ForegroundColor Yellow
  Remove-Item $tmp -Recurse -Force
  exit 0
}

Write-Host ''
Write-Host "Se va a REEMPLAZAR el ruleset vigente ($($prodAntes.id)) por el de main $commitCorto en el proyecto $Proyecto." -ForegroundColor Yellow
$resp = Read-Host 'Escribe DESPLEGAR para continuar (cualquier otra cosa cancela)'
if ($resp -cne 'DESPLEGAR') { Remove-Item $tmp -Recurse -Force; Abortar 'cancelado por el usuario.' }

# Reconfirma que nadie desplego durante la espera (enmienda 26-oct: la verificacion
# y el deploy van en el MISMO acto).
$archivoProd2 = Join-Path $tmp 'prod2.rules'
$prodRecheck = Bajar-Prod $archivoProd2
if ((Hash-Texto (Leer-Normalizado $archivoProd2)) -ne $hashProd) {
  Remove-Item $tmp -Recurse -Force
  Abortar "prod CAMBIO mientras esperabas la confirmacion (ahora $($prodRecheck.id)). Vuelve a correr desde el paso 1."
}

# ═══ 5. Deploy ══════════════════════════════════════════════════════════════
Paso '5/8' "firebase deploy --only firestore:rules --project $Proyecto"
if ($env:GOOGLE_APPLICATION_CREDENTIALS) {
  Write-Host "AVISO: GOOGLE_APPLICATION_CREDENTIALS esta definida; el deploy saldra con esa cuenta de servicio ($env:GOOGLE_APPLICATION_CREDENTIALS)." -ForegroundColor Yellow
}
& npx firebase deploy --only firestore:rules --project $Proyecto
if ($LASTEXITCODE -ne 0) { Remove-Item $tmp -Recurse -Force; Abortar "firebase deploy fallo (codigo $LASTEXITCODE). Revisa el estado de prod con -Simulacro." }

# ═══ 6. Post-verificacion ═══════════════════════════════════════════════════
Paso '6/8' 'Post-verificacion: prod debe quedar byte-identico (normalizado) al local'
$archivoPost = Join-Path $tmp 'post.rules'
$prodDespues = Bajar-Prod $archivoPost
$hashPost = Hash-Texto (Leer-Normalizado $archivoPost)
$verificado = ($hashPost -eq $hashLocal)
if ($verificado) {
  Write-Host ("OK: ruleset {0} byte-identico al local (sha256 {1})." -f $prodDespues.id, $hashLocal.Substring(0, 16)) -ForegroundColor Green
} else {
  Write-Host '*** POST-VERIFICACION FALLIDA: prod NO es identico al archivo local. ***' -ForegroundColor Red
  Write-Host ("    prod ahora: {0}  sha256 {1}" -f $prodDespues.id, $hashPost.Substring(0, 16)) -ForegroundColor Red
  Write-Host ("    local:      sha256 {0}" -f $hashLocal.Substring(0, 16)) -ForegroundColor Red
  Write-Host '    Revisa de inmediato: puede que otra persona haya desplegado en el medio. Rollback: re-apuntar el release al ruleset anterior.' -ForegroundColor Red
}

# ═══ 7. Bitacora ════════════════════════════════════════════════════════════
Paso '7/8' 'Bitacora docs/bitacora-deploys.md'
$bitacora = Join-Path $RepoRoot 'docs\bitacora-deploys.md'
if (-not (Test-Path $bitacora)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $bitacora) | Out-Null
  $enc = "# Bitacora de despliegues de firestore.rules`n`nUna linea por deploy, escrita por scripts/deploy-reglas.ps1.`n`n| Fecha (UTC) | Commit | Ruleset nuevo | Ruleset anterior | Quien | Post-verificacion |`n|---|---|---|---|---|---|`n"
  [System.IO.File]::WriteAllText($bitacora, $enc, (New-Object System.Text.UTF8Encoding($false)))
}
$quien = (& git config user.name | Out-String).Trim()
if (-not $quien) { $quien = '(git config user.name vacio)' }
$fechaUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$estado = if ($verificado) { 'byte-identica' } else { 'FALLIDA' }
$fila = "| $fechaUtc | $commitCorto | $($prodDespues.id) | $($prodAntes.id) | $quien | $estado |"
[System.IO.File]::AppendAllText($bitacora, $fila + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host $fila
Write-Host 'Linea agregada. Commitea docs/bitacora-deploys.md con tu proximo cambio (el chequeo de "arbol limpio" la exime).'

Paso '8/8' 'Fin'
Remove-Item $tmp -Recurse -Force
if (-not $verificado) { exit 2 }
Write-Host 'Deploy de reglas completo y verificado.' -ForegroundColor Green
exit 0
