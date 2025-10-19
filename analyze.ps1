# Attendre que SonarQube soit prêt
Write-Host "⏳ Attente du démarrage de SonarQube..." -ForegroundColor Yellow

do {
    Start-Sleep -Seconds 10
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9000" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ SonarQube est prêt!" -ForegroundColor Green
            break
        }
    }
    catch {
        Write-Host "⏳ SonarQube n'est pas encore prêt, nouvel essai dans 10s..." -ForegroundColor Yellow
    }
} while ($true)

# Lancer l'analyse
Write-Host "🚀 Démarrage de l'analyse SonarQube..." -ForegroundColor Cyan

npx sonar-scanner