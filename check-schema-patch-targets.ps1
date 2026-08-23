$schemaPath = ".\prisma\schema.prisma"

if (!(Test-Path $schemaPath)) {
  Write-Error "schema.prisma not found"
  exit 1
}

$schema = Get-Content $schemaPath -Raw

$checks = @(
  "enum CatalogStatus",
  "model Branch",
  "model Item",
  "model User"
)

foreach ($check in $checks) {
  if ($schema.Contains($check)) {
    Write-Host "FOUND: $check"
  } else {
    Write-Host "MISSING: $check"
  }
}

Write-Host ""
Write-Host "Schema checker completed."
