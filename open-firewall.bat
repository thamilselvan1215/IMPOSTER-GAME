@echo off
echo ╔══════════════════════════════════════════╗
echo ║  Find the Imposter — Firewall Setup      ║
echo ║  Run this ONCE as Administrator          ║
echo ╚══════════════════════════════════════════╝
echo.
echo Opening ports 3000 and 3001 for LAN access...

netsh advfirewall firewall delete rule name="FindTheImposter-3000" >nul 2>&1
netsh advfirewall firewall delete rule name="FindTheImposter-3001" >nul 2>&1

netsh advfirewall firewall add rule name="FindTheImposter-3000" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
netsh advfirewall firewall add rule name="FindTheImposter-3001" dir=in action=allow protocol=TCP localport=3001 profile=private,domain

echo.
echo ✓ Firewall rules added for ports 3000 and 3001
echo ✓ Player phones can now connect to this computer
echo.
echo Your LAN IP addresses:
ipconfig | findstr /i "IPv4"
echo.
pause
