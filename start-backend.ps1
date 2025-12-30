# Script para iniciar el backend
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptPath\backend"
Write-Host "🚀 Iniciando backend..." -ForegroundColor Green
npm run dev



