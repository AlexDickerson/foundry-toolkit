# Downloads the latest map-tagger release exe into tagger/dist/
# so electron-builder can package dm-tool without a local Python install.
#
# Requires: gh CLI (https://cli.github.com/) with gh auth login.

$repo    = 'AlexDickerson/foundry-toolkit'
$distDir = Join-Path $PSScriptRoot '..' 'dist'
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

Write-Host "Fetching latest tagger release from $repo..."
gh release download --repo $repo --pattern 'map-tagger-*.exe' --dir $distDir --clobber

$versioned = Get-ChildItem -Path $distDir -Filter 'map-tagger-*.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $versioned) {
    Write-Error 'No map-tagger-*.exe found in dist/ after download'
    exit 1
}

$dest = Join-Path $distDir 'map-tagger.exe'
Move-Item -Force $versioned.FullName $dest
Write-Host "Ready: $dest"
