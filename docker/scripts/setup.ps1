$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DockerDir = Resolve-Path (Join-Path $ScriptDir "..")
$EnvFile = Join-Path $DockerDir ".env"
$EnvTemplate = Join-Path $DockerDir ".env.example"

if (-not (Test-Path $EnvFile)) {
  Copy-Item -Path $EnvTemplate -Destination $EnvFile
  Write-Host "Created $EnvFile from template."
}

$envContent = Get-Content -Path $EnvFile -Raw
if ($envContent -match "^JWT_SECRET=replace-with-a-random-secret$" -or $envContent -match "JWT_SECRET=replace-with-a-random-secret") {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  $envContent = $envContent -replace "JWT_SECRET=.*", "JWT_SECRET=$secret"
  Set-Content -Path $EnvFile -Value $envContent
  Write-Host "Generated JWT_SECRET in $EnvFile."
}

Write-Host "Docker setup complete."
