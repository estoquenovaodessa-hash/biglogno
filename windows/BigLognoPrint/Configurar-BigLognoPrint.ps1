# Instala BigLogno Print para o usuario Windows atual.
# NAO envie o token gerado ao ChatGPT, GitHub, WhatsApp ou e-mail.
param(
  [string]$PrinterName='Argox OS-214 plus series PPLA',
  [string]$ServerUrl='https://biglogno.estoquenovaodessa.workers.dev'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$source=Split-Path -Parent $MyInvocation.MyCommand.Path
$destination=Join-Path $env:LOCALAPPDATA 'BigLognoPrint'
if($ServerUrl -ne 'https://biglogno.estoquenovaodessa.workers.dev'){
  throw 'Endereco do BigLogno nao autorizado.'
}
if(-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)){
  throw ('Impressora nao encontrada. Abra Win+R > control printers. Esperado: '+$PrinterName)
}
$candidates=@()
$pf=[Environment]::GetFolderPath('ProgramFiles')
$pf86=[Environment]::GetFolderPath('ProgramFilesX86')
if($pf){$candidates+=Join-Path $pf 'SumatraPDF\SumatraPDF.exe'}
if($pf86){$candidates+=Join-Path $pf86 'SumatraPDF\SumatraPDF.exe'}
if($env:LOCALAPPDATA){$candidates+=Join-Path $env:LOCALAPPDATA 'SumatraPDF\SumatraPDF.exe'}
$sumatra=$candidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(-not $sumatra){
  Write-Host 'Instale primeiro SumatraPDF do site oficial:'
  Write-Host 'https://www.sumatrapdfreader.org/download-free-pdf-viewer'
  throw 'SumatraPDF nao encontrado.'
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'BigLognoPrint.ps1') -Destination (Join-Path $destination 'BigLognoPrint.ps1') -Force
$configPath=Join-Path $destination 'config.json'
if(Test-Path -LiteralPath $configPath){
  $previous=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $encrypted=[string]$previous.TokenProtected
  Write-Host 'Mantendo a credencial ja cadastrada no Cloudflare.'
}else{
  $bytes=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
  $token=-join ($bytes | ForEach-Object { $_.ToString('x2') })
  $encrypted=ConvertFrom-SecureString (ConvertTo-SecureString $token -AsPlainText -Force)
  Write-Host ''
  Write-Host 'COPIE ESTE TOKEN UMA VEZ PARA CLOUDFARE > biglogno > Settings > Variables and Secrets'
  Write-Host 'Nome do SECRET: PRINT_AGENT_TOKEN'
  Write-Host 'IMPORTANTE: nao cole o token no chat nem em arquivo do GitHub.'
  Write-Host ''
  Write-Host $token
  Write-Host ''
  Write-Host 'Configure AUTO_CONFERENCE_PRINT_ENABLED=true somente apos instalar o SQL.'
  Read-Host 'Depois de configurar o segredo, pressione ENTER' | Out-Null
}
$config=@{
  ServerUrl=$ServerUrl
  PrinterName=$PrinterName
  SumatraPdfExe=[string]$sumatra
  TokenProtected=$encrypted
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
# Inicia com o Windows do usuario atual, sem servico externo e sem portas abertas.
$startup=[Environment]::GetFolderPath('Startup')
$link=Join-Path $startup 'BigLogno Print.lnk'
$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
$shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$agentPath=Join-Path $destination 'BigLognoPrint.ps1'
$shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$agentPath+'"'
$shortcut.WorkingDirectory=$destination
$shortcut.Description='BigLogno Print - Argox OS-214 plus PPLA'
$shortcut.Save()
Write-Host ''
Write-Host ('Configurado em: '+$destination)
Write-Host ('Impressora: '+$PrinterName)
Write-Host ('SumatraPDF: '+$sumatra)
Write-Host 'Agente iniciara automaticamente quando este usuario entrar no Windows.'
Write-Host 'O computador deve permanecer ligado e com usuario logado.'
Write-Host 'Ainda nao foi iniciada nenhuma impressao.'
Write-Host 'Antes de habilitar a impressao, confirme a conexao SEM imprimir:'
Write-Host ('powershell -NoProfile -ExecutionPolicy Bypass -File "'+$agentPath+'" -Check')
Write-Host 'Somente apos ativar e preparar uma etiqueta de teste use -Once.'
