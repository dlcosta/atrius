$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$backendLog = Join-Path $root 'backend-run.log'
$frontendLog = Join-Path $root 'frontend-run.log'

foreach ($port in 3000, 3334) {
  $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $port } |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($procId in $listeners) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

foreach ($log in $backendLog, $frontendLog) {
  if (Test-Path $log) {
    try {
      Remove-Item -LiteralPath $log -Force -ErrorAction Stop
    } catch {
      # If a prior process still holds the file handle briefly, keep the file and append.
    }
  }
}

Start-Process -FilePath powershell.exe `
  -WorkingDirectory $backendDir `
  -WindowStyle Hidden `
  -ArgumentList @(
    '-NoLogo',
    '-NoProfile',
    '-Command',
    "npm run dev *>> '$backendLog'"
  )

Start-Process -FilePath powershell.exe `
  -WorkingDirectory $frontendDir `
  -WindowStyle Hidden `
  -ArgumentList @(
    '-NoLogo',
    '-NoProfile',
    '-Command',
    "npm run dev *>> '$frontendLog'"
  )

Write-Host 'Frontend: http://localhost:3000'
Write-Host 'Backend: http://localhost:3334'
Write-Host "Logs: $frontendLog"
Write-Host "Logs: $backendLog"
