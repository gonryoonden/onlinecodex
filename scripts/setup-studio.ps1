$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
python -m venv .venvs/studio
& ./.venvs/studio/Scripts/python.exe -m pip install -r scripts/studio-requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed" }
npm --prefix apps/studio ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
$env:STUDIO_PYTHON = (Resolve-Path ./.venvs/studio/Scripts/python.exe).Path
Write-Host 'Run: npm --prefix apps/studio run dev'
