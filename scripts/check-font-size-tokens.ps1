$ErrorActionPreference = "Stop"

$patterns = @(
  'fontSize\s*=\s*"[^"]*px',
  'fontSize\s*=\s*\{\{[^\r\n]*px',
  'fontSize\s*:\s*[0-9]',
  'font-size\s*:\s*[0-9]'
)

$matches = Get-ChildItem -Path src -Recurse -Include *.ts, *.tsx, *.css |
  Select-String -Pattern $patterns

if ($matches) {
  $matches | ForEach-Object {
    Write-Output ("{0}:{1}:{2}" -f $_.Path.Replace((Get-Location).Path + "\", ""), $_.LineNumber, $_.Line.Trim())
  }
  Write-Error "Avoid raw px or numeric fontSize values. Use Chakra font tokens or textStyle instead."
  exit 1
}
