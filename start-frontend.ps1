# Script para iniciar el frontend
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptPath\frontend"
Write-Host "🚀 Iniciando frontend..." -ForegroundColor Green
npm run dev



