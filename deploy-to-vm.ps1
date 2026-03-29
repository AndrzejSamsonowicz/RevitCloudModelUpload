# Automated VM Deployment Script
# Usage: .\deploy-to-vm.ps1 "Your commit message"

param(
    [string]$CommitMessage = "Update deployment"
)

$VM_USER = "samson090281"
$VM_IP = "34.65.169.15"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_ed25519"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Automated VM Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if there are changes to commit
Write-Host "Checking for changes..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "Changes detected, committing..." -ForegroundColor Green
    git add .
    git commit -m "$CommitMessage"
} else {
    Write-Host "No changes to commit" -ForegroundColor Gray
}

# Push to GitHub
Write-Host "`nPushing to GitHub..." -ForegroundColor Cyan
git push origin master
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push to GitHub!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Pushed to GitHub" -ForegroundColor Green

# Deploy to VM instructions
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Next: Deploy to VM" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Code pushed to GitHub successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To deploy to VM, use Google Cloud Console:" -ForegroundColor Yellow
Write-Host "1. Go to: https://console.cloud.google.com" -ForegroundColor Gray
Write-Host "2. Navigate to: Compute Engine → VM instances" -ForegroundColor Gray
Write-Host "3. Click SSH button next to your VM" -ForegroundColor Gray
Write-Host "4. Run this command:" -ForegroundColor Gray
Write-Host ""
Write-Host "cd ~/revit-publisher && git pull origin master && pm2 restart revit-publisher && pm2 logs --lines 30" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✓ Push Complete - Ready to Deploy" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
