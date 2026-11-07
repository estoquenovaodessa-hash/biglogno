# BigLogno Print - Windows / Argox OS-214 plus series PPLA
# Usa DPAPI do Windows. Trabalhos incertos nao sao reimpressos automaticamente.
param([switch]$Once,[switch]$Check)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base=Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath=Join-Path $base 'config.json'
$logFile=Join-Path $base 'biglogno-print.log'
function Write-AgentLog([string]$message){
  $line='[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'),$message
  try{
    if((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt 5242880){
      Move-Item -LiteralPath $logFile -Destination ($logFile+'.old') -Force
    }
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  }catch{}
  Write-Host $line
}
if(-not (Test-Path -LiteralPath $configPath)){
  throw 'Execute primeiro Configurar-BigLognoPrint.ps1.'
}
$config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$endpoint=$config.ServerUrl.TrimEnd('/')+'/api/conference-print-agent'
$credential=ConvertTo-SecureString $config.TokenProtected
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential)
try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if($token -notmatch '^[0-9a-fA-F]{64}$'){
  throw 'Token invalido ou inacessivel para este usuario Windows.'
}
if($config.ServerUrl -ne 'https://biglogno.estoquenovaodessa.workers.dev'){
  throw 'Endereco do BigLogno nao autorizado. Execute a configuracao novamente.'
}
if(-not (Test-Path -LiteralPath $config.SumatraPdfExe)){
  throw 'SumatraPDF nao encontrado. Execute a configuracao novamente.'
}
if(-not (Get-Printer -Name $config.PrinterName -ErrorAction SilentlyContinue)){
  throw ('Impressora nao localizada: '+$config.PrinterName)
}
$headers=@{
  Authorization=('Bearer '+$token)
  Accept='application/json'
  'Cache-Control'='no-store'
}
$working=Join-Path $base 'tmp'
New-Item -ItemType Directory -Path $working -Force | Out-Null
Write-AgentLog ('Iniciado, impressora: '+$config.PrinterName)
# Teste seguro: valida o token no servidor sem buscar etiquetas nem imprimir.
if($Check){
  try{
    $result=Invoke-RestMethod -Uri ($endpoint+'?health=1') -Headers $headers -Method GET -TimeoutSec 25
    if($result.ok -ne $true){throw 'O servidor nao confirmou a conexao.'}
    Write-AgentLog 'CONEXAO SEGURA CONFIRMADA: token aceito pelo BigLogno.'
    if($result.printingEnabled -eq $true){
      Write-AgentLog 'ATENCAO: Impressao automatica esta habilitada no servidor.'
    }else{
      Write-AgentLog 'Impressao automatica desativada. Nenhuma etiqueta foi impressa.'
    }
    exit 0
  }catch{
    Write-AgentLog ('TESTE FALHOU: '+$_.Exception.Message)
    exit 1
  }
}
do{
  try{
    $response=Invoke-RestMethod -Uri $endpoint -Headers $headers -Method GET -TimeoutSec 25
    if($null -ne $response.job){
      $job=$response.job
      if([string]$job.id -notmatch '^[0-9a-fA-F-]{36}$' -or
         [string]$job.leaseId -notmatch '^[0-9a-fA-F-]{36}$'){
        throw 'Trabalho recebido com identificadores invalidos.'
      }
      $pdfFile=Join-Path $working ($job.id+'.pdf')
      $wasSpooled=$false
      $errorMessage=''
      try{
        if(-not $job.pdfBase64 -or $job.pdfBase64.Length -gt 550000){
          throw 'PDF fora do limite autorizado.'
        }
        $bytes=[Convert]::FromBase64String([string]$job.pdfBase64)
        if($bytes.Length -lt 8 -or [Text.Encoding]::ASCII.GetString($bytes,0,4) -ne '%PDF'){
          throw 'Arquivo recebido nao e um PDF valido.'
        }
        [IO.File]::WriteAllBytes($pdfFile,$bytes)
        # Nao usa fit/shrink; preserva as dimensoes do PDF Argox de 60x30 mm.
        $printerName=([string]$config.PrinterName).Replace('"','')
        # Evita que o SumatraPDF gire automaticamente o PDF horizontal 60x30.
        # A orientacao e o papel 60x30 devem estar configurados no driver Argox.
        $arguments='-print-to "{0}" -print-settings "noscale,disable-auto-rotation" -silent "{1}"' -f $printerName,$pdfFile
        $process=Start-Process -FilePath $config.SumatraPdfExe -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
        if($process.ExitCode -ne 0){
          throw ('Falha ao enviar para a fila de impressao (codigo '+$process.ExitCode+').')
        }
        $wasSpooled=$true
        Write-AgentLog ('PDF enviado ao spooler. Job: '+$job.id)
      }catch{
        $errorMessage=$_.Exception.Message
        Write-AgentLog ('ERRO de impressao no job '+$job.id+': '+$errorMessage)
      }finally{
        Remove-Item -LiteralPath $pdfFile -Force -ErrorAction SilentlyContinue
      }
      $ack=@{
        id=$job.id
        leaseId=$job.leaseId
        status=$(if($wasSpooled){'spooled'}else{'error'})
        message=$errorMessage.Substring(0,[Math]::Min(350,$errorMessage.Length))
      } | ConvertTo-Json -Compress
      try{
        Invoke-RestMethod -Uri $endpoint -Headers $headers -Method POST -ContentType 'application/json' -Body $ack -TimeoutSec 25 | Out-Null
        Write-AgentLog ('Confirmacao registrada. Job: '+$job.id)
      }catch{
        Write-AgentLog ('AVISO: confirmacao incerta para '+$job.id+'. Verifique o papel antes de reimprimir.')
      }
    }elseif($Once){
      Write-AgentLog 'Nenhum trabalho pendente.'
    }
  }catch{
    Write-AgentLog ('Conexao/servico: '+$_.Exception.Message)
  }
  if(-not $Once){Start-Sleep -Seconds 5}
}while(-not $Once)
