@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js ainda nao esta instalado neste computador.
  echo Instale a versao LTS em https://nodejs.org/ e abra este arquivo novamente.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo.
  echo Preparando o instalador pela primeira vez. Isso pode levar alguns minutos...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Nao foi possivel preparar o instalador. Confira a internet e tente novamente.
    pause
    exit /b 1
  )
)

echo.
echo Abrindo o assistente de instalacao...
call npm.cmd run installer:wizard
if errorlevel 1 (
  echo.
  echo O assistente foi encerrado com um erro. Leia a mensagem acima.
  pause
)
