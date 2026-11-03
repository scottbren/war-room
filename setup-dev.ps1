# War Room dev environment setup (Windows, PowerShell)
# Run in an elevated PowerShell window: .\setup-dev.ps1
# Safe to re-run: winget skips anything already installed.

$ErrorActionPreference = "Continue"

Write-Host "Installing core tools..." -ForegroundColor Cyan
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
winget install --id GitHub.cli -e --source winget --accept-package-agreements --accept-source-agreements

Write-Host "Installing 3D tools..." -ForegroundColor Cyan
winget install --id BlenderFoundation.Blender -e --source winget --accept-package-agreements --accept-source-agreements
winget install --id astral-sh.uv -e --source winget --accept-package-agreements --accept-source-agreements

Write-Host "Configuring..." -ForegroundColor Cyan
# Allow locally created scripts (needed for pnpm shims)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
# Long paths: node_modules trees get deep on Windows
git config --global core.longpaths true
git config --global core.autocrlf input

Write-Host ""
Write-Host "Done. Close this window, open a NEW PowerShell window, then run:" -ForegroundColor Green
Write-Host "  corepack enable"
Write-Host "  .\check-dev.ps1"
