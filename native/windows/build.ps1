$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot/../..").Path
$work = Join-Path $root "dist/windows-build"
New-Item $work -ItemType Directory -Force | Out-Null
python "$root/tools/build.py"
if ($LASTEXITCODE) { throw "HTML build failed" }
nuget install Microsoft.Web.WebView2 -Version 1.0.3595.46 -Source https://api.nuget.org/v3/index.json -OutputDirectory "$work/packages" -ExcludeVersion -NonInteractive
if ($LASTEXITCODE) { throw "WebView2 package restore failed" }
cmake -S $PSScriptRoot -B "$work/cmake" -A x64 "-DWEBVIEW2_SDK=$work/packages/Microsoft.Web.WebView2"
if ($LASTEXITCODE) { throw "CMake configuration failed" }
cmake --build "$work/cmake" --config Release --clean-first
if ($LASTEXITCODE) { throw "Windows build failed" }
Copy-Item "$work/cmake/Release/SnakesAndLadders.exe" "$root/dist/SnakesAndLadders.exe" -Force
