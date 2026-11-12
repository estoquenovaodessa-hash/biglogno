# Instala o Bot Estoque WhatsApp na bandeja do sistema.
# Windows PowerShell 5.1. Executar na MESMA conta Windows do bot e da chave DPAPI.
$ErrorActionPreference = "Stop"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$trayScript = Join-Path $pasta "bandeja-bot.ps1"
$botScript = Join-Path $pasta "iniciar-bot.ps1"
$tokenFile = Join-Path $pasta ".bot-print-token.dpapi"
if (-not (Test-Path -LiteralPath $trayScript -PathType Leaf)) {
    throw "Arquivo bandeja-bot.ps1 nao encontrado na pasta do instalador."
}
if (-not (Test-Path -LiteralPath $botScript -PathType Leaf)) {
    throw "Arquivo iniciar-bot.ps1 nao encontrado na pasta do instalador."
}
if (-not (Test-Path -LiteralPath $tokenFile -PathType Leaf)) {
    throw "Arquivo de chave protegida ausente. Execute configurar-token.ps1 antes."
}

# Script auxiliar que abre PowerShell sem janela e preserva a conta do usuario.
$vbs = @'
Option Explicit
Dim wsh, fso, pasta, executavel, comando
Set wsh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
executavel = wsh.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
comando = Chr(34) & executavel & Chr(34) & " -NoProfile -Sta -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & pasta & "\bandeja-bot.ps1" & Chr(34)
wsh.Run comando, 0, False
'@
$launcher = Join-Path $pasta "iniciar-bandeja.vbs"
Set-Content -LiteralPath $launcher -Value $vbs -Encoding ASCII

$startup = [Environment]::GetFolderPath("Startup")
if (-not (Test-Path -LiteralPath $startup -PathType Container)) {
    throw "Pasta de Inicializacao do Windows indisponivel."
}
$shell = New-Object -ComObject WScript.Shell

# Remove somente o atalho antigo com o nome usado na configuracao anterior,
# e apenas se realmente iniciar este bot. Nao altera outros programas.
$antigo = Join-Path $startup "Bot Estoque WhatsApp.lnk"
if (Test-Path -LiteralPath $antigo) {
    $atalhoAntigo = $shell.CreateShortcut($antigo)
    $comandoAntigo = [string]$atalhoAntigo.TargetPath + " " + [string]$atalhoAntigo.Arguments
    if ($comandoAntigo -match "bot-estoque|iniciar-bot[.]ps1") {
        Remove-Item -LiteralPath $antigo -Force
        Write-Host "Atalho antigo do bot substituido."
    } else {
        Write-Warning ("Atalho antigo com nome semelhante, mas destino diferente: " + $antigo)
    }
}

$novo = Join-Path $startup "Bot Estoque - Bandeja.lnk"
$atalho = $shell.CreateShortcut($novo)
$atalho.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
$atalho.Arguments = '"' + $launcher + '"'
$atalho.WorkingDirectory = $pasta
$atalho.Description = "Bot Estoque WhatsApp e Argox - icone proximo ao relogio"
$atalho.Save()

# Avisar sobre outras entradas de inicializacao que possam duplicar o bot.
$possiveisDuplicatas = @()
Get-ChildItem -LiteralPath $startup -Filter "*.lnk" -File | Where-Object {
    $_.FullName -ne $novo
} | ForEach-Object {
    try {
        $outro = $shell.CreateShortcut($_.FullName)
        $alvo = [string]$outro.TargetPath + " " + [string]$outro.Arguments
        if ($alvo -match "bot-estoque|iniciar-bot[.]ps1") {
            $possiveisDuplicatas += $_.Name
        }
    } catch {}
}

# Atalhos antigos .bat/.cmd/.vbs tambem podem iniciar outra instancia.
Get-ChildItem -LiteralPath $startup -File | Where-Object {
    $_.Extension -in @(".bat", ".cmd", ".vbs")
} | ForEach-Object {
    try {
        $texto = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction Stop
        if ($texto -match "bot-estoque|iniciar-bot[.]ps1") {
            $possiveisDuplicatas += $_.Name
        }
    } catch {}
}

Write-Host ""
Write-Host "CONCLUIDO: inicializacao automatica pela bandeja instalada." -ForegroundColor Green
Write-Host ("Usuario Windows: " + [System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
Write-Host ("Atalho: " + $novo)
Write-Host ("Iniciar agora, depois de fechar o bot manual: wscript.exe " + '"' + $launcher + '"')
Write-Host "Para abrir o menu: clique com o botao direito no icone proximo ao relogio."
Write-Host "Ao entrar no Windows, o icone e o bot iniciam automaticamente."
if ($possiveisDuplicatas.Count -gt 0) {
    Write-Warning ("Outros atalhos que podem iniciar o bot: " + ($possiveisDuplicatas -join ", "))
    Write-Warning "Remova os atalhos duplicados na pasta shell:startup antes de reiniciar."
}
