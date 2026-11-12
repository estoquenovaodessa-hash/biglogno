# Execute uma única vez, na conta Windows que executa o bot.
# A chave deve ser a MESMA do secret WHATSAPP_STOCK_PRINT_TOKEN no Cloudflare.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$secret = Read-Host "Cole a chave do bot (64 caracteres, nao sera exibida)" -AsSecureString
$plain = [System.Net.NetworkCredential]::new("", $secret).Password
if ($plain -cnotmatch '^[0-9a-fA-F]{64}$') {
  throw "Chave invalida: sao necessarios 64 caracteres hexadecimais."
}
$path = Join-Path $here ".bot-print-token.dpapi"
$secret | ConvertFrom-SecureString | Set-Content -Path $path -Encoding UTF8
Write-Host "Chave protegida gravada para este usuario do Windows. Nao envie esse arquivo por WhatsApp ou GitHub."
