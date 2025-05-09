@echo off
echo WhatsApp Auto-Responder Launcher
echo ==============================

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Node modules not found. Installing dependencies...
    call npm install
    
    REM Check if npm install was successful
    if %ERRORLEVEL% NEQ 0 (
        echo Error: Failed to install dependencies.
        echo Please make sure npm is installed and try again.
        pause
        exit /b 1
    ) else (
        echo Dependencies installed successfully.
    )
) else (
    echo Dependencies already installed.
)

REM Check if package.json exists (basic check for project integrity)
if not exist "package.json" (
    echo Error: package.json not found!
    echo Please make sure you're in the correct directory.
    pause
    exit /b 1
)

REM Check if index.js exists
if not exist "index.js" (
    echo Error: index.js not found!
    echo Please make sure the main application file exists.
    pause
    exit /b 1
)

echo Starting WhatsApp Auto-Responder...
echo (Press Ctrl+C to stop the application)
echo.

REM Start the Node.js application in the background
start /B cmd /c "node index.js"

REM Wait a few seconds for the server to initialize
echo Waiting for server to start...
timeout /t 5 /nobreak > nul

REM Open the browser to the application URL
echo Opening browser to http://localhost:8000/
start http://localhost:8000/

echo.
echo Application is running in the background.
echo To stop the application, close the Node.js command window.
pause