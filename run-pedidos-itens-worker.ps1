$ErrorActionPreference = "Stop"
$log = "c:\Users\Douglas Costa\Documents\Projetos Pessoais\Atrius\atrius-planner\pedidos-itens-worker.log"
if (!(Test-Path -LiteralPath $log)) { New-Item -ItemType File -Path $log | Out-Null }

while ($true) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Method POST "http://localhost:3000/api/sincronizar/pedidos/itens?full=1&pages=1&concurrency=2" -TimeoutSec 900
    $json = $resp.Content | ConvertFrom-Json

    $line = "[$(Get-Date -Format o)] offset_inicial=$($json.offset_inicial) offset_proximo=$($json.offset_proximo) processados=$($json.pedidos_processados) itens=$($json.itens_importados) erros=$($json.erros) finalizado=$($json.finalizado)"
    Add-Content -Path $log -Value $line

    if ($json.finalizado -eq $true) {
      Add-Content -Path $log -Value "[$(Get-Date -Format o)] FINALIZADO"
      break
    }

    Start-Sleep -Seconds 3
  } catch {
    $msg = $_.Exception.Message
    Add-Content -Path $log -Value "[$(Get-Date -Format o)] ERRO=$msg"
    if ($msg -match "429") { Start-Sleep -Seconds 45 } else { Start-Sleep -Seconds 15 }
  }
}
