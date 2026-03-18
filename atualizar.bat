@echo off
chcp 65001 >nul
echo ==========================================
echo 🚀 SGBR - Sincronizacao com o GitHub
echo ==========================================
echo.

echo [1/3] Preparando arquivos...
git add .

echo.
echo [2/3] Criando o pacote de envio...
git commit -m "Atualizacao automatica: %date% as %time:~0,5%"

echo.
echo [3/3] Enviando para a nuvem...
git push origin main

echo.
echo ==========================================
echo ✅ Tudo certo, chefe! Codigo na nuvem.
echo ==========================================
pause