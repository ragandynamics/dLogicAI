# Fix TS2347 in apps/api/src/billing.ts when the Hono context is currently untyped.
# Run from repository root or apps/api.
$path = Join-Path $PSScriptRoot '..\src\billing.ts'
$content = Get-Content -Raw -LiteralPath $path
$content = $content -replace '\.first<any>\(\)', '.first()'
$content = $content -replace '\.all<any>\(\)', '.all()'
Set-Content -LiteralPath $path -Value $content -Encoding utf8
Write-Host "Patched $path"
