# ============================================================
#  One-Click Installer & Launcher - Windows (PowerShell 5+)
#
#  Usage (right-click → "Run with PowerShell", or in terminal):
#    powershell -ExecutionPolicy Bypass -File install_and_run.ps1
#
#  Options:
#    -Model <tag>    Ollama model (default: llama3.2:3b-instruct-q4_K_M)
#    -Reinstall      Force reinstall of Python/npm deps
# ============================================================

param(
    [string]$Model = "llama3.2:3b-instruct-q4_K_M",
    [switch]$Reinstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Log   { Write-Host "`n▶  $args" -ForegroundColor Cyan }
function Ok    { Write-Host "✅ $args" -ForegroundColor Green }
function Warn  { Write-Host "⚠️  $args" -ForegroundColor Yellow }
function Fail  { Write-Host "`n❌ $args" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║       Atlantean - Local Ollama Installer             ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host "  Model : $Model"
Write-Host "  Dir   : $ScriptDir"
Write-Host ""

# ── 1. Check Python ──────────────────────────────────────────────────────────
Log "Checking Python..."
$PythonBin = $null
foreach ($candidate in @("python", "python3", "py")) {
    try {
        $ver = & $candidate --version 2>&1
        if ($ver -match "Python 3\.(\d+)") {
            $minor = [int]$Matches[1]
            if ($minor -ge 10) {
                $PythonBin = $candidate
                Ok "Found: $ver"
                break
            }
        }
    } catch { }
}
if (-not $PythonBin) {
    Fail "Python 3.10 or newer is required.`nDownload from: https://www.python.org/downloads/"
}

# ── 2. Check Node.js ─────────────────────────────────────────────────────────
Log "Checking Node.js..."
try {
    $nodeVer = node --version 2>&1
    if ($nodeVer -match "v(\d+)") {
        if ([int]$Matches[1] -lt 18) {
            Fail "Node.js 18+ required (found $nodeVer).`nDownload from: https://nodejs.org"
        }
    }
    Ok "Found Node.js $nodeVer"
} catch {
    Fail "Node.js 18+ is required.`nDownload from: https://nodejs.org"
}

# ── 3. Install / verify Ollama ───────────────────────────────────────────────
Log "Checking Ollama..."
$OllamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $OllamaCmd) {
    Warn "Ollama not found. Downloading installer..."
    $installer = "$env:TEMP\OllamaSetup.exe"
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" `
        -OutFile $installer -UseBasicParsing
    Write-Host "  Running Ollama installer (follow the GUI prompts)..."
    Start-Process -FilePath $installer -Wait
    # Refresh PATH for current session (GUI installer only updates registry)
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User") + ";" +
                "$env:LOCALAPPDATA\Programs\Ollama"
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Fail "Ollama installed but not on PATH.`nClose this window, open a NEW PowerShell window, and re-run install_and_run.bat."
    }
    Ok "Ollama installed"
} else {
    Ok "Ollama present: $(ollama --version 2>&1)"
}

# ── 4. Start Ollama service ───────────────────────────────────────────────────
Log "Starting Ollama service..."
$ollamaRunning = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:11434/" -UseBasicParsing -TimeoutSec 2
    $ollamaRunning = $true
} catch { }

if (-not $ollamaRunning) {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Write-Host "  Waiting for Ollama to start..."
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try {
            Invoke-WebRequest -Uri "http://127.0.0.1:11434/" -UseBasicParsing -TimeoutSec 2 | Out-Null
            $ollamaRunning = $true; break
        } catch { }
    }
    if (-not $ollamaRunning) { Fail "Ollama service did not start. Try running 'ollama serve' manually." }
    Ok "Ollama service running"
} else {
    Ok "Ollama service already running"
}

# ── 5. Pull model ────────────────────────────────────────────────────────────
Log "Checking model: $Model ..."
$modelList = ollama list 2>&1
if ($modelList -match [regex]::Escape($Model)) {
    Ok "Model already downloaded: $Model"
} else {
    Write-Host "  Pulling $Model (may take several minutes on first run)..."
    ollama pull $Model
    Ok "Model ready: $Model"
}

# ── 6. Python virtual environment ────────────────────────────────────────────
Log "Setting up Python environment..."
$VenvDir = Join-Path $ScriptDir ".venv"

if ($Reinstall -and (Test-Path $VenvDir)) {
    Remove-Item -Recurse -Force $VenvDir
    Warn "Removed existing venv for reinstall"
}

if (-not (Test-Path $VenvDir)) {
    & $PythonBin -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { Fail "Failed to create Python virtual environment." }
    Ok "Created virtual environment"
}

$Py  = Join-Path $VenvDir "Scripts\python.exe"
$Pip = Join-Path $VenvDir "Scripts\pip.exe"
if (-not (Test-Path $Py)) { Fail "Virtual environment is broken (python.exe missing). Delete .venv and re-run." }
$InstalledFlag = Join-Path $VenvDir ".installed"

if ($Reinstall -or -not (Test-Path $InstalledFlag)) {
    # Pick torch version: 2.2.0 has no Python 3.12 Windows wheels; use 2.4.0+ for 3.12+
    $PyMinor = [int](&$Py -c "import sys; print(sys.version_info.minor)")
    $TorchVer = if ($PyMinor -ge 12) { "torch==2.4.0" } else { "torch==2.2.0" }
    Log "Installing Python dependencies (torch CPU $TorchVer - may take a few minutes)..."
    # Must use python -m pip (not pip.exe) to upgrade pip itself on Windows
    & $Py -m pip install --quiet --upgrade pip

    # Exclude torch and optional heavy voice deps from base requirements
    $reqs = Get-Content "$ScriptDir\requirements.txt" |
        Where-Object { $_ -notmatch "^torch" -and $_ -notmatch "^faster-whisper" -and $_ -notmatch "^piper-tts" }
    $tmpReqs = "$env:TEMP\atlantean_reqs.txt"
    $reqs | Set-Content $tmpReqs

    $pipLog = "$ScriptDir\pip_install.log"
    # Use *> to capture all streams; avoids PowerShell NativeCommandError noise
    & $Py -m pip install -r $tmpReqs *> $pipLog
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n--- pip output (also saved to pip_install.log) ---" -ForegroundColor Yellow
        Get-Content $pipLog | Write-Host -ForegroundColor Red
        Fail "pip failed installing base dependencies. See output above."
    }

    # CPU-only torch (version matched to Python)
    & $Py -m pip install --index-url https://download.pytorch.org/whl/cpu $TorchVer *>> $pipLog
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n--- pip output (also saved to pip_install.log) ---" -ForegroundColor Yellow
        Get-Content $pipLog | Select-Object -Last 40 | Write-Host -ForegroundColor Red
        Fail "pip failed installing $TorchVer. See output above."
    }
    Ok "Installed $TorchVer"

    # ── Sovereign Workspace optional deps ───────────────────────────────────
    Log "Installing Sovereign Workspace deps (lancedb, sentence-transformers)..."
    $sovereignPkgs = @(
        "lancedb>=0.5.0",
        "sentence-transformers>=2.6.0",
        "pyarrow>=14.0.0",
        "watchdog>=4.0.0",
        "pydantic>=2.0.0",
        "pypdf>=3.0.0",
        "pdfplumber>=0.10.0",
        "python-docx>=1.0.0"
    )
    & $Py -m pip install --quiet @sovereignPkgs *>> $pipLog
    if ($LASTEXITCODE -eq 0) {
        Ok "Sovereign Workspace deps installed (semantic search + automation)"
    } else {
        Warn "Sovereign Workspace deps could not be installed - semantic search will run in keyword-only mode."
    }

    New-Item -Path $InstalledFlag -ItemType File -Force | Out-Null
    Ok "Python dependencies installed"
} else {
    Ok "Python dependencies already installed (use -Reinstall to refresh)"
}

# ── 7. Node.js dependencies ──────────────────────────────────────────────────
Log "Installing Node.js dependencies..."
if ($Reinstall -or -not (Test-Path "$ScriptDir\node_modules")) {
    npm install --silent
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed. Check Node.js version and internet connection." }
    Ok "Node.js dependencies installed"
} else {
    Ok "Node.js dependencies already installed"
}

# ── 7b. Build frontend ───────────────────────────────────────────────────────
Log "Building frontend..."
npm run build
if ($LASTEXITCODE -ne 0) { Fail "Frontend build failed." }
Ok "Frontend built"

# ── 8. Write .env.local ──────────────────────────────────────────────────────
Log "Configuring environment..."
$EnvFile = Join-Path $ScriptDir ".env.local"
if (-not (Test-Path $EnvFile)) {
    $secret = & $Py -c "import secrets; print(secrets.token_hex(24))"
    @"
# Auto-generated by install_and_run.ps1 - edit as needed

# Local Ollama inference (no cloud, no API key needed)
ATLANTEAN_LLM_PROVIDER=local
LOCAL_LLM_BACKEND=ollama
LOCAL_LLM_URL=http://127.0.0.1:11434/api/generate
LOCAL_LLM_MODEL=$Model

# Session security
ATLANTEAN_SESSION_SECRET=$secret

# Disable cloud escalation (fully local)
ALLOW_CLOUD_ESCALATION=0
ALLOW_OUTBOUND_NETWORK=0

# Sovereign Workspace - local-first defaults
ATLANTEAN_ALLOW_BROWSER_SPEECH_FALLBACK=0
ATLANTEAN_REQUIRE_LOCAL_STT=1
ATLANTEAN_JOURNAL_DIR=./vault_data/journal
ATLANTEAN_VECTOR_DB_PATH=./vault_data/vector_index

# Hardware tier (options: small_quantized, medium, multi_agent)
ATLANTEAN_HARDWARE_TIER=medium

# Port
PY_BACKEND_PORT=5001
"@ | Set-Content $EnvFile -Encoding UTF8
    Ok ".env.local created"
} else {
    # Update model in existing .env.local
    (Get-Content $EnvFile) -replace "^LOCAL_LLM_MODEL=.*", "LOCAL_LLM_MODEL=$Model" |
        Set-Content $EnvFile -Encoding UTF8
    Ok ".env.local already exists"
}

# ── 9. Start backend ─────────────────────────────────────────────────────────
# Force UTF-8 I/O so Unicode emoji in print() don't crash on cp1252 consoles
$env:PYTHONIOENCODING = 'utf-8'
Log "Starting Atlantean backend..."
$BackendPort = 5001
$BackendLog  = "$ScriptDir\backend.log"

# Kill any stale process still holding port 5001
$stale = Get-NetTCPConnection -LocalPort $BackendPort -ErrorAction SilentlyContinue
if ($stale) {
    $stalePid = ($stale | Select-Object -First 1).OwningProcess
    Stop-Process -Id $stalePid -Force -ErrorAction SilentlyContinue
    Warn "Killed stale process (PID $stalePid) on port $BackendPort"
    Start-Sleep -Seconds 1
}

# Run in background, redirect output to log file so errors are always visible
$backendScript = '"' + "$ScriptDir\atlantean_backend.py" + '"'
$BackendProc = Start-Process -FilePath $Py `
    -ArgumentList $backendScript `
    -WorkingDirectory $ScriptDir `
    -RedirectStandardOutput $BackendLog `
    -RedirectStandardError  "$ScriptDir\backend_err.log" `
    -PassThru -WindowStyle Hidden

Write-Host "  Waiting for backend to be healthy (logs -> $BackendLog)..."
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/health" `
            -UseBasicParsing -TimeoutSec 2 | Out-Null
        $healthy = $true; break
    } catch { }
    if ($BackendProc.HasExited) {
        Write-Host ""
        Write-Host "-- backend.log (last 40 lines) --" -ForegroundColor Yellow
        if (Test-Path $BackendLog) { Get-Content $BackendLog | Select-Object -Last 40 }
        Write-Host "-- backend_err.log --" -ForegroundColor Yellow
        if (Test-Path "$ScriptDir\backend_err.log") { Get-Content "$ScriptDir\backend_err.log" | Select-Object -Last 40 }
        Fail "Backend exited before becoming healthy. See log output above."
    }
}
if (-not $healthy) {
    Write-Host ""
    Write-Host "-- backend.log (last 20 lines) --" -ForegroundColor Yellow
    if (Test-Path $BackendLog) { Get-Content $BackendLog | Select-Object -Last 20 }
    Fail "Backend health-check timed out."
}
Ok "Backend healthy (PID: $($BackendProc.Id))"

# ── Pre-flight: verify critical imports loaded successfully ──────────────────
$importCheck = & $Py -c "import flask, torch, numpy, redis" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $importCheck -ForegroundColor Yellow
    Warn "Some optional imports failed (non-fatal if only voice deps are missing)"
}

# ── 10. Open browser and launch Vite ─────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    READY                            ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Backend  →  http://127.0.0.1:$BackendPort             ║" -ForegroundColor Green
Write-Host "║  Frontend →  http://127.0.0.1:5000  (opening now)   ║" -ForegroundColor Green
Write-Host "║                                                      ║" -ForegroundColor Green
Write-Host "║  Model    →  $Model" -ForegroundColor Green
Write-Host "║  Close this window to stop                          ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Start-Process -FilePath "powershell" -ArgumentList `
    "-Command", "Start-Sleep 3; Start-Process 'http://127.0.0.1:5000'" `
    -WindowStyle Hidden

# Serve built frontend in foreground
npm start

# Cleanup on exit
if (-not $BackendProc.HasExited) {
    $BackendProc.Kill()
    Write-Host "Backend stopped."
}
