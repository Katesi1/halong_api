# deploy.ps1 — One-shot redeploy script for Halong24h backend
# Run as Administrator: .\deploy.ps1 [-Branch develop] [-SkipMigrate] [-SkipSeed]
[CmdletBinding()]
param(
  [string]$Branch = 'develop',
  [switch]$SkipMigrate,
  [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'
$root = 'C:\website\backend'
Set-Location $root

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Step "Refreshing PATH"
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

Step "Pulling latest from origin/$Branch"
git fetch origin $Branch
git reset --hard "origin/$Branch"

Step "Installing dependencies (npm ci)"
npm ci

Step "Generating Prisma client"
npx prisma generate

if (-not $SkipMigrate) {
  Step "Applying Prisma migrations (deploy mode)"
  npx prisma migrate deploy
}

if (-not $SkipSeed) {
  Step "Seeding database (admin user etc.)"
  try { npm run db:seed } catch { Write-Warning "Seed step failed (may already be seeded): $_" }
}

Step "Building TypeScript -> dist/"
npm run build

Step "Restarting PM2 process homestay-api"
pm2 startOrReload ecosystem.config.js
pm2 save

Step "Tail last logs"
pm2 logs homestay-api --lines 30 --nostream

Write-Host "`nDeploy complete. Test: https://api.halong24h.com/index.html" -ForegroundColor Green
