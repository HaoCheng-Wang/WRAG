@echo off
REM =============================================================================
REM WRAG — One-Click Startup Script (Windows)
REM =============================================================================
REM Expected directory layout:
REM   WRAG\
REM   ├── start.bat          ← you are here
REM   ├── markitdown\        ← git clone https://github.com/microsoft/markitdown.git
REM   ├── SAG\               ← git clone https://github.com/Zleap-AI/SAG.git
REM   └── ...
REM =============================================================================

set SCRIPT_DIR=%~dp0
set VENV_DIR=%SCRIPT_DIR%.venv
set SAG_DIR=%SCRIPT_DIR%SAG
set MARKITDOWN_DIR=%SCRIPT_DIR%markitdown

echo [WRAG] =========================================
echo [WRAG]  WRAG — Multi-Format RAG Knowledge Base
echo [WRAG] =========================================

REM 1. Check prerequisites
where node >nul 2>nul || (echo ERROR: Node.js not found & exit /b 1)
where python >nul 2>nul || (echo ERROR: Python not found & exit /b 1)
where docker >nul 2>nul || (echo ERROR: Docker not found & exit /b 1)

REM 2. Verify sub-projects
if not exist "%MARKITDOWN_DIR%" (
    echo ERROR: markitdown\ directory not found!
    echo   Run: git clone https://github.com/microsoft/markitdown.git
    exit /b 1
)
if not exist "%SAG_DIR%" (
    echo ERROR: SAG\ directory not found!
    echo   Run: git clone https://github.com/Zleap-AI/SAG.git
    exit /b 1
)

REM 3. Python venv
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo [WRAG] Creating Python venv...
    python -m venv "%VENV_DIR%"
)
call "%VENV_DIR%\Scripts\activate.bat"
pip install --quiet -r "%SCRIPT_DIR%requirements.txt"
pip install --quiet -e "%MARKITDOWN_DIR%\packages\markitdown[all]"
echo [WRAG] Python dependencies installed.

REM 4. SAG dependencies
if not exist "%SAG_DIR%\node_modules" (
    echo [WRAG] Installing SAG dependencies...
    cd /d "%SAG_DIR%"
    npm install
    cd /d "%SCRIPT_DIR%"
)

REM 5. PostgreSQL
echo [WRAG] Starting PostgreSQL...
docker compose -f "%SCRIPT_DIR%docker-compose.yml" up -d postgres

REM 6. SAG DB setup
echo [WRAG] Setting up SAG database...
cd /d "%SAG_DIR%"
call npm run db:setup
cd /d "%SCRIPT_DIR%"

REM 7. Markdown storage
if not exist "%SCRIPT_DIR%md_storage" mkdir "%SCRIPT_DIR%md_storage"

REM 8. Copy .env if not exists
if not exist "%SCRIPT_DIR%.env" copy "%SCRIPT_DIR%.env.example" "%SCRIPT_DIR%.env" >nul

echo [WRAG] =========================================
echo [WRAG]  Starting services...
echo [WRAG]  Press Ctrl+C in each window to stop.
echo [WRAG] =========================================
echo.

REM Start WRAG backend in a new window
start "WRAG Backend" cmd /c "cd /d %SCRIPT_DIR% && %VENV_DIR%\Scripts\python backend\main.py"

REM Wait for backend
echo [WRAG] Waiting for backend (10s)...
timeout /t 10 /nobreak >nul

REM Start WRAG frontend in a new window
start "WRAG Frontend" cmd /c "cd /d %SCRIPT_DIR%frontend && npm run dev"

echo [WRAG] =========================================
echo [WRAG]  All services started!
echo [WRAG]  Open: http://localhost:5174
echo [WRAG] =========================================
pause
