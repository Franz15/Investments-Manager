# Script para iniciar backend y frontend en ventanas separadas
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🚀 Iniciando backend y frontend..." -ForegroundColor Green

# Iniciar backend en nueva ventana
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptPath\backend'; Write-Host '🚀 Backend iniciando...' -ForegroundColor Cyan; npm run dev"

# Esperar un poco antes de iniciar el frontend
Start-Sleep -Seconds 2

# Iniciar frontend en nueva ventana
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptPath\frontend'; Write-Host '🚀 Frontend iniciando...' -ForegroundColor Magenta; npm run dev"

Write-Host "✅ Backend y Frontend iniciándose en ventanas separadas" -ForegroundColor Green
Write-Host "   Backend: http://localhost:5000" -ForegroundColor Yellow
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor Yellow



