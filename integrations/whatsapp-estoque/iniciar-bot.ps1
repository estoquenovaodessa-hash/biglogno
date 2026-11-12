# Inicia o bot de estoque com a chave de impressao protegida pelo DPAPI.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$path = Join-Path $here ".bot-print-token.dpapi"
if (-not (Test-Path $path)) {
  throw "Execute primeiro configurar-token.ps1 na mesma conta do Windows."
}
$encrypted = Get-Content -Path $path -Raw
$secret = ConvertTo-SecureString $encrypted
$env:BIGLOG_BOT_PRINT_TOKEN = [System.Net.NetworkCredential]::new("", $secret).Password
if ($env:BIGLOG_BOT_PRINT_TOKEN -cnotmatch '^[0-9a-fA-F]{64}$') {
  throw "Chave de impressao invalida."
}
Set-Location -Path $here
node index.js
