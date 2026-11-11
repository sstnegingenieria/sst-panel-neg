<#
.SYNOPSIS
  Prueba los chequeos de IAM de `deploy-funciones.ps1` SIN desplegar y SIN
  necesitar permisos reales. Ejercita el CAMINO FELIZ, no solo los de error.

.DESCRIPTION
  POR QUE EXISTE. El 11-nov-2026 el simulacro del radar aborto en el camino
  feliz del chequeo del actAs: el emisor en Node devolvia `{ sa, error }` al
  fallar y `{ sa, puede }` al salir bien, y el lado PowerShell leia `$c.error`
  siempre. Con `Set-StrictMode -Version Latest`, leer una propiedad que no
  existe LANZA. El chequeo funcionaba exactamente en el camino que se habia
  probado -el de error- y reventaba en el otro.

  "Un simulacro que solo se prueba cuando falta un permiso es un simulacro
  probado a medias."

  COMO LO PRUEBA. No copia el codigo: lo EXTRAE del propio
  `deploy-funciones.ps1` y lo corre. Una copia envejeceria en silencio el dia
  que alguien toque el script -el mismo defecto de dos nacimientos que este
  proyecto viene corrigiendo-.

  Lo UNICO que se sustituye es la frontera: el prologo del token (que en el
  script real cambia el refresh token de firebase-tools por un access token) se
  reemplaza por uno que devuelve un token falso y ADEMAS intercepta `fetch`
  para responder lo que pida cada escenario. La clasificacion, las ramas, los
  abortos y los mensajes son el codigo real.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\pruebas\prueba-chequeos-iam.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Guardia = Join-Path $RepoRoot 'scripts\deploy-funciones.ps1'
if (-not (Test-Path $Guardia)) { throw "no encuentro $Guardia" }

# -- El tramo de chequeos de IAM, extraido del script real -------------------
# Desde el paso 2-bis (actAs sobre la cuenta de runtime) hasta justo antes del
# bloque del PREFIJO, que ya no es IAM. Cubre 2-bis y 2-ter completos.
$lineas = Get-Content -LiteralPath $Guardia
$m1 = $lineas | Select-String -SimpleMatch -Pattern '2-bis. ' | Select-Object -First 1
$m2 = $lineas | Select-String -SimpleMatch -Pattern '# El PREFIJO del codebase' | Select-Object -First 1
if ($null -eq $m1 -or $null -eq $m2) { throw 'no pude ubicar el tramo de chequeos en el script' }
$ini = [int]$m1.LineNumber
$fin = [int]$m2.LineNumber
if ($fin -le $ini) { throw "tramo invalido (ini=$ini fin=$fin)" }
$Tramo = ($lineas[($ini - 1)..($fin - 2)]) -join [Environment]::NewLine
Write-Host ("Tramo extraido de deploy-funciones.ps1: lineas {0}-{1}" -f $ini, ($fin - 1)) -ForegroundColor DarkGray

# Las dos notas del remedio de IAM se definen ARRIBA en el script, fuera del
# tramo, y los abortos las usan. Se extraen tambien -no se copian- para que
# cambiarlas en el script no deje esta prueba mintiendo.
$n1 = $lineas | Select-String -SimpleMatch -Pattern '$NotaModeloIam =' | Select-Object -First 1
$n2 = $lineas | Select-String -SimpleMatch -Pattern 'docs/radar-cuenta-de-servicio.md.' | Select-Object -First 1
if ($null -eq $n1 -or $null -eq $n2) { throw 'no pude ubicar las notas del remedio de IAM' }
$Notas = ($lineas[([int]$n1.LineNumber - 1)..([int]$n2.LineNumber - 1)]) -join [Environment]::NewLine
Write-Host ("Notas del remedio extraidas: lineas {0}-{1}" -f $n1.LineNumber, $n2.LineNumber) -ForegroundColor DarkGray

$PERM_PROY_OK = "'cloudscheduler.jobs.get','cloudscheduler.jobs.create','cloudscheduler.jobs.update','run.services.setIamPolicy'"

$escenarios = @(
  [ordered]@{
    nombre = 'CAMINO FELIZ: actAs concedido y permisos de proyecto completos'
    actAsOk = $true
    actAsPerm = "'iam.serviceAccounts.actAs'"
    actAsEstado = ''
    proyPerm = $PERM_PROY_OK
    codigo = 0
    espera = @(
      'OK: puedes desplegar con la cuenta de runtime radar-secop@neg-sst-app.iam.gserviceaccount.com',
      'OK: tienes los permisos de scheduler/invoker',
      'TRAMO COMPLETO SIN ABORTAR'
    )
    # Marcador distintivo: un '*ABORTA*' a secas tambien casa con "SIN ABORTAR".
    noEspera = @('>>> ABORTO <<<')
  },
  [ordered]@{
    nombre = 'actAs NEGADO sobre la cuenta de runtime'
    actAsOk = $true
    actAsPerm = ''
    actAsEstado = ''
    proyPerm = $PERM_PROY_OK
    codigo = 9
    espera = @(
      'Falta: iam.serviceAccounts.actAs SOBRE ESA CUENTA',
      'gcloud iam service-accounts add-iam-policy-binding radar-secop@neg-sst-app.iam.gserviceaccount.com'
    )
    noEspera = @('TRAMO COMPLETO')
  },
  [ordered]@{
    nombre = 'la cuenta de runtime NO EXISTE todavia (NOT_FOUND)'
    actAsOk = $false
    actAsPerm = ''
    actAsEstado = 'NOT_FOUND'
    proyPerm = $PERM_PROY_OK
    codigo = 9
    espera = @(
      'La cuenta NO EXISTE todavia en el proyecto',
      'gcloud iam service-accounts create radar-secop'
    )
    noEspera = @('TRAMO COMPLETO')
  },
  [ordered]@{
    nombre = 'faltan los permisos de scheduler y de invoker'
    actAsOk = $true
    actAsPerm = "'iam.serviceAccounts.actAs'"
    actAsEstado = ''
    proyPerm = ''
    codigo = 9
    espera = @(
      'cloudscheduler.jobs.create  ->  crear el horario de',
      'run.services.setIamPolicy  ->  que el CLI conceda el invoker de',
      '--role=roles/cloudscheduler.admin',
      '--role=roles/run.admin'
    )
    noEspera = @('TRAMO COMPLETO')
  }
)

# Lo que el lector de exports devuelve para el codebase `radar` REAL:
# dos programadas, una cuenta de runtime dedicada.
$LecturaRadar = '{ "nombres": ["ingerirRadarSecopManana","ingerirRadarSecopTarde"], "sinEndpoint": [], "cuentas": ["radar-secop@neg-sst-app.iam.gserviceaccount.com"], "porParametro": [], "desconocidas": [], "conHorario": ["ingerirRadarSecopManana","ingerirRadarSecopTarde"], "conInvoker": ["ingerirRadarSecopManana","ingerirRadarSecopTarde"] }'

$tmpRaiz = Join-Path $env:TEMP ('prueba-iam-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmpRaiz | Out-Null
$fallos = 0
$n = 0

foreach ($esc in $escenarios) {
  $n++
  Write-Host ''
  Write-Host ("-- [{0}/{1}] {2}" -f $n, $escenarios.Count, $esc.nombre) -ForegroundColor Cyan

  $sufijo = [Guid]::NewGuid().ToString('N').Substring(0, 6)
  $okJs = if ($esc.actAsOk) { 'true' } else { 'false' }
  $estado = if ($esc.actAsEstado) { $esc.actAsEstado } else { 'PERMISSION_DENIED' }

  # El prologo falso va en su propio archivo y el guion lo LEE: asi no hay que
  # generar here-strings dentro de codigo generado.
  $prologo = Join-Path $tmpRaiz ("prologo-$sufijo.js")
  $lineasProlog = @(
    '// PROLOGO DE PRUEBA: token falso y fetch interceptado. Lo que sigue en',
    '// cada verificador es el codigo real del script.',
    "async function accessToken() { return 'token-de-prueba' }",
    "const ACT_AS_OK = $okJs",
    "const ACT_AS_PERMISOS = [$($esc.actAsPerm)]",
    "const ACT_AS_ESTADO = '$estado'",
    "const PROYECTO_PERMISOS = [$($esc.proyPerm)]",
    'globalThis.fetch = async (url) => {',
    '  const u = String(url)',
    "  if (u.includes('iam.googleapis.com') && u.includes('serviceAccounts')) {",
    '    if (!ACT_AS_OK) {',
    '      return { ok: false, status: 403, json: async () => ({ error: { status: ACT_AS_ESTADO } }) }',
    '    }',
    '    return { ok: true, status: 200, json: async () => ({ permissions: ACT_AS_PERMISOS }) }',
    '  }',
    "  if (u.includes('cloudresourcemanager.googleapis.com')) {",
    '    return { ok: true, status: 200, json: async () => ({ permissions: PROYECTO_PERMISOS }) }',
    '  }',
    "  throw new Error('la prueba no esperaba esta URL: ' + u)",
    '}'
  )
  # SIN BOM, y el script lo concatena con su heredoc antes de volver a
  # escribirlo con `Set-Content -Encoding UTF8` (que SI pone BOM). Con BOM aqui,
  # el archivo final queda con BOM + U+FEFF suelto: node strippea solo el
  # primero y el segundo es un caracter ilegal.
  [System.IO.File]::WriteAllText(
    $prologo,
    (($lineasProlog -join [Environment]::NewLine) + [Environment]::NewLine),
    (New-Object System.Text.UTF8Encoding($false)))

  $lecturaArch = Join-Path $tmpRaiz ("lectura-$sufijo.json")
  Set-Content -LiteralPath $lecturaArch -Value $LecturaRadar -Encoding UTF8

  $cabecera = @(
    'Set-StrictMode -Version Latest',
    '$ErrorActionPreference = ''Stop''',
    'function Abortar([string]$msg) {',
    '  Write-Host ''''',
    '  Write-Host ''>>> ABORTO <<<'' -ForegroundColor Red',
    '  Write-Host $msg',
    '  exit 9',
    '}',
    '$quien = ''giovanny.montes@negingenieria.com''',
    '$tmp = Join-Path $env:TEMP (''iam-'' + [Guid]::NewGuid().ToString(''N'').Substring(0, 8))',
    'New-Item -ItemType Directory -Path $tmp | Out-Null',
    "`$lectura = (Get-Content -Raw -LiteralPath '$lecturaArch' | ConvertFrom-Json)",
    "`$PreludioToken = (Get-Content -Raw -LiteralPath '$prologo')"
  ) -join [Environment]::NewLine

  $cola = @(
    '',
    'Write-Host ''TRAMO COMPLETO SIN ABORTAR''',
    'Remove-Item $tmp -Recurse -Force',
    'exit 0'
  ) -join [Environment]::NewLine

  $guion = Join-Path $tmpRaiz ("esc-$sufijo.ps1")
  Set-Content -LiteralPath $guion -Encoding UTF8 -Value (
    $cabecera + [Environment]::NewLine + [Environment]::NewLine +
    $Notas + [Environment]::NewLine + [Environment]::NewLine +
    $Tramo + [Environment]::NewLine + $cola)

  # 'Continue' solo para la invocacion: PowerShell trata lo que un ejecutable
  # escribe en stderr como error TERMINANTE bajo 'Stop', y aqui el escenario
  # que falla es justamente el que se quiere CAPTURAR y reportar, no el que
  # debe matar la corrida.
  $previo = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $salida = (& powershell -NoProfile -ExecutionPolicy Bypass -File $guion 2>&1 | Out-String)
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = $previo

  $okCodigo = ($codigo -eq $esc.codigo)
  $faltan = @($esc.espera | Where-Object { $salida -notlike ('*' + $_ + '*') })
  $sobran = @($esc.noEspera | Where-Object { $salida -like ('*' + $_ + '*') })

  if ($okCodigo -and $faltan.Count -eq 0 -and $sobran.Count -eq 0) {
    Write-Host ("   OK (codigo {0})" -f $codigo) -ForegroundColor Green
  } else {
    $fallos++
    Write-Host '   FALLO' -ForegroundColor Red
    if (-not $okCodigo) { Write-Host ("     codigo {0}, esperaba {1}" -f $codigo, $esc.codigo) -ForegroundColor Red }
    foreach ($f in $faltan) { Write-Host ("     falta en la salida: " + $f) -ForegroundColor Red }
    foreach ($i in $sobran) { Write-Host ("     NO deberia aparecer: " + $i) -ForegroundColor Red }
    Write-Host '     -- salida --' -ForegroundColor DarkGray
    Write-Host $salida -ForegroundColor DarkGray
  }
}

Write-Host ''
if ($fallos -eq 0) {
  Remove-Item $tmpRaiz -Recurse -Force
} else {
  # Con fallos los artefactos SE CONSERVAN: el guion generado y el prologo son
  # lo primero que hay que mirar, y borrarlos obliga a reproducir a ciegas.
  Write-Host ("Artefactos conservados para diagnostico: " + $tmpRaiz) -ForegroundColor Yellow
}
if ($fallos -gt 0) {
  Write-Host ("{0} de {1} escenarios FALLARON." -f $fallos, $escenarios.Count) -ForegroundColor Red
  exit 1
}
Write-Host ("Los {0} escenarios pasaron." -f $escenarios.Count) -ForegroundColor Green
exit 0
