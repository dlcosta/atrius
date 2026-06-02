$ports = 3000, 3334
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($procId in $listeners) {
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -in @('node.exe', 'powershell.exe') -and
    $_.CommandLine -and
    $_.CommandLine.Contains($projectRoot)
  } |
  Select-Object -ExpandProperty ProcessId -Unique

foreach ($procId in $projectProcesses) {
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Write-Host 'Servicos locais finalizados.'
