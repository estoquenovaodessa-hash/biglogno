# Bot Estoque WhatsApp: icone na bandeja do Windows / PowerShell 5.1
# Usa iniciar-bot.ps1 existente; nao grava nem exibe a chave da Argox.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:inicializador = Join-Path $script:pasta "iniciar-bot.ps1"
$script:logsDir = Join-Path $script:pasta "logs-bot"
if (-not (Test-Path -LiteralPath $script:inicializador -PathType Leaf)) {
    [System.Windows.Forms.MessageBox]::Show(
        "Nao foi encontrado iniciar-bot.ps1 na pasta do controlador.",
        "Bot Estoque WhatsApp", "OK", "Error") | Out-Null
    exit 1
}
[System.IO.Directory]::CreateDirectory($script:logsDir) | Out-Null

# Nao permite dois controladores usando a mesma sessao WhatsApp.
$usuarioSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value.Replace("-", "_")
$nomeMutex = "Local\BotEstoqueBandeja_" + $usuarioSid
$criadoAgora = $false
$script:mutex = [System.Threading.Mutex]::new($true, $nomeMutex, [ref]$criadoAgora)
if (-not $criadoAgora) {
    [System.Windows.Forms.MessageBox]::Show(
        "O controlador ja esta aberto perto do relogio. Use o icone existente.",
        "Bot Estoque WhatsApp", "OK", "Information") | Out-Null
    $script:mutex.Dispose()
    exit 0
}

$script:processo = $null
$script:online = $false
$script:saida = ""
$script:erros = ""
$script:ultimoAviso = "Nenhuma solicitacao recente."
$script:detalhe = "Aguardando inicializacao."
$script:proximaTentativa = [datetime]::MinValue
$script:falhasSeguidas = 0
$script:encerrando = $false
$script:alertaOutroProcesso = $false

$script:tray = New-Object System.Windows.Forms.NotifyIcon
$script:tray.Icon = [System.Drawing.SystemIcons]::Application
$script:tray.Text = "Bot Estoque WhatsApp - Iniciando"
$script:tray.Visible = $true
$script:menu = New-Object System.Windows.Forms.ContextMenuStrip
$script:statusItem = $script:menu.Items.Add("Status: iniciando...")
$script:statusItem.Enabled = $false
[void]$script:menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$script:verStatus = $script:menu.Items.Add("Ver status")
$script:abrirLogs = $script:menu.Items.Add("Abrir logs")
$script:reiniciar = $script:menu.Items.Add("Reiniciar bot")
[void]$script:menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$script:sair = $script:menu.Items.Add("Encerrar bot")
$script:tray.ContextMenuStrip = $script:menu
$script:contexto = New-Object System.Windows.Forms.ApplicationContext
$script:timer = New-Object System.Windows.Forms.Timer
$script:timer.Interval = 2000

function Mostrar-Notificacao([string]$titulo, [string]$mensagem) {
    $script:tray.BalloonTipTitle = $titulo
    $script:tray.BalloonTipText = $mensagem
    $script:tray.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $script:tray.ShowBalloonTip(3500)
}

function Ultimas-Linhas([string]$arquivo, [int]$n = 80) {
    if (-not $arquivo -or -not (Test-Path -LiteralPath $arquivo)) { return @() }
    try { return @(Get-Content -LiteralPath $arquivo -Tail $n -ErrorAction Stop) }
    catch { return @() }
}

function Processo-ExternoDoBot {
    # Se outro node index.js estiver rodando, nao abra segunda sessao.
    # Nunca encerra automaticamente um processo desconhecido.
    try {
        $outros = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop |
            Where-Object { $_.CommandLine -match '(^|[\s"\\\/])index\.js($|[\s"])' })
        return $outros.Count -gt 0
    } catch {
        $script:detalhe = "Falha ao verificar bot existente: " + $_.Exception.Message
        return $true
    }
}

function Parar-Bot {
    if ($null -eq $script:processo) {
        $script:online = $false
        return $true
    }
    $p = $script:processo
    try {
        $p.Refresh()
        if (-not $p.HasExited) {
            # Finaliza somente a arvore de processos deste controlador.
            $parametros = @("/PID", [string]$p.Id, "/T", "/F")
            $kill = Start-Process -FilePath "$env:SystemRoot\System32\taskkill.exe" -ArgumentList $parametros -WindowStyle Hidden -Wait -PassThru
            $p.WaitForExit(4000) | Out-Null
            $p.Refresh()
            if (-not $p.HasExited) {
                $script:detalhe = "Nao consegui encerrar o bot anterior (PID " + $p.Id + ")."
                return $false
            }
        }
    } catch {
        $script:detalhe = "Falha ao encerrar bot: " + $_.Exception.Message
        return $false
    }
    $script:processo = $null
    $script:online = $false
    return $true
}

function Iniciar-Bot {
    if ($script:encerrando) { return }
    if ($null -ne $script:processo) {
        try {
            $script:processo.Refresh()
            if (-not $script:processo.HasExited) { return }
        } catch { }
        $script:processo = $null
    }
    if (Processo-ExternoDoBot) {
        $script:detalhe = "Outro node index.js ja esta em execucao. Pare a janela antiga antes de iniciar pela bandeja."
        $script:proximaTentativa = (Get-Date).AddSeconds(10)
        if (-not $script:alertaOutroProcesso) {
            Mostrar-Notificacao "Bot ja esta executando" "Feche a instancia manual antes de iniciar pela bandeja."
            $script:alertaOutroProcesso = $true
        }
        return
    }
    $script:alertaOutroProcesso = $false

    try {
        $data = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $script:saida = Join-Path $script:logsDir ("bot-" + $data + ".out.log")
        $script:erros = Join-Path $script:logsDir ("bot-" + $data + ".err.log")
        $script:online = $false
        $script:detalhe = "Inicializando WhatsApp..."
        $argumentos = @(
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", ('"' + $script:inicializador + '"')
        )
        $script:processo = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $argumentos -WorkingDirectory $script:pasta -WindowStyle Hidden -PassThru -RedirectStandardOutput $script:saida -RedirectStandardError $script:erros
        $script:proximaTentativa = [datetime]::MinValue
    } catch {
        $script:detalhe = "Nao foi possivel iniciar o bot: " + $_.Exception.Message
        $script:proximaTentativa = (Get-Date).AddSeconds(60)
    }
}

function Status-Bot {
    if ($script:encerrando) { return "Encerrando" }
    if ($null -eq $script:processo) {
        if ($script:alertaOutroProcesso) { return "Outro bot aberto" }
        return "Parado / aguardando"
    }
    try {
        $script:processo.Refresh()
        if ($script:processo.HasExited) { return "Processo encerrado" }
    } catch { return "Processo indisponivel" }
    if ($script:online) { return "WhatsApp online" }
    return "Conectando..."
}

function Atualizar-Status {
    $linhas = Ultimas-Linhas $script:saida 100
    if (-not $script:online -and ($linhas -match "Bot de Estoque Online e operando!")) {
        $script:online = $true
        $script:falhasSeguidas = 0
        $script:detalhe = "WhatsApp conectado. Impressao Argox habilitada."
        Mostrar-Notificacao "Bot Estoque Online" "WhatsApp conectado. Bot funcionando na bandeja."
    }
    $argox = @($linhas | Where-Object { $_ -match '\[Argox\]' })
    if ($argox.Count -gt 0) { $script:ultimoAviso = [string]$argox[-1] }
    $err = @(Ultimas-Linhas $script:erros 40 | Where-Object { $_ -match '\[Argox\]' })
    if ($err.Count -gt 0) { $script:ultimoAviso = [string]$err[-1] }

    if ($null -ne $script:processo) {
        try {
            $script:processo.Refresh()
            if ($script:processo.HasExited) {
                $script:processo = $null
                $script:online = $false
                $script:falhasSeguidas++
                $espera = if ($script:falhasSeguidas -ge 4) { 120 } else { 15 }
                $script:proximaTentativa = (Get-Date).AddSeconds($espera)
                $script:detalhe = "Bot encerrou inesperadamente. Reinicio automatico em " + $espera + " segundos."
            }
        } catch {
            $script:detalhe = "Nao foi possivel consultar processo: " + $_.Exception.Message
        }
    }
    if ($null -eq $script:processo -and (Get-Date) -ge $script:proximaTentativa) {
        Iniciar-Bot
    }

    $situacao = Status-Bot
    $script:statusItem.Text = "Status: " + $situacao
    $tooltip = "Bot Estoque - " + $situacao
    if ($tooltip.Length -gt 60) { $tooltip = $tooltip.Substring(0, 60) }
    $script:tray.Text = $tooltip
}

$script:verStatus.add_Click({
    $situacao = Status-Bot
    $info = "Bot: " + $situacao + [Environment]::NewLine +
        "Detalhes: " + $script:detalhe + [Environment]::NewLine +
        "Argox: " + $script:ultimoAviso + [Environment]::NewLine +
        "Logs: " + $script:logsDir
    [System.Windows.Forms.MessageBox]::Show(
        $info, "Status - Bot Estoque WhatsApp", "OK", "Information") | Out-Null
})

$script:abrirLogs.add_Click({
    Start-Process -FilePath "explorer.exe" -ArgumentList ('"' + $script:logsDir + '"')
})

$script:reiniciar.add_Click({
    if (-not (Parar-Bot)) {
        [System.Windows.Forms.MessageBox]::Show($script:detalhe,
            "Bot Estoque WhatsApp", "OK", "Error") | Out-Null
        return
    }
    $script:falhasSeguidas = 0
    $script:proximaTentativa = [datetime]::MinValue
    Iniciar-Bot
    Atualizar-Status
})

$script:sair.add_Click({
    $resposta = [System.Windows.Forms.MessageBox]::Show(
        "Encerrar o bot? Ele deixara de responder no WhatsApp e solicitar etiquetas ate iniciar novamente.",
        "Encerrar Bot Estoque", "YesNo", "Question")
    if ($resposta -ne [System.Windows.Forms.DialogResult]::Yes) { return }
    if (-not (Parar-Bot)) {
        [System.Windows.Forms.MessageBox]::Show($script:detalhe,
            "Bot Estoque WhatsApp", "OK", "Error") | Out-Null
        return
    }
    $script:encerrando = $true
    $script:contexto.ExitThread()
})
$script:tray.add_DoubleClick({ $script:verStatus.PerformClick() })
$script:timer.add_Tick({
    try { Atualizar-Status }
    catch { $script:detalhe = "Erro do monitoramento: " + $_.Exception.Message }
})

try {
    Iniciar-Bot
    $script:timer.Start()
    [System.Windows.Forms.Application]::Run($script:contexto)
} finally {
    $script:timer.Stop()
    $script:timer.Dispose()
    [void](Parar-Bot)
    $script:tray.Visible = $false
    $script:tray.Dispose()
    $script:menu.Dispose()
    $script:contexto.Dispose()
    $script:mutex.ReleaseMutex()
    $script:mutex.Dispose()
}
