# Empacota o motor de audio num executavel (pasta dist/call-sketch-engine) pro instalador do app.
# Uso: .\build.ps1          (inclui as DLLs de GPU se o extra [gpu] estiver instalado)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$py = '.\.venv\Scripts\python.exe'
& $py -m pip install --quiet pyinstaller

$collect = @('faster_whisper', 'ctranslate2', 'soundcard', 'edge_tts', 'miniaudio')
$gpu = & $py -c "import importlib.util as u; print(bool(u.find_spec('nvidia.cublas')))"
if ($gpu -eq 'True') { $collect += @('nvidia.cublas', 'nvidia.cudnn') }

$args = @('--noconfirm', '--clean', '--console', '--name', 'call-sketch-engine', '--paths', 'src')
foreach ($m in $collect) { $args += @('--collect-all', $m) }
& $py -m PyInstaller @args 'src\call_sketch_engine\__main__.py'

Write-Host "Pronto: dist\call-sketch-engine\call-sketch-engine.exe"
