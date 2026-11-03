# Verifies the dev environment. Run in a new PowerShell window after setup-dev.ps1.
$tools = @(
  @{ Name = "git";    Cmd = { git --version } },
  @{ Name = "node";   Cmd = { node -v } },
  @{ Name = "pnpm";   Cmd = { pnpm -v } },
  @{ Name = "gh";     Cmd = { gh --version | Select-Object -First 1 } },
  @{ Name = "uv";     Cmd = { uv --version } },
  @{ Name = "claude"; Cmd = { claude --version } }
)
foreach ($t in $tools) {
  try { $v = & $t.Cmd 2>$null; if ($v) { Write-Host ("OK   {0,-7} {1}" -f $t.Name, $v) -ForegroundColor Green } else { throw } }
  catch { Write-Host ("MISS {0}" -f $t.Name) -ForegroundColor Red }
}
$blender = Get-ChildItem "C:\Program Files\Blender Foundation" -Recurse -Filter blender.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($blender) { Write-Host ("OK   blender {0}" -f $blender.FullName) -ForegroundColor Green } else { Write-Host "MISS blender" -ForegroundColor Red }
