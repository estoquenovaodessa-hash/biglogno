# Inicia o bot de estoque com a chave de impressao protegida pelo DPAPI.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$path = Join-Path $here ".bot-print-token.dpapi"
if (-not (Test-Path $path)) {
  throw "Execute primeiro configurar-token.ps1 na mesma conta do Windows."
}
# Get-Content -Raw inclui a quebra de linha inserida pelo Set-Content no
# Windows PowerShell 5.1; ela torna a string DPAPI invalida no ConvertTo-SecureString.
$encrypted = (Get-Content -LiteralPath $path -Raw -Encoding UTF8).Trim().Trim([char]0xFEFF)
if ([string]::IsNullOrWhiteSpace($encrypted)) {
  throw "O arquivo de chave protegida esta vazio. Execute configurar-token.ps1 novamente."
}
try {
  $secret = ConvertTo-SecureString -String $encrypted -ErrorAction Stop
} catch {
  throw "Falha ao abrir chave protegida. Use a mesma conta do Windows em que a chave foi salva. Detalhe: $($_.Exception.Message)"
}
$env:BIGLOG_BOT_PRINT_TOKEN = [System.Net.NetworkCredential]::new("", $secret).Password
if ($env:BIGLOG_BOT_PRINT_TOKEN -cnotmatch '^[0-9a-fA-F]{64}$') {
  throw "Chave de impressao invalida."
}
Set-Location -Path $here
node index.js
