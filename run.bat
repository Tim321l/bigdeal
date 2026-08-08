@echo off
setlocal
cd /d "%~dp0"

if "%1"=="play" goto play
if "%1"=="server" goto server
if "%1"=="client" goto client
if "%1"=="test" goto test
if "%1"=="typecheck" goto typecheck
if "%1"=="build" goto build
if "%1"=="" goto menu
goto menu

:menu
echo.
echo  bigdeal
echo  ---------------------------------
echo   1. Play (start server + web client)
echo   2. Start server only (:3001)
echo   3. Start web client only (:5173)
echo   4. Run tests
echo   5. Typecheck
echo   6. Build
echo   7. Quit
echo.
set /p choice="Choose 1-7: "
if "%choice%"=="1" goto play
if "%choice%"=="2" goto server
if "%choice%"=="3" goto client
if "%choice%"=="4" goto test
if "%choice%"=="5" goto typecheck
if "%choice%"=="6" goto build
if "%choice%"=="7" goto end
echo Invalid choice.
goto menu

:play
start "bigdeal - server" cmd /k npm run dev:server
start "bigdeal - client" cmd /k npm run dev:client
echo.
echo Server and client are starting in separate windows.
echo Open http://localhost:5173 in your browser to play.
goto end

:server
call npm run dev:server
goto end

:client
call npm run dev:client
goto end

:test
call npm test
goto end

:typecheck
call npm run typecheck:all
goto end

:build
call npm run build && call npm run build:client
goto end

:end
endlocal
